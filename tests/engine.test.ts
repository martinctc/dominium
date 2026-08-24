import { describe, expect, it } from 'vitest';
import { createInitialState, defaultTerrain, generateThemedTerrain, getHomeZoneForPlayer } from '../src/engine/setup.js';
import {
  applyAction,
  canBuildEconomy,
  economyBlockReason,
  getLegalBasePositions,
  getLegalBuildPositions,
  getLegalRoadPositions,
  getSpawnStructures,
  LUMP_SUM_BONUS,
  towerBlockReason,
} from '../src/engine/reducer.js';
import {
  ECONOMY_TERRAIN_BONUS,
  ECONOMY_YIELD_PER_TURN,
  economyCostFor,
  economyLabelFor,
  economyYieldOn,
  makeUnit,
  SETTLEMENT_COST,
  TOWER_ATTACK,
  TOWER_COST,
  TOWER_MAX_HP,
  UNIT_DEFS,
} from '../src/engine/units.js';
import { chebyshevDistance } from '../src/engine/los.js';
import { getReachableTiles, isPassableTerrain } from '../src/engine/pathfinding.js';
import { getVisibleTilesForPlayer, hasLineOfSight } from '../src/engine/los.js';
import type { GameState, ResourceKey, TerrainType } from '../src/engine/types.js';

/** Total of a food/wood/stone record, for the resource-accounting invariants. */
function sumRecord(record: Record<ResourceKey, number>): number {
  return record.food + record.wood + record.stone;
}

function makePlainTerrain(width: number, height: number) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => 'plain' as const));
}

/** Places bases far apart for each player via the setup-phase placeBase action. */
function placeBasesForTest(state: GameState): void {
  const positions = [
    { x: 1, y: 1 },
    { x: state.width - 2, y: state.height - 2 },
    { x: state.width - 2, y: 1 },
    { x: 1, y: state.height - 2 },
  ];
  for (let index = 0; index < state.players.length; index += 1) {
    applyAction(state, {
      type: 'placeBase',
      playerId: state.players[index].id,
      position: positions[index],
    });
  }
}

function makeStateWithBases() {
  const state = createInitialState({
    width: 10,
    height: 10,
    playerCount: 2,
    terrain: makePlainTerrain(10, 10),
  });
  placeBasesForTest(state);
  state.players[0].resources = { food: 10, wood: 10, stone: 10 };
  state.players[1].resources = { food: 10, wood: 10, stone: 10 };
  state.players[0].hasCollectedIncomeThisTurn = true;
  state.players[1].hasCollectedIncomeThisTurn = true;
  return state;
}

describe('grid strategy engine', () => {
  it('builds a unit adjacent to the base and spends resources', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    const base = state.bases[0];
    const buildTarget = { x: base.position.x + 1, y: base.position.y };

    applyAction(state, {
      type: 'build',
      playerId: player.id,
      unitType: 'footsoldier',
      position: buildTarget,
    });

    expect(state.units).toHaveLength(1);
    expect(state.units[0].type).toBe('footsoldier');
    expect(player.resources.food).toBe(8);
    expect(player.resources.wood).toBe(9);
  });

  it('allows cavalry to move and then attack in the same turn', () => {
    const state = makeStateWithBases();
    const attacker = makeUnit(state.players[0].id, 'cavalry', { x: 1, y: 1 });
    const defender = makeUnit(state.players[1].id, 'footsoldier', { x: 3, y: 1 });
    state.units.push(attacker, defender);

    applyAction(state, {
      type: 'move',
      playerId: state.players[0].id,
      unitId: attacker.id,
      to: { x: 2, y: 1 },
    });

    expect(attacker.position).toEqual({ x: 2, y: 1 });

    applyAction(state, {
      type: 'attack',
      playerId: state.players[0].id,
      unitId: attacker.id,
      targetUnitId: defender.id,
    });

    expect(defender.hp).toBe(6);
  });

  it('lets a hero damage clustered enemies with an area attack', () => {
    const state = makeStateWithBases();
    applyAction(state, {
      type: 'build',
      playerId: state.players[0].id,
      unitType: 'hero',
      position: { x: 2, y: 1 },
    });
    const hero = state.units[0];
    const primary = makeUnit(state.players[1].id, 'footsoldier', { x: 4, y: 1 });
    const splash = makeUnit(state.players[1].id, 'archer', { x: 5, y: 1 });
    const distant = makeUnit(state.players[1].id, 'builder', { x: 6, y: 1 });
    state.units.push(primary, splash, distant);

    applyAction(state, {
      type: 'attack',
      playerId: state.players[0].id,
      unitId: hero.id,
      targetUnitId: primary.id,
    });

    expect(primary.hp).toBe(4);
    expect(splash.hp).toBe(3);
    expect(distant.hp).toBe(distant.maxHp);
    expect(state.actionLog.filter((entry) => entry.includes('area attack'))).toHaveLength(1);
  });

  it('prevents a cannon from attacking after it moves', () => {
    const state = makeStateWithBases();
    const cannon = makeUnit(state.players[0].id, 'cannon', { x: 1, y: 1 });
    const defender = makeUnit(state.players[1].id, 'footsoldier', { x: 4, y: 1 });
    state.units.push(cannon, defender);

    applyAction(state, {
      type: 'move',
      playerId: state.players[0].id,
      unitId: cannon.id,
      to: { x: 2, y: 1 },
    });

    expect(() =>
      applyAction(state, {
        type: 'attack',
        playerId: state.players[0].id,
        unitId: cannon.id,
        targetUnitId: defender.id,
      }),
    ).toThrow();
  });

  it('blocks line of sight when a mountain lies between attacker and target', () => {
    const state = createInitialState({ width: 10, height: 10, playerCount: 2 });
    state.terrain[2][2] = 'mountain';
    const cannon = makeUnit(state.players[0].id, 'cannon', { x: 1, y: 2 });
    const defender = makeUnit(state.players[1].id, 'footsoldier', { x: 5, y: 2 });
    state.units.push(cannon, defender);

    expect(hasLineOfSight(state, cannon.position, defender.position)).toBe(false);
  });

  it('finds a reachable path for a unit with diagonal movement enabled', () => {
    const state = createInitialState({
      width: 10,
      height: 10,
      playerCount: 2,
      terrain: makePlainTerrain(10, 10),
    });
    const unit = makeUnit(state.players[0].id, 'cavalry', { x: 1, y: 1 });
    state.units.push(unit);

    const reachable = getReachableTiles(state, unit);
    expect(reachable.some((position) => position.x === 3 && position.y === 1)).toBe(true);
  });

  it('captures surviving enemy units when a base is destroyed', () => {
    const state = makeStateWithBases();
    const enemyBase = state.bases[1];
    const defenderUnit = makeUnit(state.players[1].id, 'footsoldier', { x: enemyBase.position.x - 2, y: enemyBase.position.y });
    const attacker = makeUnit(state.players[0].id, 'cavalry', { x: enemyBase.position.x - 1, y: enemyBase.position.y });
    state.units.push(attacker, defenderUnit);
    enemyBase.hp = 1;

    applyAction(state, {
      type: 'attack',
      playerId: state.players[0].id,
      unitId: attacker.id,
      targetBaseId: enemyBase.id,
    });

    expect(state.bases.some((base) => base.id === enemyBase.id)).toBe(false);
    expect(defenderUnit.ownerId).toBe(state.players[0].id);
    expect(state.players[0].stats.buildingsRazed).toBe(1);
    expect(state.players[1].eliminatedOnTurn).toBe(1);
  });

  it('requires income to be collected before any other action', () => {
    const state = createInitialState({
      width: 10,
      height: 10,
      playerCount: 2,
      terrain: makePlainTerrain(10, 10),
    });
    placeBasesForTest(state);
    state.players[0].resources = { food: 10, wood: 10, stone: 10 };
    const player = state.players[0];
    const base = state.bases[0];

    expect(() =>
      applyAction(state, {
        type: 'build',
        playerId: player.id,
        unitType: 'footsoldier',
        position: { x: base.position.x + 1, y: base.position.y },
      }),
    ).toThrow();

    expect(() => applyAction(state, { type: 'endTurn', playerId: player.id })).toThrow();

    applyAction(state, { type: 'income', playerId: player.id, resource: 'food' });

    expect(() =>
      applyAction(state, {
        type: 'build',
        playerId: player.id,
        unitType: 'footsoldier',
        position: { x: base.position.x + 1, y: base.position.y },
      }),
    ).not.toThrow();
  });

  it('tracks units built stat on the builder', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    const base = state.bases[0];

    applyAction(state, {
      type: 'build',
      playerId: player.id,
      unitType: 'footsoldier',
      position: { x: base.position.x + 1, y: base.position.y },
    });

    expect(player.stats.unitsBuilt).toBe(1);
  });

  it('tracks units killed/lost stats when a unit is destroyed in combat', () => {
    const state = makeStateWithBases();
    const attacker = makeUnit(state.players[0].id, 'cannon', { x: 1, y: 1 });
    const defender = makeUnit(state.players[1].id, 'footsoldier', { x: 1, y: 2 });
    defender.hp = 1;
    state.units.push(attacker, defender);

    applyAction(state, {
      type: 'attack',
      playerId: state.players[0].id,
      unitId: attacker.id,
      targetUnitId: defender.id,
    });

    expect(state.units.some((unit) => unit.id === defender.id)).toBe(false);
    expect(state.players[0].stats.unitsKilled).toBe(1);
    expect(state.players[1].stats.unitsLost).toBe(1);
  });

  it('tracks resource node captures', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    const node = state.resourceNodes[0];
    const unit = makeUnit(player.id, 'footsoldier', node.position);
    unit.turnStartPosition = { ...node.position };
    state.units.push(unit);

    applyAction(state, { type: 'endTurn', playerId: player.id });

    expect(player.stats.nodesCaptured).toBe(1);
  });

  it('records a turn timeline snapshot for the player who just ended their turn', () => {
    const state = makeStateWithBases();
    const player = state.players[0];

    applyAction(state, { type: 'endTurn', playerId: player.id });

    const entry = state.timeline.find((snapshot) => snapshot.playerId === player.id);
    expect(entry).toBeDefined();
    expect(entry?.totalResources).toBe(30);
  });
});

