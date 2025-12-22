import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import { NARRATOR_USERNAME } from './shared/gameParameters.js';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app
const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? ["https://void-space-chatroom.onrender.com", "https://void-space-chatroom.onrender.com/control"]
            : ["http://localhost:5173", "http://localhost:3000"],
        methods: ["GET", "POST", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"]
    }
});

// Serve the production build from dist directory
app.use(express.static(path.join(__dirname, 'dist')));
// Serve static assets (fonts, images) from built assets folder
app.use('/assets', express.static(path.join(__dirname, 'dist/assets')));

// Serve built HTML for control, room1, room2, player-room, narrator-room
app.get('/control', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/control.html'));
});
app.get('/room1', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/room1.html'));
});
app.get('/room2', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/room2.html'));
});
app.get('/player-room', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/player-room.html'));
});
app.get('/narrator-room', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/narrator-room.html'));
});

// Catch-all route to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/index.html'));
});

// Handle 404s
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'dist/index.html'));
});

// Add active users tracking
const activeUsers = new Map();
const takenUsernames = new Set();

// Track connected users
let connectedUsers = 0;

// Track dialogue states per room
const dialogueStates = new Map();

// Helper: Check if narrator is online and broadcast status
function broadcastNarratorStatus() {
    const isNarratorOnline = Array.from(activeUsers.values()).includes(NARRATOR_USERNAME);
    io.emit('narrator-status', { online: isNarratorOnline });
}

