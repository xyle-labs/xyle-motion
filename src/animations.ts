// Phase 2 — the visual grammar (README §13). Pure functions of (anim, frame,
// fps) so animation maths is testable without booting a browser: see
// animations.test.ts. Root.tsx merges the Effects onto an element.
import { Easing, interpolate, spring } from 'remotion';
import type { CSSProperties } from 'react';

export type Easing_ = keyof typeof EASE;

export type Anim = {
  type: string;
  duration: number;
  delay: number;
  easing: Easing_;
  distance: number;
  by: [number, number];
  color: string;
};

/** What an animation contributes. Root multiplies opacity and concatenates
 *  transform, so enter and during animations compose instead of clobbering. */
export type Effect = {
  opacity?: number;
  transform?: string;
  css?: CSSProperties;
  text?: string;
};

// `smooth` is the default: a quintic ease-out decelerates far more gently than
// a cubic, which is most of what reads as "expensive" in motion.
const EASE = {
  linear: (x: number) => x,
  in: Easing.in(Easing.quad), // accelerating motion, e.g. a falling object
  smooth: Easing.out(Easing.poly(5)),
  soft: Easing.out(Easing.cubic),
  inout: Easing.inOut(Easing.cubic),
  back: Easing.out(Easing.back(1.4)), // slight overshoot, for arrivals
  spring: (x: number) => x, // unused: spring is handled in progress()
};

