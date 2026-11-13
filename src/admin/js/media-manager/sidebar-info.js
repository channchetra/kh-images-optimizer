import { domReady } from '~khimg/shared/dom-ready'
import { getCachedMetadata } from '~khimg/shared/metadata-saver'
import { escape } from '~khimg/shared/util'
import { __, sprintf } from '@wordpress/i18n'
import { applyFilters } from '@wordpress/hooks'

/**
 * Format bytes into human readable format (KB, MB, etc.)
 * @param {number}  bytes      - The number of bytes
 * @param {number}  decimals   - Number of decimal places (default: 2)
 * @param {boolean} invertSign - Invert the sign of the filesize (default: true)
 * @return {string} Formatted filesize
 */
function formatFilesize( bytes, decimals = 2, invertSign = false ) {
	if ( bytes === 0 ) {
		return '0 Bytes'
	}

	const k = 1024
	const dm = decimals < 0 ? 0 : decimals
	const sizes = [ 'Bytes', 'KB', 'MB', 'GB' ]

	const absBytes = Math.abs( bytes )
	const i = Math.floor( Math.log( absBytes ) / Math.log( k ) )
	const value = parseFloat( ( absBytes / Math.pow( k, i ) ).toFixed( dm ) )
	let sign = bytes < 0 ? '-' : ''
	if ( invertSign ) {
		sign = sign === '-' ? '' : '-'
	}

	return sign + value + ' ' + sizes[ i ]
}

function convertMimetypeToFormat( mimetype ) {
	if ( ! mimetype ) {
		return ''
	}

	const parts = mimetype.split( '/' )
	const format = parts[ 1 ] || parts[ 0 ] || ''
	if ( format === 'webp' ) {
		return 'WebP'
	}

	return format.charAt( 0 ).toUpperCase() + format.slice( 1 )
}

function getMediaTypeLabel( mimetype ) {
	if ( ! mimetype ) {
		return 'Media'
	}

	const [ category = 'media' ] = mimetype.split( '/' )
	switch ( category.toLowerCase() ) {
		case 'image':
			return 'Image'
		case 'video':
			return 'Video'
		case 'audio':
			return 'Audio'
		default:
			return 'Media'
	}
}

