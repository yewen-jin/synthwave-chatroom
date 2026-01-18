# Message Sequence System - Implementation Plan

## Overview
This document outlines the implementation of a flexible message sequencing system for the Void Space Chatroom dialogue engine. The new system allows for interleaved system messages, narrator messages, and images within a single node.

## Problem Statement
The current dialogue system has three separate fields:
- `text` - Displayed in a special area (player's choice text or system text)
- `narratorMessages` - Array of messages sent as narrator
- `choices` - Player choices

**Limitation:** You cannot have system messages appear in the chat flow, or interleave system messages with narrator messages, or insert images into the conversation.

## Solution: Message Sequence Array

### New Data Structure

Each dialogue node can now have a `messageSequence` field - an ordered array of message objects that define exactly what appears in the chat and in what order.

#### Message Types

1. **System Message** - Text that appears in chat (not from player/narrator)
   ```json
   {
     "type": "system",
     "content": "The Email says: Where are you?"
   }
   ```

2. **Narrator Message** - Messages from Liz/narrator
   ```json
   {
     "type": "narrator",
     "content": "Liz says: Was that message for you?"
   }
   ```

3. **Image** - Images displayed in chat
   ```json
   {
     "type": "image",
     "url": "https://i.postimg.cc/example.gif",
     "alt": "Description of image"
   }
   ```

4. **Pause** (Optional) - Add extra delay
   ```json
   {
     "type": "pause",
     "duration": 2000
   }
   ```

### Example Node Structure

#### Before (Old Format)
```json
{
  "nodeId": {
    "id": "nodeId",
    "type": "narrative",
    "text": "The Email says: Where are you?",
    "narratorMessages": ["Liz says: Was that message for you?"],
    "choices": [...]
  }
}
```

#### After (New Format)
```json
{
  "nodeId": {
    "id": "nodeId",
    "type": "narrative",
    "messageSequence": [
      {
        "type": "system",
        "content": "The Email says: Where are you?\n\nThe Email says: Are you at the cafe?"
      },
      {
        "type": "system",
        "content": "== The Email leaves the chat =="
      },
      {
        "type": "narrator",
        "content": "Liz says: Was that message for you or someone you know?"
      }
    ],
    "choices": [...]
  }
}
```

## Implementation Details

### Phase 1: Server-Side Changes

**File:** `server.js`

#### 1.1 Add New Helper Function
```javascript
function handleMessageSequence(room, node, playerUsername) {
    const state = dialogueStates.get(room);
    const sequence = node.messageSequence;

    let delay = playerUsername ? 1500 : 0; // Wait after player choice

    sequence.forEach((message, index) => {
        setTimeout(() => {
            switch (message.type) {
                case 'system':
                    io.emit('chat', {
                        text: message.content,
                        username: 'SYSTEM',
                        timestamp: Date.now(),
                        isSystem: true
                    });
                    break;

                case 'narrator':
                    io.emit('chat', {
                        text: message.content,
                        username: NARRATOR_USERNAME,
                        timestamp: Date.now()
                    });
                    break;

                case 'image':
                    io.emit('chat', {
                        imageUrl: message.url,
                        imageAlt: message.alt || '',
                        username: 'SYSTEM',
                        timestamp: Date.now(),
                        isImage: true
                    });
                    break;

                case 'pause':
                    // Just a timing mechanism, no action needed
                    break;
            }

            // After last message in sequence
            if (index === sequence.length - 1) {
                const hasChoices = node.choices && node.choices.length > 0;

                if (!hasChoices) {
                    // Auto-advance to next node
                    setTimeout(() => {
                        if (node.type === 'ending') {
                            handleDialogueEnd(room, state);
                        } else if (node.nextNode) {
                            state.currentNode = node.nextNode;
                            processNode(room);
                        }
                    }, 1500);
                } else {
                    // Show choices to player
                    io.emit('dialogue-sync', buildSyncPayload(state));
                }
            }
        }, delay + (index * 1500)); // 1.5s delay between each message
    });
}
```

#### 1.2 Modify processNode Function
```javascript
function processNode(room, playerUsername = null, choiceText = null) {
    const state = dialogueStates.get(room);
    if (!state || !state.active) return;

    const currentNode = state.dialogueData.nodes[state.currentNode];

    // If player made a choice, broadcast it first
    if (playerUsername && choiceText) {
        io.emit('chat', {
            text: choiceText,
            username: playerUsername,
            timestamp: Date.now()
        });
    }

    // NEW: Check if node uses messageSequence (NEW FORMAT)
    if (currentNode.messageSequence && currentNode.messageSequence.length > 0) {
        handleMessageSequence(room, currentNode, playerUsername);
        return;
    }

    // OLD: Legacy handling for nodes without messageSequence
    // ... existing code for narratorMessages, text, etc.
}
```

### Phase 2: Client-Side Changes

**File:** `src/js/dialogueController.js`

#### 2.1 Update Chat Message Handler
```javascript
socket.on('chat', (messageObj) => {
    const chatBody = document.getElementById('chatBody');
    if (!chatBody) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';

    if (messageObj.isSystem) {
        // System message
        messageDiv.classList.add('system');
        messageDiv.textContent = messageObj.text;
    } else if (messageObj.isImage) {
        // Image message
        messageDiv.classList.add('image');
        const img = document.createElement('img');
        img.src = messageObj.imageUrl;
        img.alt = messageObj.imageAlt;
        img.loading = 'lazy';
        messageDiv.appendChild(img);
    } else {
        // Regular message (player or narrator)
        messageDiv.innerHTML = `<strong>${messageObj.username}:</strong> ${messageObj.text}`;
    }

    chatBody.appendChild(messageDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
});
```

**File:** `src/css/player-room.css` (or appropriate stylesheet)

#### 2.2 Add CSS Styles
```css
/* System messages in chat */
.message.system {
    background: rgba(100, 255, 200, 0.1);
    border-left: 3px solid #64ffc8;
    padding: 12px 16px;
    margin: 8px 0;
    font-style: italic;
    text-align: center;
    color: #64ffc8;
}

/* Images in chat */
.message.image {
    text-align: center;
    background: transparent;
    padding: 16px 0;
    margin: 12px 0;
}

.message.image img {
    max-width: 100%;
    max-height: 400px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
```

### Phase 3: Data Migration

#### Backward Compatibility
The system maintains backward compatibility:
- If a node has `messageSequence`, it uses the new system
- If a node has old `text`/`narratorMessages` fields, it uses the legacy system
- Both can coexist during migration

#### Migration Strategy
1. Start with high-priority nodes that need mixed content
2. Gradually convert nodes one-by-one
3. Test thoroughly with mixed old/new format
4. Eventually deprecate old format

## Twine to JSON Conversion Rules

### Rule 1: Identify Content Types
- Lines starting with "Liz says:" → narrator message
- Lines starting with "You say:" → player choice text
- Italicized text `//...//` → system message (usually narrator instructions)
- `<img>` tags → image messages
- Plain text → system message

### Rule 2: Extract Images
```twee
<img src="https://i.postimg.cc/example.gif">
```
Becomes:
```json
{
  "type": "image",
  "url": "https://i.postimg.cc/example.gif",
  "alt": "Dialogue image"
}
```

### Rule 3: Handle Choice Links
```twee
You say: [[in the future->THREAD COMMENT SECTION]]
```
Becomes:
```json
{
  "id": "choice_id",
  "text": "in the future",
  "nextNode": "thread_comment_section"
}
```

### Rule 4: Auto-advancing Nodes
Nodes without choices that link to another passage use `nextNode`:
```twee
:: Node Name
Some content
[[Next Node]]
```
Becomes:
```json
{
  "messageSequence": [...],
  "nextNode": "next_node",
  "choices": []
}
```

## Testing Plan

### Unit Tests
1. Test messageSequence with only system messages
2. Test messageSequence with only narrator messages
3. Test messageSequence with mixed system and narrator
4. Test messageSequence with images
5. Test backward compatibility with old format nodes

### Integration Tests
1. Test dialogue flow with new format nodes
2. Test auto-advancing with messageSequence
3. Test choice display after messageSequence
4. Test image loading and display
5. Test system message styling

### User Acceptance Tests
1. Play through converted dialogue
2. Verify visual appearance of system messages
3. Verify images display correctly
4. Verify timing feels natural
5. Verify no regressions in existing dialogues

## Benefits

### Flexibility
- System messages can appear anywhere in the conversation flow
- Images can be inserted at precise moments
- Multiple narrator messages can be interspersed with system messages
- Complete control over conversation rhythm

### Clarity
- Single source of truth for message order
- Easy to visualize conversation flow
- Clear distinction between message types

### Maintainability
- Easier to edit conversation sequences
- Less confusion about which field to use
- Better suited for complex narrative structures

## Migration Timeline

1. **Week 1:** Implement server-side changes
2. **Week 1:** Implement client-side changes
3. **Week 1:** Add CSS styling
4. **Week 2:** Convert Twine structure to JSON
5. **Week 2:** Test and refine
6. **Week 3:** Deploy and monitor

## Future Enhancements

### Possible Additions
- `type: "action"` - For action descriptions
- `type: "thought"` - For internal monologue
- Animation triggers
- Sound effects
- Variable interpolation in messages
- Conditional message display

## Conclusion

The Message Sequence System provides the flexibility needed for complex narrative experiences while maintaining backward compatibility with existing dialogue data. It gives complete control over the conversation flow, allowing system messages, narrator messages, and images to be precisely orchestrated.
