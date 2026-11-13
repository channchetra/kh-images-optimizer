/**
 * Settings view: upload behavior, image quality, stealth mode and save bar.
 */

import {
	Button, CheckboxControl, RangeControl, TextControl, ToggleControl,
} from '@wordpress/components'
import { __, sprintf } from '@wordpress/i18n'
import {
	CheckCircle2, Image, Save, Shield, SlidersHorizontal, Undo2,
} from './components/icons'
import { PageHeader } from './components/shell'

const GENERAL_RECOMMENDED = {
	optimizeAllMedia: 0,
	showOptimizationToggle: 0,
	showOptimizationToggleFrontend: 0,
	persistOptimizationToggle: 0,
	disableWpScaling: 1,
	disableThumbnailGeneration: 1,
	thumbnailSizes: [],
}

const GENERAL_DEFAULT = {
	optimizeAllMedia: 0,
	showOptimizationToggle: 0,
	showOptimizationToggleFrontend: 0,
	persistOptimizationToggle: 0,
	disableWpScaling: 1,
	disableThumbnailGeneration: 0,
	thumbnailSizes: [],
}

const IMAGE_RECOMMENDED = {
	smartOptimization: 1,
	webpQuality: 80,
	maxImageDimension: 1920,
}

const IMAGE_DEFAULT = {
	smartOptimization: 1,
	webpQuality: '',
	maxImageDimension: '',
}

const STEALTH_DEFAULT = {
	stealthModeEnabled: 0,
}

const hasPositiveDimension = value => (
	value !== '' &&
	value !== null &&
	value !== undefined &&
	Number( value ) > 0
)

const UploadBehaviorCard = ( {
	imageSizes, onApplyPatch, onInputChange, onThumbnailSizeChange, settings,
} ) => {
	const thumbnailSizes = settings.thumbnailSizes || []

	return (
		<section className="khimg-card" aria-labelledby="khimg-upload-behavior-title">
			<div className="khimg-card__header">
				<h2 className="khimg-card__title" id="khimg-upload-behavior-title">
					<span className="khimg-card__icon" aria-hidden="true"><Image size={ 18 } /></span>
					{ __( 'Upload behavior', 'kh-images-optimizer' ) }
				</h2>
				<div className="khimg-card__actions">
					<Button variant="secondary" type="button" onClick={ () => onApplyPatch( GENERAL_RECOMMENDED ) }>
						{ __( 'Recommended', 'kh-images-optimizer' ) }
					</Button>
					<Button variant="tertiary" type="button" onClick={ () => onApplyPatch( GENERAL_DEFAULT ) }>
						{ __( 'Reset', 'kh-images-optimizer' ) }
					</Button>
				</div>
			</div>
			<div className="khimg-card__body">
				<div className="khimg-field">
					<ToggleControl
						__nextHasNoMarginBottom
						label={ __( 'WordPress Automatic Image Scaling', 'kh-images-optimizer' ) }
						checked={ settings.disableWpScaling === 1 }
						onChange={ checked => onInputChange( 'disableWpScaling', checked ? 1 : 0 ) }
						help={ __( 'WordPress automatically scales images larger than 2560px. Disable this option to allow uploads of any size.', 'kh-images-optimizer' ) }
					/>
				</div>

				<div className="khimg-field">
					<ToggleControl
						__nextHasNoMarginBottom
						label={ __( 'WordPress Thumbnail Generation', 'kh-images-optimizer' ) }
						checked={ settings.disableThumbnailGeneration === 0 }
						onChange={ checked => onInputChange( 'disableThumbnailGeneration', checked ? 0 : 1 ) }
						help={ __( 'By default, WordPress generates multiple image sizes (thumbnail, medium, large, etc.) when you upload images. Disable this option to save disk space.', 'kh-images-optimizer' ) }
					/>
				</div>

				{ settings.disableThumbnailGeneration === 0 ? (
					<div className="khimg-field">
						<h3 className="khimg-field__title">{ __( 'Individual image sizes', 'kh-images-optimizer' ) }</h3>
						<p className="khimg-field__description">
							{ __( 'Uncheck a size to stop WordPress from generating it.', 'kh-images-optimizer' ) }
						</p>
						{ imageSizes.length === 0 ? (
							<p className="khimg-empty">
								{ __( 'No image sizes detected. Save settings and refresh after re-enabling thumbnail generation.', 'kh-images-optimizer' ) }
							</p>
						) : (
							<div className="khimg-size-grid">
								{ imageSizes.map( size => (
									<CheckboxControl
										key={ size.name }
										__nextHasNoMarginBottom
										label={ size.name }
										help={ size.height
											? `${ size.width }×${ size.height }`
											: `${ size.width }×auto` }
										checked={ ! thumbnailSizes.includes( size.name ) }
										onChange={ checked => onThumbnailSizeChange( size.name, checked ) }
									/>
								) ) }
							</div>
						) }
					</div>
				) : null }
			</div>
		</section>
	)
}

