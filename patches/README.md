# Synthwave Chatroom Background Patches

This directory contains visual backdrop patches and backups for the client-side background effects.

## Patches & Files

1. **[visuals.original.js](file:///Users/yewenjin/projects/synthwave-chatroom/patches/visuals.original.js)**:
   - The original p5.js visualization of the synthwave chatroom. Uses a 3D WEBGL setup with static grid lines and simple neon glitch bars.

2. **[3d-sunset-highway.patch](file:///Users/yewenjin/projects/synthwave-chatroom/patches/3d-sunset-highway.patch)**:
   - Patch containing the changes from the original visuals to the new **3D Synthwave Sunset Highway** layout.
   - Features:
     - 2D Canvas optimized grid system with perspective-spaced lines.
     - Horizontal camera-angle vanishing point offset simulating turns/camera panning.
     - Parallax wireframe Perlin noise mountains.
     - Sliced neon sunset sun with dynamic flash scaling.
     - Graduated CRT scanlines and screen bezel vignette.

## How to Apply a Patch

To apply the sunset highway patch manually (if reverted):
```bash
git apply patches/3d-sunset-highway.patch
```
