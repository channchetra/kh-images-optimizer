<?php
/**
 * Statistics class for gathering KH Images media optimization data
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'KH_Images_Stats' ) ) {
	class KH_Images_Stats {
		const OPTION_KEY = 'khimg_stats_data';
		const KHIMG_META_STRING = 's:5:"khimg";';

		public static function get_stats() {
			$existing = get_option( self::OPTION_KEY );

			if ( ! is_array( $existing ) ) {
				$existing = self::default_stats();
			}

			$updated = self::compute_stats( $existing );
			if ( $updated !== $existing ) {
				update_option( self::OPTION_KEY, $updated, false );
			}
			return $updated;
		}

		private static function default_stats() {
			return [
				'last_processed_post_id' => 0,
				'media_optimized_num' => 0,
				'total_original_size' => 0,
				'total_optimized_size' => 0,
			];
		}

		private static function compute_stats( $existing_stats = null ) {
			global $wpdb;

			$from_scratch = ! is_array( $existing_stats ) || empty( $existing_stats['last_processed_post_id'] );
			$last_processed_post_id = $from_scratch ? 0 : $existing_stats['last_processed_post_id'];

			$new_results = $wpdb->get_results( $wpdb->prepare( "
				SELECT 
					post_id,
					meta_value
				FROM {$wpdb->postmeta}
				WHERE meta_key = '_wp_attachment_metadata'
				AND ( meta_value LIKE %s OR meta_value LIKE %s )
				AND post_id > %d
				ORDER BY post_id DESC
			", '%' . self::KHIMG_META_STRING . '%', '%s:4:"cimo";%', $last_processed_post_id ) );

			$updated_stats = $from_scratch ? [
				'last_processed_post_id' => 0,
				'media_optimized_num' => 0,
				'total_original_size' => 0,
				'total_optimized_size' => 0,
			] : $existing_stats;

			$highest_post_id = $from_scratch ? 0 : (int) $existing_stats['last_processed_post_id'];

			if ( ! empty( $new_results ) ) {
				foreach ( $new_results as $result ) {
					$metadata = maybe_unserialize( $result->meta_value );
					
					if ( ! isset( $metadata['khimg'] ) && ! isset( $metadata['cimo'] ) ) {
						continue;
					}

					$khimg_data = isset( $metadata['khimg'] ) ? $metadata['khimg'] : $metadata['cimo'];

					$bulk_optimization = isset( $khimg_data['bulk_optimization'] ) && is_array( $khimg_data['bulk_optimization'] )
						? $khimg_data['bulk_optimization']
						: [];

					if ( ! empty( $bulk_optimization ) ) {
						// The top-level filesizes duplicate the full-size bulk
						// entry, so only sum the per-size entries.
						foreach ( $bulk_optimization as $data ) {
							if ( ! is_array( $data ) ) {
								continue;
							}

							$original_size_b  = isset( $data['originalFilesize'] ) ? (int) $data['originalFilesize'] : 0;
							$converted_size_b = isset( $data['convertedFilesize'] ) ? (int) $data['convertedFilesize'] : 0;
							$updated_stats['total_original_size'] += $original_size_b / 1024;
							$updated_stats['total_optimized_size'] += $converted_size_b / 1024;
						}
					} else {
						$original_size_b  = isset( $khimg_data['originalFilesize'] ) ? (int) $khimg_data['originalFilesize'] : 0;
						$converted_size_b = isset( $khimg_data['convertedFilesize'] ) ? (int) $khimg_data['convertedFilesize'] : 0;

						$updated_stats['total_original_size'] += $original_size_b / 1024;
						$updated_stats['total_optimized_size'] += $converted_size_b / 1024;
					}

					// One optimized media item per attachment, regardless of
					// how many bulk sizes it has.
					$updated_stats['media_optimized_num']++;

					if ( $result->post_id > $highest_post_id ) {
						$highest_post_id = $result->post_id;
					}
				}
			}

			$updated_stats['last_processed_post_id'] = $highest_post_id;

			return $updated_stats;
		}

		public static function get_formatted_stats() {
			$stats = self::get_stats();

			$media_optimized = max( 0, (int) ( $stats['media_optimized_num'] ?? 0 ) );
			$kb_before       = max( 0, (float) ( $stats['total_original_size'] ?? 0 ) );
			$kb_after        = max( 0, (float) ( $stats['total_optimized_size'] ?? 0 ) );
			$kb_saved        = max( 0, $kb_before - $kb_after );

			$bytes_before = (int) round( $kb_before * 1024 );
			$bytes_after  = (int) round( $kb_after * 1024 );
			$bytes_saved  = (int) round( $kb_saved * 1024 );

			$percentage_saved  = $kb_before > 0 ? round( ( $kb_saved / $kb_before ) * 100, 1 ) : 0;
			$compression_ratio = $kb_after > 0 ? round( $kb_before / $kb_after, 1 ) : 0;

			return [
				'media_optimized' => number_format( $media_optimized ),
				'before' => self::format_bytes( $bytes_before ),
				'after' => self::format_bytes( $bytes_after ),
				'saved' => self::format_bytes( $bytes_saved ),
				'percentage_saved' => $percentage_saved,
				'compression_ratio' => $compression_ratio,
				'total_storage_saved' => self::format_bytes( $bytes_saved ),
				'last_processed_post_id' => $stats['last_processed_post_id'] ?? 0,
			];
		}

		/**
		 * Discard the stored stats and rebuild them from a full metadata scan.
		 */
		public static function rebuild_stats() {
			delete_option( self::OPTION_KEY );
			return self::get_formatted_stats();
		}

		private static function format_bytes( $bytes, $decimals = 2 ) {
			if ( ! is_numeric( $bytes ) ) {
				return '0 Bytes';
			}

			$bytes = (float) $bytes;
			if ( $bytes <= 0 ) {
				return '0 Bytes';
			}

			$k = 1024;
			$dm = $decimals < 0 ? 0 : $decimals;
			$sizes = [ 'Bytes', 'KB', 'MB', 'GB', 'TB' ];

			$i = floor( log( $bytes ) / log( $k ) );
			$value = round( $bytes / pow( $k, $i ), $dm );

			return $value . ' ' . $sizes[ $i ];
		}

		public static function update_stats_bulk_optimized( $attachment_id, $original_size, $optimized_size, $count_media = true ) {
			// Read the stored option directly. Calling get_stats() here would
			// scan and count the metadata that was just written, then add it
			// again.
			$stats = get_option( self::OPTION_KEY );
			if ( ! is_array( $stats ) ) {
				$stats = self::default_stats();
			}

			if ( $count_media ) {
				$stats['media_optimized_num'] = max( 0, (int) ( $stats['media_optimized_num'] ?? 0 ) ) + 1;
			}

			$stats['total_original_size']    = max( 0, (float) ( $stats['total_original_size'] ?? 0 ) ) + (int) $original_size / 1024;
			$stats['total_optimized_size']   = max( 0, (float) ( $stats['total_optimized_size'] ?? 0 ) ) + (int) $optimized_size / 1024;
			$stats['last_processed_post_id'] = max( (int) ( $stats['last_processed_post_id'] ?? 0 ), (int) $attachment_id );
			update_option( self::OPTION_KEY, $stats, false );
		}

		public static function update_stats_bulk_restored( $attachment_id, $optimized_size, $restored_size ) {
			$stats = get_option( self::OPTION_KEY );
			if ( ! is_array( $stats ) ) {
				$stats = self::default_stats();
			}

			$stats['media_optimized_num']    = max( 0, (int) ( $stats['media_optimized_num'] ?? 0 ) - 1 );
			$stats['total_original_size']    = max( 0, (float) ( $stats['total_original_size'] ?? 0 ) - (int) $restored_size / 1024 );
			$stats['total_optimized_size']   = max( 0, (float) ( $stats['total_optimized_size'] ?? 0 ) - (int) $optimized_size / 1024 );
			$stats['last_processed_post_id'] = max( (int) ( $stats['last_processed_post_id'] ?? 0 ), (int) $attachment_id );
			update_option( self::OPTION_KEY, $stats, false );
		}
	}
}
