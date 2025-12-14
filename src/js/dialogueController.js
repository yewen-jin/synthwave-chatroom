// dialogueController.js
// Two-room dialogue system: Player (game-room) and Narrator (game-room2)

import { DialogueSystem } from './dialogueSystem.js';

let dialogueSystem = null;
let socket = null;
let username = null;
let flashCallback = null;
let isActive = false;

// Detect which room we're in
const isGameRoom = window.location.pathname.includes('game-room.html') || window.location.pathname === '/game-room';
const isGameRoom2 = window.location.pathname.includes('game-room2');

export function initDialogueController(socketInstance, user, onMessageCallback, onFlashCallback) {
    socket = socketInstance;
    username = user;
    flashCallback = onFlashCallback;

    dialogueSystem = new DialogueSystem();

    if (isGameRoom2) {
        initNarratorRoom();
    } else if (isGameRoom) {
        initPlayerRoom();
    }

    console.log(`Dialogue controller initialized for ${isGameRoom2 ? 'narrator (game-room2)' : 'player (game-room)'}`);
}

// ========== NARRATOR (game-room2) ==========
function initNarratorRoom() {
    const triggerBtn = document.getElementById('dialogue-trigger-btn');
    const narratorPopup = document.getElementById('narrator-popup');
    const narratorText = document.getElementById('narrator-text');
    const continueBtn = document.getElementById('narrator-continue-btn');

    if (!triggerBtn || !narratorPopup || !narratorText || !continueBtn) {
        console.warn('Narrator UI elements not found');
        return;
    }

    // Trigger button starts dialogue in game-room
    triggerBtn.addEventListener('click', () => {
        if (isActive) return;

        console.log('Narrator: Starting dialogue in game-room');
        socket.emit('dialogue-start', {
            dialogueId: 'episode1',
            targetRoom: 'game-room'
        });

        triggerBtn.disabled = true;
        const btnText = triggerBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'Transmission Active...';
    });

    // Listen for player choices (to show narrator response)
    socket.on('player-choice-made', (data) => {
        console.log('Narrator: Player made choice, showing response');
        isActive = true;

        // Show the narrator response popup with the planned response
        narratorText.textContent = data.narratorResponse;
        narratorPopup.style.display = 'flex';
        continueBtn.disabled = false;
    });

    // Continue button sends narrator response to chat
    continueBtn.addEventListener('click', () => {
        continueBtn.disabled = true;

        socket.emit('narrator-continue', {
            text: narratorText.textContent,
            username: username
        });

        // Hide popup after sending
        setTimeout(() => {
            narratorPopup.style.display = 'none';
        }, 500);
    });

    // Listen for dialogue end
    socket.on('dialogue-end', () => {
        console.log('Narrator: Dialogue ended');
        isActive = false;
        narratorPopup.style.display = 'none';
        triggerBtn.disabled = false;
        const btnText = triggerBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'Initiate Transmission';
    });
}

// ========== PLAYER (game-room) ==========
function initPlayerRoom() {
    const dialoguePopup = document.getElementById('dialogue-popup');
    const narrativeText = document.getElementById('dialogue-narrative');
    const choicesContainer = document.getElementById('dialogue-choices');

    if (!dialoguePopup || !narrativeText || !choicesContainer) {
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

        // Show popup with choices
        const node = dialogueSystem.getCurrentNode();
        const choices = dialogueSystem.getAvailableChoices();

        narrativeText.textContent = node.text;

        // Render choice buttons
        choicesContainer.innerHTML = '';
        choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = choice.text;

            btn.addEventListener('click', () => {
                handlePlayerChoice(choice);
                // Disable all buttons
                choicesContainer.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);
            });

            choicesContainer.appendChild(btn);
        });

        dialoguePopup.style.display = 'flex';

        // Flash visual effect
        if (flashCallback) flashCallback();
    });

    // Listen for narrator response (close player popup and wait)
    socket.on('narrator-response-sent', () => {
        console.log('Player: Narrator sent response, hiding popup');
        dialoguePopup.style.display = 'none';
    });

    // Listen for dialogue end
    socket.on('dialogue-end', () => {
        console.log('Player: Dialogue ended');
        isActive = false;
        dialoguePopup.style.display = 'none';
    });
}

function handlePlayerChoice(choice) {
    console.log('Player: Choice selected:', choice.text);

    // Hide popup immediately
    const dialoguePopup = document.getElementById('dialogue-popup');
    if (dialoguePopup) dialoguePopup.style.display = 'none';

    // Send choice to server (will auto-post to chat and trigger narrator response)
    socket.emit('player-choice', {
        choiceId: choice.id,
        choiceText: choice.text,
        username: username
    });
}