const ImageQualityCard = ( {
	errors, isPremium, isSmartEnabled, onApplyPatch, onInputChange,
	settings, threshold,
} ) => (
	<section className="khimg-card" aria-labelledby="khimg-image-quality-title">
		<div className="khimg-card__header">
			<h2 className="khimg-card__title" id="khimg-image-quality-title">
				<span className="khimg-card__icon" aria-hidden="true"><SlidersHorizontal size={ 18 } /></span>
				{ __( 'Image quality', 'kh-images-optimizer' ) }
			</h2>
			<div className="khimg-card__actions">
				<Button variant="secondary" type="button" onClick={ () => onApplyPatch( IMAGE_RECOMMENDED ) }>
					{ __( 'Recommended', 'kh-images-optimizer' ) }
				</Button>
				<Button variant="tertiary" type="button" onClick={ () => onApplyPatch( IMAGE_DEFAULT ) }>
					{ __( 'Reset', 'kh-images-optimizer' ) }
				</Button>
			</div>
		</div>
		<div className="khimg-card__body">
			{ isPremium ? (
				<div className="khimg-field">
					<ToggleControl
						__nextHasNoMarginBottom
						label={ __( 'Smart Optimization', 'kh-images-optimizer' ) }
						checked={ settings.smartOptimization === 1 }
						onChange={ checked => onInputChange( 'smartOptimization', checked ? 1 : 0 ) }
						help={ __( 'Smart Optimization uses our advanced algorithms to choose the best compression and quality settings per image. This adds a small overhead to the upload process, but the results are even smaller file sizes and faster loading times.', 'kh-images-optimizer' ) }
					/>
				</div>
			) : null }

			{ ! isSmartEnabled ? (
				<div className={ errors.webpQuality ? 'khimg-field khimg-field--error' : 'khimg-field' }>
					<RangeControl
						id="khimg-webp-quality"
						label={ __( 'WebP Image Quality', 'kh-images-optimizer' ) }
						value={ settings.webpQuality || '' }
						onChange={ value => onInputChange( 'webpQuality', value || '' ) }
						min={ 1 }
						max={ 100 }
						step={ 1 }
						allowReset
						initialPosition={ 80 }
						__nextHasNoMarginBottom
						help={ __( 'Set the quality / compression level for generated .webp images. Default is 80%. Higher values mean better quality and larger file size; lower values reduce file size with more compression but lower quality.', 'kh-images-optimizer' ) }
					/>
					{ errors.webpQuality ? (
						<p className="khimg-field__error">{ errors.webpQuality }</p>
					) : null }
				</div>
			) : null }

			<div className={ errors.maxImageDimension ? 'khimg-field khimg-field--error' : 'khimg-field' }>
				<TextControl
					label={ __( 'Maximum Image Dimension', 'kh-images-optimizer' ) }
					type="number"
					value={ settings.maxImageDimension }
					placeholder={ settings.disableWpScaling === 1 && threshold ? threshold : undefined }
					onChange={ value => onInputChange( 'maxImageDimension', value ) }
					help={ sprintf(
						/* translators: %s: fallback behavior when the field is empty. */
						__( 'Maximum width or height in pixels for uploaded images. Images exceeding this dimension will be automatically resized while preserving aspect ratio. Leave empty or 0 to %s. We recommend a value of 1920px.', 'kh-images-optimizer' ),
						threshold
							? sprintf(
								/* translators: %s: WordPress auto-scaling threshold in pixels. */
								__( "use WordPress's default auto-scaling at %spx", 'kh-images-optimizer' ),
								threshold
							)
							: __( 'disable auto-scaling', 'kh-images-optimizer' )
					) }
					__nextHasNoMarginBottom
				/>
				{ errors.maxImageDimension ? (
					<p className="khimg-field__error">{ errors.maxImageDimension }</p>
				) : null }
			</div>
		</div>
	</section>
)

