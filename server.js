import express from "express";
import { Server } from "socket.io";
import { createServer } from "http";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
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
    origin:
      process.env.NODE_ENV === "production"
        ? [
            "https://void-space-chatroom.onrender.com",
            "https://void-space-chatroom.onrender.com/control",
          ]
        : ["http://localhost:5173", "http://localhost:3000"],
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

// Serve built HTML for control, room1, room2, player-room, narrator-room
app.get("/control", (req, res) => {
  res.sendFile(join(__dirname, "dist/control.html"));
});
app.get("/room1", (req, res) => {
  res.sendFile(join(__dirname, "dist/room1.html"));
});
app.get("/room2", (req, res) => {
  res.sendFile(join(__dirname, "dist/room2.html"));
});
app.get("/player-room", (req, res) => {
  res.sendFile(join(__dirname, "dist/player-room.html"));
});
app.get("/narrator-room", (req, res) => {
  res.sendFile(join(__dirname, "dist/narrator-room.html"));
});
app.get("/docs", (req, res) => {
  res.sendFile(join(__dirname, "dist/docs.html"));
  // res.sendFile(join(__dirname, "src/documents.html"));
});
// Catch-all route to serve index.html
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "dist/index.html"));
});

// Handle 404s:  send all invalid endpoint to index page
app.use((req, res) => {
  res.status(404).sendFile(join(__dirname, "dist/index.html"));
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
  if (GameParameters.DELAY_MODE === "fallback") return GameParameters.MESSAGE_DELAY_MS;

  // Dynamic mode — narrator and speaker messages scale with text length
  const isDynamic = (message && message.content) &&
    (message.type === "narrator" || (message.type === "system" && message.speaker));
  if (isDynamic) {
    const charCount = message.content.length;
    const delay = GameParameters.NARRATOR_DELAY_BASE_MS + charCount * GameParameters.NARRATOR_DELAY_PER_CHAR_MS;
    return Math.max(GameParameters.NARRATOR_DELAY_MIN_MS, Math.min(delay, GameParameters.NARRATOR_DELAY_MAX_MS));
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
    let cumulativeDelay = playerUsername ? calculateMessageDelay(sequence[0]) : 0;

    sequence.forEach((message, index) => {
      const timerId = setTimeout(
        () => {
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
        },
        cumulativeDelay,
      );
      state.pendingTimers.push(timerId);

      // Add delay for the next message based on the current message
      const nextMessage = sequence[index + 1];
      if (nextMessage) {
        cumulativeDelay += calculateMessageDelay(nextMessage);
      }
    });
  }

  // Helper: Process a node and auto-advance if needed
  function processNode(room, playerUsername = null, choiceText = null, depth = 0) {
    const state = dialogueStates.get(room);
    if (!state || !state.active) return;

    if (depth > 50) {
      console.error(`processNode exceeded max depth (50) at node: ${state.currentNode} — possible circular condition`);
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
      console.warn(`Node ${state.currentNode} has no messageSequence, choices, or nextNode`);
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

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
