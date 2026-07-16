// make-placeholder-audio.js — generate dev placeholder tracks for the card game.
//
// The real tracks come from Symone as MP3s and live in audio-assets/ (which is
// gitignored, so re-exports never enter git history). For local dev this script
// regenerates a few short, distinct-tone WAVs so the selection/playback flow is
// testable without the final audio. The mechanism is format-agnostic — the
// server lists whatever files are in audio-assets/ and the client <audio>
// element plays them, so swapping WAV placeholders for MP3 masters needs no
// code change.
//
// Run: npm run make:audio   (or: node scripts/make-placeholder-audio.js)
//
// Track COUNT is data-driven — add or remove entries in TRACKS below to change
// how many placeholders are generated. Final count for the show is still open
// (1–5, per Symone); see __context__/thisverisionofme-plan.md.

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = join(__dirname, "..", "audio-assets");

// Distinct tones so you can hear which track is playing during dev.
const TRACKS = [
  { name: "track-1.wav", freq: 220.0, label: "Track 1 (low)" },
  { name: "track-2.wav", freq: 330.0, label: "Track 2 (mid)" },
  { name: "track-3.wav", freq: 440.0, label: "Track 3 (high)" },
];

const SAMPLE_RATE = 44100;
const DURATION_SEC = 3;
const AMPLITUDE = 0.2; // moderate so it's audible but not harsh

function buildWav(freq) {
  const numSamples = SAMPLE_RATE * DURATION_SEC;
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt subchunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // PCM subchunk size
  buffer.writeUInt16LE(1, 20); // audio format = PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample

  // data subchunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Sine tone samples
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin(2 * Math.PI * freq * (i / SAMPLE_RATE)) * AMPLITUDE;
    const int16 = Math.round(sample * 32767);
    buffer.writeInt16LE(int16, 44 + i * 2);
  }
  return buffer;
}

mkdirSync(OUT_DIR, { recursive: true });

for (const { name, freq, label } of TRACKS) {
  writeFileSync(join(OUT_DIR, name), buildWav(freq));
  console.log(`wrote ${name}  (${DURATION_SEC}s, ${freq} Hz) — ${label}`);
}
console.log(`\n${TRACKS.length} placeholder tracks in ${OUT_DIR}`);
