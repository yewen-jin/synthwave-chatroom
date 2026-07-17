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
import { TRACK_MARKERS_SEC } from "../../shared/gameParameters.js";

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
  // Built with textContent, not innerHTML: both the username and the text are
  // player-typed, and this text is now stored server-side and replayed on
  // every rejoin — an innerHTML template would turn a typed "<img onerror>"
  // into a stored script that re-runs each time the log is replayed. There is
  // no formatting toolbar to lose (its buttons have no handlers).
  const user = document.createElement("span");
  user.className = "user-id";
  user.textContent = `${messageObj.username}:`;
  const text = document.createElement("span");
  text.className = "text";
  text.textContent = messageObj.text;
  const time = document.createElement("span");
  time.className = "timestamp";
  time.textContent = new Date(messageObj.timestamp).toLocaleTimeString();
  msgDiv.append(
    user,
    document.createTextNode(" "),
    text,
    document.createTextNode(" "),
    time,
  );
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
  // Only once the server has actually accepted it: remembering a name that
  // was rejected would prefill a name that can't be used.
  rememberName(roomName, name);
});

// Room at capacity — turn the third scanner away explicitly. Rooms are minted
// per pair now, so there is no "other room" to send them to as there was when
// two were standing permanently: the way in is to scan the printed code and
// start their own.
window._socket.on("room-full", ({ capacity } = {}) => {
  username = null;
  hideUsernamePopup();
  showRoomError(
    `This room is full — it belongs to another pair (${capacity} players max). Scan the printed code to start your own.`,
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
//   room-status         server -> room/joiner: {playerCount, track, begun,
//                       playing, startedAt, pausedElapsed} — the single
//                       source of truth for the toggle button's state, for
//                       whether the chat is open (`begun`), and for seeking
//                       a late joiner / reconnecting client to the correct
//                       elapsed position instead of restarting from 0.
const audioCache = new Map(); // track filename -> HTMLAudioElement
const loadFailed = new Set(); // tracks whose fetch/decode errored — retryable
let appliedPlaybackKey = null; // last-applied "track|playing|startedAt" — see applyPlaybackState
let lastKnownPlaying = false; // so async listeners can refresh the button correctly
let lastKnownBegun = false; // ditto — has "begin conversation" been pressed?

const audioBarEl = document.getElementById("audio-bar");
const audioWaitingEl = document.getElementById("audio-waiting");
const toggleBtnEl = document.getElementById("audio-toggle-btn");
let nowPlayingEl = null;

// R7: "begin conversation" opens the chatroom and starts the music in one
// press. Until then the messages and the composer are hidden — the room is a
// held breath, not a chat you can get on with. The audio bar stays visible
// throughout; it carries the button that opens all this.
const chatBodyEl = document.getElementById("chatBody");
const inputSectionEl = document.querySelector(".input-section");
let notYetEl = null;

function setChatOpen(open, showNotYet = true) {
  if (chatBodyEl) chatBodyEl.style.display = open ? "" : "none";
  if (inputSectionEl) inputSectionEl.style.display = open ? "" : "none";

  // Say why the room looks empty, rather than leaving a blank panel that
  // reads as broken while they wait for the other player. Suppressed while
  // the pairing QR is up: "the conversation has not begun" underneath "ask
  // your pair to scan this" only muddies what to do next.
  if (!open && showNotYet && !notYetEl) {
    notYetEl = document.createElement("div");
    notYetEl.className = "chat-not-begun";
    notYetEl.textContent = "The conversation has not begun.";
    document.querySelector(".chat-area")?.appendChild(notYetEl);
  } else if ((open || !showNotYet) && notYetEl) {
    notYetEl.remove();
    notYetEl = null;
  }
}

// ----- remembering the display name, per room -----
//
// The browser already remembers WHICH room: the id lives in the URL fragment,
// so history and reopened tabs carry it for free. The one thing it can't carry
// is the name — that's module state and dies with the page — so a player who
// drops and comes back lands in the right room facing a blank sign-in.
//
// Keyed per room, not one name for the site: the same phone may be someone
// else in a different game, and a name recalled from another room would be a
// confusing prefill rather than a helpful one.
const NAME_KEY = (room) => `tvom:${room}:username`;

// Every access is guarded. Safari in private mode throws on setItem, and
// storage can be disabled outright — remembering a name is a convenience and
// must never be able to take the room down with it.
function rememberName(room, name) {
  try {
    localStorage.setItem(NAME_KEY(room), name);
  } catch {
    /* private mode / storage disabled — carry on without it */
  }
}

function recallName(room) {
  try {
    return localStorage.getItem(NAME_KEY(room));
  } catch {
    return null;
  }
}

function forgetName(room) {
  try {
    localStorage.removeItem(NAME_KEY(room));
  } catch {
    /* nothing to do */
  }
}

// Prefill only — deliberately not auto-submitting. A player who drops and
// returns within the socket timeout (~20s) races their own ghost: the server
// still holds their name, so an automatic sign-in would be rejected as "name
// taken" by nobody but themselves. Prefilled, it's one tap, and if the ghost
// is still there they can simply tap again a moment later.
function prefillName() {
  if (!roomName) return;
  const saved = recallName(roomName);
  if (!saved) return;
  const input = document.getElementById("username-input");
  if (input && !input.value) input.value = saved;
}

// ----- pairing: the QR player B scans -----
//
// The printed code names no room. Player A scans it, the server mints a room
// that has never existed, and A's screen becomes the way in for exactly one
// other person. So a pair can't land in a stale room, and a previous pair's
// forgotten tab holds an id nobody will ever be handed again. The third
// scanner is refused by ROOM_CAPACITY as before.
const pairInviteEl = document.getElementById("pair-invite");
const pairQrEl = document.getElementById("pair-qr");
const pairCodeEl = document.getElementById("pair-code");
const pairJoinOtherEl = document.getElementById("pair-join-other");

function showPairInvite(show) {
  if (!pairInviteEl) return;
  pairInviteEl.hidden = !show;
  if (!show || !roomName) return;
  // Absolute URL: this is scanned by a different phone, so it has to carry
  // the host, not a relative path. location.origin is whatever A reached us
  // on — the VPS domain in production, and correct in dev too.
  const joinUrl = `${window.location.origin}/room#${encodeURIComponent(roomName)}`;
  const src = `/qr.svg?d=${encodeURIComponent(joinUrl)}`;
  if (pairQrEl && pairQrEl.getAttribute("src") !== src) {
    pairQrEl.setAttribute("src", src);
  }
  if (pairCodeEl) pairCodeEl.textContent = roomName;
}

// Recovery for the pair who both scanned the poster and are now sitting in
// separate empty rooms waiting for each other.
if (pairJoinOtherEl) {
  pairJoinOtherEl.addEventListener("click", () => {
    showRoomEntryPopup();
  });
}

// ----- the other player -----
const otherPlayerEl = document.getElementById("other-player");

function showOtherPlayer(usernames) {
  if (!otherPlayerEl) return;
  // A pair has at most one "other". Compare against our own name rather than
  // taking [1], since join order differs per client.
  const other = (usernames ?? []).find((n) => n !== username);
  otherPlayerEl.textContent = other ? `with ${other}` : "";
  otherPlayerEl.hidden = !other;
}

// ----- track timeline -----
//
// How far into the track the pair is: a line, dots at TRACK_MARKERS_SEC, no
// numbers. Driven by the *room's* clock, not this device's audio.currentTime
// — the two players must see one identical timeline, and a device whose
// playback was autoplay-blocked would otherwise show a frozen bar while the
// game actually ran. The server sends {playing, startedAt, pausedElapsed} and
// we interpolate locally between broadcasts, so there is no per-second
// server tick for what is a cosmetic bar.
const timelineEl = document.getElementById("track-timeline");
const timelineFillEl = document.getElementById("timeline-fill");
const timelineDotsEl = document.getElementById("timeline-dots");
let lastStatus = null; // newest {playing, startedAt, pausedElapsed}
let dotsBuiltFor = null; // duration the dots were laid out against
let timelineTimer = null;

// The room's elapsed position, interpolated from the last broadcast.
function roomElapsedSec() {
  if (!lastStatus) return 0;
  const { playing, startedAt, pausedElapsed } = lastStatus;
  return playing && startedAt
    ? pausedElapsed + (Date.now() - startedAt) / 1000
    : pausedElapsed;
}

function trackDuration(track) {
  const d = track ? audioCache.get(track)?.duration : NaN;
  return Number.isFinite(d) && d > 0 ? d : null;
}

function buildDots(duration) {
  if (dotsBuiltFor === duration || !timelineDotsEl) return;
  dotsBuiltFor = duration;
  timelineDotsEl.innerHTML = "";
  // Only markers that actually fall inside this track — a shorter track gets
  // fewer dots rather than dots crowded against the end.
  TRACK_MARKERS_SEC.filter((m) => m < duration).forEach((m) => {
    const dot = document.createElement("span");
    dot.className = "timeline__dot";
    dot.style.left = `${(m / duration) * 100}%`;
    dot.dataset.at = String(m);
    timelineDotsEl.appendChild(dot);
  });
}

function renderTimeline(track) {
  const duration = trackDuration(track);
  // Nothing honest to draw without a duration (the device may not have loaded
  // metadata yet) or before they've begun.
  if (!timelineEl) return;
  if (!lastKnownBegun || !duration) {
    timelineEl.hidden = true;
    return;
  }
  timelineEl.hidden = false;
  buildDots(duration);

  const elapsed = Math.min(roomElapsedSec(), duration);
  if (timelineFillEl) {
    timelineFillEl.style.width = `${(elapsed / duration) * 100}%`;
  }
  // Dots light as they're passed, so a marker means something once reached
  // rather than being decoration.
  timelineDotsEl?.querySelectorAll(".timeline__dot").forEach((dot) => {
    dot.classList.toggle(
      "timeline__dot--passed",
      elapsed >= Number(dot.dataset.at),
    );
  });
}

// Tick only while actually playing — a paused or unstarted room needs no
// timer at all.
function syncTimeline(track) {
  renderTimeline(track);
  const shouldTick = lastKnownBegun && lastStatus?.playing;
  if (shouldTick && !timelineTimer) {
    // 500ms is imperceptible on a 15-minute bar (a ~350px line advances well
    // under a pixel per tick) and far cheaper than requestAnimationFrame.
    timelineTimer = setInterval(() => renderTimeline(track), 500);
  } else if (!shouldTick && timelineTimer) {
    clearInterval(timelineTimer);
    timelineTimer = null;
  }
}

function preloadTrack(name) {
  if (audioCache.has(name)) return;
  const audio = new Audio(`/audio/${encodeURIComponent(name)}`);
  audio.preload = "auto";
  audio.addEventListener("canplaythrough", () => {
    loadFailed.delete(name);
    if (toggleBtnEl && toggleBtnEl.dataset.track === name) {
      updateToggleButton(name, lastKnownPlaying, lastKnownBegun);
    }
  });
  // The timeline can't be drawn until the duration is known, and metadata
  // usually lands after the first room-status — so redraw when it arrives
  // rather than leaving the bar hidden until the next broadcast.
  audio.addEventListener("loadedmetadata", () => {
    if (toggleBtnEl?.dataset.track === name) syncTimeline(name);
  });
  // A track that 404s or dies mid-fetch must not leave the room silently
  // dead: surface it, and let the next press retry rather than stranding
  // the pair with a button that does nothing.
  audio.addEventListener("error", () => {
    loadFailed.add(name);
    if (toggleBtnEl && toggleBtnEl.dataset.track === name) {
      updateToggleButton(name, lastKnownPlaying, lastKnownBegun);
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
    // Inside the audio bar, next to the transport button — one row, not two.
    audioBarEl?.appendChild(nowPlayingEl);
  }
  nowPlayingEl.textContent = playing ? "♪ now playing" : "⏸ paused";
}

// The button is deliberately NOT gated on preload finishing. Mobile browsers
// (iOS Safari especially) routinely ignore preload="auto" and fetch nothing
// until a gesture, so canplaythrough may never fire before the first press —
// gating on it left the toggle disabled forever and killed the feature. A
// press starts loading; play() buffers on demand. Preload is an optimisation,
// never a precondition.
// One button, three labels. Before the pair has begun it reads "begin
// conversation" — Symone's wording — because that press does both jobs at
// once: it opens the chat and starts the music. Afterwards it is only a music
// control, so it becomes Pause/Resume; `begun` never goes back to false, so
// pausing the track can't shut the conversation.
function updateToggleButton(track, playing, begun) {
  lastKnownPlaying = playing;
  if (!toggleBtnEl) return;
  toggleBtnEl.dataset.track = track ?? "";
  toggleBtnEl.textContent = loadFailed.has(track)
    ? "⟳ Retry track"
    : !begun
      ? "begin conversation"
      : playing
        ? "⏸ Pause"
        : "▶ Resume";
  toggleBtnEl.disabled = !track;
  toggleBtnEl.classList.toggle(
    "track-btn--begin",
    !begun && !loadFailed.has(track),
  );
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
      updateToggleButton(track, playing, lastKnownBegun);
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
  begun,
  usernames,
}) {
  // The audio bar shows as soon as a player is in the room, but the toggle
  // itself only appears once both are named — a solo player shouldn't be
  // able to start the shared session's music before their partner arrives.
  // Runs unconditionally (not gated by the idempotency key below) since
  // playerCount can change independently of playback state.
  // "" rather than "block"/"inline-block": an inline display beats the
  // stylesheet, and hardcoding one here silently overrode .track-selection's
  // `display: flex` — which is what kept the status on its own row below the
  // button instead of beside it. Let the stylesheet own the layout; JS only
  // decides shown vs hidden.
  const bothPresent = playerCount >= 2;
  if (audioBarEl) audioBarEl.style.display = playerCount >= 1 ? "" : "none";
  if (audioWaitingEl) audioWaitingEl.style.display = bothPresent ? "none" : "";
  if (toggleBtnEl) toggleBtnEl.style.display = bothPresent ? "" : "none";

  // R7: the chat itself stays shut until someone presses "begin conversation".
  // Server-driven rather than local, so both players open together and a
  // reload mid-game rejoins an already-open chat instead of re-gating it.
  // Alone in the room => show the way in for the other player. The moment
  // they arrive it's no longer needed, and nobody else may use it anyway.
  const waitingForPair = playerCount < 2;
  lastKnownBegun = !!begun;
  setChatOpen(!!begun, !waitingForPair);
  showOtherPlayer(usernames);
  showPairInvite(waitingForPair);

  // Keep the newest clock for the timeline to interpolate against.
  lastStatus = { playing, startedAt, pausedElapsed };
  syncTimeline(track);

  updateToggleButton(track, playing, begun);
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
        // Not every rejection is an autoplay block, and treating them alike
        // put a "tap to enable sound" prompt in front of players who had
        // simply pressed Pause. Calling pause() while play() is still pending
        // rejects it with AbortError — that is us, not the browser refusing.
        // The lastKnownPlaying check catches the same race more generally:
        // by the time a stale promise settles the room may have moved on.
        if (err?.name === "AbortError" || !lastKnownPlaying) return;
        console.warn("audio play blocked:", err);
        showTapToEnable();
      });
  } else {
    audio.pause();
    hideTapToEnable();
  }
  // Nothing to report until they've begun — before that the bar said
  // "⏸ paused", which described a track nobody had started yet.
  showNowPlaying(begun ? track : null, playing);
}

function preloadTrackAndReturn(name) {
  preloadTrack(name);
  return audioCache.get(name);
}

// The conversation so far, replayed by the server on join/rejoin. Clear and
// rebuild from the snapshot rather than append: the "connect" handler re-emits
// "user joined" on every reconnection, so this fires again each time — a
// rebuild keeps that idempotent instead of doubling every message. The
// snapshot is the whole backlog, so nothing is lost by clearing first.
window._socket.on("chat-history", ({ messages } = {}) => {
  if (!Array.isArray(messages) || !chatBodyEl) return;
  chatBodyEl.innerHTML = "";
  messages.forEach(onChat);
});

window._socket.on("room-status", (payload = {}) => {
  applyPlaybackState(payload);
});

// Refresh button — server broadcasts room-reset to the room; both clients
// reload, disconnecting sockets and freeing names + room state for the next pair.
window._socket.on("room-reset", () => {
  // Reset means this session is finished, so the remembered name goes with it
  // — otherwise the next person handed this phone is prefilled as the last
  // player, in a room that is no longer theirs.
  forgetName(roomName);
  location.reload();
});

const refreshBtn = document.getElementById("refresh-btn");
if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    window._socket.emit("room-reset");
  });
}