const StealthCard = ( {
	onApplyPatch, onInputChange, settings,
} ) => (
	<section className="khimg-card" aria-labelledby="khimg-stealth-title">
		<div className="khimg-card__header">
			<h2 className="khimg-card__title" id="khimg-stealth-title">
				<span className="khimg-card__icon" aria-hidden="true"><Shield size={ 18 } /></span>
				{ __( 'Stealth mode', 'kh-images-optimizer' ) }
			</h2>
			<div className="khimg-card__actions">
				<Button variant="tertiary" type="button" onClick={ () => onApplyPatch( STEALTH_DEFAULT ) }>
					{ __( 'Reset', 'kh-images-optimizer' ) }
				</Button>
			</div>
		</div>
		<div className="khimg-card__body">
			<div className="khimg-field">
				<ToggleControl
					__nextHasNoMarginBottom
					label={ __( 'Stealth Mode', 'kh-images-optimizer' ) }
					checked={ settings.stealthModeEnabled === 1 }
					onChange={ checked => onInputChange( 'stealthModeEnabled', checked ? 1 : 0 ) }
					help={ __( 'When enabled, the KH Images entry is hidden from the Settings menu. The page remains reachable from the Plugins screen, and the rest of the interface is unchanged.', 'kh-images-optimizer' ) }
				/>
			</div>
		</div>
	</section>
)

const SettingsRail = ( {
	dimensionLabel, isSmartEnabled, qualityLabel, settings,
} ) => (
	<aside className="khimg-settings-rail" aria-label={ __( 'Settings summary', 'kh-images-optimizer' ) }>
		<section className="khimg-card" aria-labelledby="khimg-current-setup-title">
			<div className="khimg-card__header">
				<h2 className="khimg-card__title" id="khimg-current-setup-title">
					{ __( 'Current setup', 'kh-images-optimizer' ) }
				</h2>
			</div>
			<div className="khimg-card__body">
				<ul className="khimg-rail-list">
					<li className="khimg-rail-item">
						<span className="khimg-rail-item__label">{ __( 'Quality', 'kh-images-optimizer' ) }</span>
						<span className={ `khimg-badge khimg-badge--${ isSmartEnabled ? 'info' : 'muted' }` }>
							{ qualityLabel }
						</span>
					</li>
					<li className="khimg-rail-item">
						<span className="khimg-rail-item__label">{ __( 'Max dimension', 'kh-images-optimizer' ) }</span>
						<span className="khimg-badge khimg-badge--muted">{ dimensionLabel }</span>
					</li>
					<li className="khimg-rail-item">
						<span className="khimg-rail-item__label">{ __( 'Thumbnails', 'kh-images-optimizer' ) }</span>
						<span className={ `khimg-badge khimg-badge--${ settings.disableThumbnailGeneration === 0 ? 'success' : 'muted' }` }>
							{ settings.disableThumbnailGeneration === 0
								? __( 'On', 'kh-images-optimizer' )
								: __( 'Off', 'kh-images-optimizer' ) }
						</span>
					</li>
					<li className="khimg-rail-item">
						<span className="khimg-rail-item__label">{ __( 'Stealth mode', 'kh-images-optimizer' ) }</span>
						<span className={ `khimg-badge khimg-badge--${ settings.stealthModeEnabled === 1 ? 'success' : 'muted' }` }>
							{ settings.stealthModeEnabled === 1
								? __( 'On', 'kh-images-optimizer' )
								: __( 'Off', 'kh-images-optimizer' ) }
						</span>
					</li>
				</ul>
			</div>
		</section>

		<section className="khimg-card" aria-labelledby="khimg-browser-first-title">
			<div className="khimg-card__header">
				<h2 className="khimg-card__title" id="khimg-browser-first-title">
					<span className="khimg-card__icon" aria-hidden="true"><Shield size={ 18 } /></span>
					{ __( 'Browser-first', 'kh-images-optimizer' ) }
				</h2>
			</div>
			<div className="khimg-card__body">
				<p className="khimg-rail-copy">
					{ __( 'Your images are converted in your browser before upload, so only the optimized file is sent to your server. That means less upload bandwidth and no server-side image processing.', 'kh-images-optimizer' ) }
				</p>
				<a className="khimg-link" href={ window.khimgSettings?.mediaLibraryUrl || 'upload.php' }>
					{ __( 'Open Media Library', 'kh-images-optimizer' ) }
				</a>
			</div>
		</section>
	</aside>
)

