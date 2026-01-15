# Session Summary: Dialogue System Architecture Redesign

**Date:** 2025-12-22
**Context:** Continued from previous session - Redesigning dialogue interaction architecture

---

## Work Completed

### 1. Architecture Redesign - Three Node Types System

Redesigned the dialogue system from a rigid back-and-forth pattern to support **three distinct node types**:

1. **System Message Nodes** - Display text in chat, auto-advance after 2s
2. **Narrator Message Nodes** - Liz sends messages with 1.5s delays, auto-advances
3. **Player Choice Nodes** - Show choice buttons, wait for player selection

**Files Modified:**
- `server.js` - Added `processNode()` function (lines 260-376) to handle all node types
- `src/js/dialogueController.js` - Updated client to handle three node types
- `scripts/twee-to-json.js` - Added `nextNode` extraction for auto-advancing nodes

### 2. Twee Parser Improvements - Harlowe Formatting Support

**Problem:** Lines starting with Harlowe formatting markers (`''`, `//`, `~~`, `**`) weren't recognized as narrator messages.

**Solution:** Added cleaning of Harlowe syntax before narrator detection:
```javascript
.replace(/^''+|''+$/g, '')  // Remove italic markers
.replace(/^\/\/+|\/\/+$/g, '')  // Remove italic markers
.replace(/^~~+|~~+$/g, '')  // Remove strikethrough
.replace(/^\*\*+|\*\*+$/g, '')  // Remove bold
```

**Files Modified:** `scripts/twee-to-json.js` (lines 189-193, 251-254)

### 3. System Message Deduplication Fix

**Problem:** System messages appeared multiple times when `dialogue-sync` was sent repeatedly.

**Solution:** Track displayed messages in a Set and only show once per node:
```javascript
let displayedSystemMessages = new Set();
if (!displayedSystemMessages.has(data.currentNode)) {
    // Display system message
    displayedSystemMessages.add(data.currentNode);
}
```

**Files Modified:** `src/js/dialogueController.js` (lines 11, 163, 213, 247)

### 4. Vite Build Configuration - Auto-Copy Data Folder

**Problem:** `npm run build` didn't copy `src/data` to `dist/data`, causing old dialogue files to be used.

**Solution:** Added `vite-plugin-static-copy` to automatically copy data folder during build:
```javascript
import { viteStaticCopy } from 'vite-plugin-static-copy'

plugins: [
  viteStaticCopy({
    targets: [{ src: 'data', dest: '.' }]
  })
]
```

**Files Modified:** `vite.config.js` (lines 3, 8-17)

### 5. Comprehensive Code Review & Documentation

Created detailed technical report: `interaction.md` (908 lines)

**Contains:**
- Complete architecture breakdown
- Message flow diagrams (text-based)
- Socket event sequences with timing
- 6 identified bugs with analysis
- Priority 1/2/3 recommendations with code examples
- Testing checklist

---

## Key Technical Findings

### Node Type Processing Logic

**Server-side (`server.js:260-376`):**
1. Checks node characteristics: `hasNarratorMessages`, `hasChoices`, `hasText`
2. Routes to appropriate handler:
   - Narrator messages → Send with delays → Auto-advance or show choices
   - System messages → Send sync → Auto-advance after 2s
   - Choices → Send sync → Wait for player
   - Ending → End dialogue after 3s

**Client-side (`dialogueController.js:133-236`):**
1. Receives `dialogue-sync` event
2. Determines node type from payload
3. Displays system message (if present and not shown before)
4. Shows choices OR keeps input hidden for auto-advancing nodes

### Auto-Advancing Mechanism

**Twee Source:**
```
:: Node Name
Liz says: [[Link text->Destination]]
```

**Parser extracts:**
- `narratorMessages: ["Liz says: Link text"]`
- `nextNode: "destination"` (if no player choices)

**Server processes:**
- Sends narrator message to chat
- Waits 1.5s after last message
- Calls `processNode(room)` with updated `currentNode`

### Message Flow Timeline

```
T+0     Player clicks choice
T+1     Server broadcasts player's choice to chat (with player's username)
T+2.5   Server sends narrator message(s)
T+4     Server sends dialogue-sync with new choices (or auto-advances)
```

---

## Bugs Identified & Status

### ✅ Fixed
1. **Harlowe formatting breaking narrator detection** - Fixed with regex cleaning
2. **System message duplication** - Fixed with Set-based tracking
3. **Data folder not copying on build** - Fixed with vite plugin
4. **Back-and-forth architecture limitation** - Fixed with node type system

### 🔍 Identified in Code Review (Not Yet Fixed)
1. **System message tracking breaks on loops** - `displayedSystemMessages` Set prevents re-showing when looping back to hub nodes
2. **No reconnection state sync** - Players lose dialogue state on disconnect
3. **No timeout handling** - UI can hang if network fails during choice
4. **Fragile dual initialization** - Dialogue controller initialized in two places
5. **Deprecated `narrator-continue` handler** - Still exists but unused
6. **Missing narrator status during dialogue** - Online/offline not shown during active dialogue

