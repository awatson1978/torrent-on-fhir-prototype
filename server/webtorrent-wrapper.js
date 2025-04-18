/**
 * Simple wrapper for WebTorrent package to avoid import issues
 * This pattern avoids the dynamic import and top-level await issues
 */

// We'll use synchronous require
let WebTorrent;

try {
  WebTorrent = require('webtorrent');
  console.log('WebTorrent loaded successfully in wrapper');
} catch (e) {
  console.error('Failed to load WebTorrent in wrapper:', e);
  try {
    const path = require('path');
    const npmPath = path.join(process.cwd(), 'node_modules', 'webtorrent');
    WebTorrent = require(npmPath);
    console.log('WebTorrent loaded from npm path in wrapper');
  } catch (e2) {
    console.error('Failed to load WebTorrent from npm path in wrapper:', e2);
  }
}

// Export the required WebTorrent constructor
module.exports = function() {
  if (!WebTorrent) {
    throw new Error('WebTorrent is not available');
  }
  return WebTorrent;
};