import {
  applyAction,
  canBuildEconomy,
  canBuildTower,
  canFoundSettlement,
  canUnitAttack,
  chebyshevDistance,
  ECONOMY_TYPES,
  getLegalBasePositions,
  getLegalBuildPositions,
  getPlayerById,
  getReachableTiles,
  hasLineOfSight,
  unitCost,
} from '../engine/index.js';
import type { Base, GameState, Player, Position, ResourceKey, Unit, UnitType } from '../engine/index.js';

/**
 * A deliberately simple, deterministic AI opponent (DESIGN.md section 9).
 * No search or lookahead — just a fixed set of priority rules, so it's
 * transparent enough to playtest against and cheap to reason about.
 */

const TARGET_MIX: Record<UnitType, number> = {
  footsoldier: 3,
  cavalry: 1,
  cannon: 1,
  archer: 2,
  builder: 1,
  hero: 1,
};

const MOST_EXPENSIVE_FIRST: UnitType[] = ['hero', 'cannon', 'cavalry', 'archer', 'footsoldier', 'builder'];
const RESOURCE_KEYS: ResourceKey[] = ['food', 'wood', 'stone'];

/** Ceiling on AI sentry towers, so it still saves builders for settlements. */
const AI_MAX_TOWERS = 2;

/**
 * Ceiling on AI economy buildings. Without one the AI would spend every builder
 * on farms and never contest the map, which makes for a passive opponent.
 */
const AI_MAX_ECONOMY = 3;

function totalCost(unitType: UnitType): number {
  const cost = unitCost(unitType);
  return cost.food + cost.wood + cost.stone;
}

function canAfford(player: Player, unitType: UnitType): boolean {
  const cost = unitCost(unitType);
  return RESOURCE_KEYS.every((key) => player.resources[key] >= cost[key]);
}

/** Unit types the player's army is currently short of, relative to the target mix. */
function getShortUnitTypes(state: GameState, player: Player): UnitType[] {
  const counts: Record<UnitType, number> = {
    footsoldier: 0,
    cavalry: 0,
    cannon: 0,
    archer: 0,
    builder: 0,
    hero: 0,
  };
  for (const unit of state.units) {
    if (unit.ownerId === player.id) counts[unit.type] += 1;
  }
  const total = (Object.keys(counts) as UnitType[]).reduce((sum, type) => sum + counts[type], 0);
  const totalRatio = (Object.keys(TARGET_MIX) as UnitType[]).reduce(
    (sum, type) => sum + TARGET_MIX[type],
    0,
  );

  if (total === 0) return ['footsoldier'];

  return (Object.keys(TARGET_MIX) as UnitType[]).filter((type) => {
    const target = (total * TARGET_MIX[type]) / totalRatio;
    return counts[type] < target - 0.001;
  });
}

function pickIncomeResource(player: Player, unitType: UnitType): ResourceKey {
  const cost = unitCost(unitType);
  return RESOURCE_KEYS.reduce((best, key) => {
    const score = cost[key] - player.resources[key];
    const bestScore = cost[best] - player.resources[best];
    return score > bestScore ? key : best;
  }, RESOURCE_KEYS[0]);
}

function collectIncome(state: GameState, player: Player): void {
  const shortTypes = getShortUnitTypes(state, player);
  const targetType = shortTypes[0] ?? 'footsoldier';
  const resource = pickIncomeResource(player, targetType);
  applyAction(state, { type: 'income', playerId: player.id, resource });
}

function runBuildPhase(state: GameState, player: Player): void {
  const seenAttempts = new Set<string>();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const shortTypes = getShortUnitTypes(state, player);
    const affordableShort = shortTypes.filter((type) => canAfford(player, type));
    if (affordableShort.length === 0) break;

    const nextType = MOST_EXPENSIVE_FIRST.find((type) => affordableShort.includes(type))
      ?? affordableShort.sort((a, b) => totalCost(b) - totalCost(a))[0];

    const positions = getLegalBuildPositions(state, player);
    if (positions.length === 0) break;

    // Guard against repeating the exact same (type, position) build attempt
    // forever if applyAction throws for a reason our heuristics didn't predict.
    const attemptKey = `${nextType}:${positions[0].x},${positions[0].y}`;
    if (seenAttempts.has(attemptKey)) break;
    seenAttempts.add(attemptKey);

    try {
      applyAction(state, {
        type: 'build',
        playerId: player.id,
        unitType: nextType,
        position: positions[0],
      });
    } catch (error) {
      console.warn('[ai] build action failed, skipping', error);
      break;
    }
  }
}


interface AttackOpportunity {
  targetUnitId?: string;
  targetBaseId?: string;
}