describe('fair map generation', () => {
  function isPassable(terrain: ReturnType<typeof defaultTerrain>, x: number, y: number): boolean {
    return isPassableTerrain(terrain[y]?.[x]);
  }

  function reachableFrom(terrain: ReturnType<typeof defaultTerrain>, width: number, height: number, start: { x: number; y: number }) {
    const visited = new Set<string>();
    const queue = [start];
    visited.add(`${start.x}:${start.y}`);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ]) {
        if (neighbor.x < 0 || neighbor.y < 0 || neighbor.x >= width || neighbor.y >= height) continue;
        const key = `${neighbor.x}:${neighbor.y}`;
        if (visited.has(key) || !isPassable(terrain, neighbor.x, neighbor.y)) continue;
        visited.add(key);
        queue.push(neighbor);
      }
    }
    return visited;
  }

  it('gives every home zone at least 6 passable tiles for 2 players', () => {
    for (const seed of ['alpha', 'bravo', 'charlie', 'delta', 'echo']) {
      const terrain = defaultTerrain(10, 10, seed, 2);
      for (let index = 0; index < 2; index += 1) {
        const zone = getHomeZoneForPlayer(index, 10, 10);
        let count = 0;
        for (let y = zone.y1; y <= zone.y2; y += 1) {
          for (let x = zone.x1; x <= zone.x2; x += 1) {
            if (isPassable(terrain, x, y)) count += 1;
          }
        }
        expect(count).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('gives every home zone at least 6 passable tiles for 4 players', () => {
    for (const seed of ['four-alpha', 'four-bravo', 'four-charlie']) {
      const terrain = defaultTerrain(12, 12, seed, 4);
      for (let index = 0; index < 4; index += 1) {
        const zone = getHomeZoneForPlayer(index, 12, 12);
        let count = 0;
        for (let y = zone.y1; y <= zone.y2; y += 1) {
          for (let x = zone.x1; x <= zone.x2; x += 1) {
            if (isPassable(terrain, x, y)) count += 1;
          }
        }
        expect(count).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('keeps all home zones mutually reachable by land', () => {
    for (const seed of ['reach-1', 'reach-2', 'reach-3']) {
      const width = 10;
      const height = 10;
      const playerCount = 4;
      const terrain = defaultTerrain(width, height, seed, playerCount);

      const anchors = Array.from({ length: playerCount }, (_, index) => {
        const zone = getHomeZoneForPlayer(index, width, height);
        for (let y = zone.y1; y <= zone.y2; y += 1) {
          for (let x = zone.x1; x <= zone.x2; x += 1) {
            if (isPassable(terrain, x, y)) return { x, y };
          }
        }
        throw new Error('home zone fully blocked');
      });

      const reachable = reachableFrom(terrain, width, height, anchors[0]);
      for (const anchor of anchors.slice(1)) {
        expect(reachable.has(`${anchor.x}:${anchor.y}`)).toBe(true);
      }
    }
  });

  it('produces the same terrain for the same seed (deterministic)', () => {
    const first = defaultTerrain(10, 10, 'reproducible-seed', 2);
    const second = defaultTerrain(10, 10, 'reproducible-seed', 2);
    expect(first).toEqual(second);
  });

  it('createInitialState accepts a seed and produces a valid board', () => {
    const state = createInitialState({ width: 10, height: 10, playerCount: 2, seed: 'my-custom-seed' });
    expect(state.terrain.length).toBe(10);
    expect(state.terrain[0].length).toBe(10);
  });
});

describe('home zones and base placement', () => {
  it('puts two players on diagonally opposite corners', () => {
    const first = getHomeZoneForPlayer(0, 10, 10);
    const second = getHomeZoneForPlayer(1, 10, 10);
    expect(first.x1).toBe(0);
    expect(first.y1).toBe(0);
    expect(second.x2).toBe(9);
    expect(second.y2).toBe(9);
    // No overlap on either axis.
    expect(second.x1).toBeGreaterThan(first.x2);
    expect(second.y1).toBeGreaterThan(first.y2);
  });

  it('gives all four players distinct home zones', () => {
    const zones = [0, 1, 2, 3].map((index) => getHomeZoneForPlayer(index, 12, 12));
    const keys = new Set(zones.map((zone) => `${zone.x1},${zone.y1}`));
    expect(keys.size).toBe(4);
  });

  it('only offers base positions inside the placing player\'s home zone', () => {
    const state = createInitialState({ width: 10, height: 10, playerCount: 2, seed: 'zone-seed' });
    const zone = state.players[0].homeZone;
    const positions = getLegalBasePositions(state);

    expect(positions.length).toBeGreaterThan(0);
    for (const position of positions) {
      expect(position.x).toBeGreaterThanOrEqual(zone.x1);
      expect(position.x).toBeLessThanOrEqual(zone.x2);
      expect(position.y).toBeGreaterThanOrEqual(zone.y1);
      expect(position.y).toBeLessThanOrEqual(zone.y2);
    }
  });

  it('rejects a base placed outside the home zone', () => {
    const state = createInitialState({ width: 10, height: 10, playerCount: 2, seed: 'zone-seed' });
    const zone = state.players[0].homeZone;
    const outside = { x: zone.x2 + 3, y: zone.y2 + 3 };

    expect(() =>
      applyAction(state, { type: 'placeBase', playerId: state.players[0].id, position: outside }),
    ).toThrow(/home zone/i);
  });

  it('offers the second player a zone that does not overlap the first', () => {
    const state = createInitialState({ width: 10, height: 10, playerCount: 2, seed: 'zone-seed' });
    const firstOptions = getLegalBasePositions(state);
    applyAction(state, {
      type: 'placeBase',
      playerId: state.players[0].id,
      position: firstOptions[0],
    });

    const secondOptions = getLegalBasePositions(state);
    expect(secondOptions.length).toBeGreaterThan(0);
    const firstKeys = new Set(firstOptions.map((p) => `${p.x},${p.y}`));
    for (const position of secondOptions) {
      expect(firstKeys.has(`${position.x},${position.y}`)).toBe(false);
    }
  });

  it('never offers a base position on a resource node', () => {
    for (const seed of ['node-a', 'node-b', 'node-c']) {
      const state = createInitialState({ width: 10, height: 10, playerCount: 2, seed });
      const nodeKeys = new Set(state.resourceNodes.map((n) => `${n.position.x},${n.position.y}`));
      expect(nodeKeys.size).toBeGreaterThan(0);
      for (const position of getLegalBasePositions(state)) {
        expect(nodeKeys.has(`${position.x},${position.y}`)).toBe(false);
      }
    }
  });

  it('refuses to place a base on a resource node', () => {
    const state = createInitialState({ width: 10, height: 10, playerCount: 2, seed: 'node-block' });
    const player = state.players[0];
    const spot = getLegalBasePositions(state)[0];
    // Drop a node onto an otherwise-legal tile; it must stop being offered.
    state.resourceNodes.push({
      id: 'node-block',
      position: { ...spot },
      resource: 'food',
      ownerId: null,
      bonus: 'ongoing',
    });

    expect(() =>
      applyAction(state, { type: 'placeBase', playerId: player.id, position: spot }),
    ).toThrow(/resource node/i);
  });
});

describe('buildings occupy their tile', () => {
  it('never offers a build position on top of a building', () => {
    const state = makeStateWithBases();
    const base = state.bases.find((entry) => entry.ownerId === state.players[0].id)!;
    const positions = getLegalBuildPositions(state, state.players[0]);

    expect(positions.length).toBeGreaterThan(0);
    expect(
      positions.some((p) => p.x === base.position.x && p.y === base.position.y),
    ).toBe(false);
  });

  it('rejects building a unit onto the base tile', () => {
    const state = makeStateWithBases();
    const base = state.bases.find((entry) => entry.ownerId === state.players[0].id)!;

    expect(() =>
      applyAction(state, {
        type: 'build',
        playerId: state.players[0].id,
        unitType: 'footsoldier',
        position: { ...base.position },
      }),
    ).toThrow();
  });

  it('does not let a unit walk onto a friendly or enemy building', () => {
    const state = makeStateWithBases();
    const ownBase = state.bases.find((entry) => entry.ownerId === state.players[0].id)!;
    const enemyBase = state.bases.find((entry) => entry.ownerId === state.players[1].id)!;

    // A cavalry unit placed midway between the two bases, with move range to spare.
    const scout = makeUnit(state.players[0].id, 'cavalry', {
      x: ownBase.position.x + 1,
      y: ownBase.position.y + 1,
    });
    state.units.push(scout);

    const reachable = getReachableTiles(state, scout);
    expect(reachable.length).toBeGreaterThan(0);
    expect(
      reachable.some((p) => p.x === ownBase.position.x && p.y === ownBase.position.y),
    ).toBe(false);
    expect(
      reachable.some((p) => p.x === enemyBase.position.x && p.y === enemyBase.position.y),
    ).toBe(false);
  });

  it('does not let a unit walk onto a settlement', () => {
    const state = makeStateWithBases();
    const builder = makeUnit(state.players[0].id, 'builder', { x: 5, y: 5 });
    state.units.push(builder);
    applyAction(state, {
      type: 'foundSettlement',
      playerId: state.players[0].id,
      unitId: builder.id,
    });

    const scout = makeUnit(state.players[0].id, 'cavalry', { x: 5, y: 4 });
    state.units.push(scout);
    const reachable = getReachableTiles(state, scout);

    expect(reachable.some((p) => p.x === 5 && p.y === 5)).toBe(false);
  });
});

describe('roads and bridges', () => {
  it('builds a road for one wood and allows chaining road placement', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    const initialWood = player.resources.wood;

    applyAction(state, {
      type: 'buildRoad',
      playerId: player.id,
      position: { x: 2, y: 1 },
    });

    expect(state.roads).toEqual([{ x: 2, y: 1 }]);
    expect(player.resources.wood).toBe(initialWood - 1);

    applyAction(state, {
      type: 'buildRoad',
      playerId: player.id,
      position: { x: 3, y: 1 },
    });

    expect(state.roads).toHaveLength(2);
    expect(player.resources.wood).toBe(initialWood - 2);
  });

  it('allows a unit to enter a lake tile when a bridge is built there', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    state.terrain[2][2] = 'lake';
    const unit = makeUnit(player.id, 'footsoldier', { x: 1, y: 2 });
    state.units.push(unit);

    expect(getReachableTiles(state, unit)).not.toContainEqual({ x: 2, y: 2 });

    applyAction(state, {
      type: 'buildRoad',
      playerId: player.id,
      position: { x: 2, y: 2 },
    });

    expect(state.roads).toContainEqual({ x: 2, y: 2 });
    expect(getReachableTiles(state, unit)).toContainEqual({ x: 2, y: 2 });

    unit.position = { x: 2, y: 2 };
    expect(getReachableTiles(state, unit)).toContainEqual({ x: 5, y: 2 });
  });

  it('requires income, wood, and a legal adjacent position', () => {
    const state = makeStateWithBases();
    const player = state.players[0];

    player.hasCollectedIncomeThisTurn = false;
    expect(() => applyAction(state, {
      type: 'buildRoad',
      playerId: player.id,
      position: { x: 2, y: 1 },
    })).toThrow('collect income');

    player.hasCollectedIncomeThisTurn = true;
    player.resources.wood = 0;
    expect(() => applyAction(state, {
      type: 'buildRoad',
      playerId: player.id,
      position: { x: 2, y: 1 },
    })).toThrow('Not enough wood');

    player.resources.wood = 1;
    expect(() => applyAction(state, {
      type: 'buildRoad',
      playerId: player.id,
      position: { x: 6, y: 6 },
    })).toThrow('adjacent');
  });

  it('allows paving the tile a friendly unit is standing on, but not an enemy-held tile', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    const own = makeUnit(player.id, 'footsoldier', { x: 3, y: 1 });
    const enemy = makeUnit(state.players[1].id, 'footsoldier', { x: 4, y: 1 });
    state.units.push(own, enemy);

    applyAction(state, { type: 'buildRoad', playerId: player.id, position: own.position });
    expect(state.roads).toContainEqual({ x: 3, y: 1 });

    expect(() => applyAction(state, {
      type: 'buildRoad',
      playerId: player.id,
      position: enemy.position,
    })).toThrow('adjacent');
  });
});

describe('builders and settlements', () => {
  function makeStateWithBuilder(position = { x: 5, y: 5 }) {
    const state = makeStateWithBases();
    const player = state.players[0];
    const builder = makeUnit(player.id, 'builder', position);
    state.units.push(builder);
    return { state, player, builder };
  }

  it('spends the builder and its cost to found a settlement', () => {
    const { state, player, builder } = makeStateWithBuilder();
    const woodBefore = player.resources.wood;
    const stoneBefore = player.resources.stone;

    applyAction(state, { type: 'foundSettlement', playerId: player.id, unitId: builder.id });

    expect(state.units.find((unit) => unit.id === builder.id)).toBeUndefined();
    const settlement = state.bases.find((base) => base.kind === 'settlement');
    expect(settlement).toBeDefined();
    expect(settlement?.position).toEqual({ x: 5, y: 5 });
    expect(settlement?.ownerId).toBe(player.id);
    expect(player.resources.wood).toBe(woodBefore - SETTLEMENT_COST.wood);
    expect(player.resources.stone).toBe(stoneBefore - SETTLEMENT_COST.stone);
    expect(player.stats.settlementsFounded).toBe(1);
  });

  it('refuses to found a settlement on top of a resource node', () => {
    const { state, player, builder } = makeStateWithBuilder();
    state.resourceNodes = [
      { id: 'node-1', position: { ...builder.position }, resource: 'stone', ownerId: null, bonus: 'ongoing' },
    ];

    expect(() =>
      applyAction(state, { type: 'foundSettlement', playerId: player.id, unitId: builder.id }),
    ).toThrow(/resource node/i);
    expect(state.bases.some((base) => base.kind === 'settlement')).toBe(false);
  });

  it('allows a settlement next to an existing building', () => {
    const base = { x: 1, y: 1 };
    const { state, player, builder } = makeStateWithBuilder({
      x: base.x + 1,
      y: base.y,
    });

    applyAction(state, {
      type: 'foundSettlement',
      playerId: player.id,
      unitId: builder.id,
    });
    expect(state.bases.some((entry) => entry.kind === 'settlement')).toBe(true);
  });

  it('repairs a damaged building connected to the main base by roads', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    const settlement = {
      id: 'settlement-repair',
      ownerId: player.id,
      kind: 'settlement' as const,
      position: { x: 4, y: 1 },
      hp: 10,
      maxHp: 18,
    };
    state.bases.push(settlement);
    state.roads = [{ x: 2, y: 1 }, { x: 3, y: 1 }];
    state.activePlayerIndex = 1;
    const hpBefore = settlement.hp;

    applyAction(state, { type: 'endTurn', playerId: state.players[1].id });

    expect(settlement.hp).toBe(hpBefore + 1);
  });

  it('heals a wounded unit resting near a settlement, just like near the main base', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    const settlement = {
      id: 'settlement-heal',
      ownerId: player.id,
      kind: 'settlement' as const,
      position: { x: 4, y: 4 },
      hp: 18,
      maxHp: 18,
    };
    state.bases.push(settlement);
    const wounded = makeUnit(player.id, 'footsoldier', { x: 5, y: 4 });
    wounded.hp = 1;
    state.units.push(wounded);
    state.activePlayerIndex = 1;

    applyAction(state, { type: 'endTurn', playerId: state.players[1].id });

    expect(wounded.hp).toBe(2);
  });

  it('lets units be built next to a settlement, far from the main base', () => {
    const { state, player, builder } = makeStateWithBuilder({ x: 5, y: 5 });
    applyAction(state, { type: 'foundSettlement', playerId: player.id, unitId: builder.id });

    applyAction(state, {
      type: 'build',
      playerId: player.id,
      unitType: 'footsoldier',
      position: { x: 6, y: 5 },
    });

    expect(state.units.some((unit) => unit.position.x === 6 && unit.position.y === 5)).toBe(true);
  });

  it('does not eliminate a player when only their settlement is destroyed', () => {
    const { state, player, builder } = makeStateWithBuilder({ x: 5, y: 5 });
    applyAction(state, { type: 'foundSettlement', playerId: player.id, unitId: builder.id });
    const settlement = state.bases.find((base) => base.kind === 'settlement')!;

    // Hand the turn to player 2 and park a cannon next to the settlement.
    state.activePlayerIndex = 1;
    const enemy = state.players[1];
    const cannon = makeUnit(enemy.id, 'cannon', { x: 6, y: 5 });
    state.units.push(cannon);

    while (settlement.hp > 0) {
      cannon.hasAttackedThisTurn = false;
      cannon.hasMovedThisTurn = false;
      applyAction(state, {
        type: 'attack',
        playerId: enemy.id,
        unitId: cannon.id,
        targetBaseId: settlement.id,
      });
    }

    expect(state.bases.some((base) => base.id === settlement.id)).toBe(false);
    expect(player.alive).toBe(true);
    expect(enemy.stats.buildingsRazed).toBe(1);
    expect(state.bases.some((base) => base.ownerId === player.id && base.kind === 'base')).toBe(true);
  });

  it('rejects founding a settlement with a non-builder unit', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    const soldier = makeUnit(player.id, 'footsoldier', { x: 5, y: 5 });
    state.units.push(soldier);

    expect(() => applyAction(state, {
      type: 'foundSettlement',
      playerId: player.id,
      unitId: soldier.id,
    })).toThrow('builder');
  });
});

