/**
 * Overview view: savings, quick actions and KH suite compatibility.
 */

import { Button } from '@wordpress/components'
import { __, sprintf } from '@wordpress/i18n'
import {
	ArrowRight, Cloud, CloudOff, Download, ExternalLink, Image,
	Images, RefreshCw, Sparkles, Zap,
} from './components/icons'
import { PageHeader } from './components/shell'

const RATING_URL = 'https://wordpress.org/support/plugin/kh-images-optimizer/reviews/#new-post'
const RATING_THRESHOLD_BYTES = 5 * 1024 * 1024
const SIZE_UNITS = {
	B: 1,
	GB: 1024 ** 3,
	KB: 1024,
	MB: 1024 ** 2,
	TB: 1024 ** 4,
}

const displayValue = value => (
	value === undefined || value === null || value === '' ? '—' : value
)

const parseSavedBytes = value => {
	if ( typeof value !== 'string' ) {
		return 0
	}

	const match = value.replace( /,/g, '' ).match( /^([\d.]+)\s*([a-zA-Z]+)/ )
	if ( ! match ) {
		return 0
	}

	const unit = SIZE_UNITS[ match[ 2 ].toUpperCase() ]
	if ( ! unit ) {
		return 0
	}

	return parseFloat( match[ 1 ] ) * unit
}

const StatCard = ( {
	Icon, delta, hint, isHero, label, value,
} ) => (
	<div className={ isHero ? 'khimg-stat khimg-stat--hero' : 'khimg-stat' }>
		<div className="khimg-stat__top">
			<span className="khimg-stat__icon" aria-hidden="true">
				<Icon size={ 18 } />
			</span>
			<span className="khimg-stat__label">{ label }</span>
		</div>
		<span className="khimg-stat__value">{ displayValue( value ) }</span>
		{ delta ? <span className="khimg-stat__delta">{ delta }</span> : null }
		{ hint ? <span className="khimg-stat__hint">{ hint }</span> : null }
	</div>
)

const CompatibilityRow = ( {
	children, hint, icon, name, status, version,
} ) => (
	<div className="khimg-compat__row">
		<div className="khimg-compat__head">
			<div className="khimg-compat__identity">
				<span className="khimg-compat__avatar" aria-hidden="true">
					{ icon }
				</span>
				<div className="khimg-compat__text">
					<h3 className="khimg-compat__name">{ name }</h3>
					<div className="khimg-compat__meta">
						{ status }
						{ version ? <span className="khimg-compat__version">{ `v${ version }` }</span> : null }
					</div>
				</div>
			</div>
			<div className="khimg-compat__actions">{ children }</div>
		</div>
		<p className="khimg-compat__hint">{ hint }</p>
	</div>
)

