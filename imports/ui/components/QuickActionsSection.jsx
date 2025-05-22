import React from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { alpha } from '@mui/material/styles';

// Icons
import FolderIcon from '@mui/icons-material/Folder';
import LinkIcon from '@mui/icons-material/Link';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import AddIcon from '@mui/icons-material/Add';

function QuickActionsSection({ hasNoTorrents, onShareData, onJoinShare }) {
  
  if (hasNoTorrents) {
    // Hero section for empty state
    return (
      <Paper 
        sx={{ 
          mb: 3,
          p: 4,
          textAlign: 'center',
          background: (theme) => 
            `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.secondary.main, 0.05)} 100%)`,
          border: (theme) => `1px solid ${alpha(theme.palette.primary.main, 0.1)}`
        }}
        elevation={0}
      >
        <Box sx={{ mb: 3 }}>
          <RocketLaunchIcon 
            sx={{ 
              fontSize: 48, 
              color: 'primary.main',
              mb: 2
            }} 
          />
          <Typography variant="h4" component="h2" gutterBottom sx={{ fontWeight: 500 }}>
            Get Started with FHIR P2P
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto' }}>
            Share your FHIR healthcare data securely with peers or join existing data sharing networks. 
            Connect with the global healthcare community through peer-to-peer collaboration.
          </Typography>
        </Box>
        
        <Box sx={{ 
          display: 'flex', 
          gap: 2, 
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <Button
            variant="contained"
            size="large"
            startIcon={<FolderIcon />}
            onClick={onShareData}
            sx={{ 
              px: 4, 
              py: 1.5,
              fontSize: '1.1rem',
              boxShadow: 2,
              '&:hover': {
                boxShadow: 4
              }
            }}
          >
            Share FHIR Data
          </Button>
          
          <Button
            variant="outlined"
            size="large"
            startIcon={<LinkIcon />}
            onClick={onJoinShare}
            sx={{ 
              px: 4, 
              py: 1.5,
              fontSize: '1.1rem',
              borderWidth: 2,
              '&:hover': {
                borderWidth: 2
              }
            }}
          >
            Join Share
          </Button>
        </Box>
        
        <Box sx={{ mt: 3 }}>
          <Typography variant="body2" color="text.secondary">
            ↓ View existing shares below
          </Typography>
        </Box>
      </Paper>
    );
  }
  
  // Compact actions bar when torrents exist
  return (
    <Paper 
      sx={{ 
        mb: 2,
        p: 2,
        backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.02)
      }}
      elevation={0}
    >
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center' 
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <RocketLaunchIcon color="primary" sx={{ fontSize: 20 }} />
          <Typography variant="h6" component="h2" sx={{ fontWeight: 500 }}>
            Quick Actions
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={onShareData}
          >
            Share Data
          </Button>
          
          <Button
            variant="outlined"
            size="small"
            startIcon={<LinkIcon />}
            onClick={onJoinShare}
          >
            Join
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}

export default QuickActionsSection;