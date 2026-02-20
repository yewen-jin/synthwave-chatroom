#!/usr/bin/env node
/**
 * Twee to Dialogue JSON Converter
 *
 * Converts Twee format files to the custom dialogue JSON format
 * Twee format is much cleaner than HTML and easier to parse
 *
 * Supports Harlowe macros:
 *   (set: $var to value)         — variable declarations and effects
 *   (set: $var to $var + N)      — increment effects on choices
 *   (if: $var >= N)[...]         — conditions and conditional gotos
 *   (if: ...)[...](else:)[...]   — conditional choices
 *   (link: "text")[(set:...)(goto:...)] — choices with effects
 *   (print: $var)                — variable interpolation → ${var}
 *
 * Usage: node scripts/twee-to-json.js <input.twee> <output.json>
 */

import fs from "fs";

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("Usage: node twee-to-json.js <input.twee> [output.json]");
  console.error("Example: node twee-to-json.js story.twee episode2.json");
  process.exit(1);
}

const inputFile = args[0];
const outputFile = args[1] || inputFile.replace(".twee", ".json");

// Read the Twee file
let content;
try {
  content = fs.readFileSync(inputFile, "utf8");
} catch (err) {
  console.error(`Error reading file ${inputFile}:`, err.message);
  process.exit(1);
}

// Split into passages
const passageRegex = /^:: (.+?)(?:\s+\{[^}]*\})?\s*$/gm;
const passages = [];
let match;
let lastIndex = 0;

