// chatUI.js

let chatBody,
  chatInput,
  sendBtn,
  usernamePopup,
  usernameInput,
  usernameSubmit,
  errorMessage;

export function initChatUI(onSend, onUsernameSubmit) {
  chatBody = document.getElementById("chatBody");
  chatInput = document.getElementById("chatInput");
  sendBtn = document.querySelector(".send-btn");
  usernamePopup = document.getElementById("username-popup");
  usernameInput = document.getElementById("username-input");
  usernameSubmit = document.getElementById("username-submit");

  // Error message for username
  errorMessage = document.createElement("p");
  errorMessage.style.color = "#ff0000";
  errorMessage.style.display = "none";
  errorMessage.textContent = "This name has been taken, please use another one";
  document.querySelector(".login-content").appendChild(errorMessage);

  sendBtn.addEventListener("click", onSend);
  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  });
  usernameSubmit.addEventListener("click", onUsernameSubmit);

  // For visible inputs (room1, index), listen on the input field
  usernameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onUsernameSubmit();
    }
  });
}

export function getChatInput() {
  return chatInput.value.trim();
}

export function clearChatInput() {
  chatInput.value = "";
}

export function addMessageToChat(element) {
  chatBody.appendChild(element);
  chatBody.scrollTop = chatBody.scrollHeight;
}

export function showUsernamePopup() {
  usernamePopup.style.display = "flex";
}

export function hideUsernamePopup() {
  usernamePopup.style.display = "none";
}

export function getUsernameInput() {
  return usernameInput.value.trim();
}

export function showErrorMessage() {
  errorMessage.style.display = "block";
}

export function hideErrorMessage() {
  errorMessage.style.display = "none";
}

export function updateUserDisplayName(name) {
  const displayNameElement = document.getElementById("user-display-name");
  if (displayNameElement) {
    displayNameElement.textContent = name;
  }
}

export function updateLastJoinedUser(name) {
  // Check room at runtime to ensure correct detection
  const lastJoinedElement = document.getElementById("last-joined-user");
  if (lastJoinedElement) {
    lastJoinedElement.textContent = name;
  }
}
