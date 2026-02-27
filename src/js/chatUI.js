// chatUI.js
import * as GameParameters from "../../shared/gameParameters.js";

let chatBody,
  chatInput,
  sendBtn,
  usernamePopup,
  usernameInput,
  usernameSubmit,
  usernameNo,
  customUsernameInput,
  customUsernameSubmit,
  nameInputContainer,
  yesNoButtons,
  errorMessage;

export function initChatUI(onSend, onUsernameSubmit) {
  chatBody = document.getElementById("chatBody");
  chatInput = document.getElementById("chatInput");
  sendBtn = document.querySelector(".send-btn");
  usernamePopup = document.getElementById("username-popup");
  usernameInput = document.getElementById("username-input");
  usernameSubmit = document.getElementById("username-submit");
  usernameNo = document.getElementById("username-no");
  customUsernameInput = document.getElementById("custom-username-input");
  customUsernameSubmit = document.getElementById("custom-username-submit");
  nameInputContainer = document.getElementById("name-input-container");
  yesNoButtons = document.getElementById("yes-no-buttons");

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

  // Handle "No" button - show custom name input
  if (usernameNo) {
    usernameNo.addEventListener("click", () => {
      yesNoButtons.style.display = "none";
      document.getElementById("login-question").style.display = "none";
      nameInputContainer.style.display = "block";
      hideErrorMessage();
    });
  }

  // Handle custom username submit
  if (customUsernameSubmit) {
    customUsernameSubmit.addEventListener("click", () => {
      if (customUsernameInput && customUsernameInput.value.trim()) {
        usernameInput.value = customUsernameInput.value.trim();
        onUsernameSubmit();
      }
    });
  }

  // Handle Enter key on custom username input
  if (customUsernameInput) {
    customUsernameInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (customUsernameInput.value.trim()) {
          usernameInput.value = customUsernameInput.value.trim();
          onUsernameSubmit();
        }
      }
    });
  }

  // For visible inputs (room1, index), listen on the input field
  usernameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onUsernameSubmit();
    }
  });

  // For hidden inputs (narrator-room "Are you Liz?"), allow Enter to submit
  if (usernameInput.type === "hidden") {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && usernamePopup.style.display !== "none") {
        e.preventDefault();
        onUsernameSubmit();
      }
    });
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

  // If the element contains images, scroll again after they load
  const images = element.querySelectorAll("img");
  images.forEach((img) => {
    if (!img.complete) {
      img.addEventListener("load", () => {
        chatBody.scrollTop = chatBody.scrollHeight;
      });
    }
  });
}

export function scrollChatToBottom() {
  if (chatBody) {
    chatBody.scrollTop = chatBody.scrollHeight;
  }
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
  /* if ((!inRoom2 && !inNarratorRoom) || name === "Symoné" || name === "Liz")
    return; */
  const lastJoinedElement = document.getElementById("last-joined-user");

  //make sure to only show names that are not "hosts"
  if (
    lastJoinedElement &&
    name !== GameParameters.HOST_USERNAME &&
    name !== GameParameters.NARRATOR_USERNAME
  ) {
    lastJoinedElement.textContent = name;
    console.log("last joined user:", lastJoinedElement.textContent);
  }
}

export function updateLastJoinedPlayer(name) {
  const lastJoinedPlayer = document.getElementById("last-joined-player");
  if (
    lastJoinedPlayer &&
    name !== GameParameters.HOST_USERNAME &&
    name !== GameParameters.NARRATOR_USERNAME
  ) {
    lastJoinedPlayer.textContent = name;
    console.log("last joined player:", lastJoinedPlayer.textContent);
  }
}
