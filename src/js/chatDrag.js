// chatDrag.js
export function initChatDrag() {
  const maximizeBtn = document.querySelector('.maximize');
  const msnWindow = document.querySelector('.msn-window');
  const titleBar = document.querySelector('.title-bar');
  let isDragging = false;
  let currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0;

  titleBar.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);

  maximizeBtn.addEventListener('click', () => {
    msnWindow.classList.toggle('maximized');
    if (msnWindow.classList.contains('maximized')) {
      isDragging = false;
      titleBar.style.cursor = 'default';
    } else {
      titleBar.style.cursor = 'grab';
    }
    maximizeBtn.textContent = msnWindow.classList.contains('maximized') ? '❐' : '□';
  });

  function dragStart(e) {
    if (msnWindow.classList.contains('maximized')) return;
    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;
    if (e.target === titleBar) {
      isDragging = true;
    }
  }
  function drag(e) {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      xOffset = currentX;
      yOffset = currentY;
      setTranslate(currentX, currentY, msnWindow);
    }
  }
  function dragEnd() {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
  }
  function setTranslate(xPos, yPos, el) {
    el.style.transform = `translate(${xPos}px, ${yPos}px)`;
  }
}
