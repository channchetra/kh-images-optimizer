<?php
/**
 * Lightweight smoke tests for the desloppify pass.
 *
 * These tests do not boot WordPress. They stub the small set of WordPress
 * functions needed by the pure helpers and file-safety methods.
 *
 * Run with: php tests/desloppify-smoke.php
 */

define( 'ABSPATH', __DIR__ . '/' );
define( 'HOUR_IN_SECONDS', 3600 );
define( 'KHS3DATA_VERSION', '1.0.0-test' );
define( 'KHSE_PLUGIN_VERSION', '1.0.0-test' );

$GLOBALS['khimg_test_upload_basedir'] = '';
$GLOBALS['khimg_test_upload_baseurl'] = '';
$GLOBALS['khimg_test_post_meta']      = [];
$GLOBALS['khimg_test_options']        = [];

function add_action() {}
function add_filter() {}
function register_rest_route() {}
function current_user_can() { return true; }
function admin_url( $path = '' ) {
	return 'http://example.test/wp-admin/' . ltrim( $path, '/' );
}
function get_attached_file( $attachment_id ) {
	if ( isset( $GLOBALS['khimg_test_attached_file'] ) ) {
		return $GLOBALS['khimg_test_attached_file'];
	}
	return sys_get_temp_dir() . '/khimg-test-' . (int) $attachment_id . '.jpg';
}
function apply_filters( $tag, $value, ...$args ) {
	if ( 'khimg/bulk/reoffload_offloaded_attachment' === $tag && isset( $GLOBALS['khimg_test_reoffload_filter'] ) ) {
		return $GLOBALS['khimg_test_reoffload_filter'];
	}
	return $value;
}
function get_option( $key, $default = false ) {
	return array_key_exists( $key, $GLOBALS['khimg_test_options'] )
		? $GLOBALS['khimg_test_options'][ $key ]
		: $default;
}
function update_option( $key, $value, $autoload = null ) {
	$GLOBALS['khimg_test_options'][ $key ] = $value;
	return true;
}
function get_post_meta( $post_id, $key, $single = false ) {
	return isset( $GLOBALS['khimg_test_post_meta'][ $key ] ) ? $GLOBALS['khimg_test_post_meta'][ $key ] : '';
}
function update_post_meta() { return true; }
function delete_post_meta() { return true; }
function wp_get_upload_dir() {
	return [
		'basedir' => $GLOBALS['khimg_test_upload_basedir'],
		'baseurl' => $GLOBALS['khimg_test_upload_baseurl'],
	];
}
function wp_get_attachment_metadata( $attachment_id ) {
	return isset( $GLOBALS['khimg_test_attachment_metadata'] )
		? $GLOBALS['khimg_test_attachment_metadata']
		: [];
}
function trailingslashit( $value ) {
	return rtrim( (string) $value, '/\\' ) . '/';
}
function path_is_absolute( $path ) {
	return is_string( $path ) && '' !== $path && '/' === $path[0];
}
function path_join( $base, $path ) {
	return rtrim( $base, '/\\' ) . '/' . ltrim( $path, '/\\' );
}
function sanitize_file_name( $name ) {
	return preg_replace( '/\s+/', '-', (string) $name );
}
function sanitize_text_field( $value ) {
	return trim( strip_tags( (string) $value ) );
}
function esc_html__( $text ) { return $text; }
function esc_html( $text ) { return $text; }
function __( $text ) { return $text; }

class WP_Error {
	public function __construct( $code = '', $message = '', $data = [] ) {}
}

class KH_Test_WPDB {
	public $postmeta = 'wp_postmeta';
	public $results  = [];

	public function prepare( $query, ...$args ) {
		return $query;
	}

	public function get_results( $query ) {
		return $this->results;
	}
}

function maybe_unserialize( $value ) {
	return $value;
}

require_once __DIR__ . '/../src/admin/class-metadata.php';
require_once __DIR__ . '/../src/admin/class-bulk-optimizer.php';
require_once __DIR__ . '/../src/admin/class-stats.php';
require_once __DIR__ . '/../src/admin/class-compat.php';

$passed = 0;
$failed = 0;

function check( $condition, $message ) {
	global $passed, $failed;
	if ( $condition ) {
		$passed++;
		echo "PASS: {$message}\n";
		return;
	}
	$failed++;
	echo "FAIL: {$message}\n";
}

