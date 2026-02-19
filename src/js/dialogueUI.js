// dialogueUI.js
// UI rendering and interaction for dialogue popup

let dialoguePopup, narrativeText, choicesContainer, triggerButton;
let onChoiceSelectedCallback = null;

export function initDialogueUI(onChoiceSelected) {
    onChoiceSelectedCallback = onChoiceSelected;

    dialoguePopup = document.getElementById('dialogue-popup');
    narrativeText = document.getElementById('dialogue-narrative');
    choicesContainer = document.getElementById('dialogue-choices');
    triggerButton = document.getElementById('dialogue-trigger-btn');

    if (!dialoguePopup || !narrativeText || !choicesContainer) {
        console.warn('Dialogue UI elements not found - dialogue system disabled');
        return false;
    }

    return true;
}

export function showDialoguePopup(nodeData, choices) {
    if (!dialoguePopup) return;

    updateDialogueContent(nodeData, choices);
    dialoguePopup.style.display = 'flex';
}

export function hideDialoguePopup() {
    if (!dialoguePopup) return;
    dialoguePopup.style.display = 'none';
}

export function updateDialogueContent(nodeData, choices) {
    if (!narrativeText || !choicesContainer) return;

    // Update narrative text
    narrativeText.textContent = nodeData.text;

    // Clear and render choices
    choicesContainer.innerHTML = '';

    choices.forEach(choice => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = choice.displayText || choice.text;
        btn.dataset.choiceId = choice.id;

        btn.addEventListener('click', () => {
            if (onChoiceSelectedCallback) {
                setChoicesDisabled(true);
                onChoiceSelectedCallback(choice);
            }
        });

        choicesContainer.appendChild(btn);
    });
}

export function setTriggerButtonEnabled(enabled) {
    if (!triggerButton) return;
    triggerButton.disabled = !enabled;

    if (enabled) {
        triggerButton.querySelector('.btn-text').textContent = 'Initiate Transmission';
    } else {
        triggerButton.querySelector('.btn-text').textContent = 'Transmission Active...';
    }
}

export function setChoicesDisabled(disabled) {
    if (!choicesContainer) return;

    const buttons = choicesContainer.querySelectorAll('.choice-btn');
    buttons.forEach(btn => btn.disabled = disabled);
}
