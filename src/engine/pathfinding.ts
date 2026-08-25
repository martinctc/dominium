import type { GameState, Position, TerrainType, Unit } from './types.js';

const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

function tileKey(position: Position) {
  return `${position.x}:${position.y}`;
}

export function hasRoad(state: GameState, position: Position): boolean {
  return state.roads.some((road) => road.x === position.x && road.y === position.y);
}

/**
 * The single source of truth for "can a unit ever stand on this terrain?".
 * Lakes and mountains block; plain, hills and forest do not (the latter two
 * merely cost extra movement). Anything that needs to reason about passability
 * — map fairness checks, tests, pathfinding — must go through this, otherwise
 * adding a terrain type silently breaks whichever copy was forgotten.
 */
export function isPassableTerrain(terrain: TerrainType | undefined): boolean {
  return terrain === 'plain' || terrain === 'hills' || terrain === 'forest';
}

export function isBlockedByTerrain(state: GameState, position: Position) {
  if (position.x < 0 || position.y < 0 || position.x >= state.width || position.y >= state.height) {
    return true;
  }
  // A road/bridge on a lake tile makes it crossable (mountains remain impassable).
  if (hasRoad(state, position)) return false;
  return !isPassableTerrain(state.terrain[position.y]?.[position.x]);
}

/** Movement cost to step onto this tile: hills and forest are slow going (2), everything else
 * is normal (1). A road/bridge always normalizes the tile to cost 1, since it's paved
 * regardless of terrain — *unless* the step is travelling road-to-road, i.e. both the tile
 * being left and the tile being entered are paved, in which case it costs half (0.5). This
 * rewards actually following a road/bridge rather than merely starting or ending on one. */
function tileMoveCost(state: GameState, from: Position, to: Position): number {
  if (hasRoad(state, from) && hasRoad(state, to)) return 0.5;
  if (hasRoad(state, to)) return 1;
  const terrain = state.terrain[to.y]?.[to.x];
  return terrain === 'hills' || terrain === 'forest' ? 2 : 1;
}

function isOccupied(state: GameState, position: Position, excludeUnitId?: string) {
  for (const unit of state.units) {
    if (excludeUnitId && unit.id === excludeUnitId) continue;
    if (unit.position.x === position.x && unit.position.y === position.y) {
      return true;
    }
  }
  return false;
}

/**
 * Enemy buildings are solid: units cannot stand on, or path through, them.
 * Friendly buildings can be occupied and crossed by their owner's units.
 */
export function isBlockedByBuilding(state: GameState, position: Position, unitOwnerId?: string) {
  return state.bases.some(
    (building) =>
      building.position.x === position.x &&
      building.position.y === position.y &&
      building.ownerId !== unitOwnerId,
  );
}

function canMoveDiagonal(state: GameState, from: Position, to: Position) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) !== 1 || Math.abs(dy) !== 1) return true;

  const cornerX = from.x + dx;
  const cornerY = from.y;
  const cornerY2 = from.y + dy;
  const cornerX2 = from.x;

  // Buildings occupy their own tiles, but unlike mountains they do not seal
  // the diagonal gap between two orthogonally adjacent buildings.
  return !isBlockedByTerrain(state, { x: cornerX, y: cornerY }) && !isBlockedByTerrain(state, { x: cornerX2, y: cornerY2 });
}

/** Dijkstra-style expansion using a small sorted frontier (boards are small, so this stays cheap). */
function popClosest(frontier: Array<{ key: string; position: Position; distance: number }>) {
  let bestIndex = 0;
  for (let i = 1; i < frontier.length; i += 1) {
    if (frontier[i].distance < frontier[bestIndex].distance) bestIndex = i;
  }
  return frontier.splice(bestIndex, 1)[0];
}

export function getReachableTiles(state: GameState, unit: Unit): Position[] {
  const start = { x: unit.position.x, y: unit.position.y };
  const moveRange = unit.moveRange;
  const frontier: Array<{ key: string; position: Position; distance: number }> = [
    { key: tileKey(start), position: start, distance: 0 },
  ];
  const visited = new Map<string, number>([[tileKey(start), 0]]);

  while (frontier.length > 0) {
    const current = popClosest(frontier);
    const distance = current.distance;

    if (distance >= moveRange) continue;

    for (const direction of DIRECTIONS) {
      const next = { x: current.position.x + direction.x, y: current.position.y + direction.y };
      const nextKey = tileKey(next);
      if (isBlockedByTerrain(state, next)) continue;
      if (isOccupied(state, next, unit.id)) continue;
      if (isBlockedByBuilding(state, next, unit.ownerId)) continue;
      if (!canMoveDiagonal(state, current.position, next)) continue;
      const nextDistance = distance + tileMoveCost(state, current.position, next);
      if (nextDistance > moveRange) continue;
      if (visited.has(nextKey) && (visited.get(nextKey) ?? Infinity) <= nextDistance) continue;

      visited.set(nextKey, nextDistance);
      frontier.push({ key: nextKey, position: next, distance: nextDistance });
    }
  }

  return [...visited.entries()]
    .filter(([key]) => key !== tileKey(start))
    .map(([key]) => {
      const [x, y] = key.split(':').map(Number);
      return { x, y };
    });
}

export function findPath(state: GameState, unit: Unit, destination: Position): Position[] {
  if (unit.position.x === destination.x && unit.position.y === destination.y) {
    return [destination];
  }

  const start = { x: unit.position.x, y: unit.position.y };
  const moveRange = unit.moveRange;
  const frontier: Array<{ key: string; position: Position; distance: number }> = [
    { key: tileKey(start), position: start, distance: 0 },
  ];
  const visited = new Map<string, number>([[tileKey(start), 0]]);
  const previous = new Map<string, string | null>([[tileKey(start), null]]);

  while (frontier.length > 0) {
    const current = popClosest(frontier);
    const currentDistance = current.distance;

    if (current.position.x === destination.x && current.position.y === destination.y) break;
    if (currentDistance >= moveRange) continue;

    for (const direction of DIRECTIONS) {
      const next = { x: current.position.x + direction.x, y: current.position.y + direction.y };
      const nextKey = tileKey(next);
      if (isBlockedByTerrain(state, next)) continue;
      if (isOccupied(state, next, unit.id)) continue;
      if (isBlockedByBuilding(state, next, unit.ownerId)) continue;
      if (!canMoveDiagonal(state, current.position, next)) continue;
      const nextDistance = currentDistance + tileMoveCost(state, current.position, next);
      if (nextDistance > moveRange) continue;
      if (visited.has(nextKey) && (visited.get(nextKey) ?? Infinity) <= nextDistance) continue;
      visited.set(nextKey, nextDistance);
      previous.set(nextKey, current.key);
      frontier.push({ key: nextKey, position: next, distance: nextDistance });
    }
  }

  const destinationKey = tileKey(destination);
  if (!visited.has(destinationKey)) return [];

  const path: Position[] = [];
  let cursor: string | null = destinationKey;
  while (cursor) {
    const [x, y] = cursor.split(':').map(Number);
    path.push({ x, y });
    cursor = previous.get(cursor) ?? null;
  }

  path.reverse();
  return path;
}
