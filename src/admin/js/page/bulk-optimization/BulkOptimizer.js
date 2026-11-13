/**
 * Library view: browse, search and bulk optimize existing media.
 */

import {
	useCallback, useEffect, useRef, useState,
} from '@wordpress/element'
import {
	Button,
	Spinner,
	// eslint-disable-next-line @wordpress/no-unsafe-wp-apis
	__experimentalToggleGroupControl as ToggleGroupControl,
	// eslint-disable-next-line @wordpress/no-unsafe-wp-apis
	__experimentalToggleGroupControlOption as ToggleGroupControlOption,
} from '@wordpress/components'
import apiFetch from '@wordpress/api-fetch'
import {
	__, _n, sprintf,
} from '@wordpress/i18n'
import {
	AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Cloud,
	Download, Image, RotateCcw, Search, X, Zap,
} from '../components/icons'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 300
const FILTERS = [
	{ label: __( 'All', 'kh-images-optimizer' ), value: 'all' },
	{ label: __( 'Unoptimized', 'kh-images-optimizer' ), value: 'unoptimized' },
	{ label: __( 'Optimized', 'kh-images-optimizer' ), value: 'optimized' },
]

const getRestUrl = () => window.khimgSettings?.restUrl || '/wp-json/khimg/v1/'

const getTotalLabel = total => sprintf(
	_n( '%d image', '%d images', total, 'kh-images-optimizer' ),
	total
)

const hasBulkOptimization = meta => {
	const bulk = meta?.bulk_optimization
	if ( Array.isArray( bulk ) ) {
		return bulk.length > 0
	}

	return !! ( bulk && typeof bulk === 'object' && Object.keys( bulk ).length > 0 )
}

const getSavingsPercent = meta => {
	const ratio = Number( meta?.compressionSavings )
	if ( Number.isFinite( ratio ) && ratio > 0 && ratio <= 1 ) {
		const percent = Math.round( ( 1 - ratio ) * 100 )
		if ( percent > 0 ) {
			return percent
		}
	}

	const bulk = meta?.bulk_optimization
	if ( ! bulk || typeof bulk !== 'object' || Array.isArray( bulk ) ) {
		return null
	}

	let converted = 0
	let original = 0
	Object.values( bulk ).forEach( entry => {
		original += Number( entry?.originalFilesize ) || 0
		converted += Number( entry?.convertedFilesize ) || 0
	} )

	if ( original <= 0 || converted <= 0 ) {
		return null
	}

	const percent = Math.round( ( 1 - ( converted / original ) ) * 100 )
	return percent > 0 ? percent : null
}

const getAttachmentInfo = attachment => {
	const meta = attachment.khimg || attachment.cimo || {}
	const canRestore = hasBulkOptimization( meta )
	const hasCompressionSavings = meta.compressionSavings !== undefined &&
		meta.compressionSavings !== null &&
		meta.compressionSavings !== ''
	const cloud = attachment.khimg_compat || {}
	const cloudOnly = Boolean( cloud.cloud_only )
	const cloudLocal = Boolean( cloud.offloaded ) &&
		Boolean( cloud.local_copy ) &&
		! cloudOnly
	const localUrl = cloud.local_url || ''
	const localThumbUrl = cloud.local_thumb_url || ''
	const sizes = attachment.media_details?.sizes || {}
	const thumbnailUrl = localThumbUrl ||
		sizes.thumbnail?.source_url ||
		sizes.medium?.source_url ||
		localUrl ||
		attachment.source_url ||
		''
	const mime = meta.convertedFormat || attachment.mime_type || ''
	const formatLabel = mime.includes( '/' )
		? mime.split( '/' ).pop().split( '+' )[ 0 ].toUpperCase()
		: mime.toUpperCase()
	const fileSize = Number( attachment.media_details?.filesize ) ||
		Number( meta.convertedFilesize ) ||
		0

	return {
		canRestore,
		cloudLocal,
		cloudOnly,
		fileSize,
		formatLabel,
		height: attachment.media_details?.height,
		isOptimized: canRestore || hasCompressionSavings,
		localThumbUrl,
		localUrl,
		savingsPercent: getSavingsPercent( meta ),
		thumbnailUrl,
		width: attachment.media_details?.width,
	}
}

const getFileMeta = info => {
	const dimensions = info.width && info.height
		? `${ info.width }×${ info.height }`
		: ''

	return [ dimensions, info.formatLabel ].filter( Boolean ).join( ' · ' )
}

const getStatusLabel = info => {
	if ( info.canRestore ) {
		return info.savingsPercent !== null
			? sprintf(
				/* translators: %d: percentage of storage saved. */
				__( 'Optimized %d%%', 'kh-images-optimizer' ),
				info.savingsPercent
			)
			: __( 'Optimized', 'kh-images-optimizer' )
	}

	return info.isOptimized
		? __( 'Optimized on upload', 'kh-images-optimizer' )
		: __( 'Not optimized', 'kh-images-optimizer' )
}

const formatBytes = ( bytes, decimals = 1 ) => {
	const value = Number( bytes )
	if ( ! Number.isFinite( value ) || value < 0 ) {
		return '—'
	}
	if ( value === 0 ) {
		return '0 B'
	}

	const units = [ 'B', 'KB', 'MB', 'GB', 'TB' ]
	const index = Math.max( 0, Math.min(
		Math.floor( Math.log( value ) / Math.log( 1024 ) ),
		units.length - 1
	) )

	return `${ parseFloat( ( value / ( 1024 ** index ) ).toFixed( decimals ) ) } ${ units[ index ] }`
}

