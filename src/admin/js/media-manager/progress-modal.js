import { __ } from '@wordpress/i18n'

class ProgressModal {
	constructor( converters = [], closeHandler = null ) {
		this.converters = Array.isArray( converters )
			? converters.filter( c => c?.showProgress === true )
			: []
		this.closeHandler = typeof closeHandler === 'function' ? closeHandler : null
		this.interval = null
		this.modal = null
		this.progressBars = []
		this.delayTimeout = null
		this._closing = false
	}

	open() {
		if ( this.converters.length === 0 ) {
			return
		}

		const delays = this.converters
			.map( c => c?.progressDelay )
			.filter( v => typeof v === 'number' && v > 0 )

		// Only delay if all converter opt to delay, to allow
		// big media files like video to show the progress modal immediately.
		const shouldDelay = delays.length === this.converters.length
		const delay = shouldDelay ? Math.max( ...delays ) : 0

		const start = () => {
			this._setupModal()
			this.modal.style.display = 'flex'
			this._startInterval()
		}

		if ( delay > 0 ) {
			this.delayTimeout = setTimeout( start, delay )
		} else {
			start()
		}
	}

	_handleCloseClick() {
		// eslint-disable-next-line no-alert
		const confirmed = confirm(
			__( 'Closing this dialog will cancel the uploading process. Are you sure you want to continue?', 'kh-images-optimizer' )
		)
		if ( confirmed ) {
			if ( this.closeHandler ) {
				this.closeHandler()
			}
			this.close()
		}
	}

	close() {
		if ( this._closing ) {
			return
		}
		if ( this.delayTimeout ) {
			clearTimeout( this.delayTimeout )
			this.delayTimeout = null
		}
		if ( ! this.modal ) {
			return
		}
		if ( this.converters.length === 0 ) {
			return
		}
		this._closing = true
		setTimeout( () => {
			if ( ! this.modal ) {
				this._closing = false
				return
			}
			this.modal.style.display = 'none'
			this._stopInterval()
			this.modal.remove()
			this.modal = null
			this._closing = false
		}, 300 )
	}

