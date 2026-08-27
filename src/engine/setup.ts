import type {
  Base,
  GameState,
  MapTheme,
  Player,
  PlayerColor,
  Position,
  ResourceKey,
  ResourceNode,
  ResourceNodeBonus,
  SpecialSkill,
  StartingResourceLevel,
  TerrainType,
} from './types.js';
import { BASE_MAX_HP } from './units.js';
import { isPassableTerrain } from './pathfinding.js';

/** Each player begins the game holding this many of each resource, for a quicker start. */
export const STARTING_RESOURCES = 2;
export const STARTING_RESOURCE_AMOUNTS: Record<StartingResourceLevel, number> = {
  low: 1,
  normal: STARTING_RESOURCES,
  high: 4,
  deathmatch: 10,
};

/** Minimum Chebyshev distance required between any two players' bases when placing freely. */
export function minBaseDistance(width: number, height: number): number {
  return Math.max(3, Math.floor(Math.min(width, height) / 4));
}

/** Small deterministic PRNG so terrain generation stays reproducible for a given seed. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed?: string): number {
  if (!seed) return 1;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return hash || 1;
}

/** Grows a contiguous blob of `terrainType` starting from (x, y), roughly `targetSize` tiles. */
function growTerrainBlob(
  terrain: TerrainType[][],
  width: number,
  height: number,
  startX: number,
  startY: number,
  targetSize: number,
  terrainType: TerrainType,
  rng: () => number,
): Position[] {
  const frontier: Position[] = [{ x: startX, y: startY }];
  const placed = new Set<string>();
  const placedPositions: Position[] = [];

  while (placed.size < targetSize && frontier.length > 0) {
    const index = Math.floor(rng() * frontier.length);
    const [current] = frontier.splice(index, 1);
    const key = `${current.x}:${current.y}`;
    if (placed.has(key)) continue;
    if (current.x < 0 || current.y < 0 || current.x >= width || current.y >= height) continue;
    if (terrain[current.y][current.x] !== 'plain') continue;

    terrain[current.y][current.x] = terrainType;
    placed.add(key);
    placedPositions.push(current);

    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];
    for (const neighbor of neighbors) {
      // Bias growth to stay compact rather than spidering out into thin lines.
      if (rng() < 0.75) frontier.push(neighbor);
    }
  }

  return placedPositions;
}

function makePlainGrid(width: number, height: number): TerrainType[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => 'plain' as TerrainType));
}

/** Rotates a position 180 degrees around the board center. */
function rotate180(position: Position, width: number, height: number): Position {
  return { x: width - 1 - position.x, y: height - 1 - position.y };
}

/** Rotates a position 90 degrees clockwise around the board center (square boards only). */
function rotate90(position: Position, size: number): Position {
  return { x: size - 1 - position.y, y: position.x };
}

/**
 * Mirrors freshly-placed tiles onto the board using rotational symmetry, so
 * the terrain is fair regardless of which corner a player's home zone is in.
 * `order` is 2 (180-degree, used for 2 players) or 4 (90-degree, for 4 players
 * on a square board).
 */
function applySymmetry(
  terrain: TerrainType[][],
  placed: Position[],
  terrainType: TerrainType,
  width: number,
  height: number,
  order: 2 | 4,
): void {
  for (const position of placed) {
    if (order === 2) {
      const mirrored = rotate180(position, width, height);
      if (terrain[mirrored.y]?.[mirrored.x] === 'plain') {
        terrain[mirrored.y][mirrored.x] = terrainType;
      }
    } else {
      let current = position;
      for (let step = 0; step < 3; step += 1) {
        current = rotate90(current, width);
        if (terrain[current.y]?.[current.x] === 'plain') {
          terrain[current.y][current.x] = terrainType;
        }
      }
    }
  }
}

function isPassable(terrain: TerrainType[][], position: Position): boolean {
  return isPassableTerrain(terrain[position.y]?.[position.x]);
}

/** BFS to find all passable tiles reachable (4-directionally) from a starting tile. */
function reachablePassableTiles(
  terrain: TerrainType[][],
  width: number,
  height: number,
  start: Position,
): Set<string> {
  const visited = new Set<string>();
  if (!isPassable(terrain, start)) return visited;
  const queue: Position[] = [start];
  visited.add(`${start.x}:${start.y}`);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];
    for (const neighbor of neighbors) {
      if (neighbor.x < 0 || neighbor.y < 0 || neighbor.x >= width || neighbor.y >= height) continue;
      const key = `${neighbor.x}:${neighbor.y}`;
      if (visited.has(key)) continue;
      if (!isPassable(terrain, neighbor)) continue;
      visited.add(key);
      queue.push(neighbor);
    }
  }

  return visited;
}

