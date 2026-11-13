/**
 * Shared dashboard shell: topbar navigation, toast, page header and states.
 */

import { useEffect } from '@wordpress/element'
import { Button } from '@wordpress/components'
import { __, sprintf } from '@wordpress/i18n'
import logo from '../assets/logo.webp'
import {
	AlertTriangle, CheckCircle2, ExternalLink, Gauge, Images,
	RotateCcw, SlidersHorizontal, X,
} from './icons'

const NAV_ITEMS = [
	{
		id: 'overview',
		label: __( 'Overview', 'kh-images-optimizer' ),
		icon: Gauge,
	},
	{
		id: 'library',
		label: __( 'Library', 'kh-images-optimizer' ),
		icon: Images,
	},
	{
		id: 'settings',
		label: __( 'Settings', 'kh-images-optimizer' ),
		icon: SlidersHorizontal,
	},
]

export const Topbar = ( {
	build, onNavigate, siteUrl, version, view,
} ) => {
	const buildLabel = build === 'premium'
		? __( 'Premium', 'kh-images-optimizer' )
		: __( 'Free', 'kh-images-optimizer' )

	return (
		<header className="khimg-topbar">
			<div className="khimg-topbar__inner">
				<div className="khimg-brand">
					<span className="khimg-brand__tile">
						<img className="khimg-brand__logo" src={ logo } alt="" height="22" />
					</span>
					<span className="khimg-brand__text">
						<span className="khimg-brand__name">{ __( 'KH Images', 'kh-images-optimizer' ) }</span>
						<span className="khimg-brand__tag">{ __( 'Media Optimizer', 'kh-images-optimizer' ) }</span>
					</span>
				</div>

				<nav className="khimg-nav" aria-label={ __( 'KH Images sections', 'kh-images-optimizer' ) }>
					{ NAV_ITEMS.map( item => {
						const ItemIcon = item.icon
						const isActive = view === item.id

						return (
							<button
								key={ item.id }
								type="button"
								className={ isActive ? 'khimg-nav__item is-active' : 'khimg-nav__item' }
								aria-current={ isActive ? 'page' : undefined }
								onClick={ () => onNavigate( item.id ) }
							>
								<ItemIcon size={ 16 } />
								<span>{ item.label }</span>
							</button>
						)
					} ) }
				</nav>

				<div className="khimg-topbar__meta">
					<span className="khimg-pill khimg-pill--status">
						<span className="khimg-status-dot" aria-hidden="true" />
						{ __( 'Optimization on', 'kh-images-optimizer' ) }
					</span>
					{ version ? (
						<span className="khimg-pill khimg-pill--version">
							{ sprintf(
								/* translators: %s: plugin version number. */
								__( 'v%s', 'kh-images-optimizer' ),
								version
							) }
						</span>
					) : null }
					<span className="khimg-pill khimg-pill--build">{ buildLabel }</span>
					{ siteUrl ? (
						<a
							className="khimg-site-link"
							href={ siteUrl }
							target="_blank"
							rel="noopener noreferrer"
						>
							{ __( 'View site', 'kh-images-optimizer' ) }
							<ExternalLink size={ 13 } />
						</a>
					) : null }
				</div>
			</div>
		</header>
	)
}

export const Toast = ( { onDismiss, toast } ) => {
	useEffect( () => {
		if ( ! toast ) {
			return undefined
		}

		const timer = window.setTimeout( onDismiss, 5000 )
		return () => window.clearTimeout( timer )
	}, [ onDismiss, toast ] )

	if ( ! toast ) {
		return null
	}

	const isError = toast.tone === 'error'
	const ToastIcon = isError ? AlertTriangle : CheckCircle2

	return (
		<div
			className={ `khimg-toast khimg-toast--${ isError ? 'error' : 'success' }` }
			role="status"
			aria-live="polite"
		>
			<span className="khimg-toast__icon" aria-hidden="true">
				<ToastIcon size={ 18 } />
			</span>
			<p className="khimg-toast__message">{ toast.message }</p>
			<button
				type="button"
				className="khimg-toast__close"
				onClick={ onDismiss }
				aria-label={ __( 'Dismiss notification', 'kh-images-optimizer' ) }
			>
				<X size={ 14 } />
			</button>
		</div>
	)
}

export const PageHeader = ( {
	actions, subtitle, title,
} ) => (
	<header className="khimg-page-header">
		<div className="khimg-page-header__titles">
			<h1 className="khimg-page-title">{ title }</h1>
			{ subtitle ? <p className="khimg-page-subtitle">{ subtitle }</p> : null }
		</div>
		{ actions ? <div className="khimg-page-header__actions">{ actions }</div> : null }
	</header>
)

export const LoadingSkeleton = () => (
	<div className="khimg-skeleton" role="status" aria-live="polite" aria-busy="true">
		<span className="screen-reader-text">{ __( 'Loading settings…', 'kh-images-optimizer' ) }</span>
		<div className="khimg-skeleton__bar" />
		<div className="khimg-skeleton-grid">
			<div className="khimg-skeleton__card" />
			<div className="khimg-skeleton__card" />
			<div className="khimg-skeleton__card" />
			<div className="khimg-skeleton__card" />
		</div>
		<div className="khimg-skeleton__card khimg-skeleton__card--wide" />
	</div>
)

export const ErrorCard = ( { message, onRetry } ) => (
	<div className="khimg-error" role="alert">
		<span className="khimg-error__icon" aria-hidden="true">
			<AlertTriangle size={ 22 } />
		</span>
		<div className="khimg-error__body">
			<h2 className="khimg-error__title">{ __( 'Could not load settings', 'kh-images-optimizer' ) }</h2>
			<p className="khimg-error__message">{ message }</p>
		</div>
		<Button variant="secondary" onClick={ onRetry }>
			<RotateCcw size={ 14 } />
			{ __( 'Retry', 'kh-images-optimizer' ) }
		</Button>
	</div>
)