function remove_tree( $dir ) {
	if ( ! is_dir( $dir ) ) {
		return;
	}
	foreach ( scandir( $dir ) as $item ) {
		if ( '.' === $item || '..' === $item ) {
			continue;
		}
		$path = $dir . '/' . $item;
		if ( is_dir( $path ) ) {
			remove_tree( $path );
		} else {
			@unlink( $path );
		}
	}
	@rmdir( $dir );
}

// 1. Conversion receipt sanitizer.
$entry = KH_Images_Metadata::sanitize_entry( [
	'filename'           => 'Photo 1.JPG',
	'originalFormat'     => 'image/jpeg',
	'originalFilesize'   => '2048',
	'convertedFilesize'  => '1024',
	'conversionTime'     => '12.5',
	'compressionSavings' => '0.5',
	'smartOptimized'     => '1',
	'unknown'            => 'drop me',
	'bad_array'          => [ 'x' ],
] );

check( 'Photo-1.JPG' === $entry['filename'], 'sanitize_entry keeps and sanitizes the filename' );
check( 2048 === $entry['originalFilesize'], 'sanitize_entry casts byte counts to integers' );
check( 12.5 === $entry['conversionTime'], 'sanitize_entry casts times to floats' );
check( 1 === $entry['smartOptimized'], 'sanitize_entry normalizes the smart flag' );
check( ! isset( $entry['unknown'] ), 'sanitize_entry drops unknown keys' );
check( ! isset( $entry['bad_array'] ), 'sanitize_entry drops non-scalar values' );

// 2. File replacement helper.
$dir = sys_get_temp_dir() . '/khimg-smoke-' . uniqid();
mkdir( $dir, 0777, true );

$target = $dir . '/photo.jpg';
$source = $dir . '/uploaded.jpg';
file_put_contents( $target, 'old optimized bytes' );
file_put_contents( $source, 'original bytes' );

$bulk = new KH_Images_Bulk_Optimizer();
$replace = new ReflectionMethod( $bulk, 'replace_file' );
$replace->setAccessible( true );

check( true === $replace->invoke( $bulk, $source, $target ), 'replace_file reports success' );
check( 'original bytes' === file_get_contents( $target ), 'replace_file writes the source over the target' );
check( ! file_exists( $source ), 'replace_file removes the source after success' );
check( ! file_exists( $target . '.khimg-restore-tmp' ), 'replace_file leaves no temporary file' );

$source2 = $dir . '/uploaded-2.jpg';
$target2 = $dir . '/new.jpg';
file_put_contents( $source2, 'new bytes' );
check( true === $replace->invoke( $bulk, $source2, $target2 ), 'replace_file handles a missing target' );
check( 'new bytes' === file_get_contents( $target2 ), 'replace_file creates the target' );

$same = $dir . '/same.jpg';
file_put_contents( $same, 'keep me' );
check( true === $replace->invoke( $bulk, $same, $same ), 'replace_file accepts identical paths' );
check( 'keep me' === file_get_contents( $same ), 'replace_file does not delete an identical path' );

// 3. Backup path lookup.
$GLOBALS['khimg_test_upload_basedir'] = $dir . '/uploads';
mkdir( $GLOBALS['khimg_test_upload_basedir'] . '/2026/11', 0777, true );

$get_backup = new ReflectionMethod( $bulk, 'get_backup_path' );
$get_backup->setAccessible( true );

$relative = '2026/11/photo.jpg.khimg-backup';
$absolute = $GLOBALS['khimg_test_upload_basedir'] . '/' . $relative;
file_put_contents( $absolute, 'backup bytes' );
$GLOBALS['khimg_test_post_meta'] = [ '_khimg_backup_file' => $relative ];

check(
	$absolute === $get_backup->invoke( $bulk, 123, $GLOBALS['khimg_test_upload_basedir'] . '/2026/11/photo.jpg' ),
	'get_backup_path finds a stored relative backup'
);

$GLOBALS['khimg_test_post_meta'] = [];
$legacy = $GLOBALS['khimg_test_upload_basedir'] . '/2026/11/legacy.jpg.khimg-backup';
file_put_contents( $legacy, 'legacy bytes' );

check(
	$legacy === $get_backup->invoke( $bulk, 123, $GLOBALS['khimg_test_upload_basedir'] . '/2026/11/legacy.jpg' ),
	'get_backup_path falls back to the legacy suffix'
);