interface HomeZone {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function homeZoneTiles(zone: HomeZone): Position[] {
  const tiles: Position[] = [];
  for (let y = zone.y1; y <= zone.y2; y += 1) {
    for (let x = zone.x1; x <= zone.x2; x += 1) {
      tiles.push({ x, y });
    }
  }
  return tiles;
}

function homeZonePassableCount(terrain: TerrainType[][], zone: HomeZone): number {
  return homeZoneTiles(zone).filter((tile) => isPassable(terrain, tile)).length;
}

/**
 * Validates the fairness/connectivity guarantees from DESIGN.md section 7:
 * every player's home zone has at least `minPassableTiles` passable tiles,
 * and all players' home zones are mutually reachable by land.
 */
function validateMapFairness(
  terrain: TerrainType[][],
  width: number,
  height: number,
  playerCount: number,
  minPassableTiles = 6,
  requireConnectivity = true,
): boolean {
  const zones = Array.from({ length: playerCount }, (_, index) => getHomeZoneForPlayer(index, width, height));

  for (const zone of zones) {
    if (homeZonePassableCount(terrain, zone) < minPassableTiles) return false;
  }

  if (!requireConnectivity) return true;

  const zoneAnchors: Position[] = [];
  for (const zone of zones) {
    const passableTiles = homeZoneTiles(zone).filter((tile) => isPassable(terrain, tile));
    if (passableTiles.length === 0) return false;
    zoneAnchors.push(passableTiles[0]);
  }

  const reachableFromFirst = reachablePassableTiles(terrain, width, height, zoneAnchors[0]);
  for (const anchor of zoneAnchors.slice(1)) {
    if (!reachableFromFirst.has(`${anchor.x}:${anchor.y}`)) return false;
  }

  return true;
}

/** Draws a wobbly diagonal "river" of lake tiles across the board (2 tiles wide), biased by rng. */
function carveRiver(terrain: TerrainType[][], width: number, height: number, rng: () => number): void {
  const horizontal = width >= height;
  const length = horizontal ? width : height;
  const span = horizontal ? height : width;
  let center = span / 2 + (rng() - 0.5) * span * 0.3;

  for (let i = 0; i < length; i += 1) {
    center += (rng() - 0.5) * 1.6;
    center = Math.max(1, Math.min(span - 2, center));
    const bankWidth = 1 + (rng() < 0.3 ? 1 : 0);
    for (let offset = -bankWidth; offset <= bankWidth; offset += 1) {
      const pos = Math.round(center) + offset;
      if (pos < 0 || pos >= span) continue;
      const x = horizontal ? i : pos;
      const y = horizontal ? pos : i;
      if (terrain[y]?.[x] === 'plain') terrain[y][x] = 'lake';
    }
  }
}

/**
 * Theme-specific terrain generators. Each produces a candidate terrain grid
 * for one seeded attempt; the shared retry/fairness-check loop in
 * `generateThemedTerrain` re-rolls with a derived seed until the DESIGN.md
 * guarantees (open home zones, mutual reachability) are satisfied.
 */
/**
 * Places a scattering of hill blobs. Hills cost extra movement without
 * blocking it, so every theme gets some as texture — the 'hills' theme just
 * turns the dial much higher.
 */
function scatterHills(
  terrain: TerrainType[][],
  width: number,
  height: number,
  rng: () => number,
  playerCount: number,
  density = 45,
): void {
  const symmetryOrder: 2 | 4 = playerCount === 4 && width === height ? 4 : 2;
  const useSymmetry = playerCount === 2 || playerCount === 4;
  const area = width * height;
  const blobs = Math.max(1, Math.round(area / density));
  const blobTargetSize = Math.max(2, Math.round(area / 50));

  for (let i = 0; i < blobs; i += 1) {
    const startX = Math.floor(rng() * width);
    const startY = Math.floor(rng() * height);
    const placed = growTerrainBlob(terrain, width, height, startX, startY, blobTargetSize, 'hills', rng);
    if (useSymmetry) applySymmetry(terrain, placed, 'hills', width, height, symmetryOrder);
  }
}

/**
 * Places a scattering of forest blobs. Forest costs extra movement *and* blocks
 * line of sight, so it is deliberately sparser than hills — a board thick with
 * it would make cannons and archers close to useless.
 */
function scatterForest(
  terrain: TerrainType[][],
  width: number,
  height: number,
  rng: () => number,
  playerCount: number,
  density = 55,
): void {
  const symmetryOrder: 2 | 4 = playerCount === 4 && width === height ? 4 : 2;
  const useSymmetry = playerCount === 2 || playerCount === 4;
  const area = width * height;
  const blobs = Math.max(2, Math.round(area / density));
  const blobTargetSize = Math.max(2, Math.round(area / 60));

  for (let i = 0; i < blobs; i += 1) {
    // growTerrainBlob bails the moment its seed tile isn't plain, and forest is
    // scattered *last*, so an unguarded random start usually lands on existing
    // water, rock or hills and silently places nothing. Retry until we find
    // open ground so every board actually gets somewhere to put a lumber camp.
    let startX = 0;
    let startY = 0;
    let found = false;
    for (let attempt = 0; attempt < 40 && !found; attempt += 1) {
      startX = Math.floor(rng() * width);
      startY = Math.floor(rng() * height);
      found = terrain[startY][startX] === 'plain';
    }
    if (!found) continue;
    const placed = growTerrainBlob(terrain, width, height, startX, startY, blobTargetSize, 'forest', rng);
    if (useSymmetry) applySymmetry(terrain, placed, 'forest', width, height, symmetryOrder);
  }
}

function generateRandomTerrainAttempt(
  width: number,
  height: number,
  rng: () => number,
  playerCount: number,
): TerrainType[][] {
  const terrain = makePlainGrid(width, height);
  const symmetryOrder: 2 | 4 = playerCount === 4 && width === height ? 4 : 2;
  const useSymmetry = playerCount === 2 || playerCount === 4;
  const area = width * height;
  const lakeCount = Math.max(1, Math.round(area / 55));
  const mountainCount = Math.max(1, Math.round(area / 65));
  const blobTargetSize = Math.max(3, Math.round(area / 40));

  const placeBlobs = (count: number, terrainType: TerrainType) => {
    for (let i = 0; i < count; i += 1) {
      const startX = Math.floor(rng() * width);
      const startY = Math.floor(rng() * height);
      const placed = growTerrainBlob(terrain, width, height, startX, startY, blobTargetSize, terrainType, rng);
      if (useSymmetry) applySymmetry(terrain, placed, terrainType, width, height, symmetryOrder);
    }
  };

  placeBlobs(lakeCount, 'lake');
  placeBlobs(mountainCount, 'mountain');
  scatterHills(terrain, width, height, rng, playerCount);
  scatterForest(terrain, width, height, rng, playerCount);
  return terrain;
}

/** A single wide river cutting across the board, plus a couple of small mountain accents. */
function generateRiverTerrainAttempt(
  width: number,
  height: number,
  rng: () => number,
  playerCount: number,
): TerrainType[][] {
  const terrain = makePlainGrid(width, height);
  carveRiver(terrain, width, height, rng);

  const area = width * height;
  const mountainBlobs = Math.max(1, Math.round(area / 90));
  const blobTargetSize = Math.max(2, Math.round(area / 60));
  for (let i = 0; i < mountainBlobs; i += 1) {
    const startX = Math.floor(rng() * width);
    const startY = Math.floor(rng() * height);
    growTerrainBlob(terrain, width, height, startX, startY, blobTargetSize, 'mountain', rng);
  }
  scatterHills(terrain, width, height, rng, playerCount, 55);
  // Woodland along the riverbanks, giving both sides cover on the approach.
  scatterForest(terrain, width, height, rng, playerCount, 55);
  return terrain;
}

/** Rolling hills covering much of the board, slowing movement without blocking it, plus sparse mountains. */
function generateHillsTerrainAttempt(
  width: number,
  height: number,
  rng: () => number,
  playerCount: number,
): TerrainType[][] {
  const terrain = makePlainGrid(width, height);
  const symmetryOrder: 2 | 4 = playerCount === 4 && width === height ? 4 : 2;
  const useSymmetry = playerCount === 2 || playerCount === 4;
  const area = width * height;
  const hillBlobs = Math.max(2, Math.round(area / 22));
  const mountainBlobs = Math.max(1, Math.round(area / 90));
  const blobTargetSize = Math.max(4, Math.round(area / 24));

  for (let i = 0; i < hillBlobs; i += 1) {
    const startX = Math.floor(rng() * width);
    const startY = Math.floor(rng() * height);
    const placed = growTerrainBlob(terrain, width, height, startX, startY, blobTargetSize, 'hills', rng);
    if (useSymmetry) applySymmetry(terrain, placed, 'hills', width, height, symmetryOrder);
  }
  for (let i = 0; i < mountainBlobs; i += 1) {
    const startX = Math.floor(rng() * width);
    const startY = Math.floor(rng() * height);
    const placed = growTerrainBlob(terrain, width, height, startX, startY, Math.max(2, Math.round(area / 60)), 'mountain', rng);
    if (useSymmetry) applySymmetry(terrain, placed, 'mountain', width, height, symmetryOrder);
  }
  // Sparse woodland in the valleys, so a hills map still offers somewhere to
  // put a lumber camp.
  scatterForest(terrain, width, height, rng, playerCount, 75);
  return terrain;
}

/** Mostly open plain with a small central pool, so the coveted resources cluster in a contested middle. */
function generateOasisTerrainAttempt(
  width: number,
  height: number,
  rng: () => number,
  playerCount: number,
): TerrainType[][] {
  const terrain = makePlainGrid(width, height);
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const poolSize = Math.max(3, Math.round((width * height) / 45));
  growTerrainBlob(terrain, width, height, centerX, centerY, poolSize, 'lake', rng);

  // A few decorative mountain accents well away from the center, so they don't wall off the oasis.
  const area = width * height;
  const mountainBlobs = Math.max(1, Math.round(area / 100));
  for (let i = 0; i < mountainBlobs; i += 1) {
    const startX = rng() < 0.5 ? Math.floor(rng() * (width * 0.2)) : Math.floor(width - rng() * (width * 0.2));
    const startY = rng() < 0.5 ? Math.floor(rng() * (height * 0.2)) : Math.floor(height - rng() * (height * 0.2));
    growTerrainBlob(terrain, width, height, startX, startY, Math.max(2, Math.round(area / 70)), 'mountain', rng);
  }
  // Hills ring the approach to the oasis, making the run to the middle cost something.
  scatterHills(terrain, width, height, rng, playerCount, 60);
  // A thin belt of trees so each corner has at least a chance of a lumber camp.
  scatterForest(terrain, width, height, rng, playerCount, 85);
  return terrain;
}

/**
 * Generates terrain for the requested theme, re-rolling (deterministically,
 * derived from the same seed) until the DESIGN.md map fairness guarantees are
 * met: every player's home zone stays open, and (for themes other than
 * 'river', where a bridge is the intended crossing) all home zones remain
 * mutually reachable by land. Falls back to an open plain board if no attempt
 * succeeds within `maxAttempts`.
 */
export function generateThemedTerrain(
  width: number,
  height: number,
  terrainSeed?: string,
  playerCount = 2,
  theme: MapTheme = 'random',
  maxAttempts = 25,
): TerrainType[][] {
  const baseSeedValue = hashSeed(terrainSeed);
  // A river is meant to divide the board (crossed via player-built bridges), so skip the
  // full-board connectivity check for that theme and only enforce open home zones.
  const requireConnectivity = theme !== 'river';

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const rng = mulberry32(baseSeedValue + attempt * 104729);
    const terrain =
      theme === 'river'
        ? generateRiverTerrainAttempt(width, height, rng, playerCount)
        : theme === 'hills'
          ? generateHillsTerrainAttempt(width, height, rng, playerCount)
          : theme === 'oasis'
            ? generateOasisTerrainAttempt(width, height, rng, playerCount)
            : generateRandomTerrainAttempt(width, height, rng, playerCount);

    if (validateMapFairness(terrain, width, height, playerCount, 6, requireConnectivity)) {
      return terrain;
    }
  }

