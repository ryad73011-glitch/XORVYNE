/**
 * Procedural audio generation.
 *
 * Sound effects and music beds in the asset library are *generated locally*
 * with deterministic local sample synthesis and encoded to real WAV files. They are demo assets —
 * clearly labelled as such — but they are genuine audio that can be placed on
 * the timeline and rendered into the exported file.
 */
import type { MusicDefinition, SfxDefinition } from '@shared/catalog.js';

const SAMPLE_RATE = 44100;

export interface WavData {
  samples: Float32Array;
  sampleRate: number;
}

export function encodeWav(data: WavData): Blob {
  const { samples, sampleRate } = data;
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function envelope(index: number, length: number, attack = 0.01, release = 0.3): number {
  const t = index / length;
  const attackEnd = attack;
  const releaseStart = 1 - release;
  if (t < attackEnd) return t / attackEnd;
  if (t > releaseStart) return Math.max(0, (1 - t) / release);
  return 1;
}

export function renderSfx(definition: SfxDefinition): WavData {
  const { kind, durationMs } = definition.recipe;
  const length = Math.max(1, Math.floor((durationMs / 1000) * SAMPLE_RATE));
  const samples = new Float32Array(length);
  const random = mulberry32(kind.length * 7919 + durationMs);
  let phase = 0;

  for (let index = 0; index < length; index += 1) {
    const t = index / SAMPLE_RATE;
    const progress = index / length;
    let value = 0;

    switch (kind) {
      case 'noise-sweep': {
        const cutoff = 400 + progress * 6000;
        const noise = (random() * 2 - 1) * 0.8;
        const filtered = noise * (cutoff / 8000);
        value = filtered * envelope(index, length, 0.12, 0.45);
        break;
      }
      case 'click': {
        const noise = (random() * 2 - 1);
        value = (noise * 0.6 + Math.sin(2 * Math.PI * 1800 * t) * 0.4) * Math.exp(-progress * 18);
        break;
      }
      case 'typewriter': {
        const noise = (random() * 2 - 1);
        value = noise * 0.5 * Math.exp(-progress * 26);
        break;
      }
      case 'riser': {
        const frequency = 120 * Math.pow(2, progress * 3.2);
        phase += (2 * Math.PI * frequency) / SAMPLE_RATE;
        const saw = (phase / (2 * Math.PI)) % 1 < 0.5 ? 0.5 : -0.5;
        const noise = (random() * 2 - 1) * 0.35 * progress;
        value = (saw * 0.45 + noise) * envelope(index, length, 0.3, 0.08);
        break;
      }
      case 'impact': {
        const frequency = 140 * Math.exp(-progress * 5.5);
        phase += (2 * Math.PI * Math.max(40, frequency)) / SAMPLE_RATE;
        const noise = (random() * 2 - 1) * Math.exp(-progress * 22) * 0.5;
        value = (Math.sin(phase) * 0.8 + noise) * envelope(index, length, 0.005, 0.6);
        break;
      }
      case 'shutter': {
        const first = Math.exp(-progress * 40);
        const second = progress > 0.35 ? Math.exp(-(progress - 0.35) * 40) : 0;
        value = (random() * 2 - 1) * (first * 0.5 + second * 0.35);
        break;
      }
      case 'glitch': {
        const gate = random() > 0.4 ? 1 : 0.2;
        value = ((random() * 2 - 1) * 0.6) * gate * envelope(index, length, 0.02, 0.3);
        break;
      }
      case 'chime': {
        const fundamental = 523.25;
        phase += (2 * Math.PI * fundamental) / SAMPLE_RATE;
        const harmonic = Math.sin(phase * 2.01) * 0.35 + Math.sin(phase * 3.02) * 0.18;
        value = (Math.sin(phase) * 0.6 + harmonic) * Math.exp(-progress * 4.2);
        break;
      }
      default:
        break;
    }
    samples[index] = value;
  }
  return { samples, sampleRate: SAMPLE_RATE };
}

const SCALES: Record<string, number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function renderMusic(definition: MusicDefinition, durationMs = 16000): WavData {
  const length = Math.floor((durationMs / 1000) * SAMPLE_RATE);
  const samples = new Float32Array(length);
  const random = mulberry32(definition.id.length * 104729 + definition.bpm);
  const scale = SCALES[definition.recipe.scale] ?? SCALES.minor;
  const beatLength = 60 / definition.bpm;
  const progression = [0, 5, 3, 4];

  let padPhase = 0;
  let bassPhase = 0;
  let arpPhase = 0;
  let kickPhase = 0;

  for (let index = 0; index < length; index += 1) {
    const t = index / SAMPLE_RATE;
    const beat = Math.floor(t / beatLength);
    const bar = Math.floor(beat / 4) % progression.length;
    const beatInBar = beat % 4;
    const root = definition.recipe.root + progression[bar];
    let value = 0;

    if (definition.recipe.pad) {
      const detune = 1 + (random() - 0.5) * 0.004;
      padPhase += (2 * Math.PI * midiToFreq(root) * detune) / SAMPLE_RATE;
      const pad = Math.sin(padPhase) * 0.35 + Math.sin(padPhase * 1.5) * 0.12;
      const swell = 0.6 + 0.4 * Math.sin((2 * Math.PI * t) / (beatLength * 8));
      value += pad * 0.32 * swell;
    }

    if (definition.recipe.pulse) {
      const arpIndex = scale[(beatInBar * 2) % scale.length];
      const arpFreq = midiToFreq(root + 12 + arpIndex);
      arpPhase += (2 * Math.PI * arpFreq) / SAMPLE_RATE;
      const arpEnv = Math.exp(-((t % (beatLength / 2)) / (beatLength / 2)) * 2.4);
      value += Math.sin(arpPhase) * 0.16 * arpEnv;
    }

    // Bass / kick
    if (beatInBar === 0 || beatInBar === 2) {
      const bassFreq = midiToFreq(root - 12);
      bassPhase += (2 * Math.PI * bassFreq) / SAMPLE_RATE;
      const bassEnv = Math.exp(-((t % (beatLength * 2)) / (beatLength * 2)) * 3.2);
      value += Math.sin(bassPhase) * 0.22 * bassEnv;
    }

    if (definition.recipe.pulse && beatInBar % 2 === 0) {
      kickPhase += (2 * Math.PI * (52 + 60 * Math.exp(-((t % beatLength) / beatLength) * 24))) / SAMPLE_RATE;
      const kickEnv = Math.exp(-((t % beatLength) / beatLength) * 9);
      value += Math.sin(kickPhase) * 0.3 * kickEnv;
    }

    samples[index] = value * 0.8;
  }
  return { samples, sampleRate: SAMPLE_RATE };
}

export function renderSfxBlob(definition: SfxDefinition): Blob {
  return encodeWav(renderSfx(definition));
}

export function renderMusicBlob(definition: MusicDefinition, durationMs?: number): Blob {
  return encodeWav(renderMusic(definition, durationMs));
}
