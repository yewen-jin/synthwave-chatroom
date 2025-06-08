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
app.use('/assets', express.static(path.join(__dirname, 'src/assets')));
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

// Add active users tracking
const activeUsers = new Map();
const takenUsernames = new Set();

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
        const isTaken = takenUsernames.has(username);
        socket.emit('username response', isTaken);
    });

    // Handle user joining - Change this to be room-aware
    socket.on('user joined', (username) => {
        if (takenUsernames.has(username)) {
            socket.emit('username taken');
            return;
        }
        
        socket.username = username;
        takenUsernames.add(username);
        activeUsers.set(socket.id, username);
        currentUsername = username;
        console.log(`User joined: ${username} in room: ${currentRoom}`);
        console.log('Active users:', Array.from(activeUsers.values()));
        
        // Only emit to the current room instead of all clients
        io.to(currentRoom).emit('user joined', username);
    });

    // Handle joining a specific room - Update the emission strategy
    socket.on('join-room', (roomName) => {
        // Leave previous room if any
        if (currentRoom) {
            // Notify users in the old room that this user has left
            if (currentUsername) {
                socket.to(currentRoom).emit('user left', currentUsername);
            }
            socket.leave(currentRoom);
        }
        
        // Join new room
        socket.join(roomName);
        currentRoom = roomName;
        
        console.log(`User ${socket.id} joined room: ${roomName}`);
        
        // If user already has username, announce them in the new room only
        if (currentUsername) {
            socket.to(roomName).emit('user joined', currentUsername);
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
        // Verify message structure and active user
        if (data && 
            data.username && 
            data.text && 
            data.timestamp &&
            activeUsers.get(socket.id) === data.username) {
            console.log(`Message from ${data.username}: ${data.text}`);
            // Add room information to the message
            const messageData = {
                ...data,
                room: currentRoom
            };
            
            // Broadcast to current room only
            io.to(currentRoom).emit('chat', messageData);
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
        io.emit('user-count', connectedUsers); // This can stay global for admin purposes

        const username = activeUsers.get(socket.id);
        if (username) {
            console.log(`User left: ${username} from room: ${currentRoom}`);
            takenUsernames.delete(username);
            activeUsers.delete(socket.id);
            console.log('Remaining users:', Array.from(activeUsers.values()));
            
            // Only emit to the current room instead of all clients
            io.to(currentRoom).emit('user left', username);
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
