// Offscreen document (AUDIO_PLAYBACK) : synthèse WebAudio des motifs sonores. Aucun fichier audio.
'use strict';

// Chaque note : [fréquence Hz, début s, durée s]. Total ≤ 600 ms par motif.
const PATTERNS = {
  ding: [[880, 0, 0.22]],
  double: [
    [880, 0, 0.14],
    [880, 0.2, 0.14],
  ],
  triple: [
    [660, 0, 0.12],
    [880, 0.16, 0.12],
    [1100, 0.32, 0.16],
  ],
  low: [[440, 0, 0.3]],
  high: [[1320, 0, 0.18]],
};

const PEAK_GAIN = 0.35;
const ATTACK_S = 0.008;

let context = null;

async function play(name) {
  const notes = PATTERNS[name] || PATTERNS.ding;
  if (!context) context = new AudioContext();
  if (context.state !== 'running') await context.resume();

  const start = context.currentTime + 0.02;
  for (const [frequency, offset, duration] of notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    const t0 = start + offset;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, t0 + ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(t0);
    oscillator.stop(t0 + duration + 0.02);
  }
  return context.state;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target !== 'offscreen' || message.type !== 'play') return false;
  play(message.pattern).then(
    (state) => {
      console.info('[Lequel] son joué', message.pattern, state);
      sendResponse({ ok: true, state });
    },
    (error) => sendResponse({ ok: false, reason: String(error && error.message) }),
  );
  return true;
});
