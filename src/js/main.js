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
  hideErrorMessage
} from './chatUI.js';
import { initChatDrag } from './chatDrag.js';
import { initVisuals } from './visuals.js';

let username = localStorage.getItem('username');
let visuals;

function handleSend() {
  const message = getChatInput();
  if (message && username) {
    const socket = window._socket;
    socket.emit('chat', {
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

// Show username popup if needed
if (!username) {
  showUsernamePopup();
} else {
  window._socket.emit('set username', username);
}