### Priority 1 Recommendations (from report)
1. Clear `displayedSystemMessages` Set when returning to hub nodes
2. Add reconnection state sync with `request-dialogue-sync` event
3. Remove or document deprecated `narrator-continue` handler

---

## Current System Architecture

### Files & Responsibilities

**Server (`server.js`):**
- Dialogue state management (Map of room → state)
- Node type detection and routing
- Auto-send narrator messages with delays
- Choice validation and next-node navigation

**Client Controllers:**
- `dialogueController.js` - Main dialogue flow (player + narrator rooms)
- `dialogueSystem.js` - Dialogue data management (player room only)
- `dialogueUI.js` - Old popup-based UI (deprecated, not used)

**Data Pipeline:**
- `src/data/twine/*.twee` → `scripts/twee-to-json.js` → `src/data/dialogues/*.json` → `dist/data/dialogues/*.json` (via vite build)

**Socket Events:**
- Server emits: `dialogue-started`, `dialogue-sync`, `dialogue-end`, `chat`, `player-choice-made`
- Client emits: `dialogue-start`, `player-choice`, `request-narrator-status`

### Node Type Detection

```javascript
const hasNarratorMessages = currentNode.narratorMessages?.length > 0;
const hasChoices = currentNode.choices?.length > 0;
const hasText = currentNode.text?.trim().length > 0;

if (hasNarratorMessages) {
    // TYPE 1: Narrator message node
} else if (hasText && !hasChoices) {
    // TYPE 2: System message node
} else if (hasChoices) {
    // TYPE 3: Choice node
} else if (type === 'ending') {
    // TYPE 4: Ending node
}
```

---

## Critical Code Locations

### Auto-Advance Logic
- **Server:** `server.js:310-318` (narrator messages), `server.js:341-347` (system messages)
- **Client:** N/A - server-driven

### System Message Display
- **Server:** `server.js:335` (sends sync)
- **Client:** `dialogueController.js:163-173` (choice nodes), `dialogueController.js:213-223` (auto-advancing nodes)

### Player Choice Handling
- **Client:** `dialogueController.js:258-283` (emits player-choice)
- **Server:** `server.js:405-432` (validates, updates state, calls processNode)

### Narrator Message Auto-Send
- **Server:** `server.js:294-325` (loops through messages with delays)

---

## Data Structure Examples

### Node with Narrator Messages + Choices
```json
{
  "id": "search_engine",
  "type": "narrative",
  "text": "''Remember, you are looking for yourself...''",
  "narratorMessages": [
    "Liz says: There's a hypnotic feeling here..."
  ],
  "choices": [
    {
      "id": "choice_1",
      "text": "Central Area",
      "nextNode": "central_area"
    }
  ]
}
```

### Auto-Advancing Narrator Node
```json
{
  "id": "click_to_play",
  "type": "narrative",
  "text": "==CLICK TO PLAY==",
  "narratorMessages": ["Liz says: Two strangers meet, but"],
  "choices": [],
  "nextNode": "two_strangers_meet_but"
}
```

---

## Known Issues & Workarounds

### Issue: Player Messages Appearing as System Messages
**Status:** Likely CSS/styling issue, not logic bug
**Evidence:** Server correctly broadcasts with `username: playerUsername` (server.js:278)
**Client:** Correctly renders with username (main.js:50)
**Workaround:** Check CSS classes `.message.mine` and `.message.others`

### Issue: System Messages Don't Re-Display on Loop
**Status:** Known limitation
**Cause:** `displayedSystemMessages` Set never clears for hub nodes
**Workaround:** Manual implementation needed (see Priority 1 recommendations)

---

## Development Commands

```bash
# Convert Twee to JSON
node scripts/twee-to-json.js src/data/twine/thebodyisobsolete.twee src/data/dialogues/episode1.json

# Build (auto-copies data folder)
npm run build

# Run server
npm start
# or
node server.js
```

---

## Next Steps (User Requested)

1. **Keep findings in memory** ✓
2. **Compact conversation thread** ✓
3. **Address specific issue:** Player messages appearing as system messages
   - Review CSS styling for message classes
   - Verify client-side rendering in browser DevTools
   - Check if issue is visual (CSS) vs logical (socket events)

---

## Files Created/Modified This Session

**Created:**
- `interaction.md` - Comprehensive code review report (908 lines)
- `SESSION_SUMMARY.md` - This file

**Modified:**
- `server.js` - Node type processing system
- `src/js/dialogueController.js` - Client-side node handling
- `scripts/twee-to-json.js` - Harlowe formatting support, nextNode extraction
- `vite.config.js` - Auto-copy data folder plugin
- `src/data/dialogues/episode1.json` - Regenerated with fixes
- `package.json` / `package-lock.json` - Added vite-plugin-static-copy

**Key Line References:**
- `server.js:260-376` - processNode() function
- `server.js:275-281` - Player choice broadcast (KEY for "system message" issue)
- `dialogueController.js:11` - displayedSystemMessages Set
- `twee-to-json.js:189-193` - Harlowe cleaning
- `twee-to-json.js:310-314` - nextNode extraction