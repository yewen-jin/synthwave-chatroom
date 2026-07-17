import express from "express";
import { Server } from "socket.io";
import { createServer } from "http";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import {
  readdirSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "fs";
import { randomBytes } from "crypto";
import QRCode from "qrcode";
import * as GameParameters from "./shared/gameParameters.js";

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Express app
const app = express();
const server = createServer(app);
// create the socket
const io = new Server(server, {
  cors: {
    // CORS only governs CROSS-origin socket connections; same-origin (the
    // normal case here — the server serves both the page and the socket on one
    // origin) is never checked, so this allowlist is effectively a no-op for a
    // standard deploy. It only bites if a browser loads the page from a
    // different origin than the socket server (e.g. some dev/proxy setups).
    // Production: the VPS deploy domain. A CORS origin is scheme+host(+port)
    // only, never a path — the old onrender "/control" entry could never match.
    // Dev: reflect the request origin (origin: true) so cross-origin dev access
    // from a LAN/Tailscale/forwarded host works without curating a list.
    origin:
      process.env.NODE_ENV === "production"
        ? ["https://chat.datadadaist.space"]
        : true,
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  },
});

//--------------- the middleware chain-----------------------//

// Serve the production build from dist directory
app.use(express.static(join(__dirname, "dist")));
// Serve static assets (fonts, images) from built assets folder
app.use("/assets", express.static(join(__dirname, "dist/assets")));

// Card-game audio — served from audio-assets/ (outside dist, gitignored, so
// Symone's re-exports never enter git and Vite's emptyOutDir never wipes them).
app.use("/audio", express.static(join(__dirname, "audio-assets")));

// Renders a QR as SVG, server-side. Player A's page shows one of these for
// player B to scan, which is how a pair ends up in the same room. Done here
// rather than in the browser so the frontend stays plain HTML/JS with no
// bundled encoder — see AGENTS.md on dependencies.
app.get("/qr.svg", async (req, res) => {
  const data = String(req.query.d ?? "");
  // Bound the input: this endpoint is public, and QR encoding cost climbs
  // with length. A room URL is ~60 chars.
  if (!data || data.length > 512) {
    return res.status(400).type("text/plain").send("bad or missing ?d=");
  }
  try {
    const svg = await QRCode.toString(data, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
    });
    // Immutable for a given ?d= — the room id never changes meaning.
    res
      .type("image/svg+xml")
      .set("Cache-Control", "public, max-age=3600")
      .send(svg);
  } catch (err) {
    console.error("[qr] render failed:", err);
    res.status(500).type("text/plain").send("qr render failed");
  }
});

// Track list is DATA, not code: read whatever audio files are present in
// audio-assets/ *each time a room needs to know*, not once at boot. Reading
// once at boot means `npm run make:audio` (or Symone's rsync) after the
// server has already started leaves every room stuck with an empty list
// until a restart — a real trap, since deploy is deliberately "rsync audio
// separately from git pull, no restart needed" (see the plan doc). For now
// there's exactly one track for the actual event; this stays list-shaped
// (not hardcoded to one) so a future multi-track picker doesn't need a
// server rewrite — see the room-state comment below.
const AUDIO_DIR = join(__dirname, "audio-assets");
const AUDIO_EXTS = [".mp3", ".wav", ".ogg", ".m4a"];
function readAudioTracks() {
  if (!existsSync(AUDIO_DIR)) return [];
  return readdirSync(AUDIO_DIR)
    .filter((f) =>
      AUDIO_EXTS.includes(f.slice(f.lastIndexOf(".")).toLowerCase()),
    )
    .sort();
}
{
  const bootTracks = readAudioTracks();
  console.log(
    bootTracks.length
      ? `[/rooms] found ${bootTracks.length} audio track(s) at boot: ${bootTracks.join(", ")}`
      : "[/rooms] WARNING: no audio tracks found in audio-assets/ — run `npm run make:audio`",
  );
}

// send() treats any dot-segment in the path as a dotfile and 404s it by
// default — worktree checkouts live under .claude/, so allow explicitly.
const SENDFILE_OPTS = { dotfiles: "allow" };

// Serve built HTML for control, room1, room2, player-room, narrator-room
app.get("/control", (req, res) => {
  res.sendFile(join(__dirname, "dist/control.html"), SENDFILE_OPTS);
});
app.get("/room1", (req, res) => {
  res.sendFile(join(__dirname, "dist/room1.html"), SENDFILE_OPTS);
});
app.get("/room2", (req, res) => {
  res.sendFile(join(__dirname, "dist/room2.html"), SENDFILE_OPTS);
});
app.get("/player-room", (req, res) => {
  res.sendFile(join(__dirname, "dist/player-room.html"), SENDFILE_OPTS);
});
app.get("/narrator-room", (req, res) => {
  res.sendFile(join(__dirname, "dist/narrator-room.html"), SENDFILE_OPTS);
});
app.get("/chatroom", (req, res) => {
  res.sendFile(join(__dirname, "dist/chatroom.html"), SENDFILE_OPTS);
});
app.get("/room", (req, res) => {
  res.sendFile(join(__dirname, "dist/room.html"), SENDFILE_OPTS);
});