  console.warn(
    `[mapgen] Could not generate a fair "${theme}" map after ${maxAttempts} attempts; falling back to open plains.`,
  );
  return makePlainGrid(width, height);
}

/**
 * Generates terrain as a handful of contiguous "big lake"/"big mountain" blobs
 * rather than scattered single tiles, so obstacles read as real geographic
 * features on the map. Uses rotational symmetry for 2/4 player games so no
 * player is favoured, and re-rolls (deterministically, derived from the same
 * seed) until every player's home zone stays open and all home zones remain
 * mutually reachable by land, per DESIGN.md's map fairness guarantees. Falls
 * back to an open plain board if no attempt succeeds within `maxAttempts`.
 */
export function defaultTerrain(
  width: number,
  height: number,
  terrainSeed?: string,
  playerCount = 2,
  maxAttempts = 25,
): TerrainType[][] {
  return generateThemedTerrain(width, height, terrainSeed, playerCount, 'random', maxAttempts);
}

/**
 * Alternating bonus kinds, so a board always offers a mix of one-off treasure
 * chests and territory that pays out every turn. Deciding this at generation
 * (rather than at capture) is what lets the board show players what they are
 * running for.
 */
function bonusForIndex(index: number): ResourceNodeBonus {
  return index % 2 === 0 ? 'ongoing' : 'lumpSum';
}