const downloadAndOptimize = async attachment => {
	const compat = attachment.khimg_compat || {}
	const url = compat.local_url ||
		attachment.source_url ||
		attachment.media_details?.sizes?.full?.source_url
	if ( ! url ) {
		return { skipped: true, reason: __( 'No local or source URL.', 'kh-images-optimizer' ) }
	}

	try {
		const response = await fetch( url )
		if ( ! response.ok ) {
			throw new Error( sprintf(
				/* translators: %d: HTTP status code. */
				__( 'Could not download the image (%d).', 'kh-images-optimizer' ),
				response.status
			) )
		}

		const blob = await response.blob()
		const file = new File(
			[ blob ],
			attachment.title?.rendered || `attachment-${ attachment.id }`,
			{ type: blob.type || attachment.mime_type || 'image/jpeg' }
		)

		const { getFileConverter } = await import( '~khimg/shared/converters' )
		const converter = getFileConverter( file )

		if ( ! converter || typeof converter.optimize !== 'function' ) {
			return {
				reason: __( 'No converter is available for this image type.', 'kh-images-optimizer' ),
				skipped: true,
			}
		}

		// Keep existing attachment URLs stable: bulk optimization writes
		// back into the original file path, so the format must match it.
		if ( converter.options && file.type ) {
			converter.options.format = file.type
		}

		const result = await converter.optimize()

		if ( result.error || ! result.file ) {
			return {
				reason: result.error || __( 'The image could not be optimized.', 'kh-images-optimizer' ),
				skipped: true,
			}
		}

		if ( result.file.size >= file.size ) {
			return { reason: __( 'No size reduction.', 'kh-images-optimizer' ), skipped: true }
		}

		return {
			file: result.file,
			metadata: result.metadata,
			originalSize: file.size,
		}
	} catch ( error ) {
		return {
			reason: error?.message || __( 'Could not optimize the image.', 'kh-images-optimizer' ),
			skipped: true,
		}
	}
}

const uploadOptimized = async ( attachmentId, optimizedFile, metadata ) => {
	const formData = new FormData()
	formData.append( 'file', optimizedFile, optimizedFile.name )
	if ( metadata ) {
		formData.append( 'metadata', JSON.stringify( metadata ) )
	}
	formData.append( 'size_key', 'full' )

	const response = await fetch(
		`${ getRestUrl() }bulk-optimize/${ attachmentId }`,
		{
			body: formData,
			credentials: 'same-origin',
			headers: { 'X-WP-Nonce': window.khimgSettings?.nonce || '' },
			method: 'POST',
		}
	)

	if ( ! response.ok ) {
		const errorBody = await response.json().catch( () => null )
		throw new Error( errorBody?.message || sprintf(
			/* translators: %d: HTTP status code. */
			__( 'Upload failed (%d).', 'kh-images-optimizer' ),
			response.status
		) )
	}

	return await response.json()
}

const restoreAttachment = async attachmentId => {
	const response = await fetch(
		`${ getRestUrl() }bulk-restore/${ attachmentId }`,
		{
			credentials: 'same-origin',
			headers: {
				'Content-Type': 'application/json',
				'X-WP-Nonce': window.khimgSettings?.nonce || '',
			},
			method: 'POST',
		}
	)

	if ( ! response.ok ) {
		const errorBody = await response.json().catch( () => null )
		throw new Error( errorBody?.message || sprintf(
			/* translators: %d: HTTP status code. */
			__( 'Restore failed (%d).', 'kh-images-optimizer' ),
			response.status
		) )
	}

	return await response.json()
}

const processTargets = async ( targets, isCancelled, onProgress ) => {
	const counts = {
		cloudFailed: 0,
		cloudSkipped: 0,
		failed: 0,
		optimized: 0,
		skipped: 0,
	}
	const reasons = {}
	let processed = 0

	for ( let index = 0; index < targets.length; index += 1 ) {
		if ( isCancelled() ) {
			break
		}

		const attachment = targets[ index ]
		const title = attachment.title?.rendered || `#${ attachment.id }`
		onProgress( index + 1, targets.length, title )

		try {
			const optimized = await downloadAndOptimize( attachment )
			if ( optimized.skipped || ! optimized.file ) {
				counts.skipped += 1
				const reason = optimized.reason || __( 'Skipped without a reason.', 'kh-images-optimizer' )
				reasons[ reason ] = ( reasons[ reason ] || 0 ) + 1
			} else {
				const uploaded = await uploadOptimized(
					attachment.id,
					optimized.file,
					optimized.metadata
				)
				counts.optimized += 1

				if ( uploaded?.cloud_sync === 'failed' ) {
					counts.cloudFailed += 1
				} else if ( uploaded?.cloud_sync === 'skipped' || uploaded?.cloud_sync === 'unavailable' ) {
					counts.cloudSkipped += 1
				}
			}
		} catch ( error ) {
			counts.failed += 1
		}

		processed += 1
	}

	return {
		cancelled: isCancelled() && processed < targets.length,
		counts,
		processed,
		reasons,
	}
}

const getCloudSyncNotice = status => {
	if ( status === 'failed' ) {
		return {
			message: __(
				'Image restored locally, but cloud sync failed. Re-upload it from KH Offloader.',
				'kh-images-optimizer'
			),
			tone: 'warning',
		}
	}

	if ( status === 'skipped' || status === 'unavailable' ) {
		return {
			message: __(
				'Image restored locally, but cloud sync was skipped.',
				'kh-images-optimizer'
			),
			tone: 'warning',
		}
	}

	return {
		message: __( 'Image restored.', 'kh-images-optimizer' ),
		tone: 'success',
	}
}

