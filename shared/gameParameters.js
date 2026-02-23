// Shared constants used by both server and client
// ========== NARRATOR USERNAME CONFIG ==========
// Change this value to update the narrator's display name everywhere
export const NARRATOR_USERNAME = "Liz";
export const HOST_USERNAME = "Symoné";
export const MESSAGE_DELAY_MS = 2000;
export const SYSTEM_MESSAGE_DELAY_MS = 2000;
export const ENDING_DELAY_MS = 2000;
export const STATE_CLEANUP_MS = 5 * 60 * 1000;

// Delay modes: "dynamic" (narrator length-based), "fallback" (fixed 2000ms), "test" (0ms instant)
export const DELAY_MODE = "dynamic";

// Dynamic mode constants (narrator only)
export const NARRATOR_DELAY_BASE_MS = 500;
export const NARRATOR_DELAY_PER_CHAR_MS = 40;
export const NARRATOR_DELAY_MIN_MS = 1000;
export const NARRATOR_DELAY_MAX_MS = 6000;