check(
	'' === $get_backup->invoke( $bulk, 123, $GLOBALS['khimg_test_upload_basedir'] . '/2026/11/missing.jpg' ),
	'get_backup_path returns an empty string when no backup exists'
);

// A legacy path-changing optimization saved image.jpg as image-1.jpg.
$GLOBALS['khimg_test_post_meta'] = [];
$legacy_scaled = $GLOBALS['khimg_test_upload_basedir'] . '/2026/11/image.jpg.khimg-backup';
$legacy_current = $GLOBALS['khimg_test_upload_basedir'] . '/2026/11/image-1.jpg';
file_put_contents( $legacy_scaled, 'legacy scaled bytes' );

check(
	realpath( $legacy_scaled ) === $get_backup->invoke( $bulk, 123, $legacy_current ),
	'get_backup_path strips a trailing -N suffix for legacy backups'
);

// A different attachment still owns the un-suffixed base file and its backup,
// so the -N attachment must not consume that backup.
$GLOBALS['khimg_test_post_meta'] = [];
$other_base    = $GLOBALS['khimg_test_upload_basedir'] . '/2026/11/photo.jpg';
$other_backup  = $other_base . '.khimg-backup';
$other_current = $GLOBALS['khimg_test_upload_basedir'] . '/2026/11/photo-1.jpg';
file_put_contents( $other_base, 'another attachment original' );
file_put_contents( $other_backup, 'another attachment backup' );

check(
	'' === $get_backup->invoke( $bulk, 123, $other_current ),
	'get_backup_path ignores the -N fallback when the base file exists'
);

// The legacy fallback still applies while the base file is gone.
$GLOBALS['khimg_test_post_meta'] = [];
$legacy_base    = $GLOBALS['khimg_test_upload_basedir'] . '/2026/11/legacy.jpg';
$legacy_current = $GLOBALS['khimg_test_upload_basedir'] . '/2026/11/legacy-1.jpg';

check( ! file_exists( $legacy_base ), 'the legacy base file is absent for the fallback test' );
check(
	realpath( $legacy ) === $get_backup->invoke( $bulk, 123, $legacy_current ),
	'get_backup_path returns the legacy backup when the base file is absent'
);

// Stored meta paths must stay inside the uploads directory.
$outside = $dir . '/outside.jpg.khimg-backup';
file_put_contents( $outside, 'outside bytes' );
$GLOBALS['khimg_test_post_meta'] = [ '_khimg_backup_file' => '../outside.jpg.khimg-backup' ];

check(
	'' === $get_backup->invoke( $bulk, 123, $GLOBALS['khimg_test_upload_basedir'] . '/2026/11/missing-traversal.jpg' ),
	'get_backup_path rejects a stored path outside uploads'
);

// The by-reference flag marks backups found through post meta.
$GLOBALS['khimg_test_post_meta'] = [ '_khimg_backup_file' => $relative ];
$from_meta = null;
$backup_args = [ 123, $GLOBALS['khimg_test_upload_basedir'] . '/2026/11/photo.jpg' ];
$backup_args[] = &$from_meta;
check(
	realpath( $absolute ) === $get_backup->invokeArgs( $bulk, $backup_args ),
	'get_backup_path returns the resolved stored backup'
);
check( true === $from_meta, 'get_backup_path reports a meta-backed backup' );

$GLOBALS['khimg_test_post_meta'] = [];
$from_meta = null;
$backup_args = [ 123, $GLOBALS['khimg_test_upload_basedir'] . '/2026/11/legacy.jpg' ];
$backup_args[] = &$from_meta;
check(
	realpath( $legacy ) === $get_backup->invokeArgs( $bulk, $backup_args ),
	'get_backup_path returns the resolved legacy backup'
);
check( false === $from_meta, 'get_backup_path flags a legacy backup as not meta-backed' );

// 4. Stats updates.
$stats_key = KH_Images_Stats::OPTION_KEY;

$GLOBALS['khimg_test_options'][ $stats_key ] = [
	'last_processed_post_id' => 10,
	'media_optimized_num'    => 2,
	'total_original_size'    => 100,
	'total_optimized_size'   => 50,
];

KH_Images_Stats::update_stats_bulk_optimized( 42, 4096, 1024 );
$stats = get_option( $stats_key );

check( 104.0 === (float) $stats['total_original_size'], 'bulk optimize adds original kilobytes' );
check( 51.0 === (float) $stats['total_optimized_size'], 'bulk optimize adds optimized kilobytes' );
check( 3 === (int) $stats['media_optimized_num'], 'bulk optimize increments the media count once' );
check( 42 === (int) $stats['last_processed_post_id'], 'bulk optimize advances last_processed_post_id' );

