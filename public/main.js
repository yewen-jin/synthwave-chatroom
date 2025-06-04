// Connect to Socket.IO server
const socket = io();
const chatBody = document.getElementById('chatBody');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.querySelector('.send-btn');

// Colors for messages
const userColor = '#0f0'; // neon-green

// Add these constants at the top
const usernamePopup = document.getElementById('username-popup');
const usernameInput = document.getElementById('username-input');
const usernameSubmit = document.getElementById('username-submit');

// Initialize username
let username = localStorage.getItem('username');

// Show popup if no username is stored
if (!username) {
    usernamePopup.style.display = 'flex';
} else {
    socket.emit('set username', username);
}

// Handle username submission
usernameSubmit.addEventListener('click', () => {
    username = usernameInput.value.trim();
    if (username) {
        localStorage.setItem('username', username);
        usernamePopup.style.display = 'none';
        socket.emit('user joined', username); // Changed from 'set username' to 'user joined'
    }
});

// Add this socket listener for join messages
socket.on('user joined', (username) => {
    const joinMessage = document.createElement('div');
    joinMessage.className = 'system-message';
    joinMessage.innerHTML = `<i><strong>${username}</strong> entered the room</i>`;
    chatBody.appendChild(joinMessage);
    chatBody.scrollTop = chatBody.scrollHeight;
});

// Add this socket listener for leave messages
socket.on('user left', (username) => {
    const leaveMessage = document.createElement('div');
    leaveMessage.className = 'system-message';
    leaveMessage.innerHTML = `<i><strong>${username}</strong> left the room</i>`;
    chatBody.appendChild(leaveMessage);
    chatBody.scrollTop = chatBody.scrollHeight;
});

// Function to send message
function sendMessage() {
    const message = chatInput.value.trim();
    if (message) {
        socket.emit('chat', {
            text: message,
            username: username
        });
        chatInput.value = '';
    }
}

// Handle sending messages with Enter key
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // Prevent new line
        sendMessage();
    }
});

// Handle sending messages with Send button
sendBtn.addEventListener('click', () => {
    sendMessage();
});

// Receive chat message and append to chat body
socket.on('chat', (messageObj) => {
    const msgDiv = document.createElement('div');
    // Add 'mine' class if message is from current user, 'others' if not
    msgDiv.className = `message ${messageObj.userId === username ? 'mine' : 'others'}`;
    
    msgDiv.innerHTML = `
        <span class="user-id">${messageObj.userId}:</span>
        <span class="text">${messageObj.text}</span>
        <span class="timestamp">${new Date(messageObj.timestamp).toLocaleTimeString()}</span>
    `;
    
    chatBody.appendChild(msgDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
});


// ------------------------------------------------------------------------
// p5.js Visuals

// Synthwave visualization settings
let gridSize = 20;
let horizon = 0;
let speed = 0.5; // Speed of horizon movement
let sunSize = 150;

// Define synthwave colors
const colors = {
  background: [10, 0, 40],    // Deep purple background
  sun: [255, 60, 180],       // Hot pink sun
  grid: [80, 40, 255],       // Neon blue grid
  fadeColor: [180, 40, 255]   // Purple fade
};

// p5.js setup
function setup() {
  let canvas = createCanvas(windowWidth, windowHeight, WEBGL);
  canvas.position(0, 0);
  canvas.style('z-index', '-1');
}

function draw() {
  background(colors.background); // Deep purple background
  
  // Create gradient sky effect
  push();
  translate(0, -200, -500);
  noStroke();
  for(let i = 0; i < height/2; i++) {
    let inter = map(i, 0, height/2, 0, 1);
    let c = lerpColor(
      color(80, 0, 100),    // Deep purple
      color(255, 60, 180),  // Pink
      inter
    );
    fill(c);
    rect(-width, i, width * 2, 1);
  }
  pop();
  
  // Move camera
  rotateX(PI/3);
  translate(0, 100, 0);
  
  // Draw sun with glow effect
  push();
  translate(0, -500, -1000);
  // Outer glow
  noStroke();
  fill(colors.sun[0], colors.sun[1], colors.sun[2], 50);
  circle(0, 0, sunSize * 1.5);
  // Inner sun
  fill(colors.sun[0], colors.sun[1], colors.sun[2]);
  circle(0, 0, sunSize);
  pop();
  
  // Draw grid
  strokeWeight(2);
  
  // Horizontal lines
  for(let z = 0; z < 2000; z += gridSize) {
    let alpha = map(z, 0, 2000, 255, 0);
    stroke(
      colors.grid[0],
      colors.grid[1], 
      colors.grid[2],
      alpha
    );
    line(-800, 0, z + horizon, 800, 0, z + horizon);
  }
  
  // Vertical lines
  for(let x = -800; x <= 800; x += gridSize) {
    let d = dist(x, 0, 0, 0);
    let alpha = map(d, 0, 800, 255, 100);
    stroke(
      colors.fadeColor[0],
      colors.fadeColor[1],
      colors.fadeColor[2],
      alpha
    );
    line(x, 0, 0 + horizon, x, 0, 2000 + horizon);
  }
  
  // Move horizon for animation
  horizon -= speed;
  if(horizon <= -gridSize) {
    horizon = 0;
  }
}

// Update visuals object
const visuals = {
  onMessage(messageObj) {
    // Flash effect when message is received
    sunSize = 200;
    setTimeout(() => {
      sunSize = 150;
    }, 200);
  }
};

// Add draggable functionality
const maximizeBtn = document.querySelector('.maximize');
const msnWindow = document.querySelector('.msn-window');
const titleBar = document.querySelector('.title-bar');
let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;
let xOffset = 0;
let yOffset = 0;

titleBar.addEventListener('mousedown', dragStart);
document.addEventListener('mousemove', drag);
document.addEventListener('mouseup', dragEnd);

maximizeBtn.addEventListener('click', () => {
    msnWindow.classList.toggle('maximized');
    
    // Disable dragging when maximized
    if (msnWindow.classList.contains('maximized')) {
        isDragging = false;
        titleBar.style.cursor = 'default';
    } else {
        titleBar.style.cursor = 'grab';
    }

    // Update button text
    maximizeBtn.textContent = msnWindow.classList.contains('maximized') ? '❐' : '□';
});

function dragStart(e) {
    if (msnWindow.classList.contains('maximized')) return;
    
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;

    if (e.target === titleBar) {
        isDragging = true;
    }
}

function drag(e) {
    if (isDragging) {
        e.preventDefault();
        
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        xOffset = currentX;
        yOffset = currentY;

        setTranslate(currentX, currentY, msnWindow);
    }
}

function dragEnd(e) {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
}

function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate(${xPos}px, ${yPos}px)`;
}