const MAX_REASON_LENGTH = 96

const truncateReason = reason => {
	const text = String( reason || '' ).trim().replace( /\s+/g, ' ' )
	if ( text.length <= MAX_REASON_LENGTH ) {
		return text
	}

	return `${ text.slice( 0, MAX_REASON_LENGTH - 1 ).trimEnd() }…`
}

const getTopReasons = ( reasons, limit = 3 ) => Object.entries( reasons || {} )
	.map( ( [ reason, count ] ) => ( {
		count: Number( count ) || 0,
		reason,
	} ) )
	.filter( ( { count, reason } ) => count > 0 && reason )
	.sort( ( a, b ) => b.count - a.count )
	.slice( 0, limit )

const getReasonsSummary = reasons => getTopReasons( reasons )
	.map( ( { count, reason } ) => sprintf(
		/* translators: 1: reason text, 2: number of images skipped for that reason. */
		__( '%1$s (%2$d)', 'kh-images-optimizer' ),
		truncateReason( reason ),
		count
	) )
	.join( ', ' )

const getBatchNotice = result => {
	if ( result.cancelled ) {
		return {
			message: sprintf(
				/* translators: 1: number of processed images, 2: total images. */
				__( 'Cancelled after %1$d of %2$d.', 'kh-images-optimizer' ),
				result.processed,
				result.total
			),
			tone: 'warning',
		}
	}

	const parts = [
		sprintf(
			/* translators: %d: number of optimized images. */
			__( '%d optimized', 'kh-images-optimizer' ),
			result.optimized
		),
	]

	if ( result.skipped > 0 ) {
		parts.push( sprintf(
			/* translators: %d: number of skipped images. */
			__( '%d skipped', 'kh-images-optimizer' ),
			result.skipped
		) )

		const reasonsSummary = getReasonsSummary( result.reasons )
		if ( reasonsSummary ) {
			parts.push( sprintf(
				/* translators: %s: comma separated skip reasons. */
				__( 'top skip reasons: %s', 'kh-images-optimizer' ),
				reasonsSummary
			) )
		}
	}
	if ( result.failed > 0 ) {
		parts.push( sprintf(
			/* translators: %d: number of failed images. */
			__( '%d failed', 'kh-images-optimizer' ),
			result.failed
		) )
	}
	if ( result.cloudFailed > 0 ) {
		parts.push( sprintf(
			/* translators: %d: number of failed cloud syncs. */
			__( '%d cloud sync failed', 'kh-images-optimizer' ),
			result.cloudFailed
		) )
	}
	if ( result.cloudSkipped > 0 ) {
		parts.push( sprintf(
			/* translators: %d: number of skipped cloud syncs. */
			__( '%d cloud sync skipped', 'kh-images-optimizer' ),
			result.cloudSkipped
		) )
	}

	return {
		message: sprintf(
			/* translators: %s: comma separated result counts. */
			__( 'Optimization finished: %s.', 'kh-images-optimizer' ),
			parts.join( ', ' )
		),
		tone: result.failed > 0 || result.cloudFailed > 0 ? 'warning' : 'success',
	}
}

const LibraryNotice = ( { notice, onDismiss } ) => {
	const NoticeIcon = notice.tone === 'success' ? CheckCircle2 : AlertTriangle

	return (
		<div
			className={ `khimg-library__notice khimg-library__notice--${ notice.tone }` }
			role={ notice.tone === 'error' ? 'alert' : 'status' }
			aria-live="polite"
		>
			<span className="khimg-library__notice-icon" aria-hidden="true">
				<NoticeIcon size={ 16 } />
			</span>
			<p className="khimg-library__notice-message">{ notice.message }</p>
			<button
				type="button"
				className="khimg-library__notice-close"
				onClick={ onDismiss }
				aria-label={ __( 'Dismiss notice', 'kh-images-optimizer' ) }
			>
				<X size={ 14 } />
			</button>
		</div>
	)
}

const CloudBanner = ( { mediaUrl } ) => (
	<div className="khimg-library__banner">
		<span aria-hidden="true">
			<Cloud size={ 18 } />
		</span>
		<div>
			<p>
				{ __(
					'KH Offloader is active. Local copies are optimized and re-uploaded; cloud-only images need a local download first.',
					'kh-images-optimizer'
				) }
			</p>
			{ mediaUrl ? (
				<a className="khimg-link" href={ mediaUrl }>
					{ __( 'Open KH Offloader', 'kh-images-optimizer' ) }
				</a>
			) : null }
		</div>
	</div>
)

const LibrarySummary = ( { summary } ) => (
	<div className="khimg-library__summary">
		<span className="khimg-summary-chip">
			<strong>{ summary.total }</strong> { __( 'total', 'kh-images-optimizer' ) }
		</span>
		<span className="khimg-summary-chip">
			<strong>{ summary.optimized }</strong> { __( 'optimized', 'kh-images-optimizer' ) }
		</span>
		<span className="khimg-summary-chip">
			<strong>{ summary.unoptimized }</strong> { __( 'unoptimized', 'kh-images-optimizer' ) }
		</span>
		<span className="khimg-summary-chip">
			<strong>{ summary.cloudOnly }</strong> { __( 'cloud-only', 'kh-images-optimizer' ) }
		</span>
	</div>
)