function findAttackFrom(
  state: GameState,
  unit: Unit,
  fromPosition: Position,
  enemyBases: Base[],
  enemyUnits: Unit[],
): AttackOpportunity | null {
  const inRange = (targetPosition: Position) =>
    chebyshevDistance(fromPosition, targetPosition) <= unit.attackRange &&
    hasLineOfSight(state, fromPosition, targetPosition);

  // Main bases end the game, so they always outrank other targets. Settlements
  // are worth less than killing a unit, so they are checked last.
  const reachableMainBase = enemyBases.find((base) => base.kind === 'base' && inRange(base.position));
  if (reachableMainBase) return { targetBaseId: reachableMainBase.id };

  const reachableUnits = enemyUnits.filter((enemy) => inRange(enemy.position));
  if (reachableUnits.length > 0) {
    const killShot = reachableUnits.find((enemy) => enemy.hp <= unit.attack);
    const target = killShot ?? reachableUnits.reduce((lowest, enemy) => (enemy.hp < lowest.hp ? enemy : lowest));
    return { targetUnitId: target.id };
  }

  const reachableSettlement = enemyBases.find((base) => inRange(base.position));
  if (reachableSettlement) return { targetBaseId: reachableSettlement.id };
  return null;
}

function moveTowardNearestBase(
  state: GameState,
  unit: Unit,
  enemyBases: Base[],
  keepDistanceFromEnemies?: number,
): void {
  if (enemyBases.length === 0) return;

  const nearestBase = enemyBases.reduce((closest, base) =>
    chebyshevDistance(unit.position, base.position) < chebyshevDistance(unit.position, closest.position)
      ? base
      : closest,
  );

  const reachable = getReachableTiles(state, unit);
  if (reachable.length === 0) return;

  let candidates = reachable;
  if (keepDistanceFromEnemies) {
    const enemyUnits: Unit[] = state.units.filter((entry) => entry.ownerId !== unit.ownerId);
    const safeCandidates = candidates.filter((position: Position) =>
      enemyUnits.every((enemy) => chebyshevDistance(position, enemy.position) >= keepDistanceFromEnemies),
    );
    if (safeCandidates.length > 0) candidates = safeCandidates;
  }

  candidates = [...candidates].sort((a, b) => {
    const distanceDiff =
      chebyshevDistance(a, nearestBase.position) - chebyshevDistance(b, nearestBase.position);
    if (distanceDiff !== 0) return distanceDiff;
    if (a.x !== b.x) return a.x - b.x;
    return a.y - b.y;
  });

  const best = candidates[0];
  const currentDistance = chebyshevDistance(unit.position, nearestBase.position);
  if (chebyshevDistance(best, nearestBase.position) < currentDistance) {
    applyAction(state, { type: 'move', playerId: unit.ownerId, unitId: unit.id, to: best });
  }
}

function runUnitAction(state: GameState, unit: Unit, enemyBases: Base[], enemyUnits: Unit[]): void {
  if (unit.type === 'builder') {
    // Builders never fight. Spend the builder the moment the spot is legal,
    // otherwise push toward the front (keeping clear of enemies) and retry.
    const owner = getPlayerById(state, unit.ownerId);
    // Economy first: it compounds, so a farm on turn 2 is worth more than a
    // settlement on turn 8, and because builders spawn at home the AI naturally
    // puts them on safe ground. Once capped it reverts to expanding. A
    // settlement is worth more than a tower (it spawns units), so that comes
    // next; the tower cap stops the AI frittering every builder away on cheap
    // turrets.
    const spendBuilder = (): boolean => {
      const countOwned = (kind: Base['kind']) =>
        state.bases.filter((entry) => entry.ownerId === owner.id && entry.kind === kind).length;

      if (countOwned('economy') < AI_MAX_ECONOMY) {
        // Prefer whichever building the terrain underfoot doubles; failing that,
        // whichever resource the AI is shortest of.
        const terrain = state.terrain[unit.position.y]?.[unit.position.x];
        const byPriority = (Object.keys(ECONOMY_TYPES) as ResourceKey[]).sort((a, b) => {
          const bonus = (key: ResourceKey) => (ECONOMY_TYPES[key].terrain === terrain ? 1 : 0);
          return bonus(b) - bonus(a) || owner.resources[a] - owner.resources[b];
        });
        for (const produces of byPriority) {
          if (!canBuildEconomy(state, owner, unit, produces)) continue;
          applyAction(state, {
            type: 'buildEconomy',
            playerId: unit.ownerId,
            unitId: unit.id,
            produces,
          });
          return true;
        }
      }
      if (canFoundSettlement(state, owner, unit)) {
        applyAction(state, { type: 'foundSettlement', playerId: unit.ownerId, unitId: unit.id });
        return true;
      }
      if (countOwned('tower') < AI_MAX_TOWERS && canBuildTower(state, owner, unit)) {
        applyAction(state, { type: 'buildTower', playerId: unit.ownerId, unitId: unit.id });
        return true;
      }
      return false;
    };

    if (spendBuilder()) return;
    moveTowardNearestBase(state, unit, enemyBases, 3);
    spendBuilder();
    return;
  }

  if (unit.type === 'cavalry') {
    // Cavalry may move then attack, so first see if it can attack from where it stands.
    const directAttack = findAttackFrom(state, unit, unit.position, enemyBases, enemyUnits);
    if (directAttack) {
      applyAction(state, { type: 'attack', playerId: unit.ownerId, unitId: unit.id, ...directAttack });
      return;
    }

    const reachable = getReachableTiles(state, unit);
    for (const position of reachable) {
      const opportunity = findAttackFrom(state, unit, position, enemyBases, enemyUnits);
      if (opportunity) {
        applyAction(state, { type: 'move', playerId: unit.ownerId, unitId: unit.id, to: position });
        applyAction(state, { type: 'attack', playerId: unit.ownerId, unitId: unit.id, ...opportunity });
        return;
      }
    }

    moveTowardNearestBase(state, unit, enemyBases);
    return;
  }

  if (unit.type === 'cannon') {
    const attack = findAttackFrom(state, unit, unit.position, enemyBases, enemyUnits);
    if (attack && canUnitAttack(state, unit)) {
      applyAction(state, { type: 'attack', playerId: unit.ownerId, unitId: unit.id, ...attack });
      return;
    }
    // Move toward the fight, but stay out of melee range since firing next turn requires standing still.
    moveTowardNearestBase(state, unit, enemyBases, 2);
    return;
  }

  // Footsoldier: move OR attack, no combination.
  const attack = findAttackFrom(state, unit, unit.position, enemyBases, enemyUnits);
  if (attack) {
    applyAction(state, { type: 'attack', playerId: unit.ownerId, unitId: unit.id, ...attack });
    return;
  }
  moveTowardNearestBase(state, unit, enemyBases);
}

