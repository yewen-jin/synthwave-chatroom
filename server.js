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
app.use('/assets', express.static(path.join(__dirname, 'src/assets')));

// Serve control panel and assets separately
app.get('/control', (req, res) => {
    res.sendFile(path.join(__dirname, 'src/control.html'));
});

// Catch-all route to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/index.html'));
});

// Handle 404s
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'dist/index.html'));
});
app.get('/room1', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/room1.html'));
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
    
    // Track room-specific usernames
    const userRooms = new Map(); // Maps room -> username
    
    console.log('A client connected:', socket.id);
    
    // Increment user count on connection
    connectedUsers++;
    io.emit('user-count', connectedUsers);
    
    // Check if username is taken (room-specific)
    socket.on('check username', (username) => {
        // Check if username is taken in current room only
        const roomUsers = Array.from(activeUsers.values())
            .filter(user => user.room === currentRoom)
            .map(user => user.username);
            
        const isTaken = roomUsers.includes(username);
        socket.emit('username response', isTaken);
    });
    
    // Handle user joined with new username
    socket.on('user joined', (username) => {
        // Check if username is taken in current room only
        const roomUsers = Array.from(activeUsers.values())
            .filter(user => user.room === currentRoom)
            .map(user => user.username);
            
        if (roomUsers.includes(username)) {
            socket.emit('username taken');
            return;
        }
        
        // Store username for this room
        userRooms.set(currentRoom, username);
        currentUsername = username;
        
        // Update global tracking with room info
        activeUsers.set(socket.id, {
            username: username,
            room: currentRoom
        });
        
        console.log(`User joined: ${username} in room: ${currentRoom}`);
        console.log('Active users:', Array.from(activeUsers.values()));
        
        // Announce only to the current room
        io.to(currentRoom).emit('user joined', username);
    });
    
    // Handle joining a specific room
    socket.on('join-room', (roomName) => {
        // Leave previous room if any
        if (currentRoom) {
            // Get the username for the room being left
            const oldRoomUsername = userRooms.get(currentRoom);
            
            // Notify users in the old room that this user has left
            if (oldRoomUsername) {
                socket.to(currentRoom).emit('user left', oldRoomUsername);
            }
            
            socket.leave(currentRoom);
        }
        
        // Join new room
        socket.join(roomName);
        currentRoom = roomName;
        
        console.log(`User ${socket.id} joined room: ${roomName}`);
        
        // If user already has a username for this room, announce them
        if (userRooms.has(roomName)) {
            currentUsername = userRooms.get(roomName);
            socket.to(currentRoom).emit('user joined', currentUsername);
            
            // Let client know they have a username already
            socket.emit('username exists', currentUsername);
        } else {
            // Reset current username to prompt for a new one
            currentUsername = null;
            
            // Signal client that they need to set a username
            socket.emit('need username');
        }
    });
    
    // Handle username setting
    socket.on('set username', (username) => {
        // Store username for this specific room
        userRooms.set(currentRoom, username);
        currentUsername = username;
        
        // Update global tracking with room info
        activeUsers.set(socket.id, {
            username: username,
            room: currentRoom
        });
        
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
        io.emit('user-count', connectedUsers);
        
        const userData = activeUsers.get(socket.id);
        if (userData) {
            console.log(`User left: ${userData.username} from room: ${userData.room}`);
            
            // Only notify the specific room the user was in
            io.to(userData.room).emit('user left', userData.username);
            
            // Clean up tracking data
            activeUsers.delete(socket.id);
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
