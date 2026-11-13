<?php
/**
 * Meta box information to show the information about the conversion.
 */

 // Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'KH_Images_Meta_Box' ) ) {
	class KH_Images_Meta_Box {
		public function __construct() {
			if ( is_admin() ) {
				add_action( 'add_meta_boxes', [ $this, 'add_meta_box' ] );
			}
		}

		public function add_meta_box() {
			if ( ! apply_filters( 'khimg/metabox/do_render', true ) ) {
				return;
			}

			add_meta_box(
				'khimg-data-meta-box',
				__( 'KH Images Optimization', 'kh-images-optimizer' ),
				function( $post ) {
					$metadata = get_post_meta( $post->ID, '_wp_attachment_metadata', true );
					$khimg_data = null;
					if ( isset( $metadata['khimg'] ) ) {
						$khimg_data = $metadata['khimg'];
					} elseif ( isset( $metadata['cimo'] ) ) {
						$khimg_data = $metadata['cimo'];
					}

					if ( $khimg_data ) {
						$khimg = $khimg_data;

						$compression_savings = isset( $khimg['compressionSavings'] ) ? floatval( $khimg['compressionSavings'] ) : null;
						$optimization_savings = $compression_savings !== null ? number_format( 100 - ( $compression_savings * 100 ), 2 ) : null;
						$original_filesize = isset( $khimg['originalFilesize'] ) ? floatval( $khimg['originalFilesize'] ) : 0;
						$converted_filesize = isset( $khimg['convertedFilesize'] ) ? floatval( $khimg['convertedFilesize'] ) : 0;

						$is_bulk_optimized = isset( $khimg['bulk_optimization'] ) &&
							is_array( $khimg['bulk_optimization'] ) &&
							! empty( $khimg['bulk_optimization'] );

						if ( $is_bulk_optimized ) {
							$bulk_optimization_count = count( $khimg['bulk_optimization'] );

							$bulk_original_filesize = 0;
							$bulk_converted_filesize = 0;
							if ( $is_bulk_optimized ) {
								foreach ( $khimg['bulk_optimization'] as $size_key => $bulk_data ) {
									$orig = isset( $bulk_data['originalFilesize'] ) ? floatval( $bulk_data['originalFilesize'] ) : 0;
									$conv = isset( $bulk_data['convertedFilesize'] ) ? floatval( $bulk_data['convertedFilesize'] ) : 0;
									$bulk_original_filesize += $orig;
									$bulk_converted_filesize += $conv;
								}
							}

							$original_filesize = $bulk_original_filesize;
							$converted_filesize = $bulk_converted_filesize;

							$optimization_savings = number_format( 100 * ( $original_filesize - $converted_filesize ) / $original_filesize, 2 );
						}

						if ( ! is_numeric( $optimization_savings ) || floatval( $optimization_savings ) < 0 ) {
							echo '<p>' . esc_html__( 'KH Images did not optimize this attachment.', 'kh-images-optimizer' ) . '</p>';
							return;
						}

						$kb_saved = $this->format_filesize( $original_filesize - $converted_filesize, 1, true );
						$optimization_savings_class = ( $optimization_savings > 0 ) ? 'khimg-optimization-savings-up' : 'khimg-optimization-savings-down';

						$original_size = $this->format_filesize( $original_filesize );
						$converted_size = $this->format_filesize( $converted_filesize );

						$converted_format_raw = isset( $khimg['convertedFormat'] ) ? $khimg['convertedFormat'] : ( isset( $post->post_mime_type ) ? $post->post_mime_type : '' );
						$converted_format = $converted_format_raw ? $this->convert_mimetype_to_format( $converted_format_raw ) : '';
						$media_type_label = $this->get_media_type_label( $converted_format_raw );
						$is_image_media = is_string( $converted_format_raw ) && strpos( strtolower( $converted_format_raw ), 'image/' ) === 0;
						$converttime = isset( $khimg['conversionTime'] ) ? floatval( $khimg['conversionTime'] ) : null;
						if ( $converttime !== null ) {
							if ( $converttime < 1000 ) {
								$converttime_str = number_format( $converttime, 0 ) . ' ms';
							} elseif ( $converttime < 60000 ) {
								$converttime_str = number_format( $converttime / 1000, 1 ) . ' sec';
							} else {
								$converttime_str = number_format( $converttime / 60000, 1 ) . ' min';
							}
						} else {
							$converttime_str = 'N/A';
						}

						echo '<div class="khimg-media-manager-metadata-title-container">';
						echo '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 672 672" height="20" width="20"><path d="M132.5 132.5C182.4 82.5 253 56 336 56C419 56 489.6 82.5 539.5 132.5C589.4 182.5 616 253 616 336C616 419 589.5 489.6 539.5 539.5C489.5 589.4 419 616 336 616C253 616 182.4 589.5 132.5 539.5C82.6 489.5 56 419 56 336C56 253 82.5 182.4 132.5 132.5zM465.5 273.9C477.6 264.2 479.5 246.6 469.9 234.5C460.3 222.4 442.6 220.5 430.5 230.1C378 272.1 330.3 341.9 306.7 379.4C291.4 359.3 267.2 331.1 239.5 312.6C226.6 304 209.2 307.5 200.7 320.4C192.2 333.3 195.6 350.7 208.5 359.2C237.4 378.5 264.1 415.1 274.1 429.9C281.5 440.9 294 447.9 307.9 447.9C322.3 447.9 335.5 440.3 342.8 428C357.2 403.5 410 318.3 465.6 273.8z"/></svg>';
						echo '<h3 class="khimg-media-manager-metadata-title">' . sprintf( esc_html__( '%s Optimized by KH Images', 'kh-images-optimizer' ), esc_html( $media_type_label ) ) . '</h3>';
						echo '</div>';
						echo '<ul>';

						echo '<li class="khimg-compression-savings ' . esc_attr( $optimization_savings_class ) . '">';
						echo sprintf(
							esc_html__( 'Saved %s%%', 'kh-images-optimizer' ),
							esc_html( $optimization_savings )
						);
						echo ' <span class="khimg-compression-savings-bytes">(' . esc_html( $kb_saved ) . ')</span>';
						echo '</li>';

						echo '<li class="khimg-filesize-original">';
						echo sprintf(
							esc_html__( 'Original: %s', 'kh-images-optimizer' ),
							'<span class="khimg-value">' . esc_html( $original_size ) . '</span>'
						);
						echo '</li>';

						echo '<li class="khimg-filesize-optimized">';
						$arrow = $converted_filesize < $original_filesize ? '↓' : ( $converted_filesize > $original_filesize ? '↑' : '' );
						echo sprintf(
							esc_html__( 'Optimized: %s', 'kh-images-optimizer' ),
							'<span class="khimg-value">' . esc_html( $arrow ) . ' ' . esc_html( $converted_size ) . '</span>'
						);
						echo '</li>';

						if ( ! $is_bulk_optimized ) {
							echo '<li class="khimg-converted">';
							$converted_format_markup = '<span class="khimg-value">' . esc_html( $converted_format ) . '</span>';
							if ( ! empty( $khimg['smartOptimized'] ) ) {
								echo '🏞️ ' . sprintf(
									esc_html__( 'Smart optimized to %s', 'kh-images-optimizer' ),
									$converted_format_markup
								);
							} else {
								echo '🏞️ ' . sprintf(
									esc_html__( 'Converted to %s', 'kh-images-optimizer' ),
									$converted_format_markup
								);
							}
							echo '</li>';

							echo '<li class="khimg-time">';
							echo '⚡️ ' . sprintf(
								esc_html__( 'Done in %s', 'kh-images-optimizer' ),
								'<span class="khimg-value">' . esc_html( $converttime_str ) . '</span>'
							);
							echo '</li>';
						} else {
							echo '<li class="khimg-bulk-optimization-number">';
							echo '🏞️ ' . sprintf(
								$is_image_media
									? esc_html__( '%s thumbnail(s) processed', 'kh-images-optimizer' )
									: esc_html__( '%s file(s) processed', 'kh-images-optimizer' ),
								'<span class="khimg-value">' . esc_html( $bulk_optimization_count ) . '</span>'
							);
							echo '</li>';

							echo '<li class="khimg-bulk-optimization-note">';
							echo '⚡️ ' . esc_html__( 'Bulk optimized', 'kh-images-optimizer' );
							echo '</li>';
						}

						echo '</ul>';
					} else {
						echo '<p>' . esc_html__( 'KH Images did not optimize this attachment.', 'kh-images-optimizer' ) . '</p>';
					}
				},
				'attachment',
				'side',
				'core'
			);
		}

		/**
		 * Format a byte count for display.
		 *
		 * @param mixed $bytes      Byte count.
		 * @param int   $decimals   Decimal places.
		 * @param bool  $invertSign Invert the sign.
		 * @return string
		 */
		private function format_filesize( $bytes, $decimals = 2, $invertSign = false ) {
			if ( ! is_numeric( $bytes ) || 0 === (float) $bytes ) {
				return '0 Bytes';
			}

			$k     = 1024;
			$dm    = $decimals < 0 ? 0 : $decimals;
			$sizes = [ 'Bytes', 'KB', 'MB', 'GB' ];

			$abs_bytes = abs( (float) $bytes );
			$i         = floor( log( $abs_bytes ) / log( $k ) );
			$value     = round( $abs_bytes / pow( $k, $i ), $dm );

			$sign = $bytes < 0 ? '-' : '';
			if ( $invertSign ) {
				$sign = '-' === $sign ? '' : '-';
			}

			return $sign . $value . ' ' . $sizes[ $i ];
		}

		/**
		 * Turn a MIME type into a short format name.
		 *
		 * @param mixed $mimetype MIME type.
		 * @return string
		 */
		private function convert_mimetype_to_format( $mimetype ) {
			if ( ! is_string( $mimetype ) || false === strpos( $mimetype, '/' ) ) {
				return esc_html( is_scalar( $mimetype ) ? (string) $mimetype : '' );
			}

			$parts  = explode( '/', $mimetype );
			$format = isset( $parts[1] ) ? $parts[1] : '';
			if ( 'webp' === strtolower( $format ) ) {
				return 'WebP';
			}

			return ucfirst( $format );
		}

		/**
		 * Turn a MIME type into a media category label.
		 *
		 * @param mixed $mimetype MIME type.
		 * @return string
		 */
		private function get_media_type_label( $mimetype ) {
			if ( ! is_string( $mimetype ) || false === strpos( $mimetype, '/' ) ) {
				return esc_html__( 'Media', 'kh-images-optimizer' );
			}

			$parts    = explode( '/', $mimetype );
			$category = strtolower( $parts[0] );

			switch ( $category ) {
				case 'image':
					return esc_html__( 'Image', 'kh-images-optimizer' );
				case 'video':
					return esc_html__( 'Video', 'kh-images-optimizer' );
				case 'audio':
					return esc_html__( 'Audio', 'kh-images-optimizer' );
				default:
					return esc_html__( 'Media', 'kh-images-optimizer' );
			}
		}
	}

	new KH_Images_Meta_Box();
}
