// chatUI.js
// Determine if we're in room2 or narrator-room
export const isRoom2 = window.location.pathname.includes("room2");
// export const isNarratorRoom = window.location.pathname.includes('narrator-room');

//roomName variable is not being used here. why?
// const roomName = isRoom2 ? 'room2' : (isNarratorRoom ? 'narrator-room' : 'default');

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

  // For room2 (hidden input), listen on the document when popup is visible
  if (isRoom2) {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && usernamePopup.style.display !== "none") {
        e.preventDefault();
        onUsernameSubmit();
      }
    });
  }

  // Apply room-specific styling if needed
  if (isRoom2) {
    document.querySelector(".msn-window")?.classList.add("room2-window");
    document.querySelector(".title-bar")?.classList.add("room2-title");
    document.querySelector(".chat-area")?.classList.add("room2-chat-area");
    // Any other room2-specific UI modifications
  }
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
  const inRoom2 = window.location.pathname.includes("room2");
  const inNarratorRoom = window.location.pathname.includes("narrator-room");

  // Only update in room2 or narrator-room, and skip narrator usernames
  // Skip "Symoné" (room2 narrator) and "Liz" (narrator-room narrator)
  if ((!inRoom2 && !inNarratorRoom) || name === "Symoné" || name === "Liz")
    return;

  const lastJoinedElement = document.getElementById("last-joined-user");
  if (lastJoinedElement) {
    lastJoinedElement.textContent = name;
  }
}
