<?php
/**
 * Plugin Name: KH Images - Image Optimizer
 * Plugin URI: https://sovichetra.com/kh-images-image-optimizer/
 * Description: Unlimited free image compression and WebP conversion, done instantly as you upload them. No quotas, no external servers, no limits.
 * Author: Chann Chetra
 * Author URI: https://sovichetra.com
 * License: GPLv2 or later
 * Text Domain: kh-images-optimizer
 * Version: 1.5.0
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

defined( 'KHIMG_FILE' ) || define( 'KHIMG_FILE', __FILE__ );
defined( 'KHIMG_BUILD' ) || define( 'KHIMG_BUILD', 'free' );
defined( 'KHIMG_SETTINGS_SLUG' ) || define( 'KHIMG_SETTINGS_SLUG', 'khimg-settings' );

require_once __DIR__ . '/src/admin/class-script-loader.php';
require_once __DIR__ . '/src/admin/class-meta-box.php';
require_once __DIR__ . '/src/admin/class-compat.php';
require_once __DIR__ . '/src/admin/class-metadata.php';
require_once __DIR__ . '/src/admin/class-admin-notices.php';
require_once __DIR__ . '/src/admin/class-stats.php';
require_once __DIR__ . '/src/admin/class-admin.php';
require_once __DIR__ . '/src/admin/class-bulk-optimizer.php';

/**
 * Plugin activation hook.
 */
function khimg_activate() {
	KH_Images_Admin_Notices::set_activation_notice();
}
register_activation_hook( __FILE__, 'khimg_activate' );
