'use client';

/**
 * Tiny synthesized table sounds. No audio files: each cue is a short burst of
 * filtered noise or a sine blip made with WebAudio, so there is nothing to load.
 */

export type Cue = 'deal' | 'land' | 'pass' | 'sweep' | 'finish' | 'turn';

const MUTE_KEY = 'maskmen.muted';

let ctx: AudioContext | null = null;
let muted: boolean | null = null;

export function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = window.localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    window.localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // Storage can be unavailable (private windows); the choice just won't persist.
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  // Browsers start the context suspended until the page has seen a gesture.
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx.state === 'running' ? ctx : null;
}

function noise(ac: AudioContext, duration: number, frequency: number, gain: number): void {
  const length = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  const amp = ac.createGain();
  amp.gain.value = gain;
  src.connect(filter).connect(amp).connect(ac.destination);
  src.start();
}

function tone(ac: AudioContext, frequency: number, start: number, duration: number, gain: number): void {
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  const amp = ac.createGain();
  const t = ac.currentTime + start;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(gain, t + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export function playSound(cue: Cue): void {
  if (typeof window === 'undefined' || isMuted()) return;
  const ac = audio();
  if (!ac) return;
  switch (cue) {
    case 'deal':
      noise(ac, 0.12, 2400, 0.25);
      break;
    case 'land':
      noise(ac, 0.08, 900, 0.5);
      break;
    case 'pass':
      tone(ac, 330, 0, 0.18, 0.12);
      tone(ac, 247, 0.09, 0.22, 0.1);
      break;
    case 'sweep':
      noise(ac, 0.35, 1400, 0.3);
      break;
    case 'finish':
      [523, 659, 784].forEach((f, i) => tone(ac, f, i * 0.08, 0.3, 0.12));
      break;
    case 'turn':
      tone(ac, 880, 0, 0.16, 0.1);
      tone(ac, 1175, 0.1, 0.22, 0.1);
      break;
  }
}
