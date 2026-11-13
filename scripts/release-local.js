/* eslint-disable no-console */
/**
 * Cross-platform local release builder for KH Images Optimizer.
 *
 * Usage:
 *   node scripts/release-local.js --env local|staging|production [options]
 *
 * No external dependencies beyond the packages already used by the build.
 */

const { spawnSync } = require( 'child_process' )
const crypto = require( 'crypto' )
const fs = require( 'fs' )
const path = require( 'path' )

const ROOT = path.resolve( __dirname, '..' )
const PLUGIN_SLUG = 'kh-images-optimizer'
const ENVIRONMENTS = [ 'local', 'staging', 'production' ]
const EXCLUDED_PHP_DIRS = new Set( [
	'.git',
	'build',
	'dist',
	'node_modules',
	'vendor',
] )

const HELP_TEXT = `KH Images Optimizer local release builder

Usage:
  node scripts/release-local.js [options]

Options:
  --env <environment>  Target environment: local, staging, or production.
                       Default: local
  --publish            Create a GitHub release. Production only.
  --skip-tests         Skip the PHP smoke test.
  --skip-lint          Skip JavaScript and CSS linting.
  --notes <text>       Release notes for --publish.
  --help               Show this help.

Examples:
  node scripts/release-local.js --env local
  node scripts/release-local.js --env staging
  node scripts/release-local.js --env production
  node scripts/release-local.js --env production --publish --notes "Bug fixes"

The release version is read from the Version header in kh-images.php.
Publishing refuses to overwrite an existing v<version> release.
`

function printHelp() {
	console.log( HELP_TEXT )
}

function fail( message ) {
	throw new Error( message )
}

function parseArgs( argv ) {
	const options = {
		env: 'local',
		help: false,
		notes: '',
		publish: false,
		skipLint: false,
		skipTests: false,
	}

	for ( let index = 0; index < argv.length; index++ ) {
		const arg = argv[ index ]

		if ( arg === '--help' ) {
			options.help = true
			continue
		}

		if ( arg === '--publish' ) {
			options.publish = true
			continue
		}

		if ( arg === '--skip-tests' ) {
			options.skipTests = true
			continue
		}

		if ( arg === '--skip-lint' ) {
			options.skipLint = true
			continue
		}

		if ( arg === '--env' ) {
			const value = argv[ index + 1 ]
			if ( ! value || value.startsWith( '--' ) ) {
				fail( '--env requires a value: local, staging, or production.' )
			}
			options.env = value
			index++
			continue
		}

		if ( arg.startsWith( '--env=' ) ) {
			options.env = arg.slice( '--env='.length )
			continue
		}

		if ( arg === '--notes' ) {
			const value = argv[ index + 1 ]
			if ( value === undefined || value.startsWith( '--' ) ) {
				fail( '--notes requires a value.' )
			}
			options.notes = value
			index++
			continue
		}

		if ( arg.startsWith( '--notes=' ) ) {
			options.notes = arg.slice( '--notes='.length )
			continue
		}

		fail( `Unknown argument: ${ arg }. Run with --help for usage.` )
	}

	if ( ! ENVIRONMENTS.includes( options.env ) ) {
		fail(
			`Invalid --env value: "${ options.env }". Use local, staging, or production.`
		)
	}

	return options
}

function resolveCommand( command ) {
	if (
		process.platform === 'win32' &&
		( command === 'npm' || command === 'npx' )
	) {
		return `${ command }.cmd`
	}

	return command
}

function spawnCommand( command, args, options = {} ) {
	return spawnSync( resolveCommand( command ), args, {
		cwd: ROOT,
		encoding: 'utf8',
		shell: false,
		stdio: options.capture ? 'pipe' : 'inherit',
	} )
}

function outputOf( result ) {
	return [ result.stdout, result.stderr ]
		.filter( value => typeof value === 'string' && value.trim() !== '' )
		.join( '\n' )
		.trim()
}

function commandError( command, result ) {
	if ( result.error ) {
		if ( result.error.code === 'ENOENT' ) {
			return `Command not found: ${ command }. Make sure it is installed and on your PATH.`
		}
		return `Could not run ${ command }: ${ result.error.message }`
	}

	const output = outputOf( result )
	const detail = output ? `\n${ output }` : ''
	return `Command failed (exit ${ result.status }): ${ command }${ detail }`
}

function run( command, args, options = {} ) {
	const commandLine = `${ command } ${ args.join( ' ' ) }`

	if ( ! options.quiet ) {
		console.log( `\n> ${ options.label || commandLine }` )
	}

	const result = spawnCommand( command, args, options )

	if ( result.error || result.status !== 0 ) {
		fail( commandError( commandLine, result ) )
	}

	if ( options.printOutput ) {
		const output = outputOf( result )
		if ( output ) {
			console.log( output )
		}
	}

	return result
}

