# Twee to JSON Converter

Converts Twee files to the **messageSequence dialogue format** the server delivers over Socket.IO. Format reference: [`__context__/interaction.md`](../__context__/interaction.md).

## Quick Start — the current story

For _The B0dy_is_0bs0let3_, you don't need to call this script directly. Edit `src/data/twine/thebodyisobsolete.twee`, then:

```bash
npm run build:dialogue    # regenerate the shipped dialogue
npm test                  # confirm twee and shipped JSON are in sync
```

The regenerated JSON lands on the **next transmission trigger** — no server restart. See `AGENTS.md` → _Dialogue Data_ for the full pipeline.

## Adding a new story

### 1. Export from Twine

- Open your story in Twine 2
- Go to the Twine menu (bottom-left)
- Select "View Proofing Copy"
- Save the page source as a `.twee` file into `src/data/twine/`

### 2. Convert it

The server loads dialogue from `public/data/dialogues/<id>.json`, where `<id>` is the `dialogueId` the narrator client requests. Output must land there:

```bash
node scripts/twee-to-json.js src/data/twine/episode2.twee public/data/dialogues/episode2.json
```

> **Do not** write output to `src/data/dialogues/`. That directory used to be documented here and the server never read it — regenerating into it silently does nothing. It was deleted on 15 Jul 2026.

### 3. That's it — the server needs no edit

`server.js` → `loadDialogueData(dialogueId)` reads `public/data/dialogues/${dialogueId}.json` at each `startDialogue()`. It is not a `require()` and there is no hardcoded filename to change; a new story is picked up by requesting its id. `npm test` will check any `.twee` in `src/data/twine/` against its shipped JSON automatically.

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

**Narrator messages** → `{ type: "narrator", content: "..." }`

```
Liz: Hello there!
Liz says: Welcome to the void.
```

Note: The "Liz:" or "Liz says:" prefix is stripped - only the message content is kept.

**Player dialogue** (removed from narrative, used in choices):

```
You: I don't understand
You say: What's happening?
```

**System messages / Stage directions** → `{ type: "system", content: "..." }`

Everything else becomes a system message:

```
//The lights flicker and dim//
The room grows quiet...
The Email says: Where are you?
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

This will create a `messageSequence` array with:

- `{ type: "system", content: "The void pulses with energy" }`
- `{ type: "narrator", content: "I've been waiting for you." }`
- `{ type: "narrator", content: "Do you remember this place?" }`
- Plus `choices` array (player dialogue lines are excluded)

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

**Message order looks wrong:**

- Messages appear in `messageSequence` in the same order as in the Twee file
- Check that your Twee passage has content in the intended order

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

1. Verify link syntax in problematic passages
2. Look at the generated JSON to see what was produced
3. Compare with examples in [interaction.md](../interaction.md) for expected format
4. Manually edit the JSON if needed (it's just text!)
