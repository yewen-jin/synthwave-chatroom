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

// Add error message element to the popup
const errorMessage = document.createElement('p');
errorMessage.style.color = '#ff0000';
errorMessage.style.display = 'none';
errorMessage.textContent = 'This name has been taken, please use another one';
document.querySelector('.login-content').appendChild(errorMessage);

// Handle username submission
usernameSubmit.addEventListener('click', () => {
    username = usernameInput.value.trim();
    if (username) {
        socket.emit('check username', username);
    }
});

// Add username response handler
socket.on('username response', (isTaken) => {
    if (isTaken) {
        errorMessage.style.display = 'block';
    } else {
        localStorage.setItem('username', username);
        usernamePopup.style.display = 'none';
        socket.emit('user joined', username);
        errorMessage.style.display = 'none';
    }
});

socket.on('username taken', () => {
    errorMessage.style.display = 'block';
});

// Function to add message to chat (handles both chat and system messages)
function addMessageToChat(element) {
    // Simply append the new message to chat body
    chatBody.appendChild(element);
    
    // Scroll to bottom
    chatBody.scrollTop = chatBody.scrollHeight;
}

// Update the join message handler
socket.on('user joined', (username) => {
    const joinMessage = document.createElement('div');
    joinMessage.className = 'system-message';
    joinMessage.innerHTML = `<i><strong>${username}</strong> entered the chat</i>`;
    addMessageToChat(joinMessage);
});

// Update the leave message handler
socket.on('user left', (username) => {
    const leaveMessage = document.createElement('div');
    leaveMessage.className = 'system-message';
    leaveMessage.innerHTML = `<i><strong>${username}</strong> left the chat</i>`;
    addMessageToChat(leaveMessage);
});

// Update the chat message handler
socket.on('chat', (messageObj) => {
    const msgDiv = document.createElement('div');
    // Fix username comparison
    msgDiv.className = `message ${messageObj.username === username ? 'mine' : 'others'}`;
    
    // Use the timestamp from messageObj instead of creating new Date()
    msgDiv.innerHTML = `
        <span class="user-id">${messageObj.username}:</span>
        <span class="text">${messageObj.text}</span>
        <span class="timestamp">${new Date(messageObj.timestamp).toLocaleTimeString()}</span>
    `;
    
    addMessageToChat(msgDiv);
});

