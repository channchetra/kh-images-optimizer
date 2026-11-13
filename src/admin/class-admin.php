<?php
/**
 * Admin page settings
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'KH_Images_Admin' ) ) {
	class KH_Images_Admin {
		public function __construct() {
			// Our settings.
			add_action( 'admin_init', [ $this, 'register_settings' ] );
			add_action( 'rest_api_init', [ $this, 'register_settings' ] );
			add_action( 'rest_api_init', [ $this, 'register_stats_routes' ] );

			if ( is_admin() ) {
				// Our admin page.
				add_action( 'admin_menu', [ $this, 'add_admin_menu' ] );
				add_action( 'admin_enqueue_scripts', [ $this, 'enqueue_admin_scripts' ] );
				add_filter( 'plugin_action_links_' . plugin_basename( KHIMG_FILE ), [ $this, 'add_admin_action_links' ] );
				add_filter( 'admin_body_class', [ $this, 'admin_body_class' ] );
			}

			// Disable thumbnail generation
			add_filter( 'intermediate_image_sizes', [ $this, 'disable_thumbnail_generation' ] );

			// Handle WordPress automatic image scaling
			add_filter( 'big_image_size_threshold', [ $this, 'maybe_disable_wp_scaling' ] );
		}

		/**
		 * Add admin menu under Settings
		 */
		public function add_admin_menu() {
			$settings = get_option( 'khimg_options', [] );

			add_options_page(
				__( 'KH Images Settings', 'kh-images-optimizer' ),
				__( 'KH Images', 'kh-images-optimizer' ),
				'manage_options',
				KHIMG_SETTINGS_SLUG,
				[ $this, 'admin_page_callback' ]
			);

			// Remove the menu page if stealth mode is enabled.
			if ( isset( $settings['stealth_mode_enabled'] ) &&
				$settings['stealth_mode_enabled'] === 1 ) {
				remove_submenu_page(
					'options-general.php',
					KHIMG_SETTINGS_SLUG,
				);
			}
		}

		/**
		 * Add a Settings link to the plugin action links.
		 */
		public function add_admin_action_links( $links ) {
			$settings_link = '<a href="' . esc_url( admin_url( 'options-general.php?page=' . KHIMG_SETTINGS_SLUG ) ) . '">' . esc_html__( 'Settings', 'kh-images-optimizer' ) . '</a>';
			return array_merge( [ $settings_link ], $links );
		}

		/**
		 * Add the dashboard app class on the KH Images settings page only.
		 *
		 * @param string $classes Existing body classes.
		 * @return string
		 */
		public function admin_body_class( $classes ) {
			$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : '';
			if ( KHIMG_SETTINGS_SLUG === $page ) {
				$classes .= ' khimg-admin-app';
			}
			return $classes;
		}

		/**
		 * Register settings for REST API access
		 */
		public function register_settings() {
			register_setting(
				'khimg_options',
				'khimg_options',
				[
					'type'              => 'object',
					'description'       => __( 'KH Images Optimizer Settings', 'kh-images-optimizer' ),
					'sanitize_callback' => [ $this, 'sanitize_options' ],
					'show_in_rest'      => [
						'schema' => [
							'type' => 'object',
							'additionalProperties' => true,
							'properties' => [
								// General settings
								'optimize_all_media' => [
									'type' => 'integer',
								],
								'show_optimization_toggle' => [
									'type' => 'integer',
								],
								'show_optimization_toggle_frontend' => [
									'type' => 'integer',
								],
								'persist_optimization_toggle' => [
									'type' => 'integer',
								],
								'disable_wp_scaling' => [
									'type' => 'integer',
								],
								'disable_thumbnail_generation' => [
									'type' => 'integer',
								],
								'thumbnail_sizes' => [
									'type'  => 'array',
									'items' => [
										'type' => 'string',
									],
								],

								// Image Optimization settings
								'smart_optimization' => [
									'type' => 'integer',
								],
								'webp_quality' => [
									'type' => 'integer',
								],
								'max_image_dimension' => [
									'type' => 'integer',
								],

								// LQIP settings
								'lqip_enabled' => [
									'type' => 'integer',
								],
								'lqip_pulse_speed' => [
									'type' => 'number',
									'format' => 'float',
								],
								'lqip_brightness' => [
									'type' => 'number',
									'format' => 'float',
								],
								'lqip_fade_duration' => [
									'type' => 'number',
									'format' => 'float',
								],

								// Video Optimization settings
								'video_optimization_enabled' => [
									'type' => 'integer',
								],
								'video_quality' => [
									'type' => 'integer',
								],
								'video_max_resolution' => [
									'type' => 'string',
								],

								// Audio Optimization settings
								'audio_optimization_enabled' => [
									'type' => 'integer',
								],
								'audio_quality' => [
									'type' => 'integer',
								],

								// SVG Optimization settings
								'svg_upload' => [
									'type' => 'integer',
								],
								'svg_optimization_enabled' => [
									'type' => 'integer',
								],

								// Stealth Mode
								'stealth_mode_enabled' => [
									'type' => 'integer',
								],
							],
						],
					],
				]
			);

			register_setting(
				'khimg_rating',
				'khimg_rating_dismissed',
				[
					'type'              => 'string',
					'description'       => __( 'Tracks if the rating notice has been dismissed.', 'kh-images-optimizer' ),
					'sanitize_callback' => [ $this, 'sanitize_rating_dismissed' ],
					'show_in_rest'      => [
						'schema' => [
							'type' => 'string',
							'enum' => [ '0', '1' ],
						],
					],
					'default'           => '0',
				]
			);
		}

		/**
		 * Register the manual stats rebuild endpoint.
		 */
		public function register_stats_routes() {
			register_rest_route(
				'khimg/v1',
				'/stats/rebuild',
				[
					'methods'             => 'POST',
					'callback'            => function() {
						return rest_ensure_response( [
							'success' => true,
							'stats'   => KH_Images_Stats::rebuild_stats(),
						] );
					},
					'permission_callback' => function() {
						return current_user_can( 'manage_options' );
					},
				]
			);
		}

		/**
		 * Enqueue admin scripts for the settings page
		 */
		public function enqueue_admin_scripts( $hook ) {
			if ( 'settings_page_khimg-settings' !== $hook ) {
				return;
			}

			wp_enqueue_style( 'wp-components' );

			$dependencies = apply_filters( 'khimg/admin/enqueue_admin_scripts', ['css' => [], 'js' => []] );

			$build_dir = plugin_dir_path( KHIMG_FILE ) . 'build/admin/';
			$build_url = plugin_dir_url( KHIMG_FILE ) . 'build/admin/';

			$script_asset = include $build_dir . 'admin-page-styles.asset.php';
			wp_enqueue_style(
				'khimg-admin-page-styles',
				$build_url . 'admin-page-styles.css',
				array_merge( [ 'wp-components' ], $dependencies['css'] ),
				$script_asset['version']
			);

			$script_asset = include $build_dir . 'admin-page.asset.php';
			wp_enqueue_script(
				'khimg-admin-page',
				$build_url . 'admin-page.js',
				array_merge( $script_asset['dependencies'], $dependencies['js'] ),
				$script_asset['version'],
				true
			);

			$stats = KH_Images_Stats::get_formatted_stats();

			$image_sizes = $this->get_all_image_sizes();
			$formatted_sizes = [];
			foreach ( $image_sizes as $name => $data ) {
				$formatted_sizes[] = [
					'name' => $name,
					'width' => $data['width'],
					'height' => $data['height'],
				];
			}

			wp_localize_script(
				'khimg-admin-page',
				'khimgAdmin',
				[
					'imageSizes' => $formatted_sizes,
					'ratingDismissed' => get_option( 'khimg_rating_dismissed', '0' ),
					'stats' => $stats,
				]
			);
		}

		/**
		 * Admin page callback
		 */
		public function admin_page_callback() {
			?>
			<div class="wrap">
				<div id="khimg-admin-settings"></div>
			</div>
			<?php
		}

		/**
		 * Sanitize settings
		 */
		public function sanitize_options( $options ) {
			$existing = get_option( 'khimg_options', [] );
			if ( ! is_array( $existing ) ) {
				$existing = [];
			}

			// A partial REST update must not erase settings that were not sent.
			if ( ! is_array( $options ) ) {
				return $existing;
			}

			$sanitized = $existing;

			// General settings
			if ( isset( $options['optimize_all_media'] ) ) {
				$sanitized['optimize_all_media'] = $options['optimize_all_media'] ? 1 : 0;
			}
			if ( isset( $options['show_optimization_toggle'] ) ) {
				$sanitized['show_optimization_toggle'] = $options['show_optimization_toggle'] ? 1 : 0;
			}
			if ( isset( $options['show_optimization_toggle_frontend'] ) ) {
				$sanitized['show_optimization_toggle_frontend'] = $options['show_optimization_toggle_frontend'] ? 1 : 0;
			}
			if ( isset( $options['persist_optimization_toggle'] ) ) {
				$sanitized['persist_optimization_toggle'] = $options['persist_optimization_toggle'] ? 1 : 0;
			}
			if ( isset( $options['disable_wp_scaling'] ) ) {
				$sanitized['disable_wp_scaling'] = $options['disable_wp_scaling'] ? 1 : 0;
			}
			if ( isset( $options['disable_thumbnail_generation'] ) ) {
				$sanitized['disable_thumbnail_generation'] = $options['disable_thumbnail_generation'] ? 1 : 0;
			}
			if ( isset( $options['thumbnail_sizes'] ) && is_array( $options['thumbnail_sizes'] ) ) {
				$sanitized['thumbnail_sizes'] = array_map( 'sanitize_text_field', $options['thumbnail_sizes'] );
			}

			// Image settings
			if ( isset( $options['smart_optimization'] ) ) {
				$sanitized['smart_optimization'] = $options['smart_optimization'] ? 1 : 0;
			}
			if ( isset( $options['webp_quality'] ) ) {
				$sanitized['webp_quality'] = intval( $options['webp_quality'] );
			}
			if ( isset( $options['max_image_dimension'] ) ) {
				$sanitized['max_image_dimension'] = intval( $options['max_image_dimension'] );
			}

			// LQIP settings
			if ( isset( $options['lqip_enabled'] ) ) {
				$sanitized['lqip_enabled'] = $options['lqip_enabled'] ? 1 : 0;
			}
			if ( isset( $options['lqip_pulse_speed'] ) ) {
				$sanitized['lqip_pulse_speed'] = floatval( $options['lqip_pulse_speed'] );
			}
			if ( isset( $options['lqip_brightness'] ) ) {
				$sanitized['lqip_brightness'] = floatval( $options['lqip_brightness'] );
			}
			if ( isset( $options['lqip_fade_duration'] ) ) {
				$sanitized['lqip_fade_duration'] = floatval( $options['lqip_fade_duration'] );
			}

			// Video settings
			if ( isset( $options['video_optimization_enabled'] ) ) {
				$sanitized['video_optimization_enabled'] = $options['video_optimization_enabled'] ? 1 : 0;
			}
			if ( isset( $options['video_quality'] ) ) {
				$sanitized['video_quality'] = intval( $options['video_quality'] );
			}
			if ( isset( $options['video_max_resolution'] ) ) {
				$sanitized['video_max_resolution'] = sanitize_text_field( $options['video_max_resolution'] );
			}

			// Audio settings
			if ( isset( $options['audio_optimization_enabled'] ) ) {
				$sanitized['audio_optimization_enabled'] = $options['audio_optimization_enabled'] ? 1 : 0;
			}
			if ( isset( $options['audio_quality'] ) ) {
				$sanitized['audio_quality'] = intval( $options['audio_quality'] );
			}

			// SVG settings
			if ( isset( $options['svg_upload'] ) ) {
				$sanitized['svg_upload'] = $options['svg_upload'] ? 1 : 0;
			}
			if ( isset( $options['svg_optimization_enabled'] ) ) {
				$sanitized['svg_optimization_enabled'] = $options['svg_optimization_enabled'] ? 1 : 0;
			}

			// Stealth mode
			if ( isset( $options['stealth_mode_enabled'] ) ) {
				$sanitized['stealth_mode_enabled'] = $options['stealth_mode_enabled'] ? 1 : 0;
			}

			return $sanitized;
		}

		/**
		 * Sanitize rating dismissed flag
		 */
		public function sanitize_rating_dismissed( $value ) {
			return '1' === (string) $value ? '1' : '0';
		}

		/**
		 * Get all registered image sizes
		 */
		private function get_all_image_sizes() {
			$registered_sizes = wp_get_registered_image_subsizes();
			$sizes = [];
			foreach ( $registered_sizes as $size_name => $size_data ) {
				$sizes[ $size_name ] = [
					'width'  => $size_data['width'],
					'height' => $size_data['height'],
				];
			}
			return $sizes;
		}

		/**
		 * Disable WordPress automatic image scaling if setting is disabled.
		 *
		 * Note: the stored key is named disable_wp_scaling, but value 0 is what
		 * disables scaling. Value 1 keeps the default threshold.
		 */
		public function maybe_disable_wp_scaling( $threshold ) {
			$settings = get_option( 'khimg_options', [] );
			if ( isset( $settings['disable_wp_scaling'] ) && $settings['disable_wp_scaling'] === 0 ) {
				return false;
			}
			return $threshold;
		}

		/**
		 * Disable thumbnail generation
		 */
		public function disable_thumbnail_generation( $sizes ) {
			$settings = get_option( 'khimg_options', [] );
			if ( ! empty( $settings['disable_thumbnail_generation'] ) && $settings['disable_thumbnail_generation'] === 1 ) {
				return [];
			}
			if ( ! empty( $settings['thumbnail_sizes'] ) && is_array( $settings['thumbnail_sizes'] ) ) {
				$sizes = array_values( array_diff( $sizes, $settings['thumbnail_sizes'] ) );
			}
			return $sizes;
		}
	}

	new KH_Images_Admin();
}