function ensureNodeVersion() {
	const major = Number( process.versions.node.split( '.' )[ 0 ] )

	if ( ! Number.isInteger( major ) || major < 18 ) {
		fail(
			`Node.js 18 or newer is required. Found ${ process.version }.`
		)
	}
}

function ensureDependencies() {
	const modulesDir = path.join( ROOT, 'node_modules' )

	if ( ! fs.existsSync( modulesDir ) || ! fs.statSync( modulesDir ).isDirectory() ) {
		fail( 'Dependencies are not installed. Run npm ci first.' )
	}
}

function ensurePhp() {
	const result = spawnCommand( 'php', [ '-v' ], { capture: true } )

	if ( result.error || result.status !== 0 ) {
		fail(
			'PHP is required but was not found. Install PHP and make sure "php" is on your PATH.'
		)
	}
}

function getPluginVersion() {
	const pluginFile = path.join( ROOT, 'kh-images.php' )
	const contents = fs.readFileSync( pluginFile, 'utf8' )
	const match = contents.match( /^\s*\*\s*Version:\s*([^\r\n]+)/m )

	if ( ! match ) {
		fail( 'Could not find the Version header in kh-images.php.' )
	}

	return match[ 1 ].trim()
}

function git( args ) {
	return run( 'git', args, { capture: true, quiet: true } )
}

function getGitInfo() {
	const branch = git( [ 'rev-parse', '--abbrev-ref', 'HEAD' ] ).stdout.trim()
	const commit = git( [ 'rev-parse', '--short', 'HEAD' ] ).stdout.trim()
	const status = git( [
		'status',
		'--porcelain',
		'--untracked-files=normal',
	] ).stdout.trim()

	return {
		branch,
		commit,
		dirty: status !== '',
	}
}

function printHeader( options, version, gitInfo ) {
	const line = '='.repeat( 64 )

	console.log( line )
	console.log( ' KH Images Optimizer - local release builder' )
	console.log( line )
	console.log( ` Environment : ${ options.env }` )
	console.log( ` Version     : ${ version }` )
	console.log( ` Plugin slug : ${ PLUGIN_SLUG }` )
	console.log( ` Branch      : ${ gitInfo.branch }` )
	console.log( ` Commit      : ${ gitInfo.commit }` )
	console.log( line )
}

function checkEnvironment( options, gitInfo ) {
	if ( options.env === 'local' ) {
		if ( gitInfo.dirty ) {
			console.log(
				'\nWARNING: The git working tree is dirty. Continuing because the environment is local.'
			)
		}
		return
	}

	if ( gitInfo.dirty ) {
		fail(
			`The git working tree must be clean for ${ options.env }. Commit or stash your changes first.`
		)
	}

	if ( options.env === 'production' && gitInfo.branch !== 'main' ) {
		fail(
			`Production releases must run from branch "main". Current branch: "${ gitInfo.branch }".`
		)
	}
}

function ensureGhReady() {
	const versionResult = spawnCommand( 'gh', [ '--version' ], {
		capture: true,
	} )

	if ( versionResult.error ) {
		if ( versionResult.error.code === 'ENOENT' ) {
			fail(
				'GitHub CLI (gh) is required for --publish. Install it from https://cli.github.com/ and try again.'
			)
		}
		fail( commandError( 'gh --version', versionResult ) )
	}

	if ( versionResult.status !== 0 ) {
		fail( commandError( 'gh --version', versionResult ) )
	}

	const authResult = spawnCommand( 'gh', [ 'auth', 'status' ], {
		capture: true,
	} )

	if ( authResult.error || authResult.status !== 0 ) {
		fail( 'GitHub CLI is not authenticated. Run "gh auth login" and try again.' )
	}
}

function ensureReleaseDoesNotExist( tag ) {
	const result = spawnCommand( 'gh', [ 'release', 'view', tag ], {
		capture: true,
	} )

	if ( result.error ) {
		fail( commandError( `gh release view ${ tag }`, result ) )
	}

	if ( result.status === 0 ) {
		fail(
			`GitHub release ${ tag } already exists. Refusing to overwrite it. Bump the Version in kh-images.php before publishing again.`
		)
	}

	if ( result.status !== 1 ) {
		fail(
			`Could not check whether release ${ tag } exists (gh exited with ${ result.status }).`
		)
	}
}

function collectPhpFiles( directory, files = [] ) {
	const entries = fs.readdirSync( directory, { withFileTypes: true } )

	for ( const entry of entries ) {
		const fullPath = path.join( directory, entry.name )

		if ( entry.isDirectory() ) {
			if ( ! EXCLUDED_PHP_DIRS.has( entry.name ) ) {
				collectPhpFiles( fullPath, files )
			}
			continue
		}

		if ( entry.isFile() && entry.name.endsWith( '.php' ) ) {
			files.push( fullPath )
		}
	}

	return files
}

