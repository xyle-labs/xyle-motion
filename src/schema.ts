import { z } from 'zod';
import { DURING_TYPES, ENTER_TYPES, EXIT_TYPES } from './animations.ts';

/** Position: pixels from the top-left, or a keyword. Refers to the element's
 *  centre, so `x: center` is just the middle of the frame. */
const X = z.union([z.number(), z.enum(['left', 'center', 'right'])]);
const Y = z.union([z.number(), z.enum(['top', 'center', 'bottom'])]);
const Point = z.tuple([z.number(), z.number()]);

// Shared shape for both animation slots (README §8 animation properties).
const anim = <T extends readonly [string, ...string[]]>(types: T) =>
  z.strictObject({
    type: z.enum(types),
    duration: z.number().positive().default(0.7),
    delay: z.number().min(0).default(0),
    easing: z
      .enum(['smooth', 'soft', 'linear', 'in', 'inout', 'back', 'spring'])
      .default('smooth'),
    distance: z.number().default(60), // slide travel in px; tumble/sway turn in degrees
    by: Point.default([0, 0]), // move offset, px
    color: z.string().default('#e0a458'), // highlight / switch-on glow
  });

const Enter = anim(ENTER_TYPES);
const During = anim(DURING_TYPES);
const Exit = anim(EXIT_TYPES);

const ENTER_DEFAULT = { type: 'fade', duration: 0.7, delay: 0, easing: 'smooth', distance: 60, by: [0, 0] as [number, number], color: '#e0a458' } as const;
const DURING_DEFAULT = { ...ENTER_DEFAULT, type: 'none' } as const;
// Elements leave by default. A scene whose last half-second empties itself does
// not need a transition — the cut lands on nothing and stops being visible.
const EXIT_DEFAULT = { ...ENTER_DEFAULT, type: 'fade', duration: 0.4, easing: 'linear' } as const;

/** A sound tied to an element, so moving the element moves its sound.
 *  `at` is relative to the element's own start. */
const Sound = z.strictObject({
  id: z.string(),
  at: z.number().min(0).default(0),
  volume: z.number().min(0).max(1).default(1),
});

/** The spoken line for a scene. `text` also feeds captions (README §35), so the
 *  script is written once. `audio` attaches a recorded PCM WAV; text alone is silent. */
const Narration = z.strictObject({
  text: z.string().min(1),
  audio: z.string().optional(),
  volume: z.number().min(0).max(1).default(1),
});

const Element = z.strictObject({
  id: z.string(),
  type: z.enum(['text', 'overlay', 'line', 'asset', 'callout', 'group']),
  group: z.string().optional(), // a group element id; coordinates remain scene-relative

  asset: z.string().optional(), // library id, e.g. energy.coal_powerplant
  state: z.string().optional(), // a data-state group inside that SVG

  text: z.string().optional(),
  color: z.string().optional(),
  size: z.number().positive().optional(), // font size, px
  thickness: z.number().positive().default(8), // line and callout leader

  // A callout points at another element in the same scene, so its position is
  // derived rather than authored: move the thing and the label follows.
  target: z.string().optional(), // id of the element being labelled
  side: z.enum(['left', 'right', 'top', 'bottom']).default('right'),
  leader: z.number().min(0).default(90), // length of the pointer line, px

  // `line` uses from/to; everything else uses x/y/width/height.
  from: Point.optional(),
  to: Point.optional(),
  x: X.default('center'),
  y: Y.default('center'),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  rotation: z.number().default(0),
  z: z.number().int().default(0),

  // Many copies of one thing (README §14 Row/Column/Grid/Stack, as four fields).
  // With repeat > 1, `width` sizes one copy and the grid is laid out around x/y.
  repeat: z.number().int().positive().default(1),
  columns: z.number().int().positive().optional(),
  gap: z.number().min(0).default(12),
  stagger: z.number().min(0).default(0), // extra enter delay per copy, seconds

  opacity: z.number().min(0).max(1).default(1),
  at: z.number().min(0).default(0),
  until: z.number().positive().optional(),

  enter: Enter.default(ENTER_DEFAULT),
  animation: During.default(DURING_DEFAULT),
  exit: Exit.default(EXIT_DEFAULT),
  sound: Sound.optional(),
});

const Scene = z.strictObject({
  id: z.string(),
  duration: z.number().positive(),
  palette: z.record(z.string(), z.string()).optional(), // local brand colours override the video theme
  narration: Narration.optional(),
  elements: z.array(Element),
});

