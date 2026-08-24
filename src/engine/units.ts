import type { ResourceKey, TerrainType, Unit, UnitType } from './types.js';

export const BASE_MAX_HP = 40;

/** Settlements are cheaper and far more fragile than the main base. */
export const SETTLEMENT_MAX_HP = 18;

/** Resource cost, on top of the builder itself, to found a settlement. */
export const SETTLEMENT_COST: Record<ResourceKey, number> = { food: 0, wood: 2, stone: 3 };

/**
 * Sentry tower: a cheap, immobile auto-turret raised by a builder.
 *
 * Deliberately weak per shot: it fires every single turn forever, so a high
 * attack value here would make towers strictly better than archers. The builder
 * survives, so the tower's real cost is the materials below plus the builder's
 * whole turn.
 */
export const TOWER_MAX_HP = 10;
export const TOWER_ATTACK = 2;
/** Same reach as an archer. */
export const TOWER_ATTACK_RANGE = 3;
export const TOWER_COST: Record<ResourceKey, number> = { food: 1, wood: 0, stone: 1 };

/**
 * Towers may not be built adjacent to each other. Without this you could pave a
 * solid, self-firing wall across a choke point and simply never be attacked.
 */
export const MIN_TOWER_DISTANCE = 2;

/**
 * Economy buildings: a farm, lumber camp or quarry, each raised by a builder.
 *
 * The builder picks which one to raise, so you can always chase whichever
 * resource you are short of. Terrain still matters — raising a building on its
 * home terrain doubles the yield, which is what keeps forest and hills worth
 * fighting over rather than being pure movement tax.
 *
 * No building ever costs the resource it produces, so a farm can never
 * bootstrap itself from food alone.
 */
export const ECONOMY_MAX_HP = 8;

export const ECONOMY_TYPES: Record<
  ResourceKey,
  { label: string; cost: Record<ResourceKey, number>; terrain: TerrainType }
> = {
  food: { label: 'farm', cost: { food: 0, wood: 2, stone: 2 }, terrain: 'plain' },
  wood: { label: 'lumber camp', cost: { food: 2, wood: 0, stone: 2 }, terrain: 'forest' },
  stone: { label: 'quarry', cost: { food: 2, wood: 2, stone: 0 }, terrain: 'hills' },
};

/** Base yield per turn, on any terrain the building is allowed to stand on. */
export const ECONOMY_YIELD_PER_TURN = 1;

/** Extra yield per turn when the building sits on its home terrain. */
export const ECONOMY_TERRAIN_BONUS = 1;

/**
 * Economy buildings may not be adjacent to each other. Spreading them out is
 * the price of a bigger economy: a compact cluster would be trivial to garrison
 * with a single defender.
 */
export const MIN_ECONOMY_DISTANCE = 2;

/** Human-readable name for an economy building yielding the given resource. */
export function economyLabelFor(produces: ResourceKey): string {
  return ECONOMY_TYPES[produces]?.label ?? 'economy building';
}

/** Resource cost, on top of the builder's turn, to raise the given building. */
export function economyCostFor(produces: ResourceKey): Record<ResourceKey, number> {
  return ECONOMY_TYPES[produces].cost;
}

/** Yield per turn for a building of this type standing on this terrain. */
export function economyYieldOn(produces: ResourceKey, terrain: TerrainType | undefined): number {
  const bonus = terrain === ECONOMY_TYPES[produces].terrain ? ECONOMY_TERRAIN_BONUS : 0;
  return ECONOMY_YIELD_PER_TURN + bonus;
}

export const RESOURCE_KEYS: ResourceKey[] = ['food', 'wood', 'stone'];

export const UNIT_DEFS: Record<
  UnitType,
  {
    maxHp: number;
    moveRange: number;
    attack: number;
    attackRange: number;
    areaRadius?: number;
    areaDamage?: number;
    cost: Record<ResourceKey, number>;
    canMoveThenAttack: boolean;
  }
> = {
  footsoldier: {
    maxHp: 10,
    moveRange: 2,
    attack: 3,
    attackRange: 1,
    cost: { food: 2, wood: 1, stone: 0 },
    canMoveThenAttack: false,
  },
  cavalry: {
    maxHp: 12,
    moveRange: 5,
    attack: 4,
    attackRange: 1,
    cost: { food: 3, wood: 2, stone: 1 },
    canMoveThenAttack: true,
  },
  cannon: {
    maxHp: 8,
    moveRange: 1,
    attack: 7,
    attackRange: 4,
    cost: { food: 1, wood: 3, stone: 4 },
    canMoveThenAttack: false,
  },
  archer: {
    maxHp: 6,
    moveRange: 2,
    attack: 2,
    attackRange: 3,
    cost: { food: 1, wood: 1, stone: 1 },
    canMoveThenAttack: false,
  },
  hero: {
    maxHp: 16,
    moveRange: 5,
    attack: 6,
    attackRange: 2,
    areaRadius: 1,
    areaDamage: 3,
    cost: { food: 5, wood: 4, stone: 5 },
    canMoveThenAttack: true,
  },
  // Non-combatant. It walks somewhere useful and works: founding a settlement
  // (which spends it), or raising a sentry tower, farm, lumber camp or quarry
  // (which costs it the rest of its turn but leaves it alive). It has no attack.
  builder: {
    maxHp: 6,
    moveRange: 3,
    attack: 0,
    attackRange: 0,
    cost: { food: 1, wood: 0, stone: 1 },
    canMoveThenAttack: false,
  },
};

export function makeUnit(ownerId: string, type: UnitType, position: { x: number; y: number }): Unit {
  const def = UNIT_DEFS[type];
  return {
    id: `${type}-${ownerId}-${Math.random().toString(36).slice(2, 9)}`,
    ownerId,
    type,
    position,
    hp: def.maxHp,
    maxHp: def.maxHp,
    moveRange: def.moveRange,
    attack: def.attack,
    attackRange: def.attackRange,
    areaRadius: def.areaRadius,
    areaDamage: def.areaDamage,
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    turnStartPosition: { ...position },
  };
}

export function unitCost(type: UnitType) {
  return UNIT_DEFS[type].cost;
}