function lintPhpFiles() {
	console.log( '\n> Checking PHP syntax...' )

	const files = collectPhpFiles( ROOT )

	for ( const file of files ) {
		const result = spawnCommand( 'php', [ '-l', file ], { capture: true } )

		if ( result.error || result.status !== 0 ) {
			const relativePath = path.relative( ROOT, file )
			const output = outputOf( result )
			if ( output ) {
				console.error( output )
			}
			fail( `PHP syntax check failed: ${ relativePath }` )
		}
	}

	console.log( `PHP syntax OK (${ files.length } files).` )
}

function runChecksAndBuild( options ) {
	if ( options.skipLint ) {
		console.log( '\nSkipping lint (--skip-lint).' )
	} else {
		run( 'npm', [ 'run', 'lint' ], {
			label: 'Linting JavaScript and CSS (npm run lint)',
		} )
	}

	if ( options.skipTests ) {
		console.log( '\nSkipping PHP smoke test (--skip-tests).' )
	} else {
		run( 'php', [ 'tests/desloppify-smoke.php' ], {
			label: 'Running PHP smoke test (php tests/desloppify-smoke.php)',
		} )
	}

	lintPhpFiles()

	run( 'npx', [ 'wp-scripts', 'build' ], {
		label: 'Building assets (npx wp-scripts build)',
	} )

	run( process.execPath, [ path.join( __dirname, 'package.js' ) ], {
		label: 'Packaging plugin (node scripts/package.js)',
	} )
}

function getZipInfo( version ) {
	const fileName = `${ PLUGIN_SLUG }-${ version }.zip`
	const zipPath = path.join( ROOT, 'dist', fileName )

	if (
		! fs.existsSync( zipPath ) ||
		! fs.statSync( zipPath ).isFile() ||
		fs.statSync( zipPath ).size === 0
	) {
		fail( `Expected release zip was not created or is empty: dist/${ fileName }` )
	}

	const size = fs.statSync( zipPath ).size
	const hash = crypto
		.createHash( 'sha256' )
		.update( fs.readFileSync( zipPath ) )
		.digest( 'hex' )

	return {
		fileName,
		hash,
		size,
		zipPath,
	}
}

function printBuildSummary( zipInfo ) {
	console.log( '\nBuild complete.' )
	console.log( `Zip:    dist/${ zipInfo.fileName }` )
	console.log( `Size:   ${ ( zipInfo.size / 1024 / 1024 ).toFixed( 2 ) } MB` )
	console.log( `SHA256: ${ zipInfo.hash }` )
}

function publishRelease( version, zipInfo, notes ) {
	const tag = `v${ version }`
	const title = `KH Images Optimizer ${ version }`
	const releaseNotes = notes.trim() || title

	console.log( `\n> Creating GitHub release ${ tag }...` )

	const result = spawnCommand(
		'gh',
		[
			'release',
			'create',
			tag,
			zipInfo.zipPath,
			'--target',
			'main',
			'--title',
			title,
			'--notes',
			releaseNotes,
		],
		{ capture: true }
	)

	if ( result.error || result.status !== 0 ) {
		fail( commandError( `gh release create ${ tag }`, result ) )
	}

	const urls = ( result.stdout || '' ).match( /https?:\/\/\S+/g )
	const releaseUrl = urls ? urls[ urls.length - 1 ] : ''

	if ( releaseUrl ) {
		console.log( `Release URL: ${ releaseUrl }` )
	} else {
		console.log( `Release ${ tag } created. Check GitHub for the release URL.` )
	}
}

function main() {
	const options = parseArgs( process.argv.slice( 2 ) )

	if ( options.help ) {
		printHelp()
		return 0
	}

	if ( options.publish && options.env !== 'production' ) {
		fail( '--publish is only valid with --env production.' )
	}

	ensureNodeVersion()
	ensureDependencies()
	ensurePhp()

	const version = getPluginVersion()
	const gitInfo = getGitInfo()

	printHeader( options, version, gitInfo )
	checkEnvironment( options, gitInfo )

	const tag = `v${ version }`

	if ( options.publish ) {
		ensureGhReady()
		ensureReleaseDoesNotExist( tag )
	}

	runChecksAndBuild( options )

	const zipInfo = getZipInfo( version )
	printBuildSummary( zipInfo )

	if ( options.publish ) {
		publishRelease( version, zipInfo, options.notes )
	} else {
		console.log(
			'\nBuilt locally. Re-run with --publish to create the GitHub release.'
		)
	}

	return 0
}

try {
	process.exitCode = main()
} catch ( error ) {
	console.error( `\nERROR: ${ error.message }` )
	process.exitCode = 1
}
