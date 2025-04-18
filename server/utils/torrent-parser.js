import { Meteor } from 'meteor/meteor';
let parseTorrent = null;

try {
  parseTorrent = require('parse-torrent');
} catch (err) {
  console.error('Error loading parse-torrent:', err);
}

export const TorrentParser = {
  /**
   * Parse a torrent ID (magnet URI, info hash, etc.)
   * @param {String} torrentId - Torrent ID to parse
   * @return {Object} Parsed torrent info
   */
  parse: function(torrentId) {
    if (!parseTorrent) {
      throw new Meteor.Error('parser-unavailable', 'Torrent parser not available');
    }
    
    try {
      return parseTorrent(torrentId);
    } catch (err) {
      console.error('Error parsing torrent ID:', err);
      throw new Meteor.Error('parse-error', `Could not parse torrent ID: ${err.message}`);
    }
  },
  
  /**
   * Parse a magnet URI
   * @param {String} magnetURI - Magnet URI to parse
   * @return {Object} Parsed magnet info
   */
  parseMagnet: function(magnetURI) {
    if (!magnetURI || !magnetURI.startsWith('magnet:?')) {
      throw new Meteor.Error('invalid-magnet', 'Invalid magnet URI');
    }
    
    try {
      if (parseTorrent) {
        return parseTorrent(magnetURI);
      }
      
      // Fallback implementation if parse-torrent is unavailable
      const params = new URLSearchParams(magnetURI.substring(8));
      const xt = params.get('xt') || '';
      
      let infoHash = null;
      if (xt.startsWith('urn:btih:')) {
        infoHash = xt.substring(9);
      }
      
      if (!infoHash) {
        throw new Meteor.Error('parse-error', 'Could not extract info hash from magnet URI');
      }
      
      const name = params.get('dn') || null;
      
      const trackers = [];
      params.forEach(function(value, key) {
        if (key === 'tr') {
          trackers.push(value);
        }
      });
      
      return {
        infoHash,
        name,
        announce: trackers,
        urlList: []
      };
    } catch (err) {
      console.error('Error parsing magnet URI:', err);
      throw new Meteor.Error('parse-error', `Could not parse magnet URI: ${err.message}`);
    }
  }
};