<?php
/**
 * Admin notices for the KH Images plugin.
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'KH_Images_Admin_Notices' ) ) {
	class KH_Images_Admin_Notices {
		public function __construct() {
			add_action( 'admin_notices', [ $this, 'show_activation_notice' ] );
			add_action( 'wp_ajax_khimg_dismiss_activation_ajax', [ $this, 'ajax_dismiss_activation_notice' ] );
		}

		public function show_activation_notice() {
			if ( ! is_admin() || ! current_user_can( 'manage_options' ) ) {
				return;
			}

			$show_notice = get_transient( 'khimg_show_activation_notice' );
			if ( ! $show_notice ) {
				return;
			}

			?>
			<div class="notice notice-success is-dismissible khimg-activation-notice" data-nonce="<?php echo esc_attr( wp_create_nonce( 'khimg_dismiss_activation_ajax' ) ); ?>">
				<p>
					<strong><?php esc_html_e( 'KH Images Optimizer activated.', 'kh-images-optimizer' ); ?></strong>
					<?php esc_html_e( 'Your images are instantly optimized within your browser as you upload — only the optimized versions ever touch your site!', 'kh-images-optimizer' ); ?>
				</p>
				<p>
					<button type="button" class="button button-secondary khimg-activation-dismiss">
						<?php esc_html_e( 'Dismiss', 'kh-images-optimizer' ); ?>
					</button>
				</p>
			</div>
			<script>
			(function() {
				document.addEventListener('DOMContentLoaded', function() {
					var isDismissing = false;
					document.addEventListener('click', function(event) {
						var notice = event.target.closest('.khimg-activation-notice');
						if (!notice || isDismissing) {
							return;
						}
						var isCoreDismiss = event.target.classList.contains('notice-dismiss');
						var isButtonDismiss = event.target.classList.contains('khimg-activation-dismiss');
						if (!isCoreDismiss && !isButtonDismiss) {
							return;
						}
						isDismissing = true;
						var nonce = notice.getAttribute('data-nonce');
						fetch(ajaxurl, {
							method: 'POST',
							headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
							body: 'action=khimg_dismiss_activation_ajax&nonce=' + encodeURIComponent(nonce)
						}).then(function(response) {
							if (!response.ok) {
								throw new Error('Network response was not ok');
							}
							if (isButtonDismiss) {
								notice.remove();
							}
						}).catch(function(error) {
							console.error('Error dismissing notice:', error);
							isDismissing = false;
						});
					});
				});
			})();
			</script>
			<?php
		}

		public function ajax_dismiss_activation_notice() {
			$nonce = isset( $_POST['nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['nonce'] ) ) : '';
			if ( ! $nonce || ! wp_verify_nonce( $nonce, 'khimg_dismiss_activation_ajax' ) ) {
				wp_die( esc_html__( 'Security check failed.', 'kh-images-optimizer' ) );
			}

			if ( ! current_user_can( 'manage_options' ) ) {
				wp_die( esc_html__( 'Insufficient permissions.', 'kh-images-optimizer' ) );
			}

			if ( ! get_transient( 'khimg_show_activation_notice' ) ) {
				wp_die( 'Notice already dismissed' );
			}

			delete_transient( 'khimg_show_activation_notice' );

			wp_send_json_success();
		}

		public static function set_activation_notice() {
			set_transient( 'khimg_show_activation_notice', true, 60 * 60 * 24 );
		}
	}

	new KH_Images_Admin_Notices();
}
