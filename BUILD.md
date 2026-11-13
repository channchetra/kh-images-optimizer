# Build and Packaging

This document explains how to build and package the KH Images Optimizer plugin for production use.

## Local release script

`scripts/release-local.js` builds a release zip for local, staging, and production use. It runs on Linux, macOS, and Windows with Node.js 18+ and does not require bash.

| Environment | Requirements |
| --- | --- |
| `local` | A dirty working tree is allowed, but a warning is printed. |
| `staging` | The git working tree must be clean (ignored files do not count). |
| `production` | The git working tree must be clean and the current branch must be `main`. |

```bash
# Build a local release
npm run release:local

# Build a staging release
npm run release:staging

# Build a production release without publishing
npm run release:production

# Build and publish a production release
npm run release:production -- --publish
```

The script lints JavaScript and CSS, runs the PHP smoke test, checks every PHP file with `php -l`, builds the assets, and packages the plugin. Use `--skip-lint` or `--skip-tests` to skip those steps. Use `--notes "text"` to provide release notes when publishing.

`--publish` is only valid with `--env production`. Before publishing, the script checks for an existing `v<version>` release and refuses to overwrite it. Publishing creates the GitHub release and its tag through `gh release create`; it does not create a separate git tag.

The zip is written to `dist/kh-images-optimizer-<version>.zip`, and its SHA256 is printed after a successful build. The release zip does not include the `scripts/` directory or other development-only files.

> **Note:** `v1.5.0` already exists. Publishing another release requires bumping the `Version` header in `kh-images.php` first.

## Prerequisites

- Node.js 18 or higher
- npm
- PHP 8.0 or higher (for php -l and the smoke test in the local release script)

## Available Scripts

### Development

```bash
# Start development mode with hot reloading
npm run start

# Build for development AND create production package
npm run build

# Lint JavaScript and CSS
npm run lint
npm run lint:js
npm run lint:css

# Format code
npm run format
```

### Production Packaging

```bash
# Create production-ready plugin package (automatically runs after build)
npm run build

# Or run packaging separately
npm run package
```

The `build` script now automatically:

1. Runs the build process to compile JavaScript and CSS
2. Creates a production package with only necessary files
3. Excludes source JavaScript, CSS, and development files
4. Includes compiled/built JavaScript and CSS files
5. Adds security `index.php` files to all directories
6. Creates a zip file in the `dist/` directory
7. Cleans up temporary build files

## Package Contents

The final package includes:

- **Main plugin files**: `kh-images.php`, `composer.json`, `readme.txt`, `index.php`
- **Built assets**: Compiled JavaScript, CSS, and asset files from the build process
- **PHP source code**: All PHP classes and functionality
- **Security files**: `index.php` files in every directory to prevent directory browsing

## Excluded Files

The following files are excluded from the production package:

- Source JavaScript files (`.js`) from `src/` directory
- Source CSS files (`.css`) from `src/` directory
- Source maps (`.map`)
- Markdown files (`.md`)
- Development configuration files
- Node.js dependencies
- Source build artifacts

## Output

The package script creates:

- **Location**: `dist/kh-images-optimizer-{version}.zip`
- **Format**: Standard WordPress plugin zip file
- **Size**: Optimized for production use (typically about 0.12 MB including built assets)

## Security Features

Every directory in the package includes an `index.php` file with the content:

```php
<?php
	// Silence is golden.
	// Hide file structure from users on unprotected servers.
```

This prevents users from browsing directory contents on servers without proper protection.

## Build Process

The packaging process:

1. **Build**: Runs `npm run build` to compile JavaScript and CSS
2. **Copy**: Copies main plugin files and PHP source code
3. **Include Built Files**: Copies the compiled assets from the `build/` directory
4. **Security**: Adds `index.php` files to all directories
5. **Package**: Creates a zip file with the final structure
6. **Cleanup**: Removes temporary `build-plugin/` directory

## Usage

1. Run `npm run package` to create the production package
2. Upload the generated zip file to your WordPress site
3. Activate the plugin through the WordPress admin

## Troubleshooting

If you encounter issues:

1. Ensure all dependencies are installed: `npm install`
2. Check that the build process completes successfully
3. Verify the `dist/` directory contains the zip file
4. Check the console output for any error messages
5. Clean up any leftover build directories: `rm -rf build build-plugin dist`
