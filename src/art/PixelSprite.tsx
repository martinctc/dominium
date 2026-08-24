import type { CSSProperties } from 'react';
import { SPRITES, SPRITE_SIZE, type SpriteName } from './sprites.js';
import { paletteFor, type TeamKey } from './palette.js';

interface Run {
  x: number;
  y: number;
  w: number;
  fill: string;
}

// Horizontal run-length encoding turns a 256-pixel grid into ~40 <rect>s, which
// keeps the DOM small enough to render a sprite per tile without trouble.
const runCache = new Map<string, Run[]>();

function runsFor(name: SpriteName, team: TeamKey | null): Run[] {
  const cacheKey = `${name}:${team ?? 'neutral'}`;
  const cached = runCache.get(cacheKey);
  if (cached) return cached;

  const palette = paletteFor(team);
  const runs: Run[] = [];

  SPRITES[name].forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      if (key === '.') {
        x += 1;
        continue;
      }
      let width = 1;
      while (x + width < row.length && row[x + width] === key) width += 1;
      const fill = palette[key];
      if (fill) runs.push({ x, y, w: width, fill });
      x += width;
    }
  });

  runCache.set(cacheKey, runs);
  return runs;
}

export interface PixelSpriteProps {
  name: SpriteName;
  size?: number;
  team?: TeamKey | null;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function PixelSprite({
  name,
  size = 20,
  team = null,
  className,
  style,
  title,
}: PixelSpriteProps) {
  const runs = runsFor(name, team);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${SPRITE_SIZE} ${SPRITE_SIZE}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable={false}
    >
      {runs.map((run) => (
        <rect key={`${run.x}-${run.y}`} x={run.x} y={run.y} width={run.w} height={1} fill={run.fill} />
      ))}
    </svg>
  );
}

/** A `cursor` CSS value drawing the given sprite, for build/placement modes. */
export function spriteCursor(name: SpriteName, team: TeamKey | null = null): string {
  const rects = runsFor(name, team)
    .map((run) => `<rect x='${run.x}' y='${run.y}' width='${run.w}' height='1' fill='${run.fill}'/>`)
    .join('');
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' ` +
    `viewBox='0 0 ${SPRITE_SIZE} ${SPRITE_SIZE}' shape-rendering='crispEdges'>${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, pointer`;
}
