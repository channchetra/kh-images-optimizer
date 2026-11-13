import { createRoot } from '@wordpress/element'
import './bulk-optimization'
import AdminSettings from './admin-settings'

// Only render on the KH Images admin page
const container = document.getElementById( 'khimg-admin-settings' )
if ( container ) {
	const root = createRoot( container )
	root.render( <AdminSettings /> )
}
