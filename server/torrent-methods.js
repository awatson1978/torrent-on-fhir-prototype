// server/methods/torrent-methods.js

import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { WebTorrentServer } from './webtorrent-server';
import { TorrentsCollection } from '/imports/api/torrents/torrents';
import fs from 'fs';

Meteor.methods({
  /**
   * Add a torrent from a magnet URI
   * @param {String} magnetUri - Magnet URI of the torrent
   * @param {Object} metadata - Additional metadata
   * @return {Object} Added torrent info
   */
  'torrents.add': function(magnetUri, metadata = {}) {
    check(magnetUri, String);
    check(metadata, Object);
    
    const result = Promise.await(WebTorrentServer.addTorrent(magnetUri));
    
    // Update metadata
    if (Object.keys(metadata).length > 0) {
      Meteor.call('torrents.updateMeta', result.infoHash, metadata);
    }
    
    return {
      infoHash: result.infoHash,
      name: result.name,
      magnetURI: result.magnetURI
    };
  },
  
  /**
   * Create a torrent from uploaded file data
   * @param {String} name - Name for the torrent
   * @param {Array} fileData - Array of { name, data } objects
   * @param {Object} metadata - Additional metadata
   * @return {Object} Created torrent info
   */
  'torrents.create': function(name, fileData, metadata = {}) {
    check(name, String);
    check(fileData, Array);
    check(metadata, Object);
    
    // Write the files to disk temporarily
    const tempFiles = [];
    const tempPath = `/tmp/fhir-torrent-${Date.now()}`;
    
    if (!fs.existsSync(tempPath)) {
      fs.mkdirSync(tempPath, { recursive: true });
    }
    
    fileData.forEach(function(file) {
      const filePath = `${tempPath}/${file.name}`;
      fs.writeFileSync(filePath, file.data);
      tempFiles.push(filePath);
    });
    
    // Create the torrent
    const result = Promise.await(WebTorrentServer.createTorrent(tempPath, {
      name: name,
      comment: metadata.description || ''
    }));
    
    // Clean up temp files
    tempFiles.forEach(function(file) {
      fs.unlinkSync(file);
    });
    fs.rmdirSync(tempPath);
    
    // Update metadata
    if (Object.keys(metadata).length > 0) {
      Meteor.call('torrents.updateMeta', result.infoHash, metadata);
    }
    
    return {
      infoHash: result.infoHash,
      name: result.name,
      magnetURI: result.magnetURI
    };
  },
  
  /**
   * Remove a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @param {Boolean} removeFiles - Whether to remove downloaded files
   * @return {Boolean} Success
   */
  'torrents.remove': function(infoHash, removeFiles = false) {
    check(infoHash, String);
    check(removeFiles, Boolean);
    
    return Promise.await(WebTorrentServer.removeTorrent(infoHash, removeFiles));
  },
  
  /**
   * Get file contents from a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @param {String} filename - Name of the file to get
   * @return {String} File contents
   */
  'torrents.getFileContents': function(infoHash, filename) {
    check(infoHash, String);
    check(filename, String);
    
    return Promise.await(WebTorrentServer.getFileContents(infoHash, filename));
  },
  
  /**
   * Get all file contents from a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @return {Object} Object with filename keys and content values
   */
  'torrents.getAllFileContents': function(infoHash) {
    check(infoHash, String);
    
    return Promise.await(WebTorrentServer.getAllFileContents(infoHash));
  },
  
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
   * Pause a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @return {Boolean} Success
   */
  'torrents.pause': function(infoHash) {
    check(infoHash, String);
    
    const torrent = WebTorrentServer.getTorrent(infoHash);
    if (!torrent) {
      throw new Meteor.Error('not-found', 'Torrent not found');
    }
    
    torrent.pause();
    
    // Update status in collection
    TorrentsCollection.update(
      { infoHash },
      { $set: { 'status.state': 'paused' } }
    );
    
    return true;
  },
  
  /**
   * Resume a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @return {Boolean} Success
   */
  'torrents.resume': function(infoHash) {
    check(infoHash, String);
    
    const torrent = WebTorrentServer.getTorrent(infoHash);
    if (!torrent) {
      throw new Meteor.Error('not-found', 'Torrent not found');
    }
    
    torrent.resume();
    
    // Update status in collection
    TorrentsCollection.update(
      { infoHash },
      { $set: { 'status.state': torrent.done ? 'seeding' : 'downloading' } }
    );
    
    return true;
  }
});