function injectKhimgMetadata( {
	model,
	container,
} ) {
	if ( ! model || ! container ) {
		return
	}

	// Prevent duplicate inserts
	if ( container.querySelector( '.khimg-media-manager-metadata' ) ) {
		return
	}

	let customMetadata = model.get( 'khimg' ) || model.get( 'cimo' ) || null

	if ( ! customMetadata || Object.keys( customMetadata ).length === 0 ) {
		customMetadata = getCachedMetadata(
			model.get( 'originalImageName' ) || model.get( 'filename' )
		)
	}

	if ( ! customMetadata ) {
		return
	}

	// If the image is not optimized, and there is no bulk optimization, return
	if ( typeof customMetadata.compressionSavings === 'undefined' && typeof customMetadata.bulk_optimization === 'undefined' ) {
		return
	}
	if ( typeof customMetadata.compressionSavings === 'undefined' && Array.isArray( customMetadata.bulk_optimization ) && customMetadata.bulk_optimization.length === 0 ) {
		return
	}

	let originalFilesize = parseInt( customMetadata.originalFilesize || 0 )
	let convertedFilesize = parseInt( customMetadata.convertedFilesize || 0 )

	const isBulkOptimized = customMetadata.bulk_optimization &&
		typeof customMetadata.bulk_optimization === 'object' &&
		! Array.isArray( customMetadata.bulk_optimization ) &&
		Object.keys( customMetadata.bulk_optimization ).length > 0

	// Bulk optimization keys are the sizes, so we need to sum the original filesizes of the bulk optimization
	if ( isBulkOptimized ) {
		for ( const size in customMetadata.bulk_optimization ) {
			originalFilesize += parseInt( customMetadata.bulk_optimization[ size ].originalFilesize || 0 )
			convertedFilesize += parseInt( customMetadata.bulk_optimization[ size ].convertedFilesize || 0 )
		}
	}

	const customContent = document.createElement( 'div' )
	customContent.className = 'khimg-media-manager-metadata'

	const convertedFormatRaw = customMetadata.convertedFormat || model.get( 'mime' ) || ''
	const mediaTypeLabel = getMediaTypeLabel( convertedFormatRaw )
	const isImageMedia = typeof convertedFormatRaw === 'string' && convertedFormatRaw.startsWith( 'image/' )

	let html = `
		<div class="khimg-media-manager-metadata-title-container">
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 672 672" height="20" width="20">
				<path d="M132.5 132.5C182.4 82.5 253 56 336 56C419 56 489.6 82.5 539.5 132.5C589.4 182.5 616 253 616 336C616 419 589.5 489.6 539.5 539.5C489.5 589.4 419 616 336 616C253 616 182.4 589.5 132.5 539.5C82.6 489.5 56 419 56 336C56 253 82.5 182.4 132.5 132.5z"/>
			</svg>
			<h3 class="khimg-media-manager-metadata-title">
				${ escape( sprintf( __( '%s Optimized by KH Images', 'kh-images-optimizer' ), mediaTypeLabel ) ) }
			</h3>
		</div>
		<ul>
	`

	const optimizationSavings = customMetadata.compressionSavings
		? ( 100 - ( customMetadata.compressionSavings * 100 ) ).toFixed( 2 )
		: ( 100 * ( originalFilesize - convertedFilesize ) / originalFilesize ).toFixed( 2 )

	// If optimizationSavings is not a valid number or is negative, do not display it
	if (
		optimizationSavings === 'NaN' ||
		! Number.isFinite( Number( optimizationSavings ) ) ||
		Number( optimizationSavings ) < 0
	) {
		return
	}

	const kbSaved = formatFilesize(
		originalFilesize - convertedFilesize,
		1,
		true
	)

	const optimizationSavingsClass =
		optimizationSavings > 0
			? 'khimg-optimization-savings-up'
			: 'khimg-optimization-savings-down'

	const arrow = convertedFilesize < originalFilesize ? '↓' : ( convertedFilesize > originalFilesize ? '↑' : '' )

	const canManageOptions =
		typeof window !== 'undefined' && Boolean( window.khimgSettings?.canManageOptions )

	const settingsUrl =
		canManageOptions &&
		typeof window !== 'undefined' &&
		window.khimgSettings?.settingsUrl
			? String( window.khimgSettings.settingsUrl )
			: ''

	const statsHintSvg = '<svg xmlns="http://www.w3.org/2000/svg" draggable="false" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chart-no-axes-column-icon lucide-chart-no-axes-column"><path d="M5 21v-6"/><path d="M12 21V3"/><path d="M19 21V9"/></svg>'

	const statsHintHtml = settingsUrl
		? `<a class="khimg-media-stats-hint" href="${ escape( settingsUrl ) }" title="${ escape( __( 'View site-wide stats in KH Images settings', 'kh-images-optimizer' ) ) }" aria-label="${ escape( __( 'View site-wide stats in KH Images settings', 'kh-images-optimizer' ) ) }" target="_blank" rel="noopener noreferrer">${ statsHintSvg }</a>`
		: ''

	html += `
		<li class="khimg-compression-savings ${ escape( optimizationSavingsClass ) }">
			<span class="khimg-compression-savings-headline">
				Saved ${ escape( optimizationSavings ) }%${ statsHintHtml }
			</span>
			<span class="khimg-compression-savings-bytes">(${ escape( kbSaved ) })</span>
		</li>
	`

	html += `
		<li class="khimg-filesize-original">
			Original: <span class="khimg-value">${ escape( formatFilesize( originalFilesize ) ) }</span>
		</li>
		<li class="khimg-filesize-optimized">
			Optimized: <span class="khimg-value">${ escape( arrow ) } ${ escape( formatFilesize( convertedFilesize ) ) }</span>
		</li>
	`

	if ( isBulkOptimized ) {
		html += `
			<li class="khimg-bulk-optimization-number">
				🏞️ <span class="khimg-value">${ escape( Object.keys( customMetadata.bulk_optimization ).length.toString() ) }</span> ${ escape( isImageMedia ? 'thumbnail(s) processed' : 'file(s) processed' ) }
			</li>
			<li class="khimg-bulk-optimization-number">
				⚡️ Bulk optimized
			</li>
		`
	}

	if ( ! isBulkOptimized ) {
		const formatLabel = convertMimetypeToFormat( customMetadata.convertedFormat )
		const convertedFormatSpan = `<span class="khimg-value">${ escape( formatLabel ) }</span>`
		const convertedLineText = customMetadata.smartOptimized
			? sprintf(
				/* translators: %s: image format name (e.g. WebP) */
				__( 'Smart optimized to %s', 'kh-images-optimizer' ),
				convertedFormatSpan
			)
			: sprintf(
				/* translators: %s: image format name (e.g. WebP) */
				__( 'Converted to %s', 'kh-images-optimizer' ),
				convertedFormatSpan
			)

		html += `
			<li class="khimg-converted">
				🏞️ ${ convertedLineText }
			</li>
		`

		let conversionTimeDisplay = 'N/A'
		if ( customMetadata.conversionTime ) {
			const timeMs = parseFloat( customMetadata.conversionTime )
			conversionTimeDisplay =
				timeMs < 1000
					? `${ timeMs.toFixed( 0 ) } ms`
					: timeMs < 60000
						? `${ ( timeMs / 1000 ).toFixed( 1 ) } sec`
						: `${ ( timeMs / 60000 ).toFixed( 1 ) } min`
		}

		html += `
			<li class="khimg-time">
				⚡️ Done in <span class="khimg-value">${ escape( conversionTimeDisplay ) }</span>
			</li>
		`
	}

	html += '</ul>'

	customContent.innerHTML = html
	container.appendChild( customContent )
}

