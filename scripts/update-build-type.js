#!/usr/bin/env node

/* eslint-disable no-console */
const fs = require( 'fs' )
const path = require( 'path' )

/**
 * Updates the KHIMG_BUILD constant in kh-images.php
 *
 * @param {string} buildType - 'free' or 'premium'
 */
function updateBuildType( buildType ) {
	const actualPluginPath = path.resolve( __dirname, '../kh-images.php' )

	if ( ! fs.existsSync( actualPluginPath ) ) {
		console.warn( `⚠️  ${ actualPluginPath } not found, skipping build type update` )
		return false
	}

	let content = fs.readFileSync( actualPluginPath, 'utf8' )
	const originalContent = content
	content = content.replace(
		/defined\(\s*'KHIMG_BUILD'\s*\)\s*\|\|\s*define\(\s*'KHIMG_BUILD'\s*,\s*'[^']*'\s*\);/,
		`defined( 'KHIMG_BUILD' ) || define( 'KHIMG_BUILD', '${ buildType }' );`
	)

	if ( content !== originalContent ) {
		fs.writeFileSync( actualPluginPath, content )
		console.log( `✅ Updated KHIMG_BUILD to '${ buildType }' in ${ actualPluginPath }` )
		return true
	}
	console.log( `ℹ️  KHIMG_BUILD already set to '${ buildType }' in ${ actualPluginPath }` )
	return false
}

// If this script is run directly (not imported), use command line arguments
if ( require.main === module ) {
	const buildType = process.argv[ 2 ]

	if ( ! buildType || ! [ 'free', 'premium' ].includes( buildType ) ) {
		console.error( 'Usage: node update-build-type.js <free|premium> [plugin-path]' )
		process.exit( 1 )
	}

	updateBuildType( buildType )
}

module.exports = { updateBuildType }
