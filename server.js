const express = require('express');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');

// Create Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Track IPs and their assigned IDs
const ipMap = new Map();
let nextId = 1;

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Handle Socket.IO connections
io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);
  
  const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

  // Assign unique ID if IP is new
  if (!ipMap.has(clientIp)) {
    ipMap.set(clientIp, `user_${nextId++}`);
  }

  const userId = ipMap.get(clientIp);
  console.log(`Client connected - IP: ${clientIp}, ID: ${userId}, Socket: ${socket.id}`);

  let username;

  socket.on('set username', (name) => {
    username = name;
    console.log(`User ${socket.id} set username to ${username}`);
  });

  socket.on('user joined', (username) => {
    socket.username = username;
    // Broadcast to everyone including sender
    io.emit('user joined', username);
  });

  // Listen for chat messages from clients
  socket.on('chat', (msg) => {
    // Ensure msg is properly formatted
    const messageContent = typeof msg === 'string' ? msg : msg.text || msg.toString();
 
    // Add user ID to message object
    const messageWithId = {
      text: messageContent,
      userId: username || userId, // Use username if available, fallback to userId
      timestamp: new Date().toISOString()
    };

        // Log the message for debugging
    console.log('Sending message:', messageWithId);
    
    // Broadcast message to all connected clients
    io.emit('chat', messageWithId);
  });

  // Handle client disconnection
  socket.on('disconnect', () => {
    console.log('A client disconnected:', socket.id);
  });
});

// Start server on port 3000 (or environment PORT)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
