// socket.js
import { io } from 'socket.io-client';

let socket;

export function initSocket(onChat, onUserJoined, onUserLeft, onUsernameResponse, onUsernameTaken, onGlitchControl) {
  socket = io(
    window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      : window.location.origin,
    {
      withCredentials: true,
      transports: ['websocket', 'polling']
    }
  );

  if (onChat) socket.on('chat', onChat);
  if (onUserJoined) socket.on('user joined', onUserJoined);
  if (onUserLeft) socket.on('user left', onUserLeft);
  if (onUsernameResponse) socket.on('username response', onUsernameResponse);
  if (onUsernameTaken) socket.on('username taken', onUsernameTaken);
  if (onGlitchControl) socket.on('glitch-control', onGlitchControl);

  // Listen for theme changes from control panel
  socket.on('theme-change', (theme) => {
    console.log('Theme change received:', theme);
    
    // Remove all existing palette classes
    document.body.classList.remove('palette-purple', 'palette-blue');
    
    // Add the new theme class if specified
    if (theme) {
        document.body.classList.add(theme);
    }
});

  return socket;
}

export function getSocket() {
  return socket;
}
