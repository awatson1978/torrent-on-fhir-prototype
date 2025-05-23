// server/main.js - Enhanced environment variable integration

import { Meteor } from 'meteor/meteor';
import { get } from 'lodash';
import fs from 'fs';

Meteor.startup(async () => {
  console.log('Starting FHIR P2P server with enhanced environment configuration...');
  
  // Enhanced environment variable loading with WebTorrent-specific settings
  const loadEnhancedEnvSettings = function() {
    // Extended mapping for WebTorrent TCP configuration
    const envMappings = {
      // Original mappings
      'WEBTORRENT_TRACKERS': 'public.webtorrent.trackers',
      'WEBTORRENT_DHT': 'public.webtorrent.dht',
      'WEBTORRENT_WEBSEEDS': 'public.webtorrent.webSeeds',
      'FHIR_VALIDATION_LEVEL': 'public.fhir.validationLevel',
      'FHIR_DEFAULT_FORMAT': 'public.fhir.defaultFormat',
      'UI_THEME': 'public.ui.theme',
      'UI_DENSITY': 'public.ui.density',
      'STORAGE_TEMP_PATH': 'private.storage.tempPath',
      'DEBUG': 'private.debug',
      
      // Enhanced WebTorrent TCP configuration
      'WEBTORRENT_TCP_POOL_ENABLED': 'public.webtorrent.tcpPoolEnabled',
      'WEBTORRENT_FORCE_TCP_PORT': 'public.webtorrent.forceTcpPort',
      'WEBTORRENT_TCP_BIND_ADDRESS': 'public.webtorrent.tcpBindAddress',
      'WEBTORRENT_MAX_CONNECTIONS': 'public.webtorrent.maxConnections',
      'WEBTORRENT_ARM64_FIX': 'public.webtorrent.arm64Fix',
      'WEBTORRENT_NODE22_COMPAT': 'public.webtorrent.node22Compat',
      'WEBTORRENT_USE_HTTP_TRACKERS': 'public.webtorrent.useHttpTrackers',
      'WEBTORRENT_DISABLE_DHT': 'public.webtorrent.disableDht',
      'WEBTORRENT_DEBUG_TCP': 'public.webtorrent.debugTcp',
      'WEBTORRENT_LOG_LEVEL': 'public.webtorrent.logLevel',
      
      // Platform detection
      'WEBTORRENT_PLATFORM_OVERRIDE': 'public.webtorrent.platformOverride',
      'WEBTORRENT_ARCH_OVERRIDE': 'public.webtorrent.archOverride'
    };
    
    // Initialize settings structure
    if (!Meteor.settings) {
      Meteor.settings = {};
    }
    if (!Meteor.settings.public) {
      Meteor.settings.public = {};
    }
    if (!Meteor.settings.private) {
      Meteor.settings.private = {};
    }
    if (!Meteor.settings.public.webtorrent) {
      Meteor.settings.public.webtorrent = {};
    }
    
    // Process environment variables
    Object.keys(envMappings).forEach(function(envVar) {
      if (process.env[envVar] !== undefined) {
        const settingPath = envMappings[envVar];
        const parts = settingPath.split('.');
        
        let current = Meteor.settings;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }
        
        const lastPart = parts[parts.length - 1];
        let value = process.env[envVar];
        
        // Enhanced type parsing
        if (value === 'true') value = true;
        if (value === 'false') value = false;
        if (!isNaN(value) && value !== '' && !isNaN(parseFloat(value))) {
          value = Number(value);
        }
        
        // Handle arrays (comma-separated values)
        if (typeof value === 'string' && value.includes(',')) {
          value = value.split(',').map(item => item.trim());
        }
        
        current[lastPart] = value;
        console.log(`Environment setting applied: ${envVar} = ${value}`);
      }
    });
    
    // Auto-detect platform if not overridden
    if (!process.env.WEBTORRENT_PLATFORM_OVERRIDE) {
      Meteor.settings.public.webtorrent.detectedPlatform = process.platform;
      Meteor.settings.public.webtorrent.detectedArch = process.arch;
      Meteor.settings.public.webtorrent.detectedNodeVersion = process.version;
    }
    
    // Apply intelligent defaults based on platform detection
    applyPlatformDefaults();
  };
  
  // Apply platform-specific defaults
  const applyPlatformDefaults = function() {
    const platform = get(Meteor.settings, 'public.webtorrent.detectedPlatform', process.platform);
    const arch = get(Meteor.settings, 'public.webtorrent.detectedArch', process.arch);
    const nodeVersion = get(Meteor.settings, 'public.webtorrent.detectedNodeVersion', process.version);
    
    const isMacOS = platform === 'darwin';
    const isARM64 = arch === 'arm64';
    const isNode22 = nodeVersion.startsWith('v22');
    const isProblematicCombo = isMacOS && isARM64 && isNode22;
    
    console.log(`Platform Detection: ${platform}-${arch}, Node.js ${nodeVersion}`);
    
    if (isProblematicCombo) {
      console.log('🚨 DETECTED: macOS ARM64 + Node.js 22 - applying enhanced TCP fixes');
      
      // Apply fixes if not explicitly configured
      if (get(Meteor.settings, 'public.webtorrent.arm64Fix') === undefined) {
        Meteor.settings.public.webtorrent.arm64Fix = true;
      }
      if (get(Meteor.settings, 'public.webtorrent.node22Compat') === undefined) {
        Meteor.settings.public.webtorrent.node22Compat = true;
      }
      if (get(Meteor.settings, 'public.webtorrent.forceTcpPort') === undefined) {
        Meteor.settings.public.webtorrent.forceTcpPort = 7881;
      }
      if (get(Meteor.settings, 'public.webtorrent.useHttpTrackers') === undefined) {
        Meteor.settings.public.webtorrent.useHttpTrackers = true;
      }
      if (get(Meteor.settings, 'public.webtorrent.debugTcp') === undefined) {
        Meteor.settings.public.webtorrent.debugTcp = true;
      }
    } else if (isMacOS) {
      console.log('📱 DETECTED: macOS - applying macOS optimizations');
      
      if (get(Meteor.settings, 'public.webtorrent.forceTcpPort') === undefined) {
        Meteor.settings.public.webtorrent.forceTcpPort = 6881;
      }
      if (get(Meteor.settings, 'public.webtorrent.maxConnections') === undefined) {
        Meteor.settings.public.webtorrent.maxConnections = 200;
      }
    } else if (platform === 'linux') {
      console.log('🐧 DETECTED: Linux - applying high-performance settings');
      
      if (get(Meteor.settings, 'public.webtorrent.maxConnections') === undefined) {
        Meteor.settings.public.webtorrent.maxConnections = 500;
      }
      if (get(Meteor.settings, 'public.webtorrent.disableDht') === undefined) {
        Meteor.settings.public.webtorrent.disableDht = false;
      }
    } else if (platform === 'win32') {
      console.log('🪟 DETECTED: Windows - applying conservative settings');
      
      if (get(Meteor.settings, 'public.webtorrent.maxConnections') === undefined) {
        Meteor.settings.public.webtorrent.maxConnections = 150;
      }
      if (get(Meteor.settings, 'public.webtorrent.forceTcpPort') === undefined) {
        Meteor.settings.public.webtorrent.forceTcpPort = 7881;
      }
    }
    
    // Container environment detection
    if (process.env.DOCKER_CONTAINER || process.env.KUBERNETES_SERVICE_HOST || fs.existsSync('/.dockerenv')) {
      console.log('🐳 DETECTED: Container environment - applying container optimizations');
      
      if (get(Meteor.settings, 'public.webtorrent.tcpBindAddress') === undefined) {
        Meteor.settings.public.webtorrent.tcpBindAddress = '0.0.0.0';
      }
      if (get(Meteor.settings, 'public.webtorrent.forceTcpPort') === undefined) {
        Meteor.settings.public.webtorrent.forceTcpPort = 0; // Let container assign port
      }
      if (get(Meteor.settings, 'public.webtorrent.maxConnections') === undefined) {
        Meteor.settings.public.webtorrent.maxConnections = 300;
      }
    }
  };
  
  // Load enhanced environment settings
  loadEnhancedEnvSettings();
  
  // Log final configuration (redacted for security)
  if (get(Meteor.settings, 'public.webtorrent.debugTcp', false)) {
    const webTorrentConfig = get(Meteor.settings, 'public.webtorrent', {});
    console.log('🔧 Final WebTorrent Configuration:', JSON.stringify(webTorrentConfig, null, 2));
  }
  
  // Enhanced storage path resolution with port substitution
  const port = process.env.PORT || 3000;
  const tempPathTemplate = get(Meteor.settings, 'private.storage.tempPath', '/tmp/fhir-torrents');
  const tempPath = tempPathTemplate.replace(/\$\{PORT\}/g, port);

  console.log(`📁 Storage directory for port ${port}: ${tempPath}`);

  // Ensure storage directory exists
  const fs = await import('fs');
  if (!fs.existsSync(tempPath)) {
    try {
      fs.mkdirSync(tempPath, { recursive: true });
      console.log(`✅ Created storage directory: ${tempPath}`);
    } catch (err) {
      console.error(`❌ Error creating storage directory: ${err.message}`);
    }
  }
  
  // Continue with original server startup...
  // (include your existing publication and WebTorrent initialization code)
  
  console.log('✅ FHIR P2P server started successfully with enhanced environment configuration');
});