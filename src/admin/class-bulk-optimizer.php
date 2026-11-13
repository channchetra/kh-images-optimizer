<?php
/**
 * Bulk Optimizer - REST endpoints for optimizing existing media library images.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'KH_Images_Bulk_Optimizer' ) ) {
	class KH_Images_Bulk_Optimizer {

		public function __construct() {
			add_action( 'rest_api_init', [ $this, 'register_rest_routes' ] );
		}

		/**
		 * Register REST API routes for bulk optimization.
		 */
		public function register_rest_routes() {
			// Optimize a single attachment - accepts an optimized file + metadata.
			register_rest_route( 'khimg/v1', '/bulk-optimize/(?P<id>\d+)', [
				'methods'             => 'POST',
				'callback'            => [ $this, 'handle_bulk_optimize' ],
				'permission_callback' => function() {
					return current_user_can( 'upload_files' ) && current_user_can( 'edit_posts' );
				},
			] );

			// Restore a single attachment from its backup.
			register_rest_route( 'khimg/v1', '/bulk-restore/(?P<id>\d+)', [
				'methods'             => 'POST',
				'callback'            => [ $this, 'handle_bulk_restore' ],
				'permission_callback' => function() {
					return current_user_can( 'upload_files' ) && current_user_can( 'edit_posts' );
				},
			] );

			// Get optimization status for a list of attachment IDs.
			register_rest_route( 'khimg/v1', '/bulk-status', [
				'methods'             => 'POST',
				'callback'            => [ $this, 'handle_bulk_status' ],
				'permission_callback' => function() {
					return current_user_can( 'upload_files' ) && current_user_can( 'edit_posts' );
				},
				'args'                => [
					'ids' => [
						'type'     => 'array',
						'required' => true,
						'items'    => [ 'type' => 'integer' ],
					],
				],
			] );
		}

		/**
		 * Handle bulk optimize: receive optimized file, replace original, update metadata.
		 *
		 * @param WP_REST_Request $request Request object.
		 * @return WP_REST_Response|WP_Error
		 */
		public function handle_bulk_optimize( $request ) {
			$attachment_id = (int) $request->get_param( 'id' );

			if ( ! $attachment_id || 'attachment' !== get_post_type( $attachment_id ) ) {
				return new WP_Error( 'invalid_attachment', __( 'Invalid attachment ID.', 'kh-images-optimizer' ), [ 'status' => 404 ] );
			}

			if ( ! current_user_can( 'edit_post', $attachment_id ) ) {
				return new WP_Error( 'forbidden', __( 'You are not allowed to edit this attachment.', 'kh-images-optimizer' ), [ 'status' => 403 ] );
			}

			// Cloud-only media has no local original to optimize. This must win
			// over the file_missing check below.
			if ( class_exists( 'KH_Images_Compat' ) ) {
				$compat_status = KH_Images_Compat::get_attachment_status( $attachment_id );
				if ( ! empty( $compat_status['cloud_only'] ) ) {
					return new WP_Error(
						'cloud_only',
						__( 'This image is offloaded to cloud storage with no local copy. Download it locally in KH Offloader before optimizing.', 'kh-images-optimizer' ),
						[ 'status' => 409 ]
					);
				}
			}

			// Get the uploaded file.
			$files = $request->get_file_params();
			if ( empty( $files['file'] ) ) {
				return new WP_Error( 'no_file', __( 'No file uploaded.', 'kh-images-optimizer' ), [ 'status' => 400 ] );
			}

			$uploaded_file = $files['file'];
			$metadata_json = $request->get_param( 'metadata' );
			$size_key      = sanitize_text_field( $request->get_param( 'size_key' ) ?: 'full' );

			// Parse metadata.
			$optimization_meta = [];
			if ( $metadata_json ) {
				$optimization_meta = json_decode( $metadata_json, true );
				if ( ! is_array( $optimization_meta ) ) {
					$optimization_meta = [];
				}
				if ( class_exists( 'KH_Images_Metadata' ) ) {
					$optimization_meta = KH_Images_Metadata::sanitize_entry( $optimization_meta );
				}
			}

			// Get current attachment metadata.
			$current_meta = wp_get_attachment_metadata( $attachment_id, true );
			if ( ! is_array( $current_meta ) ) {
				$current_meta = [];
			}

			// A thumbnail size must exist in the attachment metadata. Without
			// this check an unknown key would fall through to a full-size
			// replacement that has no backup.
			if ( 'full' !== $size_key && empty( $current_meta['sizes'][ $size_key ]['file'] ) ) {
				return new WP_Error( 'invalid_size', __( 'The requested thumbnail size does not exist.', 'kh-images-optimizer' ), [ 'status' => 400 ] );
			}

			// Keep the upload-time record when adding bulk data.
			$existing_khimg = isset( $current_meta['khimg'] ) ? $current_meta['khimg'] : ( isset( $current_meta['cimo'] ) ? $current_meta['cimo'] : [] );
			if ( ! is_array( $existing_khimg ) ) {
				$existing_khimg = [];
			}

			$file_path = get_attached_file( $attachment_id );
			if ( ! $file_path || ! file_exists( $file_path ) ) {
				return new WP_Error( 'file_missing', __( 'Original file not found.', 'kh-images-optimizer' ), [ 'status' => 404 ] );
			}

			// Bulk optimization keeps the attachment path stable. Reject a
			// replacement whose extension would no longer match the file.
			$uploaded_ext = strtolower( pathinfo( isset( $uploaded_file['name'] ) ? $uploaded_file['name'] : '', PATHINFO_EXTENSION ) );
			$original_ext = strtolower( pathinfo( $file_path, PATHINFO_EXTENSION ) );
			$ext_aliases  = [ 'jpeg' => 'jpg' ];
			$uploaded_ext = isset( $ext_aliases[ $uploaded_ext ] ) ? $ext_aliases[ $uploaded_ext ] : $uploaded_ext;
			$original_ext = isset( $ext_aliases[ $original_ext ] ) ? $ext_aliases[ $original_ext ] : $original_ext;

			if ( $uploaded_ext && $original_ext && $uploaded_ext !== $original_ext ) {
				return new WP_Error(
					'format_mismatch',
					__( 'The optimized file must keep the original file format for bulk optimization.', 'kh-images-optimizer' ),
					[ 'status' => 400 ]
				);
			}

			// Reject content that is not a real image before anything is
			// replaced or backed up.
			$image_info = @getimagesize( $uploaded_file['tmp_name'] );
			if ( ! $image_info || empty( $image_info['mime'] ) ) {
				return new WP_Error( 'invalid_image', __( 'The uploaded file is not a valid image.', 'kh-images-optimizer' ), [ 'status' => 400 ] );
			}

			// Count any pending optimized attachments before this request
			// writes metadata, so the lazy scan does not count this attachment
			// again and the stats option exists for the manual increment.
			KH_Images_Stats::get_stats();

			// Backup the original file if this is the main image (not a thumbnail).
			if ( 'full' === $size_key ) {
				$backup_path = $file_path . '.khimg-backup';
				if ( ! file_exists( $backup_path ) && ! copy( $file_path, $backup_path ) ) {
					return new WP_Error( 'backup_failed', __( 'Could not back up the original file.', 'kh-images-optimizer' ), [ 'status' => 500 ] );
				}

				$relative_backup = _wp_relative_upload_path( $backup_path );
				update_post_meta( $attachment_id, '_khimg_backup_file', $relative_backup ? $relative_backup : $backup_path );
			}

			// Store original filesize for stats.
			$original_filesize = (int) filesize( $file_path );

			// If optimizing a specific thumbnail size, replace that file.
			if ( 'full' !== $size_key && ! empty( $current_meta['sizes'][ $size_key ]['file'] ) ) {
				$thumb_file = path_join( dirname( $file_path ), $current_meta['sizes'][ $size_key ]['file'] );
				if ( file_exists( $thumb_file ) ) {
					$original_filesize = (int) filesize( $thumb_file );
					// Replace the thumbnail in place so its URL stays valid.
					if ( ! $this->replace_file( $uploaded_file['tmp_name'], $thumb_file ) ) {
						return new WP_Error( 'replace_failed', __( 'Could not move the optimized thumbnail into place.', 'kh-images-optimizer' ), [ 'status' => 500 ] );
					}
					$new_filesize = (int) filesize( $thumb_file );
				} else {
					$new_filesize = 0;
				}
			} else {
				// Keep the original path so existing attachment URLs stay valid.
				// The client sends a replacement in the same format, checked above.
				if ( ! $this->replace_file( $uploaded_file['tmp_name'], $file_path ) ) {
					return new WP_Error( 'replace_failed', __( 'Could not move the optimized file into place.', 'kh-images-optimizer' ), [ 'status' => 500 ] );
				}

				// Remove old thumbnails since the file changed.
				if ( ! empty( $current_meta['sizes'] ) ) {
					foreach ( $current_meta['sizes'] as $size_data ) {
						if ( ! empty( $size_data['file'] ) ) {
							$thumb_path = path_join( dirname( $file_path ), $size_data['file'] );
							if ( file_exists( $thumb_path ) ) {
								@unlink( $thumb_path );
							}
						}
					}
				}

				$new_filesize = (int) filesize( $file_path );

				// Regenerate attachment metadata (new thumbnails, dimensions, etc.).
				// Disable scaling so WordPress cannot resize or repoint the
				// attachment during regeneration.
				$current_meta = $this->generate_attachment_metadata_without_scaling( $attachment_id, $file_path );
			}

			// Add optimization metadata.
			$khimg_data = $existing_khimg;
			if ( ! isset( $khimg_data['bulk_optimization'] ) || ! is_array( $khimg_data['bulk_optimization'] ) ) {
				$khimg_data['bulk_optimization'] = [];
			}

			$khimg_data['bulk_optimization'][ $size_key ] = array_merge( $optimization_meta, [
				'originalFilesize'  => $original_filesize,
				'convertedFilesize' => $new_filesize ?: $original_filesize,
				'bulk_optimized_at' => current_time( 'mysql' ),
			] );

			// Preserve general full-image optimization info. Thumbnail-only
			// calls must not overwrite the top-level full-image record.
			if ( 'full' === $size_key ) {
				if ( ! isset( $khimg_data['originalFilesize'] ) ) {
					$khimg_data['originalFilesize'] = $original_filesize;
				}
				if ( ! isset( $khimg_data['convertedFilesize'] ) ) {
					$khimg_data['convertedFilesize'] = $new_filesize ?: $original_filesize;
				}
				if ( ! isset( $khimg_data['compressionSavings'] ) && $original_filesize > 0 ) {
					$khimg_data['compressionSavings'] = ( $new_filesize ?: $original_filesize ) / $original_filesize;
				}
			}

			$current_meta['khimg'] = $khimg_data;

			// Save metadata.
			wp_update_attachment_metadata( $attachment_id, $current_meta );

			// Push the optimized files back to cloud storage when the
			// attachment is offloaded. A sync failure must not fail the
			// local optimization.
			$cloud_sync = class_exists( 'KH_Images_Compat' )
				? KH_Images_Compat::reoffload_attachment( $attachment_id )
				: 'not_offloaded';

			// Update global stats. Only a full-size replacement counts as one
			// optimized media item; per-size totals are still recorded.
			KH_Images_Stats::update_stats_bulk_optimized(
				$attachment_id,
				$original_filesize,
				$new_filesize ?: $original_filesize,
				'full' === $size_key
			);

			return rest_ensure_response( [
				'success'          => true,
				'attachment_id'    => $attachment_id,
				'original_size'    => $original_filesize,
				'optimized_size'   => $new_filesize ?: $original_filesize,
				'compression_savings' => $original_filesize > 0
					? round( ( 1 - ( ( $new_filesize ?: $original_filesize ) / $original_filesize ) ) * 100, 2 )
					: 0,
				'cloud_sync'       => $cloud_sync,
			] );
		}

		/**
		 * Handle bulk restore: restore original file from backup.
		 *
		 * @param WP_REST_Request $request Request object.
		 * @return WP_REST_Response|WP_Error
		 */
		public function handle_bulk_restore( $request ) {
			$attachment_id = (int) $request->get_param( 'id' );

			if ( ! $attachment_id || 'attachment' !== get_post_type( $attachment_id ) ) {
				return new WP_Error( 'invalid_attachment', __( 'Invalid attachment ID.', 'kh-images-optimizer' ), [ 'status' => 404 ] );
			}

			if ( ! current_user_can( 'edit_post', $attachment_id ) ) {
				return new WP_Error( 'forbidden', __( 'You are not allowed to edit this attachment.', 'kh-images-optimizer' ), [ 'status' => 403 ] );
			}

			// Backfill the stats option before mutating anything. With a missing
			// option the decrement below would start from zero and advance
			// last_processed_post_id, permanently skipping the metadata backfill.
			KH_Images_Stats::get_stats();

			$file_path = get_attached_file( $attachment_id );
			if ( ! $file_path ) {
				return new WP_Error( 'file_missing', __( 'File not found.', 'kh-images-optimizer' ), [ 'status' => 404 ] );
			}

			$current_meta = wp_get_attachment_metadata( $attachment_id, true );
			if ( ! is_array( $current_meta ) ) {
				$current_meta = [];
			}

			// Keep an upload-time optimization record, but drop bulk-only data.
			$existing_khimg = isset( $current_meta['khimg'] ) ? $current_meta['khimg'] : ( isset( $current_meta['cimo'] ) ? $current_meta['cimo'] : [] );
			if ( ! is_array( $existing_khimg ) ) {
				$existing_khimg = [];
			}
			$had_upload_record = isset( $existing_khimg['originalFormat'] );
			unset( $existing_khimg['bulk_optimization'] );
			if ( ! $had_upload_record ) {
				$existing_khimg = [];
			}

			$from_meta   = false;
			$backup_path = $this->get_backup_path( $attachment_id, $file_path, $from_meta );
			if ( ! $backup_path || ! file_exists( $backup_path ) ) {
				return new WP_Error( 'no_backup', __( 'No backup file found. This attachment may not have been bulk optimized, or the backup was removed.', 'kh-images-optimizer' ), [ 'status' => 404 ] );
			}

			// Get sizes for stats before restore.
			$optimized_size = file_exists( $file_path ) ? (int) filesize( $file_path ) : 0;
			$backup_size    = (int) filesize( $backup_path );

			$restored_path = preg_replace( '/\.khimg-backup$/', '', $backup_path );
			if ( ! $restored_path || $restored_path === $backup_path ) {
				$restored_path = $file_path;
			}

			// A backup recorded in post meta is the stored original, so restore
			// it over the derived original path. Only legacy backups that would
			// collide with an unrelated file need a unique name.
			if ( ! $from_meta && file_exists( $restored_path ) && $restored_path !== $file_path ) {
				$restored_filename = wp_unique_filename( dirname( $restored_path ), wp_basename( $restored_path ) );
				$restored_path     = path_join( dirname( $restored_path ), $restored_filename );
			}

			if ( ! $this->replace_file( $backup_path, $restored_path ) ) {
				return new WP_Error( 'restore_failed', __( 'Could not restore the backup file.', 'kh-images-optimizer' ), [ 'status' => 500 ] );
			}

			if ( $file_path !== $restored_path && file_exists( $file_path ) ) {
				@unlink( $file_path );
			}

			update_attached_file( $attachment_id, $restored_path );
			delete_post_meta( $attachment_id, '_khimg_backup_file' );

			// Remove the optimized thumbnails before regenerating from the
			// restored file, so differently sized thumbnails are not orphaned.
			if ( ! empty( $current_meta['sizes'] ) ) {
				foreach ( $current_meta['sizes'] as $size_data ) {
					if ( ! empty( $size_data['file'] ) ) {
						$thumb_path = path_join( dirname( $file_path ), $size_data['file'] );
						if ( file_exists( $thumb_path ) ) {
							@unlink( $thumb_path );
						}
					}
				}
			}

			// Regenerate metadata without letting WordPress rescale or repoint
			// the attachment.
			$metadata = $this->generate_attachment_metadata_without_scaling( $attachment_id, $restored_path );

			if ( ! empty( $existing_khimg ) ) {
				$metadata['khimg'] = $existing_khimg;
			}

			// Do not let preserve_khimg_metadata() copy the old bulk record back.
			$update_metadata = function() use ( $attachment_id, $metadata ) {
				wp_update_attachment_metadata( $attachment_id, $metadata );
			};
			if ( class_exists( 'KH_Images_Metadata' ) ) {
				KH_Images_Metadata::without_preservation( $update_metadata );
			} else {
				$update_metadata();
			}

			// Push the restored files back to cloud storage when the
			// attachment is offloaded. A sync failure must not fail the
			// local restore.
			$cloud_sync = class_exists( 'KH_Images_Compat' )
				? KH_Images_Compat::reoffload_attachment( $attachment_id )
				: 'not_offloaded';

			// Update stats.
			KH_Images_Stats::update_stats_bulk_restored(
				$attachment_id,
				$optimized_size,
				$backup_size
			);

			return rest_ensure_response( [
				'success'       => true,
				'attachment_id' => $attachment_id,
				'cloud_sync'    => $cloud_sync,
			] );
		}

		/**
		 * Regenerate attachment metadata without WordPress big-image scaling.
		 *
		 * @param int    $attachment_id Attachment ID.
		 * @param string $file_path     File to generate metadata for.
		 * @return array Metadata, or an empty array on failure.
		 */
		private function generate_attachment_metadata_without_scaling( $attachment_id, $file_path ) {
			if ( ! function_exists( 'wp_generate_attachment_metadata' ) ) {
				require_once ABSPATH . 'wp-admin/includes/image.php';
			}

			add_filter( 'big_image_size_threshold', '__return_false' );
			$metadata = wp_generate_attachment_metadata( $attachment_id, $file_path );
			remove_filter( 'big_image_size_threshold', '__return_false' );

			return is_array( $metadata ) ? $metadata : [];
		}

		/**
		 * Find the backup for an attachment within the uploads directory.
		 *
		 * @param int       $attachment_id Attachment ID.
		 * @param string    $file_path     Current attached file path.
		 * @param bool|null $from_meta     Set true when the path came from _khimg_backup_file.
		 * @return string Backup path, or an empty string.
		 */
		private function get_backup_path( $attachment_id, $file_path, &$from_meta = null ) {
			$from_meta = false;
			$stored    = get_post_meta( $attachment_id, '_khimg_backup_file', true );

			$uploads     = wp_get_upload_dir();
			$uploads_dir = isset( $uploads['basedir'] ) ? realpath( $uploads['basedir'] ) : false;
			if ( ! $uploads_dir ) {
				return '';
			}

			$candidates = [];

			if ( is_string( $stored ) && '' !== $stored ) {
				$candidates[] = [
					'path'      => path_is_absolute( $stored ) ? $stored : path_join( $uploads['basedir'], $stored ),
					'from_meta' => true,
				];
			}

			// Legacy backups were stored next to the current attached file.
			$candidates[] = [
				'path'      => $file_path . '.khimg-backup',
				'from_meta' => false,
			];

			// Legacy path-changing optimizations bumped the filename
			// (image.jpg -> image-1.jpg), while the backup kept the original
			// name. Try <base>.<ext>.khimg-backup as well, but only while the
			// un-suffixed base file is gone: if it still exists, another
			// attachment owns it and may own that backup too, so consuming it
			// here would delete an unrelated attachment's original.
			if ( preg_match( '/^(.+)-\d+(\.[^.\/\\\\]+)$/', basename( $file_path ), $matches ) ) {
				$base_path = path_join( dirname( $file_path ), $matches[1] . $matches[2] );

				if ( ! file_exists( $base_path ) ) {
					$candidates[] = [
						'path'      => $base_path . '.khimg-backup',
						'from_meta' => false,
					];
				}
			}

			$suffix         = '.khimg-backup';
			$uploads_prefix = rtrim( $uploads_dir, '/\\' ) . DIRECTORY_SEPARATOR;

			foreach ( $candidates as $candidate ) {
				$resolved = realpath( $candidate['path'] );
				if ( ! $resolved || ! is_file( $resolved ) ) {
					continue;
				}

				if ( $suffix !== substr( $resolved, -strlen( $suffix ) ) ) {
					continue;
				}

				// Reject anything outside the uploads directory.
				if ( 0 !== strpos( $resolved, $uploads_prefix ) ) {
					continue;
				}

				$from_meta = $candidate['from_meta'];
				return $resolved;
			}

			return '';
		}

		/**
		 * Copy a source file over a target without deleting the target first.
		 *
		 * @param string $source Source path.
		 * @param string $target Target path.
		 * @return bool True on success.
		 */
		private function replace_file( $source, $target ) {
			if ( $source === $target ) {
				return true;
			}

			$tmp = $target . '.khimg-restore-tmp';
			if ( ! @copy( $source, $tmp ) ) {
				return false;
			}

			if ( file_exists( $target ) ) {
				if ( ! @copy( $tmp, $target ) ) {
					@copy( $source, $target ); // Best effort restore.
					@unlink( $tmp );
					return false;
				}
			} elseif ( ! @rename( $tmp, $target ) ) {
				@unlink( $tmp );
				return false;
			}

			clearstatcache( true, $target );
			$source_size = @filesize( $source );
			$target_size = @filesize( $target );

			if ( false === $source_size || false === $target_size || $source_size !== $target_size ) {
				@unlink( $tmp );
				return false;
			}

			@unlink( $tmp );
			@unlink( $source );
			return true;
		}

		/**
		 * Get optimization status for a batch of attachment IDs.
		 *
		 * @param WP_REST_Request $request Request object.
		 * @return WP_REST_Response
		 */
		public function handle_bulk_status( $request ) {
			$ids = $request->get_param( 'ids' );
			if ( ! is_array( $ids ) ) {
				return new WP_Error( 'invalid_ids', __( 'Invalid IDs.', 'kh-images-optimizer' ), [ 'status' => 400 ] );
			}

			$statuses = [];
			foreach ( $ids as $id ) {
				$id               = (int) $id;
				$metadata         = wp_get_attachment_metadata( $id );
				$file_path        = get_attached_file( $id );
				$has_backup       = $file_path ? (bool) $this->get_backup_path( $id, $file_path ) : false;
				$is_optimized     = isset( $metadata['khimg']['bulk_optimization'] ) && is_array( $metadata['khimg']['bulk_optimization'] );
				$current_size     = $file_path && file_exists( $file_path ) ? (int) filesize( $file_path ) : 0;
				$original_size    = $is_optimized && isset( $metadata['khimg']['originalFilesize'] )
					? (int) $metadata['khimg']['originalFilesize']
					: $current_size;
				$optimized_size   = $is_optimized && isset( $metadata['khimg']['convertedFilesize'] )
					? (int) $metadata['khimg']['convertedFilesize']
					: $current_size;

				$statuses[ $id ] = [
					'is_optimized'       => $is_optimized,
					'has_backup'         => $has_backup,
					'original_size'      => $original_size,
					'optimized_size'     => $optimized_size,
					'compression_savings' => $original_size > 0
						? round( ( 1 - ( $optimized_size / $original_size ) ) * 100, 2 )
						: 0,
					'bulk_optimization'  => $is_optimized ? $metadata['khimg']['bulk_optimization'] : null,
				];
			}

			return rest_ensure_response( [
				'success'  => true,
				'statuses' => $statuses,
			] );
		}
	}

	new KH_Images_Bulk_Optimizer();
}