/** 0 → 1 over `duration`, starting after `delay`, clamped at both ends. */
function progress(a: Anim, frame: number, fps: number): number {
  const f = frame - Math.round(a.delay * fps);
  if (f <= 0) return 0;
  const frames = Math.max(1, Math.round(a.duration * fps));
  if (a.easing === 'spring')
    return spring({ frame: f, fps, durationInFrames: frames, config: { damping: 14 } });
  return interpolate(f, [0, frames], [0, 1], {
    easing: EASE[a.easing] ?? EASE.smooth,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

export const ENTER_TYPES = [
  'appear', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right',
  'pop', 'wipe',
] as const;

export function enterEffect(a: Anim, frame: number, fps: number): Effect {
  const p = progress(a, frame, fps);
  const d = (1 - p) * a.distance;

  switch (a.type) {
    case 'appear':
      return { opacity: frame >= Math.round(a.delay * fps) ? 1 : 0 };
    case 'slide-up':
      return { opacity: p, transform: `translateY(${d}px)` };
    case 'slide-down':
      return { opacity: p, transform: `translateY(${-d}px)` };
    case 'slide-left':
      return { opacity: p, transform: `translateX(${d}px)` };
    case 'slide-right':
      return { opacity: p, transform: `translateX(${-d}px)` };
    case 'pop': {
      // Always springs — a linear pop is not a pop.
      const s = spring({ frame: Math.max(0, frame - Math.round(a.delay * fps)), fps, config: { damping: 12, mass: 0.6 } });
      return { opacity: p, transform: `scale(${s})` };
    }
    case 'wipe':
      return { css: { clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` } };
    default: // fade
      return { opacity: p };
  }
}

export const EXIT_TYPES = [
  'none', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right',
  'shrink', 'wipe',
] as const;

/** How an element leaves. `lifetime` is how many frames it exists for, so the
 *  exit lands exactly on its last frame rather than at a guessed time.
 *
 *  This is what stops a scene ending on a hard cut: elements clear out, the
 *  frame empties, and the join between scenes stops being visible. */
export function exitEffect(a: Anim, frame: number, fps: number, lifetime: number): Effect {
  if (a.type === 'none') return {};
  const frames = Math.max(1, Math.round(a.duration * fps));
  const starts = lifetime - frames - Math.round(a.delay * fps);
  if (frame < starts) return {};

  const p = interpolate(frame, [starts, starts + frames], [0, 1], {
    easing: EASE[a.easing] ?? EASE.smooth,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const gone = 1 - p;
  const d = p * a.distance;

  switch (a.type) {
    case 'slide-up':
      return { opacity: gone, transform: `translateY(${-d}px)` };
    case 'slide-down':
      return { opacity: gone, transform: `translateY(${d}px)` };
    case 'slide-left':
      return { opacity: gone, transform: `translateX(${-d}px)` };
    case 'slide-right':
      return { opacity: gone, transform: `translateX(${d}px)` };
    case 'shrink':
      return { opacity: gone, transform: `scale(${1 - 0.15 * p})` };
    case 'wipe':
      return { css: { clipPath: `inset(0 0 0 ${p * 100}%)` } };
    default:
      return { opacity: gone };
  }
}

export const DURING_TYPES = [
  'none', 'highlight', 'pulse', 'count-up', 'switch-on', 'switch-off',
  'move', 'draw', 'drift', 'float', 'tumble', 'sway', 'scale',
] as const;

export function duringEffect(
  a: Anim,
  frame: number,
  fps: number,
  text?: string,
): Effect {
  const p = progress(a, frame, fps);

  switch (a.type) {
    case 'highlight':
      return {
        css: {
          backgroundImage: `linear-gradient(to right, ${a.color} ${p * 100}%, transparent ${p * 100}%)`,
          boxDecorationBreak: 'clone',
        },
      };
    case 'pulse': {
      // `duration` is the period here, not a one-shot ramp.
      const t = (frame - Math.round(a.delay * fps)) / (fps * a.duration);
      const s = frame < Math.round(a.delay * fps) ? 1 : 1 + 0.05 * Math.sin(t * 2 * Math.PI);
      return { transform: `scale(${s})` };
    }
    case 'count-up':
      return { text: countUp(text ?? '', p) };
    case 'switch-on':
      return {
        opacity: Math.min(1, p * 3),
        css: { filter: `drop-shadow(0 0 ${p * 50}px ${a.color})` },
      };
    case 'switch-off':
      return { opacity: 1 - p };
    case 'move':
      return { transform: `translate(${p * a.by[0]}px, ${p * a.by[1]}px)` };
    case 'scale':
      // distance is the final scale factor; by moves the scaled subject.
      return { transform: `translate(${p * a.by[0]}px, ${p * a.by[1]}px) scale(${1 + p * (a.distance - 1)})` };
    case 'tumble':
      // Translation and rotation share a ramp; distance is the turn in degrees.
      return { transform: `translate(${p * a.by[0]}px, ${p * a.by[1]}px) rotate(${p * a.distance}deg)` };
    case 'sway': {
      // One damped oscillation, then rest. Duration is the whole gesture.
      const t = Math.max(0, Math.min(1,
        (frame - Math.round(a.delay * fps)) / Math.max(1, Math.round(a.duration * fps))));
      const angle = a.distance * Math.sin(t * 2 * Math.PI) * (1 - t) ** 2;
      return { transform: `rotate(${angle}deg)` };
    }
    case 'draw':
      // Paths are drawn with pathLength={1}, so this is length-independent.
      return { css: { strokeDasharray: 1, strokeDashoffset: 1 - p } };
    case 'drift': {
      // A slow constant creep. Nothing you notice; everything you feel.
      const seconds = Math.max(0, frame - Math.round(a.delay * fps)) / fps;
      return {
        transform: `translate(${seconds * a.by[0]}px, ${seconds * a.by[1]}px)`,
      };
    }
    case 'float': {
      const seconds = Math.max(0, frame - Math.round(a.delay * fps)) / fps;
      const amount = a.distance * 0.08;
      return {
        transform: `translateY(${Math.sin((seconds / a.duration) * 2 * Math.PI) * amount}px)`,
      };
    }
    default:
      return {};
  }
}

/** Counts the first number in a string up to its written value, keeping the
 *  surrounding text and decimal places: "₱12.50/kWh" → "₱7.31/kWh". */
export function countUp(text: string, p: number): string {
  return text.replace(/-?\d[\d,]*(\.\d+)?/, (match, decimals: string | undefined) => {
    const target = Number(match.replace(/,/g, ''));
    if (!Number.isFinite(target)) return match;
    const places = decimals ? decimals.length - 1 : 0;
    return (target * p).toLocaleString('en-US', {
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    });
  });
}
