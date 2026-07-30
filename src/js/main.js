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
  updateLastJoinedPlayer,
} from "./chatUI.js"; //the chatroom core interaction
import { initChatDrag } from "./chatDrag.js"; //dragging functionality, optional
import { initVisuals } from "./visuals.js"; // background animation, can be replaced
import { initDialogueController } from "./dialogueController.js";
import { isRoom2, isNarratorRoom, isPlayerRoom } from "./roomDetection.js";

// In room1, always show popup. In room2, use localStorage.
//>>this mechanism needs to be fixed. Html popup already submitted a username of the narrator
// let username = isRoom2 ? localStorage.getItem("username") : null;
let username = null;
let isPlayer = isPlayerRoom;
console.log("is a player?", isPlayer);
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
    // Third-party speaker messages get an extra class for special styling
    const speakerClass = messageObj.speaker ? " speaker-message" : "";
    msgDiv.className = `message system-message-inline${speakerClass}`;
    if (messageObj.speaker) {
      msgDiv.dataset.speaker = messageObj.speaker;
      // Speaker name and text come from server-controlled dialogue JSON, not
      // user input — and innerHTML is REQUIRED here: the Twine-authored
      // script uses real markup (<strong>…</strong>) that must render as
      // formatting. Do not "fix" this to textContent; that would show the
      // raw tags to the audience.
      msgDiv.innerHTML = `<span class="speaker-name">${messageObj.speaker}:</span> <span class="text">${messageObj.text}</span>`;
    } else {
      msgDiv.innerHTML = `<span class="text">${messageObj.text}</span>`;
    }
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
  // Built with textContent, not innerHTML: both the username and the text are
  // typed by audience members, so an innerHTML template would run a crafted
  // "<img onerror>" as script on every other phone watching the show.
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
  if (visuals) visuals.flash();
}

// Built node-by-node with textContent: the display name is audience-typed,
// and interpolating it into innerHTML would run a crafted name as script on
// every other phone in the room.
function buildSystemMessage(name, action) {
  const el = document.createElement("div");
  el.className = "system-message";
  const i = document.createElement("i");
  const strong = document.createElement("strong");
  strong.textContent = name;
  i.append(strong, document.createTextNode(` ${action}`));
  el.append(i);
  return el;
}

function onUserJoined(data) {
  const { username: name, isPlayer: joinedAsPlayer } = data;
  addMessageToChat(buildSystemMessage(name, "entered the chat"));
  updateLastJoinedUser(name);
  if (joinedAsPlayer) {
    updateLastJoinedPlayer(name);
  }
}

function onUserLeft(name) {
  addMessageToChat(buildSystemMessage(name, "left the chat"));
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
    if ((isNarratorRoom || isPlayerRoom) && !dialogueControllerInitialized) {
      dialogueControllerInitialized = true;
      initDialogueController(window._socket, username);
    }

    // Emit user joined AFTER dialogue controller is set up
    window._socket.emit("user joined", { username, isPlayer });
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
  onGlitchControl,
);

window._socket.on("reconnect", () => {
  // Re-join with the same format as initial join
  if (username) {
    window._socket.emit("user joined", { username, isPlayer });
  }
});

// Show username popup (username is always null at startup)
showUsernamePopup();
