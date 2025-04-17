import { Mongo } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';

/**
 * Collection for tracking torrents in the system
 */
export const TorrentsCollection = new Mongo.Collection('torrents');

// Define the schema (we'll use simple-schema in the future)
// For now just document the expected shape
/**
 * Torrent document structure:
 * {
 *   _id: String,
 *   infoHash: String,          // Torrent unique identifier
 *   name: String,              // Display name for the torrent
 *   description: String,       // User-provided description
 *   fhirType: String,          // 'bundle' or 'ndjson'
 *   magnetURI: String,         // Full magnet URI
 *   size: Number,              // Total size in bytes
 *   created: Date,             // When this torrent was created
 *   files: [{                  // Array of files in the torrent
 *     name: String,            // Filename
 *     path: String,            // Path within torrent
 *     size: Number,            // File size in bytes
 *     type: String             // MIME type
 *   }],
 *   status: {
 *     downloaded: Number,      // Amount downloaded in bytes
 *     uploaded: Number,        // Amount uploaded in bytes
 *     downloadSpeed: Number,   // Current download speed
 *     uploadSpeed: Number,     // Current upload speed
 *     progress: Number,        // Download progress (0-1)
 *     peers: Number,           // Connected peers count
 *     seeds: Number,           // Connected seeds count
 *     state: String            // 'downloading', 'seeding', 'paused', etc.
 *   },
 *   meta: {                    // Additional metadata
 *     fhirVersion: String,     // FHIR version
 *     resourceCount: Number,   // Number of FHIR resources
 *     profile: String          // Optional FHIR profile
 *   }
 * }
 */

// Allow/deny rules - will implement proper security later
TorrentsCollection.allow({
  insert: function() { return true; },
  update: function() { return true; },
  remove: function() { return true; }
});

// Setup publications if on server
if (Meteor.isServer) {
  Meteor.publish('torrents.all', async function() {
    return await TorrentsCollection.find();
  });
  
  Meteor.publish('torrents.single', async function(torrentId) {
    return await TorrentsCollection.find({ _id: torrentId });
  });
}