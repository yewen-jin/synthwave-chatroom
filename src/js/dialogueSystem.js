// dialogueSystem.js
// Core dialogue engine - handles state, logic, and navigation

export class DialogueSystem {
    constructor() {
        this.dialogueData = null;
        this.currentNodeId = null;
        this.variables = {};
    }

    async loadDialogue(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to load dialogue: ${response.status}`);

            this.dialogueData = await response.json();
            this.currentNodeId = this.dialogueData.metadata.startNode;
            this.variables = {...this.dialogueData.variables};

            return true;
        } catch (error) {
            console.error('Error loading dialogue:', error);
            return false;
        }
    }

    getCurrentNode() {
        if (!this.dialogueData || !this.currentNodeId) return null;
        return this.dialogueData.nodes[this.currentNodeId];
    }

    getAvailableChoices() {
        const node = this.getCurrentNode();
        if (!node || !node.choices) return [];

        return node.choices.filter(choice =>
            this.evaluateConditions(choice.conditions)
        );
    }

    evaluateConditions(conditions) {
        if (!conditions) return true;

        for (let [key, value] of Object.entries(conditions)) {
            if (typeof value === 'string') {
                // Handle comparison operators
                if (value.startsWith('>=')) {
                    const threshold = parseFloat(value.substring(2));
                    if ((this.variables[key] || 0) < threshold) return false;
                } else if (value.startsWith('<=')) {
                    const threshold = parseFloat(value.substring(2));
                    if ((this.variables[key] || 0) > threshold) return false;
                } else if (value.startsWith('>')) {
                    const threshold = parseFloat(value.substring(1));
                    if ((this.variables[key] || 0) <= threshold) return false;
                } else if (value.startsWith('<')) {
                    const threshold = parseFloat(value.substring(1));
                    if ((this.variables[key] || 0) >= threshold) return false;
                }
            } else {
                // Handle equality
                if (this.variables[key] !== value) return false;
            }
        }

        return true;
    }

    applyEffects(effects) {
        if (!effects) return;

        for (let [key, value] of Object.entries(effects)) {
            if (typeof value === 'string') {
                if (value.startsWith('+')) {
                    this.variables[key] = (this.variables[key] || 0) + parseFloat(value.substring(1));
                } else if (value.startsWith('-')) {
                    this.variables[key] = (this.variables[key] || 0) - parseFloat(value.substring(1));
                } else {
                    this.variables[key] = value;
                }
            } else {
                this.variables[key] = value;
            }
        }
    }

    selectChoice(choiceId) {
        const availableChoices = this.getAvailableChoices();
        const choice = availableChoices.find(c => c.id === choiceId);

        if (!choice) {
            console.error('Invalid choice ID:', choiceId);
            return null;
        }

        // Apply effects
        this.applyEffects(choice.effects);

        // Navigate to next node
        this.currentNodeId = choice.nextNode;

        return this.getCurrentNode();
    }

    isEnded() {
        const node = this.getCurrentNode();
        return node && node.type === 'ending';
    }

    reset() {
        this.currentNodeId = this.dialogueData?.metadata.startNode || null;
        this.variables = {...(this.dialogueData?.variables || {})};
    }

    getVariables() {
        return {...this.variables};
    }

    setVariables(vars) {
        this.variables = {...vars};
    }

    setCurrentNode(nodeId) {
        this.currentNodeId = nodeId;
    }

    setDialogueData(data) {
        this.dialogueData = data;
    }
}
