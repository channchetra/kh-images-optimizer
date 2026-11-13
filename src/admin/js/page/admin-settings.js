/**
 * KH Images dashboard container.
 *
 * Owns URL routing, the settings API state and the shared shell.
 */

import {
	useCallback, useEffect, useRef, useState,
} from '@wordpress/element'
import { applyFilters } from '@wordpress/hooks'
import apiFetch from '@wordpress/api-fetch'
import { __ } from '@wordpress/i18n'
import BulkOptimizer from './bulk-optimization/BulkOptimizer'
import Overview from './overview'
import SettingsView from './settings-view'
import {
	ErrorCard, LoadingSkeleton, PageHeader, Toast, Topbar,
} from './components/shell'

const BulkOptimizationComponent = applyFilters( 'khimg.admin.settings.bulkOptimizationComponent', BulkOptimizer )

const VIEWS = [ 'overview', 'library', 'settings' ]
const SETTINGS_PATH = '/wp/v2/settings'
const CLEAR_CACHE_PATH = '/khimg/v1/compat/clear-cache'

const createDefaultSettings = () => ( {
	optimizeAllMedia: 0,
	showOptimizationToggle: 0,
	showOptimizationToggleFrontend: 0,
	persistOptimizationToggle: 0,
	disableWpScaling: 1,
	disableThumbnailGeneration: 0,
	thumbnailSizes: [],
	smartOptimization: 1,
	webpQuality: 80,
	maxImageDimension: '',
	lqipEnabled: 0,
	lqipPulseSpeed: '',
	lqipBrightness: '',
	lqipFadeDuration: '',
	videoOptimizationEnabled: 1,
	videoQuality: 3,
	videoMaxResolution: '',
	audioOptimizationEnabled: 1,
	audioQuality: 128,
	svgUpload: 0,
	svgOptimizationEnabled: 1,
	stealthModeEnabled: 0,
} )

const readSettingsGlobals = () => {
	const settings = window.khimgSettings || {}
	const admin = window.khimgAdmin || {}
	const compat = settings.compat || {}

	return {
		build: settings.build || 'free',
		compat: {
			offloader: {
				active: false,
				version: '',
				mediaUrl: '',
				canReoffload: false,
				...compat.offloader,
			},
			speed: {
				active: false,
				version: '',
				dashboardUrl: '',
				canClearCache: false,
				...compat.speed,
			},
		},
		imageSizes: Array.isArray( admin.imageSizes ) ? admin.imageSizes : [],
		isPremium: Boolean( settings.isPremium ),
		mediaLibraryUrl: settings.mediaLibraryUrl || 'upload.php',
		ratingDismissed: admin.ratingDismissed === '1',
		showUnimplementedSettings: Boolean( settings.showUnimplementedSettings ),
		siteUrl: settings.siteUrl || '',
		stats: admin.stats || {},
		version: settings.version || '',
		wpScalingThreshold: settings.wpScalingThreshold || 0,
	}
}

const mapOptionsFromApi = options => ( {
	optimizeAllMedia: options.optimize_all_media !== undefined ? options.optimize_all_media : 0,
	showOptimizationToggle: options.show_optimization_toggle !== undefined ? options.show_optimization_toggle : 0,
	showOptimizationToggleFrontend: options.show_optimization_toggle_frontend !== undefined ? options.show_optimization_toggle_frontend : 0,
	persistOptimizationToggle: options.persist_optimization_toggle !== undefined ? options.persist_optimization_toggle : 0,
	disableWpScaling: options.disable_wp_scaling !== undefined ? options.disable_wp_scaling : 1,
	disableThumbnailGeneration: options.disable_thumbnail_generation !== undefined ? options.disable_thumbnail_generation : 0,
	thumbnailSizes: options.thumbnail_sizes || [],
	smartOptimization: options.smart_optimization !== undefined ? options.smart_optimization : 1,
	webpQuality: options.webp_quality !== undefined ? options.webp_quality : 80,
	maxImageDimension: options.max_image_dimension || '',
	lqipEnabled: options.lqip_enabled !== undefined ? options.lqip_enabled : 0,
	lqipPulseSpeed: options.lqip_pulse_speed !== undefined ? options.lqip_pulse_speed : '',
	lqipBrightness: options.lqip_brightness !== undefined ? options.lqip_brightness : '',
	lqipFadeDuration: options.lqip_fade_duration !== undefined ? options.lqip_fade_duration : '',
	videoOptimizationEnabled: options.video_optimization_enabled !== undefined ? options.video_optimization_enabled : 1,
	videoQuality: options.video_quality !== undefined ? options.video_quality : 3,
	videoMaxResolution: options.video_max_resolution || '',
	audioOptimizationEnabled: options.audio_optimization_enabled !== undefined ? options.audio_optimization_enabled : 1,
	audioQuality: options.audio_quality !== undefined ? options.audio_quality : 128,
	svgUpload: options.svg_upload !== undefined ? options.svg_upload : 0,
	svgOptimizationEnabled: options.svg_optimization_enabled !== undefined ? options.svg_optimization_enabled : 1,
	stealthModeEnabled: options.stealth_mode_enabled !== undefined ? options.stealth_mode_enabled : 0,
} )

