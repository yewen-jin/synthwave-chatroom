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
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
app.get('/control', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/control.html'));
});
app.get('/room1', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/room1.html'));
});
app.get('/room2', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/room2.html'));
});

// Add active users tracking
const activeUsers = new Map();
const takenUsernames = new Set();

// Track connected users
let connectedUsers = 0;

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
