# Dialogue System Code Review Log

---

## FIXED IN THIS PASS

### Reverted (false-fix from earlier session)
- Removed `game-status` broadcast on dialogue start (server.js)
- Removed `game-status` broadcast on dialogue end (server.js)
- Removed `dialogue-started` listener in narrator room (dialogueController.js)

### Bugs Fixed

| Bug | What | File |
|-----|------|------|
| #1 | `player-choice-made` handler now uses correct fields (`currentNode`, `isEnding`) instead of non-existent `playerChoice`/`narratorResponse` | dialogueController.js:160-178 |
| #2 | `buildSyncPayload` no longer sends full 3000-line JSON on every sync — only on first sync and late joins | server.js:156-168, 453-455, 522-525, 303, 606 |
| #3 | `evaluateCondition` defaults missing variables to `0` (matching client behavior) | server.js:233 |
| #4 | `isActive` scoped locally per init function instead of shared module-level | dialogueController.js:84, 209 |
| #5 | Server rejects `dialogue-start` if game already active (prevents orphaned timers) | server.js:354-359 |
| #7 | `player-choice-made` only emits on actual player choices, not every auto-advance | server.js:498-512 |
| #8 | Removed ~130 lines of dead legacy node format code (TYPE 1-4) | server.js |

### Also cleaned up
- Deleted unused `dialogueUI.js`
- Removed unused `isHostOnline()` function
- Removed unused `isHost` variable in `user joined`
- Removed deprecated no-op `narrator-continue` handler

---

## POST-FIX DIAGNOSIS

### Flow 1: Game Start (Narrator initiates)

| Step | Location | What happens | Status |
|------|----------|-------------|--------|
| 1 | dialogueController.js:122 | Narrator clicks trigger → emits `dialogue-start`, disables button, shows control btns | OK |
| 2 | server.js:354-358 | Server checks `existingState.active` guard → prevents double-start | OK (Bug 5) |
| 3 | server.js:364 | Emits `dialogue-started` to all → player shows typing indicator | OK |
| 4 | server.js:366 | `startDialogue()` loads JSON, creates state with `dialogueDataSynced: false` | OK |
| 5 | server.js:370 | `processNode("player-room")` — no playerUsername | OK |
| 6 | server.js:499 | `playerUsername` is null → NO `player-choice-made` emitted | OK (Bug 7) |
| 7 | server.js:515-517 | Node has messageSequence → `handleMessageSequence()` | OK |
| 8 | server.js:453-455 | First sync: `dialogueDataSynced=false` → includes full dialogueData | OK (Bug 2) |
| 9 | dialogueController.js:255-256 | Client: `dialogueSystem.dialogueData` is null → sets it from payload | OK |
| 10 | dialogueController.js:264-318 | Renders choice buttons, clears typing status | OK |

### Flow 2: Player Makes Choice

| Step | Location | What happens | Status |
|------|----------|-------------|--------|
| 1 | dialogueController.js:408-439 | `handlePlayerChoice` → typing indicator, hides choices, emits `player-choice` | OK |
| 2 | server.js:566-593 | Validates choice, applies effects, sets nextNode, calls processNode | OK |
| 3 | server.js:499-511 | `playerUsername` set → emits `player-choice-made` with `{currentNode, isEnding}` | OK (Bug 7) |
| 4 | dialogueController.js:160-178 | Narrator popup shows `"Node: xyz"` or `"Ending: xyz"` | OK (Bug 1) |
| 5 | server.js:453-455 | Subsequent sync: `dialogueDataSynced=true` → no dialogueData in payload | OK (Bug 2) |
| 6 | dialogueController.js:255 | Client already has dialogueData → skips | OK |

### Flow 3: Late Joiner

| Step | Location | What happens | Status |
|------|----------|-------------|--------|
| 1 | server.js:301-303 | `user joined` during active game → `buildSyncPayload(state, true)` | OK |
| 2 | dialogueController.js:255-256 | New client's dialogueData is null → sets from full payload | OK |

### Flow 4: Dialogue Restart

| Step | Location | What happens | Status |
|------|----------|-------------|--------|
| 1 | server.js:602-609 | Clears timers, resets node/variables, `dialogueDataSynced = false` | OK |
| 2 | server.js:608-609 | Emits `dialogue-restart`, calls `processNode` | OK |
| 3 | dialogueController.js:372-380 | Client: clears displayedMessages, resets system, hides choices | OK |
| 4 | — | Next sync includes dialogueData again (needed if client cleared it) | OK |

### Flow 5: Dialogue End

| Step | Location | What happens | Status |
|------|----------|-------------|--------|
| 1 | server.js:537-563 | `state.active = false`, emits `dialogue-end`, schedules cleanup | OK |
| 2 | dialogueController.js:194-204 | Narrator: resets buttons, hides control btns, `isActive = false` | OK |
| 3 | dialogueController.js:383-405 | Player: shows input, resets dialogue system (nulls dialogueData), clears messages | OK |
| 4 | — | New game after end: `dialogueDataSynced = false` in fresh state, client needs data again | OK |