const FilterControl = ( { onChange, value } ) => (
	<ToggleGroupControl
		__next40pxDefaultSize
		__nextHasNoMarginBottom
		hideLabelFromVision
		label={ __( 'Filter images', 'kh-images-optimizer' ) }
		onChange={ onChange }
		value={ value }
	>
		{ FILTERS.map( filter => (
			<ToggleGroupControlOption
				key={ filter.value }
				label={ filter.label }
				value={ filter.value }
			/>
		) ) }
	</ToggleGroupControl>
)

const LibraryToolbar = ( {
	disabled, filter, onClearSearch, onFilterChange, onSearchChange,
	searchInput, totalItems,
} ) => (
	<div className="khimg-library__toolbar">
		<FilterControl onChange={ onFilterChange } value={ filter } />
		<div className="khimg-search">
			<Search size={ 16 } />
			<input
				type="search"
				value={ searchInput }
				onChange={ event => onSearchChange( event.target.value ) }
				placeholder={ __( 'Search images…', 'kh-images-optimizer' ) }
				aria-label={ __( 'Search images', 'kh-images-optimizer' ) }
				autoComplete="off"
				disabled={ disabled }
			/>
			{ searchInput ? (
				<button
					type="button"
					className="khimg-search__clear"
					onClick={ onClearSearch }
					aria-label={ __( 'Clear search', 'kh-images-optimizer' ) }
					disabled={ disabled }
				>
					<X size={ 14 } />
				</button>
			) : null }
		</div>
		<span className="khimg-library__count">{ getTotalLabel( totalItems ) }</span>
	</div>
)

const StatusBadge = ( { info } ) => (
	<span className={ info.isOptimized
		? 'khimg-status-badge khimg-status-badge--optimized'
		: 'khimg-status-badge' }
	>
		{ info.isOptimized ? <CheckCircle2 size={ 12 } /> : null }
		{ getStatusLabel( info ) }
	</span>
)

const CloudBadge = ( { info } ) => {
	if ( ! info.cloudOnly && ! info.cloudLocal ) {
		return null
	}

	return (
		<span className="khimg-cloud-badge">
			<Cloud size={ 12 } />
			{ info.cloudOnly
				? __( 'Cloud', 'kh-images-optimizer' )
				: __( 'Cloud + local', 'kh-images-optimizer' ) }
		</span>
	)
}

const RowAction = ( {
	attachment, busy, info, offloaderUrl, onOptimize, onRestore,
} ) => {
	const title = attachment.title?.rendered || `#${ attachment.id }`

	if ( info.cloudOnly ) {
		const hint = __(
			'This image exists only in cloud storage. Download it locally from KH Offloader before optimizing it.',
			'kh-images-optimizer'
		)

		return (
			<Button
				variant="tertiary"
				size="small"
				href={ offloaderUrl || undefined }
				disabled={ ! offloaderUrl }
				title={ hint }
				aria-label={ sprintf(
					/* translators: %s: attachment title. */
					__( 'Download %s locally from KH Offloader', 'kh-images-optimizer' ),
					title
				) }
			>
				<Download size={ 14 } />
				{ __( 'Download locally', 'kh-images-optimizer' ) }
			</Button>
		)
	}

	if ( info.canRestore ) {
		return (
			<Button
				variant="tertiary"
				size="small"
				disabled={ busy }
				onClick={ () => onRestore( attachment ) }
				aria-label={ sprintf(
					/* translators: %s: attachment title. */
					__( 'Restore %s', 'kh-images-optimizer' ),
					title
				) }
			>
				<RotateCcw size={ 14 } />
				{ __( 'Restore', 'kh-images-optimizer' ) }
			</Button>
		)
	}

	if ( info.isOptimized ) {
		return (
			<span className="khimg-library__muted-action">
				{ __( 'Optimized on upload', 'kh-images-optimizer' ) }
			</span>
		)
	}

	return (
		<Button
			variant="secondary"
			size="small"
			disabled={ busy }
			onClick={ () => onOptimize( attachment ) }
			aria-label={ sprintf(
				/* translators: %s: attachment title. */
				__( 'Optimize %s', 'kh-images-optimizer' ),
				title
			) }
		>
			<Zap size={ 14 } />
			{ __( 'Optimize', 'kh-images-optimizer' ) }
		</Button>
	)
}

const LibraryRow = ( {
	attachment, busy, info, offloaderUrl, onOptimize, onRestore, onToggle, selected,
} ) => {
	const title = attachment.title?.rendered || `#${ attachment.id }`

	return (
		<tr className="khimg-row">
			<td className="khimg-library__check">
				<input
					type="checkbox"
					className="khimg-library__checkbox"
					checked={ selected }
					onChange={ () => onToggle( attachment.id ) }
					disabled={ busy }
					aria-label={ sprintf(
						/* translators: %s: attachment title. */
						__( 'Select %s', 'kh-images-optimizer' ),
						title
					) }
				/>
			</td>
			<td className="khimg-file-cell">
				<div className="khimg-library__file">
					{ info.thumbnailUrl ? (
						<img
							className="khimg-file-thumb"
							src={ info.thumbnailUrl }
							alt=""
							width="40"
							height="40"
							loading="lazy"
							decoding="async"
						/>
					) : (
						<span
							className="khimg-file-thumb khimg-file-thumb--placeholder"
							aria-hidden="true"
						>
							<Image size={ 18 } />
						</span>
					) }
					<div className="khimg-library__file-text">
						<span className="khimg-file-title">{ title }</span>
						<span className="khimg-file-meta">{ getFileMeta( info ) }</span>
					</div>
				</div>
			</td>
			<td>{ formatBytes( info.fileSize ) }</td>
			<td className="khimg-status-cell">
				<div className="khimg-library__statuses">
					<StatusBadge info={ info } />
					<CloudBadge info={ info } />
				</div>
			</td>
			<td className="khimg-action-cell">
				<RowAction
					attachment={ attachment }
					busy={ busy }
					info={ info }
					offloaderUrl={ offloaderUrl }
					onOptimize={ onOptimize }
					onRestore={ onRestore }
				/>
			</td>
		</tr>
	)
}

