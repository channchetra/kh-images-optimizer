/**
 * Inline Lucide-style line icons for the KH Images dashboard.
 *
 * Every icon uses the same 24x24 viewBox, inherits `currentColor`, and is
 * hidden from assistive technology unless a `label` is supplied.
 */

const Svg = ( {
	children, className, label, size = 16, ...rest
} ) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={ size }
		height={ size }
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth={ 2 }
		strokeLinecap="round"
		strokeLinejoin="round"
		className={ className ? `khimg-icon ${ className }` : 'khimg-icon' }
		aria-hidden={ label ? undefined : true }
		role={ label ? 'img' : undefined }
		focusable="false"
		{ ...rest }
	>
		{ label ? <title>{ label }</title> : null }
		{ children }
	</svg>
)

export const Gauge = props => (
	<Svg { ...props }>
		<path d="m12 14 4-4" />
		<path d="M3.34 19a10 10 0 1 1 17.32 0" />
	</Svg>
)

export const Images = props => (
	<Svg { ...props }>
		<path d="M18 22H4a2 2 0 0 1-2-2V6" />
		<path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18" />
		<circle cx="12" cy="8" r="2" />
		<rect width="16" height="16" x="6" y="2" rx="2" />
	</Svg>
)

export const SlidersHorizontal = props => (
	<Svg { ...props }>
		<line x1="21" x2="14" y1="4" y2="4" />
		<line x1="10" x2="3" y1="4" y2="4" />
		<line x1="21" x2="12" y1="12" y2="12" />
		<line x1="8" x2="3" y1="12" y2="12" />
		<line x1="21" x2="16" y1="20" y2="20" />
		<line x1="12" x2="3" y1="20" y2="20" />
		<line x1="14" x2="14" y1="2" y2="6" />
		<line x1="8" x2="8" y1="10" y2="14" />
		<line x1="16" x2="16" y1="18" y2="22" />
	</Svg>
)

export const Cloud = props => (
	<Svg { ...props }>
		<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
	</Svg>
)

export const CloudOff = props => (
	<Svg { ...props }>
		<path d="m2 2 20 20" />
		<path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193" />
		<path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07" />
	</Svg>
)

export const Zap = props => (
	<Svg { ...props }>
		<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
	</Svg>
)

export const Shield = props => (
	<Svg { ...props }>
		<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
	</Svg>
)

export const Search = props => (
	<Svg { ...props }>
		<circle cx="11" cy="11" r="8" />
		<path d="m21 21-4.3-4.3" />
	</Svg>
)

export const RefreshCw = props => (
	<Svg { ...props }>
		<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
		<path d="M21 3v5h-5" />
		<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
		<path d="M8 16H3v5" />
	</Svg>
)

export const CheckCircle2 = props => (
	<Svg { ...props }>
		<circle cx="12" cy="12" r="10" />
		<path d="m9 12 2 2 4-4" />
	</Svg>
)

export const AlertTriangle = props => (
	<Svg { ...props }>
		<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
		<path d="M12 9v4" />
		<path d="M12 17h.01" />
	</Svg>
)

export const X = props => (
	<Svg { ...props }>
		<path d="M18 6 6 18" />
		<path d="m6 6 12 12" />
	</Svg>
)

export const ArrowRight = props => (
	<Svg { ...props }>
		<path d="M5 12h14" />
		<path d="m12 5 7 7-7 7" />
	</Svg>
)

export const Sparkles = props => (
	<Svg { ...props }>
		<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
		<path d="M20 3v4" />
		<path d="M22 5h-4" />
		<path d="M4 17v2" />
		<path d="M5 18H3" />
	</Svg>
)

export const Image = props => (
	<Svg { ...props }>
		<rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
		<circle cx="9" cy="9" r="2" />
		<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
	</Svg>
)

export const Download = props => (
	<Svg { ...props }>
		<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
		<polyline points="7 10 12 15 17 10" />
		<line x1="12" x2="12" y1="15" y2="3" />
	</Svg>
)

export const RotateCcw = props => (
	<Svg { ...props }>
		<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
		<path d="M3 3v5h5" />
	</Svg>
)

export const ExternalLink = props => (
	<Svg { ...props }>
		<path d="M15 3h6v6" />
		<path d="M10 14 21 3" />
		<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
	</Svg>
)

export const Info = props => (
	<Svg { ...props }>
		<circle cx="12" cy="12" r="10" />
		<path d="M12 16v-4" />
		<path d="M12 8h.01" />
	</Svg>
)

export const Save = props => (
	<Svg { ...props }>
		<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
		<path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
		<path d="M7 3v4a1 1 0 0 0 1 1h7" />
	</Svg>
)

export const Undo2 = props => (
	<Svg { ...props }>
		<path d="M9 14 4 9l5-5" />
		<path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
	</Svg>
)

export const ChevronLeft = props => (
	<Svg { ...props }>
		<path d="m15 18-6-6 6-6" />
	</Svg>
)

export const ChevronRight = props => (
	<Svg { ...props }>
		<path d="m9 18 6-6-6-6" />
	</Svg>
)

export const Play = props => (
	<Svg { ...props }>
		<path d="M6 3v18l14-9z" />
	</Svg>
)

export const Loader2 = props => (
	<Svg { ...props }>
		<path d="M21 12a9 9 0 1 1-6.219-8.56" />
	</Svg>
)