### Flow 6: isActive scoping

| Room | Variable | Scope | Status |
|------|----------|-------|--------|
| Narrator | `isActive` | Local to `initNarratorRoom` closure | OK (Bug 4) |
| Player | `isActive` | Local to `initPlayerRoom` closure | OK (Bug 4) |

### Flow 7: evaluateCondition edge cases

| Scenario | Before fix | After fix | Status |
|----------|-----------|----------|--------|
| `progress` undefined, condition `>= 3` | `undefined >= 3` → false | `0 >= 3` → false | OK (Bug 3) |
| `progress` undefined, condition `== 0` | `undefined == 0` → false (wrong!) | `0 == 0` → true | Fixed |
| `progress` undefined, condition `< 1` | `undefined < 1` → false (wrong!) | `0 < 1` → true | Fixed |

### Flow 8: No-messageSequence fallback

| Scenario | What happens | Status |
|----------|-------------|--------|
| Node has choices but no messageSequence | Sends sync with choices (includes dialogueData if first) | OK |
| Node is ending with no messageSequence | Calls `handleDialogueEnd` directly | OK |
| Node has nextNode but no messageSequence | Auto-advances to next node | OK |
| Node has nothing | Logs warning | OK |

### Minor observations (no fix needed)

1. **Dead `hasNarratorMessages` check in player room** — dialogueController.js:268-270 references legacy `narratorMessages` field. Always false. Harmless — typing status is handled by `dialogue-started` event and cleared when choices arrive.
2. **`displayedSystemMessages` remains module-level** — unlike `isActive` which is now scoped, this Set is still module-level. Not a bug (rooms are mutually exclusive).

---

## NOT FIXED — Errors

### #6 — Recursive `processNode` with no depth limit
**File:** `server.js` — `processNode()` condition redirect logic
**Risk:** If dialogue JSON has circular node-level conditions (node A redirects to B, B redirects back to A), this causes infinite recursion and crashes the server.
**Fix:** Add a `depth` parameter with a max (e.g. 20), bail with a warning if exceeded.

---

## NOT FIXED — Redundancies

### #9 — Duplicate button state logic in narrator room
**File:** `dialogueController.js` — `initNarratorRoom()`
The same "set buttons to game-active" / "set buttons to game-inactive" pattern is repeated across `game-status` handler, trigger click handler, and `dialogue-end` handler. Could be extracted into `setNarratorButtons(active)` helper.

### #10 — `dialogue-end` + `game-status` double-handling on end
Currently `dialogue-end` alone handles end state. If `game-status` broadcast on end is ever re-added, both handlers would fire and redundantly set the same state. Keep aware if adding server-side `game-status` broadcasts.

### #16 — Client re-queries DOM elements already in scope
**File:** `dialogueController.js` — `handlePlayerChoice()`
Re-fetches `narratorStatusEl`, `choicesInlineContainer`, `normalInputContainer`, `sendBtn` via `getElementById` even though they're captured in `initPlayerRoom`. Could pass them via closure.

### #17 — Duplicate condition evaluation logic (server vs client)
`evaluateCondition` in `server.js` and `evaluateConditions` in `dialogueSystem.js` implement the same logic with slight differences (server has `===`, client has legacy string format). Could share a single implementation via the `shared/` module.

---

## NOT FIXED — Inefficiencies

### #18 — `isNarratorOnline()` iterates all users on every call
**File:** `server.js`
`Array.from(activeUsers.values()).includes(...)` is O(n) on every join, disconnect, and status request. A boolean flag updated on narrator join/leave would be O(1).

### #20 — `io.emit` broadcasts to ALL sockets, not just relevant rooms
**File:** `server.js` — all dialogue events
Every `dialogue-sync`, `dialogue-end`, `game-status`, `player-choice-made`, and `chat` event goes to every connected client (room1, room2, control, player-room, narrator-room). Socket.IO room support (`socket.join()` / `io.to().emit()`) would limit traffic to relevant clients.

### #21 — Dialogue JSON loaded from disk on every game start
**File:** `server.js` — `startDialogue()` → `loadDialogueData()`
Every narrator start reads and parses the JSON from disk. Could cache in memory after first load and invalidate only on server restart.

### #22 — `computeDerivedVariables` creates a new object on every interpolation
**File:** `server.js`
`{ ...variables }` spread on every `interpolateText` call. Could compute derived vars once when variables change instead of per-message.

### #23 — Timer IDs accumulate in `pendingTimers`
**File:** `server.js`
Completed timer IDs are never removed. Array grows for the duration of a dialogue. `clearPendingTimers` calls `clearTimeout` on already-fired IDs (harmless but wasteful). Could self-clean with a post-fire splice or use a Set.
