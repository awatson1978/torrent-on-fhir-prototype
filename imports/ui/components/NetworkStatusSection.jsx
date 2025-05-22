import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import Chip from '@mui/material/Chip';
import { alpha } from '@mui/material/styles';
import { get } from 'lodash';

// Icons
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import CloudIcon from '@mui/icons-material/Cloud';
import SpeedIcon from '@mui/icons-material/Speed';
import PeopleIcon from '@mui/icons-material/People';

import PeerList from './PeerList';

function NetworkStatusSection({ expanded, onToggleExpanded }) {
  const [networkStats, setNetworkStats] = useState({
    peers: 0,
    downloadSpeed: 0,
    uploadSpeed: 0,
    status: 'connecting'
  });
  
  const [loading, setLoading] = useState(false);
  
  // Fetch network stats
  useEffect(function() {
    fetchNetworkStats();
    
    // Update every 10 seconds
    const interval = Meteor.setInterval(fetchNetworkStats, 10000);
    
    return function() {
      Meteor.clearInterval(interval);
    };
  }, []);
  
  function fetchNetworkStats() {
    setLoading(true);
    
    Meteor.call('peers.getNetworkStats', function(err, result) {
      setLoading(false);
      
      if (!err && result) {
        setNetworkStats({
          peers: get(result, 'peers', 0),
          downloadSpeed: get(result, 'downloadSpeed', 0),
          uploadSpeed: get(result, 'uploadSpeed', 0),
          status: get(result, 'peers', 0) > 0 ? 'connected' : 'no-peers'
        });
      } else {
        setNetworkStats(prev => ({
          ...prev,
          status: 'error'
        }));
      }
    });
  }
  
  // Format speed
  function formatSpeed(bytesPerSec) {
    if (bytesPerSec === 0) return '0 B/s';
    
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
  
  // Get status color and icon
  function getStatusInfo() {
    switch (networkStats.status) {
      case 'connected':
        return {
          color: 'success',
          icon: <CloudIcon />,
          text: 'Connected'
        };
      case 'no-peers':
        return {
          color: 'warning',
          icon: <NetworkCheckIcon />,
          text: 'No Peers'
        };
      case 'error':
        return {
          color: 'error',
          icon: <NetworkCheckIcon />,
          text: 'Connection Error'
        };
      default:
        return {
          color: 'info',
          icon: <NetworkCheckIcon />,
          text: 'Connecting...'
        };
    }
  }
  
  const statusInfo = getStatusInfo();
  
  return (
    <Paper sx={{ mb: 2 }} elevation={1}>
      <Box
        sx={{
          p: 2,
          cursor: 'pointer',
          transition: 'background-color 0.2s',
          '&:hover': {
            backgroundColor: (theme) => alpha(theme.palette.action.hover, 0.5)
          }
        }}
        onClick={onToggleExpanded}
      >
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          
          {/* Left side - Status and stats */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <NetworkCheckIcon color="primary" />
              <Typography variant="h6" component="h3" sx={{ fontWeight: 500 }}>
                Network Status
              </Typography>
            </Box>
            
            <Chip
              icon={statusInfo.icon}
              label={statusInfo.text}
              color={statusInfo.color}
              size="small"
              variant="outlined"
            />
          </Box>
          
          {/* Center - Stats */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 3,
            color: 'text.secondary'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PeopleIcon fontSize="small" />
              <Typography variant="body2">
                {networkStats.peers} peers
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <SpeedIcon fontSize="small" />
              <Typography variant="body2">
                ↓ {formatSpeed(networkStats.downloadSpeed)}
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <SpeedIcon fontSize="small" />
              <Typography variant="body2">
                ↑ {formatSpeed(networkStats.uploadSpeed)}
              </Typography>
            </Box>
          </Box>
          
          {/* Right side - Expand button */}
          <IconButton size="small">
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
          
        </Box>
      </Box>
      
      {/* Expanded content */}
      <Collapse in={expanded} timeout={300}>
        <Box sx={{ 
          borderTop: 1, 
          borderColor: 'divider',
          backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.5)
        }}>
          <PeerList compact={true} />
        </Box>
      </Collapse>
    </Paper>
  );
}

export default NetworkStatusSection;