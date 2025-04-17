import React from 'react';
import { createRoot } from 'react-dom/client';
import { Meteor } from 'meteor/meteor';

// Import polyfills first before any other modules
import '/imports/startup/client/polyfills';

// Then import app components
import { App } from '/imports/ui/App';
import { WebTorrentClient } from '/imports/api/torrents/webtorrent-client';

Meteor.startup(function() {
  console.log('FHIR P2P client starting...');
  
  // Create loading element during startup
  const loadingElement = document.createElement('div');
  loadingElement.id = 'loading-screen';
  loadingElement.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background-color: #f5f5f5;
    z-index: 9999;
  `;
  
  const loadingText = document.createElement('h2');
  loadingText.textContent = 'Loading FHIR P2P...';
  loadingText.style.marginBottom = '20px';
  
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    border: 4px solid rgba(0, 0, 0, 0.1);
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border-left-color: #3f51b5;
    animation: spin 1s linear infinite;
  `;
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  
  loadingElement.appendChild(loadingText);
  loadingElement.appendChild(spinner);
  document.head.appendChild(style);
  document.body.appendChild(loadingElement);
  
  // Initialize WebTorrent first to avoid issues
  try {
    console.log('Initializing WebTorrent client...');
    
    // // Start WebTorrent client initialization
    // WebTorrentClient.initialize()
    //   .then(() => {
    //     console.log('WebTorrent initialized successfully');
        
    //     // Render the app after WebTorrent is initialized
    //     const container = document.getElementById('react-target');
    //     if (!container) {
    //       console.error('Could not find #react-target element');
    //       return;
    //     }
        
    //     const root = createRoot(container);
    //     root.render(<App />);
        
    //     // Remove loading screen after app is rendered
    //     Meteor.setTimeout(function() {
    //       const loadingScreen = document.getElementById('loading-screen');
    //       if (loadingScreen) {
    //         loadingScreen.style.opacity = '0';
    //         loadingScreen.style.transition = 'opacity 0.5s ease';
    //         setTimeout(function() {
    //           loadingScreen.remove();
    //         }, 500);
    //       }
    //     }, 500);
    //   })
    //   .catch((error) => {
    //     console.error('Error during WebTorrent initialization:', error);
        
    //     // Render the app anyway to show the error
    //     const container = document.getElementById('react-target');
    //     if (container) {
    //       const root = createRoot(container);
    //       root.render(<App />);
    //     }
        
    //     // Update loading text to show error
    //     const loadingScreen = document.getElementById('loading-screen');
    //     if (loadingScreen) {
    //       const loadingText = loadingScreen.querySelector('h2');
    //       if (loadingText) {
    //         loadingText.textContent = 'Error initializing WebTorrent';
    //         loadingText.style.color = 'red';
    //       }
          
    //       const errorMessage = document.createElement('p');
    //       errorMessage.textContent = error.message || 'Unknown error';
    //       errorMessage.style.color = 'red';
    //       loadingScreen.appendChild(errorMessage);
          
    //       const retryButton = document.createElement('button');
    //       retryButton.textContent = 'Retry';
    //       retryButton.style.marginTop = '20px';
    //       retryButton.style.padding = '8px 16px';
    //       retryButton.onclick = function() { window.location.reload(); };
    //       loadingScreen.appendChild(retryButton);
    //     }
    //   });
  } catch (error) {
    console.error('Fatal error during initialization:', error);
    
    // Render the app anyway to show the error
    const container = document.getElementById('react-target');
    if (container) {
      const root = createRoot(container);
      root.render(<App />);
    }
    
    // Update loading text to show error
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      const loadingText = loadingScreen.querySelector('h2');
      if (loadingText) {
        loadingText.textContent = 'Fatal Error';
        loadingText.style.color = 'red';
      }
      
      const errorMessage = document.createElement('p');
      errorMessage.textContent = error.message || 'Unknown error';
      errorMessage.style.color = 'red';
      loadingScreen.appendChild(errorMessage);
      
      const retryButton = document.createElement('button');
      retryButton.textContent = 'Retry';
      retryButton.style.marginTop = '20px';
      retryButton.style.padding = '8px 16px';
      retryButton.onclick = function() { window.location.reload(); };
      loadingScreen.appendChild(retryButton);
    }
  }
});