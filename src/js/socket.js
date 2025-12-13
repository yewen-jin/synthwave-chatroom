// socket.js
import { io } from 'socket.io-client';

let socket;

export function initSocket(onChat, onUserJoined, onUserLeft, onUsernameResponse, onUsernameError, onGlitchControl) {
    const socket = io(
        window.location.hostname === 'localhost'
            ? 'http://localhost:3000'
            : window.location.origin,
        {
            withCredentials: true,
            transports: ['websocket', 'polling']
        }
    );
    
    
    // Set up existing event handlers
    socket.on('chat', onChat);
    socket.on('user joined', onUserJoined);
    socket.on('user left', onUserLeft);
    socket.on('username response', onUsernameResponse);
    socket.on('username taken', onUsernameError);
    socket.on('glitch-control', onGlitchControl);

    // Listen for theme changes from control panel
    socket.on('theme-change', (theme) => {
      console.log('Theme change received:', theme);
      
      // Remove all existing palette classes
      document.body.classList.remove('palette-purple', 'palette-blue' , 'palette-green');
      
      // Add the new theme class if specified
      if (theme) {
          document.body.classList.add(theme);
      }
  });

    window._socket = socket;
    return socket;
}

export function getSocket() {
  return socket;
}
