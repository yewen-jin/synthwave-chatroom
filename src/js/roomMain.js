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

// ----- audio: single track (for now), gated behind a play/pause toggle -----
//
// For the actual event there's exactly one track, auto-selected by the
// server the moment the room is created — no picker UI needed. Symone may
// want a multi-track picker later (a separate button + popup, on top of
// this, per her request) — deliberately not built now. audio-tracks is kept
// as a plain list from the server (not hardcoded to one) so that future
// picker has something to read; this file just always preloads/plays
// whatever track the room's state says is current.
//
// Protocol (server is authoritative — see server.js's /rooms audio-* handlers):
//   audio-tracks        server -> client, on join: files available to preload.
//   audio-play-request  client -> server: either player presses the toggle
//                       while paused. Idempotent — a no-op if already playing.
//   audio-pause-request client -> server: either player presses the toggle
//                       while playing. Idempotent — a no-op if already paused.
//   room-status         server -> room/joiner: {playerCount, track, playing,
//                       startedAt, pausedElapsed} — the single source of
//                       truth for the toggle button's state and for seeking
//                       a late joiner / reconnecting client to the correct
//                       elapsed position instead of restarting from 0.
const audioCache = new Map(); // track filename -> HTMLAudioElement
const loadFailed = new Set(); // tracks whose fetch/decode errored — retryable
let appliedPlaybackKey = null; // last-applied "track|playing|startedAt" — see applyPlaybackState
let lastKnownPlaying = false; // so async listeners can refresh the button correctly

const audioBarEl = document.getElementById("audio-bar");
const audioWaitingEl = document.getElementById("audio-waiting");
const toggleBtnEl = document.getElementById("audio-toggle-btn");
let nowPlayingEl = null;

function preloadTrack(name) {
  if (audioCache.has(name)) return;
  const audio = new Audio(`/audio/${encodeURIComponent(name)}`);
  audio.preload = "auto";
  audio.addEventListener("canplaythrough", () => {
    loadFailed.delete(name);
    if (toggleBtnEl && toggleBtnEl.dataset.track === name) {
      updateToggleButton(name, lastKnownPlaying);
    }
  });
  // A track that 404s or dies mid-fetch must not leave the room silently
  // dead: surface it, and let the next press retry rather than stranding
  // the pair with a button that does nothing.
  audio.addEventListener("error", () => {
    loadFailed.add(name);
    if (toggleBtnEl && toggleBtnEl.dataset.track === name) {
      updateToggleButton(name, lastKnownPlaying);
    }
  });
  audioCache.set(name, audio);
}

window._socket.on("audio-tracks", ({ tracks: list } = {}) => {
  (Array.isArray(list) ? list : []).forEach(preloadTrack);
});

function showNowPlaying(name, playing) {
  if (!name) {
    nowPlayingEl?.remove();
    nowPlayingEl = null;
    return;
  }
  if (!nowPlayingEl) {
    nowPlayingEl = document.createElement("div");
    nowPlayingEl.className = "now-playing";
    document
      .querySelector(".chat-area")
      ?.insertBefore(
        nowPlayingEl,
        document.querySelector(".chat-area")?.firstChild,
      );
  }
  nowPlayingEl.textContent = playing ? "♪ now playing" : "⏸ paused";
}

// The button is deliberately NOT gated on preload finishing. Mobile browsers
// (iOS Safari especially) routinely ignore preload="auto" and fetch nothing
// until a gesture, so canplaythrough may never fire before the first press —
// gating on it left the toggle disabled forever and killed the feature. A
// press starts loading; play() buffers on demand. Preload is an optimisation,
// never a precondition.
function updateToggleButton(track, playing) {
  lastKnownPlaying = playing;
  if (!toggleBtnEl) return;
  toggleBtnEl.dataset.track = track ?? "";
  toggleBtnEl.textContent = loadFailed.has(track)
    ? "⟳ Retry track"
    : playing
      ? "⏸ Pause"
      : "▶ Start";
  toggleBtnEl.disabled = !track;
}

if (toggleBtnEl) {
  toggleBtnEl.addEventListener("click", () => {
    const track = toggleBtnEl.dataset.track;
    if (!track) return;
    const playing = lastKnownPlaying;

    // A previous load errored — rebuild the element so the browser refetches
    // rather than serving us the same dead one.
    if (loadFailed.has(track)) {
      audioCache.delete(track);
      loadFailed.delete(track);
      preloadTrack(track);
      updateToggleButton(track, playing);
    }

    // Start playback synchronously, inside the gesture. iOS only grants an
    // element permission to play if play() is called from a user gesture; our
    // real play() runs later, in the room-status callback, which would be
    // rejected. Playing here earns that permission for this device — the
    // subsequent room-status seek then just corrects the position.
    if (!playing) unlockAndPlay(track);

    window._socket.emit(playing ? "audio-pause-request" : "audio-play-request");
  });
}

