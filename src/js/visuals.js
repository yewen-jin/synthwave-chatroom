// visuals.js
import p5 from 'p5';

export function initVisuals(onMessageCallback) {
  // Synthwave visualization settings
  let gridSize = 30;
  let horizon = 0;
  let speed = 0.5;
  let sunSize = 150;
  let maxDistance = 2000;
  const colors = {
    background: [10, 0, 40],
    sun: [255, 75, 180],
    grid: [80, 40, 255],
    fadeColor: [180, 40, 255]
  };
  let glitchProbability = 0.1;
  let glitchDecay = 0.9;
  let channelOffset = 10;
  let glitchIntensity = 1;
  let glitchActive = false;
  let cameraAngle;
  let gridWidth = 1200;

  new p5((p) => {
    p.setup = () => {
      let canvas = p.createCanvas(p.windowWidth, p.windowHeight, p.WEBGL);
      canvas.position(0, 0);
      canvas.style('z-index', '-1');
      cameraAngle = 0;
    };
    p.draw = () => {
      p.background(colors.background);
      if (p.random(1) < glitchProbability) glitchActive = true;
      p.push();
      p.translate(0, -280, 280);
      p.noStroke();
      for(let i = 0; i < p.height/2; i++) {  // p.height/2 controls the height of gradient
        let inter = p.map(i, 0, p.height/2, 0, 1);
        let c = p.lerpColor(p.color(80, 0, 100), p.color(255, 60, 180), inter);
        if (glitchActive) {
          p.fill(p.color(255, 0, 0));
          p.rect(-p.width + p.random(-channelOffset, channelOffset) * glitchIntensity, i + p.random(-2, 2), p.width * 2, 1);
          p.fill(p.color(0, 255, 0));
          p.rect(-p.width + p.random(-channelOffset, channelOffset) * glitchIntensity, i + p.random(-2, 2), p.width * 2, 1);
          p.fill(p.color(0, 0, 255));
          p.rect(-p.width + p.random(-channelOffset, channelOffset) * glitchIntensity, i + p.random(-2, 2), p.width * 2, 1);
        } else {
          p.fill(c);
          p.rect(-p.width, i, p.width * 2, 1);  // Width is controlled by p.width * 2
        }
      }
      p.pop();
      if (glitchActive) {
        p.rotateX(cameraAngle + p.random(-0.05, 0.05) * glitchIntensity);
        p.translate(p.random(-5, 5) * glitchIntensity, 100, 0);
      } else {
        p.rotateX(cameraAngle);
        p.translate(0, 100, 0);
      }
      p.push();
      p.translate(0, -500, -1000);
      p.noStroke();
      if (glitchActive) {
        p.fill(colors.sun[0], colors.sun[1], colors.sun[2], 50);
        p.circle(p.random(-channelOffset, channelOffset) * glitchIntensity, p.random(-channelOffset, channelOffset) * glitchIntensity, sunSize * 1.5);
      } else {
        p.fill(colors.sun[0], colors.sun[1], colors.sun[2], 50);
        p.circle(0, 0, sunSize * 1.5);
      }
      p.fill(colors.sun[0], colors.sun[1], colors.sun[2]);
      p.circle(0, 0, sunSize);
      p.pop();
      p.strokeWeight(1);
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
      if (glitchActive) {
        if (p.random(1) < glitchDecay) glitchActive = false;
      }
      horizon -= speed;
      if(horizon <= -gridSize) horizon = 0;
    };
    p.windowResized = () => {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
    };
  });

  // Expose controls for glitch from outside
  return {
    setGlitchProbability: (v) => { glitchProbability = v; },
    setGlitchDecay: (v) => { glitchDecay = v; },
    setChannelOffset: (v) => { channelOffset = v; },
    setGlitchIntensity: (v) => { glitchIntensity = v; },
    setCameraAngle: (v) => { cameraAngle = (Math.PI/3) * v; },
    flash: () => {
      sunSize = 200;
      glitchActive = true;
      setTimeout(() => { sunSize = 150; }, 200);
    }
  };
}

// Add a function to react to theme changes

export function updateVisualsForTheme(theme) {
    // You could adjust visualization colors based on theme
    // For example:
    switch(theme) {
        case 'palette-purple':
            // Adjust purple-specific visual parameters
            break;
        case 'palette-blue':
            // Adjust blue-specific visual parameters
            break;
        case 'palette-green':
            // Adjust blue-specific visual parameters
            break;
        default:
            // Default green theme
            break;
    }
}
