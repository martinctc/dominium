import { getReachableTiles, findPath, isPassableTerrain } from './pathfinding.js';
import { chebyshevDistance, hasLineOfSight } from './los.js';
import { unitCost, UNIT_DEFS } from './units.js';
import { minBaseDistance } from './setup.js';
import type { Action, Base, GameState, Player, Position, ResourceKey, Unit } from './types.js';
import { BASE_MAX_HP, SETTLEMENT_COST, SETTLEMENT_MAX_HP } from './units.js';
import {
  MIN_TOWER_DISTANCE,
  TOWER_ATTACK,
  TOWER_ATTACK_RANGE,
  TOWER_COST,
  TOWER_MAX_HP,
} from './units.js';
import {
  ECONOMY_MAX_HP,
  economyCostFor,
  economyLabelFor,
  economyYieldOn,
  MIN_ECONOMY_DISTANCE,
} from './units.js';

export function getPlayerById(state: GameState, playerId: string): Player {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) throw new Error(`Unknown player: ${playerId}`);
  return player;
}

/** Returns whether a building has a continuous road connection to its owner's main base. */
function isRoadConnectedToMainBase(state: GameState, building: Base): boolean {
  const mainBase = getMainBase(state, building.ownerId);
  if (!mainBase || building.id === mainBase.id || state.roads.length === 0) return false;

  const roadKeys = new Set(state.roads.map((road) => `${road.x}:${road.y}`));
  const reached = new Set<string>([`${mainBase.position.x}:${mainBase.position.y}`]);
  const queue: Position[] = [{ ...mainBase.position }];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const next = { x: current.x + dx, y: current.y + dy };
        const key = `${next.x}:${next.y}`;
        if (!roadKeys.has(key) || reached.has(key)) continue;
        reached.add(key);
        queue.push(next);
      }
    }
  }

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (reached.has(`${building.position.x + dx}:${building.position.y + dy}`)) return true;
    }
  }
  return false;
}

/** Repairs one HP on each damaged non-base building supplied by the road network. */
function repairConnectedBuildings(state: GameState, player: Player): void {
  for (const building of state.bases) {
    if (building.ownerId !== player.id || building.hp >= building.maxHp) continue;
    if (!isRoadConnectedToMainBase(state, building)) continue;
    building.hp = Math.min(building.maxHp, building.hp + 1);
    state.actionLog.push(`🔧 ${player.name}'s ${buildingLabel(building)} repairs 1 HP via the road network.`);
  }
}

export function getActivePlayer(state: GameState): Player {
  return state.players[state.activePlayerIndex];
}

export function getBaseById(state: GameState, baseId: string): Base {
  const base = state.bases.find((entry) => entry.id === baseId);
  if (!base) throw new Error(`Unknown base: ${baseId}`);
  return base;
}

/** Every building a player owns: their main base plus any settlements, towers or economy buildings. */
export function getPlayerStructures(state: GameState, playerId: string): Base[] {
  return state.bases.filter((entry) => entry.ownerId === playerId);
}

/**
 * The player's *logistical* buildings: the main base and its settlements.
 *
 * This is an allowlist on purpose. Towers and economy buildings must not spawn
 * units (a 4-resource forward barracks would break the game), heal, or anchor
 * roads — all of which they would inherit for free from `getPlayerStructures`,
 * and so would any building kind added in future.
 */
export function getSpawnStructures(state: GameState, playerId: string): Base[] {
  return state.bases.filter(
    (entry) => entry.ownerId === playerId && (entry.kind === 'base' || entry.kind === 'settlement'),
  );
}

/**
 * Display name for a building. Economy buildings read as what they actually
 * are ("quarry", not "economy building"), which is what the action log wants.
 */
export function buildingLabel(building: Base): string {
  if (building.kind === 'economy') {
    return building.produces ? economyLabelFor(building.produces) : 'economy building';
  }
  return building.kind;
}

/** The player's main base — the one whose destruction eliminates them. */export function getMainBase(state: GameState, playerId: string): Base | undefined {
  return state.bases.find((entry) => entry.ownerId === playerId && entry.kind === 'base');
}

export function getUnitById(state: GameState, unitId: string): Unit {
  const unit = state.units.find((entry) => entry.id === unitId);
  if (!unit) throw new Error(`Unknown unit: ${unitId}`);
  return unit;
}

export function canUnitAttack(state: GameState, unit: Unit): boolean {
  if (unit.hasAttackedThisTurn) return false;
  if (unit.type === 'cannon' && unit.hasMovedThisTurn) return false;
  return true;
}

export function resetTurnFlags(state: GameState): GameState {
  for (const unit of state.units) {
    unit.hasMovedThisTurn = false;
    unit.hasAttackedThisTurn = false;
  }
  return state;
}

/** Bonus resource amount for a one-time capture reward (DESIGN: "lump sum"). */
export const LUMP_SUM_BONUS = 4;
/** Extra resource collected automatically each of the owner's future income steps. */
export const ONGOING_BONUS_PER_TURN = 1;

