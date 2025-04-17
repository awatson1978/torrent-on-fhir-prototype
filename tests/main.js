import { Meteor } from 'meteor/meteor';
import assert from 'assert';
import { get } from 'lodash';

import { TorrentsCollection } from '/imports/api/torrents/torrents';
import { Settings } from '/imports/api/settings/settings';
import { FhirUtils } from '/imports/api/fhir/fhir-utils';

describe('FHIR P2P', function() {
  describe('Settings', function() {
    it('should provide default values when settings are missing', function() {
      const trackers = Settings.get('public.webtorrent.trackers', ['default-tracker']);
      assert.strictEqual(Array.isArray(trackers), true);
    });
    
    it('should return WebTorrent configuration', function() {
      const config = Settings.getWebTorrentConfig();
      assert.strictEqual(typeof config, 'object');
      assert.strictEqual(Array.isArray(config.tracker), true);
    });
  });
  
  describe('FhirUtils', function() {
    it('should detect FHIR bundle format', function() {
      const bundle = JSON.stringify({
        resourceType: 'Bundle',
        type: 'collection',
        entry: []
      });
      
      const format = FhirUtils.detectFormat(bundle);
      assert.strictEqual(format, 'bundle');
    });
    
    it('should detect NDJSON format', function() {
      const ndjson = '{"resourceType":"Patient","id":"123"}\n{"resourceType":"Observation","id":"456"}';
      
      const format = FhirUtils.detectFormat(ndjson);
      assert.strictEqual(format, 'ndjson');
    });
    
    it('should convert bundle to NDJSON', function() {
      const bundle = {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          { resource: { resourceType: 'Patient', id: '123' } },
          { resource: { resourceType: 'Observation', id: '456' } }
        ]
      };
      
      const ndjson = FhirUtils.bundleToNdjson(bundle);
      assert.strictEqual(typeof ndjson, 'string');
      assert.strictEqual(ndjson.split('\n').length, 2);
    });
    
    it('should convert NDJSON to bundle', function() {
      const ndjson = '{"resourceType":"Patient","id":"123"}\n{"resourceType":"Observation","id":"456"}';
      
      const bundle = FhirUtils.ndjsonToBundle(ndjson);
      assert.strictEqual(bundle.resourceType, 'Bundle');
      assert.strictEqual(bundle.type, 'collection');
      assert.strictEqual(bundle.entry.length, 2);
    });
  });
  
  // Add test for torrents collection if running with a database
  if (Meteor.isServer) {
    describe('TorrentsCollection', function() {
      before(function() {
        // Clean the collection before tests
        TorrentsCollection.remove({});
      });
      
      it('should insert a torrent document', function() {
        const torrentId = TorrentsCollection.insert({
          infoHash: '1234567890abcdef1234',
          name: 'Test Torrent',
          description: 'Test Description',
          fhirType: 'bundle',
          magnetURI: 'magnet:?xt=urn:btih:1234567890abcdef1234',
          size: 1024,
          created: new Date(),
          files: [],
          status: {
            downloaded: 0,
            uploaded: 0,
            downloadSpeed: 0,
            uploadSpeed: 0,
            progress: 0,
            peers: 0,
            seeds: 0,
            state: 'downloading'
          }
        });
        
        assert.strictEqual(typeof torrentId, 'string');
        
        const torrent = TorrentsCollection.findOne(torrentId);
        assert.strictEqual(torrent.name, 'Test Torrent');
        assert.strictEqual(torrent.fhirType, 'bundle');
      });
    });
  }
});