// Handle 404s:  send all invalid endpoint to index page
app.use((req, res) => {
  res.status(404).sendFile(join(__dirname, "dist/index.html"), SENDFILE_OPTS);
});

//---------------------------------------//
const activeUsers = new Map();
const takenUsernames = new Set();
let connectedUsers = 0;
const dialogueStates = new Map(); // Track dialogue states per room

function isNarratorOnline() {
  return Array.from(activeUsers.values()).includes(
    GameParameters.NARRATOR_USERNAME,
  );
}

// Helper: Broadcast narrator status to all clients
function broadcastNarratorStatus() {
  io.emit("narrator-status", { online: isNarratorOnline() });
}

// Helper: Load dialogue JSON
async function loadDialogueData(dialogueId) {
  const filePath = join(
    __dirname,
    "public",
    "data",
    "dialogues",
    `${dialogueId}.json`,
  );
  try {
    const data = await readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to load dialogue ${dialogueId}:`, error);
    return null;
  }
}

// Helper: Validate dialogue data structure
function validateDialogueData(data) {
  if (!data.metadata || !data.metadata.startNode) {
    throw new Error("Missing startNode in metadata");
  }

  if (!data.nodes[data.metadata.startNode]) {
    throw new Error("startNode does not exist in nodes");
  }

  for (let [nodeId, node] of Object.entries(data.nodes)) {
    for (let choice of node.choices || []) {
      if (!data.nodes[choice.nextNode]) {
        throw new Error(
          `Invalid nextNode "${choice.nextNode}" in node "${nodeId}"`,
        );
      }
    }
  }

  return true;
}

// Helper: Initialize dialogue for a room
async function startDialogue(room, dialogueId) {
  const dialogueData = await loadDialogueData(dialogueId);
  if (!dialogueData) return null;

  try {
    validateDialogueData(dialogueData);
    console.log("dialogue Data valid!");
  } catch (error) {
    console.error("Dialogue validation failed:", error);
    return null;
  }

  const state = {
    active: true,
    dialogueId,
    currentNode: dialogueData.metadata.startNode,
    variables: { ...dialogueData.variables },
    dialogueData,
    pendingTimers: [],
    dialogueDataSynced: false,
  };

  dialogueStates.set(room, state);
  return state;
}

// Helper: Build sync payload for clients
// includeDialogueData: only true for first sync of a game or late-joining clients
function buildSyncPayload(state, includeDialogueData = false) {
  const payload = {
    active: state.active,
    currentNode: state.currentNode,
    variables: state.variables,
    dialogueId: state.dialogueId,
    nodeData: state.dialogueData.nodes[state.currentNode],
  };
  if (includeDialogueData) {
    payload.dialogueData = state.dialogueData;
  }
  return payload;
}

// Helper: Apply effects to variables
function applyEffects(effects, variables) {
  if (!effects) return variables;

  const newVars = { ...variables };
  for (let [key, value] of Object.entries(effects)) {
    if (typeof value === "string" && value.startsWith("+")) {
      newVars[key] = (newVars[key] || 0) + parseFloat(value.substring(1));
    } else if (typeof value === "string" && value.startsWith("-")) {
      newVars[key] = (newVars[key] || 0) - parseFloat(value.substring(1));
    } else {
      newVars[key] = value;
    }
  }
  return newVars;
}

// Helper: Compute derived variables (e.g. ordinal from clicks)
const ordinalWords = ["first", "second", "third"];
function computeDerivedVariables(variables) {
  const derived = { ...variables };
  const clicks = derived.clicks || 0;
  derived.ordinal = ordinalWords[clicks - 1] || `${clicks}th`;
  return derived;
}

// Helper: Interpolate variables in text
function interpolateText(text, variables) {
  if (!text || typeof text !== "string") return text;
  const vars = computeDerivedVariables(variables);
  return text.replace(/\${(\w+)}/g, (match, variable) => {
    return vars.hasOwnProperty(variable) ? vars[variable] : match;
  });
}

// Helper: Clear all pending timers for a dialogue state
function clearPendingTimers(state) {
  if (state.pendingTimers) {
    state.pendingTimers.forEach((id) => clearTimeout(id));
    state.pendingTimers = [];
  }
}

// Helper: Calculate delay for a message based on DELAY_MODE
function calculateMessageDelay(message) {
  if (GameParameters.DELAY_MODE === "test") return 0;
  if (GameParameters.DELAY_MODE === "fallback")
    return GameParameters.MESSAGE_DELAY_MS;

  // Dynamic mode — narrator and speaker messages scale with text length
  const isDynamic =
    message &&
    message.content &&
    (message.type === "narrator" ||
      (message.type === "system" && message.speaker));
  if (isDynamic) {
    const charCount = message.content.length;
    const delay =
      GameParameters.NARRATOR_DELAY_BASE_MS +
      charCount * GameParameters.NARRATOR_DELAY_PER_CHAR_MS;
    return Math.max(
      GameParameters.NARRATOR_DELAY_MIN_MS,
      Math.min(delay, GameParameters.NARRATOR_DELAY_MAX_MS),
    );
  }

  // Plain system, image, pause messages use fixed delay
  return GameParameters.SYSTEM_MESSAGE_DELAY_MS;
}

// Helper: Evaluate condition
function evaluateCondition(condition, variables) {
  const val = variables[condition.variable] ?? 0;
  const target = condition.value;
  switch (condition.operator) {
    case "==":
      return val == target;
    case "===":
      return val === target;
    case ">":
      return val > target;
    case ">=":
      return val >= target;
    case "<":
      return val < target;
    case "<=":
      return val <= target;
    case "!=":
      return val != target;
    default:
      return false;
  }
}

// Handle Socket.IO connections
io.on("connection", (socket) => {
  console.log("A client connected:", socket.id);

  // Increment user count on connection
  connectedUsers++;
  io.emit("user-count", connectedUsers);

  // Check if username is taken
  socket.on("check username", (username) => {
    const isTaken = takenUsernames.has(username);
    socket.emit("username response", isTaken);
  });

  // Handle user joining
  socket.on("user joined", (data) => {
    const { username, isPlayer } = data;
    if (takenUsernames.has(username)) {
      socket.emit("username taken");
      return;
    }

    socket.username = username;
    takenUsernames.add(username);
    activeUsers.set(socket.id, username);
    console.log(`User joined: ${username}`);
    console.log("Active users:", Array.from(activeUsers.values()));

    // Check if dialogue is active
    const playerRoomState = dialogueStates.get("player-room");
    const isDialogueActive = playerRoomState && playerRoomState.active;
    const isNarrator = username === GameParameters.NARRATOR_USERNAME;

    // Suppress all join messages during active dialogue
    if (!isDialogueActive) {
      io.emit("user joined", { username, isPlayer });
    } else {
      console.log(
        `Suppressing join message for ${username} during active dialogue`,
      );
    }

    // Broadcast narrator status to all clients
    broadcastNarratorStatus();

    // If there's an active dialogue in player-room, sync the new player
    if (isDialogueActive) {
      console.log(`Syncing active dialogue to newly joined user: ${username}`);
      socket.emit("dialogue-sync", buildSyncPayload(playerRoomState, true));
    }
  });

  // Send current narrator status to newly connected clients
  socket.on("request-narrator-status", () => {
    socket.emit("narrator-status", { online: isNarratorOnline() });
  });

  // Send current game status to narrator room on request
  socket.on("request-game-status", () => {
    const playerRoomState = dialogueStates.get("player-room");
    const isActive = playerRoomState && playerRoomState.active;
    socket.emit("game-status", {
      active: isActive,
      currentNode: isActive ? playerRoomState.currentNode : null,
    });
  });

  // Listen for chat messages from clients
  socket.on("chat", (messageObj) => {
    // Verify message structure and active user
    if (
      messageObj &&
      messageObj.username &&
      messageObj.text &&
      messageObj.timestamp &&
      activeUsers.get(socket.id) === messageObj.username
    ) {
      console.log(`Message from ${messageObj.username}: ${messageObj.text}`);
      io.emit("chat", messageObj);
    }
  });

  // Add this with your other socket handlers
  socket.on("glitch-control", (data) => {
    // Broadcast the control change to all clients except sender
    socket.broadcast.emit("glitch-control", data);
  });

  // Handle theme control
  socket.on("control-theme", (theme) => {
    // Broadcast theme change to all clients except sender
    socket.broadcast.emit("theme-change", theme);
    console.log(`Theme changed to: ${theme || "default"}`);
  });

  // Handle dialogue start (from narrator in narrator-room)
  socket.on("dialogue-start", async (data) => {
    const targetRoom = data.targetRoom || "player-room";

    // Guard against starting a second dialogue while one is active
    const existingState = dialogueStates.get(targetRoom);
    if (existingState && existingState.active) {
      console.log(`Dialogue already active in ${targetRoom}, ignoring start`);
      return;
    }

    console.log(`Starting dialogue ${data.dialogueId} in ${targetRoom}`);

    // Notify player that dialogue is starting (for typing indicator)
    io.emit("dialogue-started");

    const state = await startDialogue(targetRoom, data.dialogueId);

    if (state) {
      // Process the starting node (this handles auto-advancing nodes)
      processNode(targetRoom);
    } else {
      socket.emit("dialogue-error", { message: "Failed to load dialogue" });
    }
  });

  // Helper: Handle new messageSequence format
  function handleMessageSequence(room, node, playerUsername) {
    const state = dialogueStates.get(room);
    if (!state) return;
    const sequence = node.messageSequence;

    // Cumulative delay: starts with initial gap after player choice
    let cumulativeDelay = playerUsername
      ? calculateMessageDelay(sequence[0])
      : 0;

    sequence.forEach((message, index) => {
      const timerId = setTimeout(() => {
        // Check if state is still active (may have been cleared by restart/end)
        if (!state.active) return;

        const content = interpolateText(message.content, state.variables);

        switch (message.type) {
          case "system":
            io.emit("chat", {
              text: content,
              username: "SYSTEM",
              timestamp: Date.now(),
              isSystem: true,
              speaker: message.speaker || null,
            });
            break;

          case "narrator":
            io.emit("chat", {
              text: content,
              username: GameParameters.NARRATOR_USERNAME,
              timestamp: Date.now(),
            });
            break;

          case "image":
            io.emit("chat", {
              imageUrl: message.url,
              imageAlt: message.alt || "",
              username: "SYSTEM",
              timestamp: Date.now(),
              isImage: true,
            });
            break;

          case "pause":
            // Pause type - no action, just affects timing
            break;

          default:
            console.warn(`Unknown message type: ${message.type}`);
        }

        // After last message in sequence
        if (index === sequence.length - 1) {
          const hasChoices = node.choices && node.choices.length > 0;

          if (!hasChoices) {
            const advanceDelay = calculateMessageDelay(message);
            const advanceTimerId = setTimeout(() => {
              if (!state.active) return;
              if (node.type === "ending") {
                handleDialogueEnd(room, state);
              } else if (node.nextNode) {
                console.log(`Auto-advancing to next node: ${node.nextNode}`);
                state.currentNode = node.nextNode;
                processNode(room);
              } else {
                console.log(
                  "Warning: No nextNode specified for auto-advancing node",
                );
              }
            }, advanceDelay);
            state.pendingTimers.push(advanceTimerId);
          } else {
            // Show choices to player
            const includeData = !state.dialogueDataSynced;
            io.emit("dialogue-sync", buildSyncPayload(state, includeData));
            if (includeData) state.dialogueDataSynced = true;
          }
        }
      }, cumulativeDelay);
      state.pendingTimers.push(timerId);

      // Add delay for the next message based on the current message
      const nextMessage = sequence[index + 1];
      if (nextMessage) {
        cumulativeDelay += calculateMessageDelay(nextMessage);
      }
    });
  }

  // Helper: Process a node and auto-advance if needed
  function processNode(
    room,
    playerUsername = null,
    choiceText = null,
    depth = 0,
  ) {
    const state = dialogueStates.get(room);
    if (!state || !state.active) return;

    if (depth > 50) {
      console.error(
        `processNode exceeded max depth (50) at node: ${state.currentNode} — possible circular condition`,
      );
      return;
    }

    // Reset variables when returning to the start node
    if (state.currentNode === state.dialogueData.metadata.startNode) {
      console.log("Returned to start node — resetting variables to defaults");
      state.variables = { ...state.dialogueData.variables };
    }

    const currentNode = state.dialogueData.nodes[state.currentNode];
    console.log(
      `Processing node: ${state.currentNode}, type: ${currentNode.type}`,
    );

    // Check for node-level conditions/redirects
    if (currentNode.conditions) {
      for (const condition of currentNode.conditions) {
        if (evaluateCondition(condition, state.variables)) {
          state.currentNode = condition.nextNode;
          processNode(room, null, null, depth + 1);
          return;
        }
      }
    }

    // If player made a choice, notify narrator room and broadcast to chat
    if (playerUsername) {
      io.emit("player-choice-made", {
        currentNode: state.currentNode,
        isEnding: currentNode.type === "ending",
      });

      if (choiceText) {
        io.emit("chat", {
          text: choiceText,
          username: playerUsername,
          timestamp: Date.now(),
        });
      }
    }

    // Process messageSequence format
    if (currentNode.messageSequence && currentNode.messageSequence.length > 0) {
      handleMessageSequence(room, currentNode, playerUsername);
      return;
    }

    // Node has no messageSequence — handle as bare choice/ending/advance node
    const hasChoices = currentNode.choices && currentNode.choices.length > 0;
    if (hasChoices) {
      const includeData = !state.dialogueDataSynced;
      io.emit("dialogue-sync", buildSyncPayload(state, includeData));
      if (includeData) state.dialogueDataSynced = true;
    } else if (currentNode.type === "ending") {
      handleDialogueEnd(room, state);
    } else if (currentNode.nextNode) {
      state.currentNode = currentNode.nextNode;
      processNode(room, null, null, depth + 1);
    } else {
      console.warn(
        `Node ${state.currentNode} has no messageSequence, choices, or nextNode`,
      );
    }
  }

  // Helper: Handle dialogue end
  function handleDialogueEnd(room, state) {
    state.active = false;
    // Reset all variables to default values
    state.variables = { ...state.dialogueData.variables };
    io.emit("dialogue-end", {
      reason: "completed",
    });

    // Check if narrator left during dialogue and is still offline
    if (state.narratorLeftDuringDialogue) {
      if (!isNarratorOnline()) {
        console.log(
          `Showing deferred narrator leave message after dialogue end`,
        );
        io.emit("user left", GameParameters.NARRATOR_USERNAME);
      }
      state.narratorLeftDuringDialogue = false;
    }

    // Clean up state after timeout
    setTimeout(() => {
      if (!dialogueStates.get(room)?.active) {
        dialogueStates.delete(room);
        console.log(`Cleaned up dialogue state for room: ${room}`);
      }
    }, GameParameters.STATE_CLEANUP_MS);
  }

  // Handle player choice (from player-room)
  socket.on("player-choice", (data) => {
    const room = "player-room";
    const state = dialogueStates.get(room);

    if (!state || !state.active) {
      console.log("No active dialogue for player choice");
      return;
    }

    // Validate choice exists in current node
    const currentNode = state.dialogueData.nodes[state.currentNode];
    const choice = currentNode.choices.find((c) => c.id === data.choiceId);

    if (!choice) {
      console.log("Invalid choice");
      return;
    }

    // Apply effects to variables
    if (choice.effects) {
      state.variables = applyEffects(choice.effects, state.variables);
    }

    // Navigate to next node
    state.currentNode = choice.nextNode;

    // Process the new node (this handles all node types)
    processNode(room, data.username, data.choiceText);
  });

  // Handle dialogue restart (from narrator room)
  socket.on("dialogue-restart", () => {
    const room = "player-room";
    const state = dialogueStates.get(room);
    if (!state || !state.active) return;

    console.log("Dialogue restart requested");
    clearPendingTimers(state);
    state.currentNode = state.dialogueData.metadata.startNode;
    state.variables = { ...state.dialogueData.variables };
    state.dialogueDataSynced = false;

    io.emit("dialogue-restart");
    processNode(room);
  });

  // Handle manual dialogue end (from narrator room)
  socket.on("dialogue-end-manual", () => {
    const room = "player-room";
    const state = dialogueStates.get(room);
    if (!state || !state.active) return;

    console.log("Manual dialogue end requested");
    clearPendingTimers(state);
    handleDialogueEnd(room, state);
  });

  // Handle client disconnection
  socket.on("disconnect", () => {
    connectedUsers--;
    io.emit("user-count", connectedUsers);

    const username = activeUsers.get(socket.id);
    if (username) {
      console.log(`User left: ${username}`);
      takenUsernames.delete(username);
      activeUsers.delete(socket.id);
      console.log("Remaining users:", Array.from(activeUsers.values()));

      // Check if dialogue is active
      const playerRoomState = dialogueStates.get("player-room");
      const isDialogueActive = playerRoomState && playerRoomState.active;
      const isNarrator = username === GameParameters.NARRATOR_USERNAME;

      // Suppress all leave messages during active dialogue
      if (!isDialogueActive) {
        io.emit("user left", username);
      } else {
        console.log(
          `Suppressing leave message for ${username} during active dialogue`,
        );
        // Store that narrator left during dialogue so we can notify after it ends
        if (playerRoomState && isNarrator) {
          playerRoomState.narratorLeftDuringDialogue = true;
        }
      }

      // Broadcast narrator status to all clients
      broadcastNarratorStatus();
    }
  });
});

//---------------------------------------//
// Room-based card game namespace (/rooms)
//
// Fully isolated from the default namespace: the legacy TBIO clients and the
// generic chatroom stay on `io` with its global `io.emit` broadcasts. The card
// game lives here, where clients join real socket.io rooms and can only hear
// their own room. NONE of the existing io.emit/handlers above are touched.
//---------------------------------------//
const roomsNsp = io.of("/rooms");

// Per-room state. Own map, own username sets — never the global takenUsernames,
// or the cross-contamination comes straight back.
//
// Audio: for the actual event there is exactly one track. Deliberately NOT
// stored on room creation — currentTrack() below reads audio-assets/ fresh
// every time it's asked, same as readAudioTracks(). Storing "the room's
// track" once, at creation, was a real bug: a room created before the file
// existed (or during any transient audio-assets/ state) would carry a
// permanently-null track for its whole lifetime, silently no-oping every
// play request with no client-visible explanation. Recomputing removes that
// class of bug entirely. Stays list-shaped rather than hardcoded to "the one
// track" so a future multi-track picker (a separate button + popup, per
// Symone — not built yet) can slot in later without a server rewrite.
//
// playing/startedAt/pausedElapsed model a pause-able, resumable playback
// clock: pausedElapsed accumulates seconds already played; startedAt marks
// when the current playing segment began (null while paused). Elapsed time
// at any moment = playing ? pausedElapsed + (now - startedAt) : pausedElapsed.
// This is what lets a late joiner or a reconnecting client seek to the
// correct position — playing or paused — instead of restarting from 0.
const roomStates = new Map(); // roomName -> { usernames, playing, startedAt, pausedElapsed }

function getRoomState(roomName) {
  if (!roomStates.has(roomName)) {
    roomStates.set(roomName, {
      usernames: new Set(),
      // Has either player pressed "begin conversation" yet? Latches true on
      // the first play and stays true — pausing the music must not shut the
      // chat again, and a reconnecting player has to be able to tell "not
      // started" from "started but currently paused". Cleared only on reset.
      begun: false,
      playing: false,
      startedAt: null,
      pausedElapsed: 0,
      // The conversation so far, replayed to anyone who joins or rejoins so a
      // player who dropped picks up everything said while they were away —
      // nothing lost. In memory only: it lives exactly as long as the server
      // process, the same lifetime the chat relay has always had. It is
      // deliberately NOT written to disk with the session clock — a piece
      // about intimacy shouldn't leave transcripts on the VPS unless that's a
      // decision made on purpose.
      messages: [],
      updatedAt: Date.now(), // for pruning abandoned rooms — see SESSION_TTL_MS
    });
  }
  return roomStates.get(roomName);
}

// Mark a room as touched and schedule a write. Call after any change worth
// surviving a restart.
function touchRoom(state) {
  state.updatedAt = Date.now();
  persistSessions();
}

function currentTrack() {
  return readAudioTracks()[0] ?? null;
}

// ---------------------------------------------------------------------------
// Session persistence
//
// Rooms are minted per pair and their ids are never reused, so a room that
// empties can't be inherited by anyone — which is what lets us keep it. Both
// players can close everything, reopen their #hash, and find their game where
// they left it, even across a server restart or deploy.
//
// Two rules make this work:
//
// 1. PRESENCE IS NEVER PERSISTED. `usernames` is bound to live sockets;
//    restoring it would greet returning players with "name taken" — their own
//    ghost holding the slot. Only the session (begun + the clock) is written.
//
// 2. THE FILE ALWAYS HOLDS A PAUSED SNAPSHOT. Writing `playing: true` with a
//    `startedAt` would be a lie the moment the process dies: on boot the
//    elapsed time would be computed against a timestamp from before the
//    outage, and the track would jump forward by however long the server was
//    down. So a playing room is written as paused at its elapsed-so-far, and
//    restored paused. Players press Resume — which is the same thing they'd
//    do after any interruption.
// ---------------------------------------------------------------------------
const SESSIONS_DIR = join(__dirname, "data");
const SESSIONS_FILE = join(SESSIONS_DIR, "room-sessions.json");
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // prune abandoned rooms after a day
let persistTimer = null;

// Bounds on the in-memory chat log. A 15-minute two-person game won't approach
// these; they exist so a stuck tab hammering the socket can't grow a room
// without limit. Oldest messages fall off the front once the cap is reached.
const MAX_ROOM_MESSAGES = 500;
const MAX_MESSAGE_LEN = 2000;

// The room's elapsed position right now, whether it's running or paused.
function elapsedNow(state) {
  return state.playing && state.startedAt
    ? state.pausedElapsed + (Date.now() - state.startedAt) / 1000
    : state.pausedElapsed;
}

function writeSessionsNow() {
  persistTimer = null;
  const now = Date.now();
  const out = {};
  for (const [roomName, state] of roomStates) {
    if (state.updatedAt && now - state.updatedAt > SESSION_TTL_MS) continue;
    out[roomName] = {
      begun: state.begun,
      pausedElapsed: elapsedNow(state), // see rule 2 above
      updatedAt: state.updatedAt ?? now,
    };
  }
  try {
    mkdirSync(SESSIONS_DIR, { recursive: true });
    // Write-then-rename: a process that dies mid-write must not leave a
    // half-written file that fails to parse on the next boot, taking every
    // room with it.
    const tmp = `${SESSIONS_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(out, null, 2));
    renameSync(tmp, SESSIONS_FILE);
  } catch (err) {
    // Never let a disk problem take the show down — the in-memory session is
    // still authoritative and the game carries on.
    console.error("[/rooms] could not persist sessions:", err.message);
  }
}