$GLOBALS['khimg_test_options'][ $stats_key ] = [
	'last_processed_post_id' => 0,
	'media_optimized_num'    => 3,
	'total_original_size'    => 100,
	'total_optimized_size'   => 40,
];

KH_Images_Stats::update_stats_bulk_restored( 77, 8192, 4096 );
$stats = get_option( $stats_key );

check( 96.0 === (float) $stats['total_original_size'], 'restore subtracts the restored size from the original total' );
check( 32.0 === (float) $stats['total_optimized_size'], 'restore subtracts the optimized size from the optimized total' );
check( 2 === (int) $stats['media_optimized_num'], 'restore decrements the media count once' );
check( 77 === (int) $stats['last_processed_post_id'], 'restore advances last_processed_post_id' );

$GLOBALS['khimg_test_options'][ $stats_key ] = [
	'last_processed_post_id' => 0,
	'media_optimized_num'    => 5,
	'total_original_size'    => 10,
	'total_optimized_size'   => 5,
];

KH_Images_Stats::update_stats_bulk_optimized( 9, 2048, 1024, false );
$stats = get_option( $stats_key );

check( 5 === (int) $stats['media_optimized_num'], 'thumbnail-only stats do not increment the media count' );
check( 12.0 === (float) $stats['total_original_size'], 'thumbnail-only stats still add original kilobytes' );
check( 6.0 === (float) $stats['total_optimized_size'], 'thumbnail-only stats still add optimized kilobytes' );

unset( $GLOBALS['khimg_test_options'][ $stats_key ] );
KH_Images_Stats::update_stats_bulk_optimized( 5, 1024, 512 );
$stats = get_option( $stats_key );

check( 1 === (int) $stats['media_optimized_num'], 'bulk optimize starts from zeroed stats when the option is missing' );
check( 1.0 === (float) $stats['total_original_size'], 'bulk optimize records the original size without a rescan' );
check( 0.5 === (float) $stats['total_optimized_size'], 'bulk optimize records the optimized size without a rescan' );
check( 5 === (int) $stats['last_processed_post_id'], 'bulk optimize advances last_processed_post_id from zero' );

// 5. compute_stats counts one media item per attachment and ignores the
// duplicated top-level filesizes when bulk data exists.
$GLOBALS['wpdb']          = new KH_Test_WPDB();
$GLOBALS['wpdb']->results = [
	(object) [
		'post_id'    => 25,
		'meta_value' => [
			'khimg' => [
				'originalFilesize'  => 1000,
				'convertedFilesize' => 500,
				'bulk_optimization' => [
					'full'      => [
						'originalFilesize'  => 1000,
						'convertedFilesize' => 500,
					],
					'thumbnail' => [
						'originalFilesize'  => 200,
						'convertedFilesize' => 100,
					],
				],
			],
		],
	],
];

$compute_stats = new ReflectionMethod( 'KH_Images_Stats', 'compute_stats' );
$compute_stats->setAccessible( true );
$computed = $compute_stats->invoke( null, [
	'last_processed_post_id' => 0,
	'media_optimized_num'    => 0,
	'total_original_size'    => 0,
	'total_optimized_size'   => 0,
] );

check( 1 === (int) $computed['media_optimized_num'], 'compute_stats counts one media item per attachment' );
check( 1200 / 1024 === (float) $computed['total_original_size'], 'compute_stats sums bulk sizes without the top-level duplicate' );
check( 600 / 1024 === (float) $computed['total_optimized_size'], 'compute_stats sums optimized bulk sizes without the top-level duplicate' );
check( 25 === (int) $computed['last_processed_post_id'], 'compute_stats keeps the last_processed_post_id scan behavior' );

// 6. Stats byte formatting guards.
$format_bytes = new ReflectionMethod( 'KH_Images_Stats', 'format_bytes' );
$format_bytes->setAccessible( true );

check( '0 Bytes' === $format_bytes->invoke( null, 0 ), 'format_bytes handles zero' );
check( '0 Bytes' === $format_bytes->invoke( null, -1024 ), 'format_bytes rejects negative totals' );
check( '1 KB' === $format_bytes->invoke( null, 1024 ), 'format_bytes formats kilobytes' );
check( '1 MB' === $format_bytes->invoke( null, 1048576 ), 'format_bytes formats megabytes' );

