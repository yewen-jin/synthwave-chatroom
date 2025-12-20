import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';

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
        io.emit('user joined', username);
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

        const state = await startDialogue(targetRoom, data.dialogueId);

        if (state) {
            // Send dialogue to players in player-room
            io.emit('dialogue-sync', buildSyncPayload(state));
        } else {
            socket.emit('dialogue-error', { message: 'Failed to load dialogue' });
        }
    });

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

        // Broadcast player's choice to chat
        io.emit('chat', {
            text: data.choiceText,
            username: data.username,
            timestamp: Date.now()
        });

        // Get narrator response from next node
        const nextNode = state.dialogueData.nodes[state.currentNode];

        // Check if ending node
        if (nextNode.type === 'ending') {
            // Send ending to players (using narrator username "Liz")
            io.emit('chat', {
                text: nextNode.text,
                username: 'Liz',
                timestamp: Date.now()
            });

            // End dialogue
            setTimeout(() => {
                state.active = false;
                io.emit('dialogue-end', {
                    reason: 'completed'
                });

                // Clean up state after 5 minutes
                setTimeout(() => {
                    if (!dialogueStates.get(room)?.active) {
                        dialogueStates.delete(room);
                        console.log(`Cleaned up dialogue state for room: ${room}`);
                    }
                }, 5 * 60 * 1000);
            }, 3000);
        } else {
            // Show narrator response popup in narrator-room
            io.emit('player-choice-made', {
                narratorResponse: nextNode.text,
                playerChoice: data.choiceText
            });
        }
    });

    // Handle narrator continue (from narrator-room)
    socket.on('narrator-continue', (data) => {
        const room = 'player-room';
        const state = dialogueStates.get(room);

        if (!state || !state.active) {
            console.log('No active dialogue for narrator continue');
            return;
        }

        // Broadcast narrator response to chat
        io.emit('chat', {
            text: data.text,
            username: data.username,
            timestamp: Date.now()
        });

        // Notify player that narrator sent response
        io.emit('narrator-response-sent');

        // Get current node and send next dialogue choice to player
        const currentNode = state.dialogueData.nodes[state.currentNode];
        const choices = currentNode.choices || [];

        if (choices.length > 0) {
            // Send next set of choices to player
            io.emit('dialogue-sync', buildSyncPayload(state));
        } else {
            // No more choices, dialogue might be ending
            console.log('No more choices available');
        }
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
            io.emit('user left', username);
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});