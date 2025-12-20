// dialogueController.js
// Two-room dialogue system: Player (player-room) and Narrator (narrator-room)

import { DialogueSystem } from './dialogueSystem.js';

let dialogueSystem = null;
let socket = null;
let username = null;
let flashCallback = null;
let isActive = false;
let currentIsEnding = false;

// Detect which room we're in
const isPlayerRoom = window.location.pathname.includes('player-room.html') || window.location.pathname === '/player-room';
const isNarratorRoom = window.location.pathname.includes('narrator-room');

export function initDialogueController(socketInstance, user, onMessageCallback, onFlashCallback) {
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

    console.log(`Dialogue controller initialized for ${isNarratorRoom ? 'narrator (narrator-room)' : 'player (player-room)'}`);
}

// ========== NARRATOR (narrator-room) ==========
function initNarratorRoom() {
    const triggerBtn = document.getElementById('dialogue-trigger-btn');
    const narratorPopup = document.getElementById('narrator-popup');
    const narratorText = document.getElementById('narrator-text');
    const continueBtn = document.getElementById('narrator-continue-btn');

    if (!triggerBtn || !narratorPopup || !narratorText || !continueBtn) {
        console.warn('Narrator UI elements not found');
        return;
    }

    // Trigger button starts dialogue in player-room
    triggerBtn.addEventListener('click', () => {
        console.log('Narrator: Starting dialogue in player-room');
        socket.emit('dialogue-start', {
            dialogueId: 'episode1',
            targetRoom: 'player-room'
        });

        triggerBtn.disabled = true;
        const btnText = triggerBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'Transmission Active...';
    });

    // Function to handle continue action
    function handleContinue() {
        if (continueBtn.disabled) return;
        
        continueBtn.disabled = true;
        console.log('Sending narrator-continue with isEnding:', currentIsEnding);

        socket.emit('narrator-continue', {
            text: narratorText.textContent,
            username: 'Symoné',
            isEnding: currentIsEnding
        });

        // Hide popup after sending
        setTimeout(() => {
            narratorPopup.style.display = 'none';
        }, 500);
    }

    // Listen for player choices (to show narrator response)
    socket.on('player-choice-made', (data) => {
        console.log('Narrator: Player made choice, auto-sending response');
        console.log('isEnding value received:', data.isEnding);
        isActive = true;
        currentIsEnding = data.isEnding === true;

        // Store the narrator response text
        narratorText.textContent = data.narratorResponse;
        
        // Show popup briefly so narrator can see what's being sent
        narratorPopup.style.display = 'flex';
        continueBtn.disabled = false;

        // Auto-send after a short delay (1.5 seconds)
        setTimeout(() => {
            handleContinue();
        }, 1500);
    });

    // Continue button still works for manual override if needed
    continueBtn.addEventListener('click', handleContinue);

    // Enter key also triggers continue when popup is visible
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && narratorPopup.style.display === 'flex') {
            e.preventDefault();
            handleContinue();
        }
    });

    // Listen for dialogue end
    socket.on('dialogue-end', () => {
        console.log('Narrator: Dialogue ended');
        isActive = false;
        currentIsEnding = false;
        narratorPopup.style.display = 'none';
        triggerBtn.disabled = false;
        const btnText = triggerBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'Initiate Transmission';
    });
}

// ========== PLAYER (player-room) ==========
function initPlayerRoom() {
    const normalInputContainer = document.getElementById('normal-input-container');
    const choicesInlineContainer = document.getElementById('dialogue-choices-inline');
    const sendBtn = document.getElementById('send-btn');

    if (!normalInputContainer || !choicesInlineContainer || !sendBtn) {
        console.warn('Player dialogue UI elements not found');
        return;
    }

    // Listen for dialogue sync from narrator
    socket.on('dialogue-sync', (data) => {
        if (!data.active) return;

        console.log('Player: Dialogue sync received:', data.currentNode);
        isActive = true;

        // Sync local state
        if (!dialogueSystem.dialogueData) {
            dialogueSystem.setDialogueData(data.dialogueData);
        }

        dialogueSystem.setCurrentNode(data.currentNode);
        dialogueSystem.setVariables(data.variables);

        // Get choices (don't show the narrative text)
        const choices = dialogueSystem.getAvailableChoices();

        // Hide normal input, show choices inline
        normalInputContainer.style.display = 'none';
        sendBtn.style.display = 'none';
        choicesInlineContainer.style.display = 'flex';

        // Render choice buttons
        choicesInlineContainer.innerHTML = '';
        choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = choice.text;

            btn.addEventListener('click', () => {
                handlePlayerChoice(choice);
                // Disable all buttons
                choicesInlineContainer.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);
            });

            choicesInlineContainer.appendChild(btn);
        });

        // Flash visual effect
        if (flashCallback) flashCallback();
    });

    // Listen for narrator response (hide choices, show normal input)
    socket.on('narrator-response-sent', () => {
        console.log('Player: Narrator sent response, hiding choices');
        choicesInlineContainer.style.display = 'none';
        normalInputContainer.style.display = 'block';
        sendBtn.style.display = 'block';
    });

    // Listen for dialogue end
    socket.on('dialogue-end', () => {
        console.log('Player: Dialogue ended');
        isActive = false;
        choicesInlineContainer.style.display = 'none';
        normalInputContainer.style.display = 'block';
        sendBtn.style.display = 'block';
    });
}

function handlePlayerChoice(choice) {
    console.log('Player: Choice selected:', choice.text);

    // Hide choices immediately
    const choicesInlineContainer = document.getElementById('dialogue-choices-inline');
    if (choicesInlineContainer) choicesInlineContainer.style.display = 'none';

    // Show normal input again
    const normalInputContainer = document.getElementById('normal-input-container');
    const sendBtn = document.getElementById('send-btn');
    if (normalInputContainer) normalInputContainer.style.display = 'block';
    if (sendBtn) sendBtn.style.display = 'block';

    // Send choice to server (will auto-post to chat and trigger narrator response)
    socket.emit('player-choice', {
        choiceId: choice.id,
        choiceText: choice.text,
        username: username
    });
}
