#!/usr/bin/env node
/**
 * Twee to Dialogue JSON Converter
 *
 * Converts Twee format files to the custom dialogue JSON format
 * Twee format is much cleaner than HTML and easier to parse
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
  const isEnding = parsed.choices.length === 0 && !parsed.nextNode;

  const node = {
    id: nodeId,
    type: isEnding ? "ending" : "narrative",
    // Use new messageSequence format
    messageSequence: parsed.messageSequence,
    choices: parsed.choices.map((choice, index) => ({
      id: `${nodeId}_choice_${index + 1}`,
      text: choice.text,
      nextNode: convertToId(choice.destination),
      effects: null,
      conditions: null,
    })),
  };

  // Add nextNode for auto-advancing (if no choices but has nextNode)
  if (parsed.nextNode && parsed.choices.length === 0) {
    node.nextNode = convertToId(parsed.nextNode);
  }

  dialogue.nodes[nodeId] = node;
});

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

function parsePassageContent(content, passageName) {
  // Parse the raw content BEFORE removing links
  // This allows us to associate "You say:" lines with their links

  const lines = content.split("\n");
  const messageSequence = []; // New: ordered array of {type, content} objects
  const playerDialogueLines = []; // Lines with "You:" or "You say:"

  // First pass: categorize each line and build messageSequence in order
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Clean up HTML and Harlowe syntax from this line
    let cleanedLine = trimmedLine
      .replace(/<div[^>]*>.*?<\/div>/gs, "")
      .replace(/<span[^>]*>(.*?)<\/span>/gs, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/\(set:.*?\)/g, "")
      .replace(/\(if:.*?\)/g, "")
      .replace(/\(goto:.*?\)/g, "")
      .replace(/\(print:.*?\)/g, "")
      .replace(/\(nth:.*?\)/g, "")
      .replace(/^''+|''+$/g, "") // Remove Harlowe italic markers ('' at start/end)
      .replace(/^\/\/+|\/\/+$/g, "") // Remove Harlowe italic markers (// at start/end)
      .replace(/^~~+|~~+$/g, "") // Remove Harlowe strikethrough markers
      .replace(/^\*\*+|\*\*+$/g, "") // Remove bold markers
      .trim();

    if (!cleanedLine) continue;

    // Check for image syntax: ![alt](url) or [img:url] or similar
    const imageMatch =
      cleanedLine.match(/!\[([^\]]*)\]\(([^)]+)\)/) ||
      cleanedLine.match(/\[img:([^\]]+)\]/);
    if (imageMatch) {
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
      messageSequence.push({
        type: "pause",
        duration: parseInt(pauseMatch[2], 10),
      });
      continue;
    }

    // Check if it's a narrator message (starts with "Liz" and contains "says:")
    // Matches: "Liz says: ..." or "Liz: ..."
    if (/^Liz\s*:/i.test(cleanedLine) || /^Liz\s+.*says:/i.test(cleanedLine)) {
      // Extract the actual message content
      const messageContent = cleanedLine
        .replace(/^Liz(\s+.*)?says:\s*/i, "")
        .replace(/^Liz:\s*/i, "")
        .trim();
      // Extract link text from narrator message (not remove it entirely)
      const cleanMessage = messageContent.replace(
        /\[\[([^\]]+)\]\]/g,
        (match, linkContent) => {
          // Extract just the text portion from various link formats
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
        // Add narrator message to sequence
        messageSequence.push({
          type: "narrator",
          content: cleanMessage,
        });
      }
    }
    // Check if it's player dialogue (contains "You:" or "You say:")
    else if (
      /^You\s*:/i.test(cleanedLine) ||
      /^You\s+say\s*:/i.test(cleanedLine)
    ) {
      playerDialogueLines.push(cleanedLine);
    }
    // Everything else is system/stage direction
    else {
      // Remove links from stage directions
      const cleanStage = cleanedLine.replace(/\[\[([^\]]+)\]\]/g, "");
      if (cleanStage.trim().length > 0) {
        // Add system message to sequence
        messageSequence.push({
          type: "system",
          content: cleanStage.trim(),
        });
      }
    }
  }

  // Extract choices from the original content (preserve all links)
  // BUT exclude links that are inside "Liz says:" or "Liz:" lines
  const linkRegex = /\[\[([^\]]+)\]\]/g;
  const choices = [];
  const narratorLinks = [];
  let match;

  // Track which links are inside narrator messages and extract them
  const narratorLinkPositions = new Set();
  for (const line of lines) {
    const trimmedLine = line.trim();
    // Clean the line first to detect Liz messages properly
    const cleanedForCheck = trimmedLine
      .replace(/^''+|''+$/g, "")
      .replace(/^\/\/+|\/\/+$/g, "")
      .trim();
    if (
      /^Liz\s*:/i.test(cleanedForCheck) ||
      /^Liz\s+.*says:/i.test(cleanedForCheck)
    ) {
      // Find all link positions in this narrator line
      let linkMatch;
      const lineLinkRegex = /\[\[([^\]]+)\]\]/g;
      while ((linkMatch = lineLinkRegex.exec(trimmedLine)) !== null) {
        // Find this link's position in the original content
        const linkText = linkMatch[0];
        let pos = content.indexOf(linkText);
        while (pos !== -1) {
          narratorLinkPositions.add(pos);
          pos = content.indexOf(linkText, pos + 1);
        }

        // Extract destination from narrator link
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

  while ((match = linkRegex.exec(content)) !== null) {
    // Skip this link if it's inside a narrator message
    if (narratorLinkPositions.has(match.index)) {
      continue;
    }

    const linkContent = match[1];
    let text, destination;

    if (linkContent.includes("->")) {
      // [[Text->Destination]]
      const parts = linkContent.split("->");
      text = parts[0].trim();
      destination = parts[1].trim();
    } else if (linkContent.includes("<-")) {
      // [[Destination<-Text]]
      const parts = linkContent.split("<-");
      destination = parts[0].trim();
      text = parts[1].trim();
    } else if (linkContent.includes("|")) {
      // [[Text|Destination]]
      const parts = linkContent.split("|");
      text = parts[0].trim();
      destination = parts[1].trim();
    } else {
      // [[Destination]] - use destination as text
      text = linkContent.trim();
      destination = linkContent.trim();
    }

    choices.push({ text, destination });
  }

  // If there are narrator links but no player choices, use the first narrator link as nextNode
  let nextNode = null;
  if (narratorLinks.length > 0 && choices.length === 0) {
    nextNode = narratorLinks[0];
  }

  // If no messages were found, add passage name as fallback system message
  if (messageSequence.length === 0) {
    messageSequence.push({
      type: "system",
      content: passageName,
    });
  }

  return {
    messageSequence,
    choices,
    nextNode,
  };
}