function persistSessions() {
  if (persistTimer) return; // coalesce bursts; at most one write per second
  persistTimer = setTimeout(writeSessionsNow, 1000);
}

function loadSessions() {
  if (!existsSync(SESSIONS_FILE)) return;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(SESSIONS_FILE, "utf8"));
  } catch (err) {
    console.error(
      `[/rooms] ignoring unreadable ${SESSIONS_FILE}: ${err.message}`,
    );
    return;
  }
  const now = Date.now();
  let restored = 0;
  for (const [roomName, s] of Object.entries(parsed ?? {})) {
    if (s.updatedAt && now - s.updatedAt > SESSION_TTL_MS) continue;
    roomStates.set(roomName, {
      usernames: new Set(), // presence is live — never restored (rule 1)
      begun: !!s.begun,
      playing: false, // restored paused (rule 2)
      startedAt: null,
      pausedElapsed: Number(s.pausedElapsed) || 0,
      messages: [], // transcript is not persisted to disk — see getRoomState
      updatedAt: s.updatedAt ?? now,
    });
    restored++;
  }
  if (restored)
    console.log(`[/rooms] restored ${restored} session(s) from disk`);
}

// A fresh room id, guaranteed not to be one that already has state. Player A
// scans the printed code, gets one of these, and shows their partner a QR for
// it — so every pair plays in a room that has never existed before, and a
// previous pair's abandoned tab holds an id nobody will ever be sent to
// again. Ambiguous glyphs are out of the alphabet because this id is also
// shown as text for anyone whose camera won't read a phone screen.
const ROOM_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no i/l/o/0/1
function newRoomName() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = [...randomBytes(6)]
      .map((b) => ROOM_ID_ALPHABET[b % ROOM_ID_ALPHABET.length])
      .join("");
    if (!roomStates.has(id)) return id;
  }
  // 31^6 ids against at most a handful of live rooms — reaching here means
  // something is very wrong, so fail loudly rather than hand out a collision.
  throw new Error("could not find a free room id in 50 attempts");
}

