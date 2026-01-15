// dialogueController.js
// Two-room dialogue system: Player (player-room) and Narrator (narrator-room)

import { DialogueSystem } from "./dialogueSystem.js";

let dialogueSystem = null;
let socket = null;
let username = null;
let flashCallback = null;
let isActive = false;
let displayedSystemMessages = new Set(); // Track which nodes have shown their system message

// Detect which room we're in
const isPlayerRoom =
  window.location.pathname.includes("player-room.html") ||
  window.location.pathname === "/player-room";
const isNarratorRoom = window.location.pathname.includes("narrator-room");

export function initDialogueController(
  socketInstance,
  user,
  onMessageCallback,
  onFlashCallback
) {
  socket = socketInstance;
  username = user;
  flashCallback = onFlashCallback;
  // Note: onMessageCallback is not used - chat messages are handled via socket events

  if (isNarratorRoom) {
    initNarratorRoom();
  } else if (isPlayerRoom) {
    dialogueSystem = new DialogueSystem(); // Only needed for player room
    initPlayerRoom();
  }

  console.log(
    `Dialogue controller initialized for ${
      isNarratorRoom ? "narrator (narrator-room)" : "player (player-room)"
    }`
  );
}

// ========== NARRATOR (narrator-room) ==========
function initNarratorRoom() {
  const triggerBtn = document.getElementById("dialogue-trigger-btn");
  const narratorPopup = document.getElementById("narrator-popup");
  const narratorText = document.getElementById("narrator-text");
  const continueBtn = document.getElementById("narrator-continue-btn");

  if (!triggerBtn || !narratorPopup || !narratorText || !continueBtn) {
    console.warn("Narrator UI elements not found");
    return;
  }

  // Trigger button starts dialogue in player-room
  triggerBtn.addEventListener("click", () => {
    console.log("Narrator: Starting dialogue in player-room");
    socket.emit("dialogue-start", {
      dialogueId: "thebodyisobsolete",
      targetRoom: "player-room",
    });

    triggerBtn.disabled = true;
    const btnText = triggerBtn.querySelector(".btn-text");
    if (btnText) btnText.textContent = "Transmission Active...";
  });

  // Listen for player choices (for monitoring only - server auto-sends responses)
  socket.on("player-choice-made", (data) => {
    console.log("Narrator: Player made choice (monitoring mode)");
    console.log("Player choice:", data.playerChoice);
    console.log("Narrator response:", data.narratorResponse);
    console.log("Is ending:", data.isEnding);

    isActive = true;

    // Store the narrator response text for monitoring
    narratorText.textContent = data.narratorResponse;

    // Show popup briefly so narrator can see what's being sent by server
    narratorPopup.style.display = "flex";
    continueBtn.disabled = true; // Disable button since server handles sending
    continueBtn.textContent = "Server Sending...";

    // Auto-hide popup after showing the response (server handles actual sending)
    setTimeout(() => {
      narratorPopup.style.display = "none";
      continueBtn.disabled = false;
      continueBtn.textContent = "Continue";
    }, 2000); // Show for 2 seconds for monitoring
  });

  // Continue button is disabled during auto-send mode
  continueBtn.addEventListener("click", () => {
    console.log("Continue button clicked (currently in monitoring mode only)");
  });

  // Listen for dialogue end
  socket.on("dialogue-end", () => {
    console.log("Narrator: Dialogue ended");
    isActive = false;
    narratorPopup.style.display = "none";
    triggerBtn.disabled = false;
    const btnText = triggerBtn.querySelector(".btn-text");
    if (btnText) btnText.textContent = "Initiate Transmission";
  });
}

