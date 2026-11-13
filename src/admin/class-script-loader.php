<?php
/**
 * Enqueue scripts for the admin area.
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'KH_Images_Script_Loader' ) ) {
	class KH_Images_Script_Loader {
		public function __construct() {
			add_action( 'enqueue_block_editor_assets', [ __CLASS__, 'enqueue_khimg_assets' ] );
			add_action( 'elementor/editor/before_enqueue_scripts', [ __CLASS__, 'enqueue_khimg_assets' ] );
			if ( class_exists( 'FLBuilderModel' ) ) {
				add_action( 'wp_head', [ $this, 'maybe_enqueue_for_beaver_builder' ], 999 );
			}
			add_action( 'bricks_before_site_wrapper', [ $this, 'maybe_enqueue_for_bricks_builder' ] );
			add_action( 'oxygen_enqueue_ui_scripts', [ __CLASS__, 'enqueue_khimg_assets' ] );
			add_action( 'et_fb_enqueue_assets', [ __CLASS__, 'enqueue_khimg_assets' ] );
			add_action( 'admin_enqueue_scripts', [ __CLASS__, 'enqueue_khimg_assets' ] );
		}

		public function maybe_enqueue_for_beaver_builder() {
			if ( class_exists( 'FLBuilderModel' ) && FLBuilderModel::is_builder_active() ) {
				self::enqueue_khimg_assets();
			}
		}

		public function maybe_enqueue_for_bricks_builder() {
			if ( function_exists( 'bricks_is_builder' ) && bricks_is_builder() ) {
				self::enqueue_khimg_assets();
			}
		}

		public static function enqueue_khimg_assets() {
			if ( wp_script_is( 'khimg-script', 'enqueued' ) ) {
				return;
			}

			$dependencies = apply_filters( 'khimg/script_loader/enqueue_khimg_assets', ['css' => [], 'js' => []] );

			$build_dir = plugin_dir_path( KHIMG_FILE ) . 'build/admin/';
			$build_url = plugin_dir_url( KHIMG_FILE ) . 'build/admin/';

			$script_asset = include $build_dir . 'index.asset.php';
			wp_enqueue_script(
				'khimg-script',
				$build_url . 'index.js',
				array_merge(
					array_values( array_diff( $script_asset['dependencies'], [ 'wp-dom-ready' ] ) ),
					$dependencies['js']
				),
				$script_asset['version'],
				true
			);

			$settings   = get_option( 'khimg_options', [] );
			$threshold  = apply_filters( 'big_image_size_threshold', 2560, array( 0, 0 ), '', 0 );
			$is_premium = defined( 'KHIMG_BUILD' ) && 'premium' === KHIMG_BUILD;

			wp_localize_script(
				'khimg-script',
				'khimgSettings',
				[
					'restUrl' => rest_url( 'khimg/v1/' ),
					'settingsUrl' => admin_url( 'options-general.php?page=' . KHIMG_SETTINGS_SLUG . '#khimg-stats' ),
					'version' => (string) ( get_file_data( KHIMG_FILE, [ 'Version' => 'Version' ] )['Version'] ?? '' ),
					'build' => defined( 'KHIMG_BUILD' ) ? KHIMG_BUILD : '',
					'compat' => class_exists( 'KH_Images_Compat' ) ? KH_Images_Compat::get_status() : [],
					'mediaLibraryUrl' => admin_url( 'upload.php' ),
					'siteUrl' => home_url( '/' ),
					'nonce'   => wp_create_nonce( 'wp_rest' ),
					'isFrontend' => ! is_admin(),
					'isLoggedIn' => is_user_logged_in(),
					'canManageOptions' => current_user_can( 'manage_options' ),
					'optimizeAllMedia' => isset( $settings['optimize_all_media'] ) ? (int) $settings['optimize_all_media'] : 0,
					'isPremium' => $is_premium,
					'showUnimplementedSettings' => (bool) apply_filters( 'khimg/admin/show_unimplemented_settings', $is_premium ),
					'showOptimizationToggle' => isset( $settings['show_optimization_toggle'] ) ? (int) $settings['show_optimization_toggle'] : 0,
					'showOptimizationToggleFrontend' => isset( $settings['show_optimization_toggle_frontend'] ) ? (int) $settings['show_optimization_toggle_frontend'] : 0,
					'persistOptimizationToggle' => isset( $settings['persist_optimization_toggle'] ) ? (int) $settings['persist_optimization_toggle'] : 0,
					'smartOptimization' => isset( $settings['smart_optimization'] ) ? (int) $settings['smart_optimization'] : 1,
					'webpQuality' => ! empty( $settings['webp_quality'] ) ? (int) $settings['webp_quality'] : 80,
					'maxImageDimension' => ! empty( $settings['max_image_dimension'] ) ? (int) $settings['max_image_dimension'] : 0,
					'videoOptimizationEnabled' => isset( $settings['video_optimization_enabled'] ) ? (int) $settings['video_optimization_enabled'] : 1,
					'videoQuality' => ! empty( $settings['video_quality'] ) ? (int) $settings['video_quality'] : 3,
					'videoMaxResolution' => ! empty( $settings['video_max_resolution'] ) ? $settings['video_max_resolution'] : '',
					'audioOptimizationEnabled' => isset( $settings['audio_optimization_enabled'] ) ? (int) $settings['audio_optimization_enabled'] : 1,
					'audioQuality' => ! empty( $settings['audio_quality'] ) ? (int) $settings['audio_quality'] : 128,
					'svgUpload' => isset( $settings['svg_upload'] ) ? (int) $settings['svg_upload'] : 0,
					'svgOptimizationEnabled' => isset( $settings['svg_optimization_enabled'] ) ? (int) $settings['svg_optimization_enabled'] : 1,
					'stealthModeEnabled' => isset( $settings['stealth_mode_enabled'] ) ? (int) $settings['stealth_mode_enabled'] : 0,
					'wpScalingThreshold' => $threshold,
				]
			);

			$style_asset = include $build_dir . 'index-styles.asset.php';
			wp_enqueue_style(
				'khimg-script-styles',
				$build_url . 'index-styles.css',
				array_merge( $style_asset['dependencies'], $dependencies['css'] ),
				$style_asset['version']
			);
		}
	}

	new KH_Images_Script_Loader();
}
