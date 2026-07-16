# How `/control` drives the background visuals

Written 16 Jul 2026, during the `thisverisionofme` build. Explains exactly how each
`/control` panel input reaches the p5 background, and how its effect differs between
`patches/visuals.original.js` (the pre-redesign backdrop) and the current
`src/js/visuals.js` (the "3D Synthwave Sunset Highway" redesign, `ba6df12`). Both files
are read in full to write this — every claim below is grounded in the actual code, not
inferred from names.

## Data flow

```
/control (src/control.html)
  |  socket.emit('glitch-control', {parameter, value})   -- one event per slider drag
  |  socket.emit('control-theme', paletteClass)           -- one event per theme button
  v
server.js (default namespace only — NOT /rooms)
  socket.on('glitch-control', ...) -> socket.broadcast.emit('glitch-control', data)
  socket.on('control-theme', ...)  -> socket.broadcast.emit('theme-change', theme)
  v
every OTHER connected client (chatroom.html/index.html via main.js; NOT /room)
  socket.js: socket.on('theme-change', ...)        -- built into initSocket(), always wired
  main.js:   socket.on('glitch-control', onGlitchControl)  -- passed in as a callback
  v
onGlitchControl(data) in main.js — switches on data.parameter, calls one of five
setter methods on the object initVisuals() returned.
```

Two things worth being explicit about, because they're easy to assume wrong:

- **`/control` only reaches the default namespace.** `/room` connects to the isolated
  `/rooms` namespace (see the room-based card game work), so nothing from `/control`
  reaches it — no live glitch control, no theme switching. `/room` runs the background
  with whatever its own script sets at startup and nothing else. This is deliberate,
  not an oversight — see `__context__/thisverisionofme-plan.md`'s "visual parity"
  section.
- **Theme buttons never touch `visuals.js` at all.** `control-theme` → `theme-change`
  only toggles `palette-purple` / `palette-blue` / `palette-green` classes on
  `document.body` (`socket.js`). Neither version of `visuals.js` reads those classes or
  anything CSS-related — the p5 canvas colours are hardcoded in JS in both versions,
  independent of the MSN-window palette theme.

## The interface contract that makes both versions drop-in compatible

`onGlitchControl` in `main.js` calls five fixed method names on the object `initVisuals()`
returns: `setGlitchProbability`, `setGlitchDecay`, `setChannelOffset`, `setGlitchIntensity`,
`setCameraAngle`. Both `visuals.original.js` and the current `visuals.js` export **exactly
this shape** (plus `flash()` — see below). That's why the redesign (`ba6df12`) needed zero
changes to `main.js`, `server.js`, or `control.html` — the control surface is decoupled from
the renderer by this fixed method contract. What differs is entirely on the inside: what each
setter's value actually _means_ to the new renderer.

## Per-control breakdown

### `glitchProbability` — slider range 0 to 1, default 0.1

Identical in both versions, semantically and numerically. Assigned straight to a
`glitchProbability` variable, checked once per frame:

```js
if (p.random(1) < glitchProbability) glitchActive = true;
```

Reads as "chance per frame that a glitch episode begins." No behavioural difference
between the two files.

### `glitchDecay` — slider range 0.1 to 0.99, default 0.9

Also identical in both. Checked once per frame while a glitch episode is active:

```js
if (glitchActive) {
  if (p.random(1) < glitchDecay) glitchActive = false;
}
```

Higher value = more likely to end the episode each frame = shorter glitches on average.
No behavioural difference between the two files.

### `channelOffset` — slider range 1 to 50, default 10

Same input, different job entirely, because the two files implement "glitch" as a
different visual technique:

- **Original**: used directly, twice — as the jitter range for the RGB-channel-split
  bars drawn over the road-gradient background, and as the horizontal jitter applied to
  every grid line while a glitch is active. `p.random(-channelOffset, channelOffset) *
glitchIntensity`.
- **Current**: used in exactly one place, `applyGlitches()`'s screen-tear effect, and
  **scaled 4× before use**: `p.random(-channelOffset * 4, channelOffset * 4) * intensity`.
  This shifts a captured horizontal slice of the actual canvas buffer sideways (real
  screen tear via `p.get()` + `p.image()`), not a drawn RGB-split bar. At the slider's
  max (50), that's a possible ±200px shift versus the original's ±50px-ish range at the
  same slider position — the same dial position now produces a visibly larger jump.

### `glitchIntensity` — slider range 0 to 2, default 1 — **dead in the current version**

This is the one finding worth flagging on its own, because it's not visible from reading
either file in isolation — it only shows up by tracing the value all the way through.

- **Original**: `setGlitchIntensity(v)` assigns directly to `glitchIntensity`, which is
  used as a broad multiplier across several jitter calculations simultaneously — the
  RGB-split bar offset, the camera pitch jitter (`p.rotateX(cameraAngle + p.random(-0.05,
0.05) * glitchIntensity)`), and the translate jitter. The slider does something
  visible across the whole scene.