// Find all passage headers
const headers = [];
while ((match = passageRegex.exec(content)) !== null) {
  headers.push({
    name: match[1].trim().replace(/^["']|["']$/g, ""), // Remove quotes
    startIndex: match.index,
    headerEnd: match.index + match[0].length,
  });
}

// Extract passage content
for (let i = 0; i < headers.length; i++) {
  const header = headers[i];
  const nextHeader = headers[i + 1];
  const endIndex = nextHeader ? nextHeader.startIndex : content.length;
  const passageContent = content.substring(header.headerEnd, endIndex).trim();

  passages.push({
    name: header.name,
    content: passageContent,
  });
}

console.log(`Found ${passages.length} passages`);

// Find story metadata
const storyData = passages.find((p) => p.name === "StoryData");
let startPassageName = "main portal";
let storyTitle = "Untitled Story";

if (storyData) {
  try {
    // Clean content - might have extra whitespace
    const cleanContent = storyData.content.trim();
    const data = JSON.parse(cleanContent);
    startPassageName = data.start || "main portal";
    console.log(`Found start passage: ${startPassageName}`);
  } catch (e) {
    console.warn("Could not parse StoryData:", e.message);
    console.warn("Using default start: main portal");
  }
}

const storyTitlePassage = passages.find((p) => p.name === "StoryTitle");
if (storyTitlePassage) {
  storyTitle = storyTitlePassage.content.trim();
}

// Filter out metadata passages
const storyPassages = passages.filter(
  (p) =>
    p.name !== "StoryData" &&
    p.name !== "StoryTitle" &&
    !p.name.startsWith("StoryScript")
);

console.log(`Processing ${storyPassages.length} story passages`);
console.log(`Start passage: ${startPassageName}`);

// Track all variables discovered across passages
const discoveredVariables = new Set();

// Initialize dialogue structure
const dialogue = {
  metadata: {
    title: storyTitle,
    version: "1.0.0",
    startNode: convertToId(startPassageName),
  },
  variables: {
    progress: 0,
  },
  nodes: {},
};

// Convert each passage to a node
storyPassages.forEach((passage) => {
  const nodeId = convertToId(passage.name);
  const parsed = parsePassageContent(passage.content, passage.name);

  // Determine if this is an ending node (no choices and no nextNode)
  const isEnding =
    parsed.choices.length === 0 && !parsed.nextNode && !parsed.conditionGoto;

  const node = {
    id: nodeId,
    type: isEnding ? "ending" : "narrative",
    // Use new messageSequence format — apply inline formatting to all content
    messageSequence: parsed.messageSequence.map((msg) => {
      if (msg.content) {
        return { ...msg, content: formatInlineMarkup(msg.content) };
      }
      return msg;
    }),
    choices: parsed.choices.map((choice, index) => {
      const displayText = cleanDisplayText(choice.text);
      const choiceObj = {
        id: `${nodeId}_choice_${index + 1}`,
        // text = what gets sent to chat (null if not player dialogue)
        text: choice.isPlayerDialogue ? formatInlineMarkup(choice.text) : null,
        // displayText = what shows on the choice button
        displayText: formatInlineMarkup(displayText),
        nextNode: convertToId(choice.destination),
      };
      if (choice.effects && Object.keys(choice.effects).length > 0) {
        choiceObj.effects = choice.effects;
      }
      if (choice.conditions) {
        choiceObj.conditions = choice.conditions;
      }
      return choiceObj;
    }),
  };

  // Add node-level conditions (e.g. redirect when clicks >= 3)
  if (parsed.conditionGoto) {
    node.conditions = [parsed.conditionGoto];
  }

  // Add nextNode for auto-advancing (if no choices but has nextNode)
  if (parsed.nextNode && parsed.choices.length === 0) {
    node.nextNode = convertToId(parsed.nextNode);
  }

  dialogue.nodes[nodeId] = node;
});

// Add all discovered variables with default value 0
for (const varName of discoveredVariables) {
  if (!(varName in dialogue.variables)) {
    dialogue.variables[varName] = 0;
  }
}

if (discoveredVariables.size > 0) {
  console.log(
    `  - Discovered variables: ${[...discoveredVariables].join(", ")}`
  );
}

// Write output file
try {
  fs.writeFileSync(outputFile, JSON.stringify(dialogue, null, 2), "utf8");
  console.log(`✓ Successfully converted to ${outputFile}`);
  console.log(`  - ${Object.keys(dialogue.nodes).length} nodes`);
  console.log(`  - Start node: ${dialogue.metadata.startNode}`);
} catch (err) {
  console.error(`Error writing file ${outputFile}:`, err.message);
  process.exit(1);
}

// Helper Functions

function convertToId(name) {
  // Convert passage name to valid node ID (lowercase, underscores)
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Convert inline formatting markers to HTML.
 *   //text//  → <em>text</em>  (italic)
 *   ''text''  → <strong>text</strong>  (Harlowe bold)
 *   **text**  → <strong>text</strong>  (Markdown bold)
 *   *text*    → <em>text</em>  (Markdown italic, single *)
 */
function formatInlineMarkup(text) {
  if (!text) return text;
  return text
    .replace(/''([^']+)''/g, "<strong>$1</strong>")
    .replace(/\/\/([^/]+)\/\//g, "<em>$1</em>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/''/g, ""); // Strip any remaining unmatched '' markers
}

/**
 * Extract variable name from a Harlowe $variable reference.
 * e.g. "$clicks" → "clicks"
 */
function extractVarName(str) {
  const m = str.match(/\$(\w+)/);
  if (m) {
    discoveredVariables.add(m[1]);
    return m[1];
  }
  return null;
}

/**
 * Replace (print: $var) with ${var} in text content.
 * Also handles (nth: $var, "a", "b", "c") by replacing it with ${var}.
 */
function interpolateVariables(text) {
  let result = text;
  // Replace (print: $var) → ${var}
  result = result.replace(/\(print:\s*\$(\w+)\)/g, (_, varName) => {
    discoveredVariables.add(varName);
    return `\${${varName}}`;
  });
  // Replace (nth: $var, ...) → ${var} (simplified — runtime handles ordinal lookup)
  result = result.replace(/\(nth:\s*\$(\w+)[^)]*\)/g, (_, varName) => {
    discoveredVariables.add(varName);
    return `\${${varName}}`;
  });
  return result;
}

/**
 * Parse a Harlowe (if: $var op value) condition string.
 * Returns { variable, operator, value } or null.
 */
function parseCondition(condStr) {
  // Match patterns like: $clicks >= 3, $clicks is not a number, etc.
  const compMatch = condStr.match(
    /\$(\w+)\s*(>=|<=|>|<|is|is not)\s*(.+)/
  );
  if (!compMatch) return null;

  const varName = compMatch[1];
  let operator = compMatch[2].trim();
  let value = compMatch[3].trim();

  discoveredVariables.add(varName);

  // Normalize operators
  if (operator === "is") operator = "==";
  if (operator === "is not") operator = "!=";

  // Parse numeric values
  const numVal = parseInt(value, 10);
  if (!isNaN(numVal)) value = numVal;

  return { variable: varName, operator, value };
}

/**
 * Parse effects from a (set:) macro inside a choice block.
 * e.g. "(set: $clicks to $clicks + 1)" → { clicks: "+1" }
 */
function parseSetEffect(setStr) {
  // Match: $var to $var + N  or  $var to $var - N
  const incrMatch = setStr.match(
    /\$(\w+)\s+to\s+\$\w+\s*([+-])\s*(\d+)/
  );
  if (incrMatch) {
    const varName = incrMatch[1];
    const op = incrMatch[2];
    const num = incrMatch[3];
    discoveredVariables.add(varName);
    return { [varName]: `${op}${num}` };
  }

  // Match: $var to N (absolute set)
  const absMatch = setStr.match(/\$(\w+)\s+to\s+(\d+)/);
  if (absMatch) {
    const varName = absMatch[1];
    const num = parseInt(absMatch[2], 10);
    discoveredVariables.add(varName);
    return { [varName]: num };
  }

  return null;
}

function parsePassageContent(content, passageName) {
  const lines = content.split("\n");
  const messageSequence = [];
  const playerDialogueLines = [];
  const choices = [];

  // --- Pre-pass: Extract Harlowe structure before line-by-line processing ---

  // Track positions of content already handled by macro extraction
  // to avoid double-processing in line-by-line pass
  const handledRanges = [];

  // 1. Extract node-level condition + goto: (if: $var >= N)[\n  (goto: "dest")\n]
  let conditionGoto = null;
  const condGotoRegex =
    /\(if:\s*([^)]+)\)\s*\[\s*(?:\n\s*)?\(goto:\s*"([^"]+)"\)\s*\]/g;
  let condGotoMatch;
  while ((condGotoMatch = condGotoRegex.exec(content)) !== null) {
    const cond = parseCondition(condGotoMatch[1]);
    if (cond) {
      conditionGoto = {
        variable: cond.variable,
        operator: cond.operator,
        value: cond.value,
        nextNode: convertToId(condGotoMatch[2]),
      };
    }
  }

  // 2. Extract (link: "text")[(set:...)(goto:...)] choices
  const linkMacroRegex =
    /(You\s+say:\s*)?\(link:\s*"([^"]+)"\)\s*\[([\s\S]*?)\]/g;
  let linkMatch;
  while ((linkMatch = linkMacroRegex.exec(content)) !== null) {
    const isPlayerDialogue = !!linkMatch[1];
    const linkText = linkMatch[2];
    const linkBody = linkMatch[3];

    // Extract effects from (set:) macros inside link body
    const effects = {};
    const setRegex = /\(set:\s*([^)]+)\)/g;
    let setMatch;
    while ((setMatch = setRegex.exec(linkBody)) !== null) {
      const effect = parseSetEffect(setMatch[1]);
      if (effect) Object.assign(effects, effect);
    }

    // Extract destination from (goto:) macro
    const gotoMatch = linkBody.match(/\(goto:\s*"([^"]+)"\)/);
    if (gotoMatch) {
      choices.push({
        text: linkText,
        destination: gotoMatch[1],
        effects: Object.keys(effects).length > 0 ? effects : null,
        conditions: null,
        isPlayerDialogue,
      });
    }
  }

  // 3. Extract conditional choices: (if: cond)[...[[choice->dest]]...](else:)[...[[choice->dest]]...]
  // Uses bracket balancing to handle [[links]] inside the blocks
  const condChoiceStarts = [...content.matchAll(/\(if:\s*([^)]+)\)\s*\[/g)];
  for (const condStart of condChoiceStarts) {
    const cond = parseCondition(condStart[1]);
    if (!cond) continue;

    // Find the balanced closing bracket for the if-block
    const ifBlockStart = condStart.index + condStart[0].length;
    const ifBlockEnd = findBalancedBracket(content, ifBlockStart - 1);
    if (ifBlockEnd === -1) continue;

    const ifBlock = content.substring(ifBlockStart, ifBlockEnd);

    // Check if followed by (else:)[...]
    const afterIf = content.substring(ifBlockEnd + 1);
    const elseMatch = afterIf.match(/^\s*\(else:\)\s*\[/);
    if (!elseMatch) {
      // No else block — this is a condition+goto, not conditional choices
      // (already handled above in step 1)
      continue;
    }

    const elseBlockStart = ifBlockEnd + 1 + elseMatch[0].length;
    const elseBlockEnd = findBalancedBracket(content, elseBlockStart - 1);
    if (elseBlockEnd === -1) continue;

    const elseBlock = content.substring(elseBlockStart, elseBlockEnd);

    // Only process if at least one block contains [[links]]
    if (!/\[\[/.test(ifBlock) && !/\[\[/.test(elseBlock)) continue;

    // Extract [[link]] choices from if block
    const ifLinks = [...ifBlock.matchAll(/(You\s+say:\s*)?\[\[([^\]]+)\]\]/g)];
    for (const link of ifLinks) {
      const parsed = parseLinkContent(link[2]);
      choices.push({
        text: parsed.text,
        destination: parsed.destination,
        effects: null,
        conditions: {
          variable: cond.variable,
          operator: cond.operator,
          value: cond.value,
        },
        isPlayerDialogue: !!link[1],
      });
    }

    // Extract [[link]] choices from else block with inverted condition
    const invertedOp = invertOperator(cond.operator);
    const elseLinks = [...elseBlock.matchAll(/(You\s+say:\s*)?\[\[([^\]]+)\]\]/g)];
    for (const link of elseLinks) {
      const parsed = parseLinkContent(link[2]);
      choices.push({
        text: parsed.text,
        destination: parsed.destination,
        effects: null,
        conditions: {
          variable: cond.variable,
          operator: invertedOp,
          value: cond.value,
        },
        isPlayerDialogue: !!link[1],
      });
    }

    // Track these ranges as handled
    handledRanges.push([condStart.index, elseBlockEnd + 1]);
  }

  // Collect ranges for link macros
  linkMacroRegex.lastIndex = 0;
  while ((linkMatch = linkMacroRegex.exec(content)) !== null) {
    handledRanges.push([linkMatch.index, linkMatch.index + linkMatch[0].length]);
  }

  // Collect ranges for condition+goto blocks
  condGotoRegex.lastIndex = 0;
  while ((condGotoMatch = condGotoRegex.exec(content)) !== null) {
    handledRanges.push([
      condGotoMatch.index,
      condGotoMatch.index + condGotoMatch[0].length,
    ]);
  }

  function isInHandledRange(lineStartInContent) {
    for (const [start, end] of handledRanges) {
      if (lineStartInContent >= start && lineStartInContent < end) return true;
    }
    return false;
  }

  // --- Line-by-line processing for messages ---
  let currentPos = 0;
  let pendingSystemLines = []; // Accumulate consecutive system lines to merge into one message
  let pendingSpeaker = null; // Speaker title waiting for body lines (e.g. "The Evil Eye says:")

  function flushPendingSystemLines() {
    if (pendingSpeaker && pendingSystemLines.length > 0) {
      // Merge speaker title with accumulated body lines into one block
      messageSequence.push({
        type: "system",
        speaker: pendingSpeaker.name,
        content: pendingSpeaker.title + "<br>" + pendingSystemLines.join("<br>"),
      });
      pendingSpeaker = null;
      pendingSystemLines = [];
    } else if (pendingSpeaker) {
      // Speaker title with no body — push as standalone
      messageSequence.push({
        type: "system",
        speaker: pendingSpeaker.name,
        content: pendingSpeaker.title,
      });
      pendingSpeaker = null;
    }
    if (pendingSystemLines.length > 0) {
      messageSequence.push({
        type: "system",
        content: pendingSystemLines.join("<br>"),
      });
      pendingSystemLines = [];
    }
  }

  for (const line of lines) {
    const lineStart = content.indexOf(line, currentPos);
    currentPos = lineStart + line.length;

    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Skip lines that are purely [[link]] choices (already handled by choice extraction)
    if (/^\[\[.*\]\]\s*$/.test(trimmedLine)) continue;

    // Skip lines that are part of already-handled macro blocks
    if (lineStart >= 0 && isInHandledRange(lineStart)) continue;

    // Skip pure Harlowe macro lines (set, if, else, goto, etc.)
    if (/^\s*\((?:set|if|else|goto|elseif):/.test(trimmedLine)) continue;
    if (/^\s*\]$/.test(trimmedLine)) continue;
    if (/^\s*\{$/.test(trimmedLine) || /^\s*\}$/.test(trimmedLine)) continue;

    // Check for HTML <img> tags BEFORE stripping HTML
    const htmlImgMatch = trimmedLine.match(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (htmlImgMatch) {
      flushPendingSystemLines();
      const url = htmlImgMatch[1];
      // Derive alt text from filename
      const filename = url.split("/").pop().replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      messageSequence.push({
        type: "image",
        url: url,
        alt: filename,
      });
      continue;
    }

    // Apply variable interpolation before cleaning
    let cleanedLine = interpolateVariables(trimmedLine);

    // Clean up HTML and Harlowe syntax from this line
    cleanedLine = cleanedLine
      .replace(/<div[^>]*>.*?<\/div>/gs, "")
      .replace(/<span[^>]*>(.*?)<\/span>/gs, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/\(set:\s*[^)]*\)/g, "")
      .replace(/\(if:\s*[^)]*\)/g, "")
      .replace(/\(goto:\s*[^)]*\)/g, "")
      .replace(/\(else:\)/g, "")
      .replace(/\(print:\s*[^)]*\)/g, "")
      .replace(/\(nth:\s*[^)]*\)/g, "")
      .replace(/^''+|''+$/g, "") // Remove Harlowe italic markers ('' at start/end)
      .replace(/^\/\/+|\/\/+$/g, "") // Remove Harlowe italic markers (// at start/end)
      .replace(/^~~+|~~+$/g, "") // Remove Harlowe strikethrough markers
      .replace(/^\*\*+|\*\*+$/g, "") // Remove bold markers
      .replace(/^\[+|\]+$/g, "") // Remove lone brackets (from Harlowe blocks)
      .trim();

    if (!cleanedLine) continue;

    // Check for markdown image syntax: ![alt](url) or [img:url]
    const imageMatch =
      cleanedLine.match(/!\[([^\]]*)\]\(([^)]+)\)/) ||
      cleanedLine.match(/\[img:([^\]]+)\]/);
    if (imageMatch) {
      flushPendingSystemLines();
      const url = imageMatch[2] || imageMatch[1];
      const alt = imageMatch[1] || "Image";
      messageSequence.push({
        type: "image",
        url: url,
        alt: alt,
      });
      continue;
    }

    // Check for pause syntax: [pause:2000] or [wait:2000]
    const pauseMatch = cleanedLine.match(/\[(pause|wait):(\d+)\]/i);
    if (pauseMatch) {
      flushPendingSystemLines();
      messageSequence.push({
        type: "pause",
        duration: parseInt(pauseMatch[2], 10),
      });
      continue;
    }

    // Check if it's a narrator message (starts with "Liz" and contains "says:")
    // Use trimmedLine (before bracket stripping) so [[links]] are still intact
    // Flush accumulated system lines before a non-system message type
    const lizCheckLine = trimmedLine
      .replace(/<[^>]+>/g, "")
      .replace(/\(set:\s*[^)]*\)/g, "")
      .replace(/\(if:\s*[^)]*\)/g, "")
      .replace(/^\[(?!\[)/g, "") // Strip single leading [ (Harlowe block) but not [[
      .trim();
    if (/^Liz\s*:/i.test(lizCheckLine) || /^Liz\s+.*says:/i.test(lizCheckLine)) {
      flushPendingSystemLines();
      // Extract the actual message content from the raw line (before bracket stripping)
      const messageContent = lizCheckLine
        .replace(/^Liz(\s+.*)?says:\s*/i, "")
        .replace(/^Liz:\s*/i, "")
        .trim();
      // Extract link text from narrator message — replace [[text->dest]] with just text
      const cleanMessage = messageContent.replace(
        /\[\[([^\]]+)\]\]/g,
        (match, linkContent) => {
          if (linkContent.includes("->")) {
            return linkContent.split("->")[0].trim();
          } else if (linkContent.includes("<-")) {
            return linkContent.split("<-")[1].trim();
          } else if (linkContent.includes("|")) {
            return linkContent.split("|")[0].trim();
          } else {
            return linkContent.trim();
          }
        }
      );

      if (cleanMessage.length > 0) {
        // Strip Harlowe bold markers ('') and trailing ] from Harlowe blocks
        const finalMessage = cleanMessage
          .replace(/''/g, "")
          .replace(/\]+$/, "")
          .trim();
        if (finalMessage.length > 0) {
          messageSequence.push({
            type: "narrator",
            content: finalMessage,
          });
        }
      }
      continue;
    }
    // Check if it's a third-party speaker (e.g. "SSSS_98 says:", "The Email says:", "The Code says:")
    // These are NOT "Liz says:" or "You say:" — they are other characters speaking.
    // NOTE: These get a "speaker" property so they can receive special styling distinct from
    // generic system messages.
    // - Speaker lines WITH content after "says:" → standalone message
    // - Speaker lines with ONLY a title (e.g. "The Evil Eye says:") → pending, merged with
    //   following system lines into one block (for poems/monologues)
    else if (
      /\bsays?:/i.test(cleanedLine) &&
      !/^Liz\b/i.test(cleanedLine) &&
      !/^You\b/i.test(cleanedLine)
    ) {
      flushPendingSystemLines();
      // Extract the speaker name and verb form (everything before "says:" or "say:")
      const speakerMatch = cleanedLine.match(/^(.+?)\s+(says?):\s*/i);
      const speaker = speakerMatch ? speakerMatch[1].trim() : null;
      const verb = speakerMatch ? speakerMatch[2] : "says";
      const speakerContent = speakerMatch
        ? cleanedLine.slice(speakerMatch[0].length).trim()
        : cleanedLine;
      // Remove [[links]] from the content
      const cleanContent = speakerContent.replace(/\[\[([^\]]+)\]\]/g, (match, linkContent) => {
        if (linkContent.includes("->")) return linkContent.split("->")[0].trim();
        if (linkContent.includes("<-")) return linkContent.split("<-")[1].trim();
        if (linkContent.includes("|")) return linkContent.split("|")[0].trim();
        return linkContent.trim();
      });
      const speakerTitle = `${speaker} ${verb}:`;
      if (cleanContent.length > 0) {
        // Has content after "says:" — standalone speaker message
        messageSequence.push({
          type: "system",
          speaker: speaker,
          content: `${speakerTitle} ${cleanContent}`,
        });
      } else {
        // Title only (e.g. "The Evil Eye says:") — store as pending,
        // following plain lines will be merged into this block
        pendingSpeaker = {
          name: speaker,
          title: speakerTitle,
        };
      }
      continue;
    }
    // Check if it's player dialogue (contains "You:", "You say:", or "You whisper:")
    // But skip if it contains a (link:) macro (already handled above)
    // Also skip "You say nothing:" — these are silent choices, not messages
    else if (
      (/^You\s*:/i.test(cleanedLine) || /^You\s+(?:say|whisper)\s*:/i.test(cleanedLine)) &&
      !trimmedLine.includes("(link:") &&
      !/^You\s+say\s+nothing\s*:/i.test(cleanedLine)
    ) {
      flushPendingSystemLines();
      playerDialogueLines.push(cleanedLine);
    }
    // Skip "You say nothing:" lines (choices handled separately, nothing sent to chat)
    else if (/^You\s+say\s+nothing\s*:/i.test(cleanedLine)) {
      continue;
    }
    // Everything else is system/stage direction — accumulate for merging
    else {
      // Remove links from stage directions
      const cleanStage = cleanedLine.replace(/\[\[([^\]]+)\]\]/g, "");
      if (cleanStage.trim().length > 0) {
        pendingSystemLines.push(cleanStage.trim());
      }
      continue;
    }
  }

  // Flush any remaining accumulated system lines after the loop
  flushPendingSystemLines();

  // --- Extract [[link]] choices from content (that weren't already handled) ---
  // These are standard Twee-style links NOT inside (if:)/(else:) blocks
  const linkRegex = /\[\[([^\]]+)\]\]/g;
  const narratorLinks = [];

  // Track which links are inside narrator messages
  const narratorLinkPositions = new Set();
  for (const line of lines) {
    const trimmedLine = line.trim();
    const cleanedForCheck = trimmedLine
      .replace(/^''+|''+$/g, "")
      .replace(/^\/\/+|\/\/+$/g, "")
      .replace(/^\[(?!\[)/g, "") // Strip single leading [ but not [[
      .trim();
    if (
      /^Liz\s*:/i.test(cleanedForCheck) ||
      /^Liz\s+.*says:/i.test(cleanedForCheck)
    ) {
      let linkMatch;
      const lineLinkRegex = /\[\[([^\]]+)\]\]/g;
      while ((linkMatch = lineLinkRegex.exec(trimmedLine)) !== null) {
        const linkText = linkMatch[0];
        let pos = content.indexOf(linkText);
        while (pos !== -1) {
          narratorLinkPositions.add(pos);
          pos = content.indexOf(linkText, pos + 1);
        }

        const linkContent = linkMatch[1];
        let destination;
        if (linkContent.includes("->")) {
          destination = linkContent.split("->")[1].trim();
        } else if (linkContent.includes("<-")) {
          destination = linkContent.split("<-")[0].trim();
        } else if (linkContent.includes("|")) {
          destination = linkContent.split("|")[1].trim();
        } else {
          destination = linkContent.trim();
        }
        narratorLinks.push(destination);
      }
    }
  }

  // Only extract standard [[links]] if we didn't already find choices via macros
  if (choices.length === 0) {
    // Use a regex that also captures "You say:" prefix before the link
    const stdLinkRegex = /(You\s+(?:say\s+nothing|whisper|say)\s*:\s*)?\[\[([^\]]+)\]\]/g;
    while ((match = stdLinkRegex.exec(content)) !== null) {
      // Check narrator link positions using the offset of the [[ part
      const bracketIndex = match.index + (match[1] ? match[1].length : 0);
      if (narratorLinkPositions.has(bracketIndex)) continue;

      // Skip links inside handled ranges (conditional blocks)
      if (isInHandledRange(match.index)) continue;

      const parsed = parseLinkContent(match[2]);
      // "You say:" and "You whisper:" send to chat, "You say nothing:" does not
      const prefix = match[1] || "";
      const isSilent = /say\s+nothing/i.test(prefix);
      choices.push({
        text: parsed.text,
        destination: parsed.destination,
        effects: null,
        conditions: null,
        isPlayerDialogue: !!match[1] && !isSilent,
      });
    }
  }

  // If there are narrator links but no player choices, use the first narrator link as nextNode
  let nextNode = null;
  if (narratorLinks.length > 0 && choices.length === 0) {
    nextNode = narratorLinks[0];
  }

  // If no messages were found AND there are no choices, add passage name as fallback.
  // Choice-only nodes (e.g. "I", "have", "released") should have no system message.
  if (messageSequence.length === 0 && choices.length === 0) {
    messageSequence.push({
      type: "system",
      content: passageName,
    });
  }

  return {
    messageSequence,
    choices,
    nextNode,
    conditionGoto,
  };
}