describe('resource node capture', () => {
  it('marks a captured node as owned so it cannot be farmed again from the same tile', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    state.resourceNodes = [
      { id: 'node-1', position: { x: 4, y: 4 }, resource: 'food', ownerId: null, bonus: 'ongoing' },
    ];
    const unit = makeUnit(player.id, 'footsoldier', { x: 4, y: 4 });
    state.units.push(unit);

    applyAction(state, { type: 'endTurn', playerId: player.id });

    expect(state.resourceNodes[0].ownerId).toBe(player.id);
    expect(player.stats.nodesCaptured).toBe(1);

    // Coming back round to the same player, the parked unit must not re-claim it.
    state.activePlayerIndex = 0;
    state.players[0].hasCollectedIncomeThisTurn = true;
    applyAction(state, { type: 'endTurn', playerId: player.id });
    expect(player.stats.nodesCaptured).toBe(1);
  });

  it('keeps node ownership after the capturing unit walks away', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    state.resourceNodes = [
      { id: 'node-1', position: { x: 4, y: 4 }, resource: 'food', ownerId: null, bonus: 'ongoing' },
    ];
    const unit = makeUnit(player.id, 'footsoldier', { x: 4, y: 4 });
    state.units.push(unit);
    applyAction(state, { type: 'endTurn', playerId: player.id });
    expect(state.resourceNodes[0].ownerId).toBe(player.id);

    // March the unit off the node over the following turns.
    for (const step of [{ x: 4, y: 5 }, { x: 4, y: 6 }]) {
      state.activePlayerIndex = 0;
      state.players[0].hasCollectedIncomeThisTurn = true;
      unit.hasMovedThisTurn = false;
      applyAction(state, { type: 'move', playerId: player.id, unitId: unit.id, to: step });
      applyAction(state, { type: 'endTurn', playerId: player.id });
      expect(state.resourceNodes[0].ownerId).toBe(player.id);
    }
  });

  it('lets an opponent take over a node that is already owned', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    const rival = state.players[1];
    state.resourceNodes = [
      { id: 'node-1', position: { x: 4, y: 4 }, resource: 'food', ownerId: player.id, bonus: 'ongoing' },
    ];
    const raider = makeUnit(rival.id, 'footsoldier', { x: 4, y: 4 });
    state.units.push(raider);

    state.activePlayerIndex = 1;
    applyAction(state, { type: 'endTurn', playerId: rival.id });

    expect(state.resourceNodes[0].ownerId).toBe(rival.id);
    expect(rival.stats.nodesCaptured).toBe(1);
  });

  it('removes a looted treasure chest from the board and pays out once', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    const before = player.resources.wood;
    state.resourceNodes = [
      { id: 'chest-1', position: { x: 4, y: 4 }, resource: 'wood', ownerId: null, bonus: 'lumpSum' },
    ];
    const unit = makeUnit(player.id, 'footsoldier', { x: 4, y: 4 });
    state.units.push(unit);

    applyAction(state, { type: 'endTurn', playerId: player.id });

    expect(state.resourceNodes).toHaveLength(0);
    expect(player.resources.wood).toBe(before + LUMP_SUM_BONUS);
    expect(player.stats.nodesCaptured).toBe(1);
  });
});

