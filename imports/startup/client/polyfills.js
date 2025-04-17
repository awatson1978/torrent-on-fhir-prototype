// Create this file in imports/startup/client/polyfills.js

// Core Node.js module polyfills for browser environment
global.Buffer = global.Buffer || require('buffer').Buffer;
global.process = global.process || require('process/browser');
global.EventEmitter = global.EventEmitter || require('events').EventEmitter;

// Fetch API polyfill (needed for WebTorrent's HTTP trackers)
global.fetch = global.fetch || require('cross-fetch-ponyfill')();

// Mock Node.js modules that don't work in the browser
// This is specifically needed for WebTorrent which tries to use dgram
global.dgram = {
  createSocket: function() {
    console.log('Mock dgram.createSocket called');
    return {
      on: function() {},
      bind: function() {},
      close: function() {},
      send: function() {}
    };
  }
};

// Mock dns module that WebTorrent might try to use
global.dns = {
  lookup: function(hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    // Just return the hostname as the address in the browser
    setTimeout(() => {
      callback(null, hostname, 4);
    }, 0);
  }
};

// Mock net module
global.net = {
  isIP: function() { return false; },
  isIPv4: function() { return false; },
  isIPv6: function() { return false; },
  connect: function() {
    return {
      on: function() {},
      write: function() {},
      end: function() {}
    };
  }
};

// Console message to confirm polyfills are loaded
console.log('Node.js polyfills loaded for browser environment');

// Export for explicit imports if needed
export const polyfills = {
  buffer: global.Buffer,
  process: global.process,
  EventEmitter: global.EventEmitter,
  fetch: global.fetch,
  dgram: global.dgram,
  dns: global.dns,
  net: global.net
};