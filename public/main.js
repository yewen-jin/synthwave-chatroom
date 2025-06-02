// Connect to Socket.IO server
const socket = io();
const chatBody = document.getElementById('chatBody');
const chatInput = document.getElementById('chatInput');

// Colors for messages
const userColor = '#0f0'; // neon-green

// Handle sending messages
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
        // Send message as an object with text property
        socket.emit('chat', {
            text: chatInput.value.trim()
        });
        chatInput.value = '';
    }
});

// Receive chat message and append to chat body
socket.on('chat', (messageObj) => {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message';

  // Create message content with user ID and text
  msgDiv.innerHTML = `
    <span class="user-id">${messageObj.userId}:</span>
    <span class="text">${messageObj.text}</span>
    <span class="timestamp">${new Date(messageObj.timestamp).toLocaleTimeString()}</span>
  `;
  
  msgDiv.style.color = userColor;
  msgDiv.style.borderLeft = `3px solid ${userColor}`;
  msgDiv.style.paddingLeft = '6px';
  
  chatBody.appendChild(msgDiv);
  chatBody.scrollTop = chatBody.scrollHeight;
  
  // Trigger visual effect for this message
  visuals.onMessage(messageObj.text);
});


// ------------------------------------------------------------------------
// p5.js Visuals

// Array to hold particles
let particles = [];

// Particle class
class Particle {
  constructor(position, velocity, color) {
    this.pos = position.copy();
    this.vel = velocity.copy();
    this.color = color;
    this.lifespan = 255;
  }

  update() {
    this.pos.add(this.vel);
    this.lifespan -= 5;
  }

  show() {
    push();
    translate(this.pos.x, this.pos.y, this.pos.z);
    noStroke();
    fill(red(this.color), green(this.color), blue(this.color), this.lifespan);
    sphere(5);
    pop();
  }

  isDead() {
    return this.lifespan <= 0;
  }
}

// p5.js setup
function setup() {
  let canvas = createCanvas(windowWidth, windowHeight, WEBGL);
  canvas.position(0, 0);
  canvas.style('z-index', '-1'); // ensure chat overlays the canvas
}

function draw() {
  background(0);
  // Rotate a central cube
  push();
  rotateY(frameCount * 0.005);
  stroke(0, 255, 0);
  noFill();
  box(200);
  pop();

  // Update and show particles
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    particles[i].show();
    if (particles[i].isDead()) {
      particles.splice(i, 1);
    }
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// Visuals object with onMessage hook
const visuals = {
  onMessage(messageObj) {
    // Spawn a burst of particles
    for (let i = 0; i < 30; i++) {
      const angle = random(TWO_PI);
      const r = random(50, 150);
      const x = r * cos(angle);
      const y = random(-100, 100);
      const z = r * sin(angle);
      const pos = createVector(x, y, z);
      const vel = p5.Vector.mult(pos.copy().normalize(), random(2, 5));
      const col = color(0, 255, 0);
      particles.push(new Particle(pos, vel, col));
    }
  }
};