const SaveBar = ( {
	hasErrors, isSaving, onDiscard, saveMessage,
} ) => (
	<div className="khimg-savebar">
		<div className="khimg-savebar__inner">
			<div className="khimg-savebar__status">
				<span className="khimg-savebar__dot" aria-hidden="true" />
				<span>{ __( 'Unsaved changes', 'kh-images-optimizer' ) }</span>
			</div>
			<div className="khimg-savebar__actions">
				<Button variant="tertiary" type="button" onClick={ onDiscard } disabled={ isSaving }>
					<Undo2 size={ 14 } />
					{ __( 'Discard', 'kh-images-optimizer' ) }
				</Button>
				<Button
					variant="primary"
					type="submit"
					disabled={ isSaving || hasErrors }
					isBusy={ isSaving }
				>
					{ isSaving ? null : <Save size={ 14 } /> }
					{ isSaving
						? __( 'Saving…', 'kh-images-optimizer' )
						: __( 'Save changes', 'kh-images-optimizer' ) }
				</Button>
			</div>
		</div>
		{ saveMessage ? (
			<p
				className={ `khimg-savebar__message khimg-savebar__message--${ saveMessage.tone }` }
				role="status"
				aria-live="polite"
			>
				{ saveMessage.text }
			</p>
		) : null }
	</div>
)

export default function SettingsView( {
	errors, imageSizes, isPremium, isSaving, onApplyPatch, onDiscard,
	onInputChange, onSave, onThumbnailSizeChange, saveMessage, settings,
	showUnimplementedSettings, unsaved, wpScalingThreshold,
} ) {
	const isSmartEnabled = isPremium && settings.smartOptimization === 1
	const threshold = wpScalingThreshold ? String( wpScalingThreshold ) : ''
	const qualityLabel = isSmartEnabled
		? __( 'Smart', 'kh-images-optimizer' )
		: settings.webpQuality
			? `${ settings.webpQuality }%`
			: __( 'Default (80%)', 'kh-images-optimizer' )
	const dimensionLabel = hasPositiveDimension( settings.maxImageDimension )
		? `${ settings.maxImageDimension }px`
		: threshold
			? sprintf(
				/* translators: %s: WordPress auto-scaling threshold in pixels. */
				__( 'Default (%spx)', 'kh-images-optimizer' ),
				threshold
			)
			: __( 'No limit', 'kh-images-optimizer' )

	return (
		<>
			<PageHeader
				title={ __( 'Settings', 'kh-images-optimizer' ) }
				subtitle={ __( 'Choose how KH Images handles uploads, quality and WordPress image sizes.', 'kh-images-optimizer' ) }
				actions={ ! unsaved ? (
					<span className="khimg-saved-status" role="status" aria-live="polite">
						<CheckCircle2 size={ 14 } />
						{ __( 'All changes saved', 'kh-images-optimizer' ) }
					</span>
				) : null }
			/>

			<form className="khimg-settings-form" onSubmit={ onSave } noValidate>
				<div className="khimg-settings-layout">
					<div className="khimg-settings-main">
						<UploadBehaviorCard
							imageSizes={ imageSizes }
							onApplyPatch={ onApplyPatch }
							onInputChange={ onInputChange }
							onThumbnailSizeChange={ onThumbnailSizeChange }
							settings={ settings }
						/>
						<ImageQualityCard
							errors={ errors }
							isPremium={ isPremium }
							isSmartEnabled={ isSmartEnabled }
							onApplyPatch={ onApplyPatch }
							onInputChange={ onInputChange }
							settings={ settings }
							threshold={ threshold }
						/>
						<StealthCard
							onApplyPatch={ onApplyPatch }
							onInputChange={ onInputChange }
							settings={ settings }
						/>
						{ showUnimplementedSettings ? (
							<p className="khimg-muted-note">
								{ __( 'Experimental settings are not included in this build.', 'kh-images-optimizer' ) }
							</p>
						) : null }
					</div>

					<SettingsRail
						dimensionLabel={ dimensionLabel }
						isSmartEnabled={ isSmartEnabled }
						qualityLabel={ qualityLabel }
						settings={ settings }
					/>
				</div>

				{ unsaved ? (
					<SaveBar
						hasErrors={ Object.keys( errors ).length > 0 }
						isSaving={ isSaving }
						onDiscard={ onDiscard }
						saveMessage={ saveMessage }
					/>
				) : null }
			</form>
		</>
	)
}