/**
 * Checks whether any of the given player's units qualify for claiming a
 * resource node this turn (stationed on it, unmoved, for the whole turn).
 *
 * A 'lumpSum' node is a treasure chest: it pays out once and is then removed
 * from the board. An 'ongoing' node is territory: it changes hands and pays
 * its owner every turn for as long as they hold it.
 */
function checkResourceNodeCaptures(state: GameState, player: Player): void {
  const playerUnits = state.units.filter((unit) => unit.ownerId === player.id);
  for (const unit of playerUnits) {
    if (unit.hasMovedThisTurn || unit.hasAttackedThisTurn) continue;
    if (unit.position.x !== unit.turnStartPosition.x || unit.position.y !== unit.turnStartPosition.y) continue;

    const node = state.resourceNodes.find(
      (entry) => entry.position.x === unit.position.x && entry.position.y === unit.position.y,
    );
    if (!node || node.ownerId === player.id) continue;

    player.stats.nodesCaptured += 1;
    if (node.bonus === 'lumpSum') {
      player.resources[node.resource] += LUMP_SUM_BONUS;
      player.stats.incomeCollected[node.resource] += LUMP_SUM_BONUS;
      // The chest is emptied and gone — leaving it on the board would imply
      // there is still something there to fight over.
      state.resourceNodes = state.resourceNodes.filter((entry) => entry.id !== node.id);
      state.actionLog.push(
        `🎁 ${player.name}'s ${unit.type} looted a treasure chest — ${LUMP_SUM_BONUS} ${node.resource}!`,
      );
    } else {
      // Ownership is recorded so the node cannot be re-claimed every turn by the
      // same parked unit, and so the board can show who holds it.
      node.ownerId = player.id;
      state.actionLog.push(
        `🏴 ${player.name}'s ${unit.type} captured a ${node.resource} node — +${ONGOING_BONUS_PER_TURN} ${node.resource} every turn while held!`,
      );
    }
  }
}

/** Units standing within this Chebyshev distance of one of their own buildings regen HP each turn. */
const HEAL_RANGE = 2;
const HEAL_AMOUNT = 1;

/** Heals any of the player's damaged units that are near one of their own buildings. */
/**
 * Heroes are area-damage specialists: the instant they arrive at a new tile,
 * they lash out at every enemy unit adjacent to them, on top of (and
 * independent of) whatever they do with their manual attack action later in
 * the turn. This mirrors the `attack` case's area-damage handling so the two
 * code paths behave identically (same log format, same kill bookkeeping).
 */
function applyHeroArrivalSplash(state: GameState, player: Player, hero: Unit): void {
  const areaRadius = hero.areaRadius ?? UNIT_DEFS[hero.type].areaRadius;
  const areaDamage = hero.areaDamage ?? UNIT_DEFS[hero.type].areaDamage;
  if (!areaRadius || areaRadius <= 0 || !areaDamage) return;

  const areaTargets = state.units.filter(
    (unit) =>
      unit.ownerId !== player.id &&
      chebyshevDistance(unit.position, hero.position) <= areaRadius &&
      hasLineOfSight(state, hero.position, unit.position),
  );
  if (areaTargets.length === 0) return;

  const destroyedIds = new Set<string>();
  for (const target of areaTargets) {
    target.hp -= areaDamage;
    const targetOwner = getPlayerById(state, target.ownerId);
    state.actionLog.push(
      `⚔️ ${player.name}'s ${hero.type} strikes all around on arrival, hitting ${targetOwner.name}'s ${target.type} for ${areaDamage}.`,
    );
    if (target.hp <= 0) {
      destroyedIds.add(target.id);
      player.stats.unitsKilled += 1;
      targetOwner.stats.unitsLost += 1;
      state.actionLog.push(`${targetOwner.name}'s ${target.type} was destroyed.`);
    }
  }
  if (destroyedIds.size > 0) {
    state.units = state.units.filter((unit) => !destroyedIds.has(unit.id));
  }
}

function healUnitsNearBase(state: GameState, player: Player): void {
  const structures = getSpawnStructures(state, player.id);
  if (structures.length === 0) return;
  for (const unit of state.units) {
    if (unit.ownerId !== player.id) continue;
    if (unit.hp >= unit.maxHp) continue;
    const nearStructure = structures.some(
      (structure) => chebyshevDistance(unit.position, structure.position) <= HEAL_RANGE,
    );
    if (!nearStructure) continue;
    unit.hp = Math.min(unit.maxHp, unit.hp + HEAL_AMOUNT);
    state.actionLog.push(`💚 ${player.name}'s ${unit.type} rests near a building and heals ${HEAL_AMOUNT} HP.`);
  }
}

/**
 * Sentry towers shoot once each, at the start of their owner's turn.
 *
 * Targeting is deliberately deterministic — closest first, then the weakest,
 * then by id. There is no seeded RNG on GameState, so a random pick would make
 * games unreproducible and tests flaky; focusing the most wounded target in
 * reach also reads better than an arbitrary choice.
 */
