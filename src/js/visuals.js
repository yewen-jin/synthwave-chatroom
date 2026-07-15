// visuals.js
import p5 from 'p5';

export function initVisuals() {
  // Global configuration wrapper for easy integration with control panels/Sockets
  window.synthwaveConfig = {
    speed: 0.04,            // Grid and road scroll speed
    glitchIntensity: 0.0,   // Intensity of visual glitches (0.0 to 1.0)
    showScanlines: true,    // CRT monitor horizontal scanlines
    showVignette: true,     // Soft inner screen bezel shadow
    glowAmount: 12,         // Neon bloom blur size
    sunSlices: 12           // Number of segments in the sliced retro sun
  };

  let stars = [];
  const baseFactor = 0.74;  // Compression factor for perspective scaling
  let gridOffset = 0.0;    // Scroll offset (interpolates 0.0 to 1.0)

  // Control panel parameters
  let glitchProbability = 0.1;
  let glitchDecay = 0.9;
  let channelOffset = 10;
  let glitchIntensitySliderMultiplier = 1.0;
  let cameraAngleOffset = 0.0;
  let flashSunBoost = 0;
  let glitchActive = false;

  new p5((p) => {
    p.setup = () => {
      // Create a canvas spanning the browser window
      let canvas = p.createCanvas(p.windowWidth, p.windowHeight);
      canvas.position(0, 0);
      canvas.style('z-index', '-1'); // Place canvas behind standard HTML chat boxes
      canvas.style('position', 'fixed');

      // Initialize stars scattered across the upper sky
      stars = [];
      for (let i = 0; i < 70; i++) {
        stars.push({
          x: p.random(p.width),
          y: p.random(p.height * 0.45),
          size: p.random(0.5, 2.5),
          baseBrightness: p.random(100, 255),
          twinkleSpeed: p.random(0.01, 0.04)
        });
      }
    };

    p.draw = () => {
      // Handle random glitch trigger based on glitchProbability
      if (p.random(1) < glitchProbability) {
        glitchActive = true;
      }

      // Define horizon geometry based on vertical space
      const horizonY = p.height * 0.48;

      // 1. Draw Background Sky Gradient (Deep Indigo to Hot Pink)
      drawSky(horizonY);

      // 2. Render Twinkling Stars
      drawStars();

      // 3. Render Sliced Synthwave Sun
      drawSun(horizonY);

      // 4. Render Parallax Wireframe Mountains
      drawMountains(horizonY);

      // 5. Draw Ground Base
      drawGround(horizonY);

      // 6. Draw Perspective Side Grids
      drawSideGrids(horizonY);

      // 7. Draw Central Highway and Dashes
      drawHighway(horizonY);

      // 8. Draw Horizon Blending Glow (Smoothes background/ground intersection)
      drawHorizonGlow(horizonY);

      // 9. Process Active CRT Glitches (Screen tear)
      applyGlitches();

      // 10. Draw CRT Vignette & Scanline Filters
      drawFilters();

      // Update scrolling offsets mapped to delta-time (framerate independent)
      let dT = p.min(p.deltaTime, 50); // Clamp spikes
      gridOffset += window.synthwaveConfig.speed * (dT / 16.67);
      gridOffset %= 1.0; // Loop seamlessly once one cell distance is covered

      // Decay glitchActive
      if (glitchActive) {
        if (p.random(1) < glitchDecay) {
          glitchActive = false;
        }
      }
    };

    // Adjust canvas dynamically to browser window resize
    p.windowResized = () => {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
      for (let star of stars) {
        if (star.x > p.width) star.x = p.random(p.width);
        if (star.y > p.height * 0.45) star.y = p.random(p.height * 0.45);
      }
    };

    /* --- Render Helper Functions --- */

    function drawSky(horizonY) {
      let skyGradient = p.drawingContext.createLinearGradient(0, 0, 0, horizonY);
      skyGradient.addColorStop(0, '#04000b');   // Midnight space void
      skyGradient.addColorStop(0.5, '#120024'); // Deep violet
      skyGradient.addColorStop(0.85, '#2e004a'); // Indigo
      skyGradient.addColorStop(1, '#ff0055');   // Sunset magenta horizon
      
      p.drawingContext.fillStyle = skyGradient;
      p.noStroke();
      p.rect(0, 0, p.width, horizonY);
    }

    function drawStars() {
      p.push();
      for (let star of stars) {
        // Twinkle effect using a sine wave
        let flicker = p.sin(p.frameCount * star.twinkleSpeed) * 50;
        p.stroke(star.baseBrightness + flicker);
        p.strokeWeight(star.size);
        p.point(star.x, star.y);
      }
      p.pop();
    }

    function drawSun(horizonY) {
      p.push();
      const sunRadius = p.min(p.width * 0.16, 130) + flashSunBoost;
      const sunX = p.width / 2 + cameraAngleOffset * 0.5; // parallax
      const sunY = horizonY;

      // Sun vertical color transition
      let sunGradient = p.drawingContext.createLinearGradient(0, sunY - sunRadius, 0, sunY + sunRadius);
      sunGradient.addColorStop(0, '#ffe600');   // Radiant Cyber Yellow
      sunGradient.addColorStop(0.4, '#ff5500'); // Hot Orange
      sunGradient.addColorStop(1, '#ff0055');   // Neon Pink

      p.drawingContext.fillStyle = sunGradient;
      p.noStroke();

      // Apply subtle back-glow to the sun
      enableGlow('#ff3300', window.synthwaveConfig.glowAmount * 1.5);
      p.ellipse(sunX, sunY, sunRadius * 2, sunRadius * 2);
      disableGlow();

      // Slicing mask (draw horizontal background stripes matching the sky's bottom gradient)
      p.fill('#0c0018'); 
      let slices = window.synthwaveConfig.sunSlices;
      for (let i = 1; i < slices; i++) {
        let t = i / slices;
        // Map slice positioning quadratically to space out gaps as they rise
        let y = sunY + p.pow(t, 1.4) * sunRadius;
        let gapHeight = p.map(i, 0, slices, 1, 9); // Lines become thicker near the bottom

        p.rect(sunX - sunRadius - 10, y - gapHeight / 2, sunRadius * 2 + 20, gapHeight);
      }
      p.pop();
    }

    function drawMountains(horizonY) {
      p.push();
      p.noFill();
      p.strokeWeight(1.5);

      let mountainStep = 25;

      // Far Mountains (Slower, deep indigo mesh)
      enableGlow('#4b0082', window.synthwaveConfig.glowAmount * 0.4);
      p.stroke(95, 20, 160, 110);
      
      // Far Left Range
      p.beginShape();
      p.vertex(0, horizonY);
      for (let x = 0; x <= p.width * 0.42; x += mountainStep) {
        let nX = x * 0.003 - p.frameCount * 0.0006 - cameraAngleOffset * 0.002;
        let h = p.noise(nX) * 110;
        let fade = p.map(x, 0, p.width * 0.42, 1, 0); // Clear space for road in center
        let y = horizonY - h * fade;
        p.vertex(x, y);
        p.line(x, y, x, horizonY); // Wireframe vertical pillar rib
      }
      p.vertex(p.width * 0.42, horizonY);
      p.endShape(p.CLOSE);

      // Far Right Range
      p.beginShape();
      p.vertex(p.width, horizonY);
      for (let x = p.width; x >= p.width * 0.58; x -= mountainStep) {
        let nX = x * 0.003 + p.frameCount * 0.0006 - cameraAngleOffset * 0.002;
        let h = p.noise(nX) * 110;
        let fade = p.map(x, p.width, p.width * 0.58, 1, 0);
        let y = horizonY - h * fade;
        p.vertex(x, y);
        p.line(x, y, x, horizonY);
      }
      p.vertex(p.width * 0.58, horizonY);
      p.endShape(p.CLOSE);

      // Near Mountains (Slightly faster, magenta accent)
      enableGlow('#ff007f', window.synthwaveConfig.glowAmount * 0.8);
      p.stroke(255, 0, 127, 180);

      // Near Left Range
      p.beginShape();
      p.vertex(0, horizonY);
      for (let x = 0; x <= p.width * 0.38; x += mountainStep) {
        let nX = x * 0.006 - p.frameCount * 0.0016 - cameraAngleOffset * 0.004;
        let h = p.noise(nX + 100) * 75; // Different noise seed offset
        let fade = p.map(x, 0, p.width * 0.38, 1, 0);
        let y = horizonY - h * fade;
        p.vertex(x, y);
        p.line(x, y, x, horizonY);
      }
      p.vertex(p.width * 0.38, horizonY);
      p.endShape(p.CLOSE);

      // Near Right Range
      p.beginShape();
      p.vertex(p.width, horizonY);
      for (let x = p.width; x >= p.width * 0.62; x -= mountainStep) {
        let nX = x * 0.006 + p.frameCount * 0.0016 - cameraAngleOffset * 0.004;
        let h = p.noise(nX + 200) * 75;
        let fade = p.map(x, p.width, p.width * 0.62, 1, 0);
        let y = horizonY - h * fade;
        p.vertex(x, y);
        p.line(x, y, x, horizonY);
      }
      p.vertex(p.width * 0.62, horizonY);
      p.endShape(p.CLOSE);

      disableGlow();
      p.pop();
    }

    function drawGround(horizonY) {
      // Ground background layer (creates a baseline beneath the wire grid)
      p.fill('#090113');
      p.noStroke();
      p.rect(0, horizonY, p.width, p.height - horizonY);
    }

    function drawSideGrids(horizonY) {
      p.push();
      p.strokeWeight(1.2);
      let roadWidthBottom = p.width * 0.28;
      let numGridRows = 22;
      let numVerticalLines = 14;
      let vanishX = p.width / 2 + cameraAngleOffset;

      // --- Vertical Perspective Lines ---
      enableGlow('#00f0ff', window.synthwaveConfig.glowAmount * 0.5);
      p.stroke(0, 240, 255, 140);
      for (let j = -numVerticalLines / 2; j <= numVerticalLines / 2; j++) {
        let xBottom = p.width / 2 + j * (p.width / numVerticalLines) * 1.5;
        // Hide lines that interfere inside the central road boundaries
        if (p.abs(xBottom - p.width / 2) < roadWidthBottom * 0.95) {
          continue;
        }
        p.line(vanishX, horizonY, xBottom, p.height);
      }

      // --- Horizontal Scrolling Lines ---
      for (let i = 0; i < numGridRows; i++) {
        // Scroll coordinates using exponential spacing
        let y = horizonY + (p.height - horizonY) * p.pow(baseFactor, i - gridOffset);
        let opacity = p.pow(baseFactor, i - gridOffset) * 220; // Natural horizon fade

        p.stroke(255, 0, 127, opacity);
        enableGlow('#ff007f', window.synthwaveConfig.glowAmount * 0.4);

        // Stop horizontal lines cleanly at the margins of the highway
        let leftMargin = p.map(y, horizonY, p.height, vanishX, p.width / 2 - roadWidthBottom);
        let rightMargin = p.map(y, horizonY, p.height, vanishX, p.width / 2 + roadWidthBottom);

        p.line(0, y, leftMargin, y);
        p.line(rightMargin, y, p.width, y);
      }
      disableGlow();
      p.pop();
    }

    function drawHighway(horizonY) {
      p.push();
      const roadWidthBottom = p.width * 0.28;
      let vanishX = p.width / 2 + cameraAngleOffset;

      // Solid Cyan Borders with neon reflection
      p.strokeWeight(3);
      enableGlow('#00f0ff', window.synthwaveConfig.glowAmount * 1.2);
      p.stroke(0, 240, 255, 245);
      p.line(vanishX, horizonY, p.width / 2 - roadWidthBottom, p.height);
      p.line(vanishX, horizonY, p.width / 2 + roadWidthBottom, p.height);

      // Perspective Dashed Center Divider Line
      p.strokeWeight(2.5);
      enableGlow('#ffdd00', window.synthwaveConfig.glowAmount * 0.8);
      
      let totalDashes = 18;
      for (let i = 0; i < totalDashes; i++) {
        let yStart = horizonY + (p.height - horizonY) * p.pow(baseFactor, i - gridOffset);
        let yEnd = horizonY + (p.height - horizonY) * p.pow(baseFactor, i + 0.5 - gridOffset);
        let opacity = p.pow(baseFactor, i - gridOffset) * 255;

        // The center line also converges from vanishX to p.width / 2
        let xStart = p.map(yStart, horizonY, p.height, vanishX, p.width / 2);
        let xEnd = p.map(yEnd, horizonY, p.height, vanishX, p.width / 2);

        // Alternate loops to create distinct gap spacing
        if (i % 2 === 0) {
          p.stroke(255, 221, 0, opacity);
          p.line(xStart, yStart, xEnd, yEnd);
        }
      }
      disableGlow();
      p.pop();
    }

    function drawHorizonGlow(horizonY) {
      p.push();
      // Horizontal haze gradient running along the division line
      let glowH = 30;
      let glowGradient = p.drawingContext.createLinearGradient(0, horizonY - glowH/2, 0, horizonY + glowH/2);
      glowGradient.addColorStop(0, 'rgba(255, 0, 110, 0)');
      glowGradient.addColorStop(0.5, 'rgba(255, 0, 110, 0.4)');
      glowGradient.addColorStop(1, 'rgba(0, 240, 255, 0)');

      p.drawingContext.fillStyle = glowGradient;
      p.noStroke();
      p.rect(0, horizonY - glowH / 2, p.width, glowH);
      p.pop();
    }

    function applyGlitches() {
      let intensity = window.synthwaveConfig.glitchIntensity * glitchIntensitySliderMultiplier;
      if (glitchActive) {
        intensity = p.max(intensity, 1.0);
      }
      if (intensity <= 0) return;

      p.push();
      // Simulated Screen Tear / Horizontal Shift
      let triggerProb = glitchActive ? 0.3 : (intensity * 0.25);
      if (p.random() < triggerProb) {
        let sliceY = p.random(p.height);
        let sliceHeight = p.random(12, 60);
        let xShift = p.random(-channelOffset * 4, channelOffset * 4) * intensity;
        
        // Copy the slice from the canvas buffer and re-draw offset
        let slice = p.get(0, sliceY, p.width, sliceHeight);
        p.image(slice, xShift, sliceY);
      }

      // Neon Static Jumps
      let staticProb = glitchActive ? 0.25 : (intensity * 0.15);
      if (p.random() < staticProb) {
        p.strokeWeight(p.random(1, 4));
        p.stroke(p.random() > 0.5 ? '#00f0ff' : '#ff007f');
        let lineY = p.random(p.height);
        p.line(p.random(p.width * 0.1), lineY, p.random(p.width * 0.9, p.width), lineY);
      }
      p.pop();
    }

    function drawFilters() {
      // Horizontal CRT scanlines
      if (window.synthwaveConfig.showScanlines) {
        p.push();
        p.stroke('rgba(0, 0, 0, 0.12)');
        p.strokeWeight(1.2);
        for (let y = 0; y < p.height; y += 4) {
          p.line(0, y, p.width, y);
        }
        p.pop();
      }

      // Bezel vignette to darken screen borders and focus center highway depth
      if (window.synthwaveConfig.showVignette) {
        p.push();
        p.noFill();
        for (let i = 0; i < 40; i += 2) {
          let alpha = p.map(i, 0, 40, 0, 110);
          p.stroke(0, 0, 0, alpha);
          p.strokeWeight(2);
          p.rect(i, i, p.width - i * 2, p.height - i * 2, 8);
        }
        p.pop();
      }
    }

    /* Native Canvas Glow Context Utilities */
    function enableGlow(colorString, blurAmount) {
      if (blurAmount <= 0) return;
      p.drawingContext.shadowBlur = blurAmount;
      p.drawingContext.shadowColor = colorString;
    }

    function disableGlow() {
      p.drawingContext.shadowBlur = 0;
    }
  });

  return {
    setGlitchProbability: (v) => { glitchProbability = v; },
    setGlitchDecay: (v) => { glitchDecay = v; },
    setChannelOffset: (v) => { channelOffset = v; },
    setGlitchIntensity: (v) => { glitchIntensitySliderMultiplier = v; },
    setCameraAngle: (v) => { cameraAngleOffset = v * 150; },
    flash: () => {
      flashSunBoost = 50;
      glitchActive = true;
      setTimeout(() => { flashSunBoost = 0; }, 200);
    }
  };
}
