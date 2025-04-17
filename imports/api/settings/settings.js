import { Meteor } from 'meteor/meteor';
import { get } from 'lodash';

/**
 * Settings utility for accessing configuration values with defaults
 * Follows 12-factor app methodology by using environment variables and settings.json
 */

export const Settings = {
  /**
   * Get a configuration value with a default fallback
   * @param {String} path - The dot notation path to the setting
   * @param {*} defaultValue - Default value if setting doesn't exist
   * @return {*} The setting value or default
   */
  get: function(path, defaultValue) {
    // First check environment variables (convert path to ENV_VAR format)
    const envVar = path.toUpperCase().replace(/\./g, '_');
    if (process.env[envVar] !== undefined) {
      return process.env[envVar];
    }
    
    // Then check Meteor settings
    return get(Meteor.settings, path, defaultValue);
  },
  
  /**
   * Get WebTorrent client configuration
   * @return {Object} WebTorrent client configuration
   */
  getWebTorrentConfig: function() {
    return {
      tracker: this.get('public.webtorrent.trackers', [
        'wss://tracker.openwebtorrent.com'
      ]),
      announceList: this.get('public.webtorrent.announceList', [
        ['wss://tracker.openwebtorrent.com']
      ]),
      dht: this.get('public.webtorrent.dht', true),
      webSeeds: this.get('public.webtorrent.webSeeds', true)
    };
  },
  
  /**
   * Get FHIR validation settings
   * @return {Object} FHIR validation configuration
   */
  getFhirConfig: function() {
    return {
      validationLevel: this.get('public.fhir.validationLevel', 'warning'),
      defaultFormat: this.get('public.fhir.defaultFormat', 'json')
    };
  },
  
  /**
   * Get UI configuration
   * @return {Object} UI configuration
   */
  getUIConfig: function() {
    return {
      theme: this.get('public.ui.theme', 'light'),
      density: this.get('public.ui.density', 'comfortable')
    };
  }
};