# List of tasks to do next

### Style Edits

### Gameplay Mechanism

[] fix the game initiation mechanism. Once game finishes, do not restart, and the narrator room initiation button should not be grayed out.
[] narrator messages no longer need to pop up in narrator room, just go to the messages.
[] add a pause game option, where the narrator can pause the interaction, and add whatever texts
[] images: click to enlarge, click 'X' on top right corner to close
[] edit styling, enlarge texts, maybe remove the top status bar or move it to the side to allow more space for conversation
[] further edit conversation texts, splitting between player option that goes into chat, adding "" in the option, and options that trigger the next node without sending anything to chat (consider if/when this should happen)
[] before the game finishes, the typing should be disabled/grayed out, until the end of the game
[] ==CLICK TO PLAY== shouldn't be in the chat. Maybe in the popup window
[] could some control options, like read on, or go back, be another type of object, not in the chat option? Or should this be relfected in the writing style?

### Code Review Highlights (Feb 2026)

**Critical**
[] XSS via innerHTML — user-supplied username/text injected without sanitization in `src/js/main.js`
[] No server-side input sanitization — no message length limits, rate limiting, or HTML stripping in `server.js`
[] Arbitrary CSS class injection — `control-theme` event accepts any string as a class name (`src/js/socket.js`, `server.js`)

**Important**
[] No auth on privileged socket events (`dialogue-start`, `glitch-control`, `control-theme`) in `server.js`
[] Message delays set to 0 in `shared/gameParameters.js` — breaks narrative pacing in production
[] Stale closure state in setTimeout chains during dialogue sequences in `server.js`
[] `connectedUsers` counter can drift negative in `server.js`
[] Dialogue events broadcast to all clients via `io.emit()` instead of scoped Socket.IO rooms in `server.js`

**Suggestions**
[] Redundant `window._socket` global assignment in `socket.js` and `main.js`
[] Loose equality (`==`) in condition evaluation in `server.js` and `dialogueSystem.js`
[] Duplicated condition evaluation logic across server/client/converter — extract to `shared/`
[] Path traversal risk in `loadDialogueData` — validate `dialogueId` format in `server.js`
[] No username validation (length, format, reserved names) in `server.js`
[] `dialogueUI.js` appears unused — verify and remove if dead code
[] 404 handler returns full `index.html` — may confuse crawlers/monitoring
