# Future Implementations

## 1. Show Current Player on Narrator Room Load

### Intention
When the narrator opens `narrator-room.html`, the `last-joined-player` element should display the username of any player who is already connected to `player-room.html`, not just players who join after the narrator connects.

Currently, `last-joined-player` only updates when a `user joined` socket event fires, which only happens when someone joins *after* the narrator is already connected.

### Current State (as of this document)
- `activeUsers` Map stores `socket.id -> username` (string only)
- `isPlayer` is sent with `user joined` event but not persisted on the server
- Narrator has no way to query existing players on page load

### Proposed Solution

#### Server Changes (server.js)

**1. Modify `activeUsers` to store objects instead of strings:**

```javascript
// Change from:
activeUsers.set(socket.id, username);

// To:
activeUsers.set(socket.id, { username, isPlayer });
```

**2. Update all references to `activeUsers.values()` throughout the file:**

Places that need updating:
- `broadcastNarratorStatus()` - line ~75
- `request-narrator-status` handler - line ~261
- `disconnect` handler - line ~643
- Any other place that reads from `activeUsers`

Example for `broadcastNarratorStatus()`:
```javascript
function broadcastNarratorStatus() {
  const isNarratorOnline = Array.from(activeUsers.values())
    .some(user => user.username === NARRATOR_USERNAME);
  io.emit("narrator-status", { online: isNarratorOnline });
}
```

**3. Add new socket event handler for requesting current player:**

```javascript
// Add after the "request-narrator-status" handler
socket.on("request-current-player", () => {
  const players = Array.from(activeUsers.values())
    .filter(user => user.isPlayer && user.username !== "Symone" && user.username !== "Liz");

  if (players.length > 0) {
    // Send the most recently joined player (last in the array)
    const lastPlayer = players[players.length - 1];
    socket.emit("current-player", { username: lastPlayer.username });
  }
});
```

#### Client Changes (src/js/main.js)

**1. Request current player when narrator room loads:**

Add after socket initialization (around line 169-176):

```javascript
// Request current player if on narrator room
if (isNarratorRoom) {
  window._socket.emit("request-current-player");
  window._socket.on("current-player", (data) => {
    if (data && data.username) {
      updateLastJoinedPlayer(data.username);
    }
  });
}
```

#### Client Changes (src/js/chatUI.js)

No changes needed - `updateLastJoinedPlayer` already handles the update correctly.

### Notes
- This implementation assumes only one player at a time matters for display
- If multiple players need to be tracked, consider returning an array and handling display logic accordingly
- The `isPlayer` flag is determined client-side based on the URL path (`player-room.html`)
- Make sure to test with:
  1. Player joins first, then narrator opens page
  2. Narrator opens page first, then player joins
  3. Player disconnects while narrator is viewing
  4. Multiple players joining/leaving

### Related Files
- `server.js` - Socket event handlers
- `src/js/main.js` - Client socket logic and room detection
- `src/js/chatUI.js` - `updateLastJoinedPlayer` function
- `src/narrator-room.html` - Contains `#last-joined-player` element

### Date Added
2026-01-18

---

## 2. Refactor User Tracking Data Structure

### Intention
Replace the current `activeUsers` Map (which stores `socket.id -> username`) with a more robust data structure that tracks all known users with their online status and role. This enables:
- Easier querying of user states (e.g., "is narrator online?", "get all online players")
- Persistent tracking of predefined users (narrator, host)
- Role-based logic without special-casing usernames everywhere

### Current State
```javascript
// Current implementation
const activeUsers = new Map();      // socket.id -> username (string)
const takenUsernames = new Set();   // usernames currently in use
```

**Problems:**
- `isPlayer` is not persisted after `user joined` event
- Checking narrator status requires iterating through all values
- No distinction between user roles
- Dynamic players are treated the same as predefined hosts

### Proposed Data Structure

```javascript
// New implementation - replace activeUsers and takenUsernames with:
const users = new Map();  // username -> { online, role, socketId }

// Initialize with predefined users
users.set("Liz", { online: false, role: "narrator", socketId: null });
users.set("Symoné", { online: false, role: "host", socketId: null });

// Dynamic users get added when they join:
// users.set("PlayerName", { online: true, role: "player", socketId: "abc123" });
// users.set("GenericUser", { online: true, role: "user", socketId: "def456" });
```

**Roles:**
| Role | Description | Room |
|------|-------------|------|
| `narrator` | Liz - controls the narrative | narrator-room |
| `host` | Symoné - room2 host | room2 |
| `player` | Interactive players | player-room |
| `user` | Generic visitors | index, room1 |

### Server Changes (server.js)

**1. Replace data structures (lines 63-65):**

```javascript
// Remove these:
// const activeUsers = new Map();
// const takenUsernames = new Set();

// Add this:
const users = new Map();
// Initialize predefined users
users.set("Liz", { online: false, role: "narrator", socketId: null });
users.set("Symoné", { online: false, role: "host", socketId: null });
```

**2. Helper functions for common queries:**

```javascript
// Check if a specific user is online
function isUserOnline(username) {
  const user = users.get(username);
  return user ? user.online : false;
}

// Get all online users with a specific role
function getOnlineUsersByRole(role) {
  return Array.from(users.entries())
    .filter(([_, data]) => data.online && data.role === role)
    .map(([username, data]) => ({ username, ...data }));
}

// Get current player (for narrator room display)
function getCurrentPlayer() {
  const players = getOnlineUsersByRole("player");
  return players.length > 0 ? players[players.length - 1] : null;
}

// Check if username is taken (online)
function isUsernameTaken(username) {
  const user = users.get(username);
  return user ? user.online : false;
}
```

**3. Update `broadcastNarratorStatus()` (line ~74):**

