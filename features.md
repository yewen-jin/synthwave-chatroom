# Interactive Dialogue Engine

## Overview

A real-time, socket-based interactive narrative engine that delivers branching Twine/Twee stories through a chatroom interface. The narrator (Liz) and players occupy separate rooms — the narrator triggers the story, and the server orchestrates message delivery, variable tracking, and player choices in real time.

The system converts authored Twine stories (Harlowe format) into a custom JSON dialogue format, then plays them back through the chat UI with timed message sequences, inline player choices, and dynamic variable interpolation.

---

## Twee-to-JSON Conversion Script

**`scripts/twee-to-json.js`**

Converts `.twee` files (Harlowe format) into the engine's JSON dialogue format.

### Harlowe Macro Support

| Macro | Purpose |
|---|---|
| `(set: $var to value)` | Variable declarations and mutations |
| `(set: $var to $var + N)` | Increment effects attached to choices |
| `(if: $var >= N)[...]` | Conditional blocks and redirects |
| `(if: ...)[...](else:)[...]` | Conditional choice branching |
| `(link: "text")[(set:...)(goto:...)]` | Choices with inline effects and destinations |
| `(print: $var)` | Variable interpolation, converted to `${var}` |
| `(nth: $var, ...)` | Ordinal selection based on variable value |

### Passage Parsing

Each Twee passage becomes a JSON node. The converter processes passage content line-by-line and classifies each line:

- **Narrator messages** — Lines starting with `Liz says:` or `Liz:`. Extracted as `type: "narrator"` messages. Inline `[[links]]` are cleaned to display text only.
- **Player dialogue** — Lines starting with `You say:` or `You whisper:`. The text after the prefix is sent to the chat as a player message. These lines define choices whose `text` property carries the chat message.
- **Silent choices** — Lines starting with `You say nothing:`. These progress the story without sending anything to chat. The display text is derived from what follows the prefix; `text` is set to `null`.
- **Third-party speakers** — Lines matching `XXX says:` or `XXX say:` where XXX is not "You" or "Liz". These are tagged with a `speaker` property for distinct styling. Speaker-only title lines (no content after the colon) are merged with the following body text into a single block — this keeps poems and monologues as cohesive units.
- **System messages** — All remaining plain text lines. Consecutive system lines are merged into a single message joined with `<br>` tags, preventing poems and multi-line passages from appearing as fragmented individual messages.
- **Images** — `<img src="...">` HTML tags are detected before HTML stripping and converted to `type: "image"` messages.
- **`<<display text>>` markers** — Inside link syntax like `[[<<text>>->dest]]`, the content between `<<>>` becomes `displayText` only; nothing is sent to chat.

### Choice Architecture

Each choice object contains:

```json
{
  "id": "node_choice_1",
  "text": "What the player sends to chat (null for silent choices)",
  "displayText": "What appears on the choice button",
  "nextNode": "destination_node_id",
  "effects": { "clicks": "+1" },
  "conditions": { "variable": "clicks", "operator": ">=", "value": 3 }
}
```

- `text` vs `displayText` separation allows button labels to differ from chat messages
- `effects` mutate variables when a choice is selected
- `conditions` control choice visibility based on variable state

### Inline Formatting

The converter transforms Harlowe markup to HTML:

| Markup | Output |
|---|---|
| `//text//` | `<em>text</em>` |
| `''text''` | `<strong>text</strong>` |
| `**text**` | `<strong>text</strong>` |
| `*text*` | `<em>text</em>` |

### Variable System

- Variables are auto-discovered from `$var` references in the source
- Stored in the JSON `variables` object with default values
- The server computes derived variables at runtime (e.g. `ordinal` from `clicks`: 1 = "first", 2 = "second", 3 = "third")
- Variables reset to defaults when the game ends or the player returns to the start node

### Usage

```bash
node scripts/twee-to-json.js <input.twee> [output.json]
```

---

## Server-Side Dialogue Engine

