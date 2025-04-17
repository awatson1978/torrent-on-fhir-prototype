import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { WebTorrentServer } from '../webtorrent-server';

Meteor.methods({
  /**
   * Get all peers connected to all torrents
   * @return {Array} Array of peer objects
   */
  'peers.getAll': function() {
    // Get all torrents from the WebTorrent client
    const torrents = WebTorrentServer.getAllTorrents();
    const allPeers = [];
    
    // Collect peers from all torrents
    torrents.forEach(function(torrent) {
      // Each torrent has wires (connections to peers)
      if (torrent.wires && torrent.wires.length > 0) {
        torrent.wires.forEach(function(wire) {
          if (wire.peerId) {
            allPeers.push({
              id: wire.peerId,
              addr: wire.remoteAddress,
              port: wire.remotePort,
              client: getClientName(wire.peerExtendedHandshake),
              connectionType: wire.type || 'unknown',
              downloadSpeed: wire.downloadSpeed(),
              uploadSpeed: wire.uploadSpeed(),
              torrentName: torrent.name,
              torrentInfoHash: torrent.infoHash
            });
          }
        });
      }
    });
    
    return allPeers;
  },
  
  /**
   * Get peers for a specific torrent
   * @param {String} infoHash - Info hash of the torrent
   * @return {Array} Array of peer objects
   */
  'peers.getForTorrent': function(infoHash) {
    check(infoHash, String);
    
    // Get the torrent from the WebTorrent client
    const torrent = WebTorrentServer.getTorrent(infoHash);
    if (!torrent) {
      throw new Meteor.Error('not-found', 'Torrent not found');
    }
    
    const peers = [];
    
    // Collect peers from the torrent
    if (torrent.wires && torrent.wires.length > 0) {
      torrent.wires.forEach(function(wire) {
        if (wire.peerId) {
          peers.push({
            id: wire.peerId,
            addr: wire.remoteAddress,
            port: wire.remotePort,
            client: getClientName(wire.peerExtendedHandshake),
            connectionType: wire.type || 'unknown',
            downloadSpeed: wire.downloadSpeed(),
            uploadSpeed: wire.uploadSpeed()
          });
        }
      });
    }
    
    return peers;
  },
  
  /**
   * Get network statistics
   * @return {Object} Network statistics
   */
  'peers.getNetworkStats': function() {
    // Get all torrents from the WebTorrent client
    const torrents = WebTorrentServer.getAllTorrents();
    
    let totalDownloaded = 0;
    let totalUploaded = 0;
    let totalDownloadSpeed = 0;
    let totalUploadSpeed = 0;
    let totalPeers = 0;
    
    // Calculate totals
    torrents.forEach(function(torrent) {
      totalDownloaded += torrent.downloaded || 0;
      totalUploaded += torrent.uploaded || 0;
      totalDownloadSpeed += torrent.downloadSpeed || 0;
      totalUploadSpeed += torrent.uploadSpeed || 0;
      totalPeers += torrent.numPeers || 0;
    });
    
    return {
      torrents: torrents.length,
      downloaded: totalDownloaded,
      uploaded: totalUploaded,
      downloadSpeed: totalDownloadSpeed,
      uploadSpeed: totalUploadSpeed,
      peers: totalPeers
    };
  }
});

/**
 * Get client name from handshake if available
 * @private
 * @param {Object} handshake - Peer extended handshake
 * @return {String} Client name
 */
function getClientName(handshake) {
  if (!handshake || !handshake.v) return 'Unknown';
  return handshake.v;
}