let sidebarInitialized = false

const patchSidebarInfo = () => {
	// Editor media library modal (Attachment.Details)
	wp.media.view.Attachment.Details =
		wp.media.view.Attachment.Details.extend( {
			template( view ) {
				const html = wp.media.template( 'attachment-details' )( view )
				const dom = document.createElement( 'div' )
				dom.innerHTML = html

				const container = dom.querySelector( '.attachment-info' )

				injectKhimgMetadata( {
					model: view.model,
					container,
				} )

				return dom.innerHTML
			},
		} )

	// Admin Media in Grid View (Attachment.Details.TwoColumn)
	if ( wp.media.view.Attachment.Details.TwoColumn ) {
		const TwoColumn = wp.media.view.Attachment.Details.TwoColumn

		wp.media.view.Attachment.Details.TwoColumn =
			TwoColumn.extend( {
				render() {
					TwoColumn.prototype.render.apply( this, arguments )

					const container = this.el.querySelector(
						'.attachment-info > .details'
					)

					injectKhimgMetadata( {
						model: this.model,
						container,
					} )

					return this
				},
			} )
	}
}

const initSidebarInfo = ( attempt = 0 ) => {
	if ( sidebarInitialized ) {
		return
	}

	if ( ! applyFilters( 'khimg.mediaManager.sidebarInfo.doRender', true ) ) {
		return
	}

	// The media library may be lazy-loaded after DOM ready.
	if (
		typeof wp === 'undefined' ||
		! wp.media ||
		! wp.media.view ||
		! wp.media.view.Attachment ||
		! wp.media.view.Attachment.Details
	) {
		if ( attempt < 20 ) {
			setTimeout( () => initSidebarInfo( attempt + 1 ), 250 )
		}
		return
	}

	sidebarInitialized = true
	patchSidebarInfo()
}

domReady( () => initSidebarInfo() )
