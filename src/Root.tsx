import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Composition,
  Freeze,
  Img,
  Sequence,
  useCurrentFrame,
} from 'remotion';
import { duringEffect, enterEffect, exitEffect, type Effect } from './animations.ts';
import { coord, edge, elementBox, grid } from './layout.ts';
import { VideoSpec, type Element, type Scene } from './schema.ts';

type Video = VideoSpec['video'];
type Props = {
  spec: VideoSpec;
  assets: Record<string, string>;
  palette: Record<string, string>;
  audio: Record<string, string>;
};
type Kit = { video: Video; assets: Props['assets'] };

const FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** enter + during compose: opacity multiplies, transforms concatenate. */
function combine(effects: Effect[], base: number) {
  return {
    opacity: effects.reduce((o, e) => o * (e.opacity ?? 1), base),
    transform: effects.map((e) => e.transform).filter(Boolean).join(' '),
    css: Object.assign({}, ...effects.map((e) => e.css ?? {})),
    text: effects.find((e) => e.text !== undefined)?.text,
  };
}

/** One copy. Owns the animation; the grid around it owns position and size.
 *  `index` staggers the entrance and keeps repeated asset states addressable. */
const Piece: React.FC<Kit & { element: Element; index: number; lifetime: number }> = ({
  element,
  video,
  assets,
  index,
  lifetime,
}) => {
  const frame = useCurrentFrame();
  const enter = element.stagger
    ? { ...element.enter, delay: element.enter.delay + index * element.stagger }
    : element.enter;
  const { opacity, transform, css, text } = combine(
    [
      enterEffect(enter, frame, video.fps),
      duringEffect(element.animation, frame, video.fps, element.text),
      exitEffect(element.exit, frame, video.fps, lifetime),
    ],
    element.opacity,
  );
  const motion: React.CSSProperties = { opacity, transform, ...css };
  const fill: React.CSSProperties = { width: '100%', height: '100%' };

  if (element.type === 'asset' && element.file)
    return <Img src={assets[`file:${element.file}`]} style={{ ...fill, ...motion, objectFit: 'contain' }} />;

  if (element.type === 'asset') {
    // Inlined rather than <img>, so `currentColor` and the theme variables in
    // the art pick up this element's colour.
    const scope = `asset-${element.id}-${index}`;
    return (
      <div id={scope} style={{ ...fill, ...motion, color: element.color ?? video.color }}>
        {element.state ? (
          <style>{`#${scope} [data-state]{display:none}#${scope} [data-state="${element.state}"]{display:inline}`}</style>
        ) : null}
        <div style={fill} dangerouslySetInnerHTML={{ __html: assets[element.asset!] ?? '' }} />
      </div>
    );
  }

  if (element.type === 'text')
    return (
      <span
        style={{
          ...motion,
          display: 'inline-block',
          fontFamily: FONT,
          fontSize: element.size ?? 72,
          fontWeight: 700,
          lineHeight: 1.25,
          color: element.color ?? video.color,
        }}
      >
        {text ?? element.text}
      </span>
    );

  return <div style={{ ...fill, ...motion, backgroundColor: element.color ?? '#000000' }} />;
};