describe('resource accounting', () => {
  it('records every spend, so collected minus spent equals the stockpile', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    player.resources = { food: 20, wood: 20, stone: 20 };
    player.stats.incomeCollected = { food: 20, wood: 20, stone: 20 };
    player.hasCollectedIncomeThisTurn = true;

    const spot = getLegalBuildPositions(state, player)[0];
    applyAction(state, { type: 'build', playerId: player.id, unitType: 'builder', position: spot });

    const cost = UNIT_DEFS.builder.cost;
    expect(player.stats.resourcesSpent.food).toBe(cost.food);
    expect(player.stats.resourcesSpent.wood).toBe(cost.wood);
    for (const key of ['food', 'wood', 'stone'] as const) {
      expect(player.stats.incomeCollected[key] - player.stats.resourcesSpent[key]).toBe(player.resources[key]);
    }
  });

  it('makes a builder cost one food and one stone', () => {
    expect(UNIT_DEFS.builder.cost).toEqual({ food: 1, wood: 0, stone: 1 });
  });
});

describe('sentry towers', () => {
  function makeStateWithBuilderAt(position: { x: number; y: number }) {
    const state = makeStateWithBases();
    const player = state.players[0];
    const builder = makeUnit(player.id, 'builder', position);
    state.units.push(builder);
    return { state, player, builder };
  }

  function raiseTower(state: GameState, player: GameState['players'][number], at: { x: number; y: number }) {
    const builder = makeUnit(player.id, 'builder', at);
    state.units.push(builder);
    applyAction(state, { type: 'buildTower', playerId: player.id, unitId: builder.id });
    // The builder survives the job, but it would then anchor roads and build
    // spots itself — remove it so these tests only ever see the tower.
    state.units = state.units.filter((unit) => unit.id !== builder.id);
    return state.bases.find((base) => base.kind === 'tower' && base.position.x === at.x)!;
  }

  it('charges its cost and uses the builder turn without killing it', () => {
    const { state, player, builder } = makeStateWithBuilderAt({ x: 5, y: 5 });
    const foodBefore = player.resources.food;
    const stoneBefore = player.resources.stone;

    applyAction(state, { type: 'buildTower', playerId: player.id, unitId: builder.id });

    const survivor = state.units.find((unit) => unit.id === builder.id);
    expect(survivor).toBeDefined();
    expect(survivor?.hasMovedThisTurn).toBe(true);
    expect(survivor?.hasAttackedThisTurn).toBe(true);
    const tower = state.bases.find((base) => base.kind === 'tower');
    expect(tower).toBeDefined();
    expect(tower?.position).toEqual({ x: 5, y: 5 });
    expect(tower?.hp).toBe(TOWER_MAX_HP);
    expect(player.resources.food).toBe(foodBefore - TOWER_COST.food);
    expect(player.resources.stone).toBe(stoneBefore - TOWER_COST.stone);
    expect(player.stats.towersBuilt).toBe(1);
    expect(player.stats.resourcesSpent.stone).toBe(TOWER_COST.stone);

    // One tower per builder per turn.
    expect(towerBlockReason(state, player, survivor!)).toMatch(/already used its turn/i);
  });

  it('refuses to raise two towers side by side', () => {
    const { state, player, builder } = makeStateWithBuilderAt({ x: 5, y: 5 });
    applyAction(state, { type: 'buildTower', playerId: player.id, unitId: builder.id });

    const neighbour = makeUnit(player.id, 'builder', { x: 6, y: 5 });
    state.units.push(neighbour);
    expect(() =>
      applyAction(state, { type: 'buildTower', playerId: player.id, unitId: neighbour.id }),
    ).toThrow(/next to each other/i);
  });

  it('is not a loss condition when destroyed', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    const rival = state.players[1];
    const tower = raiseTower(state, player, { x: 5, y: 5 });

    const attacker = makeUnit(rival.id, 'cannon', { x: 5, y: 6 });
    attacker.attack = TOWER_MAX_HP;
    state.units.push(attacker);
    state.activePlayerIndex = 1;
    rival.hasCollectedIncomeThisTurn = true;

    applyAction(state, {
      type: 'attack',
      playerId: rival.id,
      unitId: attacker.id,
      targetBaseId: tower.id,
    });

    expect(state.bases.some((base) => base.id === tower.id)).toBe(false);
    expect(player.alive).toBe(true);
  });

  it('never lets a tower spawn units, heal or anchor roads', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    // Far from the base so only the tower could possibly be the anchor.
    raiseTower(state, player, { x: 6, y: 5 });

    const buildSpots = getLegalBuildPositions(state, player);
    for (const spot of buildSpots) {
      expect(chebyshevDistance(spot, { x: 6, y: 5 })).toBeGreaterThan(1);
    }
    const roadSpots = getLegalRoadPositions(state, player);
    expect(roadSpots.some((spot) => chebyshevDistance(spot, { x: 6, y: 5 }) <= 1)).toBe(false);
  });

  it('shoots the closest enemy in range at the start of its owner turn', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    const rival = state.players[1];
    raiseTower(state, player, { x: 5, y: 5 });

    const near = makeUnit(rival.id, 'footsoldier', { x: 5, y: 6 });
    const far = makeUnit(rival.id, 'footsoldier', { x: 5, y: 7 });
    state.units.push(near, far);
    const nearHpBefore = near.hp;
    const farHpBefore = far.hp;

    // Hand the turn round to the rival and back, so the tower's owner starts a turn.
    player.hasCollectedIncomeThisTurn = true;
    applyAction(state, { type: 'endTurn', playerId: player.id });
    rival.hasCollectedIncomeThisTurn = true;
    applyAction(state, { type: 'endTurn', playerId: rival.id });

    expect(near.hp).toBe(nearHpBefore - TOWER_ATTACK);
    expect(far.hp).toBe(farHpBefore);
  });

  it('breaks ties towards the most wounded target, and records the kill', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    const rival = state.players[1];
    raiseTower(state, player, { x: 5, y: 5 });

    // Both are one tile away; the wounded one should be finished off.
    const healthy = makeUnit(rival.id, 'footsoldier', { x: 4, y: 5 });
    const wounded = makeUnit(rival.id, 'footsoldier', { x: 6, y: 5 });
    wounded.hp = TOWER_ATTACK;
    state.units.push(healthy, wounded);

    player.hasCollectedIncomeThisTurn = true;
    applyAction(state, { type: 'endTurn', playerId: player.id });
    rival.hasCollectedIncomeThisTurn = true;
    applyAction(state, { type: 'endTurn', playerId: rival.id });

    expect(state.units.find((unit) => unit.id === wounded.id)).toBeUndefined();
    expect(healthy.hp).toBe(healthy.maxHp);
    expect(player.stats.unitsKilled).toBe(1);
    expect(rival.stats.unitsLost).toBe(1);
  });

  it('does not shoot through a mountain', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    const rival = state.players[1];
    raiseTower(state, player, { x: 5, y: 5 });
    state.terrain[5][6] = 'mountain';

    const blocked = makeUnit(rival.id, 'footsoldier', { x: 7, y: 5 });
    state.units.push(blocked);
    const hpBefore = blocked.hp;

    player.hasCollectedIncomeThisTurn = true;
    applyAction(state, { type: 'endTurn', playerId: player.id });
    rival.hasCollectedIncomeThisTurn = true;
    applyAction(state, { type: 'endTurn', playerId: rival.id });

    expect(blocked.hp).toBe(hpBefore);
  });

  it('never fires on its owner units', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    const rival = state.players[1];
    raiseTower(state, player, { x: 5, y: 5 });

    const friendly = makeUnit(player.id, 'footsoldier', { x: 5, y: 6 });
    state.units.push(friendly);
    const hpBefore = friendly.hp;

    player.hasCollectedIncomeThisTurn = true;
    applyAction(state, { type: 'endTurn', playerId: player.id });
    rival.hasCollectedIncomeThisTurn = true;
    applyAction(state, { type: 'endTurn', playerId: rival.id });

    expect(friendly.hp).toBe(hpBefore);
  });
  it('lets a settlement be founded right beside a tower', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    raiseTower(state, player, { x: 5, y: 5 });
    player.resources.wood += SETTLEMENT_COST.wood;
    player.resources.stone += SETTLEMENT_COST.stone;

    const builder = makeUnit(player.id, 'builder', { x: 6, y: 5 });
    state.units.push(builder);
    applyAction(state, { type: 'foundSettlement', playerId: player.id, unitId: builder.id });

    expect(state.bases.some((base) => base.kind === 'settlement')).toBe(true);
  });
});

