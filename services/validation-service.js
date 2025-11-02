/**
 * JavaScript wrapper for ValidationService
 * This allows JavaScript claimers to use the TypeScript ValidationService
 */

// Import the compiled TypeScript ValidationService
const ValidationService = require('../dist/backend/backend/src/services/ValidationService').default;
module.exports = ValidationService;