**`server.js`**

### Two-Room Architecture

- **Player room** (`player-room`) — Where the interactive story plays out. Players see messages, images, and choice buttons.
- **Narrator room** (`narrator-room`) — Where the narrator triggers and monitors the dialogue. The server auto-sends responses; the narrator sees a monitoring popup.

### Message Sequence Processing

Each node's `messageSequence` is an ordered array of typed messages:

| Type | Behavior |
|---|---|
| `system` | Displayed as a centered system message (or left-aligned if tagged with `speaker`) |
| `narrator` | Displayed as a chat message from the narrator |
| `image` | Displayed as an inline image |
| `pause` | Adds a timed delay between messages |

Messages are sent with configurable delays (`MESSAGE_DELAY_MS`, `SYSTEM_MESSAGE_DELAY_MS`) to simulate natural pacing.

### Node Processing Flow

1. Check node-level conditions for redirects
2. If the player made a choice, broadcast it to chat
3. Process the message sequence with timed delays
4. After the last message: if the node has choices, sync them to the client; if no choices, auto-advance to the next node
5. Ending nodes trigger `handleDialogueEnd` after a delay

### Variable Management

- Variables are initialized from the dialogue JSON on start
- Choice effects are applied via `applyEffects()` (supports `+N`, `-N`, and direct assignment)
- Conditions are evaluated with `evaluateCondition()` (supports `>=`, `<=`, `>`, `<`, `==`, `!=`)
- Derived variables (e.g. `ordinal`) are computed at interpolation time
- Variables reset to defaults on dialogue end and when returning to the start node

---

## Client-Side Dialogue System

### Files

| File | Role |
|---|---|
| `src/js/dialogueSystem.js` | Core dialogue state: current node, variables, condition evaluation, choice filtering |
| `src/js/dialogueController.js` | Socket event handling, UI state management, choice rendering |
| `src/js/dialogueUI.js` | DOM rendering for dialogue popup and choice buttons |
| `src/js/chatUI.js` | Chat area utilities: message appending, scroll management, username display |
| `src/js/main.js` | Chat message handler — routes system, narrator, image, and speaker messages to appropriate rendering |

### Player Flow

1. `dialogue-started` event — show "typing..." status
2. `dialogue-sync` event — receive node data and render:
   - **Choice nodes**: hide normal input, show choice buttons inline
   - **Auto-advancing nodes**: hide all input, show typing status while narrator messages arrive
   - **System messages**: displayed once per node (tracked via `displayedSystemMessages` Set)
3. Player clicks a choice button — choice is sent to server, buttons are disabled, typing status shown
4. `dialogue-end` event — restore normal chat input, reset dialogue system variables, clear message tracking

### Auto-Scroll

The chat area scrolls to the bottom on every new message. Images trigger a second scroll after loading to account for layout shift.

---

## Message Styling

### Chat Messages

```
.message            — Base: block display, themed background, themed text color
.message.mine       — Player's own messages: float right, right-aligned, right border accent
.message.others     — Other users' messages: float left, left-aligned, left border accent
```

Desktop breakpoint (`min-width: 769px`) increases font size and spacing for readability.

### System Messages

```
.system-message-inline  — Centered, italic, full-width, themed background
                          Used for stage directions, scene descriptions, poems
```

### Third-Party Speaker Messages

```
.speaker-message        — Left-aligned (like narrator messages), inherits system background
                          Applied when a message has a `speaker` property
                          data-speaker attribute enables per-speaker CSS targeting:
                          [data-speaker="SSSS_98"] { ... }
                          [data-speaker="The Email"] { ... }
                          [data-speaker="The Code"] { ... }
```

Speaker messages with content after "says:" appear as individual messages (dialogue lines). Speaker title-only lines (e.g. "The Evil Eye says:") are merged with the following text block into a single message — keeping poems and monologues visually cohesive.

### Image Messages

```
.image-message      — Centered, transparent background, responsive max-width
```
