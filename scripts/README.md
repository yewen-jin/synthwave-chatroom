# Twee to JSON Converter

This script converts Twee format files to the custom dialogue JSON format used in the Void Space Chatroom.

## Quick Start

### 1. Export from Twine

- Open your story in Twine 2
- Go to the Twine menu (bottom-left)
- Select "View Proofing Copy"
- Save the page source as a `.twee` file

### 2. Run the Converter

```bash
node scripts/twee-to-json.js my-story.twee output.json
```

### 3. Use the Output

Move the generated JSON file to `src/data/dialogues/`:

```bash
mv output.json src/data/dialogues/episode2.json
```

### 4. Update the Server

In `server.js`, change the dialogue file being loaded:

```javascript
dialogueData = require("./src/data/dialogues/episode2.json");
```

## Twine Story Format

The converter works best with **Harlowe** or **SugarCube** format stories.

### Basic Link Syntax

**Simple links:**

```
[[Next Passage]]
[[Choice Text->Destination Passage]]
[[Destination Passage<-Choice Text]]
```

### Narrator vs Player Dialogue

**IMPORTANT:** The twee converter recognizes special dialogue formatting:

**Narrator messages** (sent as chat messages from Liz):

```
Liz: Hello there!
Liz says: Welcome to the void.
```

**Player dialogue** (removed from narrative, used in choices):

```
You: I don't understand
You say: What's happening?
```

**Stage directions** (displayed in text area, not sent as messages):

```
//The lights flicker and dim//
>You feel a chill run down your spine<
The room grows quiet...
```

**Example passage:**

```
//The void pulses with energy//

Liz says: I've been waiting for you.
Liz says: Do you remember this place?

You say: Where am I?
You say: Who are you?

[[Where am I?->Location]]
[[Who are you?->Identity]]
```

This will create:

- **Text**: "The void pulses with energy" (stage direction shown but not sent)
- **Narrator messages**: Two messages from Liz sent to chat
- **Choices**: Player dialogue is excluded, only link text shown

### Advanced Features

**1. Add Images to Chat**

Use markdown image syntax:

```
![Description](https://i.postimg.cc/example.gif)
```

Or the shorthand:

```
[img:https://i.postimg.cc/example.gif]
```

**2. Add Pauses/Delays**

Use pause syntax for extra delays between messages:

```
[pause:2000]
[wait:3000]
```

The number is in milliseconds (2000 = 2 seconds).

**3. Add Effects to Choices**

Use `{variable:value}` at the end of link text:

```
[[Trust them{trust:+1}->TrustPath]]
[[Distrust them{trust:-1}->DistrustPath]]
[[Remember this{sawEvent:true}->NextScene]]
```

**2. Add Conditions to Choices**

Use `[if condition]` in link text:

```
[[Use key[if hasKey:true]->UnlockedRoom]]
[[Persuade them[if charisma>=5]->Persuaded]]
```

**3. Mark Ending Passages**

Add the tag `ending` or `end` to any passage that should end the dialogue:

- Click the passage
- Click the tag button (looks like a price tag icon)
- Type `ending` and press Enter

**4. Define Variables**

Create a passage named "Variables" or tag it with `variables`:

```
$trust = 0
$hasKey = false
$charisma = 3
$metNarrator = false
```

## Example Twine Story

### Passage: "Start"

```
The void stretches endlessly before you.

A voice emerges from the darkness...

"Welcome to the threshold."

[[Who are you?{metNarrator:true}->WhoAreYou]]
[[Where am I?->WhereAmI]]
[[Remain silent->Silent]]
```

### Passage: "WhoAreYou"

```
"I am Symoné. I exist between states."

[[The body is obsolete?{seekingTruth:true,trust:+1}->BodyObsolete]]
[[Are you trapped here?{trust:+1}->TrappedQuestion]]
```

### Passage: "Ending" (tagged with `ending`)

```
"Until we meet again..."

The void fades to darkness.

[END]
```

## Output Format

The converter generates JSON using the **messageSequence format**:

```json
{
  "metadata": {
    "title": "Your Story Name",
    "version": "1.0.0",
    "startNode": "start"
  },
  "variables": {
    "trust": 0,
    "hasKey": false
  },
  "nodes": {
    "start": {
      "id": "start",
      "type": "narrative",
      "messageSequence": [
        {
          "type": "system",
          "content": "The void stretches endlessly before you."
        },
        { "type": "narrator", "content": "Welcome to the threshold." },
        {
          "type": "image",
          "url": "https://example.com/void.gif",
          "alt": "The void"
        },
        { "type": "pause", "duration": 2000 }
      ],
      "choices": [
        {
          "id": "start_choice_1",
          "text": "Who are you?",
          "nextNode": "who_are_you",
          "effects": { "metNarrator": true },
          "conditions": null
        }
      ]
    }
  }
}
```

### Message Types in messageSequence

- **system**: Text displayed as a system message (stage directions, other characters)
- **narrator**: Messages from Liz/narrator sent to chat
- **image**: Images displayed inline in chat
- **pause**: Extra delay before next message

## Tips for Complex Stories

1. **Use descriptive passage names**: They become node IDs (converted to lowercase with underscores)

2. **Organize with tags**: Tag passages as `ending`, `variables`, `optional`, etc.

3. **Test incrementally**: Convert and test small sections before doing the full story

4. **Manual cleanup**: Complex Twine macros may need manual adjustment in the JSON

5. **Check the output**: Always review the generated JSON to ensure links converted correctly

## Troubleshooting

**"Could not find Twine story data"**

- Make sure you exported as HTML from Twine 2 (not Twine 1)
- Use "Publish to File", not other export options

**Missing choices:**

- Check your link syntax in Twine
- Ensure links use proper `[[` double brackets `]]`

**Variables not appearing:**

- Create a passage named "Variables" or tagged with `variables`
- Use format: `$variableName = value`

**Complex macros not converting:**

- The converter handles basic links and simple syntax
- Complex Harlowe/SugarCube macros may need manual conversion
- Consider simplifying macros or editing the output JSON

## Custom Syntax Reference

| Syntax           | Example                              | Result                      |
| ---------------- | ------------------------------------ | --------------------------- |
| Basic link       | `[[Next Scene]]`                     | Choice text = "Next Scene"  |
| Arrow link       | `[[Go left->LeftPath]]`              | Choice text = "Go left"     |
| Effects          | `[[Trust{trust:+1}->Next]]`          | Adds effect `"trust": "+1"` |
| Multiple effects | `[[Act{trust:+1,brave:true}->Next]]` | Multiple effects            |
| Conditions       | `[[Open[if hasKey:true]->Unlocked]]` | Adds condition              |
| Comparison       | `[[Persuade[if charm>=5]->Success]]` | Comparison condition        |
| Image            | `![alt text](url)`                   | Image in messageSequence    |
| Image (short)    | `[img:url]`                          | Image in messageSequence    |
| Pause            | `[pause:2000]`                       | 2 second pause              |
| Wait             | `[wait:3000]`                        | 3 second pause              |

## Converting Large Stories

For very large Twine stories (100+ passages):

1. **Split into episodes**: Break your story into smaller dialogue files
2. **Test in batches**: Convert 20-30 passages at a time initially
3. **Use consistent naming**: Keep passage names consistent across episodes
4. **Version control**: Commit the JSON after each successful conversion

## Need Help?

If you encounter issues with the conversion:

1. Check the Twine export is valid HTML
2. Verify link syntax in problematic passages
3. Look at the generated JSON to see what was produced
4. Manually edit the JSON if needed (it's just text!)
