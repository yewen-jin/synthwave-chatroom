# Refactoring Summary - 2026-01-18

## Overview

Code cleanup and refactoring to eliminate inconsistencies, redundancies, and dead code across the client and server codebase.

---

## Changes Made

### 1. Fixed Reconnect Event Format (High Priority)

**File:** `src/js/main.js`

**Problem:** Reconnect handler sent username as a string, but server expects an object.

**Before:**

```javascript
window._socket.emit("user joined", username);
```

**After:**

```javascript
window._socket.emit("user joined", { username, isPlayer });
```

---

### 2. Removed Dead Code (High Priority)

**File:** `src/js/main.js`

**Problem:** Unreachable else block with `"set username"` emit that has no server handler.

**Removed:** 15 lines of dead code. Since `username` is always `null` at startup, the else branch could never execute.

---

### 3. Fixed socket.js Module Variable

**File:** `src/js/socket.js`

**Problem:** Module-level `socket` variable was shadowed by local `const socket`, causing `getSocket()` to return `undefined`.

**Before:**

```javascript
let socket;
export function initSocket(...) {
    const socket = io(...);  // shadows module variable
    ...}
```

**After:**

```javascript
let socket;
export function initSocket(...) {
    socket = io(...);  // assigns to module variable
```

---

### 4. Created Shared Room Detection Module

**New File:** `src/js/roomDetection.js`

**Problem:** Duplicate room detection logic in `main.js` and `dialogueController.js`.

**Solution:** Created shared module:

```javascript
export const isRoom2 = window.location.pathname.includes("room2");
export const isNarratorRoom =
  window.location.pathname.includes("narrator-room");
export const isPlayerRoom =
  window.location.pathname.includes("player-room.html") ||
  window.location.pathname === "/player-room";
```

**Updated files:**

- `src/js/main.js` - Now imports from `roomDetection.js`
- `src/js/dialogueController.js` - Now imports from `roomDetection.js`

---

### 5. Extracted isNarratorOnline() Helper

**File:** `server.js`

**Problem:** Same check `Array.from(activeUsers.values()).includes(NARRATOR_USERNAME)` repeated 3 times.

**Solution:** Created helper function:

```javascript
function isNarratorOnline() {
  return Array.from(activeUsers.values()).includes(
    GameParameters.NARRATOR_USERNAME,
  );
}
```

---

### 6. Centralized Game Parameters

**File:** `server.js`

**Problem:**

- Direct import of individual constants
- Magic numbers for timing (1500, 2000, 3000, 5*60*1000)

**Solution:**

- Changed to namespace import: `import * as GameParameters from "./shared/gameParameters.js"`
- Replaced all magic numbers with constants:
  - `1500` → `GameParameters.MESSAGE_DELAY_MS`
  - `2000` → `GameParameters.SYSTEM_MESSAGE_DELAY_MS`
  - `3000` → `GameParameters.ENDING_DELAY_MS`
  - `5 * 60 * 1000` → `GameParameters.STATE_CLEANUP_MS`

---

### 7. Cleaned Up visuals.js

**File:** `src/js/visuals.js`

**Removed:**

- Unused `onMessageCallback` parameter from `initVisuals()`
- Unused `updateVisualsForTheme()` function (exported but never called)

---

### 8. Cleaned Up dialogueSystem.js

**File:** `src/js/dialogueSystem.js`

**Removed unused methods:**

- `loadDialogue(url)` - Never called; dialogue data is set via `setDialogueData()` from server sync
- `applyEffects(effects)` - Server handles all state changes
- `selectChoice(choiceId)` - Server handles choice selection

---

## Files Modified

| File                           | Changes                                                         |
| ------------------------------ | --------------------------------------------------------------- |
| `src/js/main.js`               | Fixed reconnect format, removed dead code, use roomDetection.js |
| `src/js/socket.js`             | Fixed module variable assignment                                |
| `src/js/dialogueController.js` | Use roomDetection.js                                            |
| `src/js/dialogueSystem.js`     | Removed unused methods                                          |
| `src/js/visuals.js`            | Removed unused parameter and function                           |
| `server.js`                    | Use GameParameters.\*, extract isNarratorOnline()               |

## Files Created

| File                      | Purpose                         |
| ------------------------- | ------------------------------- |
| `src/js/roomDetection.js` | Shared room detection constants |

---

## Constants in shared/gameParameters.js

```javascript
export const NARRATOR_USERNAME = "Liz";
export const HOST_USERNAME = "Symoné";
export const MESSAGE_DELAY_MS = 3500;
export const SYSTEM_MESSAGE_DELAY_MS = 2000;
export const ENDING_DELAY_MS = 3500;
export const STATE_CLEANUP_MS = 5 * 60 * 1000;
```

---

## Benefits

1. **Single source of truth** for room detection and timing constants
2. **Easier maintenance** - change timing in one place
3. **No dead code** - cleaner codebase
4. **Fixed bugs** - reconnect now works correctly
5. **`getSocket()` now works** - returns the actual socket instance
