#!/usr/bin/env node
// Original sparse score: warm keys, a slow bass, and space for a human voice.
// Every event wraps into the start of the buffer, including its decay tail.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeWav } from '../src/audio.ts';

const selected = process.argv[2]; // Optional track name: regenerate only what changed.
const RATE = 48000;
const LENGTH = 32; // eight bars at 60 bpm
const sine = (t: number, hz: number) => Math.sin(2 * Math.PI * hz * t);
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

for (const [name, transpose, brightness] of [['calm', 0, 0.1], ['clean', 5, 0.18], ['curious', 0, 0.28]] as const) {
  if (selected && selected !== name) continue;
  const samples = new Float64Array(RATE * LENGTH * 2);
  const note = (at: number, midi: number, gain: number, pan: number, bass = false) => {
    const frequency = hz(midi + transpose);
    const duration = bass ? 5 : 3.5;
    for (let i = 0; i < duration * RATE; i++) {
      const t = i / RATE;
      const env = (1 - Math.exp(-t / (bass ? 0.06 : 0.009))) * Math.exp(-t / (bass ? 1.3 : 0.8)) * Math.min(1, (duration - t) / 0.2);
      const value = gain * env * (sine(t, frequency) + brightness * sine(t, frequency * 2) * Math.exp(-t / 0.25) + 0.06 * sine(t, frequency * 3));
      const frame = (Math.round(at * RATE) + i) % (RATE * LENGTH);
      samples[frame * 2] += value * Math.sqrt((1 - pan) / 2);
      samples[frame * 2 + 1] += value * Math.sqrt((1 + pan) / 2);
    }
  };
  // G6 / Em7 / Cmaj7 / Dsus2. No percussion competing with speech.
  const chords = [[43, 62, 67, 71, 76], [40, 62, 67, 71, 74], [36, 60, 64, 67, 71], [38, 62, 64, 69, 74]];
  for (let bar = 0; bar < 8; bar++) {
    const chord = chords[Math.floor(bar / 2)];
    note(bar * 4, chord[0], 0.12, 0, true);
    note(bar * 4 + 0.5, chord[1], 0.11, -0.3);
    note(bar * 4 + 1.5, chord[3], 0.085, 0.3);
    note(bar * 4 + 3, chord[2], 0.09, -0.15);
    if (name === 'curious') note(bar * 4 + 3.5, chord[4], 0.055, 0.35);
  }
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const pcm = Int16Array.from(samples, (s) => Math.round(s * (0.65 / peak) * 32767));
  mkdirSync('library/music', { recursive: true });
  writeFileSync(join('library/music', `${name}.wav`), encodeWav(pcm, RATE, 2));
  console.log(`library/music/${name}.wav — ${LENGTH}s stereo loop`);
}

// Forward motion for evidence-led explainers: 96 bpm, low pulse, suspended
// harmony and a restrained backbeat. No bell or music-box melody.
if (!selected || selected === 'momentum') {
  const beat = 60 / 96;
  const length = 64 * beat;
  const frames = Math.round(length * RATE);
  const samples = new Float64Array(frames * 2);
  let seed = 29;
  const noise = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2147483648 - 1);
  const add = (at: number, duration: number, pan: number, sound: (t: number) => number) => {
    for (let i = 0; i < duration * RATE; i++) {
      const t = i / RATE;
      const edge = Math.min(1, t / 0.004, (duration - t) / 0.025);
      const value = sound(t) * edge;
      const index = (Math.round(at * RATE) + i) % frames;
      samples[index * 2] += value * Math.sqrt((1 - pan) / 2);
      samples[index * 2 + 1] += value * Math.sqrt((1 + pan) / 2);
    }
  };
  // Am(add9), Cmaj7, Gsus2, Dsus2: curiosity with an open, lifting resolution.
  const chords = [[33, 57, 60, 64, 71], [36, 55, 59, 64, 67], [31, 55, 57, 62, 67], [38, 57, 62, 64, 69]];
  for (let section = 0; section < 8; section++) {
    const chord = chords[section % chords.length];
    const start = section * 8 * beat;
    for (let voice = 1; voice < chord.length; voice++) {
      const f = hz(chord[voice]);
      add(start, beat * 9, voice % 2 ? -0.55 : 0.55, (t) => {
        const env = Math.min(1, t / 0.55) * Math.min(1, (beat * 9 - t) / 1.1);
        const breath = 0.85 + 0.15 * Math.sin(2 * Math.PI * t / (beat * 2));
        return 0.026 * env * breath * (sine(t, f) + 0.3 * sine(t, f * 1.002) + 0.12 * sine(t, f * 2));
      });
    }
    for (let step = 0; step < 16; step++) {
      const f = hz(chord[0] + (step % 8 === 6 ? 12 : 0));
      add(start + step * beat / 2, 0.4, 0, (t) =>
        (step % 2 ? 0.09 : 0.15) * Math.exp(-t / 0.12) *
        (sine(t, f) + 0.35 * sine(t, f * 2) + 0.16 * sine(t, f * 3)));
      if (step % 4 === 0)
        add(start + step * beat / 2, 0.24, 0, (t) => 0.13 * Math.exp(-t / 0.065) * Math.sin(2 * Math.PI * (46 * t + 2 * (1 - Math.exp(-t * 35)))));
      if (step % 4 === 2)
        add(start + step * beat / 2, 0.12, 0.15, (t) => 0.025 * noise() * Math.exp(-t / 0.022));
      if (step % 2 === 1)
        add(start + step * beat / 2, 0.07, -0.25, (t) => 0.011 * noise() * Math.exp(-t / 0.012));
    }
    // A quiet rising figure opens the space every other bar.
    for (const [step, voice] of [[3, 1], [5.5, 2], [7, 4]] as const) {
      const f = hz(chord[voice]);
      add(start + step * beat, 1.4, voice % 2 ? -0.3 : 0.3, (t) =>
        0.04 * (1 - Math.exp(-t / 0.025)) * Math.exp(-t / 0.38) *
        (sine(t, f) + 0.22 * sine(t, f * 2)));
    }
  }
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const pcm = Int16Array.from(samples, (s) => Math.round(s * (0.7 / peak) * 32767));
  mkdirSync('library/music', { recursive: true });
  writeFileSync('library/music/momentum.wav', encodeWav(pcm, RATE, 2));
  console.log(`library/music/momentum.wav — ${length}s stereo loop, 96 bpm`);
}

