import { Meteor } from 'meteor/meteor';
import { get } from 'lodash';
import { Settings } from '../settings/settings';

/**
 * FHIR utilities for handling FHIR data
 */
export const FhirUtils = {
  /**
   * Parse FHIR JSON data
   * @param {String} jsonString - FHIR JSON data as string
   * @return {Object} Parsed FHIR data or null if invalid
   */
  parseJson: function(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      return data;
    } catch (e) {
      console.error('Error parsing FHIR JSON:', e);
      return null;
    }
  },
  
  /**
   * Parse FHIR NDJSON data
   * @param {String} ndjsonString - FHIR NDJSON data as string
   * @return {Array} Array of parsed FHIR resources or empty array if invalid
   */
  parseNdjson: function(ndjsonString) {
    try {
      const lines = ndjsonString.split('\n').filter(line => line.trim());
      return lines.map(line => JSON.parse(line));
    } catch (e) {
      console.error('Error parsing FHIR NDJSON:', e);
      return [];
    }
  },
  
  /**
   * Convert FHIR Bundle to NDJSON
   * @param {Object} bundle - FHIR Bundle object
   * @return {String} NDJSON string
   */
  bundleToNdjson: function(bundle) {
    try {
      const entries = get(bundle, 'entry', []);
      const resources = entries.map(entry => entry.resource).filter(r => r);
      return resources.map(r => JSON.stringify(r)).join('\n');
    } catch (e) {
      console.error('Error converting Bundle to NDJSON:', e);
      return '';
    }
  },
  
  /**
   * Convert NDJSON to FHIR Bundle
   * @param {String} ndjson - FHIR resources as NDJSON
   * @return {Object} FHIR Bundle object
   */
  ndjsonToBundle: function(ndjson) {
    try {
      const resources = this.parseNdjson(ndjson);
      return {
        resourceType: 'Bundle',
        type: 'collection',
        entry: resources.map(resource => ({
          resource: resource
        }))
      };
    } catch (e) {
      console.error('Error converting NDJSON to Bundle:', e);
      return null;
    }
  },
  
  /**
   * Detect if data is FHIR Bundle or NDJSON
   * @param {String} data - Data to detect
   * @return {String} 'bundle', 'ndjson', or 'unknown'
   */
  detectFormat: function(data) {
    if (!data) return 'unknown';
    
    // Try to parse as JSON first
    try {
      const parsed = JSON.parse(data);
      if (parsed.resourceType === 'Bundle') {
        return 'bundle';
      }
      // Single FHIR resource
      if (parsed.resourceType) {
        return 'bundle';
      }
    } catch (e) {
      // Not valid JSON, try NDJSON
      try {
        const lines = data.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
          const firstLine = JSON.parse(lines[0]);
          if (firstLine.resourceType) {
            return 'ndjson';
          }
        }
      } catch (e2) {
        // Not valid NDJSON either
      }
    }
    
    return 'unknown';
  },
  
  /**
   * Validate FHIR resources
   * @param {Object|Array} resources - FHIR resource or array of resources
   * @return {Object} Validation results
   */
  validateResources: function(resources) {
    // For now, just do basic validation
    // In the future, we can use a proper FHIR validator
    const resourcesArray = Array.isArray(resources) ? resources : [resources];
    
    const results = resourcesArray.map(resource => {
      const resourceType = get(resource, 'resourceType');
      const id = get(resource, 'id', '');
      
      if (!resourceType) {
        return {
          resource: id,
          valid: false,
          errors: ['Missing resourceType']
        };
      }
      
      // Add more validation as needed
      
      return {
        resource: id || resourceType,
        valid: true,
        errors: []
      };
    });
    
    return {
      valid: results.every(r => r.valid),
      results: results
    };
  },
  
  /**
   * Count resources in FHIR data
   * @param {Object|String} data - FHIR data (Bundle or NDJSON)
   * @return {Object} Count of resources by type
   */
  countResources: function(data) {
    let resources = [];
    
    if (typeof data === 'string') {
      const format = this.detectFormat(data);
      if (format === 'bundle') {
        const bundle = this.parseJson(data);
        resources = get(bundle, 'entry', []).map(e => e.resource).filter(r => r);
      } else if (format === 'ndjson') {
        resources = this.parseNdjson(data);
      }
    } else if (data.resourceType === 'Bundle') {
      resources = get(data, 'entry', []).map(e => e.resource).filter(r => r);
    } else if (Array.isArray(data)) {
      resources = data;
    } else if (data.resourceType) {
      resources = [data];
    }
    
    // Count by resource type
    const counts = {};
    resources.forEach(resource => {
      const type = get(resource, 'resourceType', 'Unknown');
      counts[type] = (counts[type] || 0) + 1;
    });
    
    return {
      total: resources.length,
      types: counts
    };
  }
};