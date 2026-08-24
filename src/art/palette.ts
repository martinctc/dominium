// Colour palettes for the hand-authored pixel sprites in `sprites.ts`.
//
// Every sprite is a grid of single-character palette keys. Most keys map to a
// fixed colour, but '1' / '2' / '3' are a three-shade *team ramp* that is
// substituted at render time, so one sprite serves all four players.

export type TeamKey = 'red' | 'blue' | 'green' | 'yellow';

export interface TeamRamp {
  dark: string;
  mid: string;
  light: string;
}

export const TEAM_RAMPS: Record<TeamKey, TeamRamp> = {
  red: { dark: '#8f2323', mid: '#ef4444', light: '#ff9d9d' },
  blue: { dark: '#1d4694', mid: '#3b82f6', light: '#9dc4ff' },
  green: { dark: '#15682f', mid: '#22c55e', light: '#86efac' },
  yellow: { dark: '#8a6206', mid: '#eab308', light: '#fde68a' },
};

export const NEUTRAL_RAMP: TeamRamp = {
  dark: '#4b5563',
  mid: '#9ca3af',
  light: '#e5e7eb',
};

// Fixed colours shared by every sprite. Kept deliberately small and slightly
// desaturated so hand-drawn sprites sit comfortably next to the Kenney tiles.
export const BASE_PALETTE: Record<string, string> = {
  o: '#241a24', // outline
  x: '#140f16', // deepest shadow
  s: '#f0b98b', // skin
  S: '#c2865a', // skin shadow
  w: '#8a5a30', // wood
  W: '#b8834a', // wood highlight
  n: '#5c3a1e', // wood shadow
  m: '#9aa7b8', // metal
  M: '#e2eaf4', // metal highlight
  d: '#59637a', // metal shadow
  y: '#f0c14b', // gold
  Y: '#ffe7a3', // gold highlight
  g: '#4e9c42', // foliage
  G: '#7cc45f', // foliage highlight
  f: '#255829', // forest canopy shadow
  F: '#3d8440', // forest canopy — deliberately darker than the grass tiles
  p: '#8d93a1', // stone
  P: '#c6ccd8', // stone highlight
  q: '#565c6b', // stone shadow
  e: '#a07a4a', // earth
  E: '#c79a63', // earth highlight
  h: '#6f5230', // earth shadow
  r: '#d0453f', // red accent
  b: '#4aa3e0', // water
  B: '#9fd8f5', // water highlight
};

/** Resolve the full palette for a sprite, folding in the team ramp. */
export function paletteFor(team?: TeamKey | null): Record<string, string> {
  const ramp = team ? TEAM_RAMPS[team] : NEUTRAL_RAMP;
  return { ...BASE_PALETTE, '1': ramp.dark, '2': ramp.mid, '3': ramp.light };
}