// Bright major-key bed: D / A / G / D at 120 bpm, plucked keys, bass and drums.
// All harmony is major; note and percussion tails wrap for a seamless loop.
if (!selected || selected === 'daybreak') {
  const beat = 0.5;
  const length = 32;
  const frames = length * RATE;
  const samples = new Float64Array(frames * 2);
  let seed = 73;
  const noise = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2147483648 - 1);
  const add = (at: number, duration: number, gain: number, pan: number, voice: (t: number) => number) => {
    for (let i = 0; i < Math.round(duration * RATE); i++) {
      const t = i / RATE;
      const edge = Math.min(1, t / 0.002, (duration - t) / 0.02);
      const value = gain * edge * voice(t);
      const index = (Math.round(at * RATE) + i) % frames;
      samples[index * 2] += value * Math.sqrt((1 - pan) / 2);
      samples[index * 2 + 1] += value * Math.sqrt((1 + pan) / 2);
    }
  };
  const pluck = (at: number, midi: number, gain: number, pan: number) => {
    const f = hz(midi);
    add(at, 1.1, gain, pan, t => Math.exp(-t / 0.23) *
      (sine(t, f) + 0.34 * sine(t, f * 2) * Math.exp(-t / 0.1) + 0.15 * sine(t, f * 3)));
    add(at + beat * 0.75, 0.6, gain * 0.12, -pan, t => Math.exp(-t / 0.16) * sine(t, f));
  };
  const chords = [[38, 62, 66, 69], [33, 61, 64, 69], [31, 59, 62, 67], [38, 62, 66, 69]];
  for (let bar = 0; bar < 16; bar++) {
    const chord = chords[bar % 4];
    const start = bar * 4 * beat;
    // Short offbeat chord strums leave room for speech.
    for (const step of [0, 1.5, 2.5, 3.5])
      for (let voice = 1; voice < 4; voice++)
        pluck(start + step * beat + voice * 0.008, chord[voice], step === 0 ? 0.045 : 0.035, (voice - 2) * 0.5);
    for (const [step, interval] of [[0, 0], [0.75, 12], [1.5, 7], [2, 0], [2.75, 12], [3.5, 7]]) {
      const f = hz(chord[0] + interval);
      add(start + step * beat, 0.38, 0.13, 0, t => Math.exp(-t / 0.115) *
        (sine(t, f) + 0.24 * sine(t, f * 2) + 0.08 * sine(t, f * 3)));
    }
    for (const step of [0, 1.5, 2, 3.5])
      add(start + step * beat, 0.22, 0.22, 0, t => Math.exp(-t / 0.06) *
        Math.sin(2 * Math.PI * (52 * t + 2.2 * (1 - Math.exp(-t * 42)))));
    for (const step of [1, 3])
      add(start + step * beat, 0.13, 0.10, 0.1, t =>
        noise() * Math.exp(-t / 0.024) * (0.65 + 0.35 * Math.cos(2 * Math.PI * t * 83)));
    for (let step = 0; step < 8; step++)
      add(start + step * beat / 2, 0.065, step % 2 ? 0.035 : 0.018, step % 2 ? -0.4 : 0.4,
        t => noise() * Math.exp(-t / 0.014));
    // A small rising major figure, answered at the end of each phrase.
    if (bar % 4 === 0)
      for (const [step, midi] of [[0.5, 74], [1.5, 78], [2.5, 81], [3, 78]])
        pluck(start + step * beat, midi, 0.045, 0.25);
    if (bar % 4 === 3)
      for (const [step, midi] of [[0.5, 78], [1.5, 76], [2.5, 74]])
        pluck(start + step * beat, midi, 0.04, -0.25);
  }
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const pcm = Int16Array.from(samples, s => Math.round(s * (0.7 / peak) * 32767));
  mkdirSync('library/music', { recursive: true });
  writeFileSync('library/music/daybreak.wav', encodeWav(pcm, RATE, 2));
  console.log('library/music/daybreak.wav — 32s stereo loop, D major, 120 bpm');
}
