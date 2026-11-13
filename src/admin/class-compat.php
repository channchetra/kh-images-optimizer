<?php
/**
 * Compatibility layer for the KH plugin suite (Offloader, Speed Engine).
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'KH_Images_Compat' ) ) {
	class KH_Images_Compat {
		public function __construct() {
			add_action( 'rest_api_init', [ $this, 'register_rest_routes' ] );
		}

		/**
		 * Whether KH Offloader is active.
		 */
		public static function is_offloader_active(): bool {
			return defined( 'KHS3DATA_VERSION' ) || class_exists( 'KH_Offloader\\Offloader' );
		}

		/**
		 * Whether KH Speed Engine is active.
		 */
		public static function is_speed_active(): bool {
			return defined( 'KHSE_PLUGIN_VERSION' ) || function_exists( 'khse_clear_all_cache' );
		}

		/**
		 * Compatibility status for the dashboard.
		 */
		public static function get_status(): array {
			return [
				'offloader' => [
					'active'       => self::is_offloader_active(),
					'version'      => defined( 'KHS3DATA_VERSION' ) ? KHS3DATA_VERSION : '',
					'mediaUrl'     => admin_url( 'admin.php?page=kh-offloader-media' ),
					'canReoffload' => function_exists( 'khs3data_get_cloud_provider_key' ),
				],
				'speed'     => [
					'active'         => self::is_speed_active(),
					'version'        => defined( 'KHSE_PLUGIN_VERSION' ) ? KHSE_PLUGIN_VERSION : '',
					'dashboardUrl'   => admin_url( 'admin.php?page=kh-speed-engine-dashboard' ),
					'canClearCache'  => function_exists( 'khse_clear_all_cache' ),
				],
			];
		}

		/**
		 * Cloud offload status for a single attachment.
		 *
		 * @param int $attachment_id Attachment ID.
		 * @return array
		 */
		public static function get_attachment_status( int $attachment_id ): array {
			$file_path      = get_attached_file( $attachment_id );
			$has_local_file = is_string( $file_path ) && '' !== $file_path && file_exists( $file_path );
			$metadata       = wp_get_attachment_metadata( $attachment_id );
			$uploads        = wp_get_upload_dir();
			$local_url       = '';
			$local_thumb_url = '';

			// Offloader rewrites source URLs to the cloud domain, so expose the
			// local uploads URL whenever a local copy is available.
			if (
				$has_local_file &&
				is_array( $metadata ) &&
				! empty( $metadata['file'] ) &&
				! empty( $uploads['baseurl'] )
			) {
				$base_url   = trailingslashit( $uploads['baseurl'] );
				$local_url  = $base_url . ltrim( $metadata['file'], '/' );
				$thumb_file = $metadata['sizes']['thumbnail']['file'] ?? '';

				$local_thumb_url = $thumb_file
					? $base_url . trailingslashit( dirname( $metadata['file'] ) ) . $thumb_file
					: $local_url;
			}

			if ( ! self::is_offloader_active() ) {
				return [
					'active'          => false,
					'offloaded'       => false,
					'local_copy'      => $has_local_file,
					'cloud_only'      => false,
					'cloud_path'      => '',
					'local_url'       => $local_url,
					'local_thumb_url' => $local_thumb_url,
				];
			}

			$offloaded  = '' !== (string) get_post_meta( $attachment_id, 'khs3data_offloaded', true );
			$cloud_path = (string) get_post_meta( $attachment_id, 'khs3data_path', true );

			return [
				'active'          => true,
				'offloaded'       => $offloaded,
				'local_copy'      => $has_local_file,
				'cloud_only'      => $offloaded && ! $has_local_file,
				'cloud_path'      => $cloud_path,
				'local_url'       => $local_url,
				'local_thumb_url' => $local_thumb_url,
			];
		}

		/**
		 * Re-upload an offloaded attachment after a local change.
		 *
		 * @param int $attachment_id Attachment ID.
		 * @return string not_offloaded|skipped|unavailable|synced|failed
		 */
		public static function reoffload_attachment( int $attachment_id ): string {
			$status = self::get_attachment_status( $attachment_id );

			if ( empty( $status['offloaded'] ) ) {
				return 'not_offloaded';
			}

			if ( ! apply_filters( 'khimg/bulk/reoffload_offloaded_attachment', true, $attachment_id ) ) {
				return 'skipped';
			}

			if (
				! function_exists( 'khs3data_get_cloud_provider_key' ) ||
				! class_exists( 'KH_Offloader\\Factories\\CloudProviderFactory' ) ||
				! class_exists( 'KH_Offloader\\Services\\CloudAttachmentUploader' )
			) {
				return 'unavailable';
			}

			$provider_key = (string) khs3data_get_cloud_provider_key();
			if ( '' === $provider_key ) {
				return 'unavailable';
			}

			try {
				$provider = \KH_Offloader\Factories\CloudProviderFactory::create( $provider_key );
				$uploader = new \KH_Offloader\Services\CloudAttachmentUploader( $provider );

				return $uploader->reoffloadAttachment( $attachment_id ) ? 'synced' : 'failed';
			} catch ( \Throwable $error ) {
				error_log(
					sprintf(
						'KH Images: could not reoffload attachment %1$d: %2$s',
						$attachment_id,
						$error->getMessage()
					)
				);

				return 'failed';
			}
		}

		/**
		 * Clear the KH Speed Engine cache.
		 *
		 * @return true|WP_Error
		 */
		public static function clear_speed_cache() {
			if ( ! function_exists( 'khse_clear_all_cache' ) ) {
				return new WP_Error(
					'khimg_speed_unavailable',
					__( 'KH Speed Engine is not available.', 'kh-images-optimizer' ),
					[ 'status' => 409 ]
				);
			}

			khse_clear_all_cache();

			return true;
		}

		/**
		 * Register compatibility REST routes.
		 */
		public function register_rest_routes() {
			register_rest_route(
				'khimg/v1',
				'/compat/clear-cache',
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'rest_clear_cache' ],
					'permission_callback' => function() {
						return current_user_can( 'manage_options' );
					},
				]
			);

			register_rest_route(
				'khimg/v1',
				'/compat/reoffload/(?P<id>\d+)',
				[
					'methods'             => 'POST',
					'callback'            => [ $this, 'rest_reoffload' ],
					'permission_callback' => function( $request ) {
						return current_user_can( 'edit_post', (int) $request['id'] );
					},
				]
			);
		}

		/**
		 * REST callback: clear the KH Speed Engine cache.
		 *
		 * @return WP_REST_Response|WP_Error
		 */
		public function rest_clear_cache() {
			$result = self::clear_speed_cache();

			if ( is_wp_error( $result ) ) {
				return $result;
			}

			return rest_ensure_response( [ 'success' => true ] );
		}

		/**
		 * REST callback: reoffload a single attachment.
		 *
		 * @param WP_REST_Request $request Request object.
		 * @return WP_REST_Response|WP_Error
		 */
		public function rest_reoffload( $request ) {
			$attachment_id = (int) $request['id'];

			if ( 'attachment' !== get_post_type( $attachment_id ) ) {
				return new WP_Error(
					'invalid_attachment',
					__( 'Invalid attachment ID.', 'kh-images-optimizer' ),
					[ 'status' => 404 ]
				);
			}

			$status = self::reoffload_attachment( $attachment_id );

			return rest_ensure_response(
				[
					'success'    => true,
					'cloud_sync' => $status,
				]
			);
		}
	}

	new KH_Images_Compat();
}