/**
 * Parse a [[link]] content string into text and destination.
 */
function parseLinkContent(linkContent) {
  let text, destination;

  if (linkContent.includes("->")) {
    const parts = linkContent.split("->");
    text = parts[0].trim();
    destination = parts[1].trim();
  } else if (linkContent.includes("<-")) {
    const parts = linkContent.split("<-");
    destination = parts[0].trim();
    text = parts[1].trim();
  } else if (linkContent.includes("|")) {
    const parts = linkContent.split("|");
    text = parts[0].trim();
    destination = parts[1].trim();
  } else {
    text = linkContent.trim();
    destination = linkContent.trim();
  }

  return { text, destination };
}

/**
 * Clean choice text for display on buttons.
 * Strips markdown/Harlowe formatting (bold **, italic //, etc.)
 * while preserving the readable text.
 */
function cleanDisplayText(text) {
  return text
    .replace(/^<<\s*|\s*>>$/g, "") // << text >> → text (display text markers)
    .replace(/\*\*([^*]*)\*\*/g, "$1") // **bold** → bold
    .replace(/''([^']*)''/g, "$1") // ''bold'' → bold (Harlowe)
    .replace(/\/\/([^/]*)\/\//g, "$1") // //italic// → italic
    .replace(/~~([^~]*)~~/g, "$1") // ~~strike~~ → strike
    .replace(/^==+|==+$/g, "") // ==text== → text
    .trim();
}

/**
 * Find the position of the closing bracket that balances the opening bracket at pos.
 * Returns the index of the closing ']', or -1 if not found.
 */
function findBalancedBracket(str, pos) {
  if (str[pos] !== "[") return -1;
  let depth = 1;
  for (let i = pos + 1; i < str.length; i++) {
    if (str[i] === "[") depth++;
    else if (str[i] === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Invert a comparison operator for else-branch conditions.
 */
function invertOperator(op) {
  const inverses = {
    ">=": "<",
    "<=": ">",
    ">": "<=",
    "<": ">=",
    "==": "!=",
    "!=": "==",
  };
  return inverses[op] || op;
}
