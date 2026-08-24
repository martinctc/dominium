export type ResourceKey = 'food' | 'wood' | 'stone';
export type TerrainType = 'plain' | 'lake' | 'mountain' | 'hills' | 'forest';
export type UnitType = 'footsoldier' | 'cavalry' | 'cannon' | 'archer' | 'builder' | 'hero';
export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow';
/** Preset map generation styles (DESIGN.md "themed maps"). */
export type MapTheme = 'random' | 'river' | 'hills' | 'oasis';

export interface Position {
  x: number;
  y: number;
}

export interface PlayerStats {
  unitsBuilt: number;
  unitsLost: number;
  unitsKilled: number;
  buildingsRazed: number;
  nodesCaptured: number;
  settlementsFounded: number;
  towersBuilt: number;
  economyBuilt: number;
  /** Every resource that has ever entered this player's stockpile. */
  incomeCollected: Record<ResourceKey, number>;
  /** Every resource that has ever left it, on units, roads and settlements. */
  resourcesSpent: Record<ResourceKey, number>;
}

export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  baseId: string;
  alive: boolean;
  /** Turn on which the player's main base was destroyed, or null while active. */
  eliminatedOnTurn: number | null;
  resources: Record<ResourceKey, number>;
  hasCollectedIncomeThisTurn: boolean;
  homeZone: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  stats: PlayerStats;
}

/** Snapshot of a single player's population/economy at the end of one of their turns. */
export interface TimelineEntry {
  turn: number;
  playerId: string;
  unitCount: number;
  totalResources: number;
}

/**
 * A player's buildings.
 *
 * - 'base': the loss condition. Spawns units and heals nearby friendlies.
 * - 'settlement': an expendable forward outpost founded by a builder. Spawns
 *   and heals like a base, but losing it does not lose the game.
 * - 'tower': a sentry tower, also built by a builder. Purely military — it
 *   shoots on its own each turn but never spawns, heals or anchors roads.
 * - 'economy': a farm, lumber camp or quarry. Yields `produces` every turn its
 *   owner collects income. Defenceless and never spawns or heals.
 */
export interface Base {
  id: string;
  ownerId: string;
  kind: 'base' | 'settlement' | 'tower' | 'economy';
  position: Position;
  hp: number;
  maxHp: number;
  /** Which resource this yields each turn. Only ever set for kind: 'economy'. */
  produces?: ResourceKey;
}

export interface Unit {
  id: string;
  ownerId: string;
  type: UnitType;
  position: Position;
  hp: number;
  maxHp: number;
  moveRange: number;
  attack: number;
  attackRange: number;
  /** Splash radius around the selected target, for area attackers such as heroes. */
  areaRadius?: number;
  /** Damage dealt to units caught in the splash, defaulting to the primary attack. */
  areaDamage?: number;
  hasMovedThisTurn: boolean;
  hasAttackedThisTurn: boolean;
  /** Snapshot of position at the start of this unit's owner's turn; used to detect
   * "stood still for a full turn" for resource-node capture. */
  turnStartPosition: Position;
}

export type ResourceNodeBonus = 'lumpSum' | 'ongoing';

export interface ResourceNode {
  id: string;
  position: Position;
  resource: ResourceKey;
  ownerId: string | null;
  /**
   * Fixed when the map is generated, so players can see what they are running
   * for: a 'lumpSum' node is a treasure chest that pays out once and is then
   * removed from the board; an 'ongoing' node is held territory that pays every
   * turn while occupied.
   */
  bonus: ResourceNodeBonus;
}

export interface GameState {
  width: number;
  height: number;
  turn: number;
  activePlayerIndex: number;
  players: Player[];
  terrain: TerrainType[][];
  bases: Base[];
  units: Unit[];
  actionLog: string[];
  resourceNodes: ResourceNode[];
  /** Tiles with a built road/bridge: +1 effective movement speed, and lets units cross lakes. */
  roads: Position[];
  /** Which preset map style generated this board's terrain, for display purposes. */
  mapTheme: MapTheme;
  /** 'setup': players are still placing their bases. 'playing': normal turn loop. */
  phase: 'setup' | 'playing';
  /** Index into players[] of whose turn it is to place a base during setup. */
  setupPlayerIndex: number;
  /** Turn-by-turn population/economy history, appended to at the end of each player's turn. */
  timeline: TimelineEntry[];
}

export interface PlaceBaseAction {
  type: 'placeBase';
  playerId: string;
  position: Position;
}

export interface BuildAction {
  type: 'build';
  playerId: string;
  unitType: UnitType;
  position: Position;
}

export interface MoveAction {
  type: 'move';
  playerId: string;
  unitId: string;
  to: Position;
}

export interface AttackAction {
  type: 'attack';
  playerId: string;
  unitId: string;
  targetUnitId?: string;
  targetBaseId?: string;
}

export interface IncomeAction {
  type: 'income';
  playerId: string;
  resource: ResourceKey;
}

export interface BuildRoadAction {
  type: 'buildRoad';
  playerId: string;
  position: Position;
}

/** Consumes a builder unit where it stands, turning that tile into a settlement. */
export interface FoundSettlementAction {
  type: 'foundSettlement';
  playerId: string;
  unitId: string;
}

/** Consumes a builder unit where it stands, raising a sentry tower on that tile. */
export interface BuildTowerAction {
  type: 'buildTower';
  playerId: string;
  unitId: string;
}

/** Raises the selected economy building where a builder stands. */
export interface BuildEconomyAction {
  type: 'buildEconomy';
  playerId: string;
  unitId: string;
  /** Which building to raise, named by the resource it will yield. */
  produces: ResourceKey;
}

export interface EndTurnAction {
  type: 'endTurn';
  playerId: string;
}
export type Action =
  | BuildAction
  | MoveAction
  | AttackAction
  | IncomeAction
  | EndTurnAction
  | PlaceBaseAction
  | BuildRoadAction
  | FoundSettlementAction
  | BuildTowerAction
  | BuildEconomyAction;
