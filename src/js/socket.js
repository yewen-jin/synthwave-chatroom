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

  return socket;
}

export function getSocket() {
  return socket;
}
