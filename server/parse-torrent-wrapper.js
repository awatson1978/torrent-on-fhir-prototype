// server/parse-torrent-wrapper.js
/**
 * Safely import parse-torrent module to avoid the "parseTorrent is not a function" error
 * ES6 version
 */

// Helper function to extract name from magnet URI
const extractNameFromMagnet = function(magnetUri) {
  const nameMatch = magnetUri.match(/dn=([^&]+)/);
  if (nameMatch && nameMatch[1]) {
    try {
      return decodeURIComponent(nameMatch[1]);
    } catch (e) {
      return nameMatch[1];
    }
  }
  return 'Unnamed Torrent';
};

// Try different ways to import the module
let parseTorrent;

try {
  // Using dynamic import would be more ES6, but Meteor might have issues with it
  // in server context, so using require is more reliable
  parseTorrent = require('parse-torrent');
  console.log('Successfully imported parse-torrent directly');
} catch (err) {
  console.warn('Failed to import parse-torrent directly:', err.message);
  
  try {
    // Try to find it in the node_modules directory
    const path = require('path');
    const npmPath = path.join(process.cwd(), 'node_modules', 'parse-torrent');
    parseTorrent = require(npmPath);
    console.log('Successfully imported parse-torrent from npm path');
  } catch (err2) {
    console.warn('Failed to import parse-torrent from npm path:', err2.message);
    
    // Provide a basic implementation that can at least extract the info hash
    parseTorrent = function(input) {
      // Handle magnet links
      if (typeof input === 'string' && input.startsWith('magnet:')) {
        const infoHashMatch = input.match(/xt=urn:btih:([a-zA-Z0-9]+)/i);
        if (infoHashMatch && infoHashMatch[1]) {
          return {
            infoHash: infoHashMatch[1].toLowerCase(),
            name: extractNameFromMagnet(input)
          };
        }
      }
      
      throw new Error('Could not parse torrent identifier');
    };
    
    console.log('Using fallback parseTorrent implementation');
  }
}

// Export as ES6 default export
export default parseTorrent;