/** Scatters a handful of neutral, capturable resource nodes across passable tiles. */
export function generateResourceNodes(
  width: number,
  height: number,
  terrain: TerrainType[][],
  seed?: string,
  nodeCount?: number,
): ResourceNode[] {
  const resourceCycle: ResourceKey[] = ['food', 'wood', 'stone'];
  const seedValue = seed ? seed.length : 0;
  const nodes: ResourceNode[] = [];
  const targetNodeCount = nodeCount ?? Math.max(3, Math.round((width * height) / 22));

  let attempt = 0;
  let cycleIndex = 0;
  while (nodes.length < targetNodeCount && attempt < width * height) {
    const x = (attempt * 13 + seedValue * 5 + 3) % width;
    const y = (attempt * 7 + seedValue * 3 + 4) % height;
    attempt += 1;
    if (terrain[y]?.[x] === 'lake' || terrain[y]?.[x] === 'mountain') continue;
    if (nodes.some((node) => node.position.x === x && node.position.y === y)) continue;

    nodes.push({
      id: `resource-node-${nodes.length}`,
      position: { x, y },
      resource: resourceCycle[cycleIndex % resourceCycle.length],
      ownerId: null,
      bonus: bonusForIndex(nodes.length),
    });
    cycleIndex += 1;
  }

  return nodes;
}

