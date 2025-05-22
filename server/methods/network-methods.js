import { Meteor } from 'meteor/meteor';
import { WebTorrentServer } from '../webtorrent-server';
import { Settings } from '/imports/api/settings/settings';

Meteor.methods({
  'network.getBasicStatus': function() {
    const client = WebTorrentServer.getClient();
    const torrents = WebTorrentServer.getAllTorrents();
    
    let totalPeers = 0;
    let activeTorrents = 0;
    
    torrents.forEach(function(torrent) {
      if (torrent.numPeers > 0) {
        activeTorrents++;
      }
      totalPeers += torrent.numPeers || 0;
    });
    
    return {
      clientInitialized: !!client,
      totalTorrents: torrents.length,
      activeTorrents: activeTorrents,
      totalPeers: totalPeers,
      timestamp: new Date()
    };
  },
  /**
   * Get detailed network status including tracker communications
   */
  'network.getDetailedStatus': function() {
    const client = WebTorrentServer.getClient();
    const networkStats = WebTorrentServer._networkStats;
    const config = Settings.getWebTorrentConfig();
    
    return {
      client: {
        initialized: !!client,
        torrents: WebTorrentServer.getAllTorrents().length
      },
      trackers: {
        configured: config.tracker || [],
        status: Array.from(networkStats.trackers.values()),
        lastGlobalAnnounce: networkStats.lastGlobalAnnounce,
        announceHistory: networkStats.announceHistory.slice(0, 10)
      },
      dht: {
        enabled: config.dht,
        status: networkStats.dht.status,
        nodes: networkStats.dht.nodes,
        lastBootstrap: networkStats.dht.lastBootstrap
      },
      webSeeds: {
        enabled: config.webSeeds
      },
      timestamp: new Date()
    };
  },

  /**
   * Force announce to all trackers and return results
   */
  'network.forceAnnounce': function() {
    const torrents = WebTorrentServer.getAllTorrents();
    const results = [];
    
    torrents.forEach(torrent => {
      try {
        WebTorrentServer._enhancedAnnounce(torrent);
        results.push({
          infoHash: torrent.infoHash,
          name: torrent.name,
          status: 'announced'
        });
      } catch (err) {
        results.push({
          infoHash: torrent.infoHash,
          name: torrent.name,
          status: 'error',
          error: err.message
        });
      }
    });
    
    return {
      timestamp: new Date(),
      results: results,
      networkStats: WebTorrentServer._networkStats
    };
  },

  /**
   * Get tracker health status
   */
  'network.getTrackerHealth': function() {
    const networkStats = WebTorrentServer._networkStats;
    const trackers = Array.from(networkStats.trackers.values());
    
    return {
      totalTrackers: trackers.length,
      activeTrackers: trackers.filter(t => t.status === 'active').length,
      errorTrackers: trackers.filter(t => t.status === 'error').length,
      trackers: trackers.map(tracker => ({
        url: tracker.url,
        status: tracker.status,
        successRate: tracker.totalAnnounces > 0 ? 
          (tracker.successfulAnnounces / tracker.totalAnnounces * 100).toFixed(1) : 0,
        lastAnnounce: tracker.lastAnnounce,
        lastResponse: tracker.lastResponse,
        consecutiveFailures: tracker.consecutiveFailures,
        averageResponseTime: Math.round(tracker.averageResponseTime)
      })),
      lastUpdate: new Date()
    };
  }
});