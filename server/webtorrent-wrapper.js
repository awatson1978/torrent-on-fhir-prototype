/**
 * Simple wrapper for WebTorrent package to avoid import issues
 * This pattern avoids the dynamic import and top-level await issues
 */

// We'll use synchronous require
let WebTorrent;

try {
  WebTorrent = require('webtorrent');
} catch (e) {
  console.error('Failed to load WebTorrent:', e);
}

// Export the required WebTorrent constructor
module.exports = function() {
  if (!WebTorrent) {
    throw new Error('WebTorrent is not available');
  }
  return WebTorrent;
};