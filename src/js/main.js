import { initSocket } from './socket.js';
import {
  initChatUI,
  getChatInput,
  clearChatInput,
  addMessageToChat,
  showUsernamePopup,
  hideUsernamePopup,
  getUsernameInput,
  showErrorMessage,
  hideErrorMessage,
  updateUserDisplayName,
  updateLastJoinedUser,
  isRoom2
} from './chatUI.js';
import { initChatDrag } from './chatDrag.js';
import { initVisuals } from './visuals.js';

// In room1, always show popup. In room2, use localStorage.
let username = isRoom2 ? localStorage.getItem('username') : null;
let visuals;

function handleSend() {
  const message = getChatInput();
  if (message && username) {
    window._socket.emit('chat', {
      text: message,
      username,
      timestamp: Date.now()
    });
    clearChatInput();
  }
}

function handleUsernameSubmit() {
  username = getUsernameInput();
  if (username) {
    window._socket.emit('check username', username);
  }
}

function onChat(messageObj) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${messageObj.username === username ? 'mine' : 'others'}`;
  msgDiv.innerHTML = `
    <span class="user-id">${messageObj.username}:</span>
    <span class="text">${messageObj.text}</span>
    <span class="timestamp">${new Date(messageObj.timestamp).toLocaleTimeString()}</span>
  `;
  addMessageToChat(msgDiv);
  if (visuals) visuals.flash();
}

function onUserJoined(name) {
  const joinMessage = document.createElement('div');
  joinMessage.className = 'system-message';
  joinMessage.innerHTML = `<i><strong>${name}</strong> entered the chat</i>`;
  addMessageToChat(joinMessage);
  updateLastJoinedUser(name);
}

function onUserLeft(name) {
  const leaveMessage = document.createElement('div');
  leaveMessage.className = 'system-message';
  leaveMessage.innerHTML = `<i><strong>${name}</strong> left the chat</i>`;
  addMessageToChat(leaveMessage);
}

function onUsernameResponse(isTaken) {
  if (isTaken) {
    showErrorMessage();
  } else { 
    localStorage.setItem('username', username);
    updateUserDisplayName(username);
    hideUsernamePopup();
    window._socket.emit('user joined', username);
    hideErrorMessage();
  }
}

function onUsernameTaken() {
  showErrorMessage();
}

function onGlitchControl(data) {
  if (!visuals) return;
  switch(data.parameter) {
    case 'glitchProbability': visuals.setGlitchProbability(data.value); break;
    case 'glitchDecay': visuals.setGlitchDecay(data.value); break;
    case 'channelOffset': visuals.setChannelOffset(data.value); break;
    case 'glitchIntensity': visuals.setGlitchIntensity(data.value); break;
    case 'cameraAngle': visuals.setCameraAngle(data.value); break;
  }
}

// Initialize modules
initChatUI(handleSend, handleUsernameSubmit);
visuals = initVisuals();
initChatDrag();
window._socket = initSocket(
  onChat,
  onUserJoined,
  onUserLeft,
  onUsernameResponse,
  onUsernameTaken,
  onGlitchControl
);

window._socket.on('reconnect', () => {
  // Optionally re-join the room or re-send username
  if (username) {
    window._socket.emit('user joined', username);
  }
  // Optionally re-bind UI event handlers if needed
});

// Show username popup if needed
if (!username) {
  showUsernamePopup();
} else {
  updateUserDisplayName(username);
  window._socket.emit('set username', username);
}