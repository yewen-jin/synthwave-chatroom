// dialogueSystem.js
// Core dialogue engine - handles state, logic, and navigation
// dialogueSystem is a class of object that parse the json narrative notation

export class DialogueSystem {
  constructor() {
    this.dialogueData = null;
    this.currentNodeId = null;
    this.variables = {};
  }

  getCurrentNode() {
    if (!this.dialogueData || !this.currentNodeId) return null;
    return this.dialogueData.nodes[this.currentNodeId];
  }

  getAvailableChoices() {
    const node = this.getCurrentNode();
    if (!node || !node.choices) return [];

    return node.choices.filter((choice) =>
      this.evaluateConditions(choice.conditions),
    );
  }

  evaluateConditions(conditions) {
    if (!conditions) return true;

    for (let [key, value] of Object.entries(conditions)) {
      if (typeof value === "string") {
        // Handle comparison operators
        if (value.startsWith(">=")) {
          const threshold = parseFloat(value.substring(2));
          if ((this.variables[key] || 0) < threshold) return false;
        } else if (value.startsWith("<=")) {
          const threshold = parseFloat(value.substring(2));
          if ((this.variables[key] || 0) > threshold) return false;
        } else if (value.startsWith(">")) {
          const threshold = parseFloat(value.substring(1));
          if ((this.variables[key] || 0) <= threshold) return false;
        } else if (value.startsWith("<")) {
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

  isEnded() {
    const node = this.getCurrentNode();
    return node && node.type === "ending";
  }

  reset() {
    this.currentNodeId = this.dialogueData?.metadata.startNode || null;
    this.variables = { ...(this.dialogueData?.variables || {}) };
  }

  getVariables() {
    return { ...this.variables };
  }

  setVariables(vars) {
    this.variables = { ...vars };
  }

  setCurrentNode(nodeId) {
    this.currentNodeId = nodeId;
  }

  setDialogueData(data) {
    this.dialogueData = data;
  }
}
