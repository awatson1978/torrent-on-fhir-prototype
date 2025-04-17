import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { get } from 'lodash';
import { TorrentsCollection } from '/imports/api/torrents/torrents';

Meteor.methods({
  /**
   * Update torrent metadata
   * @param {String} infoHash - The torrent info hash
   * @param {Object} metadata - Metadata to update
   */
  'torrents.updateMeta': function(infoHash, metadata) {
    check(infoHash, String);
    check(metadata, Object);
    
    // Fields that can be updated
    const allowedFields = ['description', 'fhirType', 'meta'];
    
    // Build update object with only allowed fields
    const updateObj = {};
    
    Object.keys(metadata).forEach(function(key) {
      if (allowedFields.includes(key)) {
        updateObj[key] = metadata[key];
      }
    });
    
    // Make sure torrent exists
    const torrent = TorrentsCollection.findOne({ infoHash });
    if (!torrent) {
      throw new Meteor.Error('not-found', 'Torrent not found');
    }
    
    return TorrentsCollection.update({ infoHash }, { $set: updateObj });
  },
  
  /**
   * Update FHIR metadata for a torrent
   * @param {String} infoHash - The torrent info hash
   * @param {Object} fhirMeta - FHIR metadata
   */
  'torrents.updateFhirMeta': function(infoHash, fhirMeta) {
    check(infoHash, String);
    check(fhirMeta, {
      fhirVersion: String,
      resourceCount: Number,
      profile: Match.Optional(String)
    });
    
    // Make sure torrent exists
    const torrent = TorrentsCollection.findOne({ infoHash });
    if (!torrent) {
      throw new Meteor.Error('not-found', 'Torrent not found');
    }
    
    return TorrentsCollection.update(
      { infoHash }, 
      { $set: { meta: fhirMeta } }
    );
  },
  
  /**
   * Get torrent status
   * @param {String} infoHash - The torrent info hash
   * @return {Object} Torrent status
   */
  'torrents.getStatus': function(infoHash) {
    check(infoHash, String);
    
    const torrent = TorrentsCollection.findOne({ infoHash });
    if (!torrent) {
      throw new Meteor.Error('not-found', 'Torrent not found');
    }
    
    return get(torrent, 'status', {});
  },
  
  /**
   * Get network stats
   * @return {Object} Network statistics
   */
  'torrents.getNetworkStats': function() {
    const torrents = TorrentsCollection.find().fetch();
    
    // Aggregate stats
    let totalUploaded = 0;
    let totalDownloaded = 0;
    let totalDownloadSpeed = 0;
    let totalUploadSpeed = 0;
    let totalPeers = new Set();
    
    torrents.forEach(function(torrent) {
      totalUploaded += get(torrent, 'status.uploaded', 0);
      totalDownloaded += get(torrent, 'status.downloaded', 0);
      totalDownloadSpeed += get(torrent, 'status.downloadSpeed', 0);
      totalUploadSpeed += get(torrent, 'status.uploadSpeed', 0);
      
      // For peers, we need to track unique peers
      // Since we don't have peer IDs in the collection, this is an approximation
      totalPeers.add(get(torrent, 'status.peers', 0));
    });
    
    return {
      torrents: torrents.length,
      uploaded: totalUploaded,
      downloaded: totalDownloaded,
      downloadSpeed: totalDownloadSpeed,
      uploadSpeed: totalUploadSpeed,
      peers: Array.from(totalPeers).reduce((a, b) => a + b, 0)
    };
  }
});