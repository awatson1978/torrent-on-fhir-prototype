// imports/api/torrents/browser-webtorrent.js
import { Meteor } from 'meteor/meteor';
import { get } from 'lodash';

/**
 * Browser-specific WebTorrent helper functions
 * This module handles the differences between Node.js and browser WebTorrent usage
 */
export const BrowserWebTorrent = {
  /**
   * Import WebTorrent in a browser-friendly way
   * @return {Promise<Object>} WebTorrent constructor
   */
  importWebTorrent: async function() {
    try {
      // Try the browser-specific bundle first
      const WebTorrentModule = await import('webtorrent/webtorrent.min.js');
      console.log('Loaded WebTorrent browser bundle');
      return WebTorrentModule.default || WebTorrentModule;
    } catch (err) {
      console.warn('Failed to load WebTorrent browser bundle, trying main module:', err);
      
      try {
        // Fall back to main module
        const WebTorrentModule = await import('webtorrent');
        console.log('Loaded WebTorrent main module');
        return WebTorrentModule.default || WebTorrentModule;
      } catch (finalErr) {
        console.error('All WebTorrent import attempts failed:', finalErr);
        throw new Error('Failed to load WebTorrent module: ' + finalErr.message);
      }
    }
  },
  
  /**
   * Get browser-specific WebTorrent configuration
   * @param {Object} config - Base configuration
   * @return {Object} Browser-compatible configuration
   */
  getBrowserConfig: function(config) {
    return {
      // Use trackers from config
      tracker: config.tracker,
      
      // Use announce list if provided
      announce: config.announceList,
      
      // Disable features that don't work in browsers
      dht: false,        // DHT requires Node-specific modules
      tcpPool: false,    // TCP requires Node-specific modules
      nodeId: null,      // Node ID not needed in browser
      lsd: false,        // Local Service Discovery not supported in browser
      
      // Keep browser-compatible features
      webSeeds: config.webSeeds || true
    };
  },
  
  /**
   * Create a magnet URI from torrent info
   * @param {Object} torrentInfo - Torrent info including infoHash and name
   * @param {Array} trackers - Array of tracker URLs
   * @return {String} Magnet URI
   */
  createMagnetURI: function(torrentInfo, trackers = []) {
    if (!torrentInfo || !torrentInfo.infoHash) {
      throw new Error('Invalid torrent info: missing infoHash');
    }
    
    // Base magnet URI with info hash
    let magnetURI = `magnet:?xt=urn:btih:${torrentInfo.infoHash}`;
    
    // Add name if available
    if (torrentInfo.name) {
      magnetURI += `&dn=${encodeURIComponent(torrentInfo.name)}`;
    }
    
    // Add trackers
    trackers.forEach(function(tracker) {
      magnetURI += `&tr=${encodeURIComponent(tracker)}`;
    });
    
    return magnetURI;
  },
  
  /**
   * Parse a magnet URI to extract info
   * @param {String} magnetURI - Magnet URI to parse
   * @return {Object} Parsed torrent info
   */
  parseMagnetURI: function(magnetURI) {
    if (!magnetURI || !magnetURI.startsWith('magnet:?')) {
      throw new Error('Invalid magnet URI');
    }
    
    // Parse URI parts
    const params = new URLSearchParams(magnetURI.substring(8));
    const xt = params.get('xt') || '';
    
    // Extract info hash
    let infoHash = null;
    if (xt.startsWith('urn:btih:')) {
      infoHash = xt.substring(9);
    }
    
    if (!infoHash) {
      throw new Error('Could not extract info hash from magnet URI');
    }
    
    // Get name
    const name = params.get('dn') || null;
    
    // Get trackers
    const trackers = [];
    params.forEach(function(value, key) {
      if (key === 'tr') {
        trackers.push(value);
      }
    });
    
    return {
      infoHash,
      name,
      trackers
    };
  }
};