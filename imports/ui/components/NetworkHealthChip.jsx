import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import CircleIcon from '@mui/icons-material/Circle';



function NetworkHealthChip() {
  const [health, setHealth] = useState({ status: 'unknown', tooltip: 'Unknown: Checking network settings...' });
  


  useEffect(function() {
      function checkHealth() {
        Meteor.call('network.getBasicStatus', function(err, result) {
          if (err || !result) {
            setHealth({ 
              status: 'error', 
              tooltip: 'Error: Network check failed - server connection error' 
            });
            return;
          }
          
          const { clientInitialized, totalTorrents, activeTorrents, totalPeers } = result;
          
          if (!clientInitialized) {
            setHealth({ 
              status: 'error', 
              tooltip: 'Error: WebTorrent client not initialized' 
            });
          } else if (totalTorrents === 0) {
            setHealth({ 
              status: 'inactive', 
              tooltip: 'Inactive: No active shares - network idle' 
            });
          } else if (totalPeers > 0) {
            setHealth({ 
              status: 'success', 
              tooltip: `Success: ${totalPeers} peers connected across ${activeTorrents}/${totalTorrents} shares` 
            });
          } else {
            setHealth({ 
              status: 'warning', 
              tooltip: `Warning: ${totalTorrents} shares active but no peers connected yet` 
            });
          }
        });
      }
    
    checkHealth();

    const interval = Meteor.setInterval(checkHealth, 1000); // Check every second
    // const interval = Meteor.setInterval(checkHealth, 60000); // Check every minute
    
    return function() {
      Meteor.clearInterval(interval);
    };
  }, []);
  
  const statusConfig = {
    success: { color: 'success', icon: <CircleIcon sx={{ fontSize: 12 }} /> },
    inactive: { color: 'inactive', icon: <CircleIcon sx={{ fontSize: 12 }} /> },
    warning: { color: 'warning', icon: <CircleIcon sx={{ fontSize: 12 }} /> },
    error: { color: 'error', icon: <CircleIcon sx={{ fontSize: 12 }} /> },
    unknown: { color: 'default', icon: <CircleIcon sx={{ fontSize: 12 }} /> }
  };
  
  const config = statusConfig[health.status];
  
  return (
    <Tooltip title={health.tooltip} sx={{marginTop: '5px'}}>
      <Chip
        icon={config.icon}
        label="Network"
        size="small"
        color={config.color}
        variant="outlined"
      />
    </Tooltip>
  );
}

export default NetworkHealthChip;