export const VideoSpec = z
  .strictObject({
    version: z.literal(1),
    video: z.strictObject({
      id: z.string(),
      theme: z.string().optional(), // themes/<name>.yaml
      width: z.number().int().positive().default(1080),
      height: z.number().int().positive().default(1920),
      fps: z.number().int().positive().default(30),
      background: z.string().default('#111111'),
      color: z.string().default('#ffffff'),
      // Mixed in at the stitch, not baked per scene — a bed has to survive the
      // cuts, and per-scene renders would restart it at every one.
      music: z
        .strictObject({
          file: z.string(),
          volume: z.number().min(0).max(1).default(0.18),
        })
        .optional(),
    }),
    scenes: z.array(Scene).min(1),
  })
  .superRefine((spec, ctx) => {
    const add = (message: string) => ctx.addIssue({ code: 'custom', message });
    const dupes = (names: string[]) => names.filter((n, i) => names.indexOf(n) !== i);

    for (const d of dupes(spec.scenes.map((s) => s.id)))
      add(`duplicate scene id: ${d}`);

    for (const scene of spec.scenes) {
      // Duplicate ids make surgical edits (README §32) ambiguous.
      for (const d of dupes(scene.elements.map((e) => e.id)))
        add(`duplicate element id in scene "${scene.id}": ${d}`);

      for (const el of scene.elements) {
        const where = `element "${el.id}" in scene "${scene.id}"`;
        if (el.group) {
          const parent = scene.elements.find((e) => e.id === el.group);
          if (!parent || parent.type !== 'group') add(`${where} needs an existing group: ${el.group}`);
          if (el.type === 'group') add(`${where}: nested groups are not supported`);
        }
        if (el.type === 'group' && el.repeat !== 1) add(`${where}: groups cannot repeat`);
        for (const slot of ['enter', 'animation', 'exit'] as const)
          if (el[slot].type === 'scale' && el[slot].distance < 0)
            add(`${where}: scale distance must be non-negative`);
        if (el.at >= scene.duration)
          add(`${where} starts at ${el.at}s but the scene is only ${scene.duration}s`);
        if (el.until !== undefined && el.until <= el.at)
          add(`${where} ends at ${el.until}s, at or before its start of ${el.at}s`);
        if (el.type === 'line' && (!el.from || !el.to))
          add(`${where} is a line and needs both "from" and "to"`);
        if (el.type === 'text' && !el.text)
          add(`${where} is text and needs "text"`);
        if (el.type === 'asset' && !el.asset)
          add(`${where} is an asset and needs "asset"`);
        if (el.type !== 'asset' && (el.asset || el.state))
          add(`${where} is a ${el.type}, so "asset"/"state" do nothing here`);
        if (el.type === 'callout' && !el.text)
          add(`${where} is a callout and needs "text"`);
        if (el.type === 'callout' && !el.target)
          add(`${where} is a callout and needs "target": the id of the element it labels`);
        if (el.type !== 'callout' && el.target)
          add(`${where} is a ${el.type}, so "target" does nothing here`);
        if (el.target) {
          const t = scene.elements.find((o) => o.id === el.target);
          if (!t)
            add(`${where} points at "${el.target}", which is not an element in this scene`);
          else if (t === el) add(`${where} points at itself`);
          else if (t.type === 'callout')
            add(`${where} points at "${t.id}", another callout — point at the thing itself`);
        }
        if (el.sound && el.at + el.sound.at >= scene.duration)
          add(`${where} plays "${el.sound.id}" at ${el.at + el.sound.at}s, past the scene's end`);
        if (el.repeat > 1 && (el.type === 'line' || el.type === 'callout'))
          add(`${where} is a ${el.type}, which cannot repeat`);
        if (el.repeat > 1 && el.width === undefined)
          add(`${where} repeats ${el.repeat} times and needs "width" to size one copy`);
        if (el.animation.type === 'draw' && el.type !== 'line')
          add(`${where} uses "draw", which only applies to a line`);
        if (el.animation.type === 'count-up' && !/\d/.test(el.text ?? ''))
          add(`${where} uses "count-up" but its text contains no number`);
      }
    }
  });

export type VideoSpec = z.infer<typeof VideoSpec>;
export type Scene = VideoSpec['scenes'][number];
export type Element = Scene['elements'][number];