- **Current**: `setGlitchIntensity(v)` assigns to `glitchIntensitySliderMultiplier`
  (deliberately renamed internally — the exported method name is kept the same for the
  interface contract above, but the variable itself is a multiplier, not the intensity
  value). It's used exactly once:

  ```js
  let intensity =
    window.synthwaveConfig.glitchIntensity * glitchIntensitySliderMultiplier;
  ```

  `window.synthwaveConfig.glitchIntensity` is set once, at `initVisuals()` call time, to
  `0.0` (`visuals.js:8`) — and grepping the entire `src/` tree confirms nothing ever
  writes to it again. So the product above is **always exactly 0**, no matter where the
  `/control` slider sits. And in the one place this matters when a glitch is actively
  running:

  ```js
  if (glitchActive) {
    intensity = p.max(intensity, 1.0);
  }
  ```

  — the clamp makes the active-glitch case exactly `1.0` regardless of the slider too,
  since the term being clamped is always 0. **Net effect: moving the Glitch Intensity
  slider in `/control` currently has zero observable effect on the live background, in
  every state.** This isn't a crash or an error — the control simply doesn't reach
  anything that varies.

  This wasn't fixed as part of this document, because the correct fix is a design call,
  not a bug fix: wire the slider directly to `window.synthwaveConfig.glitchIntensity`
  instead of the currently-inert multiplier (simplest, restores a working dial); or
  leave it as dead UI if the fixed `intensity = 1.0` during active glitches is the
  intended "glitches are glitches, not tunable" look and the slider should be removed
  from `control.html` instead. Whoever owns the visual design should pick.

### `cameraAngle` — slider range -2.0 to 2.0, default 0.0

The name survives from the original, but what it does changed completely, because the
canvas itself changed mode: the original creates a WEBGL canvas
(`p.createCanvas(p.windowWidth, p.windowHeight, p.WEBGL)`), the current one does not
(`p.createCanvas(p.windowWidth, p.windowHeight)` — plain 2D). There's no real 3D camera
left to pitch, so the control was remapped to a 2D analogue that's visually similar in
spirit (the scene appears to pan/turn) but mechanically different:

- **Original**: `cameraAngle = (Math.PI/3) * v` — an actual rotation in radians, fed to
  `p.rotateX(...)`, physically tilting the WEBGL scene. Max ≈ ±120° at the slider's
  extremes.
- **Current**: `cameraAngleOffset = v * 150` — a pixel offset, not an angle. Max ±300px
  at the slider's extremes. Used as a horizontal shift on: the sun's X position (`× 0.5`
  parallax factor), the mountains' Perlin-noise sampling coordinate (four different
  scale factors, one per mountain layer/depth), and the road/grid vanishing point X.
  The combined effect reads as the horizon panning left/right, simulating a camera turn
  on a 2D scene rather than an actual 3D rotation.

### `flash()` — not driven by `/control` at all

Easy to assume this is one of the panel's controls; it isn't. `control.html` has no UI
element for it. It's triggered automatically, client-side, every time a chat message
lands — three call sites in `main.js`'s `onChat`, one each for system/speaker messages,
image messages, and regular chat messages (`main.js:67,80,96`). Both versions set
`glitchActive = true` as a side effect, so **every incoming chat message also kicks off
a glitch episode**, in both files equally.

- **Original**: `sunSize = 200` (absolute override, up from the fixed default 150),
  reverting after 200ms.
- **Current**: `flashSunBoost = 50` (additive, on top of a width-responsive base radius:
  `const sunRadius = p.min(p.width * 0.16, 130) + flashSunBoost`), reverting after 200ms.
  Since the base radius already scales with window width in the current version (it
  didn't in the original — original's `sunSize` was a fixed 150px regardless of screen
  size), the visible flash size now varies with viewport width too, not just with the
  boost amount.

## Quick-reference table

| `/control` input       | Original effect                  | Current effect                           | Same dial position, same result?                                                     |
| ---------------------- | -------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Glitch Probability     | frame-chance to start a glitch   | identical                                | Yes                                                                                  |
| Glitch Decay           | frame-chance to end a glitch     | identical                                | Yes                                                                                  |
| Channel Offset         | RGB-split + grid jitter range    | screen-tear slice shift, ×4 scaled       | No — same slider value, ~4× larger shift, different technique                        |
| Glitch Intensity       | broad jitter multiplier, visible | multiplies a permanently-0 config value  | No — **dead**, no visible effect at any position                                     |
| Camera Angle           | WEBGL pitch rotation (°)         | 2D horizontal pan offset (px)            | No — different axis, different units, remapped because the canvas is no longer WEBGL |
| Theme buttons          | n/a (CSS only)                   | n/a (CSS only)                           | Yes — never touches either visuals.js                                                |
| Flash (chat-triggered) | absolute sun-size override       | additive boost on responsive base radius | Similar in spirit, different math                                                    |

## Practical guidance for whoever's operating `/control` at the show

- Every slider except **Glitch Intensity** behaves roughly as labelled, just with
  different numeric scale on Channel Offset and a different axis on Camera Angle — worth
  a quick live test on the actual `/chatroom` background before the show, not just trusting
  the old muscle memory from the original panel.
- **Don't rely on Glitch Intensity** — it currently does nothing. If a stronger/weaker
  ambient distortion is wanted live, the only real lever right now is Channel Offset
  (scales the screen-tear shift) and Glitch Probability/Decay (how often and how long
  glitches run) — Intensity itself won't help until it's rewired.
- `/room` (the card game) never sees anything from `/control` — there is nothing to
  operate there.
