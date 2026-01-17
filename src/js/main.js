import { initSocket } from "./socket.js"; // for communication
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
  isRoom2,
  // isNarratorRoom,
} from "./chatUI.js"; //the chatroom core interaction
import { initChatDrag } from "./chatDrag.js"; //dragging functionality, optional
import { initVisuals } from "./visuals.js"; // background animation, can be replaced
import { initDialogueController } from "./dialogueController.js";

// In room1, always show popup. In room2, use localStorage.
let username = isRoom2 ? localStorage.getItem("username") : null;
let visuals;
let dialogueControllerInitialized = false; // Track if dialogue controller has been initialized

//socket related functions
function handleSend() {
  const message = getChatInput(); //typed in the input area
  if (message && username) {
    //if both username and message exist
    window._socket.emit("chat", {
      text: message,
      username: username,
      timestamp: Date.now(),
    });
    clearChatInput();
  }
}

function handleUsernameSubmit() {
  username = getUsernameInput();
  if (username) {
    window._socket.emit("check username", username);
  }
}

function onChat(messageObj) {
  const msgDiv = document.createElement("div");

  // Handle system messages (new messageSequence format)
  if (messageObj.isSystem) {
    msgDiv.className = "message system-message-inline";
    msgDiv.innerHTML = `<span class="text">${messageObj.text}</span>`;
    addMessageToChat(msgDiv);
    if (visuals) visuals.flash();
    return;
  }

  // Handle image messages (new messageSequence format)
  if (messageObj.isImage) {
    msgDiv.className = "message image-message";
    const img = document.createElement("img");
    img.src = messageObj.imageUrl;
    img.alt = messageObj.imageAlt || "";
    img.loading = "lazy";
    msgDiv.appendChild(img);
    addMessageToChat(msgDiv);
    if (visuals) visuals.flash();
    return;
  }

  // Regular chat messages (player or narrator)
  msgDiv.className = `message ${
    messageObj.username === username ? "mine" : "others"
  }`;
  msgDiv.innerHTML = `
    <span class="user-id">${messageObj.username}:</span>
    <span class="text">${messageObj.text}</span>
    <span class="timestamp">${new Date(
      messageObj.timestamp
    ).toLocaleTimeString()}</span>
  `;
  addMessageToChat(msgDiv);
  if (visuals) visuals.flash();
}

function onUserJoined(name) {
  const joinMessage = document.createElement("div");
  joinMessage.className = "system-message";
  joinMessage.innerHTML = `<i><strong>${name}</strong> entered the chat</i>`;
  addMessageToChat(joinMessage);
  updateLastJoinedUser(name);
}

function onUserLeft(name) {
  const leaveMessage = document.createElement("div");
  leaveMessage.className = "system-message";
  leaveMessage.innerHTML = `<i><strong>${name}</strong> left the chat</i>`;
  addMessageToChat(leaveMessage);
}

function onUsernameResponse(isTaken) {
  if (isTaken) {
    showErrorMessage();
  } else {
    localStorage.setItem("username", username);
    updateUserDisplayName(username);
    hideUsernamePopup();
    hideErrorMessage();

    // Initialize dialogue controller for player-room or narrator-room BEFORE emitting user joined
    const isNarratorRoom = window.location.pathname.includes("narrator-room");
    const isPlayerRoom =
      window.location.pathname.includes("player-room.html") ||
      window.location.pathname === "/player-room";
    if ((isNarratorRoom || isPlayerRoom) && !dialogueControllerInitialized) {
      dialogueControllerInitialized = true;
      initDialogueController(window._socket, username, onChat, () => {
        if (visuals) visuals.flash();
      });
    }

    // Emit user joined AFTER dialogue controller is set up
    window._socket.emit("user joined", username);
  }
}

function onUsernameTaken() {
  showErrorMessage();
}

function onGlitchControl(data) {
  if (!visuals) return;
  switch (data.parameter) {
    case "glitchProbability":
      visuals.setGlitchProbability(data.value);
      break;
    case "glitchDecay":
      visuals.setGlitchDecay(data.value);
      break;
    case "channelOffset":
      visuals.setChannelOffset(data.value);
      break;
    case "glitchIntensity":
      visuals.setGlitchIntensity(data.value);
      break;
    case "cameraAngle":
      visuals.setCameraAngle(data.value);
      break;
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

window._socket.on("reconnect", () => {
  // Optionally re-join the room or re-send username
  if (username) {
    window._socket.emit("user joined", username);
  }
  // Optionally re-bind UI event handlers if needed
});

// Detect if we're in game rooms
const isNarratorRoom = window.location.pathname.includes("narrator-room");
const isPlayerRoom =
  window.location.pathname.includes("player-room.html") ||
  window.location.pathname === "/player-room";

// Show username popup if needed
if (!username) {
  showUsernamePopup();
} else {
  updateUserDisplayName(username);

  // Initialize dialogue controller for player-room or narrator-room BEFORE emitting user joined
  if ((isNarratorRoom || isPlayerRoom) && !dialogueControllerInitialized) {
    dialogueControllerInitialized = true;
    initDialogueController(window._socket, username, onChat, () => {
      if (visuals) visuals.flash();
    });
  }

  // Emit user joined AFTER dialogue controller is set up
  window._socket.emit("set username", username);
}