```javascript
function broadcastNarratorStatus() {
  const isNarratorOnline = isUserOnline("Liz");
  io.emit("narrator-status", { online: isNarratorOnline });
}
```

**4. Update `check username` handler (lines 216-219):**

```javascript
socket.on("check username", (username) => {
  const isTaken = isUsernameTaken(username);
  socket.emit("username response", isTaken);
});
```

**5. Update `user joined` handler (lines 222-257):**

```javascript
socket.on("user joined", (data) => {
  const { username, isPlayer } = data;

  // Check if username is taken
  if (isUsernameTaken(username)) {
    socket.emit("username taken");
    return;
  }

  // Determine role
  let role = "user";  // default
  if (username === "Liz") role = "narrator";
  else if (username === "Symoné") role = "host";
  else if (isPlayer) role = "player";

  // Update or add user
  users.set(username, {
    online: true,
    role: role,
    socketId: socket.id
  });

  socket.username = username;
  console.log(`User joined: ${username} (${role})`);
  console.log("Online users:", Array.from(users.entries())
    .filter(([_, d]) => d.online)
    .map(([name, d]) => `${name}(${d.role})`));

  // Rest of the handler...
  const playerRoomState = dialogueStates.get("player-room");
  const isDialogueActive = playerRoomState && playerRoomState.active;
  const isNarrator = role === "narrator";

  if (!(isDialogueActive && isNarrator)) {
    io.emit("user joined", { username, isPlayer: role === "player" });
  }

  broadcastNarratorStatus();

  if (isDialogueActive) {
    socket.emit("dialogue-sync", buildSyncPayload(playerRoomState));
  }
});
```

**6. Update `request-narrator-status` handler (lines 260-265):**

```javascript
socket.on("request-narrator-status", () => {
  socket.emit("narrator-status", { online: isUserOnline("Liz") });
});
```

**7. Add `request-current-player` handler:**

```javascript
socket.on("request-current-player", () => {
  const player = getCurrentPlayer();
  if (player) {
    socket.emit("current-player", { username: player.username });
  }
});
```

**8. Update `chat` message verification (lines 268-280):**

```javascript
socket.on("chat", (messageObj) => {
  const user = users.get(messageObj.username);
  if (
    messageObj &&
    messageObj.username &&
    messageObj.text &&
    messageObj.timestamp &&
    user && user.online && user.socketId === socket.id
  ) {
    console.log(`Message from ${messageObj.username}: ${messageObj.text}`);
    io.emit("chat", messageObj);
  }
});
```

**9. Update `disconnect` handler (lines 638-670):**

```javascript
socket.on("disconnect", () => {
  connectedUsers--;
  io.emit("user-count", connectedUsers);

  // Find user by socketId
  let disconnectedUsername = null;
  for (const [username, data] of users.entries()) {
    if (data.socketId === socket.id) {
      disconnectedUsername = username;
      break;
    }
  }

  if (disconnectedUsername) {
    const user = users.get(disconnectedUsername);
    console.log(`User left: ${disconnectedUsername} (${user.role})`);

    // Mark as offline (don't delete - keeps history for predefined users)
    users.set(disconnectedUsername, {
      ...user,
      online: false,
      socketId: null
    });

    // Optionally: Delete dynamic users entirely after some time
    // if (user.role === "player" || user.role === "user") {
    //   setTimeout(() => {
    //     const current = users.get(disconnectedUsername);
    //     if (current && !current.online) users.delete(disconnectedUsername);
    //   }, 5 * 60 * 1000);
    // }

    console.log("Online users:", Array.from(users.entries())
      .filter(([_, d]) => d.online)
      .map(([name, d]) => `${name}(${d.role})`));

    const playerRoomState = dialogueStates.get("player-room");
    const isDialogueActive = playerRoomState && playerRoomState.active;
    const isNarrator = user.role === "narrator";

    if (!(isDialogueActive && isNarrator)) {
      io.emit("user left", disconnectedUsername);
    } else {
      console.log(`Suppressing leave message for narrator during active dialogue`);
      if (playerRoomState) {
        playerRoomState.narratorLeftDuringDialogue = true;
      }
    }

    broadcastNarratorStatus();
  }
});
```

**10. Update `handleDialogueEnd` narrator check (lines 571-583):**

```javascript
if (state.narratorLeftDuringDialogue) {
  if (!isUserOnline("Liz")) {
    console.log(`Showing deferred narrator leave message after dialogue end`);
    io.emit("user left", "Liz");
  }
  state.narratorLeftDuringDialogue = false;
}
```

### Client Changes (src/js/main.js)

**1. Add listener for current player on narrator room:**

```javascript
// After socket initialization
if (isNarratorRoom) {
  window._socket.emit("request-current-player");
  window._socket.on("current-player", (data) => {
    if (data && data.username) {
      updateLastJoinedPlayer(data.username);
    }
  });
}
```

### Benefits of New Structure

1. **Simpler queries:**
   - `isUserOnline("Liz")` vs `Array.from(activeUsers.values()).includes("Liz")`

2. **Role-based logic:**
   - `getOnlineUsersByRole("player")` instead of filtering by `isPlayer` flag

3. **Predefined users persist:**
   - Narrator/host status tracked even when offline

4. **Cleaner disconnect handling:**
   - Update status instead of delete/re-add

5. **Extensible:**
   - Easy to add new roles or user metadata

### Migration Notes
- This is a breaking change to server state management
- All references to `activeUsers` and `takenUsernames` must be updated
- Client code mostly unchanged (data format in socket events stays the same)
- Test all user flows after migration

### Related Files
- `server.js` - Main changes
- `src/js/main.js` - Minor addition for narrator room
- `shared/gameParameters.js` - Consider adding role constants

### Date Added
2026-01-18
