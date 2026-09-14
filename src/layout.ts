// Where things sit on the canvas, in pixels. This lives apart from Root.tsx
// because a `callout` has to measure the element it points at, and a second
// copy of this arithmetic would drift the moment either one changed.
import type { Element, VideoSpec } from './schema.ts';

type Video = VideoSpec['video'];

/** Keywords sit at 20% / 50% / 80% of the canvas — enough margin to read on a
 *  phone. Numbers are plain pixels. Either way it is the element's centre. */
const FRACTION: Record<string, number> = {
  left: 0.2, center: 0.5, right: 0.8, top: 0.2, bottom: 0.8,
};
export const coord = (v: number | string, span: number) =>
  typeof v === 'number' ? v : FRACTION[v] * span;

/** The grid an element lays out: one copy's size, how the copies are arranged,
 *  and the size of the whole. `cellHeight`/`height` are undefined for text,
 *  which has no height until the browser lays it out. */
export function grid(element: Element, video: Video) {
  const isText = element.type === 'text';
  const isAsset = element.type === 'asset';
  const cellWidth =
    element.width ?? (isText ? video.width * 0.84 : isAsset ? 300 : video.width);
  const cellHeight =
    element.height ?? (isText ? undefined : isAsset ? cellWidth : video.height);

  const columns = element.columns ?? element.repeat;
  const rows = Math.ceil(element.repeat / columns);
  const span = (n: number, size: number) => n * size + (n - 1) * element.gap;
  const many = element.repeat > 1;

  return {
    cellWidth,
    cellHeight,
    columns,
    rows,
    width: many ? span(columns, cellWidth) : cellWidth,
    height: many ? span(rows, cellHeight ?? cellWidth) : cellHeight,
  };
}

export type Box = { x: number; y: number; width: number; height: number };
export type Side = 'left' | 'right' | 'top' | 'bottom';

/** An element's box: centre first, then size. A `line` is measured from its own
 *  endpoints. Text has its height estimated as `size * 1.25` — the line-height
 *  Root renders it with — because a callout has to point somewhere and the real
 *  height only exists once the browser has laid the glyphs out. */
export function elementBox(element: Element, video: Video): Box {
  if (element.type === 'line' && element.from && element.to) {
    const [x1, y1] = element.from;
    const [x2, y2] = element.to;
    return {
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2,
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  }
  const { width, height } = grid(element, video);
  return {
    x: coord(element.x, video.width),
    y: coord(element.y, video.height),
    width,
    height: height ?? (element.size ?? 72) * 1.25,
  };
}

/** The point on a box's edge that a callout's leader starts from. */
export function edge(box: Box, side: Side): [number, number] {
  const w = box.width / 2;
  const h = box.height / 2;
  if (side === 'left') return [box.x - w, box.y];
  if (side === 'right') return [box.x + w, box.y];
  if (side === 'top') return [box.x, box.y - h];
  return [box.x, box.y + h];
}
