import React, { useState, useEffect } from 'react';
import { get } from 'lodash';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Box from '@mui/material/Box';

import { WebTorrentClient } from '../../api/torrents/webtorrent-client';

function PeerList() {
  const [peers, setPeers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Track connected peers
  useEffect(function() {
    let mounted = true;
    
    // Function to update peers
    function updatePeers() {
      if (!mounted) return;
      
      const client = WebTorrentClient.getClient();
      if (!client) {
        setPeers([]);
        setLoading(false);
        return;
      }
      
      // Get all torrents
      const torrents = WebTorrentClient.getAllTorrents();
      
      // Collect unique peers across all torrents
      const peerMap = new Map();
      
      torrents.forEach(function(torrent) {
        // Each torrent has wires (connections to peers)
        torrent.wires.forEach(function(wire) {
          const peerId = wire.peerId;
          if (peerId && !peerMap.has(peerId)) {
            peerMap.set(peerId, {
              id: peerId,
              addr: wire.remoteAddress,
              port: wire.remotePort,
              client: getClientName(wire.peerExtendedHandshake),
              connectionType: wire.type || 'unknown',
              downloadSpeed: wire.downloadSpeed(),
              uploadSpeed: wire.uploadSpeed(),
              torrentName: torrent.name
            });
          }
        });
      });
      
      // Convert to array
      setPeers(Array.from(peerMap.values()));
      setLoading(false);
    }
    
    // Get client info from handshake if available
    function getClientName(handshake) {
      if (!handshake || !handshake.v) return 'Unknown';
      return handshake.v;
    }
    
    // Update immediately and then every 2 seconds
    updatePeers();
    const interval = setInterval(updatePeers, 2000);
    
    return function() {
      mounted = false;
      clearInterval(interval);
    };
  }, []);
  
  // Format speed (bytes/sec) to human-readable format
  function formatSpeed(bytesPerSec) {
    if (bytesPerSec === 0) return '0 B/s';
    
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  return (
    <Paper sx={{ width: '100%', mb: 2, p: 2 }}>
      <Typography variant="h6" component="h2" gutterBottom>
        Connected Peers
      </Typography>
      
      {loading ? (
        <LinearProgress />
      ) : peers.length === 0 ? (
        <Typography variant="body1">No peers connected.</Typography>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="peers table">
            <TableHead>
              <TableRow>
                <TableCell>Peer ID</TableCell>
                <TableCell>Address</TableCell>
                <TableCell>Client</TableCell>
                <TableCell>Connection</TableCell>
                <TableCell>Download</TableCell>
                <TableCell>Upload</TableCell>
                <TableCell>Torrent</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {peers.map((peer) => (
                <TableRow key={peer.id}>
                  <TableCell component="th" scope="row">
                    {peer.id.substring(0, 8)}...
                  </TableCell>
                  <TableCell>{peer.addr}:{peer.port}</TableCell>
                  <TableCell>{peer.client}</TableCell>
                  <TableCell>{peer.connectionType}</TableCell>
                  <TableCell>{formatSpeed(peer.downloadSpeed)}</TableCell>
                  <TableCell>{formatSpeed(peer.uploadSpeed)}</TableCell>
                  <TableCell>{peer.torrentName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}

export default PeerList;