	_setupModal() {
		// Create overlay
		this.modal = document.createElement( 'div' )
		this.modal.className = 'khimg-progress-modal'
		this.modal.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			width: 100vw;
			height: 100vh;
			background: rgba(0,0,0,0.35);
			display: none;
			justify-content: center;
			align-items: center;
			z-index: 9999999;
		`

		this.modal.addEventListener( 'mousedown', event => {
			event.preventDefault()
			event.stopPropagation()
			event.stopImmediatePropagation()
		} )

		const wrapper = document.createElement( 'div' )
		wrapper.className = 'khimg-progress-wrapper'
		wrapper.style.cssText = `
			background: #fff;
			border-radius: 8px;
			padding: 2em 2em 1em 2em;
			max-width: 500px;
			box-shadow: 0 6px 32px rgba(0,0,0,0.24);
			position: relative;
			width: 90%;
		`

		const title = document.createElement( 'h3' )
		title.className = 'khimg-progress-title'
		title.innerText = __( 'Optimizing your files', 'kh-images-optimizer' )
		title.style.cssText = `
			font-size: 1.6em !important;
			font-weight: 600 !important;
			margin: 0 0 0.5em !important;
		`
		wrapper.appendChild( title )

		const subtitle = document.createElement( 'div' )
		subtitle.className = 'khimg-progress-subtitle'
		subtitle.innerText = __( 'Preparing your files for upload…', 'kh-images-optimizer' )
		subtitle.style.cssText = `
			margin-bottom: 2em;
		`
		wrapper.appendChild( subtitle )

		this.errorNote = document.createElement( 'div' )
		this.errorNote.className = 'khimg-progress-error-note'
		this.errorNote.innerText = __( 'Some media files could not be optimized and were uploaded in their original format.', 'kh-images-optimizer' )
		this.errorNote.style.cssText = `
			display: none;
			background: #fff3cd;
			color: #856404;
			border: 1px solid #ffeeba;
			border-radius: 8px;
			padding: 1em;
			margin-bottom: 1.5em;
			font-size: 1em;
		`
		wrapper.appendChild( this.errorNote )

		if ( this.closeHandler ) {
			const closeBtn = document.createElement( 'button' )
			closeBtn.className = 'khimg-progress-close'
			closeBtn.type = 'button'
			closeBtn.innerHTML = '&times;'
			closeBtn.style.cssText = `
				position: absolute;
				top: 0.7em;
				right: 1em;
				background: transparent;
				border: none;
				font-size: 2em;
				cursor: pointer;
				color: #888;
			`
			closeBtn.addEventListener( 'click', () => this._handleCloseClick() )
			wrapper.appendChild( closeBtn )
		}

		this.progressBars = []
		this.progressList = document.createElement( 'div' )
		this.progressList.className = 'khimg-progress-list'
		wrapper.appendChild( this.progressList )

		this.modal.appendChild( wrapper )
		document.body.appendChild( this.modal )

		this._ensureIndeterminateStyles()
		this._renderProgressBars()
	}

	_ensureIndeterminateStyles() {
		if ( document.getElementById( 'khimg-progress-indeterminate-styles' ) ) {
			return
		}
		const style = document.createElement( 'style' )
		style.id = 'khimg-progress-indeterminate-styles'
		style.textContent = `
			.khimg-progress-indeterminate-layer {
				display: none;
				position: absolute;
				inset: 0;
				overflow: hidden;
				border-radius: inherit;
				pointer-events: none;
			}
			.khimg-progress-indeterminate-bar {
				position: absolute;
				top: 0;
				left: -35%;
				width: 35%;
				height: 100%;
				border-radius: 5px;
				background: linear-gradient(90deg, #00d8f0 0%, #2bc566 100%);
				animation: khimg-indet-sweep 1.35s ease-in-out infinite;
			}
			@keyframes khimg-indet-sweep {
				from { left: -35%; }
				to { left: 100%; }
			}
		`
		document.head.appendChild( style )
	}

	_renderProgressBars() {
		this.progressList.innerHTML = ''
		this.progressBars = []

		this.converters.forEach( ( converter, i ) => {
			const barContainer = document.createElement( 'div' )
			barContainer.className = 'khimg-progress-bar-container'
			barContainer.style.cssText = `
				margin-bottom: 1em;
				padding: 16px 16px 16px 70px;
				border: 1px solid #e2e8f0;
				border-radius: 12px;
				position: relative;
			`

			const icon = document.createElement( 'span' )
			icon.className = 'khimg-stat-icon'
			icon.style.cssText = `
				background: #16a2491a;
				color: #16a249;
				padding: 8px;
				border-radius: 8px;
				margin-bottom: 8px;
				display: flex;
				align-items: center;
				justify-content: center;
				position: absolute;
				left: 16px;
				top: 16px;
			`

			let iconSvg = ''
			if ( converter.file && converter.file.type && converter.file.type.startsWith( 'video/' ) ) {
				iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-video-icon lucide-video"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>`
			} else if ( converter.file && converter.file.type && converter.file.type.startsWith( 'audio/' ) ) {
				iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-music-icon lucide-music"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`
			} else {
				iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-icon lucide-image"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`
			}
			icon.innerHTML = iconSvg

			barContainer.appendChild( icon )

			const label = document.createElement( 'div' )
			label.className = 'khimg-progress-label'
			label.innerText = converter.file?.name || `File ${ i + 1 }`
			label.style.cssText = `
				margin-bottom: 0.2em;
				font-size: 1em;
				font-weight: 600;
				max-width: 80%;
				white-space: nowrap;
				text-overflow: ellipsis;
				overflow: hidden;
			`

			const sizeLabel = document.createElement( 'div' )
			sizeLabel.className = 'khimg-size-label'
			sizeLabel.innerText = converter.file && converter.file.size
				? ( ( converter.file.size / 1024 / 1024 ) >= 1
					? ( converter.file.size / 1024 / 1024 ).toFixed( 2 ) + ' MB'
					: ( converter.file.size / 1024 ).toFixed( 1 ) + ' KB' )
				: ''
			sizeLabel.style.cssText = `
				margin-bottom: 0.5em;
				font-size: 1em;
			`

			const progressStatusFlex = document.createElement( 'div' )
			progressStatusFlex.style.cssText = `
				display: flex;
				align-items: center;
				justify-content: space-between;
				margin-bottom: 0.5em;
			`

			const statusLabel = document.createElement( 'div' )
			statusLabel.className = 'khimg-progress-status-label'
			statusLabel.innerText = ''
			statusLabel.style.cssText = `
				font-size: 1em;
				color: #3b3b3b;
			`

			const percentageLabel = document.createElement( 'div' )
			percentageLabel.className = 'khimg-percentage-label'
			percentageLabel.innerText = `0%`
			percentageLabel.style.cssText = `
				font-size: 1em;
			`

			progressStatusFlex.appendChild( statusLabel )
			progressStatusFlex.appendChild( percentageLabel )

			const barBg = document.createElement( 'div' )
			barBg.className = 'khimg-progress-bar-bg'
			barBg.style.cssText = `
				background: #e8ecef;
				border-radius: 5px;
				height: 8px;
				width: 100%;
				overflow: hidden;
				position: relative;
			`
			const indeterminateLayer = document.createElement( 'div' )
			indeterminateLayer.className = 'khimg-progress-indeterminate-layer'
			const indeterminateBar = document.createElement( 'div' )
			indeterminateBar.className = 'khimg-progress-indeterminate-bar'
			indeterminateLayer.appendChild( indeterminateBar )

			const bar = document.createElement( 'div' )
			bar.className = 'khimg-progress-bar'
			bar.style.cssText = `
				background: linear-gradient(90deg, #00d8f0 0%, #2bc566 100%);
				width: 0%;
				height: 100%;
				transition: width 0.65s cubic-bezier(0.4, 0, 0.2, 1);
				border-radius: 5px 0 0 5px;
			`

			bar.sizeLabelEl = sizeLabel
			bar.statusLabelEl = statusLabel
			bar.percentageLabelEl = percentageLabel
			bar.indeterminateLayer = indeterminateLayer

			barBg.appendChild( bar )
			barBg.appendChild( indeterminateLayer )
			barContainer.appendChild( label )
			barContainer.appendChild( sizeLabel )
			barContainer.appendChild( progressStatusFlex )
			barContainer.appendChild( barBg )
			this.progressList.appendChild( barContainer )
			this.progressBars.push( bar )
		} )
	}

	_startInterval() {
		if ( this.interval ) {
			return
		}
		this._updateProgress()
		this.interval = setInterval( () => this._updateProgress(), 500 )
	}

	_stopInterval() {
		if ( this.interval ) {
			clearInterval( this.interval )
			this.interval = null
		}
	}

	_updateProgress() {
		if ( ! this.modal ) {
			return
		}

		let allDone = true
		let hasError = false

		this.converters.forEach( ( converter, i ) => {
			const barEl = this.progressBars[ i ]
			const isIndeterminate = converter.indeterminateProgress === true &&
				converter.progress < 1 &&
				! converter.errorMessage

			let percent = converter.progress * 100

			if (
				typeof percent !== 'number' ||
				isNaN( percent ) ||
				percent < 0
			) {
				percent = 0
			}
			if ( percent >= 100 ) {
				percent = 100
			}
			if ( percent < 100 ) {
				allDone = false
			}

			if ( converter.errorMessage ) {
				hasError = true
				this.errorNote.style.display = 'block'
			}

			if ( barEl ) {
				barEl.statusLabelEl.style.cssText = `
					color: ${ converter.errorMessage ? '#dc3545' : 'inherit' };
				`
				barEl.statusLabelEl.innerText = converter.errorMessage || converter.status

				if ( isIndeterminate ) {
					barEl.style.display = 'none'
					if ( barEl.indeterminateLayer ) {
						barEl.indeterminateLayer.style.display = 'block'
					}
					barEl.percentageLabelEl.innerText = __( '…', 'kh-images-optimizer' )
				} else {
					barEl.style.display = ''
					if ( barEl.indeterminateLayer ) {
						barEl.indeterminateLayer.style.display = 'none'
					}
					barEl.style.width = percent + '%'
					barEl.percentageLabelEl.innerText = parseInt( percent ) + '%'
				}
			}
		} )

		if ( allDone && this.modal && this.modal.style.display !== 'none' ) {
			if ( ! hasError ) {
				setTimeout( () => this.close(), 750 )
			}
		}
	}
}

export { ProgressModal }
