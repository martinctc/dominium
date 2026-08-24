// Terrain tile images. These are 16x16 CC0 PNGs from Kenney's Tiny Battle and
// Tiny Town packs (see ATTRIBUTION.md). Each one is well under Vite's inline
// limit, so they are emitted as data URIs and cost no extra requests.
import grassA from './tiles/grass-a.png';
import grassB from './tiles/grass-b.png';
import grassC from './tiles/grass-c.png';
import waterA from './tiles/water-a.png';
import waterB from './tiles/water-b.png';
import dirtTile from './tiles/dirt.png';

export const DIRT_TILE = dirtTile;

// Cheap integer hash so terrain variation is stable for a given board position
// rather than reshuffling on every React render.
function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// Only flat texture varies between tiles. Anything that looks like an *object*
// is reserved for real game state, so players never mistake decoration for an
// obstacle or a resource. The variants below are therefore deliberately limited
// to plain grass, grass with low tufts, and its mirror image: no flowers, no
// islets, nothing that could be read as a unit, node or obstacle.

/** Grass, with low tufts on some tiles so large fields are not perfectly flat. */
export function grassTile(x: number, y: number): string {
  const roll = hash(x, y) % 100;
  if (roll < 60) return grassA;
  if (roll < 80) return grassB;
  return grassC;
}

/** Open water. The two variants are mirrors, so lakes never show a seam. */
export function waterTile(x: number, y: number): string {
  return hash(x + 977, y + 331) % 2 === 0 ? waterA : waterB;
}