// ========== PLAYER (player-room) ==========
function initPlayerRoom() {
  const normalInputContainer = document.getElementById(
    "normal-input-container"
  );
  const choicesInlineContainer = document.getElementById(
    "dialogue-choices-inline"
  );
  const sendBtn = document.getElementById("send-btn");
  const narratorStatusEl = document.getElementById("narrator-status");

  if (!normalInputContainer || !choicesInlineContainer || !sendBtn) {
    console.warn("Player dialogue UI elements not found");
    return;
  }

  // Listen for narrator online/offline status
  socket.on("narrator-status", (data) => {
    // Only update status if dialogue is NOT active
    // During active dialogue, server handles responses, so we show "Online"
    if (narratorStatusEl && !isActive) {
      narratorStatusEl.textContent = data.online ? "Online" : "Offline";
      narratorStatusEl.classList.toggle("offline", !data.online);
    }
  });

  // Request current narrator status on init
  socket.emit("request-narrator-status");

  // Listen for when dialogue starts (to show typing status immediately)
  socket.on("dialogue-started", () => {
    console.log("Player: Dialogue started, showing typing status");
    if (narratorStatusEl) {
      narratorStatusEl.textContent = "typing...";
      narratorStatusEl.classList.add("typing");
      narratorStatusEl.classList.remove("offline");
    }
  });

  // Listen for dialogue sync from narrator
  socket.on("dialogue-sync", (data) => {
    if (!data.active) return;

    console.log("Player: Dialogue sync received:", data.currentNode);
    isActive = true;

    // Sync local state
    if (!dialogueSystem.dialogueData) {
      dialogueSystem.setDialogueData(data.dialogueData);
    }

    dialogueSystem.setCurrentNode(data.currentNode);
    dialogueSystem.setVariables(data.variables);

    // Get current node and choices
    const currentNodeData =
      data.nodeData || dialogueSystem.getCurrentNode();
    const choices = dialogueSystem.getAvailableChoices();

    // Determine node type
    const hasChoices = choices && choices.length > 0;
    const hasNarratorMessages =
      currentNodeData.narratorMessages &&
      currentNodeData.narratorMessages.length > 0;

    // TYPE 1: Player choice node (has choices)
    if (hasChoices) {
      console.log("Player: Choice node - showing choice buttons");

      // Display system message text if present (before showing choices)
      // Only display once per node
      if (
        currentNodeData.text &&
        currentNodeData.text.trim().length > 0 &&
        !displayedSystemMessages.has(data.currentNode)
      ) {
        console.log(
          "Player: Displaying system message before choices:",
          currentNodeData.text
        );
        const chatBody = document.getElementById("chatBody");
        if (chatBody) {
          const systemMsg = document.createElement("div");
          systemMsg.className = "system-message";
          systemMsg.textContent = currentNodeData.text;
          chatBody.appendChild(systemMsg);
          chatBody.scrollTop = chatBody.scrollHeight;
          displayedSystemMessages.add(data.currentNode);
        }
      }

      // Hide normal input, show choices inline
      normalInputContainer.style.display = "none";
      sendBtn.style.display = "none";
      choicesInlineContainer.style.display = "flex";

      // Render choice buttons
      choicesInlineContainer.innerHTML = "";
      choices.forEach((choice) => {
        const btn = document.createElement("button");
        btn.className = "choice-btn";
        btn.textContent = choice.text;

        btn.addEventListener("click", () => {
          handlePlayerChoice(choice);
          // Disable all buttons
          choicesInlineContainer
            .querySelectorAll(".choice-btn")
            .forEach((b) => (b.disabled = true));
        });

        choicesInlineContainer.appendChild(btn);
      });

      // Clear typing status when choices arrive
      if (narratorStatusEl) {
        narratorStatusEl.textContent = "Online";
        narratorStatusEl.classList.remove("typing", "offline");
      }
    }
    // TYPE 2: Narrator message or system message node (no choices)
    else {
      console.log(
        "Player: Auto-advancing node - hiding choices, keeping normal input hidden"
      );

      // Keep input hidden during auto-advancing nodes
      choicesInlineContainer.style.display = "none";
      normalInputContainer.style.display = "none";
      sendBtn.style.display = "none";

      // Display system message text if present (only once per node)
      if (
        currentNodeData.text &&
        currentNodeData.text.trim().length > 0 &&
        !displayedSystemMessages.has(data.currentNode)
      ) {
        console.log("Player: Displaying system message:", currentNodeData.text);
        const chatBody = document.getElementById("chatBody");
        if (chatBody) {
          const systemMsg = document.createElement("div");
          systemMsg.className = "system-message";
          systemMsg.textContent = currentNodeData.text;
          chatBody.appendChild(systemMsg);
          chatBody.scrollTop = chatBody.scrollHeight;
          displayedSystemMessages.add(data.currentNode);
        }
      }

      // Show typing status if narrator will send messages
      if (hasNarratorMessages && narratorStatusEl) {
        narratorStatusEl.textContent = "typing...";
        narratorStatusEl.classList.add("typing");
        narratorStatusEl.classList.remove("offline");
      }
    }

    // Flash visual effect
    if (flashCallback) flashCallback();
  });

  // Listen for dialogue end
  socket.on("dialogue-end", () => {
    console.log("Player: Dialogue ended");
    isActive = false;
    choicesInlineContainer.style.display = "none";
    normalInputContainer.style.display = "block";
    sendBtn.style.display = "block";

    // Clear displayed system messages tracker for next dialogue
    displayedSystemMessages.clear();

    // Clear typing status and request actual narrator status
    if (narratorStatusEl) {
      narratorStatusEl.classList.remove("typing");
      // Request actual narrator status now that dialogue ended
      socket.emit("request-narrator-status");
    }
  });
}

function handlePlayerChoice(choice) {
  console.log("Player: Choice selected:", choice.text);

  // Show typing status
  const narratorStatusEl = document.getElementById("narrator-status");
  if (narratorStatusEl) {
    narratorStatusEl.textContent = "typing...";
    narratorStatusEl.classList.add("typing");
    narratorStatusEl.classList.remove("offline");
  }

  // Hide choices immediately
  const choicesInlineContainer = document.getElementById(
    "dialogue-choices-inline"
  );
  if (choicesInlineContainer) choicesInlineContainer.style.display = "none";

  // Show normal input again
  const normalInputContainer = document.getElementById(
    "normal-input-container"
  );
  const sendBtn = document.getElementById("send-btn");
  if (normalInputContainer) normalInputContainer.style.display = "block";
  if (sendBtn) sendBtn.style.display = "block";

  // Send choice to server (will auto-post to chat and trigger narrator response)
  socket.emit("player-choice", {
    choiceId: choice.id,
    choiceText: choice.text,
    username: username,
  });
}