const mapSettingsToPayload = settings => ( {
	/* eslint-disable camelcase */
	optimize_all_media: settings.optimizeAllMedia,
	show_optimization_toggle: settings.showOptimizationToggle,
	show_optimization_toggle_frontend: settings.showOptimizationToggleFrontend,
	persist_optimization_toggle: settings.persistOptimizationToggle,
	disable_wp_scaling: settings.disableWpScaling,
	disable_thumbnail_generation: settings.disableThumbnailGeneration,
	thumbnail_sizes: settings.thumbnailSizes,
	smart_optimization: settings.smartOptimization,
	webp_quality: parseInt( settings.webpQuality, 10 ) || 0,
	max_image_dimension: parseInt( settings.maxImageDimension, 10 ) || 0,
	lqip_enabled: settings.lqipEnabled,
	lqip_pulse_speed: parseFloat( settings.lqipPulseSpeed ) || 0,
	lqip_brightness: parseFloat( settings.lqipBrightness ) || 0,
	lqip_fade_duration: parseFloat( settings.lqipFadeDuration ) || 0,
	video_optimization_enabled: settings.videoOptimizationEnabled,
	video_quality: settings.videoQuality || 0,
	video_max_resolution: settings.videoMaxResolution || '',
	audio_optimization_enabled: settings.audioOptimizationEnabled,
	audio_quality: settings.audioQuality || 0,
	svg_upload: settings.svgUpload,
	svg_optimization_enabled: settings.svgOptimizationEnabled,
	stealth_mode_enabled: settings.stealthModeEnabled,
	/* eslint-enable camelcase */
} )

const getValidationErrors = ( settings, isPremium ) => {
	const errors = {}
	const quality = settings.webpQuality
	const dimension = settings.maxImageDimension
	const isSmartEnabled = isPremium && settings.smartOptimization === 1

	if ( ! isSmartEnabled && quality !== '' && quality !== null && quality !== undefined ) {
		const parsedQuality = Number( quality )
		if ( ! Number.isFinite( parsedQuality ) || parsedQuality < 1 || parsedQuality > 100 ) {
			errors.webpQuality = __( 'WebP quality must be between 1 and 100.', 'kh-images-optimizer' )
		}
	}

	if ( dimension !== '' && dimension !== null && dimension !== undefined ) {
		const parsedDimension = Number( dimension )
		if ( ! Number.isFinite( parsedDimension ) || parsedDimension < 0 || parsedDimension > 10000 ) {
			errors.maxImageDimension = __( 'Maximum dimension must be empty or between 0 and 10000.', 'kh-images-optimizer' )
		}
	}

	return errors
}

const getViewFromUrl = () => {
	const view = new URLSearchParams( window.location.search ).get( 'view' )
	return VIEWS.includes( view ) ? view : 'overview'
}