function fireTowers(state: GameState, player: Player): void {
  const towers = state.bases.filter((entry) => entry.ownerId === player.id && entry.kind === 'tower');
  for (const tower of towers) {
    const inRange = state.units.filter(
      (unit) =>
        unit.ownerId !== player.id &&
        chebyshevDistance(tower.position, unit.position) <= TOWER_ATTACK_RANGE &&
        hasLineOfSight(state, tower.position, unit.position),
    );
    if (inRange.length === 0) continue;

    inRange.sort(
      (a, b) =>
        chebyshevDistance(tower.position, a.position) - chebyshevDistance(tower.position, b.position) ||
        a.hp - b.hp ||
        a.id.localeCompare(b.id),
    );
    const target = inRange[0];
    const targetOwner = getPlayerById(state, target.ownerId);

    target.hp -= TOWER_ATTACK;
    state.actionLog.push(
      `🗼 ${player.name}'s tower shot ${targetOwner.name}'s ${target.type} for ${TOWER_ATTACK}.`,
    );
    if (target.hp <= 0) {
      state.units = state.units.filter((unit) => unit.id !== target.id);
      player.stats.unitsKilled += 1;
      targetOwner.stats.unitsLost += 1;
      state.actionLog.push(`💥 ${targetOwner.name}'s ${target.type} was destroyed by the tower.`);
    }
  }
}

export function advanceTurn(state: GameState): GameState {
  const endingPlayer = state.players[state.activePlayerIndex];
  const alivePlayerCount = state.players.filter((player) => player.alive).length;
  let nextIndex = state.activePlayerIndex;
  for (let attempt = 0; attempt < state.players.length; attempt += 1) {
    nextIndex = (nextIndex + 1) % state.players.length;
    if (state.players[nextIndex].alive || alivePlayerCount === 0) break;
  }
  state.activePlayerIndex = nextIndex;
  state.turn += 1;
  state.players[nextIndex].hasCollectedIncomeThisTurn = false;
  state.actionLog.push(`Turn ${state.turn}: ${state.players[nextIndex].name} to act.`);
  resetTurnFlags(state);
  // Snapshot each of the new active player's units' positions, so we can later
  // tell whether they stayed put for their entire upcoming turn (resource-node capture).
  for (const unit of state.units) {
    if (unit.ownerId === state.players[nextIndex].id) {
      unit.turnStartPosition = { ...unit.position };
    }
  }
  healUnitsNearBase(state, state.players[nextIndex]);
  repairConnectedBuildings(state, state.players[nextIndex]);
  // Towers open fire before their owner acts, so anything that ended a move
  // inside their arc during the previous turn gets punished for it.
  fireTowers(state, state.players[nextIndex]);

  // Population/economy timeline snapshot for the player whose turn just ended.
  const endedPlayerUnitCount = state.units.filter((unit) => unit.ownerId === endingPlayer.id).length;
  const endedPlayerTotalResources = Object.values(endingPlayer.resources).reduce((sum, amount) => sum + amount, 0);
  state.timeline.push({
    turn: state.turn - 1,
    playerId: endingPlayer.id,
    unitCount: endedPlayerUnitCount,
    totalResources: endedPlayerTotalResources,
  });

  return state;
}

/**
 * Tiles where `player` (defaulting to whoever is currently placing) may found
 * their base. Placement is confined to that player's home zone so opponents
 * always start on opposite sides of the board, with the minimum-separation
 * rule kept as a second guard.
 */
export function getLegalBasePositions(state: GameState, player?: Player): Position[] {
  const placingPlayer = player ?? state.players[state.setupPlayerIndex];
  const zone = placingPlayer?.homeZone;
  const distance = minBaseDistance(state.width, state.height);
  const inZone: Position[] = [];
  const anywhere: Position[] = [];
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      if (state.terrain[y]?.[x] === 'lake' || state.terrain[y]?.[x] === 'mountain') continue;
      // A building sitting on a node would lock it out of the game forever:
      // buildings never capture, so nobody could ever claim or loot it.
      if (state.resourceNodes.some((node) => node.position.x === x && node.position.y === y)) continue;
      const tooCloseToOtherBase = state.bases.some(
        (base) => Math.max(Math.abs(base.position.x - x), Math.abs(base.position.y - y)) < distance,
      );
      if (tooCloseToOtherBase) continue;
      anywhere.push({ x, y });
      if (zone && x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2) {
        inZone.push({ x, y });
      }
    }
  }
  // Map generation guarantees every home zone has passable tiles, but never hand
  // back an empty list — that would deadlock setup.
  return inZone.length > 0 ? inZone : anywhere;
}