/**
 * Places resource nodes clustered near the board's center (the "oasis" pool),
 * so all players are drawn to contest the same central area.
 */
export function generateClusteredResourceNodes(
  width: number,
  height: number,
  terrain: TerrainType[][],
  seed?: string,
  nodeCount?: number,
): ResourceNode[] {
  const resourceCycle: ResourceKey[] = ['food', 'wood', 'stone'];
  const targetNodeCount = nodeCount ?? Math.max(3, Math.round((width * height) / 22));
  const rng = mulberry32(hashSeed(seed) + 777);
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.max(2, Math.round(Math.min(width, height) / 4));

  const nodes: ResourceNode[] = [];
  let attempt = 0;
  let cycleIndex = 0;
  while (nodes.length < targetNodeCount && attempt < width * height * 4) {
    attempt += 1;
    const angle = rng() * Math.PI * 2;
    const radius = rng() * maxRadius;
    const x = Math.round(centerX + Math.cos(angle) * radius);
    const y = Math.round(centerY + Math.sin(angle) * radius);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    if (terrain[y]?.[x] === 'lake' || terrain[y]?.[x] === 'mountain') continue;
    if (nodes.some((node) => node.position.x === x && node.position.y === y)) continue;

    nodes.push({
      id: `resource-node-${nodes.length}`,
      position: { x, y },
      resource: resourceCycle[cycleIndex % resourceCycle.length],
      ownerId: null,
      bonus: bonusForIndex(nodes.length),
    });
    cycleIndex += 1;
  }

  return nodes;
}

/**
 * Home zones are corner blocks, ordered so that consecutive players are as far
 * apart as possible: a 2-player game gets diagonally opposite corners rather
 * than two adjacent ones along the same edge.
 */
