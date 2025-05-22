import React, { useState, useEffect } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { get } from 'lodash';
import { alpha } from '@mui/material/styles';

// Icons
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FolderIcon from '@mui/icons-material/Folder';
import LinkIcon from '@mui/icons-material/Link';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import StorageIcon from '@mui/icons-material/Storage';
import SettingsIcon from '@mui/icons-material/Settings';
import HelpIcon from '@mui/icons-material/Help';
import AddIcon from '@mui/icons-material/Add';

import { Settings } from '../api/settings/settings';
import TorrentList from './components/TorrentList';
import PeerList from './components/PeerList';
import DataViewer from './components/DataViewer';
// Note: These components need to be created in the imports/ui/components/ directory
// import ShareWizardModal from './components/ShareWizardModal';
// import JoinShareModal from './components/JoinShareModal';
// import NetworkStatusSection from './components/NetworkStatusSection';
// import QuickActionsSection from './components/QuickActionsSection';

// Temporary inline components for demo
import ShareWizardModal from './components/ShareWizardModal'; // Replace with actual modal
import JoinShareModal from './components/JoinShareModal'; // Replace with actual modal

// Inline NetworkStatusSection for now
function NetworkStatusSection({ expanded, onToggleExpanded }) {
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <NetworkCheckIcon color="primary" />
              <Typography variant="h6" component="h3" sx={{ fontWeight: 500 }}>
                Network Status
              </Typography>
            </Box>
          </Box>
          <IconButton size="small">
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>
      </Box>
      <Collapse in={expanded} timeout={300}>
        <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
          <PeerList compact={true} />
        </Box>
      </Collapse>
    </Paper>
  );
}

// Inline QuickActionsSection for now  
function QuickActionsSection({ hasNoTorrents, onShareData, onJoinShare }) {
  if (hasNoTorrents) {
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
          <StorageIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
          <Typography variant="h4" component="h2" gutterBottom sx={{ fontWeight: 500 }}>
            Get Started with FHIR P2P
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto' }}>
            Share your FHIR healthcare data securely with peers or join existing data sharing networks.
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            size="large"
            startIcon={<FolderIcon />}
            onClick={onShareData}
            sx={{ px: 4, py: 1.5, fontSize: '1.1rem' }}
          >
            Share FHIR Data
          </Button>
          
          <Button
            variant="outlined"
            size="large"
            startIcon={<LinkIcon />}
            onClick={onJoinShare}
            sx={{ px: 4, py: 1.5, fontSize: '1.1rem' }}
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
  
  return (
    <Paper sx={{ mb: 2, p: 2 }} elevation={0}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 500 }}>
          Quick Actions
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={onShareData}>
            Share Data
          </Button>
          <Button variant="outlined" size="small" startIcon={<LinkIcon />} onClick={onJoinShare}>
            Join
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}

// Create theme
function createAppTheme() {
  try {
    const uiConfig = Settings.getUIConfig();
    const isDark = get(uiConfig, 'theme', 'light') === 'dark';
    
    return createTheme({
      palette: {
        mode: isDark ? 'dark' : 'light',
        primary: {
          main: '#3f51b5',
        },
        secondary: {
          main: '#f50057',
        },
      },
      typography: {
        fontFamily: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ].join(','),
      },
      components: {
        MuiTableCell: {
          styleOverrides: {
            root: {
              padding: get(uiConfig, 'density') === 'compact' ? '4px 8px' : '8px 16px',
            },
          },
        },
      },
    });
  } catch (error) {
    console.error('Error creating theme:', error);
    return createTheme();
  }
}