export function canPlaceBaseAt(state: GameState, position: Position, player?: Player): boolean {
  return getLegalBasePositions(state, player).some(
    (candidate) => candidate.x === position.x && candidate.y === position.y,
  );
}
/** Units may be built on any free, passable tile adjacent to any of the player's buildings. */
export function getLegalBuildPositions(state: GameState, player: Player): Position[] {
  const structures = getSpawnStructures(state, player.id);
  const legalPositions: Position[] = [];
  const seen = new Set<string>();
  for (const structure of structures) {
    for (let y = structure.position.y - 1; y <= structure.position.y + 1; y += 1) {
      for (let x = structure.position.x - 1; x <= structure.position.x + 1; x += 1) {
        if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
        if (state.terrain[y]?.[x] === 'lake' || state.terrain[y]?.[x] === 'mountain') continue;
        const key = `${x}:${y}`;
        if (seen.has(key)) continue;
        const occupied = state.units.some((unit) => unit.position.x === x && unit.position.y === y);
        if (occupied) continue;
        // Buildings (including the anchoring structure itself) fill their tile —
        // a unit standing there would hide it and stack two things on one square.
        const onBuilding = state.bases.some(
          (entry) => entry.position.x === x && entry.position.y === y,
        );
        if (onBuilding) continue;
        seen.add(key);
        legalPositions.push({ x, y });
      }
    }
  }
  return legalPositions;
}

/** Cost, in wood, to build a single road/bridge tile. */
export const ROAD_COST = 1;

/**
 * Roads/bridges may be built on any non-mountain tile adjacent to one of the
 * player's own units, their buildings, or an existing road.
 *
 * Tiles occupied by the player's *own* units are allowed — you are paving the
 * ground your troops are standing on, which is exactly how you bridge a lake
 * you have already reached. Enemy-occupied tiles and building tiles are not.
 */
export function getLegalRoadPositions(state: GameState, player: Player): Position[] {
  const anchors: Position[] = [
    ...getSpawnStructures(state, player.id).map((structure) => structure.position),
    ...state.units.filter((unit) => unit.ownerId === player.id).map((unit) => unit.position),
    ...state.roads,
  ];

  const legalPositions: Position[] = [];
  const seen = new Set<string>();
  for (const anchor of anchors) {
    for (let y = anchor.y - 1; y <= anchor.y + 1; y += 1) {
      for (let x = anchor.x - 1; x <= anchor.x + 1; x += 1) {
        if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
        const terrain = state.terrain[y]?.[x];
        if (terrain === 'mountain') continue;
        const key = `${x}:${y}`;
        if (seen.has(key)) continue;
        if (state.roads.some((road) => road.x === x && road.y === y)) continue;
        const occupant = state.units.find((unit) => unit.position.x === x && unit.position.y === y);
        if (occupant && occupant.ownerId !== player.id) continue;
        if (state.bases.some((baseEntry) => baseEntry.position.x === x && baseEntry.position.y === y)) continue;
        seen.add(key);
        legalPositions.push({ x, y });
      }
    }
  }
  return legalPositions;
}

/**
 * Why the given builder cannot found a settlement where it stands, or null if
 * it can. Returning the reason (rather than a bare boolean) lets both the UI
 * and the thrown error explain the same thing.
 */
export function settlementBlockReason(state: GameState, player: Player, unit: Unit): string | null {
  if (unit.type !== 'builder') return 'Only a builder can found a settlement.';
  if (unit.ownerId !== player.id) return 'That is not your builder.';
  if (builderIsSpent(unit)) return 'This builder has already used its turn.';

  const { x, y } = unit.position;
  const terrain = state.terrain[y]?.[x];
  if (terrain === 'lake' || terrain === 'mountain') {
    return 'Settlements need solid ground — not a lake or a mountain.';
  }
  if (state.bases.some((entry) => entry.position.x === x && entry.position.y === y)) {
    return 'There is already a building on this tile.';
  }
  // Same reason bases can't sit on nodes: a building can never capture, so a
  // settlement here would take the node out of play permanently.
  if (state.resourceNodes.some((node) => node.position.x === x && node.position.y === y)) {
    return 'You cannot build over a resource node — move the builder off it first.';
  }
  for (const [key, amount] of Object.entries(SETTLEMENT_COST) as [keyof typeof SETTLEMENT_COST, number][]) {
    if (player.resources[key] < amount) return `Not enough ${key} to found a settlement.`;
  }
  return null;
}

export function canFoundSettlement(state: GameState, player: Player, unit: Unit): boolean {
  return settlementBlockReason(state, player, unit) === null;
}

/**
 * Why the given builder cannot raise a sentry tower where it stands, or null if
 * it can. Mirrors `settlementBlockReason` so the UI and the thrown error stay
 * in step, but towers only have to clear *other towers* — hugging your own base
 * or a settlement with a tower is exactly the point.
 */
export function towerBlockReason(state: GameState, player: Player, unit: Unit): string | null {
  if (unit.type !== 'builder') return 'Only a builder can raise a tower.';
  if (unit.ownerId !== player.id) return 'That is not your builder.';
  if (builderIsSpent(unit)) return 'This builder has already used its turn.';

  const { x, y } = unit.position;
  const terrain = state.terrain[y]?.[x];
  if (terrain === 'lake' || terrain === 'mountain') {
    return 'Towers need solid ground — not a lake or a mountain.';
  }
  if (state.bases.some((entry) => entry.position.x === x && entry.position.y === y)) {
    return 'There is already a building on this tile.';
  }
  if (state.resourceNodes.some((node) => node.position.x === x && node.position.y === y)) {
    return 'You cannot build over a resource node — move the builder off it first.';
  }
  const tooCloseToTower = state.bases.some(
    (entry) =>
      entry.kind === 'tower' && chebyshevDistance(entry.position, unit.position) < MIN_TOWER_DISTANCE,
  );
  if (tooCloseToTower) {
    return 'Towers cannot be built next to each other.';
  }
  for (const [key, amount] of Object.entries(TOWER_COST) as [keyof typeof TOWER_COST, number][]) {
    if (player.resources[key] < amount) return `Not enough ${key} to raise a tower.`;
  }
  return null;
}

