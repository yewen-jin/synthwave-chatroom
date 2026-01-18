// roomDetection.js
// Shared room detection logic used by multiple modules

export const isRoom2 = window.location.pathname.includes("room2");
export const isNarratorRoom = window.location.pathname.includes("narrator-room");
export const isPlayerRoom =
  window.location.pathname.includes("player-room.html") ||
  window.location.pathname === "/player-room";
