/**
 * This script is in charge of keeping track of the metadata for the image
 * conversion, then whenever a new metadata comes in along with the filename,
 * after a short delay, we need to trigger a POST in order to save to the server
 * the metadata of the image conversion.
 */

/**
 * Saves metadata to the server via REST API.
 * Each metadata object must include a 'filename' key.
 * @param {Array<Object>} _metadataArray - Array of metadata objects (each must have a filename key)
 */
export const saveMetadata = _metadataArray => {
	const { isFrontend = false, isLoggedIn = false } = window.khimgSettings ?? {}

	// If we're on the frontend and the user is not logged in, we can't save metadata, so we just return.
	if ( isFrontend && ! isLoggedIn ) {
		return Promise.resolve()
	}

	if ( ! Array.isArray( _metadataArray ) ) {
		return Promise.resolve()
	}

	// Filter out all the null values. If we have a null value that means it didn't have any metadata to save.
	const metadataArray = _metadataArray.filter( entry => entry !== null )

	if ( metadataArray.length === 0 ) {
		return Promise.resolve()
	}

	// Mark all as successful in cache, keep a local copy of the metadata
	metadataArray.forEach( entry => {
		if ( entry.filename ) {
			setCachedMetadata( entry.filename, entry )
		}
	} )

	return new Promise( ( resolve, reject ) => {
		fetch( `${ window.khimgSettings?.restUrl || '/wp-json/khimg/v1/' }metadata`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				'X-WP-Nonce': window.khimgSettings?.nonce || window.wpApiSettings?.nonce,
			},
			body: JSON.stringify( {
				metadata: metadataArray,
			} ),
			credentials: 'same-origin',
		} )
			.then( response => {
				if ( ! response.ok ) {
					return response.json().then( err => {
						const newError = new Error( err.message || response.statusText )
						newError.status = response.status
						newError.code = err.code

						throw newError
					} )
				}
				return response.json()
			} )
			.then( data => {
				resolve( data )
			} )
			.catch( error => {
				const isUnauthorized = error.status === 401 ||
					error.status === 403 ||
					error.code === 'rest_cannot_create' ||
					error.code === 'rest_forbidden'

				if ( isUnauthorized ) {
					resolve()
					return
				}

				// eslint-disable-next-line no-console
				console.error(
					`Failed to save metadata for filenames: [${ metadataArray.map( m => m.filename ).join( ', ' ) }]:`,
					error
				)
				reject(
					new Error(
						`Failed to save metadata: ${ error.message }`
					)
				)
			} )
	} )
}

export const setCachedMetadata = ( filename, metadata ) => {
	// Initialize cache if it doesn't exist
	if ( ! window.khimgMetadataCache ) {
		window.khimgMetadataCache = {}
	}

	window.khimgMetadataCache[ filename.replaceAll( /\s+/g, '-' ) ] = { ...metadata }
}

export const getCachedMetadata = filename => {
	return window.khimgMetadataCache?.[ filename?.replaceAll( /\s+/g, '-' ) ] ||
		null
}