const LineView: React.FC<Kit & { element: Element; lifetime: number }> = ({
  element,
  video,
  lifetime,
}) => {
  const frame = useCurrentFrame();
  const { opacity, transform, css } = combine(
    [
      enterEffect(element.enter, frame, video.fps),
      duringEffect(element.animation, frame, video.fps),
      exitEffect(element.exit, frame, video.fps, lifetime),
    ],
    element.opacity,
  );
  const [x1, y1] = element.from!;
  const [x2, y2] = element.to!;
  return (
    <AbsoluteFill style={{ opacity, zIndex: element.z }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${video.width} ${video.height}`}>
        <line
          x1={x1} y1={y1} x2={x2} y2={y2}
          pathLength={1}
          stroke={element.color ?? video.color}
          strokeWidth={element.thickness}
          strokeLinecap="round"
          style={{ ...css, transform }}
        />
      </svg>
    </AbsoluteFill>
  );
};

/** Position and size, then one Piece per copy. */
const GridView: React.FC<Kit & { element: Element; lifetime: number }> = ({
  element,
  video,
  assets,
  lifetime,
}) => {
  const { cellWidth, cellHeight, width, height } = grid(element, video);

  return (
    <div
      style={{
        position: 'absolute',
        left: coord(element.x, video.width),
        top: coord(element.y, video.height),
        width,
        height,
        zIndex: element.z,
        transform: `translate(-50%, -50%) rotate(${element.rotation}deg)`,
        display: 'flex',
        flexWrap: 'wrap',
        gap: element.gap,
        alignContent: 'flex-start',
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      {Array.from({ length: element.repeat }, (_, i) => (
        <div key={i} style={{ width: cellWidth, height: cellHeight }}>
          <Piece element={element} video={video} assets={assets} index={i} lifetime={lifetime} />
        </div>
      ))}
    </div>
  );
};

/** Which way the label runs from the anchor, and how the group hangs off it —
 *  the leader always touches the target, so the box grows outward. */
const ORIGIN: Record<string, string> = {
  right: 'translateY(-50%)',
  left: 'translate(-100%, -50%)',
  bottom: 'translateX(-50%)',
  top: 'translate(-50%, -100%)',
};
const FLOW: Record<string, React.CSSProperties['flexDirection']> = {
  right: 'row', left: 'row-reverse', bottom: 'column', top: 'column-reverse',
};

/** A word attached to another element: a leader line out from that element's
 *  edge, then the label. The position is derived from the target, so moving the
 *  thing moves its label — which is the whole reason this is an element type
 *  and not a `line` plus a `text` at two sets of hand-guessed coordinates.
 *
 *  With `side: right`, `enter: { type: wipe }` gives the gesture this exists
 *  for — the leader draws out, then the word lands — because the clip path
 *  sweeps left to right across the leader and label in that order. */
const CalloutView: React.FC<
  Kit & { element: Element; elements: Element[]; lifetime: number }
> = ({ element, video, elements, lifetime }) => {
  const frame = useCurrentFrame();
  const { opacity, transform, css, text } = combine(
    [
      enterEffect(element.enter, frame, video.fps),
      duringEffect(element.animation, frame, video.fps, element.text),
      exitEffect(element.exit, frame, video.fps, lifetime),
    ],
    element.opacity,
  );

  // validate() rejects a missing target; a half-typed preview should not crash.
  const target = elements.find((e) => e.id === element.target);
  if (!target) return null;

  const [x, y] = edge(elementBox(target, video), element.side);
  const upright = element.side === 'top' || element.side === 'bottom';
  const color = element.color ?? video.color;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        zIndex: element.z,
        transform: ORIGIN[element.side],
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: FLOW[element.side],
          alignItems: 'center',
          gap: element.gap,
          opacity,
          transform,
          ...css,
        }}
      >
        <div
          style={{
            flexShrink: 0,
            width: upright ? element.thickness : element.leader,
            height: upright ? element.leader : element.thickness,
            borderRadius: element.thickness / 2,
            backgroundColor: color,
          }}
        />
        <span
          style={{
            fontFamily: FONT,
            fontSize: element.size ?? 44,
            fontWeight: 700,
            lineHeight: 1.25,
            whiteSpace: 'pre',
            color,
          }}
        >
          {text ?? element.text}
        </span>
      </div>
    </div>
  );
};

const ElementView: React.FC<
  Kit & { element: Element; elements: Element[]; lifetime: number }
> = (props) =>
  props.element.type === 'line' ? (
    <LineView {...props} />
  ) : props.element.type === 'callout' ? (
    <CalloutView {...props} />
  ) : (
    <GridView {...props} />
  );

const SceneView: React.FC<Kit & { scene: Scene; audio: Props['audio'] }> = ({
  scene,
  video: projectVideo,
  assets,
  audio,
}) => {
  const video = { ...projectVideo,
    background: scene.palette?.background ?? projectVideo.background,
    color: scene.palette?.text ?? projectVideo.color,
  };
  return (
  <AbsoluteFill style={{ backgroundColor: video.background, ...cssVars(scene.palette ?? {}) } as React.CSSProperties}>
    {scene.narration && audio[`narration:${scene.id}`] ? (
      <Audio src={audio[`narration:${scene.id}`]} volume={scene.narration.volume} />
    ) : null}

    {scene.elements.map((element) =>
      element.sound && audio[`sound:${element.sound.id}`] ? (
        <Sequence
          key={`sound-${element.id}`}
          name={`sound ${element.sound.id}`}
          from={Math.round((element.at + element.sound.at) * video.fps)}
        >
          <Audio src={audio[`sound:${element.sound.id}`]} volume={element.sound.volume} />
        </Sequence>
      ) : null,
    )}

    {scene.elements.filter((element) => !element.group).map((element) => {
      const renderElement = (child: Element) => (
        <Sequence key={child.id} name={child.id}
          from={Math.round(child.at * video.fps)}
          durationInFrames={child.until === undefined ? undefined : Math.round((child.until - child.at) * video.fps)}>
          <ElementView element={child} elements={scene.elements} video={video} assets={assets}
            lifetime={Math.round(((child.until ?? scene.duration) - child.at) * video.fps)} />
        </Sequence>
      );
      return element.type === 'group'
        ? <GroupView key={element.id} element={element} video={video} duration={scene.duration}>
            {scene.elements.filter((child) => child.group === element.id).map(renderElement)}
          </GroupView>
        : renderElement(element);
    })}
  </AbsoluteFill>
  );
};

/** A group preserves scene coordinates and timing, applying one visual motion
 *  around x/y. Audio stays on the scene timeline, independent of its transform. */
const GroupView: React.FC<{
  element: Element; video: Video; duration: number; children: React.ReactNode;
}> = ({ element, video, duration, children }) => {
  const frame = useCurrentFrame() - Math.round(element.at * video.fps);
  const lifetime = Math.round(((element.until ?? duration) - element.at) * video.fps);
  const motion = combine([
    enterEffect(element.enter, frame, video.fps),
    duringEffect(element.animation, frame, video.fps),
    exitEffect(element.exit, frame, video.fps, lifetime),
  ], element.opacity);
  if (frame < 0 || frame >= lifetime) return null;
  return <AbsoluteFill style={{
    opacity: motion.opacity, transform: `${motion.transform} rotate(${element.rotation}deg)`,
    transformOrigin: `${coord(element.x, video.width)}px ${coord(element.y, video.height)}px`,
    zIndex: element.z, ...motion.css,
  }}>{children}</AbsoluteFill>;
};

/** Palette entries reach the art as CSS variables, which is how a themed asset
 *  recolours without a second copy of the file. */
const cssVars = (palette: Props['palette']) =>
  Object.fromEntries(Object.entries(palette ?? {}).map(([k, v]) => [`--${k}`, v]));

export const VideoView: React.FC<Props> = ({ spec, assets, palette, audio }) => {
  let from = 0;
  return (
    <AbsoluteFill
      style={{ backgroundColor: spec.video.background, ...cssVars(palette) } as React.CSSProperties}
    >
      {spec.scenes.map((scene) => {
        const start = from;
        const frames = Math.round(scene.duration * spec.video.fps);
        from += frames;
        return (
          <Sequence key={scene.id} name={scene.id} from={start} durationInFrames={frames}>
            <SceneView scene={scene} video={spec.video} assets={assets} audio={audio} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const THUMB = 380;
const LABEL = 46;

/** Cells to draw: every scene, sampled `perScene` times at even interior points
 *  ((k+0.5)/n, so one sample is the midpoint). README §25. */
function sheetCells(spec: VideoSpec, perScene: number) {
  const cells: { scene: string; seconds: number; frame: number }[] = [];
  let from = 0;
  for (const scene of spec.scenes) {
    const frames = Math.round(scene.duration * spec.video.fps);
    for (let k = 0; k < perScene; k++) {
      const through = (k + 0.5) / perScene;
      cells.push({
        scene: scene.id,
        seconds: Math.round(scene.duration * through * 10) / 10,
        frame: from + Math.floor(frames * through),
      });
    }
    from += frames;
  }
  return cells;
}

const sheetLayout = (spec: VideoSpec, perScene: number) => {
  const cells = sheetCells(spec, perScene);
  const columns = perScene > 1 ? perScene : Math.min(3, spec.scenes.length);
  const scale = THUMB / spec.video.width;
  const cellHeight = spec.video.height * scale + LABEL;
  return {
    cells,
    columns,
    scale,
    cellHeight,
    width: columns * THUMB,
    height: Math.ceil(cells.length / columns) * cellHeight,
  };
};

/** Every scene on one page. Each cell is the real VideoView frozen at a frame
 *  and scaled down — no image compositing, no extra dependency, and it cannot
 *  drift from what `render` produces. */
export const ContactSheet: React.FC<Props & { perScene?: number }> = ({
  spec,
  assets,
  palette,
  audio,
  perScene = 1,
}) => {
  const { cells, columns, scale, cellHeight } = sheetLayout(spec, perScene);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {cells.map((cell, i) => (
        <div
          key={`${cell.scene}-${i}`}
          style={{
            position: 'absolute',
            left: (i % columns) * THUMB,
            top: Math.floor(i / columns) * cellHeight,
            width: THUMB,
            height: cellHeight,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: spec.video.width,
              height: spec.video.height,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <Freeze frame={cell.frame}>
              <VideoView spec={spec} assets={assets} palette={palette} audio={audio} />
            </Freeze>
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0, height: LABEL,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 12px', boxSizing: 'border-box',
              fontFamily: FONT, fontSize: 20, fontWeight: 700, color: '#ffffff',
            }}
          >
            <span>{cell.scene}</span>
            <span style={{ opacity: 0.55 }}>{cell.seconds}s</span>
          </div>
        </div>
      ))}
    </AbsoluteFill>
  );
};

// Shown when the Studio opens with no project. Parsed so it cannot drift
// out of sync with the schema's defaults.
const PLACEHOLDER = VideoSpec.parse({
  version: 1,
  video: { id: 'no-project' },
  scenes: [
    {
      id: 'hint',
      duration: 3,
      elements: [
        { id: 'hint-text', type: 'text', size: 52, text: 'npm run explainer preview <project>' },
      ],
    },
  ],
});
const EMPTY = { spec: PLACEHOLDER, assets: {}, palette: {}, audio: {} };

export const Root: React.FC = () => (
  <>
    <Composition
      id="Video"
      component={VideoView}
      defaultProps={EMPTY}
      width={PLACEHOLDER.video.width}
      height={PLACEHOLDER.video.height}
      fps={PLACEHOLDER.video.fps}
      durationInFrames={90}
      calculateMetadata={({ props }) => {
        const { video, scenes } = props.spec;
        const total = scenes.reduce((sum, s) => sum + s.duration, 0);
        return {
          width: video.width,
          height: video.height,
          fps: video.fps,
          durationInFrames: Math.round(total * video.fps),
        };
      }}
    />
    <Composition
      id="ContactSheet"
      component={ContactSheet}
      defaultProps={{ ...EMPTY, perScene: 1 }}
      width={sheetLayout(PLACEHOLDER, 1).width}
      height={sheetLayout(PLACEHOLDER, 1).height}
      fps={PLACEHOLDER.video.fps}
      durationInFrames={90}
      calculateMetadata={({ props }) => {
        const { width, height } = sheetLayout(props.spec, props.perScene ?? 1);
        // Only frame 0 is ever rendered, but <Freeze> frames are clamped to the
        // composition's duration, so it has to span the whole video.
        const total = props.spec.scenes.reduce((sum, s) => sum + s.duration, 0);
        return {
          width: Math.round(width),
          height: Math.round(height),
          fps: props.spec.video.fps,
          durationInFrames: Math.round(total * props.spec.video.fps),
        };
      }}
    />
  </>
);