export function canBuildTower(state: GameState, player: Player, unit: Unit): boolean {
  return towerBlockReason(state, player, unit) === null;
}

/**
 * True when this builder has already used its turn — moved, or worked. Building
 * marks both flags, which is what stops one builder papering the map with
 * towers and farms in a single turn now that it survives the job.
 */
function builderIsSpent(unit: Unit): boolean {
  return unit.hasMovedThisTurn && unit.hasAttackedThisTurn;
}

/**
 * Why the given builder cannot raise an economy building of the given type
 * where it stands, or null if it can. Unlike settlements and towers there is no
 * terrain gate — any passable land works — but the yield is doubled on the
 * building's home terrain, so *where* still matters.
 */
export function economyBlockReason(
  state: GameState,
  player: Player,
  unit: Unit,
  produces: ResourceKey,
): string | null {
  if (unit.type !== 'builder') return 'Only a builder can raise an economy building.';
  if (unit.ownerId !== player.id) return 'That is not your builder.';
  if (builderIsSpent(unit)) return 'This builder has already used its turn.';

  const { x, y } = unit.position;
  const label = economyLabelFor(produces);
  const terrain = state.terrain[y]?.[x];
  if (!isPassableTerrain(terrain)) {
    return `A ${label} needs solid ground — not a lake or a mountain.`;
  }
  if (state.bases.some((entry) => entry.position.x === x && entry.position.y === y)) {
    return 'There is already a building on this tile.';
  }
  if (state.resourceNodes.some((node) => node.position.x === x && node.position.y === y)) {
    return 'You cannot build over a resource node — move the builder off it first.';
  }
  const tooClose = state.bases.some(
    (entry) =>
      entry.kind === 'economy' &&
      chebyshevDistance(entry.position, unit.position) < MIN_ECONOMY_DISTANCE,
  );
  if (tooClose) {
    return 'Economy buildings cannot be built next to each other — spread them out.';
  }
  for (const [key, amount] of Object.entries(economyCostFor(produces)) as [ResourceKey, number][]) {
    if (player.resources[key] < amount) return `Not enough ${key} to build a ${label}.`;
  }
  return null;
}

export function canBuildEconomy(
  state: GameState,
  player: Player,
  unit: Unit,
  produces: ResourceKey,
): boolean {
  return economyBlockReason(state, player, unit, produces) === null;
}

