import type { GameState, Position, TerrainType } from './types.js';

export const VISION_RANGE = 3;

export function chebyshevDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function lineBetweenPoints(from: Position, to: Position): Position[] {
  const points: Position[] = [];
  let x0 = from.x;
  let y0 = from.y;
  const x1 = to.x;
  const y1 = to.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    points.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }

  return points;
}

/**
 * Terrain that stops arrows, cannonballs and tower fire passing over it.
 * Mountains are too tall to shoot over; forest canopy is too dense to shoot
 * through. Both are still fine to shoot *into* — only intervening tiles block.
 */
function blocksSight(terrain: TerrainType | undefined): boolean {
  return terrain === 'mountain' || terrain === 'forest';
}

export function hasLineOfSight(state: GameState, from: Position, to: Position): boolean {
  const points = lineBetweenPoints(from, to);
  for (const point of points) {
    if (point.x === from.x && point.y === from.y) continue;
    if (point.x === to.x && point.y === to.y) continue;
    if (blocksSight(state.terrain[point.y]?.[point.x])) {
      return false;
    }
  }
  return true;
}

/** Returns the tiles currently visible to a player, including their own structures. */
export function getVisibleTilesForPlayer(state: GameState, playerId: string): Set<string> {
  const player = state.players.find((entry) => entry.id === playerId);
  const origins = [
    ...state.units.filter((unit) => unit.ownerId === playerId).map((unit) => unit.position),
    ...state.bases.filter((base) => base.ownerId === playerId).map((base) => base.position),
  ];
  const visible = new Set<string>();

  // During setup there is no base or unit to provide vision yet. Reveal the
  // player's home zone so base placement is an informed choice.
  if (state.phase === 'setup' && player) {
    for (let y = player.homeZone.y1; y <= player.homeZone.y2; y += 1) {
      for (let x = player.homeZone.x1; x <= player.homeZone.x2; x += 1) {
        visible.add(`${x},${y}`);
      }
    }
  }

  for (const origin of origins) {
    for (let y = origin.y - VISION_RANGE; y <= origin.y + VISION_RANGE; y += 1) {
      for (let x = origin.x - VISION_RANGE; x <= origin.x + VISION_RANGE; x += 1) {
        if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
        const target = { x, y };
        if (chebyshevDistance(origin, target) <= VISION_RANGE && hasLineOfSight(state, origin, target)) {
          visible.add(`${x},${y}`);
        }
      }
    }
  }

  return visible;
}