/**
 * Places a base for the given AI player during the setup phase. Picks the
 * legal tile that is farthest (on average) from the board's other placed
 * bases and closest to a corner, so AI players spread out naturally rather
 * than clustering near the center.
 */
export function runAiBasePlacement(state: GameState, playerId: string): GameState {
  const positions = getLegalBasePositions(state);
  if (positions.length === 0) return state;

  const corners: Position[] = [
    { x: 0, y: 0 },
    { x: state.width - 1, y: 0 },
    { x: 0, y: state.height - 1 },
    { x: state.width - 1, y: state.height - 1 },
  ];
  const takenCorners = state.bases.map((base) => base.position);
  const bestCorner = corners.reduce((best, corner) => {
    const distanceToTaken = takenCorners.length === 0
      ? 0
      : Math.min(...takenCorners.map((taken) => chebyshevDistance(corner, taken)));
    const bestDistance = takenCorners.length === 0
      ? 0
      : Math.min(...takenCorners.map((taken) => chebyshevDistance(best, taken)));
    return distanceToTaken > bestDistance ? corner : best;
  }, corners[0]);

  const target = positions.reduce((closest, position) =>
    chebyshevDistance(position, bestCorner) < chebyshevDistance(closest, bestCorner) ? position : closest,
  );

  try {
    applyAction(state, { type: 'placeBase', playerId, position: target });
  } catch (error) {
    console.warn('[ai] base placement failed, using first legal tile', error);
    try {
      applyAction(state, { type: 'placeBase', playerId, position: positions[0] });
    } catch (fallbackError) {
      console.warn('[ai] fallback base placement also failed', fallbackError);
    }
  }
  return state;
}

export type AiDifficulty = 'easy' | 'normal' | 'hard';

/** Simple seeded pseudo-random used only for "easy" difficulty's occasional missed actions. */
function pseudoRandom(seedValue: number): number {
  const x = Math.sin(seedValue) * 10000;
  return x - Math.floor(x);
}

/**
 * Plays one full turn for the given AI-controlled player: income, unlimited
 * affordable builds, then one action per unit, then ends the turn.
 * On 'easy', the AI occasionally skips a unit's action to play weaker;
 * on 'hard' it acts on every unit with no hesitation (same as 'normal' today,
 * reserved for future smarter heuristics).
 */
export function runAiTurn(state: GameState, playerId: string, difficulty: AiDifficulty = 'normal'): GameState {
  const player = getPlayerById(state, playerId);
  if (!player.alive) return state;

  try {
    collectIncome(state, player);
  } catch (error) {
    console.warn('[ai] income collection failed', error);
  }

  try {
    runBuildPhase(state, player);
  } catch (error) {
    console.warn('[ai] build phase failed', error);
  }

  const unitIds = state.units.filter((unit) => unit.ownerId === playerId).map((unit) => unit.id);

  let skipRoll = state.turn * 7 + unitIds.length;
  for (const unitId of unitIds) {
    const unit = state.units.find((entry) => entry.id === unitId);
    if (!unit || unit.ownerId !== playerId) continue;
    if (unit.hasAttackedThisTurn) continue;

    if (difficulty === 'easy') {
      skipRoll += 1;
      if (pseudoRandom(skipRoll) < 0.25) continue; // occasionally do nothing with this unit
    }

    const currentEnemyBases = state.bases.filter((base) => base.ownerId !== playerId);
    const currentEnemyUnits = state.units.filter((entry) => entry.ownerId !== playerId);
    try {
      runUnitAction(state, unit, currentEnemyBases, currentEnemyUnits);
    } catch (error) {
      console.warn('[ai] unit action failed, skipping unit', unitId, error);
    }
  }

  try {
    applyAction(state, { type: 'endTurn', playerId });
  } catch (error) {
    console.warn('[ai] end turn failed', error);
  }
  return state;
}
