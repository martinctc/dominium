// Shared primitives for the isometric art in `IsoStructures.tsx` and
// `IsoUnits.tsx`.
//
// Everything is built from shaded solids in a true 2:1 isometric projection and
// lit from a single top-left source, so a whole piece recolours from one base
// colour per solid. Player-owned art takes its accent from the team ramp in
// `palette.ts`, which keeps one definition serving all four players.
import type { CSSProperties, ReactNode } from 'react';
import { TEAM_RAMPS, NEUTRAL_RAMP, type TeamKey } from './palette.js';

// One "tile unit" of ground is HW*2 wide and HH*2 tall on screen (the 2:1
// diamond); one unit of height is VH pixels.
export const HW = 16;
export const HH = 8;
export const VH = 16;

/** Project a point in isometric space to 2D viewBox coordinates. */
export function pt(x: number, y: number, z: number): string {
  return `${(x - y) * HW},${(x + y) * HH - z * VH}`;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Lighten (amount > 0) or darken (amount < 0) a hex colour. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  const mix = (c: number) => clamp(c + (target - c) * t);
  return `#${((mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).padStart(6, '0')}`;
}

export interface SolidProps {
  /** Ground footprint, in tile units. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Height range, in tile units. */
  z0: number;
  z1: number;
  color: string;
  /** Shrink of the top face towards its centre; 1 = a point (a pyramid). */
  taper?: number;
}

/**
 * A shaded solid: a box, or a frustum/pyramid when tapered. Only the three
 * faces an isometric camera can see are drawn.
 */
export function Solid({ x0, y0, x1, y1, z0, z1, color, taper = 0 }: SolidProps) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const tx0 = x0 + (cx - x0) * taper;
  const tx1 = x1 + (cx - x1) * taper;
  const ty0 = y0 + (cy - y0) * taper;
  const ty1 = y1 + (cy - y1) * taper;
  return (
    <>
      <polygon
        fill={shade(color, 0.2)}
        points={`${pt(tx0, ty0, z1)} ${pt(tx1, ty0, z1)} ${pt(tx1, ty1, z1)} ${pt(tx0, ty1, z1)}`}
      />
      <polygon
        fill={shade(color, -0.08)}
        points={`${pt(tx0, ty1, z1)} ${pt(tx1, ty1, z1)} ${pt(x1, y1, z0)} ${pt(x0, y1, z0)}`}
      />
      <polygon
        fill={shade(color, -0.32)}
        points={`${pt(tx1, ty0, z1)} ${pt(tx1, ty1, z1)} ${pt(x1, y1, z0)} ${pt(x1, y0, z0)}`}
      />
    </>
  );
}

/** A pitched roof with its ridge running along the x axis. */
export function Roof({
  x0,
  y0,
  x1,
  y1,
  z0,
  peak,
  color,
}: {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z0: number;
  peak: number;
  color: string;
}) {
  const ym = (y0 + y1) / 2;
  return (
    <>
      {/* Far slope, seen foreshortened from above. */}
      <polygon
        fill={shade(color, 0.16)}
        points={`${pt(x0, y0, z0)} ${pt(x1, y0, z0)} ${pt(x1, ym, peak)} ${pt(x0, ym, peak)}`}
      />
      {/* Near slope. */}
      <polygon
        fill={shade(color, -0.12)}
        points={`${pt(x0, ym, peak)} ${pt(x1, ym, peak)} ${pt(x1, y1, z0)} ${pt(x0, y1, z0)}`}
      />
      {/* Gable end facing the camera. */}
      <polygon
        fill={shade(color, -0.34)}
        points={`${pt(x1, y0, z0)} ${pt(x1, ym, peak)} ${pt(x1, y1, z0)}`}
      />
    </>
  );
}

/** A pennant on a pole, used to fly the owner's colours. */
export function Banner({
  x,
  y,
  z,
  height,
  color,
}: {
  x: number;
  y: number;
  z: number;
  height: number;
  color: string;
}) {
  const top = z + height;
  return (
    <>
      <polygon
        fill="#3a3f4b"
        points={`${pt(x - 0.03, y, z)} ${pt(x + 0.03, y, z)} ${pt(x + 0.03, y, top)} ${pt(x - 0.03, y, top)}`}
      />
      <polygon
        fill={color}
        points={`${pt(x + 0.03, y, top)} ${pt(x + 0.42, y, top - 0.12)} ${pt(x + 0.03, y, top - 0.26)}`}
      />
    </>
  );
}

// Shared material colours, kept close to the pixel-art palette so the two
// styles sit together without clashing.
export const STONE = '#9aa3b2';
export const DARK_STONE = '#6f7889';
export const WOOD = '#8a5a30';
export const WOOD_LIGHT = '#b8834a';
export const LEAF = '#4f9c4a';
export const LEAF_DEEP = '#357038';
export const GRASS = '#5f9455';
export const ROCK = '#7d8595';
export const SOIL = '#8a6039';
export const GOLD = '#f0c14b';
export const STEEL = '#b9c2d0';
export const STEEL_DARK = '#78829a';
export const SKIN = '#e8b088';
export const LEATHER = '#7a5a34';
export const HORSE = '#6b4a34';
export const IRON = '#4a5160';

export interface IsoIconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
  team?: TeamKey | null;
}

// The viewBox is sized so the tile footprint diamond spans x -16..16 / y 0..16,
// with headroom above for tall pieces. `ISO_ANCHOR_RATIO` is where the footprint
// centre falls, as a fraction of the rendered height, so callers can plant a
// piece on the middle of a tile.
const VB_X = -16;
const VB_Y = -30;
const VB_W = 32;
const VB_H = 46;
export const ISO_ASPECT = VB_H / VB_W;
export const ISO_ANCHOR_RATIO = (HH - VB_Y) / VB_H;

export function rampFor(team: TeamKey | null | undefined) {
  return team ? TEAM_RAMPS[team] : NEUTRAL_RAMP;
}

export function Frame({
  size = 40,
  className,
  style,
  title,
  children,
}: IsoIconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size * ISO_ASPECT}
      viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable={false}
    >
      {children}
    </svg>
  );
}
