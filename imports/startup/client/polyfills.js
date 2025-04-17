// Create this file in imports/startup/client/polyfills.js

// Core Node.js module polyfills for browser environment
global.Buffer = global.Buffer || require('buffer').Buffer;
global.process = global.process || require('process/browser');
global.EventEmitter = global.EventEmitter || require('events').EventEmitter;

// Fetch API polyfill (needed for WebTorrent's HTTP trackers)
global.fetch = global.fetch || require('cross-fetch-ponyfill')();

// Console message to confirm polyfills are loaded
console.log('Node.js polyfills loaded for browser environment');

// Export for explicit imports if needed
export const polyfills = {
  buffer: global.Buffer,
  process: global.process,
  EventEmitter: global.EventEmitter,
  fetch: global.fetch
};