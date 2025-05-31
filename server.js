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

// Handle Socket.IO connections
io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);

  // Listen for chat messages from clients
  socket.on('chat', (msg) => {
    // Broadcast message to all connected clients
    io.emit('chat', msg);
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