export function getHomeZoneForPlayer(playerIndex: number, width: number, height: number) {
  const left = { x1: 0, x2: Math.floor(width / 3) - 1 };
  const right = { x1: Math.floor((2 * width) / 3), x2: width - 1 };
  const top = { y1: 0, y2: Math.floor(height / 3) - 1 };
  const bottom = { y1: Math.floor((2 * height) / 3), y2: height - 1 };

  const corners = [
    { ...left, ...top },
    { ...right, ...bottom },
    { ...right, ...top },
    { ...left, ...bottom },
  ];

  return corners[Math.min(Math.max(playerIndex, 0), corners.length - 1)];
}

export function getBasePositionForPlayer(playerIndex: number, width: number, height: number): Position {
  const zone = getHomeZoneForPlayer(playerIndex, width, height);
  const x = Math.min(zone.x1 + Math.max(0, Math.floor((zone.x2 - zone.x1) / 2)), width - 1);
  const y = Math.min(zone.y1 + Math.max(0, Math.floor((zone.y2 - zone.y1) / 2)), height - 1);
  return { x, y };
}

export function createPlayer(
  playerIndex: number,
  width: number,
  height: number,
  specialSkill: SpecialSkill = 'medicTroops',
  startingResources = STARTING_RESOURCES,
): Player {
  const colorMap: PlayerColor[] = ['red', 'blue', 'green', 'yellow'];
  const zone = getHomeZoneForPlayer(playerIndex, width, height);
  return {
    id: `player-${playerIndex + 1}`,
    name: `Player ${playerIndex + 1}`,
    color: colorMap[playerIndex] ?? 'red',
    specialSkill,
    baseId: '',
    alive: true,
    eliminatedOnTurn: null,
    resources: { food: startingResources, wood: startingResources, stone: startingResources },
    research: { food: 0, wood: 0, stone: 0 },
    hasCollectedIncomeThisTurn: false,
    homeZone: zone,
    stats: {
      unitsBuilt: 0,
      unitsLost: 0,
      unitsKilled: 0,
      buildingsRazed: 0,
      nodesCaptured: 0,
      settlementsFounded: 0,
      towersBuilt: 0,
      economyBuilt: 0,
      // Seeded with the starting stockpile so the running totals hold the
      // invariant: collected - spent === what the player currently has.
      incomeCollected: { food: startingResources, wood: startingResources, stone: startingResources },
      resourcesSpent: { food: 0, wood: 0, stone: 0 },
    },
  };
}

export function createInitialState({
  width = 10,
  height = 10,
  playerCount = 2,
  terrain,
  seed = 'initial',
  nodeCount,
  theme = 'random',
  specialSkill = 'medicTroops',
  startingResources = 'normal',
}: {
  width?: number;
  height?: number;
  playerCount?: number;
  terrain?: TerrainType[][];
  /** Seed for procedural terrain/resource-node generation; same seed always yields the same map. */
  seed?: string;
  /** Number of capturable resource nodes to scatter; defaults to a board-size-based heuristic. */
  nodeCount?: number;
  /** Preset map style: 'random' (default), 'river', 'hills', or 'oasis'. */
  theme?: MapTheme;
  /** Skill selected by player 1; later players receive deterministic skills for AI/hot-seat use. */
  specialSkill?: SpecialSkill;
  /** Initial amount of each resource granted to every player. */
  startingResources?: StartingResourceLevel;
} = {}): GameState {
  const finalTerrain = terrain ?? generateThemedTerrain(width, height, seed, playerCount, theme);
  const skills: SpecialSkill[] = ['medicTroops', 'archerCavalry', 'builderTroops'];
  const startingAmount = STARTING_RESOURCE_AMOUNTS[startingResources];
  const players = Array.from(
    { length: playerCount },
    (_, index) =>
      createPlayer(
        index,
        width,
        height,
        index === 0 ? specialSkill : skills[(index - 1) % skills.length],
        startingAmount,
      ),
  );
  const resourceNodes =
    theme === 'oasis'
      ? generateClusteredResourceNodes(width, height, finalTerrain, seed, nodeCount)
      : generateResourceNodes(width, height, finalTerrain, seed, nodeCount);

  return {
    width,
    height,
    turn: 0,
    activePlayerIndex: 0,
    players,
    terrain: finalTerrain,
    bases: [],
    units: [],
    actionLog: [
      `Game started on a ${width}x${height} board.`,
      `${players[0].name}, choose a location for your base.`,
    ],
    resourceNodes,
    roads: [],
    mapTheme: theme,
    phase: 'setup',
    setupPlayerIndex: 0,
    timeline: [],
  };
}