export function App() {
  const [theme, setTheme] = useState(createAppTheme());
  const [selectedTorrent, setSelectedTorrent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // UI State Management
  const [networkSectionExpanded, setNetworkSectionExpanded] = useState(false);
  const [shareWizardOpen, setShareWizardOpen] = useState(false);
  const [joinShareOpen, setJoinShareOpen] = useState(false);
  const [torrents, setTorrents] = useState([]);
  
  // Initialize app
  useEffect(function() {
    try {
      console.log('App component mounted');
      
      const timer = setTimeout(function() {
        setIsLoading(false);
        console.log('App loading complete');
      }, 1000);
      
      return function() {
        clearTimeout(timer);
      };
    } catch (err) {
      console.error('Error in App initialization:', err);
      setError(err.message || 'Unknown error occurred during application initialization');
      setIsLoading(false);
    }
  }, []);
  
  // Handle torrent selection
  function handleSelectTorrent(torrent) {
    console.log('Selected torrent:', torrent);
    setSelectedTorrent(torrent);
  }
  
  // Handle torrent updates (for empty state detection)
  function handleTorrentsUpdate(newTorrents) {
    setTorrents(newTorrents || []);
  }
  
  // Show loading state
  if (isLoading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          flexDirection: 'column',
          gap: 2
        }}>
          <CircularProgress size={48} />
          <Typography variant="body1" color="text.secondary">
            Loading FHIR P2P...
          </Typography>
        </Box>
      </ThemeProvider>
    );
  }
  
  // Show error if there is one
  if (error) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ m: 2 }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            Error: {error}
          </Alert>
        </Box>
      </ThemeProvider>
    );
  }
  
  const hasNoTorrents = torrents.length === 0;
  
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ 
        minHeight: '100vh', 
        background: (theme) => theme.palette.mode === 'dark' 
    ? 'linear-gradient(180deg, #121212 0%, #1a1a1a 100%)'
    : 'linear-gradient(180deg, #fafafa 0%, #f5f5f5 100%)'
      }}>
        
        {/* Header Section */}
        <Paper 
          elevation={1} 
          sx={{ 
            p: 2, 
            mb: 2,
            borderRadius: 0,
            position: 'sticky',
            top: 0,
            zIndex: 1000
          }}
        >
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center' 
          }}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }}>
              FHIR P2P Data Sharing
            </Typography>
            
            <Box sx={{ display: 'flex', gap: 1 }}>
              <IconButton size="small" color="inherit">
                <SettingsIcon />
              </IconButton>
              <IconButton size="small" color="inherit">
                <HelpIcon />
              </IconButton>
            </Box>
          </Box>
        </Paper>

        <Box sx={{ maxWidth: 'xl', mx: 'auto', px: 2, pb: 2 }}>
          
          {/* Quick Actions / Hero Section */}
          <QuickActionsSection 
            hasNoTorrents={hasNoTorrents}
            onShareData={() => setShareWizardOpen(true)}
            onJoinShare={() => setJoinShareOpen(true)}
          />
          
          {/* Network Status Section (Collapsible) */}
          <NetworkStatusSection 
            expanded={networkSectionExpanded}
            onToggleExpanded={() => setNetworkSectionExpanded(!networkSectionExpanded)}
          />
          
          {/* My Shares Section (Always Visible Core) */}
          <Paper sx={{ mb: 2 }}>
            <Box sx={{ p: 2, pb: 0 }}>
              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                mb: 2
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <StorageIcon color="primary" />
                  <Typography variant="h6" component="h2">
                    My Shares
                    {torrents.length > 0 && (
                      <Typography 
                        component="span" 
                        variant="body2" 
                        color="text.secondary"
                        sx={{ ml: 1 }}
                      >
                        ({torrents.length} active)
                      </Typography>
                    )}
                  </Typography>
                </Box>
                
                {!hasNoTorrents && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => setShareWizardOpen(true)}
                  >
                    Add Share
                  </Button>
                )}
              </Box>
            </Box>
            
            <TorrentList 
              onSelectTorrent={handleSelectTorrent}
              onTorrentsUpdate={handleTorrentsUpdate}
              selectedTorrent={selectedTorrent}
            />
          </Paper>
          
          {/* Data Viewer Section (Appears on Selection) */}
          <Collapse in={!!selectedTorrent} timeout={300}>
            {selectedTorrent && (
              <Paper sx={{ mb: 2 }}>                
                <DataViewer selectedTorrent={selectedTorrent} />
              </Paper>
            )}
          </Collapse>
          
        </Box>
        
        {/* Modals */}
        <ShareWizardModal 
          open={shareWizardOpen}
          onClose={() => setShareWizardOpen(false)}
        />
        
        <JoinShareModal 
          open={joinShareOpen}
          onClose={() => setJoinShareOpen(false)}
        />
        
      </Box>
    </ThemeProvider>
  );
}