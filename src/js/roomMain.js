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
import { initChatDrag } from "./chatDrag.js";
import { initVisuals } from "./visuals.js";

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
// Same background canvas + draggable/maximizable window as /chatroom, so the
// room reads as the same app skin. No glitch-control wiring: those events
// only ever broadcast on the default namespace (from /control), not /rooms.
initVisuals();
initChatDrag();

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

// ----- audio: data-driven track selection + per-room playback -----
let tracks = [];
const audioCache = new Map(); // track filename -> HTMLAudioElement
const trackReady = new Set(); // tracks that have fired canplaythrough
let currentTrack = null;
let trackSelected = false;

const trackSelectionEl = document.getElementById("track-selection");
const trackListEl = document.getElementById("track-list");
const trackWaitingEl = document.getElementById("track-waiting");
let nowPlayingEl = null;

function trackLabel(name, i) {
  return `Track ${i + 1}`;
}

function buildTrackButtons() {
  if (!trackListEl) return;
  trackListEl.innerHTML = "";
  tracks.forEach((name, i) => {
    const btn = document.createElement("button");
    btn.className = "track-btn";
    btn.type = "button";
    btn.textContent = trackLabel(name, i);
    btn.title = name;
    btn.dataset.track = name;
    btn.disabled = !trackReady.has(name);
    btn.addEventListener("click", () => {
      if (btn.disabled || trackSelected) return;
      window._socket.emit("audio-select", { track: name });
    });
    trackListEl.appendChild(btn);
  });
}

function preloadTrack(name) {
  if (audioCache.has(name)) return;
  const audio = new Audio(`/audio/${encodeURIComponent(name)}`);
  audio.preload = "auto";
  audio.addEventListener("canplaythrough", () => {
    trackReady.add(name);
    const btn = trackListEl?.querySelector(
      `[data-track="${CSS.escape(name)}"]`,
    );
    if (btn) btn.disabled = false;
  });
  audioCache.set(name, audio);
}

window._socket.on("audio-tracks", ({ tracks: list } = {}) => {
  tracks = Array.isArray(list) ? list : [];
  tracks.forEach(preloadTrack);
  buildTrackButtons();
});

function showNowPlaying(name) {
  if (nowPlayingEl?.parentNode) nowPlayingEl.remove();
  nowPlayingEl = document.createElement("div");
  nowPlayingEl.className = "now-playing";
  nowPlayingEl.textContent = `♪ now playing: ${name}`;
  const chatArea = document.querySelector(".chat-area");
  chatArea?.insertBefore(nowPlayingEl, chatArea.firstChild);
}

function playTrack(name) {
  // audio-select triggers both an audio-play and a room-status broadcast, and
  // room-status is what a mid-session joiner also uses to sync — so this can
  // legitimately be called twice for the same track. Without this guard the
  // second call resets currentTime to 0 and restarts playback immediately.
  if (trackSelected && currentTrack === name) return;
  currentTrack = name;
  trackSelected = true;
  // Stop any other track that was playing.
  for (const [fname, audio] of audioCache) {
    if (fname !== name) {
      audio.pause();
      audio.currentTime = 0;
    }
  }
  const audio = audioCache.get(name) ?? preloadTrackAndReturn(name);
  audio.currentTime = 0;
  const start = () =>
    audio.play().catch((err) => console.warn("audio play blocked:", err));
  if (trackReady.has(name)) {
    start();
  } else {
    audio.addEventListener("canplaythrough", start, { once: true });
  }
  if (trackSelectionEl) trackSelectionEl.style.display = "none";
  showNowPlaying(name);
}

function preloadTrackAndReturn(name) {
  preloadTrack(name);
  return audioCache.get(name);
}

window._socket.on("room-status", ({ playerCount, selectedTrack } = {}) => {
  if (selectedTrack) {
    // A track was already chosen (e.g. this client joined mid-session) — sync.
    playTrack(selectedTrack);
    return;
  }
  if (playerCount >= 2) {
    // Both players named — show the selection, hide the waiting hint.
    if (trackWaitingEl) trackWaitingEl.style.display = "none";
    if (trackListEl) trackListEl.style.display = "flex";
    if (trackSelectionEl) trackSelectionEl.style.display = "block";
  } else {
    // Waiting for the second player.
    if (trackSelectionEl) trackSelectionEl.style.display = "block";
    if (trackListEl) trackListEl.style.display = "none";
    if (trackWaitingEl) trackWaitingEl.style.display = "block";
  }
});

window._socket.on("audio-play", ({ track } = {}) => {
  if (track) playTrack(track);
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
