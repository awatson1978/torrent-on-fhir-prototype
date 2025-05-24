import { Meteor } from 'meteor/meteor';
import { WebTorrentServer } from './webtorrent-server';
import { Settings } from '/imports/api/settings/settings';

// Fix tracker connections periodically
Meteor.startup(function() {
  console.log('Setting up periodic tracker connection fix');
  
  // Wait for WebTorrent to initialize
  Meteor.setTimeout(function() {
    const intervalId = Meteor.setInterval(function() {
      try {
        const client = WebTorrentServer.getClient();
        if (!client) {
          console.log('WebTorrent client not initialized yet, skipping tracker fix');
          return;
        }
        
        // Get all torrents
        const torrents = WebTorrentServer.getAllTorrents();
        console.log(`Periodic tracker check for ${torrents.length} torrents`);
        
        if (torrents.length === 0) {
          return;
        }
        
        // Loop through each torrent and force announce
        torrents.forEach(function(torrent) {
          try {
            if (typeof torrent.announce === 'function') {
              console.log(`Periodic announce for torrent ${torrent.name || torrent.infoHash}`);
              torrent.announce();
            }
            
            // Log current peer connections
            if (torrent.wires && torrent.wires.length > 0) {
              console.log(`Torrent ${torrent.name || torrent.infoHash} has ${torrent.wires.length} peer connections`);
            }
          } catch (e) {
            console.error(`Error announcing torrent ${torrent.infoHash}:`, e);
          }
        });
      } catch (err) {
        console.error('Error in periodic tracker fix:', err);
      }
    }, 30000); // Run every 30 seconds
    
    // Store interval ID in case we need to clear it later
    global.trackerFixIntervalId = intervalId;
  }, 30000); // Start after 30 seconds
});