// 7. KH Offloader compatibility status.
$local_file = $dir . '/compat-local.jpg';
file_put_contents( $local_file, 'local bytes' );

$GLOBALS['khimg_test_post_meta']      = [];
$GLOBALS['khimg_test_attached_file']  = $local_file;
$status = KH_Images_Compat::get_attachment_status( 501 );

check( true === $status['active'], 'compat status reports the offloader as active' );
check( false === $status['offloaded'], 'compat status rejects an attachment without offload meta' );
check( true === $status['local_copy'], 'compat status finds the local file' );
check( false === $status['cloud_only'], 'compat status marks a local attachment as not cloud-only' );
check( '' === $status['local_url'], 'compat status leaves local_url empty without attachment metadata' );
check( '' === $status['local_thumb_url'], 'compat status leaves local_thumb_url empty without attachment metadata' );

$GLOBALS['khimg_test_upload_baseurl']      = 'http://example.test/wp-content/uploads';
$GLOBALS['khimg_test_attachment_metadata'] = [
	'file'  => '2026/11/compat-local.jpg',
	'sizes' => [
		'thumbnail' => [
			'file' => 'compat-local-150x150.jpg',
		],
	],
];

$GLOBALS['khimg_test_post_meta'] = [
	'khs3data_offloaded' => '1',
	'khs3data_path'      => '2026/11/',
];

$status = KH_Images_Compat::get_attachment_status( 502 );

check( true === $status['offloaded'], 'compat status detects offloaded media' );
check( true === $status['local_copy'], 'compat status keeps the local copy flag for offloaded media with a file' );
check( false === $status['cloud_only'], 'compat status does not mark offloaded media with a local file as cloud-only' );
check( '2026/11/' === $status['cloud_path'], 'compat status exposes the cloud path' );
check(
	'http://example.test/wp-content/uploads/2026/11/compat-local.jpg' === $status['local_url'],
	'compat status exposes the local uploads URL for offloaded media'
);
check(
	'http://example.test/wp-content/uploads/2026/11/compat-local-150x150.jpg' === $status['local_thumb_url'],
	'compat status exposes the local thumbnail URL for offloaded media'
);

$GLOBALS['khimg_test_attached_file'] = $dir . '/compat-missing.jpg';
$GLOBALS['khimg_test_post_meta']     = [ 'khs3data_offloaded' => '1' ];

$status = KH_Images_Compat::get_attachment_status( 503 );

check( false === $status['local_copy'], 'compat status reports no local copy when the file is gone' );
check( true === $status['cloud_only'], 'compat status detects cloud-only media' );
check( '' === $status['local_url'], 'compat status leaves local_url empty for cloud-only media' );
check( '' === $status['local_thumb_url'], 'compat status leaves local_thumb_url empty for cloud-only media' );

unset( $GLOBALS['khimg_test_attachment_metadata'] );

// 8. Reoffload result codes.
$GLOBALS['khimg_test_post_meta']     = [];
$GLOBALS['khimg_test_attached_file'] = $local_file;

check(
	'not_offloaded' === KH_Images_Compat::reoffload_attachment( 504 ),
	'reoffload returns not_offloaded for a local attachment'
);

$GLOBALS['khimg_test_post_meta']          = [ 'khs3data_offloaded' => '1' ];
$GLOBALS['khimg_test_reoffload_filter']   = false;

check(
	'skipped' === KH_Images_Compat::reoffload_attachment( 505 ),
	'reoffload returns skipped when the filter disables it'
);

unset( $GLOBALS['khimg_test_reoffload_filter'] );

// 9. Suite status URLs and flags.
$compat = KH_Images_Compat::get_status();

check( true === $compat['offloader']['active'], 'get_status reports the active offloader flag' );
check(
	'http://example.test/wp-admin/admin.php?page=kh-offloader-media' === $compat['offloader']['mediaUrl'],
	'get_status exposes the offloader media URL'
);
check( true === $compat['speed']['active'], 'get_status reports the active speed engine flag' );
check(
	'http://example.test/wp-admin/admin.php?page=kh-speed-engine-dashboard' === $compat['speed']['dashboardUrl'],
	'get_status exposes the speed engine dashboard URL'
);

remove_tree( $dir );

echo "\n{$passed} passed, {$failed} failed\n";
exit( $failed > 0 ? 1 : 0 );