const LibraryTable = ( {
	busy, offloaderUrl, onOptimize, onRestore, onToggle, onToggleAll, rows, selected,
} ) => {
	const selectAllRef = useRef( null )
	const visibleIds = rows.map( ( { attachment } ) => attachment.id )
	const allSelected = visibleIds.length > 0 &&
		visibleIds.every( id => selected.has( id ) )
	const someSelected = ! allSelected && visibleIds.some( id => selected.has( id ) )

	useEffect( () => {
		if ( selectAllRef.current ) {
			selectAllRef.current.indeterminate = someSelected
		}
	}, [ someSelected ] )

	return (
		<div className="khimg-table-wrap">
			<table className="khimg-table">
				<thead>
					<tr>
						<th className="khimg-library__check">
							<input
								ref={ selectAllRef }
								type="checkbox"
								className="khimg-library__checkbox"
								checked={ allSelected }
								onChange={ onToggleAll }
								disabled={ busy || rows.length === 0 }
								aria-label={ __( 'Select all visible images', 'kh-images-optimizer' ) }
							/>
						</th>
						<th>{ __( 'File', 'kh-images-optimizer' ) }</th>
						<th>{ __( 'Size', 'kh-images-optimizer' ) }</th>
						<th>{ __( 'Status', 'kh-images-optimizer' ) }</th>
						<th>{ __( 'Action', 'kh-images-optimizer' ) }</th>
					</tr>
				</thead>
				<tbody>
					{ rows.map( ( { attachment, info } ) => (
						<LibraryRow
							key={ attachment.id }
							attachment={ attachment }
							busy={ busy }
							info={ info }
							offloaderUrl={ offloaderUrl }
							onOptimize={ onOptimize }
							onRestore={ onRestore }
							onToggle={ onToggle }
							selected={ selected.has( attachment.id ) }
						/>
					) ) }
				</tbody>
			</table>
		</div>
	)
}

const EmptyState = ( {
	filter, hasMedia, mediaUrl, search, summary, totalItems,
} ) => {
	if ( ! hasMedia && ! search && totalItems === 0 ) {
		return (
			<div className="khimg-empty">
				<p>
					{ __(
						'No images in your media library yet. Upload images to start optimizing.',
						'kh-images-optimizer'
					) }
				</p>
				<a className="khimg-link" href={ mediaUrl }>
					{ __( 'Open Media Library', 'kh-images-optimizer' ) }
				</a>
			</div>
		)
	}

	if ( ! search && filter === 'unoptimized' && summary.unoptimized === 0 ) {
		return (
			<div className="khimg-empty">
				<p>{ __( 'Everything on this page is optimized.', 'kh-images-optimizer' ) }</p>
				<p>{ __( 'Upload new images to keep saving space.', 'kh-images-optimizer' ) }</p>
				<a className="khimg-link" href={ mediaUrl }>
					{ __( 'Open Media Library', 'kh-images-optimizer' ) }
				</a>
			</div>
		)
	}

	return (
		<div className="khimg-empty">
			<p>{ __( 'No images match this filter.', 'kh-images-optimizer' ) }</p>
		</div>
	)
}

const LibraryFooter = ( {
	busy, onNext, onOptimizeAll, onPrev, optimizeAllCount, page, totalItems, totalPages,
} ) => (
	<div className="khimg-library__footer">
		<div className="khimg-library__pagination">
			<Button
				variant="secondary"
				size="small"
				onClick={ onPrev }
				disabled={ busy || page <= 1 }
			>
				<ChevronLeft size={ 14 } />
				{ __( 'Prev', 'kh-images-optimizer' ) }
			</Button>
			<span className="khimg-library__page">
				{ sprintf(
					/* translators: 1: current page, 2: total pages. */
					__( 'Page %1$d of %2$d', 'kh-images-optimizer' ),
					page,
					totalPages
				) }
			</span>
			<Button
				variant="secondary"
				size="small"
				onClick={ onNext }
				disabled={ busy || page >= totalPages }
			>
				{ __( 'Next', 'kh-images-optimizer' ) }
				<ChevronRight size={ 14 } />
			</Button>
			<span className="khimg-library__page">{ getTotalLabel( totalItems ) }</span>
		</div>
		<Button
			variant="primary"
			onClick={ onOptimizeAll }
			disabled={ busy || optimizeAllCount === 0 }
		>
			{ sprintf(
				/* translators: %d: number of images that can be optimized. */
				__( 'Optimize all unoptimized (%d)', 'kh-images-optimizer' ),
				optimizeAllCount
			) }
		</Button>
	</div>
)