// Helper: Load dialogue JSON
async function loadDialogueData(dialogueId) {
    const filePath = path.join(__dirname, 'dist', 'data', 'dialogues', `${dialogueId}.json`);
    try {
        const data = await readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Failed to load dialogue ${dialogueId}:`, error);
        return null;
    }
}

// Helper: Validate dialogue data structure
function validateDialogueData(data) {
    if (!data.metadata || !data.metadata.startNode) {
        throw new Error('Missing startNode in metadata');
    }

    if (!data.nodes[data.metadata.startNode]) {
        throw new Error('startNode does not exist in nodes');
    }

    for (let [nodeId, node] of Object.entries(data.nodes)) {
        for (let choice of node.choices || []) {
            if (!data.nodes[choice.nextNode]) {
                throw new Error(`Invalid nextNode "${choice.nextNode}" in node "${nodeId}"`);
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
    } catch (error) {
        console.error('Dialogue validation failed:', error);
        return null;
    }

    const state = {
        active: true,
        dialogueId,
        currentNode: dialogueData.metadata.startNode,
        variables: {...dialogueData.variables},
        dialogueData
    };

    dialogueStates.set(room, state);
    return state;
}

// Helper: Build sync payload for clients
function buildSyncPayload(state) {
    return {
        active: state.active,
        currentNode: state.currentNode,
        variables: state.variables,
        dialogueId: state.dialogueId,
        dialogueData: state.dialogueData,
        nodeData: state.dialogueData.nodes[state.currentNode]
    };
}

// Helper: Apply effects to variables
function applyEffects(effects, variables) {
    if (!effects) return variables;

    const newVars = {...variables};
    for (let [key, value] of Object.entries(effects)) {
        if (typeof value === 'string' && value.startsWith('+')) {
            newVars[key] = (newVars[key] || 0) + parseFloat(value.substring(1));
        } else if (typeof value === 'string' && value.startsWith('-')) {
            newVars[key] = (newVars[key] || 0) - parseFloat(value.substring(1));
        } else {
            newVars[key] = value;
        }
    }
    return newVars;
}

// Handle Socket.IO connections
io.on('connection', (socket) => {
    console.log('A client connected:', socket.id);

    // Increment user count on connection
    connectedUsers++;
    io.emit('user-count', connectedUsers);

    // Check if username is taken
    socket.on('check username', (username) => {
        const isTaken = takenUsernames.has(username);
        socket.emit('username response', isTaken);
    });

    // Handle user joining
    socket.on('user joined', (username) => {
        if (takenUsernames.has(username)) {
            socket.emit('username taken');
            return;
        }

        socket.username = username;
        takenUsernames.add(username);
        activeUsers.set(socket.id, username);
        console.log(`User joined: ${username}`);
        console.log('Active users:', Array.from(activeUsers.values()));

        // Check if dialogue is active and user is narrator
        const playerRoomState = dialogueStates.get('player-room');
        const isDialogueActive = playerRoomState && playerRoomState.active;
        const isNarrator = username === NARRATOR_USERNAME;

        // Only broadcast join message if NOT (narrator joining during active dialogue)
        if (!(isDialogueActive && isNarrator)) {
            io.emit('user joined', username);
        } else {
            console.log(`Suppressing join message for narrator during active dialogue`);
        }

        // Broadcast narrator status to all clients
        broadcastNarratorStatus();

        // If there's an active dialogue in player-room, sync the new player
        if (isDialogueActive) {
            console.log(`Syncing active dialogue to newly joined user: ${username}`);
            socket.emit('dialogue-sync', buildSyncPayload(playerRoomState));
        }
    });

    // Send current narrator status to newly connected clients
    socket.on('request-narrator-status', () => {
        const isNarratorOnline = Array.from(activeUsers.values()).includes(NARRATOR_USERNAME);
        socket.emit('narrator-status', { online: isNarratorOnline });
    });

    // Listen for chat messages from clients
    socket.on('chat', (messageObj) => {
        // Verify message structure and active user
        if (messageObj && 
            messageObj.username && 
            messageObj.text && 
            messageObj.timestamp &&
            activeUsers.get(socket.id) === messageObj.username) {
            console.log(`Message from ${messageObj.username}: ${messageObj.text}`);
            io.emit('chat', messageObj);
        }
    });

    // Add this with your other socket handlers
    socket.on('glitch-control', (data) => {
        // Broadcast the control change to all clients except sender
        socket.broadcast.emit('glitch-control', data);
    });

    // Handle theme control
    socket.on('control-theme', (theme) => {
        // Broadcast theme change to all clients except sender
        socket.broadcast.emit('theme-change', theme);
        console.log(`Theme changed to: ${theme || 'default'}`);
    });

    // Handle dialogue start (from narrator in narrator-room)
    socket.on('dialogue-start', async (data) => {
        const targetRoom = data.targetRoom || 'player-room';
        console.log(`Starting dialogue ${data.dialogueId} in ${targetRoom}`);

        // Notify player that dialogue is starting (for typing indicator)
        io.emit('dialogue-started');

        const state = await startDialogue(targetRoom, data.dialogueId);

        if (state) {
            // Process the starting node (this handles auto-advancing nodes)
            processNode(targetRoom);
        } else {
            socket.emit('dialogue-error', { message: 'Failed to load dialogue' });
        }
    });

    // Helper: Handle new messageSequence format
    function handleMessageSequence(room, node, playerUsername) {
        const state = dialogueStates.get(room);
        const sequence = node.messageSequence;

        let delay = playerUsername ? 1500 : 0; // Wait 1.5s after player choice

        sequence.forEach((message, index) => {
            setTimeout(() => {
                switch (message.type) {
                    case 'system':
                        io.emit('chat', {
                            text: message.content,
                            username: 'SYSTEM',
                            timestamp: Date.now(),
                            isSystem: true
                        });
                        break;

                    case 'narrator':
                        io.emit('chat', {
                            text: message.content,
                            username: NARRATOR_USERNAME,
                            timestamp: Date.now()
                        });
                        break;

                    case 'image':
                        io.emit('chat', {
                            imageUrl: message.url,
                            imageAlt: message.alt || '',
                            username: 'SYSTEM',
                            timestamp: Date.now(),
                            isImage: true
                        });
                        break;

                    case 'pause':
                        // Pause type - no action, just affects timing
                        break;

                    default:
                        console.warn(`Unknown message type: ${message.type}`);
                }

                // After last message in sequence
                if (index === sequence.length - 1) {
                    const hasChoices = node.choices && node.choices.length > 0;

                    if (!hasChoices) {
                        // Auto-advance to next node
                        setTimeout(() => {
                            if (node.type === 'ending') {
                                handleDialogueEnd(room, state);
                            } else if (node.nextNode) {
                                console.log(`Auto-advancing to next node: ${node.nextNode}`);
                                state.currentNode = node.nextNode;
                                processNode(room);
                            } else {
                                console.log('Warning: No nextNode specified for auto-advancing node');
                            }
                        }, 1500);
                    } else {
                        // Show choices to player
                        io.emit('dialogue-sync', buildSyncPayload(state));
                    }
                }
            }, delay + (index * 1500)); // 1.5s between each message
        });
    }

    // Helper: Process a node and auto-advance if needed
    function processNode(room, playerUsername = null, choiceText = null) {
        const state = dialogueStates.get(room);
        if (!state || !state.active) return;

        const currentNode = state.dialogueData.nodes[state.currentNode];
        console.log(`Processing node: ${state.currentNode}, type: ${currentNode.type}`);

        // Send notification to narrator room for monitoring
        io.emit('player-choice-made', {
            currentNode: state.currentNode,
            isEnding: currentNode.type === 'ending'
        });

        // If player made a choice, broadcast it to chat first
        if (playerUsername && choiceText) {
            io.emit('chat', {
                text: choiceText,
                username: playerUsername,
                timestamp: Date.now()
            });
        }

        // NEW FORMAT: Check if node uses messageSequence
        if (currentNode.messageSequence && currentNode.messageSequence.length > 0) {
            console.log('Using new messageSequence format');
            handleMessageSequence(room, currentNode, playerUsername);
            return;
        }

        // OLD FORMAT: Legacy handling for nodes without messageSequence

        // Determine node type and handle accordingly
        const hasNarratorMessages = currentNode.narratorMessages && currentNode.narratorMessages.length > 0;
        const hasChoices = currentNode.choices && currentNode.choices.length > 0;
        const hasText = currentNode.text && currentNode.text.trim().length > 0;

        // TYPE 1: NARRATOR MESSAGE NODE (has narratorMessages, may or may not have choices)
        if (hasNarratorMessages) {
            console.log(`Node type: Narrator message (${currentNode.narratorMessages.length} messages)`);

            // Send each narrator message with delay
            let delay = playerUsername ? 1500 : 0; // If player just chose, wait 1.5s
            currentNode.narratorMessages.forEach((message, index) => {
                setTimeout(() => {
                    io.emit('chat', {
                        text: message,
                        username: NARRATOR_USERNAME,
                        timestamp: Date.now()
                    });

                    // After last narrator message, check if we should auto-advance
                    if (index === currentNode.narratorMessages.length - 1) {
                        // If no choices, auto-advance to next node
                        if (!hasChoices) {
                            console.log('No choices, auto-advancing after narrator messages');
                            setTimeout(() => {
                                if (currentNode.type === 'ending') {
                                    handleDialogueEnd(room, state);
                                } else if (currentNode.nextNode) {
                                    // Auto-advance to the specified next node
                                    console.log(`Auto-advancing to next node: ${currentNode.nextNode}`);
                                    state.currentNode = currentNode.nextNode;
                                    processNode(room);
                                } else {
                                    console.log('Warning: No nextNode specified for auto-advancing node');
                                }
                            }, 1500);
                        } else {
                            // Has choices, send them to player
                            io.emit('dialogue-sync', buildSyncPayload(state));
                        }
                    }
                }, delay + (index * 1500)); // 1.5s between each message
            });
            return;
        }

        // TYPE 2: SYSTEM MESSAGE NODE (has text, no narratorMessages, no choices)
        if (hasText && !hasNarratorMessages && !hasChoices) {
            console.log('Node type: System message (auto-advancing)');

            // System messages are just displayed in the text area (handled by client)
            // Send sync first so client can display the text
            io.emit('dialogue-sync', buildSyncPayload(state));

            // Auto-advance after a delay
            setTimeout(() => {
                if (currentNode.type === 'ending') {
                    handleDialogueEnd(room, state);
                } else if (currentNode.nextNode) {
                    console.log(`Auto-advancing to next node: ${currentNode.nextNode}`);
                    state.currentNode = currentNode.nextNode;
                    processNode(room);
                } else {
                    console.log('Warning: No nextNode specified for system message node');
                }
            }, 2000);
            return;
        }

        // TYPE 3: PLAYER CHOICE NODE (has choices)
        if (hasChoices) {
            console.log(`Node type: Player choice (${currentNode.choices.length} choices)`);

            // If there's text, it's displayed (handled by client)
            // Send choices to player and wait for selection
            io.emit('dialogue-sync', buildSyncPayload(state));
            return;
        }

        // TYPE 4: ENDING NODE
        if (currentNode.type === 'ending') {
            console.log('Node type: Ending');

            // If has text, display it (handled by client)
            // End dialogue after delay
            setTimeout(() => {
                handleDialogueEnd(room, state);
            }, 3000);
            return;
        }

        // Fallback: just sync the node
        io.emit('dialogue-sync', buildSyncPayload(state));
    }

    // Helper: Handle dialogue end
    function handleDialogueEnd(room, state) {
        state.active = false;
        io.emit('dialogue-end', {
            reason: 'completed'
        });

        // Check if narrator left during dialogue and is still offline
        if (state.narratorLeftDuringDialogue) {
            const isNarratorOnline = Array.from(activeUsers.values()).includes(NARRATOR_USERNAME);
            if (!isNarratorOnline) {
                console.log(`Showing deferred narrator leave message after dialogue end`);
                io.emit('user left', NARRATOR_USERNAME);
            }
            state.narratorLeftDuringDialogue = false;
        }

        // Clean up state after 5 minutes
        setTimeout(() => {
            if (!dialogueStates.get(room)?.active) {
                dialogueStates.delete(room);
                console.log(`Cleaned up dialogue state for room: ${room}`);
            }
        }, 5 * 60 * 1000);
    }

    // Handle player choice (from player-room)
    socket.on('player-choice', (data) => {
        const room = 'player-room';
        const state = dialogueStates.get(room);

        if (!state || !state.active) {
            console.log('No active dialogue for player choice');
            return;
        }

        // Validate choice exists in current node
        const currentNode = state.dialogueData.nodes[state.currentNode];
        const choice = currentNode.choices.find(c => c.id === data.choiceId);

        if (!choice) {
            console.log('Invalid choice');
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

    // Handle narrator continue (DEPRECATED - kept for backward compatibility)
    // The server now automatically sends responses, but this remains for monitoring
    socket.on('narrator-continue', () => {
        console.log('narrator-continue event received (deprecated - server handles responses automatically)');
        // This handler is now a no-op since server automatically sends responses
    });

    // Handle client disconnection
    socket.on('disconnect', () => {
        connectedUsers--;
        io.emit('user-count', connectedUsers);

        const username = activeUsers.get(socket.id);
        if (username) {
            console.log(`User left: ${username}`);
            takenUsernames.delete(username);
            activeUsers.delete(socket.id);
            console.log('Remaining users:', Array.from(activeUsers.values()));

            // Check if dialogue is active and user is narrator
            const playerRoomState = dialogueStates.get('player-room');
            const isDialogueActive = playerRoomState && playerRoomState.active;
            const isNarrator = username === NARRATOR_USERNAME;

            // Only broadcast leave message if NOT (narrator leaving during active dialogue)
            if (!(isDialogueActive && isNarrator)) {
                io.emit('user left', username);
            } else {
                console.log(`Suppressing leave message for narrator during active dialogue`);
                // Store that narrator left during dialogue so we can notify after it ends
                if (playerRoomState) {
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