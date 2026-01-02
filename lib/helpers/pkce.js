const crypto = require('crypto');

/**
 * Generate PKCE code_verifier and code_challenge.
 * @returns {{ codeVerifier: string, codeChallenge: string }}
 */
function generatePkcePair() {
    // Generate code_verifier (43-128 characters, URL-safe base64)
    const codeVerifier = crypto.randomBytes(32)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    // Generate code_challenge (SHA256 hash of verifier, URL-safe base64)
    const hash = crypto.createHash('sha256')
        .update(codeVerifier)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    return { codeVerifier, codeChallenge: hash };
}

module.exports = { generatePkcePair };