// Re-join whenever the socket (re)connects. socket.io v4 has NO "reconnect"
// event on the Socket — it lives on the Manager (socket.io.on("reconnect")) —
// so the handler this replaces never fired even once. The room lives on the
// server's socket object, so a reconnected client that doesn't re-announce
// itself is connected but in no room at all: silently outside its own game,
// receiving nothing. That is exactly what a wifi blip or a server restart
// does, which is the case all of this is meant to survive.
//
// "connect" fires on the first connection and on every reconnection. The
// guard makes the first one a no-op — there is no username yet — so one
// handler covers both without a second code path.
window._socket.on("connect", () => {
  if (username && roomName) {
    window._socket.emit("user joined", { roomName, username });
  }
});

// Start shut, before the first room-status lands, so the chat can't flash
// open for a frame and then close again.
setChatOpen(false);

// The server minted us a room — take it and carry on into sign-in. It goes in
// the hash so a reload rejoins the same room rather than minting another.
window._socket.on("room created", ({ roomName: minted } = {}) => {
  if (!minted) return;
  roomName = minted;
  window.location.hash = encodeURIComponent(minted);
  prefillName(); // a brand-new room won't have one, but reloads of it will
  showUsernamePopup();
});

window._socket.on("room create failed", () => {
  // Nothing useful to auto-retry — the manual entry is the way out.
  showRoomError("Could not open a room. Ask your pair for their code.");
});

// A hash means we were sent here deliberately: by our partner's QR, by typing
// their code, or by reloading our own room. No hash means we came from the
// printed code, which names no room — so ask for a brand-new one rather than
// making someone invent a name that might collide with a live game.
if (roomName) {
  prefillName(); // returning to a room we've been in — save them retyping it
  showUsernamePopup();
} else {
  window._socket.emit("create room");
}