const ProgressCard = ( {
	cancelling, onCancel, progress,
} ) => {
	const percent = progress.total > 0
		? Math.round( ( progress.current / progress.total ) * 100 )
		: 0

	return (
		<section className="khimg-card khimg-library__progress" aria-live="polite">
			<div className="khimg-card__body">
				<div className="khimg-library__progress-head">
					<div>
						<strong>
							{ sprintf(
								/* translators: 1: image currently being optimized, 2: total images. */
								__( 'Optimizing %1$d of %2$d', 'kh-images-optimizer' ),
								progress.current,
								progress.total
							) }
						</strong>
						<span className="khimg-library__progress-file">{ progress.filename }</span>
					</div>
					<span>{ percent }%</span>
				</div>
				<div
					className="khimg-progress"
					role="progressbar"
					aria-label={ __( 'Bulk optimization progress', 'kh-images-optimizer' ) }
					aria-valuemin={ 0 }
					aria-valuemax={ progress.total }
					aria-valuenow={ progress.current }
				>
					<div className="khimg-progress__bar" style={ { width: `${ percent }%` } } />
				</div>
				<div className="khimg-library__progress-actions">
					<Button
						variant="secondary"
						size="small"
						onClick={ onCancel }
						disabled={ cancelling }
					>
						{ cancelling
							? __( 'Cancelling…', 'kh-images-optimizer' )
							: __( 'Cancel', 'kh-images-optimizer' ) }
					</Button>
				</div>
			</div>
		</section>
	)
}

const ResultCard = ( { onDismiss, result } ) => {
	const counts = [
		{ key: 'optimized', label: __( 'optimized', 'kh-images-optimizer' ) },
		{ key: 'skipped', label: __( 'skipped', 'kh-images-optimizer' ) },
		{ key: 'failed', label: __( 'failed', 'kh-images-optimizer' ) },
		{ key: 'cloudFailed', label: __( 'cloud sync failed', 'kh-images-optimizer' ) },
		{ key: 'cloudSkipped', label: __( 'cloud sync skipped', 'kh-images-optimizer' ) },
	].filter( item => item.key === 'optimized' || result[ item.key ] > 0 )
	const topReasons = getTopReasons( result.reasons )

	return (
		<section className="khimg-card khimg-library__result" role="status" aria-live="polite">
			<div className="khimg-card__body">
				<div className="khimg-library__result-head">
					<strong>
						{ result.cancelled
							? sprintf(
								/* translators: 1: number of processed images, 2: total images. */
								__( 'Cancelled after %1$d of %2$d', 'kh-images-optimizer' ),
								result.processed,
								result.total
							)
							: __( 'Optimization finished', 'kh-images-optimizer' ) }
					</strong>
					<Button
						variant="tertiary"
						size="small"
						onClick={ onDismiss }
						aria-label={ __( 'Dismiss results', 'kh-images-optimizer' ) }
					>
						{ __( 'Dismiss', 'kh-images-optimizer' ) }
					</Button>
				</div>
				<ul className="khimg-library__result-list">
					{ counts.map( item => (
						<li key={ item.key }>
							<strong>{ result[ item.key ] }</strong> { item.label }
						</li>
					) ) }
				</ul>
				{ result.skippedBefore > 0 ? (
					<p className="khimg-library__result-note">
						{ sprintf(
							/* translators: %d: number of selected images that were skipped. */
							_n(
								'%d selected image was skipped because it is already optimized or cloud-only.',
								'%d selected images were skipped because they are already optimized or cloud-only.',
								result.skippedBefore,
								'kh-images-optimizer'
							),
							result.skippedBefore
						) }
					</p>
				) : null }
				{ topReasons.length > 0 ? (
					<div className="khimg-library__result-reasons">
						<span className="khimg-library__result-reasons-title">
							{ __( 'Top skip reasons', 'kh-images-optimizer' ) }
						</span>
						<ul className="khimg-library__result-reasons-list">
							{ topReasons.map( ( { count, reason } ) => (
								<li key={ reason }>
									<strong>{ count }×</strong> { truncateReason( reason ) }
								</li>
							) ) }
						</ul>
					</div>
				) : null }
			</div>
		</section>
	)
}

const BulkBar = ( {
	count, disabled, onClear, onOptimize,
} ) => (
	<div className="khimg-bulkbar" role="region" aria-label={ __( 'Bulk selection actions', 'kh-images-optimizer' ) }>
		<span>
			{ sprintf(
				/* translators: %d: number of selected images. */
				__( '%d selected', 'kh-images-optimizer' ),
				count
			) }
		</span>
		<div className="khimg-library__bulk-actions">
			<Button variant="primary" size="small" onClick={ onOptimize } disabled={ disabled }>
				{ __( 'Optimize selected', 'kh-images-optimizer' ) }
			</Button>
			<Button variant="tertiary" size="small" onClick={ onClear } disabled={ disabled }>
				{ __( 'Clear', 'kh-images-optimizer' ) }
			</Button>
		</div>
	</div>
)

const LibraryError = ( { message, onRetry } ) => (
	<div className="khimg-error" role="alert">
		<span className="khimg-error__icon" aria-hidden="true">
			<AlertTriangle size={ 22 } />
		</span>
		<div className="khimg-error__body">
			<h2 className="khimg-error__title">
				{ __( 'Could not load media', 'kh-images-optimizer' ) }
			</h2>
			<p className="khimg-error__message">{ message }</p>
		</div>
		<Button variant="secondary" onClick={ onRetry }>
			<RotateCcw size={ 14 } />
			{ __( 'Retry', 'kh-images-optimizer' ) }
		</Button>
	</div>
)

