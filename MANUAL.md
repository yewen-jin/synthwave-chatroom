# The B0dy_is_0bs0let3 — Artist's Manual

A plain-language guide for Symone on how this system works, how to run it, and how to use it during a performance.

---

## What Is This?

This is a custom chatroom and interactive story engine built specifically for *The Body is Obsolete*. It lets you deliver a branching, timed narrative through what looks like a retro MSN Messenger chat window. The audience participates by making choices that affect how the story unfolds.

The system has two sides:

- **The narrator side (Liz)** — where you, the performer, trigger and control the story
- **The player side** — what the audience sees and interacts with

Both sides are connected in real time. When Liz triggers the story, messages appear on screen automatically, timed to feel like a real conversation. When the audience clicks a choice, the story branches, and the narrative continues.

### Working with another developer

If you ever need to bring in a different developer, this project is straightforward to hand off. It uses common, well-documented tools — Node.js for the server, Socket.io for real-time messaging, and Vite to bundle the frontend. Any web developer with a year or two of experience will recognise all of them immediately; none of this is obscure or bespoke. The code is organized into clearly named files (the server logic lives in `server.js`, the story-to-JSON converter in `scripts/twee-to-json.js`, and so on), and this manual plus the `features.md` file in the project folder explain how the pieces fit together. The entire project lives on GitHub, so a new developer can clone it, run `npm install`, and have a working local copy in a few minutes. The deployment is also simple — Render reads straight from GitHub, so there are no special build servers or complicated pipelines to inherit. In short: any competent freelance web developer could read through the project in an afternoon and continue work on it without needing a handover call.

---

## Pages and Where to Go

The server serves different pages at different URLs. Here is what each one does:

| URL | Who Uses It | What It Is |
|---|---|---|
| `/` | Anyone | The landing/index page |
| `/player-room` | **The audience** | The main interactive chat experience |
| `/narrator-room` | **You (Liz)** | Your control panel — triggers the story, shows status |
| `/control` | Tech/backstage | A glitch and theme control panel for live visual tweaks |
| `/room1` | Alt room | A secondary chat room (not story-driven) |
| `/room2` | Alt room | Another secondary chat room |
| `/docs` | Reference | Documentation page |

**For a performance:** The audience goes to `/player-room`. You go to `/narrator-room`. If someone is running visuals live, they can open `/control` to adjust glitch effects.

---

## How a Performance Works, Step by Step

### Before You Start

1. The server needs to be running (see the Deployment section below).
2. Open `/narrator-room` in your browser. When prompted, confirm you are "Liz." This logs you in as the narrator.
3. The audience opens `/player-room`. They enter a username when they arrive.

### Triggering the Story

In your narrator room, you will see a button labeled **"Initiate Transmission"**. Clicking this starts the story. The server loads the dialogue script and begins delivering messages to the player room automatically.

Once the story is running:

- Messages appear in the player room timed to feel natural. Short messages appear quickly; longer ones take a bit longer (the system scales timing based on character count).
- When the story reaches a choice point, the audience sees buttons to click instead of a text input.
- When the audience picks a choice, their response appears in the chat and the story continues.

### During the Story

Two extra buttons appear in your narrator room once the story is active:

- **Restart** — Resets the story back to the beginning (variables reset, messages clear, story starts over).
- **End** — Stops the story early, immediately returning the chatroom to normal.

You also have a **Narrator Response popup** that appears on your screen showing what the player just chose and where the story currently is. You don't need to type anything — the system handles sending all of Liz's lines automatically.

### After the Story Ends

When the story reaches its ending node, the system automatically closes the story. The audience's chat input returns to normal. Variables are reset for the next run.

---

## The Narrator Room — What You See

When you join as Liz, you see a chat interface that mirrors the player room. You have:

- **The chat area** — shows the same messages the audience sees
- **"Initiate Transmission" button** — starts the story (disabled when a story is already running)
- **Restart / End buttons** — appear during an active story
- **Narrator Response popup** — a small overlay showing what node the story is at and what the player just chose

Your chat input is also available — you can type and send messages to the room as Liz, separate from the scripted dialogue.

---

## The Control Panel (`/control`)

This is a technical page intended for a backstage operator or for your own use during performance. It lets you control visual effects across the chatroom in real time.

### Theme Controls

Four color palette buttons change the visual theme of everyone's chatroom simultaneously:

- **Default** — the original green terminal aesthetic
- **Purple** — a pink/purple synthwave palette
- **Blue** — a cyan/teal palette
- **Green** — the same as default (green neon)

Clicking a theme button updates the look for all connected users instantly.

### Glitch Controls

Sliders that let you adjust the real-time glitch visual effect:

| Control | What It Does |
|---|---|
| **Glitch Probability** | How often the glitch effect fires (0 = never, 1 = constantly) |
| **Glitch Decay Rate** | How quickly the glitch fades out (lower = lingers longer) |
| **Channel Offset Range** | How far the RGB color channels split during a glitch (higher = more extreme) |
| **Glitch Intensity** | Overall strength of the effect |
| **Camera Angle** | Tilts the canvas (can be used for dramatic effect) |

All slider changes broadcast instantly to everyone viewing the chatroom.

---

## The Story Script — How It Works

The story lives in a file called `thebodyisobsolete.json` inside `public/data/dialogues/`. The server reads this file when a story is triggered and plays it back.

The JSON is converted from a Twine story file (`.twee`) using a custom script. You author or edit the story in Twine, export it as a `.twee` file, run the converter, and the new JSON is what gets played.

---

## Running the Twine-to-JSON Converter

