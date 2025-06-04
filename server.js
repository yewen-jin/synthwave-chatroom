const express = require('express');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');

// Create Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Add active users tracking at the top of file
const activeUsers = new Map(); // stores socketId -> username

// Handle Socket.IO connections
io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);

  // Handle user joining
  socket.on('user joined', (username) => {
    socket.username = username;
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

  // Handle client disconnection
  socket.on('disconnect', () => {
    const username = activeUsers.get(socket.id);
    if (username) {
      console.log(`User left: ${username}`);
      activeUsers.delete(socket.id);
      console.log('Remaining users:', Array.from(activeUsers.values()));
      io.emit('user left', username);
    }
  });
});

// Start server on port 3000 (or environment PORT)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