const AdminSettings = () => {
	const globals = readSettingsGlobals()
	const savedSettings = useRef( createDefaultSettings() )
	const [ view, setView ] = useState( getViewFromUrl )
	const [ settings, setSettings ] = useState( createDefaultSettings )
	const [ imageSizes ] = useState( globals.imageSizes )
	const [ isSaving, setIsSaving ] = useState( false )
	const [ saveMessage, setSaveMessage ] = useState( null )
	const [ isLoading, setIsLoading ] = useState( true )
	const [ loadError, setLoadError ] = useState( '' )
	const [ hasUnsavedChanges, setHasUnsavedChanges ] = useState( false )
	const [ ratingDismissed, setRatingDismissed ] = useState( globals.ratingDismissed )
	const [ toast, setToast ] = useState( null )
	const [ clearingCache, setClearingCache ] = useState( false )
	const [ stats, setStats ] = useState( () => window.khimgAdmin?.stats || {} )
	const [ refreshingStats, setRefreshingStats ] = useState( false )

	const showToast = useCallback( ( message, tone = 'success' ) => {
		setToast( { message, tone } )
	}, [] )

	const dismissToast = useCallback( () => {
		setToast( null )
	}, [] )

	const loadSettings = useCallback( async () => {
		setIsLoading( true )
		setLoadError( '' )

		try {
			const data = await apiFetch( { path: SETTINGS_PATH } )
			const nextSettings = mapOptionsFromApi( data.khimg_options || {} )

			setSettings( nextSettings )
			savedSettings.current = nextSettings
			setHasUnsavedChanges( false )
			setSaveMessage( null )
		} catch ( error ) {
			setLoadError(
				error && typeof error.message === 'string' && error.message
					? error.message
					: __( 'Please check your connection and try again.', 'kh-images-optimizer' )
			)
		} finally {
			setIsLoading( false )
		}
	}, [] )

	useEffect( () => {
		loadSettings()
	}, [ loadSettings ] )

	useEffect( () => {
		const handlePopState = () => {
			setView( getViewFromUrl() )
			window.scrollTo( 0, 0 )
		}

		window.addEventListener( 'popstate', handlePopState )
		return () => window.removeEventListener( 'popstate', handlePopState )
	}, [] )

	useEffect( () => {
		if ( ! hasUnsavedChanges ) {
			return undefined
		}

		const handleBeforeUnload = event => {
			event.preventDefault()
			event.returnValue = ''
		}

		window.addEventListener( 'beforeunload', handleBeforeUnload )
		return () => window.removeEventListener( 'beforeunload', handleBeforeUnload )
	}, [ hasUnsavedChanges ] )

	const go = useCallback( nextView => {
		const target = VIEWS.includes( nextView ) ? nextView : 'overview'
		if ( target === view ) {
			return
		}

		const url = new URL( window.location.href )
		if ( target === 'overview' ) {
			url.searchParams.delete( 'view' )
		} else {
			url.searchParams.set( 'view', target )
		}

		window.history.pushState( { view: target }, '', url.toString() )
		setView( target )
		window.scrollTo( 0, 0 )
	}, [ view ] )

	const handleInputChange = useCallback( ( field, value ) => {
		setSettings( previous => ( {
			...previous,
			[ field ]: value,
		} ) )
		setHasUnsavedChanges( true )
		setSaveMessage( null )
	}, [] )

	const handleThumbnailSizeChange = useCallback( ( sizeName, isChecked ) => {
		setSettings( previous => {
			let nextSizes = [ ...previous.thumbnailSizes ]

			if ( isChecked ) {
				nextSizes = nextSizes.filter( size => size !== sizeName )
			} else if ( ! nextSizes.includes( sizeName ) ) {
				nextSizes.push( sizeName )
			}

			return {
				...previous,
				thumbnailSizes: nextSizes,
			}
		} )
		setHasUnsavedChanges( true )
		setSaveMessage( null )
	}, [] )

	const handleApplyPatch = useCallback( patch => {
		setSettings( previous => ( {
			...previous,
			...patch,
		} ) )
		setHasUnsavedChanges( true )
		setSaveMessage( null )
	}, [] )

	const handleDiscard = useCallback( () => {
		setSettings( { ...savedSettings.current } )
		setHasUnsavedChanges( false )
		setSaveMessage( null )
	}, [] )

	const handleSubmit = useCallback( async event => {
		if ( event ) {
			event.preventDefault()
		}

		if ( isSaving ) {
			return
		}

		if ( Object.keys( getValidationErrors( settings, globals.isPremium ) ).length > 0 ) {
			const message = __( 'Fix the highlighted fields before saving.', 'kh-images-optimizer' )
			setSaveMessage( { tone: 'error', text: message } )
			showToast( message, 'error' )
			return
		}

		setIsSaving( true )
		setSaveMessage( null )

		try {
			await apiFetch( {
				path: SETTINGS_PATH,
				method: 'POST',
				data: {
					// eslint-disable-next-line camelcase
					khimg_options: mapSettingsToPayload( settings ),
				},
			} )

			savedSettings.current = settings
			setHasUnsavedChanges( false )
			setSaveMessage( {
				tone: 'success',
				text: __( 'Settings saved successfully!', 'kh-images-optimizer' ),
			} )
			showToast( __( 'Settings saved successfully!', 'kh-images-optimizer' ), 'success' )
		} catch ( error ) {
			setHasUnsavedChanges( true )
			const message = __( 'Error saving settings. Please try again.', 'kh-images-optimizer' )
			setSaveMessage( { tone: 'error', text: message } )
			showToast( message, 'error' )
		} finally {
			setIsSaving( false )
		}
	}, [ globals.isPremium, isSaving, settings, showToast ] )

	const handleDismissRating = useCallback( async () => {
		setRatingDismissed( true )

		try {
			await apiFetch( {
				path: SETTINGS_PATH,
				method: 'POST',
				data: {
					// eslint-disable-next-line camelcase
					khimg_rating_dismissed: '1',
				},
			} )
		} catch ( error ) {
			setRatingDismissed( false )
			showToast( __( 'Could not dismiss the rating notice. Please try again.', 'kh-images-optimizer' ), 'error' )
		}
	}, [ showToast ] )

	const clearSpeedCache = useCallback( async () => {
		if ( clearingCache ) {
			return
		}

		setClearingCache( true )

		try {
			await apiFetch( { path: CLEAR_CACHE_PATH, method: 'POST' } )
			showToast( __( 'Page cache cleared.', 'kh-images-optimizer' ), 'success' )
		} catch ( error ) {
			showToast( __( 'Could not clear the page cache.', 'kh-images-optimizer' ), 'error' )
		} finally {
			setClearingCache( false )
		}
	}, [ clearingCache, showToast ] )

	const refreshStats = useCallback( async () => {
		setRefreshingStats( true )

		try {
			const result = await apiFetch( { path: '/khimg/v1/stats/rebuild', method: 'POST' } )
			if ( result?.stats ) {
				setStats( result.stats )
			}
			showToast( __( 'Stats refreshed.', 'kh-images-optimizer' ), 'success' )
		} catch ( error ) {
			showToast( error?.message || __( 'Could not refresh stats.', 'kh-images-optimizer' ), 'error' )
		} finally {
			setRefreshingStats( false )
		}
	}, [ showToast ] )

	const validationErrors = getValidationErrors( settings, globals.isPremium )

	return (
		<>
			<Topbar
				build={ globals.build }
				onNavigate={ go }
				siteUrl={ globals.siteUrl }
				version={ globals.version }
				view={ view }
			/>

			<div className="khimg-app">
				<main className="khimg-main">
					{ view === 'overview' ? (
						<Overview
							clearingCache={ clearingCache }
							compat={ globals.compat }
							mediaLibraryUrl={ globals.mediaLibraryUrl }
							onClearCache={ clearSpeedCache }
							onDismissRating={ handleDismissRating }
							onNavigate={ go }
							onRefreshStats={ refreshStats }
							ratingDismissed={ ratingDismissed }
							refreshingStats={ refreshingStats }
							stats={ stats }
						/>
					) : null }

					{ view === 'library' ? (
						<>
							<PageHeader
								title={ __( 'Library', 'kh-images-optimizer' ) }
								subtitle={ __( 'Optimize images that are already in WordPress.', 'kh-images-optimizer' ) }
							/>
							<div className="khimg-library">
								<BulkOptimizationComponent
									compat={ globals.compat }
									onNavigate={ go }
								/>
							</div>
						</>
					) : null }

					{ view === 'settings' ? (
						isLoading ? (
							<LoadingSkeleton />
						) : loadError ? (
							<ErrorCard message={ loadError } onRetry={ loadSettings } />
						) : (
							<SettingsView
								errors={ validationErrors }
								imageSizes={ imageSizes }
								isPremium={ globals.isPremium }
								isSaving={ isSaving }
								onApplyPatch={ handleApplyPatch }
								onDiscard={ handleDiscard }
								onInputChange={ handleInputChange }
								onSave={ handleSubmit }
								onThumbnailSizeChange={ handleThumbnailSizeChange }
								saveMessage={ saveMessage }
								settings={ settings }
								showUnimplementedSettings={ globals.showUnimplementedSettings }
								unsaved={ hasUnsavedChanges }
								wpScalingThreshold={ globals.wpScalingThreshold }
							/>
						)
					) : null }
				</main>
			</div>

			<Toast onDismiss={ dismissToast } toast={ toast } />
		</>
	)
}

export default AdminSettings
