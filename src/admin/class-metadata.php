<?php
/**
 * This class is in charge of saving the metadata for the media compression.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'KH_Images_Metadata' ) ) {
	class KH_Images_Metadata {
		/**
		 * Set while an intentional metadata removal must not be undone by
		 * preserve_khimg_metadata().
		 *
		 * @var bool
		 */
		public static $suspend_preservation = false;

		public function __construct() {
			add_action( 'rest_api_init', [ $this, 'register_rest_route' ] );
			add_filter( 'wp_prepare_attachment_for_js', [ $this, 'prepare_attachment_for_js' ], 10, 3 );
			add_filter( 'rest_prepare_attachment', [ $this, 'prepare_attachment_for_rest' ], 10, 3 );
			add_filter( 'wp_update_attachment_metadata', [ $this, 'preserve_khimg_metadata' ], 10, 2 );
			add_action( 'add_attachment', [ $this, 'add_attachment_metadata' ], 10, 1 );
		}

		/**
		 * Run a callback without re-adding the previous khimg metadata.
		 *
		 * @param callable $callback Callback to run.
		 * @return mixed Callback result.
		 */
		public static function without_preservation( $callback ) {
			$previous = self::$suspend_preservation;
			self::$suspend_preservation = true;

			try {
				return $callback();
			} finally {
				self::$suspend_preservation = $previous;
			}
		}

		public function register_rest_route() {
			register_rest_route( 'khimg/v1', '/metadata', [
				'methods' => 'POST',
				'callback' => [ $this, 'save_metadata' ],
				'permission_callback' => function( $request ) {
					return current_user_can( 'upload_files' ) && current_user_can( 'edit_posts' );
				},
				'args' => [
					'metadata' => [
						'type' => 'array',
						'required' => true,
						'validate_callback' => function( $value, $request, $param ) {
							$allowed_keys = self::get_allowed_keys();
							if ( ! is_array( $value ) ) {
								return new WP_Error( 'invalid_param', sprintf( esc_html__( '%s must be an array.', 'kh-images-optimizer' ), $param ) );
							}
							foreach ( $value as $item ) {
								if ( ! is_array( $item ) ) {
									return new WP_Error( 'invalid_param', esc_html__( 'Each metadata entry must be an object.', 'kh-images-optimizer' ) );
								}
								if ( empty( $item['filename'] ) || ! is_string( $item['filename'] ) ) {
									return new WP_Error( 'invalid_param', esc_html__( 'Each metadata entry must have a valid filename.', 'kh-images-optimizer' ) );
								}
								foreach ( array_keys( $item ) as $key ) {
									if ( ! in_array( $key, $allowed_keys, true ) ) {
										return new WP_Error(
											'invalid_param',
											sprintf(
												esc_html__( 'Invalid key "%1$s" in metadata entry. Allowed keys: %2$s', 'kh-images-optimizer' ),
												$key,
												implode( ', ', $allowed_keys )
											)
										);
									}
								}
							}
							return true;
						},
						'sanitize_callback' => function( $value, $request, $param ) {
							$sanitized = [];
							if ( is_array( $value ) ) {
								foreach ( $value as $item ) {
									$entry = self::sanitize_entry( $item );
									if ( ! empty( $entry ) ) {
										$sanitized[] = $entry;
									}
								}
							}
							return $sanitized;
						},
					],
				],
			] );
		}

		/**
		 * Keys accepted from the browser conversion receipt.
		 *
		 * @return array
		 */
		public static function get_allowed_keys() {
			return [
				'filename',
				'originalFormat',
				'originalFilesize',
				'convertedFormat',
				'convertedFilesize',
				'conversionTime',
				'compressionSavings',
				'smartOptimized',
			];
		}

		/**
		 * Sanitize one conversion receipt entry.
		 *
		 * @param mixed $item Raw entry.
		 * @return array
		 */
		public static function sanitize_entry( $item ) {
			if ( ! is_array( $item ) ) {
				return [];
			}

			$entry = [];
			foreach ( self::get_allowed_keys() as $key ) {
				if ( ! isset( $item[ $key ] ) || ! is_scalar( $item[ $key ] ) ) {
					continue;
				}

				if ( 'filename' === $key ) {
					$entry[ $key ] = sanitize_file_name( (string) $item[ $key ] );
				} elseif ( in_array( $key, [ 'originalFilesize', 'convertedFilesize' ], true ) ) {
					$entry[ $key ] = intval( $item[ $key ] );
				} elseif ( in_array( $key, [ 'conversionTime', 'compressionSavings' ], true ) ) {
					$entry[ $key ] = floatval( $item[ $key ] );
				} elseif ( 'smartOptimized' === $key ) {
					$entry[ $key ] = ! empty( $item[ $key ] ) ? 1 : 0;
				} else {
					$entry[ $key ] = sanitize_text_field( (string) $item[ $key ] );
				}
			}

			return $entry;
		}

		public function save_metadata( $request ) {
			$data = $request->get_json_params();
			$metadata_array = isset( $data['metadata'] ) && is_array( $data['metadata'] ) ? $data['metadata'] : [];

			$sanitized_metadata = [];
			foreach ( $metadata_array as $item ) {
				$entry = self::sanitize_entry( $item );
				if ( ! empty( $entry ) ) {
					$entry['optimized_during_upload'] = true;
					$sanitized_metadata[] = $entry;
				}
			}

			$transient_key = 'khimg_metadata_queue';
			$queue = get_transient( $transient_key );
			if ( ! is_array( $queue ) ) {
				$queue = [];
			}

			$queue = array_merge( $queue, $sanitized_metadata );
			set_transient( $transient_key, $queue, HOUR_IN_SECONDS );

			return rest_ensure_response( [
				'success' => true,
				'queued_count' => count( $queue ),
			] );
		}

		public function add_attachment_metadata( $attachment_id ) {
			$transient_key = 'khimg_metadata_queue';
			$queue = get_transient( $transient_key );
			if ( ! is_array( $queue ) ) {
				return;
			}

			$attachment = get_post( $attachment_id );
			if ( ! $attachment || 'attachment' !== $attachment->post_type ) {
				return;
			}

			$attachment_url = wp_get_attachment_url( $attachment_id );
			if ( ! $attachment_url ) {
				return;
			}

			$attachment_filename = wp_basename( $attachment_url );

			$matched_index = null;
			$matched_metadata = null;

			$attachment_pathinfo = pathinfo( $attachment_filename );
			$attachment_base = isset( $attachment_pathinfo['filename'] ) ? $attachment_pathinfo['filename'] : '';
			$attachment_ext  = isset( $attachment_pathinfo['extension'] ) ? $attachment_pathinfo['extension'] : '';

			foreach ( $queue as $index => $item ) {
				if ( ! isset( $item['filename'] ) ) {
					continue;
				}

				$item_pathinfo = pathinfo( $item['filename'] );
				$item_base = isset( $item_pathinfo['filename'] ) ? $item_pathinfo['filename'] : '';
				$item_ext  = isset( $item_pathinfo['extension'] ) ? $item_pathinfo['extension'] : '';

				if ( strtolower( $attachment_ext ) !== strtolower( $item_ext ) ) {
					continue;
				}

				if (
					$attachment_base === $item_base ||
					preg_match( '/^' . preg_quote( $item_base, '/' ) . '-\d+$/', $attachment_base )
				) {
					$matched_index = $index;
					$matched_metadata = $item;
					break;
				}
			}

			if ( null === $matched_index ) {
				return;
			}

			array_splice( $queue, $matched_index, 1 );
			set_transient( $transient_key, $queue, HOUR_IN_SECONDS );

			$metadata = get_post_meta( $attachment_id, '_wp_attachment_metadata', true );
			if ( ! is_array( $metadata ) ) {
				$metadata = [];
			}
			$khimg_metadata = $matched_metadata;
			unset( $khimg_metadata['filename'] );
			$metadata['khimg'] = $khimg_metadata;

			update_post_meta( $attachment_id, '_wp_attachment_metadata', $metadata );
		}

		public function prepare_attachment_for_js( $response, $attachment, $meta ) {
			$attachment_id = $attachment->ID;
			$metadata = get_post_meta( $attachment_id, '_wp_attachment_metadata', true );
			if ( isset( $metadata['khimg'] ) ) {
				$response['khimg'] = $metadata['khimg'];
			} elseif ( isset( $metadata['cimo'] ) ) {
				$response['khimg'] = $metadata['cimo'];
			}
			if ( class_exists( 'KH_Images_Compat' ) ) {
				$response['khimg_compat'] = KH_Images_Compat::get_attachment_status( $attachment_id );
			}
			return $response;
		}

		/**
		 * Add khimg to REST attachment responses used by /wp/v2/media.
		 *
		 * @param WP_REST_Response $response Response object.
		 * @param WP_Post          $post     Attachment post.
		 * @param WP_REST_Request  $request  Request object.
		 * @return WP_REST_Response
		 */
		public function prepare_attachment_for_rest( $response, $post, $request ) {
			if ( ! $response instanceof WP_REST_Response || ! $post instanceof WP_Post || 'attachment' !== $post->post_type ) {
				return $response;
			}

			$metadata = wp_get_attachment_metadata( $post->ID );

			if ( class_exists( 'KH_Images_Compat' ) ) {
				$response->data['khimg_compat'] = KH_Images_Compat::get_attachment_status( $post->ID );
			}

			if ( ! is_array( $metadata ) ) {
				return $response;
			}

			if ( isset( $metadata['khimg'] ) ) {
				$response->data['khimg'] = $metadata['khimg'];
			} elseif ( isset( $metadata['cimo'] ) ) {
				$response->data['khimg'] = $metadata['cimo'];
			}

			return $response;
		}

		public function preserve_khimg_metadata( $metadata, $attachment_id ) {
			if ( self::$suspend_preservation ) {
				return $metadata;
			}

			if ( isset( $metadata['khimg'] ) ) {
				return $metadata;
			}

			$existing_metadata = wp_get_attachment_metadata( $attachment_id );
			if ( $existing_metadata && isset( $existing_metadata['khimg'] ) ) {
				$metadata['khimg'] = $existing_metadata['khimg'];
			} elseif ( $existing_metadata && isset( $existing_metadata['cimo'] ) ) {
				$metadata['khimg'] = $existing_metadata['cimo'];
			}

			return $metadata;
		}
	}

	new KH_Images_Metadata();
}