If you need to update the story (new lines, new branches, new choices), the workflow is:

### 1. Edit in Twine

Write or edit your story in Twine using the Harlowe format. Export it as a `.twee` file. The current source file lives at:

```
scripts/thebodyisobsoleteFV.twee
```

### 2. Run the Converter

Open a terminal in the project folder and run:

```bash
node scripts/twee-to-json.js <your-file.twee> <output-name.json>
```

**Example:**

```bash
node scripts/twee-to-json.js scripts/thebodyisobsoleteFV.twee public/data/dialogues/thebodyisobsolete.json
```

This reads the `.twee` file and writes a new `.json` into the dialogues folder. The server will use this new JSON the next time a story is triggered.

**If you don't specify an output name**, the converter will write a `.json` file with the same name as the input, in the same location:

```bash
node scripts/twee-to-json.js scripts/mystory.twee
# → writes scripts/mystory.json
```

Make sure the output ends up in `public/data/dialogues/` with the correct name so the server can find it.

### What the Converter Understands

The converter reads standard Harlowe Twine syntax. Some things it specifically handles:

- **`Liz says: ...`** — Liz's spoken lines (appear as narrator chat messages)
- **`You say: ...`** — The player's choice text (appears in the chat as the player's message)
- **`You say nothing: ...`** — A silent choice (progresses story without player saying anything)
- **`XXX says: ...`** — A third-party speaker (styled differently in chat)
- **`<img src="...">` tags** — Inline images displayed in the chat
- **Plain text** — Stage directions, prose, or system messages (displayed centered, italic)
- **Twine variables** like `$clicks` — Tracked by the server and used to change story direction
- **Twine conditionals** like `(if: $clicks >= 2)` — Used to show/hide choices or redirect

---

## Deployment — How It's Running Now

The app is deployed in two places:

### 1. VPS — Primary Live URL

```
https://chat.datadadaist.space
```

This is the main production deployment, running on a rented Virtual Private Server (VPS). A VPS is essentially a small computer in a data centre that runs the server continuously — it does not sleep, does not cold-start, and is always available the moment someone visits the link. The domain `chat.datadadaist.space` points to this server. This is the URL to share for performances and public access.

Deploying an update to the VPS requires SSH access to the server (a way to log in to the remote machine from a terminal), pulling the latest code from GitHub, rebuilding the frontend, and restarting the server process. A developer handling this will know how to do it; it is a standard workflow.

### 2. Render — Backup / Staging URL

```
https://void-space-chatroom.onrender.com
```

Render is a cloud hosting service also connected to the GitHub repository. It is useful as a backup or for testing changes before they go to the main VPS. On the free tier, Render sleeps after a period of inactivity, which means the first visit after a quiet period can take 30–60 seconds to load. It is not recommended as the primary performance URL for this reason.

### How Deploying an Update Works

Regardless of which deployment is being updated, the process starts the same way:

1. Changes are made to the code locally
2. The frontend is built with `npm run build` (this compiles all the JavaScript and HTML into a `dist/` folder)
3. The `dist/` folder is committed and pushed to GitHub
4. On Render: it picks up the change automatically and redeploys
5. On the VPS: a developer logs in and runs a pull + restart manually

The server itself runs with:
```bash
npm start
```
Which runs `NODE_ENV=production node server.js`.

---

## Running It Locally (For Development or Testing)

If you or a developer want to run it on a personal computer:

### Requirements

- Node.js version 18 or higher
- npm (comes with Node)

### Steps

```bash
# 1. Install dependencies (only needed once)
npm install

# 2. Start the development server
npm run dev

# 3. Open the chatroom in a browser
# → http://localhost:3000/player-room   (audience view)
# → http://localhost:3000/narrator-room (your view)
# → http://localhost:3000/control       (visual controls)
```

For development, you can also run the Vite frontend server separately if you're actively editing frontend code:

```bash
npm run vite:dev
```

This runs on `http://localhost:5173`.

---

## Future Deployment Options

The app can be moved to other hosting platforms without much change. Here are the realistic options:

### Render (Current — Recommended to Stay)
- Free tier available, auto-deploys from GitHub
- The free tier sleeps after inactivity (slow cold start)
- Upgrading to a paid plan keeps it always-on and faster

### Railway
- Similar to Render, also auto-deploys from GitHub
- Slightly more generous free tier, faster cold starts
- Easy to migrate: connect GitHub repo, set `npm start` as the start command

### Fly.io
- More technical to set up but more control
- Good for persistent, always-on deployments
- Requires a `Dockerfile` or configuration file

### A Personal/Rented Server (VPS)
- Services like DigitalOcean, Linode, or Hetzner
- You rent a Linux server, install Node, and run the app yourself
- Most control, lowest ongoing cost at scale, but requires more technical knowledge to set up

### Self-Hosted (Performance Laptop)
- For a gallery or performance setting with a local network, the server can run on your laptop
- Audience devices on the same wifi network connect to your laptop's local IP address
- No internet required — fully self-contained

---

## Quick Reference

| Thing | How |
|---|---|
| Start the story | Open `/narrator-room`, click "Initiate Transmission" |
| Restart mid-story | Click "Restart" button (appears during active story) |
| End the story early | Click "End" button |
| Change visual theme | Open `/control`, click a theme button |
| Adjust glitch effects | Open `/control`, move the sliders |
| Convert a new Twine story | `node scripts/twee-to-json.js <input.twee> <output.json>` |
| Run locally | `npm run dev`, then open `http://localhost:3000` |
| Check if server is live | Visit `https://void-space-chatroom.onrender.com` |