describe('forest terrain and economy buildings', () => {
  function makeStateWithBuilderAt(position: { x: number; y: number }, terrainType?: TerrainType) {
    const state = makeStateWithBases();
    if (terrainType) state.terrain[position.y][position.x] = terrainType;
    const player = state.players[0];
    const builder = makeUnit(player.id, 'builder', position);
    state.units.push(builder);
    return { state, player, builder };
  }

  it('makes forest passable but slow', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    const unit = makeUnit(player.id, 'footsoldier', { x: 5, y: 5 });
    state.units.push(unit);

    const openTiles = getReachableTiles(state, unit).length;
    // Ring the unit in forest: still reachable, but each step now costs 2.
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        state.terrain[5 + dy][5 + dx] = 'forest';
      }
    }
    const forestTiles = getReachableTiles(state, unit);

    expect(isPassableTerrain('forest')).toBe(true);
    expect(forestTiles.length).toBeGreaterThan(0);
    expect(forestTiles.length).toBeLessThan(openTiles);
  });

  it('blocks line of sight through forest', () => {
    const state = makeStateWithBases();
    expect(hasLineOfSight(state, { x: 2, y: 5 }, { x: 5, y: 5 })).toBe(true);
    state.terrain[5][3] = 'forest';
    expect(hasLineOfSight(state, { x: 2, y: 5 }, { x: 5, y: 5 })).toBe(false);
    // The destination tile itself never blocks — you can shoot into a wood.
    state.terrain[5][3] = 'plain';
    state.terrain[5][5] = 'forest';
    expect(hasLineOfSight(state, { x: 2, y: 5 }, { x: 5, y: 5 })).toBe(true);
  });

  it('reveals a radius around owned units and structures, but not through forest', () => {
    const state = makeStateWithBases();
    const player = state.players[0];
    state.terrain[5][3] = 'forest';
    const unit = makeUnit(player.id, 'footsoldier', { x: 2, y: 5 });
    state.units.push(unit);

    const visible = getVisibleTilesForPlayer(state, player.id);
    expect(visible.has('2,5')).toBe(true);
    expect(visible.has('5,5')).toBe(false);
    expect(visible.has('1,5')).toBe(true);
  });

  it('reveals the human home zone before base placement', () => {
    const state = createInitialState({ width: 10, height: 10, playerCount: 2, nodeCount: 0, seed: 'setup-fog' });
    const player = state.players[0];
    const visible = getVisibleTilesForPlayer(state, player.id);
    expect(visible.has(`${player.homeZone.x1},${player.homeZone.y1}`)).toBe(true);
    expect(visible.has(`${player.homeZone.x2},${player.homeZone.y2}`)).toBe(true);
    expect(visible.has(`${state.width - 1},${state.height - 1}`)).toBe(false);
  });

  it('puts some forest on every themed map', () => {
    for (const theme of ['random', 'river', 'hills', 'oasis'] as const) {
      for (const seed of ['s1', 's2', 's3']) {
        const terrain = generateThemedTerrain(12, 12, `${theme}-${seed}`, 2, theme);
        const forestCount = terrain.flat().filter((cell) => cell === 'forest').length;
        expect(forestCount, `theme ${theme}, seed ${seed}`).toBeGreaterThan(0);
      }
    }
  });

  it('lets the builder pick which building to raise, on any passable ground', () => {
    const cases: Array<[TerrainType, ResourceKey, string]> = [
      ['plain', 'food', 'farm'],
      ['forest', 'wood', 'lumber camp'],
      ['hills', 'stone', 'quarry'],
    ];
    for (const [terrainType, produces, label] of cases) {
      // Deliberately build on terrain that is *not* this building's home, to
      // prove the choice is free rather than dictated by the ground.
      const { state, player, builder } = makeStateWithBuilderAt({ x: 5, y: 5 }, terrainType);
      const other: ResourceKey = produces === 'food' ? 'stone' : 'food';

      applyAction(state, { type: 'buildEconomy', playerId: player.id, unitId: builder.id, produces: other });
      expect(state.bases.find((base) => base.kind === 'economy')?.produces).toBe(other);
      expect(economyLabelFor(produces)).toBe(label);
    }
  });

  it('doubles the yield on home terrain', () => {
    expect(economyYieldOn('wood', 'forest')).toBe(ECONOMY_YIELD_PER_TURN + ECONOMY_TERRAIN_BONUS);
    expect(economyYieldOn('wood', 'plain')).toBe(ECONOMY_YIELD_PER_TURN);
    expect(economyYieldOn('stone', 'hills')).toBe(ECONOMY_YIELD_PER_TURN + ECONOMY_TERRAIN_BONUS);
    expect(economyYieldOn('food', 'plain')).toBe(ECONOMY_YIELD_PER_TURN + ECONOMY_TERRAIN_BONUS);
  });

  it('never charges a building the resource it produces', () => {
    for (const produces of ['food', 'wood', 'stone'] as ResourceKey[]) {
      expect(economyCostFor(produces)[produces]).toBe(0);
    }
  });

  it('leaves the builder alive but spent for the turn', () => {
    const { state, player, builder } = makeStateWithBuilderAt({ x: 5, y: 5 }, 'plain');
    applyAction(state, { type: 'buildEconomy', playerId: player.id, unitId: builder.id, produces: 'food' });

    const survivor = state.units.find((unit) => unit.id === builder.id);
    expect(survivor).toBeDefined();
    expect(survivor?.hasMovedThisTurn).toBe(true);
    expect(survivor?.hasAttackedThisTurn).toBe(true);
    expect(player.stats.economyBuilt).toBe(1);

    // ...and it cannot immediately build a second one somewhere else.
    survivor!.position = { x: 8, y: 8 };
    expect(economyBlockReason(state, player, survivor!, 'stone')).toMatch(/already used its turn/i);
  });

  it('refuses to build on impassable ground', () => {
    const { state, player, builder } = makeStateWithBuilderAt({ x: 5, y: 5 }, 'lake');
    expect(canBuildEconomy(state, player, builder, 'food')).toBe(false);
    expect(() =>
      applyAction(state, { type: 'buildEconomy', playerId: player.id, unitId: builder.id, produces: 'food' }),
    ).toThrow(/solid ground/i);
  });

  it('charges the cost and yields its resource every turn', () => {
    const { state, player, builder } = makeStateWithBuilderAt({ x: 5, y: 5 }, 'hills');
    const cost = economyCostFor('stone');
    const woodBefore = player.resources.wood;
    const foodBefore = player.resources.food;

    applyAction(state, { type: 'buildEconomy', playerId: player.id, unitId: builder.id, produces: 'stone' });
    expect(player.resources.wood).toBe(woodBefore - cost.wood);
    expect(player.resources.food).toBe(foodBefore - cost.food);

    // Round-trip back to this player, then collect income.
    player.hasCollectedIncomeThisTurn = false;
    const stoneAtTurnStart = player.resources.stone;
    applyAction(state, { type: 'income', playerId: player.id, resource: 'food' });

    // A quarry on hills is on its home terrain, so it pays double.
    expect(player.resources.stone).toBe(
      stoneAtTurnStart + ECONOMY_YIELD_PER_TURN + ECONOMY_TERRAIN_BONUS,
    );
    expect(state.actionLog.at(-1)).toMatch(/economy buildings/i);
  });

  it('counts economy yield towards collected-resource stats', () => {
    const { state, player, builder } = makeStateWithBuilderAt({ x: 5, y: 5 }, 'plain');
    applyAction(state, { type: 'buildEconomy', playerId: player.id, unitId: builder.id, produces: 'food' });
    const collectedBefore = player.stats.incomeCollected.food;

    player.hasCollectedIncomeThisTurn = false;
    applyAction(state, { type: 'income', playerId: player.id, resource: 'wood' });

    expect(player.stats.incomeCollected.food).toBe(
      collectedBefore + ECONOMY_YIELD_PER_TURN + ECONOMY_TERRAIN_BONUS,
    );
    // Spending is booked too, so the collected/spent ledger still balances
    // against the resources this player actually gained during the test.
    expect(sumRecord(player.stats.resourcesSpent)).toBe(sumRecord(economyCostFor('food')));
  });

  it('keeps economy buildings out of spawning, healing and road anchoring', () => {
    const { state, player, builder } = makeStateWithBuilderAt({ x: 5, y: 5 }, 'plain');
    applyAction(state, { type: 'buildEconomy', playerId: player.id, unitId: builder.id, produces: 'food' });
    // The builder survives, and units anchor roads in their own right — remove
    // it so only the farm could possibly be the anchor here.
    state.units = state.units.filter((unit) => unit.id !== builder.id);

    const spawnPositions = getSpawnStructures(state, player.id).map((entry) => entry.position);
    expect(spawnPositions).not.toContainEqual({ x: 5, y: 5 });
    expect(getLegalBuildPositions(state, player)).not.toContainEqual({ x: 5, y: 4 });
    expect(getLegalRoadPositions(state, player)).not.toContainEqual({ x: 5, y: 4 });

    // A wounded unit beside a farm gets no free healing.
    const wounded = makeUnit(player.id, 'footsoldier', { x: 6, y: 5 });
    wounded.hp = 1;
    state.units.push(wounded);
    applyAction(state, { type: 'endTurn', playerId: player.id });
    applyAction(state, { type: 'income', playerId: state.players[1].id, resource: 'food' });
    applyAction(state, { type: 'endTurn', playerId: state.players[1].id });
    expect(wounded.hp).toBe(1);
  });

  it('will not stack economy buildings next to each other', () => {
    const { state, player, builder } = makeStateWithBuilderAt({ x: 5, y: 5 }, 'plain');
    applyAction(state, { type: 'buildEconomy', playerId: player.id, unitId: builder.id, produces: 'food' });

    const neighbour = makeUnit(player.id, 'builder', { x: 6, y: 5 });
    state.units.push(neighbour);
    expect(economyBlockReason(state, player, neighbour, 'food')).toMatch(/spread them out/i);

    const further = makeUnit(player.id, 'builder', { x: 7, y: 5 });
    state.units.push(further);
    expect(economyBlockReason(state, player, further, 'food')).toBeNull();
  });

  it('will not build over a resource node', () => {
    const { state, player, builder } = makeStateWithBuilderAt({ x: 5, y: 5 }, 'plain');
    state.resourceNodes.push({
      id: 'node-test',
      position: { x: 5, y: 5 },
      resource: 'food',
      ownerId: null,
      bonus: 'ongoing',
    });
    expect(economyBlockReason(state, player, builder, 'food')).toMatch(/resource node/i);
  });

  it('can be destroyed without ending the game, and stops paying out', () => {
    const { state, player, builder } = makeStateWithBuilderAt({ x: 5, y: 5 }, 'plain');
    applyAction(state, { type: 'buildEconomy', playerId: player.id, unitId: builder.id, produces: 'food' });
    const farm = state.bases.find((base) => base.kind === 'economy')!;

    const rival = state.players[1];
    const raider = makeUnit(rival.id, 'cannon', { x: 5, y: 6 });
    state.units.push(raider);
    state.activePlayerIndex = 1;

    while (state.bases.some((base) => base.id === farm.id)) {
      raider.hasAttackedThisTurn = false;
      applyAction(state, {
        type: 'attack',
        playerId: rival.id,
        unitId: raider.id,
        targetBaseId: farm.id,
      });
    }

    expect(player.alive).toBe(true);
    expect(state.actionLog.at(-1)).toMatch(/farm was destroyed/i);

    state.activePlayerIndex = 0;
    player.hasCollectedIncomeThisTurn = false;
    const foodBefore = player.resources.food;
    applyAction(state, { type: 'income', playerId: player.id, resource: 'wood' });
    expect(player.resources.food).toBe(foodBefore);
  });
});