function roomStatusPayload(state) {
  return {
    playerCount: state.usernames.size,
    // Who is here. The client shows whoever isn't itself as "the other
    // player" — a pair only ever has one. Sent with every status so the name
    // appears and disappears as they join and leave, rather than relying on
    // the "entered the chat" line, which scrolls away.
    usernames: [...state.usernames],
    track: currentTrack(),
    begun: state.begun,
    playing: state.playing,
    startedAt: state.startedAt,
    pausedElapsed: state.pausedElapsed,
  };
}

function freeRoomSlot(roomName, username) {
  const state = roomStates.get(roomName);
  if (!state) return;
  state.usernames.delete(username);

  // A player vanished mid-game: hold the session where it is rather than let
  // the track run on without them. Their partner sees the pairing QR again
  // (playerCount < 2) and the timeline stops too, since both follow the room
  // clock rather than either device's audio.
  if (state.playing && state.usernames.size < GameParameters.ROOM_CAPACITY) {
    state.pausedElapsed = elapsedNow(state);
    state.playing = false;
    state.startedAt = null;
    console.log(
      `[/rooms] "${roomName}" auto-paused at ${state.pausedElapsed.toFixed(1)}s — a player dropped`,
    );
  }

  // The room is deliberately NOT deleted when it empties. Ids are minted per
  // pair and never handed out twice, so an idle room cannot be inherited by
  // anyone — and both players must be able to reopen their #hash and find the
  // game where they left it. Abandoned rooms age out via SESSION_TTL_MS.
  touchRoom(state);
}

