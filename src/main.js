import p5 from 'p5';
import { io } from 'socket.io-client';

// Connect to Socket.IO server
const socket = io(
    window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : 'https://void-space-chatroom.onrender.com',
    {
        withCredentials: true,
        transports: ['websocket', 'polling']
    }
);
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
  sun: [255, 75, 180],       // Hot pink sun
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

// Add this with other visualization settings
let gridWidth = 1200;  // Controls how wide the grid extends horizontally

// Create new p5 instance with the sketch
new p5((p) => {
  // Move p5 methods to use 'p.' prefix
  p.setup = () => {
    let canvas = p.createCanvas(p.windowWidth, p.windowHeight, p.WEBGL);
    canvas.position(0, 0);
    canvas.style('z-index', '-1');
    cameraAngle = 0;
  };

  p.draw = () => {
    p.background(colors.background);
    
    if (p.random(1) < glitchProbability) {
      glitchActive = true;
    }
    
    // Sky gradient
    p.push();
    p.translate(0, -280, -500);
    p.noStroke();
    
    // Draw gradient with channel splitting when glitching
    for(let i = 0; i < p.height/2; i++) {
      let inter = p.map(i, 0, p.height/2, 0, 1);
      let c = p.lerpColor(
        p.color(80, 0, 100),
        p.color(255, 60, 180),
        inter
      );
      
      if (glitchActive) {
        // RGB splitting
        p.fill(p.color(255, 0, 0));
        p.rect(-p.width + p.random(-channelOffset, channelOffset) * glitchIntensity, 
             i + p.random(-2, 2), p.width * 2, 1);
             
        p.fill(p.color(0, 255, 0));
        p.rect(-p.width + p.random(-channelOffset, channelOffset) * glitchIntensity, 
             i + p.random(-2, 2), p.width * 2, 1);
             
        p.fill(p.color(0, 0, 255));
        p.rect(-p.width + p.random(-channelOffset, channelOffset) * glitchIntensity, 
             i + p.random(-2, 2), p.width * 2, 1);
      } else {
        p.fill(c);
        p.rect(-p.width, i, p.width * 2, 1);
      }
    }
    p.pop();
    
    // Camera setup
    if (glitchActive) {
      // Add camera shake during glitch
      p.rotateX(cameraAngle + p.random(-0.05, 0.05) * glitchIntensity);
      p.translate(p.random(-5, 5) * glitchIntensity, 100, 0);
    } else {
      p.rotateX(cameraAngle);
      p.translate(0, 100, 0);
    }
    
    // Sun
    p.push();
    p.translate(0, -500, -1000);
    p.noStroke();
    
    if (glitchActive) {
      // Glitched sun
      p.fill(colors.sun[0], colors.sun[1], colors.sun[2], 50);
      p.circle(p.random(-channelOffset, channelOffset) * glitchIntensity, 
             p.random(-channelOffset, channelOffset) * glitchIntensity, 
             sunSize * 1.5);
    } else {
      // Normal sun
      p.fill(colors.sun[0], colors.sun[1], colors.sun[2], 50);
      p.circle(0, 0, sunSize * 1.5);
    }
    
    // Inner sun
    p.fill(colors.sun[0], colors.sun[1], colors.sun[2]);
    p.circle(0, 0, sunSize);
    p.pop();
    
    // Grid system - NO ADDITIONAL TRANSFORMS NEEDED
    p.strokeWeight(1);
    
    // Horizontal lines
    for(let z = 0; z < maxDistance; z += gridSize) {
      let gridAlpha = p.map(z, 0, maxDistance, 255, 0);
      p.stroke(colors.grid[0], colors.grid[1], colors.grid[2], gridAlpha);
      
      if (glitchActive) {
        let offset = p.random(-channelOffset, channelOffset) * glitchIntensity;
        p.line(-gridWidth + offset, 0, z + horizon, gridWidth + offset, 0, z + horizon);
      } else {
        p.line(-gridWidth, 0, z + horizon, gridWidth, 0, z + horizon);
      }
    }
    
    // Vertical lines
    for(let x = -gridWidth; x <= gridWidth; x += gridSize) {
      let d = p.dist(x, 0, 0, 0);
      let gridAlpha = p.map(d, 0, gridWidth, 255, 100);
      p.stroke(colors.fadeColor[0], colors.fadeColor[1], colors.fadeColor[2], gridAlpha);
      
      if (glitchActive) {
        let offset = p.random(-channelOffset, channelOffset) * glitchIntensity;
        p.line(x + offset, 0, 0 + horizon, x + offset, 0, 2000 + horizon);
      } else {
        p.line(x, 0, 0 + horizon, x, 0, 2000 + horizon);
      }
    }

    // Modify glitch decay
    if (glitchActive) {
      if (p.random(1) < glitchDecay) {
        glitchActive = false;
      }
    }
    
    // Move horizon
    horizon -= speed;
    if(horizon <= -gridSize) {
      horizon = 0;
    }
  };

  // Add windowResized handler
  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };
});

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
            cameraAngle = (Math.PI/3) * data.value;  // Scale the input value
            break;
    }
});
