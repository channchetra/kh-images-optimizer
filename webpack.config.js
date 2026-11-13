const defaultConfig = require( '@wordpress/scripts/config/webpack.config' )
const path = require( 'path' )

module.exports = {
	...defaultConfig,
	entry: {
		// Main KH Images script.
		'admin/index': path.resolve( __dirname, './src/admin/js/index.js' ),
		'admin/index-styles': path.resolve( __dirname, './src/admin/css/index.css' ),

		// Admin settings page script.
		'admin/admin-page': path.resolve( __dirname, './src/admin/js/page/index.js' ),
		'admin/admin-page-styles': path.resolve( __dirname, './src/admin/css/admin-page.css' ),
	},
	resolve: {
		...defaultConfig.resolve,
		alias: {
			...defaultConfig.resolve?.alias,
			'~khimg': require( 'path' ).resolve( __dirname, 'src' ),
		},
	},
	output: {
		...defaultConfig.output,
		chunkFilename: 'chunks/[name]-[chunkhash:8].js',
	},
}
