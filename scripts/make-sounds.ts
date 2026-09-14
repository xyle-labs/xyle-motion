#!/usr/bin/env node
// Original, reproducible foley and a shared three-note identity. No downloads.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeWav } from '../src/audio.ts';

const RATE = 48000;
const OUT = 'library/sounds';
let seed = 17;
const noise = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2147483648 - 1);
const sine = (t: number, hz: number) => Math.sin(2 * Math.PI * hz * t);
const decay = (t: number, tau: number) => Math.exp(-t / tau);
const bell = (t: number, hz: number) => t < 0 ? 0 :
  (1 - decay(t, 0.004)) * (sine(t, hz) * decay(t, 0.32) + 0.22 * sine(t, hz * 2.76) * decay(t, 0.09));

function render(seconds: number, voice: (t: number) => number) {
  const samples = new Int16Array(Math.round(seconds * RATE));
  for (let i = 0; i < samples.length; i++) {
    const t = i / RATE;
    const edge = Math.min(1, t / 0.002, (seconds - t) / 0.012);
    samples[i] = Math.round(Math.max(-0.85, Math.min(0.85, voice(t) * edge)) * 32767);
  }
  return encodeWav(samples, RATE);
}

let air = 0;
const sounds: Record<string, Buffer> = {
  click: render(0.09, (t) => 0.25 * noise() * decay(t, 0.003) + 0.3 * bell(t, 1250)),
  pop: render(0.18, (t) => 0.48 * Math.sin(2 * Math.PI * (650 * t - 900 * t * t)) * decay(t, 0.034)),
  thunk: render(0.32, (t) => 0.38 * sine(t, 135) * decay(t, 0.07) + 0.18 * bell(t, 370) + 0.13 * noise() * decay(t, 0.007)),
  whoosh: render(0.48, (t) => {
    const envelope = Math.sin(Math.PI * t / 0.48) ** 2;
    air += (0.015 + 0.16 * envelope) * (noise() - air);
    return 1.6 * air * envelope;
  }),
  chime: render(1.1, (t) => 0.33 * bell(t, 784) + 0.1 * bell(t - 0.055, 1174.66)),
  'paper-turn': render(0.45, (t) => {
    air += 0.3 * (noise() - air);
    return 0.65 * air * Math.sin(Math.PI * t / 0.45) ** 2 * (0.65 + 0.35 * sine(t, 37));
  }),
  'wood-tap': render(0.24, (t) => 0.3 * bell(t, 510) + 0.17 * bell(t, 823) + 0.18 * noise() * decay(t, 0.004)),
  'soft-land': render(0.38, (t) => 0.36 * sine(t, 82) * decay(t, 0.085) + 0.15 * noise() * decay(t, 0.014)),
  sparkle: render(0.9, (t) => 0.22 * bell(t, 1568) + 0.17 * bell(t - 0.09, 2093) + 0.1 * bell(t - 0.18, 2637)),
  // Same G–A–D identity, voiced as a low synth opening into a sustained fifth.
  'signature': render(2.4, (t) => {
    const tone = (start: number, f: number, gain: number) => {
      const age = t - start;
      if (age < 0) return 0;
      return gain * (1 - decay(age, 0.045)) * decay(age, 0.45) *
        (sine(age, f) + 0.22 * sine(age, f * 2) + 0.09 * sine(age, f * 3));
    };
    return tone(0.12, 196, 0.28) + tone(0.42, 220, 0.3) +
      tone(0.82, 293.665, 0.34) + tone(0.82, 146.8325, 0.15);
  }),
  'palm-rustle': render(1.28, (t) => {
    const envelope = Math.sin(Math.PI * t / 1.28) ** 1.7;
    const grain = noise();
    air += 0.065 * (grain - air);
    const leaves = grain * (0.5 + 0.5 * sine(t, 31) * sine(t, 47));
    return envelope * (0.7 * air + 0.07 * leaves);
  }),
  'coconut-crack': render(0.42, (t) => {
    const splinter = Math.max(0, t - 0.018);
    return 0.38 * noise() * decay(t, 0.012) +
      0.34 * sine(t, 172) * decay(t, 0.055) +
      0.2 * sine(t, 437) * decay(t, 0.033) +
      (t < 0.018 ? 0 : 0.22 * noise() * decay(splinter, 0.018));
  }),
  'shell-tick': render(0.16, (t) =>
    0.23 * noise() * decay(t, 0.003) +
    0.2 * sine(t, 720) * decay(t, 0.017) +
    0.13 * sine(t, 1190) * decay(t, 0.011)),
};
mkdirSync(OUT, { recursive: true });
for (const [name, wav] of Object.entries(sounds)) {
  if (process.argv[2] && process.argv[2] !== name) continue;
  const path = join(OUT, `${name}.wav`);
  writeFileSync(path, wav);
  console.log(path);
}
