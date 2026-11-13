/**
 * Bulk Optimization - Register component via WordPress hooks.
 */
import { addFilter } from '@wordpress/hooks'
import BulkOptimizer from './BulkOptimizer'

addFilter(
	'khimg.admin.settings.bulkOptimizationComponent',
	'khimg/bulk-optimization',
	() => BulkOptimizer
)
