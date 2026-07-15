// roomMain.js — client for /room (the card-game room page).
// Reuses chatUI.js as-is for username entry + chat rendering; talks to the
// isolated /rooms socket.io namespace instead of the default namespace.
import { initSocket } from "./socket.js";
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
} from "./chatUI.js";

const ROOMS_NAMESPACE = "/rooms";

let username = null;
let roomName = getRoomNameFromHash();

// ----- room-name entry (only when the URL has no #roomName) -----
const roomEntryPopup = document.getElementById("room-entry-popup");
const roomNameInput = document.getElementById("room-name-input");
const roomNameSubmit = document.getElementById("room-name-submit");

function getRoomNameFromHash() {
  // location.hash includes the leading '#'; strip it and trim.
  return decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
}

function showRoomEntryPopup() {
  roomEntryPopup.style.display = "flex";
  roomNameInput?.focus();
}

function hideRoomEntryPopup() {
  roomEntryPopup.style.display = "none";
}

function handleRoomNameSubmit() {
  const name = (roomNameInput?.value || "").trim();
  if (!name) return;
  roomName = name;
  // Put the room name in the hash so a refresh/reload rejoins the same room.
  window.location.hash = encodeURIComponent(name);
  hideRoomEntryPopup();
  hideRoomError();
  showUsernamePopup();
}

function hideRoomError() {
  const err = document.getElementById("room-error");
  if (err) err.remove();
}

function showRoomError(text) {
  hideRoomError();
  const err = document.createElement("p");
  err.id = "room-error";
  err.style.color = "#ff0000";
  err.textContent = text;
  roomEntryPopup.querySelector(".login-content").appendChild(err);
  showRoomEntryPopup();
}

if (roomNameSubmit) {
  roomNameSubmit.addEventListener("click", handleRoomNameSubmit);
}
if (roomNameInput) {
  roomNameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRoomNameSubmit();
    }
  });
}

// ----- chat + username wiring (mirrors main.js, minus visuals/dialogue) -----
function handleSend() {
  const message = getChatInput();
  if (message && username) {
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
  if (username && roomName) {
    window._socket.emit("check username", { roomName, username });
  }
}

function onChat(messageObj) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${
    messageObj.username === username ? "mine" : "others"
  }`;
  msgDiv.innerHTML = `
    <span class="user-id">${messageObj.username}:</span>
    <span class="text">${messageObj.text}</span>
    <span class="timestamp">${new Date(
      messageObj.timestamp,
    ).toLocaleTimeString()}</span>
  `;
  addMessageToChat(msgDiv);
}

function onUserJoined(data) {
  const { username: name } = data;
  const joinMessage = document.createElement("div");
  joinMessage.className = "system-message";
  joinMessage.innerHTML = `<i><strong>${name}</strong> entered the chat</i>`;
  addMessageToChat(joinMessage);
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
    return;
  }
  // Not taken — request to join. Don't hide the popup yet; wait for the
  // server's room-joined confirmation so a room-full rejection can still
  // surface on the popup.
  hideErrorMessage();
  window._socket.emit("user joined", { roomName, username });
}

function onUsernameTaken() {
  showErrorMessage();
}

// initChatUI wires the username popup + chat input/send button.
initChatUI(handleSend, handleUsernameSubmit);

// Connect to the isolated /rooms namespace.
window._socket = initSocket(
  onChat,
  onUserJoined,
  onUserLeft,
  onUsernameResponse,
  onUsernameTaken,
  null, // onGlitchControl — unused on the room page
  ROOMS_NAMESPACE,
);

// Join confirmed — leave name-entry.
window._socket.on("room-joined", ({ username: name }) => {
  hideUsernamePopup();
  hideErrorMessage();
  updateUserDisplayName(name);
});

// Room at capacity — turn the third scanner away explicitly.
window._socket.on("room-full", ({ capacity } = {}) => {
  username = null;
  hideUsernamePopup();
  showRoomError(
    `This room is full (${capacity} players max). Please join the other room.`,
  );
});

// Refresh button — server broadcasts room-reset to the room; both clients
// reload, disconnecting sockets and freeing names + room state for the next pair.
window._socket.on("room-reset", () => {
  location.reload();
});

const refreshBtn = document.getElementById("refresh-btn");
if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    window._socket.emit("room-reset");
  });
}

// Re-join on reconnect (socket.io may re-establish without a page reload).
window._socket.on("reconnect", () => {
  if (username && roomName) {
    window._socket.emit("user joined", { roomName, username });
  }
});

// Initial screen: room name first if missing, otherwise straight to sign-in.
if (roomName) {
  showUsernamePopup();
} else {
  showRoomEntryPopup();
}