// Function to send message
function sendMessage() {
    const message = chatInput.value.trim();
    if (message) {
        const messageObj = {
            text: message,
            username: username,
            timestamp: Date.now()  // Make sure timestamp is included
        };
        socket.emit('chat', messageObj);
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

// ------------------------------------------------------------------------
// p5.js Visuals

// Synthwave visualization settings
let gridSize = 30;  // Increased from 20 to 40 for wider spacing
let horizon = 0;
let speed = 0.5; // Speed of horizon movement
let sunSize = 150;
let maxDistance = 2000;  // Add this to control how far the grid extends

// Define synthwave colors
const colors = {
  background: [10, 0, 40],    // Deep purple background
  sun: [255, 60, 180],       // Hot pink sun
  grid: [80, 40, 255],       // Neon blue grid
  fadeColor: [180, 40, 255]   // Purple fade
};

// Add these with your other P5.js settings
let glitchProbability = 0.1;
let glitchDecay = 0.9;
let channelOffset = 10;
let glitchIntensity = 1;
let glitchActive = false;
let cameraAngle; 

// p5.js setup
function setup() {
  let canvas = createCanvas(windowWidth, windowHeight, WEBGL);
  canvas.position(0, 0);
  canvas.style('z-index', '-1');

//   cameraAngle = Math.PI/3;  // Default camera angle
    cameraAngle = 0; // Adjusted for smoother camera movement
}

function draw() {
  background(colors.background);
  
  // Check for random glitch trigger based on probability
  if (random(1) < glitchProbability) {
    glitchActive = true;
  }
  
  // Sky gradient
  push();
  translate(0, -280, -500);
  noStroke();
  
  // Draw gradient with channel splitting when glitching
  for(let i = 0; i < height/2; i++) {
    let inter = map(i, 0, height/2, 0, 1);
    let c = lerpColor(
      color(80, 0, 100),
      color(255, 60, 180),
      inter
    );
    
    if (glitchActive) {
      // RGB splitting
      fill(color(255, 0, 0));
      rect(-width + random(-channelOffset, channelOffset) * glitchIntensity, 
           i + random(-2, 2), width * 2, 1);
           
      fill(color(0, 255, 0));
      rect(-width + random(-channelOffset, channelOffset) * glitchIntensity, 
           i + random(-2, 2), width * 2, 1);
           
      fill(color(0, 0, 255));
      rect(-width + random(-channelOffset, channelOffset) * glitchIntensity, 
           i + random(-2, 2), width * 2, 1);
    } else {
      fill(c);
      rect(-width, i, width * 2, 1);
    }
  }
  pop();
  
  // Camera setup
  if (glitchActive) {
    // Add camera shake during glitch
    rotateX(cameraAngle + random(-0.05, 0.05) * glitchIntensity);
    translate(random(-5, 5) * glitchIntensity, 100, 0);
  } else {
    rotateX(cameraAngle);
    translate(0, 100, 0);
  }
  
  // Sun
  push();
  translate(0, -500, -1000);
  noStroke();
  
  if (glitchActive) {
    // Glitched sun
    fill(colors.sun[0], colors.sun[1], colors.sun[2], 50);
    circle(random(-channelOffset, channelOffset) * glitchIntensity, 
           random(-channelOffset, channelOffset) * glitchIntensity, 
           sunSize * 1.5);
  } else {
    // Normal sun
    fill(colors.sun[0], colors.sun[1], colors.sun[2], 50);
    circle(0, 0, sunSize * 1.5);
  }
  
  // Inner sun
  fill(colors.sun[0], colors.sun[1], colors.sun[2]);
  circle(0, 0, sunSize);
  pop();
  
  // Grid system - NO ADDITIONAL TRANSFORMS NEEDED
  strokeWeight(1);
  
  // Horizontal lines
  for(let z = 0; z < maxDistance; z += gridSize) {
    let alpha = map(z, 0, maxDistance, 255, 0);
    stroke(colors.grid[0], colors.grid[1], colors.grid[2], alpha);
    
    if (glitchActive) {
      let offset = random(-channelOffset, channelOffset) * glitchIntensity;
      line(-800 + offset, 0, z + horizon, 800 + offset, 0, z + horizon);
    } else {
      line(-800, 0, z + horizon, 800, 0, z + horizon);
    }
  }
  
  // Vertical lines
  for(let x = -800; x <= 800; x += gridSize) {
    let d = dist(x, 0, 0, 0);
    let alpha = map(d, 0, 800, 255, 100);
    stroke(colors.fadeColor[0], colors.fadeColor[1], colors.fadeColor[2], alpha);
    
    if (glitchActive) {
      let offset = random(-channelOffset, channelOffset) * glitchIntensity;
      line(x + offset, 0, 0 + horizon, x + offset, 0, 2000 + horizon);
    } else {
      line(x, 0, 0 + horizon, x, 0, 2000 + horizon);
    }
  }

  // Modify glitch decay
  if (glitchActive) {
    if (random(1) < glitchDecay) {
      glitchActive = false;
    }
  }
  
  // Move horizon
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
    glitchActive = true;  // Trigger glitch on message
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

// Socket listener for glitch controls
socket.on('glitch-control', (data) => {
    console.log('Received glitch control:', {
        parameter: data.parameter,
        value: data.value,
        timestamp: new Date().toISOString()
    });
    
    switch(data.parameter) {
        case 'glitchProbability':
            glitchProbability = data.value;
            break;
        case 'glitchDecay':
            glitchDecay = data.value;
            break;
        case 'channelOffset':
            channelOffset = data.value;
            break;
        case 'glitchIntensity':
            glitchIntensity = data.value;
            break;
        case 'cameraAngle':
            cameraAngle = (PI/3) * data.value;  // Scale the input value
            break;
    }
});
