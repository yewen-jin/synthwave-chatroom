import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app
const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Update static file serving
app.use(express.static(path.join(__dirname, 'src')));
app.get('/control', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/control.html'));
});
app.get('/room1', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/room1.html'));
});
// Add this route to serve room2.html
app.get('/room2', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/room2.html'));
});

// Replace your user tracking with this:

// Maps socket ID to {username, room}
const activeUsers = new Map(); 

// Maps room -> Set of usernames (for room-specific username validation)
const roomUsernames = new Map();

// Track connected users
let connectedUsers = 0;

// Handle Socket.IO connections
io.on('connection', (socket) => {
    let currentRoom = 'default';
    let currentUsername = null;

    console.log('A client connected:', socket.id);

    // Increment user count on connection
    connectedUsers++;
    io.emit('user-count', connectedUsers);

    // Check if username is taken
    socket.on('check username', (username) => {
        // Get the set of usernames for the current room
        const usernamesInRoom = roomUsernames.get(currentRoom) || new Set();
        
        // Check if username is taken in this specific room
        const isTaken = usernamesInRoom.has(username);
        
        console.log(`Checking username "${username}" in room "${currentRoom}": ${isTaken ? 'taken' : 'available'}`);
        socket.emit('username response', isTaken);
    });

    // Handle user joining - Change this to be room-aware
    socket.on('user joined', (username) => {
        // Get existing usernames for this room
        if (!roomUsernames.has(currentRoom)) {
            roomUsernames.set(currentRoom, new Set());
        }
        const usernamesInRoom = roomUsernames.get(currentRoom);
        
        // Check if username is taken IN THIS ROOM ONLY
        if (usernamesInRoom.has(username)) {
            socket.emit('username taken');
            return;
        }
        
        // If user had a previous username in this room, remove it
        const previousData = activeUsers.get(socket.id);
        if (previousData && previousData.room === currentRoom) {
            usernamesInRoom.delete(previousData.username);
        }
        
        // Set new username for this room
        socket.username = username;
        usernamesInRoom.add(username);
        activeUsers.set(socket.id, {username, room: currentRoom});
        
        console.log(`User joined: ${username} in room: ${currentRoom}`);
        io.to(currentRoom).emit('user joined', username);
    });

    // Update room joining logic:
    socket.on('join-room', (roomName) => {
        // Leave previous room if any
        if (currentRoom) {
            // Get user data for current room
            const userData = activeUsers.get(socket.id);
            
            if (userData && userData.room === currentRoom) {
                // Notify users in the old room that this user has left
                socket.to(currentRoom).emit('user left', userData.username);
                
                // Remove username from old room's set
                const oldRoomUsers = roomUsernames.get(currentRoom);
                if (oldRoomUsers) {
                    oldRoomUsers.delete(userData.username);
                }
            }
            
            socket.leave(currentRoom);
        }
        
        // Join new room
        socket.join(roomName);
        currentRoom = roomName;
        
        console.log(`User ${socket.id} joined room: ${roomName}`);
        
        // Initialize room usernames if needed
        if (!roomUsernames.has(roomName)) {
            roomUsernames.set(roomName, new Set());
        }
        
        // Check if user already has username for this room
        const existingData = [...activeUsers.entries()]
            .filter(([id, data]) => id === socket.id && data.room === roomName)
            .map(([_, data]) => data)[0];
        
        if (existingData) {
            // User already has username in this room
            socket.emit('username exists', existingData.username);
            socket.to(roomName).emit('user joined', existingData.username);
        } else {
            // User needs to set username for this room
            socket.emit('need username');
        }
    });
    
    // Handle username setting
    socket.on('set username', (username) => {
        // Update stored username
        currentUsername = username;
        socket.username = username;
        
        // Only announce to the current room
        io.to(currentRoom).emit('user joined', username);
    });
    
    // Listen for chat messages from clients
    socket.on('chat', (data) => {
        const userData = activeUsers.get(socket.id);
        
        // Verify message structure and active user
        if (data && 
            data.username && 
            data.text && 
            data.timestamp &&
            userData && 
            userData.username === data.username && 
            userData.room === currentRoom) {
            
            console.log(`Message from ${data.username} in ${currentRoom}: ${data.text}`);
            io.to(currentRoom).emit('chat', data);
        } else {
            console.log('Message validation failed:', {
                receivedData: data, 
                storedData: userData,
                currentRoom
            });
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

    // Handle client disconnection - Make room-specific
    socket.on('disconnect', () => {
        connectedUsers--;
        io.emit('user-count', connectedUsers);

        const userData = activeUsers.get(socket.id);
        if (userData) {
            const { username, room } = userData;
            console.log(`User left: ${username} from room: ${room}`);
            
            // Remove username from room's set
            const roomUsers = roomUsernames.get(room);
            if (roomUsers) {
                roomUsers.delete(username);
            }
            
            activeUsers.delete(socket.id);
            console.log('Remaining users:', Array.from(activeUsers.values()));
            
            // Emit to the user's room
            io.to(room).emit('user left', username);
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
