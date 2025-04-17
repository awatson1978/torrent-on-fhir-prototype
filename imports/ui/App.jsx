import React, { useState, useEffect } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { get } from 'lodash';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';

import { Settings } from '../api/settings/settings';
import TorrentList from './components/TorrentList';
import PeerList from './components/PeerList';
import DataViewer from './components/DataViewer';
import CreateTorrent from './components/CreateTorrent';
import FhirInput from './components/FhirInput';
import DebugPanel from './components/DebugPanel';

// Create a theme based on settings
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
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
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
    // Return default theme if there's an error
    return createTheme();
  }
}

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ pt: 2 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index) {
  return {
    id: `simple-tab-${index}`,
    'aria-controls': `simple-tabpanel-${index}`,
  };
}

// Make sure to export the component correctly
// Note we're using a named function instead of an arrow function with const
export function App() {
  const [theme, setTheme] = useState(createAppTheme());
  const [selectedTorrent, setSelectedTorrent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  
  // Effect to initialize app and handle errors
  useEffect(function() {
    try {
      console.log('App component mounted');
      
      // Simulate loading to ensure UI has time to initialize
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
  
  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };
  
  // Show loading state
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  
  // Show error if there is one
  if (error) {
    return (
      <Box sx={{ m: 2 }}>
        <Alert severity="error">
          Error: {error}
        </Alert>
        <DebugPanel />
      </Box>
    );
  }
  
  // Main application
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ flexGrow: 1, m: 2 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          FHIR P2P Data Sharing
        </Typography>
        
        <Alert severity="info" sx={{ mb: 2 }}>
          WebTorrent client is disabled in the browser. Current UI connects to the server-side WebTorrent.
        </Alert>
        
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <PeerList />
          </Grid>
                    <Grid item xs={12} md={6}>
            <TorrentList onSelectTorrent={handleSelectTorrent} />
          </Grid>
          

          
          <Grid item xs={12}>
            <DataViewer selectedTorrent={selectedTorrent} />
          </Grid>
          
          <Grid item xs={12}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', width: '100%' }}>
              <Tabs value={tabValue} onChange={handleTabChange} aria-label="input tabs">
                <Tab label="Create From FHIR Data" {...a11yProps(0)} />
                <Tab label="Add From Magnet" {...a11yProps(1)} />
              </Tabs>
            </Box>
            
            <TabPanel value={tabValue} index={1}>
              <CreateTorrent />
            </TabPanel>
            
            <TabPanel value={tabValue} index={0}>
              <FhirInput />
            </TabPanel>
          </Grid>
        </Grid>
        
        {/* Add Debug Panel */}
        <DebugPanel />
      </Box>
    </ThemeProvider>
  );
}


// import React, { useState, useEffect } from 'react';
// import { createTheme, ThemeProvider } from '@mui/material/styles';
// import CssBaseline from '@mui/material/CssBaseline';
// import Box from '@mui/material/Box';
// import Grid from '@mui/material/Grid';
// import Typography from '@mui/material/Typography';
// import { get } from 'lodash';
// import CircularProgress from '@mui/material/CircularProgress';
// import Alert from '@mui/material/Alert';
// import Paper from '@mui/material/Paper';

// import { Settings } from '../api/settings/settings';
// import DebugPanel from './components/DebugPanel';

// // Create a theme based on settings
// function createAppTheme() {
//   try {
//     const uiConfig = Settings.getUIConfig();
//     const isDark = get(uiConfig, 'theme', 'light') === 'dark';
    
//     return createTheme({
//       palette: {
//         mode: isDark ? 'dark' : 'light',
//         primary: {
//           main: '#3f51b5',
//         },
//         secondary: {
//           main: '#f50057',
//         },
//       },
//       typography: {
//         fontFamily: [
//           '-apple-system',
//           'BlinkMacSystemFont',
//           '"Segoe UI"',
//           'Roboto',
//           '"Helvetica Neue"',
//           'Arial',
//           'sans-serif',
//           '"Apple Color Emoji"',
//           '"Segoe UI Emoji"',
//           '"Segoe UI Symbol"',
//         ].join(','),
//       },
//       components: {
//         MuiTableCell: {
//           styleOverrides: {
//             root: {
//               padding: get(uiConfig, 'density') === 'compact' ? '4px 8px' : '8px 16px',
//             },
//           },
//         },
//       },
//     });
//   } catch (error) {
//     console.error('Error creating theme:', error);
//     // Return default theme if there's an error
//     return createTheme();
//   }
// }

// // Make sure to export the component correctly
// // Note we're using a named function instead of an arrow function with const
// export function App() {
//   const [theme, setTheme] = useState(createAppTheme());
//   const [isLoading, setIsLoading] = useState(true);
//   const [error, setError] = useState(null);
  
//   // Effect to initialize app and handle errors
//   useEffect(function() {
//     try {
//       console.log('App component mounted');
      
//       // Simulate loading to ensure UI has time to initialize
//       const timer = setTimeout(function() {
//         setIsLoading(false);
//         console.log('App loading complete');
//       }, 1000);
      
//       return function() {
//         clearTimeout(timer);
//       };
//     } catch (err) {
//       console.error('Error in App initialization:', err);
//       setError(err.message || 'Unknown error occurred during application initialization');
//       setIsLoading(false);
//     }
//   }, []);
  
//   // Show loading state
//   if (isLoading) {
//     return (
//       <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
//         <CircularProgress />
//       </Box>
//     );
//   }
  
//   // Show error if there is one
//   if (error) {
//     return (
//       <Box sx={{ m: 2 }}>
//         <Alert severity="error">
//           Error: {error}
//         </Alert>
//         <DebugPanel />
//       </Box>
//     );
//   }
  
//   // Main application
//   return (
//     <ThemeProvider theme={theme}>
//       <CssBaseline />
//       <Box sx={{ flexGrow: 1, m: 2 }}>
//         <Typography variant="h4" component="h1" gutterBottom>
//           FHIR P2P Data Sharing
//         </Typography>
        
//         <Alert severity="info" sx={{ mb: 2 }}>
//           WebTorrent client is currently disabled in the browser. 
//           This is a minimal UI version for development purposes.
//         </Alert>
        
//         <Grid container spacing={2}>
//           <Grid item xs={12} md={6}>
//             <Paper sx={{ p: 2 }}>
//               <Typography variant="h6" component="h2" gutterBottom>
//                 Available Torrents
//               </Typography>
//               <Typography variant="body1">
//                 WebTorrent client is disabled. Torrents will be displayed here when the client is enabled.
//               </Typography>
//             </Paper>
//           </Grid>
          
//           <Grid item xs={12} md={6}>
//             <Paper sx={{ p: 2 }}>
//               <Typography variant="h6" component="h2" gutterBottom>
//                 Connected Peers
//               </Typography>
//               <Typography variant="body1">
//                 WebTorrent client is disabled. Peers will be displayed here when the client is enabled.
//               </Typography>
//             </Paper>
//           </Grid>
          
//           <Grid item xs={12}>
//             <Paper sx={{ p: 2 }}>
//               <Typography variant="h6" component="h2" gutterBottom>
//                 Data Viewer
//               </Typography>
//               <Typography variant="body1">
//                 WebTorrent client is disabled. FHIR data will be displayed here when the client is enabled.
//               </Typography>
//             </Paper>
//           </Grid>
          
//           <Grid item xs={12}>
//             <Paper sx={{ p: 2 }}>
//               <Typography variant="h6" component="h2" gutterBottom>
//                 Create/Add Torrent
//               </Typography>
//               <Typography variant="body1">
//                 WebTorrent client is disabled. Torrent creation will be available here when the client is enabled.
//               </Typography>
//             </Paper>
//           </Grid>
//         </Grid>
        
//         {/* Add Debug Panel */}
//         <DebugPanel />
//       </Box>
//     </ThemeProvider>
//   );
// }