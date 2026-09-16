#!/usr/bin/env node
// Read raw authoring YAML, not renderer props expanded with schema defaults.
import { readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse, stringify } from 'yaml';

const [project, sceneId, ...extra] = process.argv.slice(2);
try {
  if (!project || extra.length) throw new Error('usage: context.mjs <project> [scene-id]');
  const root = resolve(project);
  const path = resolve(root, 'video.yaml');
  const local = relative(root, path);
  if (local.startsWith('..') || isAbsolute(local)) throw new Error('project must be inside videos/');
  const spec = parse(readFileSync(path, 'utf8'));
  if (!spec?.video || !Array.isArray(spec.scenes)) throw new Error('expected video settings and a scenes list');
  const timing = (scene) => {
    if (!scene.markers?.length) return undefined;
    let narrationFingerprint;
    try { narrationFingerprint = createHash('sha256').update(readFileSync(join(root, scene.narration.audio))).digest('hex'); } catch { /* Missing narration remains unreviewed. */ }
    const markers = new Map(scene.markers.map(marker => [marker.id, marker.time]));
    return {
      review: narrationFingerprint && scene.markersAudio === narrationFingerprint ? 'reviewed against this take' : 'needs narration review',
      narrationFingerprint,
      arrivals: (scene.elements ?? []).map(element => {
        const at = typeof element.at === 'object' ? markers.get(element.at.marker) + (element.at.offset ?? 0) : element.at ?? 0;
        if (!Number.isFinite(at)) throw new Error(`unknown marker for element "${element.id}"`);
        return { id: element.id, at, ...(element.sound ? { soundAt: at + (element.sound.at ?? 0) } : {}) };
      }),
    };
  };
  if (sceneId) {
    const scene = spec.scenes.find((s) => s.id === sceneId);
    if (!scene) throw new Error(`no scene "${sceneId}"; available: ${spec.scenes.map((s) => s.id).join(', ')}`);
    const resolvedTiming = timing(scene);
    console.log(stringify({ video: spec.video, scenes: [scene], ...(resolvedTiming ? { timing: resolvedTiming } : {}) }, { lineWidth: 0 }).trimEnd());
  } else {
    let start = 0;
    const seconds = (n) => Math.round(n * 1000) / 1000;
    const scenes = spec.scenes.map((s) => {
      if (!Number.isFinite(s.duration) || s.duration <= 0) throw new Error(`scene "${s.id}" needs a positive duration`);
      const from = start;
      start += s.duration;
      const resolvedTiming = timing(s);
      return {
        id: s.id, start: seconds(from), duration: s.duration,
        elements: s.elements?.length ?? 0,
        narration: s.narration?.audio ? 'attached (not verified)' : s.narration?.text ? 'unrecorded (silent)' : 'none',
        assets: [...new Set((s.elements ?? []).filter((e) => e.asset || e.file).map((e) => e.file ? `file:${e.file}` : e.asset))],
        sounds: [...new Set((s.elements ?? []).filter((e) => e.sound).map((e) => e.sound.id))],
        ...(resolvedTiming ? { timing: resolvedTiming } : {}),
      };
    });
    console.log(stringify({ video: spec.video, totalSeconds: seconds(start), scenes }, { lineWidth: 0 }).trimEnd());
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
