import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
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
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import RefreshIcon from '@mui/icons-material/Refresh';
import { get } from 'lodash';

function PeerList() {
  const [peers, setPeers] = useState([]);
  const [networkStats, setNetworkStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Fetch peers on component mount and set up interval
  useEffect(function() {
    fetchPeerData();
    
    // Set up periodic updates
    const updateInterval = Meteor.setInterval(fetchPeerData, 5000);
    
    return function() {
      Meteor.clearInterval(updateInterval);
    };
  }, []);
  
  // Fetch peer data from server
  function fetchPeerData() {
    setLoading(true);
    
    // Get all peers across all torrents
    Meteor.call('peers.getAll', function(err, result) {
      if (err) {
        console.error('Error fetching peer data:', err);
        setError(`Error fetching peer data: ${err.message}`);
        setLoading(false);
      } else {
        // Process the peers data from the server
        const peerMap = new Map();
        
        if (Array.isArray(result)) {
          // Group peers by torrent
          result.forEach(function(peer) {
            const torrentName = peer.torrentName || 'Unknown';
            const torrentHash = peer.torrentInfoHash || 'unknown';
            const uniqueId = `${torrentHash}-peers`;
            
            if (!peerMap.has(uniqueId)) {
              peerMap.set(uniqueId, {
                id: uniqueId,
                torrentName: torrentName,
                torrentHash: torrentHash,
                peerCount: 1,
                peers: [peer]
              });
            } else {
              const existing = peerMap.get(uniqueId);
              existing.peerCount += 1;
              existing.peers.push(peer);
            }
          });
        }
        
        // Convert to array for display
        setPeers(Array.from(peerMap.values()));
        setLoading(false);
      }
    });
    
    // Also get network stats
    Meteor.call('peers.getNetworkStats', function(err, result) {
      if (!err && result) {
        setNetworkStats(result);
      }
    });
  }
  
  // Format bytes to human-readable format
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  
  // Format speed (bytes/sec) to human-readable format
  function formatSpeed(bytesPerSec) {
    return formatBytes(bytesPerSec) + '/s';
  }
  
  return (
    <Paper sx={{ width: '100%', mb: 2, p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" component="h2">
          Connected Peers
        </Typography>
        
        <Button
          startIcon={<RefreshIcon />}
          onClick={fetchPeerData}
          size="small"
        >
          Refresh Peers
        </Button>
      </Box>
      
      {get(networkStats, 'peers', 0) > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Network Stats: {get(networkStats, 'peers', 0)} peers connected | 
            Download: {formatSpeed(get(networkStats, 'downloadSpeed', 0))} | 
            Upload: {formatSpeed(get(networkStats, 'uploadSpeed', 0))}
          </Typography>
        </Box>
      )}
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}
      
      {loading ? (
        <LinearProgress />
      ) : peers.length === 0 ? (
        <Alert severity="info">
          No peers connected. Add torrents to start connecting with peers.
        </Alert>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="peers table">
            <TableHead>
              <TableRow>
                <TableCell>Torrent</TableCell>
                <TableCell>Torrent Hash</TableCell>
                <TableCell>Peer Count</TableCell>
                <TableCell>Clients</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {peers.map((peerGroup) => (
                <TableRow key={peerGroup.id}>
                  <TableCell>{peerGroup.torrentName}</TableCell>
                  <TableCell>{peerGroup.torrentHash.substring(0, 8)}...</TableCell>
                  <TableCell>{peerGroup.peerCount}</TableCell>
                  <TableCell>
                    {peerGroup.peers.slice(0, 3).map((peer, idx) => (
                      <span key={idx}>{peer.client || 'Unknown'}{idx < Math.min(peerGroup.peers.length, 3) - 1 ? ', ' : ''}</span>
                    ))}
                    {peerGroup.peers.length > 3 && ` +${peerGroup.peers.length - 3} more`}
                  </TableCell>
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

// import React, { useState, useEffect } from 'react';\
// import { Meteor } from 'meteor/meteor';
// import { useTracker } from 'meteor/react-meteor-data';
// import { get } from 'lodash';
// import Paper from '@mui/material/Paper';
// import Table from '@mui/material/Table';
// import TableBody from '@mui/material/TableBody';
// import TableCell from '@mui/material/TableCell';
// import TableContainer from '@mui/material/TableContainer';
// import TableHead from '@mui/material/TableHead';
// import TableRow from '@mui/material/TableRow';
// import Typography from '@mui/material/Typography';
// import LinearProgress from '@mui/material/LinearProgress';
// import Box from '@mui/material/Box';
// import Alert from '@mui/material/Alert';
// import RefreshIcon from '@mui/icons-material/Refresh';
// import Button from '@mui/material/Button';
// import { TorrentsCollection } from '../../api/torrents/torrents';

// function PeerList() {
//   const [peers, setPeers] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState('');
  
//   // Get torrents data
//   const { torrents, isLoading } = useTracker(function() {
//     const sub = Meteor.subscribe('torrents.all');
//     return {
//       torrents: TorrentsCollection.find({}).fetch(),
//       isLoading: !sub.ready()
//     };
//   });
  
//   // Track connected peers
//   useEffect(function() {
//     if (isLoading) {
//       setLoading(true);
//       return;
//     }
    
//     fetchPeerData();
    
//     // Set up periodic updates
//     const updateInterval = setInterval(fetchPeerData, 5000);
    
//     return function() {
//       clearInterval(updateInterval);
//     };
//   }, [torrents, isLoading]);
  
//   // Fetch peer data from server
//   function fetchPeerData() {
//     setLoading(true);
    
//     Meteor.call('peers.getAll', function(err, result) {
//       setLoading(false);
      
//       if (err) {
//         console.error('Error fetching peer data:', err);
//         setError(`Error fetching peer data: ${err.message}`);
//       } else {
//         // Process the peers data from the server
//         const peerMap = new Map();
        
//         // Group peers by torrent
//         if (Array.isArray(result)) {
//           result.forEach(function(peer) {
//             const torrentName = peer.torrentName || 'Unknown';
//             const torrentHash = peer.torrentInfoHash || 'unknown';
//             const uniqueId = `${torrentHash}-peers`;
            
//             if (!peerMap.has(uniqueId)) {
//               peerMap.set(uniqueId, {
//                 id: uniqueId,
//                 torrentName: torrentName,
//                 torrentHash: torrentHash,
//                 peerCount: 1,
//                 peers: [peer]
//               });
//             } else {
//               const existing = peerMap.get(uniqueId);
//               existing.peerCount += 1;
//               existing.peers.push(peer);
//             }
//           });
//         }
        
//         // Convert to array for display
//         setPeers(Array.from(peerMap.values()));
//       }
//     });
//   }
  
//   // Format speed (bytes/sec) to human-readable format
//   function formatSpeed(bytesPerSec) {
//     if (bytesPerSec === 0) return '0 B/s';
    
//     const k = 1024;
//     const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    
//     const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    
//     return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
//   }
  
//   function handleRefresh() {
//     fetchPeerData();
//   }
  
//   return (
//     <Paper sx={{ width: '100%', mb: 2, p: 2 }}>
//       <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
//         <Typography variant="h6" component="h2">
//           Connected Peers
//         </Typography>
        
//         <Button
//           startIcon={<RefreshIcon />}
//           onClick={handleRefresh}
//           size="small"
//         >
//           Refresh Peers
//         </Button>
//       </Box>
      
//       {error && (
//         <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
//       )}
      
//       {loading ? (
//         <LinearProgress />
//       ) : peers.length === 0 ? (
//         <Alert severity="info">
//           No peers connected. Add torrents to start connecting with peers.
//         </Alert>
//       ) : (
//         <TableContainer>
//           <Table size="small" aria-label="peers table">
//             <TableHead>
//               <TableRow>
//                 <TableCell>Torrent</TableCell>
//                 <TableCell>Torrent Hash</TableCell>
//                 <TableCell>Peer Count</TableCell>
//                 <TableCell>Clients</TableCell>
//               </TableRow>
//             </TableHead>
//             <TableBody>
//               {peers.map((peerGroup) => (
//                 <TableRow key={peerGroup.id}>
//                   <TableCell>{peerGroup.torrentName}</TableCell>
//                   <TableCell>{peerGroup.torrentHash.substring(0, 8)}...</TableCell>
//                   <TableCell>{peerGroup.peerCount}</TableCell>
//                   <TableCell>
//                     {peerGroup.peers.slice(0, 3).map((peer, idx) => (
//                       <span key={idx}>{peer.client || 'Unknown'}{idx < Math.min(peerGroup.peers.length, 3) - 1 ? ', ' : ''}</span>
//                     ))}
//                     {peerGroup.peers.length > 3 && ` +${peerGroup.peers.length - 3} more`}
//                   </TableCell>
//                 </TableRow>
//               ))}
//             </TableBody>
//           </Table>
//         </TableContainer>
//       )}
//     </Paper>
//   );
// }

// export default PeerList;