describe('themed maps', () => {
  function isPassable(terrain: ReturnType<typeof generateThemedTerrain>, x: number, y: number): boolean {
    return isPassableTerrain(terrain[y]?.[x]);
  }

  it('gives every home zone at least 6 passable tiles for the hills theme', () => {
    for (const seed of ['hills-a', 'hills-b', 'hills-c']) {
      const terrain = generateThemedTerrain(10, 10, seed, 2, 'hills');
      for (let index = 0; index < 2; index += 1) {
        const zone = getHomeZoneForPlayer(index, 10, 10);
        let count = 0;
        for (let y = zone.y1; y <= zone.y2; y += 1) {
          for (let x = zone.x1; x <= zone.x2; x += 1) {
            if (isPassable(terrain, x, y)) count += 1;
          }
        }
        expect(count).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('gives every home zone at least 6 passable tiles for the oasis theme', () => {
    for (const seed of ['oasis-a', 'oasis-b', 'oasis-c']) {
      const terrain = generateThemedTerrain(10, 10, seed, 2, 'oasis');
      for (let index = 0; index < 2; index += 1) {
        const zone = getHomeZoneForPlayer(index, 10, 10);
        let count = 0;
        for (let y = zone.y1; y <= zone.y2; y += 1) {
          for (let x = zone.x1; x <= zone.x2; x += 1) {
            if (isPassable(terrain, x, y)) count += 1;
          }
        }
        expect(count).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('places at least one lake tile roughly across the board for the river theme', () => {
    const terrain = generateThemedTerrain(10, 10, 'river-seed', 2, 'river');
    const lakeTiles = terrain.flat().filter((cell) => cell === 'lake');
    expect(lakeTiles.length).toBeGreaterThan(0);
  });

  it('produces the same terrain for the same seed and theme (deterministic)', () => {
    const first = generateThemedTerrain(10, 10, 'theme-seed', 2, 'hills');
    const second = generateThemedTerrain(10, 10, 'theme-seed', 2, 'hills');
    expect(first).toEqual(second);
  });

  it('createInitialState accepts a theme and produces a valid board with mapTheme set', () => {
    const state = createInitialState({ width: 10, height: 10, playerCount: 2, seed: 'themed-seed', theme: 'oasis' });
    expect(state.mapTheme).toBe('oasis');
    expect(state.terrain.length).toBe(10);
  });

  it('costs 2 movement to enter a hills tile without a road', () => {
    const state = createInitialState({
      width: 10,
      height: 10,
      playerCount: 2,
      terrain: (() => {
        const terrain: TerrainType[][] = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 'plain' as TerrainType));
        terrain[4][6] = 'mountain';
        terrain[6][6] = 'mountain';
        terrain[4][7] = 'mountain';
        terrain[6][7] = 'mountain';
        terrain[5][6] = 'hills';
        return terrain;
      })(),
      theme: 'random',
    });
    const unit = makeUnit(state.players[0].id, 'footsoldier', { x: 5, y: 5 });
    state.units.push(unit);
    // footsoldier has moveRange 2: hills cost 2, so it should just barely reach the hill tile
    // and not be able to go one further plain tile beyond it through the corridor.
    const reachable = getReachableTiles(state, unit);
    expect(reachable).toContainEqual({ x: 6, y: 5 });
    expect(reachable).not.toContainEqual({ x: 7, y: 5 });
  });

  it('scatters hills on every theme, not just the hills theme', () => {
    for (const theme of ['random', 'river', 'oasis'] as const) {
      const seedsWithHills = ['s1', 's2', 's3', 's4'].filter((seed) =>
        generateThemedTerrain(12, 12, `${theme}-${seed}`, 2, theme).some((row) => row.includes('hills')),
      );
      expect(seedsWithHills.length, `${theme} should produce hills`).toBeGreaterThan(0);
    }
  });
});