export default function Overview( {
	clearingCache, compat, mediaLibraryUrl, onClearCache, onDismissRating,
	onNavigate, onRefreshStats, ratingDismissed, refreshingStats, stats = {},
} ) {
	const savedBytes = parseSavedBytes( stats.total_storage_saved )
	const showRating = savedBytes > RATING_THRESHOLD_BYTES && ! ratingDismissed
	const offloader = compat.offloader || {}
	const speed = compat.speed || {}

	return (
		<>
			<PageHeader
				title={ __( 'Overview', 'kh-images-optimizer' ) }
				subtitle={ __( 'See how much weight your media lost and what to do next.', 'kh-images-optimizer' ) }
				actions={ (
					<>
						<Button
							variant="secondary"
							icon={ RefreshCw }
							iconSize={ 16 }
							onClick={ onRefreshStats }
							disabled={ refreshingStats }
							isBusy={ refreshingStats }
						>
							{ __( 'Refresh stats', 'kh-images-optimizer' ) }
						</Button>
						<Button variant="secondary" onClick={ () => onNavigate( 'settings' ) }>
							{ __( 'Review settings', 'kh-images-optimizer' ) }
						</Button>
						<Button variant="primary" onClick={ () => onNavigate( 'library' ) }>
							{ __( 'Optimize library', 'kh-images-optimizer' ) }
						</Button>
					</>
				) }
			/>

			<div className="khimg-stats-grid">
				<StatCard
					isHero
					Icon={ Download }
					label={ __( 'Total storage saved', 'kh-images-optimizer' ) }
					value={ stats.total_storage_saved }
					delta={ stats.percentage_saved !== undefined
						? sprintf(
							/* translators: %s: percentage of storage saved. */
							__( '↓ %s%% reduction', 'kh-images-optimizer' ),
							stats.percentage_saved
						)
						: '' }
					hint={ __( 'Across all optimized media files', 'kh-images-optimizer' ) }
				/>
				<StatCard
					Icon={ Images }
					label={ __( 'Media optimized', 'kh-images-optimizer' ) }
					value={ stats.media_optimized }
					hint={ __( 'Media files optimized', 'kh-images-optimizer' ) }
				/>
				<StatCard
					Icon={ Image }
					label={ __( 'Original size', 'kh-images-optimizer' ) }
					value={ stats.before }
					hint={ __( 'Total weight before optimization', 'kh-images-optimizer' ) }
				/>
				<StatCard
					Icon={ Zap }
					label={ __( 'Optimized size', 'kh-images-optimizer' ) }
					value={ stats.after }
					hint={ __( 'Total weight after optimization', 'kh-images-optimizer' ) }
				/>
			</div>

			<div className="khimg-split">
				<section className="khimg-card" aria-labelledby="khimg-quick-actions-title">
					<div className="khimg-card__header">
						<h2 className="khimg-card__title" id="khimg-quick-actions-title">
							{ __( 'Quick actions', 'kh-images-optimizer' ) }
						</h2>
					</div>
					<div className="khimg-card__body">
						<div className="khimg-actions-list">
							<button type="button" className="khimg-action" onClick={ () => onNavigate( 'library' ) }>
								<span className="khimg-action__icon" aria-hidden="true"><Images size={ 16 } /></span>
								<span>{ __( 'Optimize library', 'kh-images-optimizer' ) }</span>
								<ArrowRight className="khimg-action__chevron" size={ 15 } />
							</button>
							<button type="button" className="khimg-action" onClick={ () => onNavigate( 'settings' ) }>
								<span className="khimg-action__icon" aria-hidden="true"><Sparkles size={ 16 } /></span>
								<span>{ __( 'Review settings', 'kh-images-optimizer' ) }</span>
								<ArrowRight className="khimg-action__chevron" size={ 15 } />
							</button>
							<a className="khimg-action" href={ mediaLibraryUrl }>
								<span className="khimg-action__icon" aria-hidden="true"><Image size={ 16 } /></span>
								<span>{ __( 'Open Media Library', 'kh-images-optimizer' ) }</span>
								<ExternalLink className="khimg-action__chevron" size={ 15 } />
							</a>
						</div>
					</div>
				</section>

				<section className="khimg-card" aria-labelledby="khimg-compat-title">
					<div className="khimg-card__header">
						<h2 className="khimg-card__title" id="khimg-compat-title">
							{ __( 'Compatibility', 'kh-images-optimizer' ) }
						</h2>
					</div>
					<div className="khimg-card__body">
						<div className="khimg-compat">
							<CompatibilityRow
								name={ __( 'KH Offloader', 'kh-images-optimizer' ) }
								icon={ <Cloud size={ 16 } /> }
								version={ offloader.active ? offloader.version : '' }
								status={ offloader.active ? (
									<span className="khimg-badge khimg-badge--success">
										<span className="khimg-badge__dot" aria-hidden="true" />
										{ __( 'Active', 'kh-images-optimizer' ) }
									</span>
								) : (
									<span className="khimg-badge khimg-badge--muted">
										<CloudOff size={ 12 } />
										{ __( 'Not detected', 'kh-images-optimizer' ) }
									</span>
								) }
								hint={ __( 'When KH Offloader is active, re-offloading uses the local copy, and media that exists only in the cloud is left untouched.', 'kh-images-optimizer' ) }
							>
								{ offloader.active && offloader.mediaUrl ? (
									<Button variant="tertiary" href={ offloader.mediaUrl }>
										{ __( 'Open media', 'kh-images-optimizer' ) }
										<ArrowRight size={ 14 } />
									</Button>
								) : null }
							</CompatibilityRow>

							<CompatibilityRow
								name={ __( 'KH Speed Engine', 'kh-images-optimizer' ) }
								icon={ <RefreshCw size={ 16 } /> }
								version={ speed.active ? speed.version : '' }
								status={ speed.active ? (
									<span className="khimg-badge khimg-badge--success">
										<span className="khimg-badge__dot" aria-hidden="true" />
										{ __( 'Active', 'kh-images-optimizer' ) }
									</span>
								) : (
									<span className="khimg-badge khimg-badge--muted">
										<CloudOff size={ 12 } />
										{ __( 'Not detected', 'kh-images-optimizer' ) }
									</span>
								) }
								hint={ __( 'Clear the KH Speed Engine page cache after changing image settings so the new markup is served.', 'kh-images-optimizer' ) }
							>
								{ speed.active && speed.dashboardUrl ? (
									<Button variant="tertiary" href={ speed.dashboardUrl }>
										{ __( 'Open dashboard', 'kh-images-optimizer' ) }
										<ArrowRight size={ 14 } />
									</Button>
								) : null }
								{ speed.canClearCache ? (
									<Button
										variant="secondary"
										onClick={ onClearCache }
										disabled={ clearingCache }
										isBusy={ clearingCache }
									>
										{ clearingCache
											? __( 'Clearing…', 'kh-images-optimizer' )
											: __( 'Clear page cache', 'kh-images-optimizer' ) }
									</Button>
								) : null }
							</CompatibilityRow>
						</div>
					</div>
				</section>
			</div>

			<section className="khimg-card khimg-how" aria-labelledby="khimg-how-title">
				<div className="khimg-card__header">
					<h2 className="khimg-card__title" id="khimg-how-title">
						{ __( 'How it works', 'kh-images-optimizer' ) }
					</h2>
				</div>
				<div className="khimg-card__body">
					<ol className="khimg-steps">
						<li className="khimg-step">
							<span className="khimg-step__icon" aria-hidden="true"><Download size={ 18 } /></span>
							<div>
								<h3 className="khimg-step__title">{ __( 'Upload', 'kh-images-optimizer' ) }</h3>
								<p className="khimg-step__text">{ __( 'Drop images into WordPress or any upload field.', 'kh-images-optimizer' ) }</p>
							</div>
						</li>
						<li className="khimg-step">
							<span className="khimg-step__icon" aria-hidden="true"><RefreshCw size={ 18 } /></span>
							<div>
								<h3 className="khimg-step__title">{ __( 'Browser converts', 'kh-images-optimizer' ) }</h3>
								<p className="khimg-step__text">{ __( 'The image is converted to WebP on your device.', 'kh-images-optimizer' ) }</p>
							</div>
						</li>
						<li className="khimg-step">
							<span className="khimg-step__icon" aria-hidden="true"><Cloud size={ 18 } /></span>
							<div>
								<h3 className="khimg-step__title">{ __( 'Only the small file is stored', 'kh-images-optimizer' ) }</h3>
								<p className="khimg-step__text">{ __( 'Your server never processes the original.', 'kh-images-optimizer' ) }</p>
							</div>
						</li>
					</ol>
				</div>
			</section>

			{ showRating ? (
				<section className="khimg-rating" aria-labelledby="khimg-rating-title">
					<span className="khimg-rating__icon" aria-hidden="true"><Sparkles size={ 18 } /></span>
					<div className="khimg-rating__body">
						<h2 className="khimg-rating__title" id="khimg-rating-title">
							{ __( 'Loving the instant storage & server resource savings?', 'kh-images-optimizer' ) }
						</h2>
						<p className="khimg-rating__description">
							{ sprintf(
								/* translators: %s: total storage saved, for example "12.4 MB". */
								__( "You've saved over %s! If KH Images is helping your site, please consider leaving us a 5-star rating and help others discover KH Images!", 'kh-images-optimizer' ),
								stats.total_storage_saved
							) }
						</p>
					</div>
					<div className="khimg-rating__actions">
						<Button
							variant="secondary"
							href={ RATING_URL }
							target="_blank"
							rel="noopener noreferrer"
						>
							{ __( 'Rate now', 'kh-images-optimizer' ) }
						</Button>
						<Button variant="tertiary" onClick={ onDismissRating }>
							{ __( "Don't show this again", 'kh-images-optimizer' ) }
						</Button>
					</div>
				</section>
			) : null }
		</>
	)
}