roomsNsp.on("connection", (socket) => {
  console.log(`[/rooms] client connected: ${socket.id}`);

  // Player A arrived via the printed code, which names no room — mint one.
  // Server-side so "a room that didn't exist before" is actually checked
  // against live state rather than trusted to client randomness.
  socket.on("create room", () => {
    try {
      const roomName = newRoomName();
      console.log(`[/rooms] minted new room "${roomName}" for ${socket.id}`);
      socket.emit("room created", { roomName });
    } catch (err) {
      console.error("[/rooms] room mint failed:", err);
      socket.emit("room create failed");
    }
  });

  // Check whether a username is already taken in this room only.
  socket.on("check username", ({ roomName, username } = {}) => {
    if (!roomName || !username) return;
    const state = getRoomState(roomName);
    socket.emit("username response", state.usernames.has(username));
  });

  // Join a room as a named player.
  socket.on("user joined", ({ roomName, username } = {}) => {
    if (!roomName || !username) return;
    const state = getRoomState(roomName);

    if (state.usernames.has(username)) {
      socket.emit("username taken");
      return;
    }

    // Capacity cap — a third scanner is turned away explicitly, not silently
    // dropped into someone else's game.
    if (state.usernames.size >= GameParameters.ROOM_CAPACITY) {
      socket.emit("room-full", { capacity: GameParameters.ROOM_CAPACITY });
      return;
    }

    socket.join(roomName);
    socket.roomName = roomName;
    socket.username = username;
    state.usernames.add(username);
    // Not for the username's sake (presence is never persisted) — this keeps
    // an active room's updatedAt fresh so it can't age out mid-game.
    touchRoom(state);

    console.log(
      `[/rooms] ${username} joined room "${roomName}" (${state.usernames.size}/${GameParameters.ROOM_CAPACITY})`,
    );

    // Confirm the join to the joining client so it can leave name-entry.
    socket.emit("room-joined", { roomName, username });
    // Send the current track list to the joiner, read fresh (not a boot-time
    // snapshot) so it reflects whatever's actually in audio-assets/ right now.
    socket.emit("audio-tracks", { tracks: readAudioTracks() });

    // Replay the conversation so far to the joiner only. This is what makes a
    // rejoin lossless: a player who dropped sees everything said while they
    // were gone, not just what their own phone happened to receive. Emitted
    // inside this synchronous handler, after the socket has joined the room,
    // so it reaches this client before any subsequent live broadcast — no
    // gap, no double. Only when there's something to replay, so a first join
    // doesn't clear a just-shown "entered the chat" notice for nothing.
    if (state.messages.length) {
      socket.emit("chat-history", { messages: state.messages });
    }

    // Broadcast join to the room only.
    roomsNsp.to(roomName).emit("user joined", { username });
    // Room status so every client knows player count + the room's current
    // playback state (track, playing, and enough to compute elapsed time).
    roomsNsp.to(roomName).emit("room-status", roomStatusPayload(state));
  });

  // Chat — broadcast to the room only.
  socket.on("chat", (messageObj) => {
    if (
      messageObj &&
      messageObj.username &&
      messageObj.text &&
      messageObj.timestamp &&
      socket.username === messageObj.username &&
      socket.roomName
    ) {
      // Build a clean record — only the three fields, text length-bounded —
      // and relay exactly what we store so the log and the live feed can never
      // disagree. The client escapes on render; capping here is belt-and-braces
      // against an oversized payload bloating the log.
      const msg = {
        username: messageObj.username,
        text: String(messageObj.text).slice(0, MAX_MESSAGE_LEN),
        timestamp: messageObj.timestamp,
      };
      const state = getRoomState(socket.roomName);
      state.messages.push(msg);
      if (state.messages.length > MAX_ROOM_MESSAGES) {
        state.messages.splice(0, state.messages.length - MAX_ROOM_MESSAGES);
      }
      touchRoom(state); // keeps updatedAt fresh so an active chat won't age out
      roomsNsp.to(socket.roomName).emit("chat", msg);
    }
  });

  // Play / pause — either player can press either intent, from a single
  // toggle button on the client. Both are idempotent by design (an explicit
  // "play" request when already playing, or two players pressing at once,
  // is a no-op) rather than a blind flip, so a click race can't leave the
  // room in the wrong state. The session starts/resumes/pauses for both
  // players at (approximately) the same moment via the room-status broadcast.
  socket.on("audio-play-request", () => {
    if (!socket.roomName) return;
    const state = getRoomState(socket.roomName);
    const track = currentTrack();
    if (!track || state.playing) return;

    const first = !state.begun;
    state.begun = true; // latches: "begin conversation" opens the chat for good
    state.playing = true;
    state.startedAt = Date.now();
    console.log(
      `[/rooms] ${first ? "BEGIN CONVERSATION" : "play"} in room "${socket.roomName}" (track "${track}", elapsed ${state.pausedElapsed.toFixed(1)}s)`,
    );
    touchRoom(state);
    roomsNsp.to(socket.roomName).emit("room-status", roomStatusPayload(state));
  });

  socket.on("audio-pause-request", () => {
    if (!socket.roomName) return;
    const state = getRoomState(socket.roomName);
    if (!state.playing) return;

    state.pausedElapsed += (Date.now() - state.startedAt) / 1000;
    state.playing = false;
    state.startedAt = null;
    console.log(
      `[/rooms] pause in room "${socket.roomName}" (track "${currentTrack()}", elapsed ${state.pausedElapsed.toFixed(1)}s)`,
    );
    touchRoom(state);
    roomsNsp.to(socket.roomName).emit("room-status", roomStatusPayload(state));
  });

  // Re-send current state to one client only. Used when a device's playback
  // was blocked by its autoplay policy and the player taps to enable sound:
  // it needs the room's live elapsed position to join the music in sync, and
  // it must not disturb the other player — hence socket.emit, not a broadcast.
  socket.on("audio-status-request", () => {
    if (!socket.roomName) return;
    socket.emit(
      "room-status",
      roomStatusPayload(getRoomState(socket.roomName)),
    );
  });

  // Refresh button — broadcast reset to the room; both clients reload, which
  // disconnects the sockets and triggers the disconnect cleanup below, freeing
  // names and clearing room state for the next pair.
  socket.on("room-reset", () => {
    if (socket.roomName) {
      console.log(`[/rooms] reset requested in room "${socket.roomName}"`);
      // Actually reset the server state, not just the clients. Since sessions
      // now persist rather than delete-on-empty, a bare broadcast + reload
      // would drop both players straight back into the same begun/elapsed
      // session (the reload keeps the #hash) — and, now, replay the old
      // transcript into a supposedly fresh room. Dropping the state makes the
      // refresh button a real reset: the reload rejoins the same id and
      // getRoomState rebuilds it clean.
      roomStates.delete(socket.roomName);
      persistSessions(); // drop it from disk too
      roomsNsp.to(socket.roomName).emit("room-reset");
    }
  });

  socket.on("disconnect", () => {
    const { roomName, username } = socket;
    if (roomName && username) {
      console.log(`[/rooms] ${username} left room "${roomName}"`);
      roomsNsp.to(roomName).emit("user left", username);
      freeRoomSlot(roomName, username);
      // Tell whoever is left. Without this the remaining player's UI keeps
      // the last playerCount it saw, so it would neither surface the pairing
      // QR again nor reflect the auto-pause above.
      const state = roomStates.get(roomName);
      if (state) {
        roomsNsp.to(roomName).emit("room-status", roomStatusPayload(state));
      }
    }
  });
});

// Bring back any sessions from a previous run before accepting connections,
// so a pair reopening their #hash after a restart finds their game rather
// than a blank room. Restored paused — see the persistence notes above.
loadSessions();

// Last-gasp flush. A clean shutdown (systemd restart, deploy, Ctrl-C) would
// otherwise lose up to the 1s debounce window.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    writeSessionsNow();
    process.exit(0);
  });
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