export function applyAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'placeBase': {
      if (state.phase !== 'setup') {
        throw new Error('Base placement can only happen during the setup phase.');
      }
      const player = state.players[state.setupPlayerIndex];
      if (!player || player.id !== action.playerId) {
        throw new Error('It is not your turn to place a base.');
      }
      if (!canPlaceBaseAt(state, action.position, player)) {
        throw new Error('That location is invalid — it must sit inside your own home zone, on passable terrain, and clear of resource nodes.');
      }

      const baseId = `base-${player.id}`;
      player.baseId = baseId;
      state.bases.push({
        id: baseId,
        ownerId: player.id,
        kind: 'base',
        position: { ...action.position },
        hp: BASE_MAX_HP,
        maxHp: BASE_MAX_HP,
      });
      state.actionLog.push(`${player.name} placed their base at ${action.position.x},${action.position.y}.`);

      if (state.setupPlayerIndex + 1 < state.players.length) {
        state.setupPlayerIndex += 1;
        state.actionLog.push(`${state.players[state.setupPlayerIndex].name}, choose a location for your base.`);
      } else {
        state.phase = 'playing';
        state.turn = 1;
        state.actionLog.push(`All bases placed. Turn 1: ${state.players[0].name} to act.`);
      }
      return state;
    }

    case 'income': {
      const player = getPlayerById(state, action.playerId);
      if (player.id !== getActivePlayer(state).id) {
        throw new Error('Only the active player may collect income.');
      }
      if (player.hasCollectedIncomeThisTurn) {
        throw new Error('Income has already been collected this turn.');
      }
      player.resources[action.resource] += 1;
      player.hasCollectedIncomeThisTurn = true;
      player.stats.incomeCollected[action.resource] += 1;
      state.actionLog.push(`${player.name} collected 1 ${action.resource}.`);

      // Automatic ongoing bonus from any resource nodes this player currently holds.
      const heldNodes = state.resourceNodes.filter(
        (node) => node.ownerId === player.id && node.bonus === 'ongoing',
      );
      for (const node of heldNodes) {
        player.resources[node.resource] += ONGOING_BONUS_PER_TURN;
        player.stats.incomeCollected[node.resource] += ONGOING_BONUS_PER_TURN;
        state.actionLog.push(`${player.name} received +${ONGOING_BONUS_PER_TURN} ${node.resource} from a captured node.`);
      }

      // Farms, lumber camps and quarries. Aggregated into a single log line so
      // a large economy doesn't bury every other event in the action log.
      const yields: Partial<Record<ResourceKey, number>> = {};
      for (const building of state.bases) {
        if (building.ownerId !== player.id || building.kind !== 'economy' || !building.produces) continue;
        const terrain = state.terrain[building.position.y]?.[building.position.x];
        const perTurn = economyYieldOn(building.produces, terrain);
        player.resources[building.produces] += perTurn;
        player.stats.incomeCollected[building.produces] += perTurn;
        yields[building.produces] = (yields[building.produces] ?? 0) + perTurn;
      }
      const yieldSummary = (Object.entries(yields) as [ResourceKey, number][])
        .map(([resource, amount]) => `+${amount} ${resource}`)
        .join(', ');
      if (yieldSummary) {
        state.actionLog.push(`🌾 ${player.name} received ${yieldSummary} from their economy buildings.`);
      }
      return state;
    }

    case 'build': {
      const player = getPlayerById(state, action.playerId);
      const activePlayer = getActivePlayer(state);
      if (player.id !== activePlayer.id) {
        throw new Error('Only the active player may build units.');
      }
      if (!player.hasCollectedIncomeThisTurn) {
        throw new Error('You must collect income before taking any other action this turn.');
      }

      const cost = unitCost(action.unitType);
      for (const [key, amount] of Object.entries(cost)) {
        const resourceKey = key as keyof typeof cost;
        if (player.resources[resourceKey] < amount) {
          throw new Error(`Not enough ${resourceKey} to build ${action.unitType}.`);
        }
      }

      const legalPositions = getLegalBuildPositions(state, player);
      const chosenPosition = action.position;
      const isAllowed = legalPositions.some(
        (position) => position.x === chosenPosition.x && position.y === chosenPosition.y,
      );
      if (!isAllowed) {
        throw new Error(`Illegal build position for ${action.unitType}.`);
      }

      for (const [key, amount] of Object.entries(cost)) {
        const resourceKey = key as keyof typeof cost;
        player.resources[resourceKey] -= amount;
        player.stats.resourcesSpent[resourceKey] += amount;
      }

      const unitId = `${action.unitType}-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const stats = UNIT_DEFS[action.unitType];
      const builtUnit: Unit = {
        id: unitId,
        ownerId: player.id,
        type: action.unitType,
        position: { ...action.position },
        hp: stats.maxHp,
        maxHp: stats.maxHp,
        moveRange: stats.moveRange,
        attack: stats.attack,
        attackRange: stats.attackRange,
        areaRadius: stats.areaRadius,
        areaDamage: stats.areaDamage,
        hasMovedThisTurn: false,
        hasAttackedThisTurn: false,
        turnStartPosition: { ...action.position },
      };

      state.units.push(builtUnit);
      player.stats.unitsBuilt += 1;
      state.actionLog.push(`${player.name} built a ${action.unitType} at ${action.position.x},${action.position.y}.`);
      return state;
    }

    case 'buildRoad': {
      const player = getPlayerById(state, action.playerId);
      const activePlayer = getActivePlayer(state);
      if (player.id !== activePlayer.id) {
        throw new Error('Only the active player may build roads or bridges.');
      }
      if (!player.hasCollectedIncomeThisTurn) {
        throw new Error('You must collect income before taking any other action this turn.');
      }
      if (player.resources.wood < ROAD_COST) {
        throw new Error(`Not enough wood to build a road or bridge.`);
      }

      const isAllowed = getLegalRoadPositions(state, player).some(
        (position) => position.x === action.position.x && position.y === action.position.y,
      );
      if (!isAllowed) {
        throw new Error('Roads and bridges must be adjacent to your buildings, your own units, or an existing road.');
      }

      player.resources.wood -= ROAD_COST;
      player.stats.resourcesSpent.wood += ROAD_COST;
      state.roads.push({ ...action.position });
      state.actionLog.push(
        `${player.name} built a ${state.terrain[action.position.y]?.[action.position.x] === 'lake' ? 'bridge' : 'road'} at ${action.position.x},${action.position.y}.`,
      );
      return state;
    }

    case 'foundSettlement': {
      const player = getPlayerById(state, action.playerId);
      const activePlayer = getActivePlayer(state);
      if (player.id !== activePlayer.id) {
        throw new Error('Only the active player may found a settlement.');
      }
      if (!player.hasCollectedIncomeThisTurn) {
        throw new Error('You must collect income before taking any other action this turn.');
      }

      const builder = getUnitById(state, action.unitId);
      const blockReason = settlementBlockReason(state, player, builder);
      if (blockReason) throw new Error(blockReason);

      for (const [key, amount] of Object.entries(SETTLEMENT_COST) as [keyof typeof SETTLEMENT_COST, number][]) {
        player.resources[key] -= amount;
        player.stats.resourcesSpent[key] += amount;
      }

      // The builder is spent: it becomes the settlement.
      state.units = state.units.filter((entry) => entry.id !== builder.id);
      state.bases.push({
        id: `settlement-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ownerId: player.id,
        kind: 'settlement',
        position: { ...builder.position },
        hp: SETTLEMENT_MAX_HP,
        maxHp: SETTLEMENT_MAX_HP,
      });
      player.stats.settlementsFounded += 1;
      state.actionLog.push(
        `🏘️ ${player.name}'s builder founded a settlement at ${builder.position.x},${builder.position.y} — new units can spawn here.`,
      );
      return state;
    }

    case 'buildTower': {
      const player = getPlayerById(state, action.playerId);
      const activePlayer = getActivePlayer(state);
      if (player.id !== activePlayer.id) {
        throw new Error('Only the active player may raise a tower.');
      }
      if (!player.hasCollectedIncomeThisTurn) {
        throw new Error('You must collect income before taking any other action this turn.');
      }

      const builder = getUnitById(state, action.unitId);
      const blockReason = towerBlockReason(state, player, builder);
      if (blockReason) throw new Error(blockReason);

      for (const [key, amount] of Object.entries(TOWER_COST) as [keyof typeof TOWER_COST, number][]) {
        player.resources[key] -= amount;
        player.stats.resourcesSpent[key] += amount;
      }

      // The builder survives — raising a tower just costs it the rest of its turn.
      builder.hasMovedThisTurn = true;
      builder.hasAttackedThisTurn = true;
      state.bases.push({
        id: `tower-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ownerId: player.id,
        kind: 'tower',
        position: { ...builder.position },
        hp: TOWER_MAX_HP,
        maxHp: TOWER_MAX_HP,
      });
      player.stats.towersBuilt += 1;
      state.actionLog.push(
        `🗼 ${player.name}'s builder raised a sentry tower at ${builder.position.x},${builder.position.y} — it fires on its own each turn.`,
      );
      return state;
    }

    case 'buildEconomy': {
      const player = getPlayerById(state, action.playerId);
      const activePlayer = getActivePlayer(state);
      if (player.id !== activePlayer.id) {
        throw new Error('Only the active player may build an economy building.');
      }
      if (!player.hasCollectedIncomeThisTurn) {
        throw new Error('You must collect income before taking any other action this turn.');
      }

      const builder = getUnitById(state, action.unitId);
      const blockReason = economyBlockReason(state, player, builder, action.produces);
      if (blockReason) throw new Error(blockReason);

      const label = economyLabelFor(action.produces);
      for (const [key, amount] of Object.entries(economyCostFor(action.produces)) as [ResourceKey, number][]) {
        player.resources[key] -= amount;
        player.stats.resourcesSpent[key] += amount;
      }

      // The builder survives — the job just costs it the rest of its turn.
      builder.hasMovedThisTurn = true;
      builder.hasAttackedThisTurn = true;
      const terrain = state.terrain[builder.position.y]?.[builder.position.x];
      const perTurn = economyYieldOn(action.produces, terrain);
      state.bases.push({
        id: `economy-${player.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ownerId: player.id,
        kind: 'economy',
        position: { ...builder.position },
        hp: ECONOMY_MAX_HP,
        maxHp: ECONOMY_MAX_HP,
        produces: action.produces,
      });
      player.stats.economyBuilt += 1;
      state.actionLog.push(
        `🌾 ${player.name}'s builder raised a ${label} at ${builder.position.x},${builder.position.y} — +${perTurn} ${action.produces} every turn.`,
      );
      return state;
    }

    case 'move': {
      const player = getPlayerById(state, action.playerId);
      const activePlayer = getActivePlayer(state);
      if (player.id !== activePlayer.id) {
        throw new Error('Only the active player may move units.');
      }
      const unit = getUnitById(state, action.unitId);
      if (unit.ownerId !== player.id) {
        throw new Error('Player may only move their own units.');
      }
      if (!player.hasCollectedIncomeThisTurn) {
        throw new Error('You must collect income before taking any other action this turn.');
      }
      if (unit.hasMovedThisTurn) {
        throw new Error('Unit already moved this turn.');
      }

      const reachable = getReachableTiles(state, unit);
      const isReachable = reachable.some(
        (position) => position.x === action.to.x && position.y === action.to.y,
      );
      if (!isReachable) {
        throw new Error(`Unit ${unit.id} cannot reach that destination.`);
      }

      unit.position = { ...action.to };
      unit.hasMovedThisTurn = true;
      state.actionLog.push(`${player.name}'s ${unit.type} moved to ${action.to.x},${action.to.y}.`);
      if (unit.type === 'hero') {
        applyHeroArrivalSplash(state, player, unit);
      }
      return state;
    }

    case 'attack': {
      const player = getPlayerById(state, action.playerId);
      const activePlayer = getActivePlayer(state);
      if (player.id !== activePlayer.id) {
        throw new Error('Only the active player may attack.');
      }

      const attacker = getUnitById(state, action.unitId);
      if (attacker.ownerId !== player.id) {
        throw new Error('Players can only attack with their own units.');
      }
      if (!player.hasCollectedIncomeThisTurn) {
        throw new Error('You must collect income before taking any other action this turn.');
      }
      if (!canUnitAttack(state, attacker)) {
        throw new Error('Unit cannot attack right now.');
      }

      let targetBase: Base | undefined;
      let targetUnit: Unit | undefined;
      if (action.targetBaseId) {
        targetBase = getBaseById(state, action.targetBaseId);
      }
      if (action.targetUnitId) {
        targetUnit = getUnitById(state, action.targetUnitId);
      }

      if (!targetUnit && !targetBase) throw new Error('No valid attack target.');
      if (targetBase && targetBase.ownerId === attacker.ownerId) {
        throw new Error('Cannot attack your own base.');
      }
      if (targetUnit && targetUnit.ownerId === attacker.ownerId) {
        throw new Error('Cannot attack your own unit.');
      }

      const targetPosition = targetUnit ? targetUnit.position : targetBase!.position;
      const range = chebyshevDistance(attacker.position, targetPosition);
      if (range > attacker.attackRange) {
        throw new Error('Target is out of attack range.');
      }
      if (!hasLineOfSight(state, attacker.position, targetPosition)) {
        throw new Error('Target is not in line of sight.');
      }

      attacker.hasAttackedThisTurn = true;

      const areaRadius = attacker.areaRadius ?? UNIT_DEFS[attacker.type].areaRadius;
      const areaDamage = attacker.areaDamage ?? UNIT_DEFS[attacker.type].areaDamage;
      if (targetUnit) {
        const areaTargets =
          areaRadius && areaRadius > 0
            ? state.units.filter(
                (unit) =>
                  unit.ownerId !== player.id &&
                  chebyshevDistance(unit.position, targetPosition) <= areaRadius &&
                  hasLineOfSight(state, attacker.position, unit.position),
              )
            : [targetUnit];
        const destroyedIds = new Set<string>();

        for (const target of areaTargets) {
          const damage = target.id === targetUnit.id ? attacker.attack : areaDamage ?? attacker.attack;
          target.hp -= damage;
          const targetOwner = getPlayerById(state, target.ownerId);
          state.actionLog.push(
            `${player.name}'s ${attacker.type} hit ${targetOwner.name}'s ${target.type} for ${damage}${target.id === targetUnit.id ? '.' : ' (area attack).'}`,
          );
          if (target.hp <= 0) {
            destroyedIds.add(target.id);
            player.stats.unitsKilled += 1;
            targetOwner.stats.unitsLost += 1;
            state.actionLog.push(`${targetOwner.name}'s ${target.type} was destroyed.`);
          }
        }
        if (destroyedIds.size > 0) {
          state.units = state.units.filter((unit) => !destroyedIds.has(unit.id));
        }
        return state;
      }

      if (targetBase) {
        targetBase.hp -= attacker.attack;
        const structureLabel = buildingLabel(targetBase);
        state.actionLog.push(`${player.name}'s ${attacker.type} hit the ${structureLabel} for ${attacker.attack}.`);
        if (targetBase.hp <= 0) {
          const defender = getPlayerById(state, targetBase.ownerId);
          player.stats.buildingsRazed += 1;
          state.bases = state.bases.filter((base) => base.id !== targetBase.id);

          // Only the main base is a loss condition. Razing anything else just
          // costs the defender that building: a forward spawn point, their
          // covering fire, or a slice of their income.
          if (targetBase.kind !== 'base') {
            state.actionLog.push(`🔥 ${defender.name}'s ${structureLabel} was destroyed.`);
            return state;
          }

          defender.alive = false;
          defender.eliminatedOnTurn = state.turn;
          // A defeated player loses every building they still held.
          state.bases = state.bases.filter((base) => base.ownerId !== defender.id);
          const capturedUnits = state.units.filter((unit) => unit.ownerId === defender.id);
          for (const unit of capturedUnits) {
            unit.ownerId = player.id;
            // Captured units are exhausted for the remainder of this turn (DESIGN.md section 8).
            unit.hasMovedThisTurn = true;
            unit.hasAttackedThisTurn = true;
            unit.turnStartPosition = { ...unit.position };
          }
          state.actionLog.push(`${defender.name}'s base was destroyed and their remaining units were captured.`);
        }
      }

      return state;
    }

    case 'endTurn': {
      if (action.playerId !== getActivePlayer(state).id) {
        throw new Error('Only the active player may end the turn.');
      }
      const player = getActivePlayer(state);
      if (!player.hasCollectedIncomeThisTurn) {
        throw new Error('You must collect income before ending your turn.');
      }
      checkResourceNodeCaptures(state, player);
      return advanceTurn(state);
    }

    default:
      throw new Error(`Unsupported action: ${(action as { type: string }).type}`);
  }
}

export function canBuildAtPosition(state: GameState, player: Player, position: Position): boolean {
  return getLegalBuildPositions(state, player).some(
    (candidate) => candidate.x === position.x && candidate.y === position.y,
  );
}

export function fromUnitPosition(state: GameState, target: Position): Position[] {
  return findPath(state, getUnitById(state, state.units[0]?.id ?? 'missing'), target);
}