// Best-effort autoplay unlock for the device that pressed the button.
function unlockAndPlay(track) {
  const audio = audioCache.get(track) ?? preloadTrackAndReturn(track);
  audio.play().catch((err) => console.warn("audio unlock play blocked:", err));
}

// The player who did NOT press Start never made a gesture on their own audio
// element, so their room-status-driven play() can be rejected on iOS. Rather
// than leave them in silence, surface a tap target; tapping replays the
// current state, which re-seeks to the room's elapsed position — so they
// rejoin the music in sync rather than restarting it.
let tapToEnableEl = null;
function showTapToEnable() {
  if (tapToEnableEl) return;
  tapToEnableEl = document.createElement("button");
  tapToEnableEl.className = "track-btn";
  tapToEnableEl.type = "button";
  tapToEnableEl.textContent = "🔇 Tap to enable sound";
  tapToEnableEl.addEventListener("click", () => {
    const track = toggleBtnEl?.dataset.track;
    if (!track) return;
    // play() MUST be called synchronously here, in the gesture itself. iOS
    // consumes the gesture token immediately and it does not survive a socket
    // round-trip — emitting first and playing in the room-status callback
    // would be rejected exactly as the original attempt was, re-showing this
    // prompt in a loop. Playing here earns the element its permission; the
    // status round-trip below then only corrects the position.
    const audio = audioCache.get(track) ?? preloadTrackAndReturn(track);
    audio.play().catch((err) => console.warn("tap-to-enable blocked:", err));

    appliedPlaybackKey = null; // force a re-apply at the current elapsed time
    window._socket.emit("audio-status-request");
    hideTapToEnable();
  });
  audioBarEl?.appendChild(tapToEnableEl);
  // The room is playing, but this device isn't — don't claim otherwise while
  // the prompt is up. Runs after applyPlaybackState's showNowPlaying (the
  // play() rejection that gets us here is async), so this wins.
  if (nowPlayingEl)
    nowPlayingEl.textContent = "🔇 sound blocked on this device";
}
function hideTapToEnable() {
  tapToEnableEl?.remove();
  tapToEnableEl = null;
}

// Applies the room's current playback state. Idempotent per playback
// "segment": track+playing+startedAt together identify a specific play (or
// pause) segment, so a room-status broadcast that doesn't actually change
// anything (e.g. re-sent on someone else's join) is a no-op here rather than
// re-seeking or restarting an already-correct local player.
function applyPlaybackState({
  track,
  playing,
  startedAt,
  pausedElapsed,
  playerCount,
}) {
  // The audio bar shows as soon as a player is in the room, but the toggle
  // itself only appears once both are named — a solo player shouldn't be
  // able to start the shared session's music before their partner arrives.
  // Runs unconditionally (not gated by the idempotency key below) since
  // playerCount can change independently of playback state.
  const bothPresent = playerCount >= 2;
  if (audioBarEl)
    audioBarEl.style.display = playerCount >= 1 ? "block" : "none";
  if (audioWaitingEl)
    audioWaitingEl.style.display = bothPresent ? "none" : "block";
  if (toggleBtnEl)
    toggleBtnEl.style.display = bothPresent ? "inline-block" : "none";

  updateToggleButton(track, playing);
  if (!track) {
    showNowPlaying(null);
    return;
  }

  const key = `${track}|${playing}|${startedAt}`;
  if (key === appliedPlaybackKey) return;
  appliedPlaybackKey = key;

  const audio = audioCache.get(track) ?? preloadTrackAndReturn(track);
  const elapsed =
    playing && startedAt
      ? pausedElapsed + (Date.now() - startedAt) / 1000
      : pausedElapsed;

  // Seeking needs metadata (duration); playing does not. Waiting for
  // canplaythrough before either would strand any device that defers
  // preloading — so seek as soon as metadata allows, and play immediately.
  const seek = () => {
    try {
      audio.currentTime = Math.min(
        Math.max(elapsed, 0),
        audio.duration || elapsed,
      );
    } catch (err) {
      console.warn("audio seek failed:", err);
    }
  };
  if (audio.readyState >= 1) seek();
  else audio.addEventListener("loadedmetadata", seek, { once: true });

  if (playing) {
    audio
      .play()
      .then(hideTapToEnable)
      .catch((err) => {
        // Almost always the autoplay policy on the non-pressing device.
        console.warn("audio play blocked:", err);
        showTapToEnable();
      });
  } else {
    audio.pause();
    hideTapToEnable();
  }
  showNowPlaying(track, playing);
}

function preloadTrackAndReturn(name) {
  preloadTrack(name);
  return audioCache.get(name);
}

window._socket.on("room-status", (payload = {}) => {
  applyPlaybackState(payload);
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