export default function BulkOptimizer( { compat = {} } ) {
	const [ attachments, setAttachments ] = useState( [] )
	const [ cancelling, setCancelling ] = useState( false )
	const [ error, setError ] = useState( '' )
	const [ filter, setFilter ] = useState( 'all' )
	const [ loading, setLoading ] = useState( true )
	const [ notice, setNotice ] = useState( null )
	const [ page, setPage ] = useState( 1 )
	const [ progress, setProgress ] = useState( null )
	const [ restoring, setRestoring ] = useState( false )
	const [ result, setResult ] = useState( null )
	const [ search, setSearch ] = useState( '' )
	const [ searchInput, setSearchInput ] = useState( '' )
	const [ selected, setSelected ] = useState( new Set() )
	const [ totalItems, setTotalItems ] = useState( 0 )
	const [ totalPages, setTotalPages ] = useState( 1 )

	const appliedSearchRef = useRef( '' )
	const cancelRef = useRef( false )
	const requestRef = useRef( 0 )

	const offloader = compat?.offloader || {}
	const offloaderActive = Boolean( offloader.active )
	const offloaderUrl = offloader.mediaUrl || ''
	const mediaLibraryUrl = window.khimgSettings?.mediaLibraryUrl || 'upload.php'

	const fetchAttachments = useCallback( async () => {
		const requestId = requestRef.current + 1
		requestRef.current = requestId
		setLoading( true )
		setError( '' )

		try {
			const params = new URLSearchParams()
			params.set( 'page', String( page ) )
			params.set( 'per_page', String( PAGE_SIZE ) )
			params.set( 'media_type', 'image' )
			params.set( 'orderby', 'date' )
			params.set( 'order', 'desc' )
			if ( search ) {
				params.set( 'search', search )
			}
			if ( window.khimgSettings?.nonce ) {
				params.set( '_wpnonce', window.khimgSettings.nonce )
			}

			const response = await apiFetch( {
				path: `/wp/v2/media?${ params.toString() }`,
				parse: false,
			} )
			const data = await response.json()

			if ( requestRef.current !== requestId ) {
				return
			}

			const nextAttachments = Array.isArray( data ) ? data : []
			const nextTotal = parseInt( response.headers.get( 'X-WP-Total' ) || '0', 10 )
			const nextTotalPages = parseInt( response.headers.get( 'X-WP-TotalPages' ) || '1', 10 )

			setAttachments( nextAttachments )
			setTotalItems( Number.isFinite( nextTotal ) ? nextTotal : 0 )
			setTotalPages( Math.max( 1, Number.isFinite( nextTotalPages ) ? nextTotalPages : 1 ) )
			setSelected( previous => {
				const ids = new Set( nextAttachments.map( attachment => attachment.id ) )
				const next = new Set( [ ...previous ].filter( id => ids.has( id ) ) )
				return next.size === previous.size ? previous : next
			} )
		} catch ( fetchError ) {
			if ( requestRef.current === requestId ) {
				setError( fetchError?.message || __(
					'Could not load media. Please try again.',
					'kh-images-optimizer'
				) )
			}
		} finally {
			if ( requestRef.current === requestId ) {
				setLoading( false )
			}
		}
	}, [ page, search ] )

	useEffect( () => {
		const nextSearch = searchInput.trim()
		const timer = window.setTimeout( () => {
			if ( appliedSearchRef.current === nextSearch ) {
				return
			}

			appliedSearchRef.current = nextSearch
			setSearch( nextSearch )
			setPage( 1 )
		}, SEARCH_DEBOUNCE_MS )

		return () => window.clearTimeout( timer )
	}, [ searchInput ] )

	useEffect( () => {
		fetchAttachments()
	}, [ fetchAttachments ] )

	const rows = attachments.map( attachment => ( {
		attachment,
		info: getAttachmentInfo( attachment ),
	} ) )
	const summary = {
		cloudOnly: 0,
		optimized: 0,
		total: rows.length,
		unoptimized: 0,
	}
	rows.forEach( ( { info } ) => {
		if ( info.isOptimized ) {
			summary.optimized += 1
		} else {
			summary.unoptimized += 1
		}
		if ( info.cloudOnly ) {
			summary.cloudOnly += 1
		}
	} )
	const filteredRows = rows.filter( ( { info } ) => {
		if ( filter === 'optimized' ) {
			return info.isOptimized
		}
		if ( filter === 'unoptimized' ) {
			return ! info.isOptimized
		}
		return true
	} )
	const selectedRows = rows.filter( ( { attachment } ) => selected.has( attachment.id ) )
	const optimizeAllTargets = rows
		.filter( ( { info } ) => ! info.isOptimized && ! info.cloudOnly )
		.map( ( { attachment } ) => attachment )
	const eligibleSelectedTargets = selectedRows
		.filter( ( { info } ) => ! info.isOptimized && ! info.cloudOnly )
		.map( ( { attachment } ) => attachment )
	const ineligibleSelectedCount = selectedRows.length - eligibleSelectedTargets.length
	const busy = progress !== null || restoring || loading

	const toggleSelect = id => {
		setSelected( previous => {
			const next = new Set( previous )
			if ( next.has( id ) ) {
				next.delete( id )
			} else {
				next.add( id )
			}
			return next
		} )
	}

	const toggleSelectAll = () => {
		const ids = filteredRows.map( ( { attachment } ) => attachment.id )
		setSelected( previous => {
			const next = new Set( previous )
			const allVisible = ids.length > 0 && ids.every( id => previous.has( id ) )
			ids.forEach( id => {
				if ( allVisible ) {
					next.delete( id )
				} else {
					next.add( id )
				}
			} )
			return next
		} )
	}

	const runBatch = async ( targets, skippedBefore = 0 ) => {
		if ( targets.length === 0 ) {
			setNotice( {
				message: __( 'No unoptimized images to process.', 'kh-images-optimizer' ),
				tone: 'warning',
			} )
			return
		}

		if ( busy ) {
			return
		}

		cancelRef.current = false
		setCancelling( false )
		setNotice( null )
		setResult( null )
		setProgress( {
			current: 0,
			filename: '',
			total: targets.length,
		} )

		let outcome
		try {
			outcome = await processTargets(
				targets,
				() => cancelRef.current,
				( current, total, filename ) => setProgress( {
					current,
					filename,
					total,
				} )
			)
		} catch ( batchError ) {
			setNotice( {
				message: batchError?.message || __(
					'The optimization run could not finish.',
					'kh-images-optimizer'
				),
				tone: 'error',
			} )
			return
		} finally {
			setProgress( null )
			setCancelling( false )
		}

		const nextResult = {
			...outcome.counts,
			cancelled: outcome.cancelled,
			processed: outcome.processed,
			reasons: outcome.reasons,
			skippedBefore,
			total: targets.length,
		}
		setResult( nextResult )
		setNotice( getBatchNotice( nextResult ) )
		await fetchAttachments()
	}

	const optimizeSelected = () => {
		if ( selectedRows.length === 0 ) {
			setNotice( {
				message: __( 'Select at least one image to optimize.', 'kh-images-optimizer' ),
				tone: 'warning',
			} )
			return
		}

		if ( eligibleSelectedTargets.length === 0 ) {
			setNotice( {
				message: sprintf(
					/* translators: %d: number of selected images that cannot be optimized. */
					_n(
						'%d selected image is already optimized or cloud-only.',
						'%d selected images are already optimized or cloud-only.',
						selectedRows.length,
						'kh-images-optimizer'
					),
					selectedRows.length
				),
				tone: 'warning',
			} )
			return
		}

		runBatch( eligibleSelectedTargets, ineligibleSelectedCount )
	}

	const handleRestore = async attachment => {
		setResult( null )
		setRestoring( true )
		setNotice( null )

		try {
			const response = await restoreAttachment( attachment.id )
			setNotice( getCloudSyncNotice( response?.cloud_sync ) )
			await fetchAttachments()
		} catch ( restoreError ) {
			setNotice( {
				message: restoreError?.message || __(
					'Could not restore this image.',
					'kh-images-optimizer'
				),
				tone: 'error',
			} )
		} finally {
			setRestoring( false )
		}
	}

	return (
		<div className="khimg-library">
			{ notice ? (
				<LibraryNotice notice={ notice } onDismiss={ () => setNotice( null ) } />
			) : null }

			{ offloaderActive ? <CloudBanner mediaUrl={ offloaderUrl } /> : null }

			{ rows.length > 0 ? <LibrarySummary summary={ summary } /> : null }

			<LibraryToolbar
				disabled={ busy }
				filter={ filter }
				onClearSearch={ () => setSearchInput( '' ) }
				onFilterChange={ setFilter }
				onSearchChange={ setSearchInput }
				searchInput={ searchInput }
				totalItems={ totalItems }
			/>

			{ progress ? (
				<ProgressCard
					cancelling={ cancelling }
					onCancel={ () => {
						cancelRef.current = true
						setCancelling( true )
					} }
					progress={ progress }
				/>
			) : null }

			{ ! progress && result ? (
				<ResultCard onDismiss={ () => setResult( null ) } result={ result } />
			) : null }

			{ loading ? (
				<div className="khimg-loading" role="status" aria-live="polite">
					<Spinner />
					<span>{ __( 'Loading media…', 'kh-images-optimizer' ) }</span>
				</div>
			) : error ? (
				<LibraryError message={ error } onRetry={ fetchAttachments } />
			) : (
				<>
					{ filteredRows.length > 0 ? (
						<LibraryTable
							busy={ busy }
							offloaderUrl={ offloaderUrl }
							onOptimize={ attachment => runBatch( [ attachment ] ) }
							onRestore={ handleRestore }
							onToggle={ toggleSelect }
							onToggleAll={ toggleSelectAll }
							rows={ filteredRows }
							selected={ selected }
						/>
					) : (
						<EmptyState
							filter={ filter }
							hasMedia={ rows.length > 0 }
							mediaUrl={ mediaLibraryUrl }
							search={ search }
							summary={ summary }
							totalItems={ totalItems }
						/>
					) }

					{ totalItems > 0 || search || rows.length > 0 ? (
						<LibraryFooter
							busy={ busy }
							onNext={ () => setPage( current => Math.min( totalPages, current + 1 ) ) }
							onOptimizeAll={ () => runBatch( optimizeAllTargets ) }
							onPrev={ () => setPage( current => Math.max( 1, current - 1 ) ) }
							optimizeAllCount={ optimizeAllTargets.length }
							page={ page }
							totalItems={ totalItems }
							totalPages={ totalPages }
						/>
					) : null }
				</>
			) }

			{ selected.size > 0 ? (
				<BulkBar
					count={ selected.size }
					disabled={ busy || Boolean( error ) }
					onClear={ () => setSelected( new Set() ) }
					onOptimize={ optimizeSelected }
				/>
			) : null }
		</div>
	)
}
