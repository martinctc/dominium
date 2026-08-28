import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  applyAction,
  canBuildAtPosition,
  baseUpgradeBlockReason,
  BASE_COMMAND_MAX_LEVEL,
  BASE_COMMAND_UPGRADE_COSTS,
  canPlaceBaseAt,
  chebyshevDistance,
  createInitialState,
  getActivePlayer,
  getLegalBasePositions,
  getLegalBuildPositions,
  getLegalRoadPositions,
  ROAD_COST,
  SETTLEMENT_COST,
  SETTLEMENT_MAX_HP,
  TOWER_COST,
  TOWER_ATTACK,
  TOWER_ATTACK_RANGE,
  TOWER_MAX_HP,
  towerBlockReason,
  ECONOMY_TYPES,
  ECONOMY_MAX_HP,
  ECONOMY_YIELD_PER_TURN,
  ECONOMY_TERRAIN_BONUS,
  economyBlockReason,
  economyCostFor,
  economyLabelFor,
  economyYieldOn,
  MARKET_COST,
  MARKET_MAX_HP,
  MARKET_EXCHANGE_RATE,
  marketBlockReason,
  ECONOMY_RESEARCH_BONUS,
  RESEARCH_MAX_LEVEL,
  researchCostFor,
  researchBlockReason,
  LUMP_SUM_BONUS,
  ONGOING_BONUS_PER_TURN,
  settlementBlockReason,
  getPlayerById,
  getCommandRadius,
  isSuppliedByMainBase,
  getReachableTiles,
  getUnitById,
  getVisibleTilesForPlayer,
  hasLineOfSight,
  UNIT_DEFS,
  unitStatsForSkill,
  BASE_MAX_HP,
} from './engine/index.js';
import type {
  GameState,
  Position,
  SpecialSkill,
  StartingResourceLevel,
  UnitType,
  ResourceKey,
  MapTheme,
} from './engine/index.js';
import {
  ISO_TERRAIN_COMPONENTS,
  ISO_ECONOMY_COMPONENTS,
  IsoBase,
  IsoSettlement,
  IsoTower,
  IsoMarket,
  IsoChest,
  IsoBridge,
  ISO_RESOURCE_NODE_COMPONENTS,
} from './art/IsoStructures.js';
import { ISO_UNIT_COMPONENTS } from './art/IsoUnits.js';
import { runAiTurn, runAiBasePlacement } from './ai/index.js';
import type { AiDifficulty } from './ai/index.js';
import {
  UNIT_ICON_COMPONENTS,
  RESOURCE_ICON_COMPONENTS,
  TERRAIN_ICON_COMPONENTS,
  ECONOMY_ICON_COMPONENTS,
  BaseIcon,
  SettlementIcon,
  TowerIcon,
  MarketIcon,
  BridgeIcon,
  RoadIcon,
  CrossroadIcon,
  RoadBottomToRightIcon,
  FlagIcon,
  ChestIcon,
  MountainIcon,
  HillsIcon,
  ForestIcon,
  buildCursorDataUri,
} from './icons.js';
import type { TeamKey } from './icons.js';
import { grassTile, waterTile, DIRT_TILE } from './art/tiles.js';

const UNIT_TYPES: UnitType[] = ['footsoldier', 'cavalry', 'cannon', 'archer', 'builder', 'hero'];

const RESOURCE_ICONS = RESOURCE_ICON_COMPONENTS;

const UNIT_LABELS: Record<UnitType, string> = {
  footsoldier: 'Foot',
  cavalry: 'Cavalry',
  cannon: 'Cannon',
  archer: 'Archer',
  builder: 'Builder',
  hero: 'Hero',
};

const UNIT_ICONS = UNIT_ICON_COMPONENTS;

const TERRAIN_ICONS = TERRAIN_ICON_COMPONENTS;

// Sprites drawn inside a board tile all share one size so terrain, units and
// buildings stay visually consistent as the board scales.
const TILE_ART_SIZE = 34;
const ISO_MAX_TILE_WIDTH = 120;
const ISO_MIN_TILE_WIDTH = 40;

/**
 * Tracks the viewport so the isometric board can be sized to the space that is
 * actually free, rather than a fixed pixel budget that either wastes the screen
 * on a large monitor or overflows on a laptop.
 */
function useViewportSize() {
  const [size, setSize] = useState(() => ({
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

const PLAYER_BADGE_COLORS: Record<string, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
};

interface LogLine {
  key: string;
  text: string;
  /** Turn number this line belongs to, or null for pre-game setup lines. */
  turn: number | null;
  /** Colour of the player the line is about, if it names one. */
  color: string | null;
  /** True for the "Turn N: X to act." separator lines. */
  isTurnHeader: boolean;
}

/**
 * Turns the engine's flat string log into grouped, attributable lines.
 * The engine deliberately stores plain sentences, so the presentation layer
 * does the parsing rather than the rules layer carrying display metadata.
 */
function parseActionLog(
  entries: string[],
  players: { name: string; color: string }[],
): LogLine[] {
  let currentTurn: number | null = null;
  return entries.map((text, index) => {
    const turnMatch = /^Turn (\d+):/.exec(text);
    if (turnMatch) currentTurn = Number(turnMatch[1]);
    const owner = players.find((player) => text.includes(player.name));
    return {
      key: `${index}-${text}`,
      text,
      turn: currentTurn,
      color: owner ? PLAYER_BADGE_COLORS[owner.color] ?? null : null,
      isTurnHeader: Boolean(turnMatch),
    };
  });
}

const SPECIAL_SKILL_INFO: Record<SpecialSkill, { label: string; description: string }> = {
  medicTroops: {
    label: 'Medic troops',
    description: 'Foot soldiers heal adjacent friendly units for 1 HP at the start of your turns.',
  },
  archerCavalry: {
    label: 'Archer cavalry',
    description: 'Cavalry attack at range 3, matching archers.',
  },
  builderTroops: {
    label: 'Builder troops',
    description: 'Builders gain footsoldier attack stats: 3 attack at range 1.',
  },
};

function unitTooltip(unitType: UnitType, specialSkill?: SpecialSkill): string {
  const def = unitStatsForSkill(unitType, specialSkill);
  const costText = (Object.entries(def.cost) as [ResourceKey, number][])
    .filter(([, amount]) => amount > 0)
    .map(([resource, amount]) => `${amount} ${resource}`)
    .join(', ');
  const combatLine =
    def.attack === 0
      ? 'Cannot attack. Spend it to found a settlement.'
      : def.areaRadius
        ? `Area attack: ${def.attack} damage to the target and ${def.areaDamage} damage to enemy units within ${def.areaRadius} tile.`
      : def.canMoveThenAttack
        ? 'Can move and attack in the same turn.'
        : 'Must choose to move OR attack.';
  return [
    `${unitType[0].toUpperCase()}${unitType.slice(1)}`,
    `HP: ${def.maxHp}  Attack: ${def.attack}  Range: ${def.attackRange}  Move: ${def.moveRange}`,
    `Cost: ${costText}`,
    combatLine,
  ].join('\n');
}

/** Human-readable "3 wood, 2 stone" for a resource cost map. */
function costSummary(cost: Record<ResourceKey, number>): string {
  return (Object.entries(cost) as [ResourceKey, number][])
    .filter(([, amount]) => amount > 0)
    .map(([resource, amount]) => `${amount} ${resource}`)
    .join(', ');
}

const EXCHANGE_RESOURCE_KEYS: ResourceKey[] = ['food', 'wood', 'stone'];

/**
 * The market's resource-exchange panel. Always visible once the active player
 * has a market, independent of what unit or tile is currently selected — it is
 * a standing economic action, not something tied to a builder's turn.
 */
function MarketExchangePanel({
  resources,
  research,
  researchBlocked,
  disabled,
  onExchange,
  onResearch,
}: {
  resources: Record<ResourceKey, number>;
  research: Record<ResourceKey, number>;
  researchBlocked: Record<ResourceKey, string | null>;
  disabled: boolean;
  onExchange: (from: ResourceKey, to: ResourceKey, amount: number) => void;
  onResearch: (resource: ResourceKey) => void;
}) {
  const [from, setFrom] = useState<ResourceKey>('food');
  const [to, setTo] = useState<ResourceKey>('wood');
  const [amount, setAmount] = useState(1);
  const cost = amount * MARKET_EXCHANGE_RATE;
  const canAfford = resources[from] >= cost && from !== to && amount > 0;

  return (
    <div className="market-panel">
      <span className="market-panel-title">
        <MarketIcon size={16} /> Market exchange ({MARKET_EXCHANGE_RATE}:1)
      </span>
      <div className="market-panel-row">
        <select
          value={from}
          onChange={(event) => {
            const next = event.target.value as ResourceKey;
            setFrom(next);
            if (next === to) setTo(EXCHANGE_RESOURCE_KEYS.find((key) => key !== next) ?? to);
          }}
          disabled={disabled}
        >
          {EXCHANGE_RESOURCE_KEYS.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
        <span aria-hidden="true">→</span>
        <select
          value={to}
          onChange={(event) => setTo(event.target.value as ResourceKey)}
          disabled={disabled}
        >
          {EXCHANGE_RESOURCE_KEYS.filter((key) => key !== from).map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(event) => setAmount(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
          disabled={disabled}
        />
        <button
          onClick={() => onExchange(from, to, amount)}
          disabled={disabled || !canAfford}
          title={
            !canAfford
              ? `Not enough ${from} — need ${cost}.`
              : `Spend ${cost} ${from} for ${amount} ${to}.`
          }
        >
          Exchange
        </button>
      </div>
      <span className="road-cost">Costs {cost} {from} for {amount} {to}.</span>

      <span className="market-panel-title market-research-title">
        🔬 Yield research
      </span>
      <p className="hint">
        Each level permanently adds +{ECONOMY_RESEARCH_BONUS} per turn to every one of your
        buildings producing that resource.
      </p>
      <div className="market-research-list">
        {EXCHANGE_RESOURCE_KEYS.map((resource) => {
          const level = research[resource];
          const maxed = level >= RESEARCH_MAX_LEVEL;
          const blocked = researchBlocked[resource];
          const nextCost = researchCostFor(resource, level + 1);
          return (
            <button
              key={resource}
              className="market-research-button"
              onClick={() => onResearch(resource)}
              disabled={disabled || Boolean(blocked)}
              title={
                blocked ??
                `Spend ${costSummary(nextCost)} to raise ${resource} yield to level ${level + 1}.`
              }
            >
              <span className="market-research-label">
                {economyLabelFor(resource)}
                <span className="market-research-level">
                  {'★'.repeat(level)}
                  {'☆'.repeat(RESEARCH_MAX_LEVEL - level)}
                </span>
              </span>
              <span className="road-cost">
                {maxed ? 'Fully researched' : costSummary(nextCost)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface GameSettings {
  playerCount: number;
  boardSize: number;
  nodeCount: number;
  difficulty: AiDifficulty;
  aiEnabled: boolean;
  mapTheme: MapTheme;
  artStyle: 'classic' | 'isometric';
  specialSkill: SpecialSkill;
  startingResources: StartingResourceLevel;
  fogOfWar: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  playerCount: 2,
  boardSize: 10,
  nodeCount: 5,
  difficulty: 'normal',
  aiEnabled: true,
  mapTheme: 'random',
  artStyle: 'classic',
  specialSkill: 'medicTroops',
  startingResources: 'normal',
  fogOfWar: true,
};

const MAP_THEME_DESCRIPTIONS: Record<MapTheme, string> = {
  random: 'Scattered lakes and mountains, generated fresh each game.',
  river: 'A single wide river splits the map — build a bridge (1 wood) to cross it.',
  hills: 'Rolling hills slow everyone down; sparse mountains for cover.',
  oasis: 'Mostly open ground with a resource-rich pool at the center everyone wants.',
};

// Cheap integer hash purely for the decorative start-screen backdrop pattern —
// unrelated to the game's own board hash, just needs to look stable and varied.
function backdropHash(x: number, y: number): number {
  let h = Math.imul(x, 2654435761) + Math.imul(y, 40503);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return (h ^ (h >>> 13)) >>> 0;
}

/** A decorative mosaic of terrain tiles behind the settings card — purely visual, not real board state. */
function SettingsBackdrop() {
  const cols = 26;
  const rows = 16;
  const cells: ReactNode[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const roll = backdropHash(x, y) % 100;
      let background: string;
      let Overlay: typeof MountainIcon | null = null;
      if (roll < 8) {
        background = waterTile(x, y);
      } else {
        background = grassTile(x, y);
        if (roll < 14) Overlay = MountainIcon;
        else if (roll < 22) Overlay = HillsIcon;
        else if (roll < 32) Overlay = ForestIcon;
      }
      cells.push(
        <div key={`${x}-${y}`} className="backdrop-tile" style={{ backgroundImage: `url(${background})` }}>
          {Overlay && <Overlay size={22} />}
        </div>,
      );
    }
  }
  return (
    <div className="settings-backdrop" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {cells}
    </div>
  );
}

/**
 * A labelled range input for ordinal settings (player count, board size).
 * Sliders beat dropdowns here: the range is small and continuous, so the
 * player can feel the scale rather than opening a menu to read four options.
 */
function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="settings-row settings-slider-row">
      <div className="settings-slider-head">
        <span>{label}</span>
        <span className="settings-slider-value">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

/** A row of mutually exclusive buttons, for short categorical settings. */
function SegmentedRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="settings-row settings-segmented-row">
      <span>{label}</span>
      <div className="settings-segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === value ? 'selected' : ''}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Slider positions for the ordinal starting-resource levels. */
const STARTING_RESOURCE_ORDER: StartingResourceLevel[] = ['low', 'normal', 'high', 'deathmatch'];
const STARTING_RESOURCE_LABELS: Record<StartingResourceLevel, string> = {
  low: 'Low — 1 each',
  normal: 'Normal — 2 each',
  high: 'High — 4 each',
  deathmatch: 'Deathmatch — 10 each',
};

/** Describes how crowded the board feels at a given resource-node count. */
function nodeCountLabel(count: number): string {
  if (count <= 3) return `${count} — scarce`;
  if (count <= 6) return `${count} — standard`;
  if (count <= 9) return `${count} — plentiful`;
  return `${count} — abundant`;
}

const BOARD_SIZE_LABELS: Record<number, string> = {
  8: 'small',
  10: 'standard',
  12: 'large',
  14: 'huge',
};

function SettingsScreen({ onStart }: { onStart: (settings: GameSettings) => void }) {
  const [playerCount, setPlayerCount] = useState(DEFAULT_SETTINGS.playerCount);
  const [boardSize, setBoardSize] = useState(DEFAULT_SETTINGS.boardSize);
  const [nodeCount, setNodeCount] = useState(DEFAULT_SETTINGS.nodeCount);
  const [difficulty, setDifficulty] = useState<AiDifficulty>(DEFAULT_SETTINGS.difficulty);
  const [aiEnabled, setAiEnabled] = useState(DEFAULT_SETTINGS.aiEnabled);
  const [mapTheme, setMapTheme] = useState<MapTheme>(DEFAULT_SETTINGS.mapTheme);
  const [artStyle, setArtStyle] = useState<GameSettings['artStyle']>(DEFAULT_SETTINGS.artStyle);
  const [specialSkill, setSpecialSkill] = useState<SpecialSkill>(DEFAULT_SETTINGS.specialSkill);
  const [startingResources, setStartingResources] = useState<StartingResourceLevel>(
    DEFAULT_SETTINGS.startingResources,
  );
  const [fogOfWar, setFogOfWar] = useState(DEFAULT_SETTINGS.fogOfWar);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  return (
    <div className="settings-screen">
      <SettingsBackdrop />
      <div className="settings-card">
        <h1>Dominium</h1>
        <p className="hint">Set up your game, then place your bases on the board.</p>
        <button type="button" className="stats-toggle howtoplay-toggle" onClick={() => setShowHowToPlay(true)}>
          ❓ How to play
        </button>
        <a
          className="stats-toggle feedback-link"
          href="https://github.com/martinctc/dominium/issues/new/choose"
          target="_blank"
          rel="noreferrer"
        >
          🐞 Report a bug / feedback
        </a>

        <div className="settings-section">
          <h2 className="settings-section-title">Match</h2>
          <SliderRow
            label="Players"
            value={playerCount}
            min={2}
            max={4}
            display={`${playerCount} players`}
            onChange={setPlayerCount}
          />
          <SliderRow
            label="Starting resources"
            value={STARTING_RESOURCE_ORDER.indexOf(startingResources)}
            min={0}
            max={STARTING_RESOURCE_ORDER.length - 1}
            display={STARTING_RESOURCE_LABELS[startingResources]}
            onChange={(index) => setStartingResources(STARTING_RESOURCE_ORDER[index])}
          />
          <SegmentedRow
            label="Special skill"
            value={specialSkill}
            options={(Object.keys(SPECIAL_SKILL_INFO) as SpecialSkill[]).map((skill) => ({
              value: skill,
              label: SPECIAL_SKILL_INFO[skill].label,
            }))}
            onChange={setSpecialSkill}
          />
          <p className="hint theme-hint">{SPECIAL_SKILL_INFO[specialSkill].description}</p>
        </div>

        <div className="settings-section">
          <h2 className="settings-section-title">Map</h2>
          <SliderRow
            label="Map size"
            value={boardSize}
            min={8}
            max={14}
            step={2}
            display={`${boardSize} × ${boardSize} — ${BOARD_SIZE_LABELS[boardSize] ?? 'custom'}`}
            onChange={setBoardSize}
          />
          <SliderRow
            label="Resource nodes"
            value={nodeCount}
            min={3}
            max={12}
            display={nodeCountLabel(nodeCount)}
            onChange={setNodeCount}
          />
          <SegmentedRow
            label="Theme"
            value={mapTheme}
            options={[
              { value: 'random', label: 'Random' },
              { value: 'river', label: 'River' },
              { value: 'hills', label: 'Hills' },
              { value: 'oasis', label: 'Oasis' },
            ]}
            onChange={setMapTheme}
          />
          <p className="hint theme-hint">{MAP_THEME_DESCRIPTIONS[mapTheme]}</p>
          <label className="settings-row settings-toggle-row">
            <span>Fog of war</span>
            <input type="checkbox" checked={fogOfWar} onChange={(event) => setFogOfWar(event.target.checked)} />
          </label>
          <p className="hint theme-hint">
            {fogOfWar
              ? 'You only see tiles near your own units and buildings.'
              : 'The whole map is visible to everyone from the start.'}
          </p>
        </div>

        <div className="settings-section">
          <h2 className="settings-section-title">Opponents</h2>
          <label className="settings-row settings-toggle-row">
            <span>AI opponents</span>
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(event) => setAiEnabled(event.target.checked)}
            />
          </label>
          {aiEnabled ? (
            <SegmentedRow
              label="Difficulty"
              value={difficulty}
              options={[
                { value: 'easy', label: 'Easy' },
                { value: 'normal', label: 'Normal' },
                { value: 'hard', label: 'Hard' },
              ]}
              onChange={setDifficulty}
            />
          ) : (
            <p className="hint theme-hint">Every player takes their turn on this device (hot-seat).</p>
          )}
        </div>

        <div className="settings-section">
          <h2 className="settings-section-title">Presentation</h2>
          <SegmentedRow
            label="Art style"
            value={artStyle}
            options={[
              { value: 'classic', label: 'Classic pixel art' },
              { value: 'isometric', label: '2.5D view' },
            ]}
            onChange={setArtStyle}
          />
          <p className="hint theme-hint">
            {artStyle === 'isometric'
              ? 'Diamond tiles with depth and raised buildings and units.'
              : 'Flat top-down grid with 16×16 pixel sprites.'}
          </p>
        </div>

        <button
          className="primary"
          onClick={() =>
            onStart({
              playerCount,
              boardSize,
              nodeCount,
              difficulty,
              aiEnabled,
              mapTheme,
              artStyle,
              specialSkill,
              startingResources,
              fogOfWar,
            })
          }
        >
          Start game
        </button>
      </div>
      {showHowToPlay && <HowToPlayModal onClose={() => setShowHowToPlay(false)} />}
    </div>
  );
}

function sumResources(bucket: Record<ResourceKey, number>): number {
  return bucket.food + bucket.wood + bucket.stone;
}

function economyPoints(state: GameState, player: GameState['players'][number]): number {
  const buildings = state.bases.filter((base) => base.ownerId === player.id);
  const economyBuildings = buildings.filter((base) => base.kind === 'economy').length;
  const heldNodes = state.resourceNodes.filter((node) => node.ownerId === player.id).length;
  const researchLevels = sumResources(player.research);
  return sumResources(player.resources) + economyBuildings * 4 + heldNodes * 3 + researchLevels * 3;
}

function militaryPoints(state: GameState, player: GameState['players'][number]): number {
  const units = state.units.filter((unit) => unit.ownerId === player.id);
  const structures = state.bases.filter((base) => base.ownerId === player.id);
  const unitScore = units.reduce((total, unit) => total + unit.maxHp + unit.attack * 2 + unit.attackRange, 0);
  const buildingScore = structures.reduce((total, base) => (
    total + (base.kind === 'base' ? 10 : base.kind === 'tower' ? 8 : base.kind === 'settlement' ? 3 : 0)
  ), 0);
  return unitScore + buildingScore;
}

function StatsPanel({ state, onClose }: { state: GameState; onClose: () => void }) {
  const [statsPage, setStatsPage] = useState<'overview' | 'battle'>('overview');
  const maxTurn = state.timeline.reduce((max, entry) => Math.max(max, entry.turn), 0);
  const chartWidth = 320;
  const chartHeight = 120;
  const battleLog = state.actionLog.filter((entry) => /hit|shot|destroyed|area attack/i.test(entry));
  const rankedPlayers = [...state.players].sort((a, b) => {
    const totalDifference =
      economyPoints(state, b) + militaryPoints(state, b) - economyPoints(state, a) - militaryPoints(state, a);
    return totalDifference || a.name.localeCompare(b.name);
  });

  const toPoints = (values: Array<{ turn: number; value: number }>, maxValue: number) =>
    values
      .map(({ turn, value }) => {
        const x = maxTurn === 0 ? 0 : (turn / maxTurn) * chartWidth;
        const y = chartHeight - (value / maxValue) * chartHeight;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  return (
    <div className="stats-overlay" onClick={onClose}>
      <div className="stats-panel" onClick={(event) => event.stopPropagation()}>
        <div className="stats-panel-header">
          <h2>📊 Stats</h2>
          <button className="stats-close" onClick={onClose} aria-label="Close stats panel">✕</button>
        </div>
        <div className="stats-tabs" role="tablist" aria-label="Statistics pages">
          <button
            className={statsPage === 'overview' ? 'selected' : ''}
            onClick={() => setStatsPage('overview')}
            role="tab"
            aria-selected={statsPage === 'overview'}
          >
            Overview
          </button>
          <button
            className={statsPage === 'battle' ? 'selected' : ''}
            onClick={() => setStatsPage('battle')}
            role="tab"
            aria-selected={statsPage === 'battle'}
          >
            Battle report
          </button>
        </div>

        {statsPage === 'overview' ? (
          <>
          <table className="stats-table">
          <thead>
            <tr>
              <th>Player</th>
              <th title="Current resources, economy buildings, held nodes and research">Economy points</th>
              <th title="Living units and military buildings">Military points</th>
              <th>Total points</th>
              <th>Status</th>
              <th>Nodes captured</th>
              <th>Built 🏘️/🗼/🌾</th>
              <th>Collected food</th>
              <th>Collected wood</th>
              <th>Collected stone</th>
              <th>Spent food</th>
              <th>Spent wood</th>
              <th>Spent stone</th>
              <th>Total collected</th>
              <th>Total spent</th>
            </tr>
          </thead>
          <tbody>
            {rankedPlayers.map((player) => (
              <tr key={player.id}>
                <td>
                  <span className="stats-player-dot" style={{ background: PLAYER_BADGE_COLORS[player.color] }} />
                  {player.name}
                </td>
                <td>{economyPoints(state, player)}</td>
                <td>{militaryPoints(state, player)}</td>
                <td><strong>{economyPoints(state, player) + militaryPoints(state, player)}</strong></td>
                <td>{player.alive ? 'Active' : `Eliminated (turn ${player.eliminatedOnTurn ?? '?'})`}</td>
                <td>{player.stats.nodesCaptured}</td>
                <td>
                  {player.stats.settlementsFounded}/{player.stats.towersBuilt}/{player.stats.economyBuilt}
                </td>
                <td>
                  {player.stats.incomeCollected.food}
                </td>
                <td>
                  {player.stats.incomeCollected.wood}
                </td>
                <td>
                  {player.stats.incomeCollected.stone}
                </td>
                <td>
                  {player.stats.resourcesSpent.food}
                </td>
                <td>
                  {player.stats.resourcesSpent.wood}
                </td>
                <td>
                  {player.stats.resourcesSpent.stone}
                </td>
                <td>{sumResources(player.stats.incomeCollected)}</td>
                <td>{sumResources(player.stats.resourcesSpent)}</td>
              </tr>
            ))}
          </tbody>
          </table>
          <p className="hint">
            Players are ranked by total points. Economy points combine current resources, economy buildings,
            held nodes and research; military points combine living units and military buildings.
          </p>

          <h3>Population &amp; economy comparison</h3>
        {state.timeline.length === 0 ? (
          <p className="hint">No turns completed yet — end a turn to start recording the timeline.</p>
        ) : (
          <div className="stats-charts">
            {([
              { key: 'unitCount', label: 'Population (units)' },
              { key: 'totalResources', label: 'Economy (total resources)' },
            ] as const).map(({ key, label }) => {
              const maxValue = state.timeline.reduce((max, entry) => Math.max(max, entry[key]), 1);
              return (
                <div key={key} className="stats-chart-card">
                  <div className="stats-chart-title">{label}</div>
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="stats-chart-svg">
                    {state.players.map((player) => {
                      const entries = state.timeline
                        .filter((entry) => entry.playerId === player.id)
                        .sort((a, b) => a.turn - b.turn);
                      if (entries.length === 0) return null;
                      const points = toPoints(
                        entries.map((entry) => ({ turn: entry.turn, value: entry[key] })),
                        maxValue,
                      );
                      return (
                        <polyline
                          key={player.id}
                          points={points}
                          fill="none"
                          stroke={PLAYER_BADGE_COLORS[player.color]}
                          strokeWidth={2}
                        />
                      );
                    })}
                    {state.players.map((player) => {
                      if (player.eliminatedOnTurn === null) return null;
                      const x = maxTurn === 0 ? 0 : Math.min((player.eliminatedOnTurn / maxTurn) * chartWidth, chartWidth);
                      const color = PLAYER_BADGE_COLORS[player.color];
                      return (
                        <g key={`${player.id}-eliminated`} className="stats-elimination-marker" style={{ color }}>
                          <line x1={x} x2={x} y1={0} y2={chartHeight} stroke={color} />
                          <text x={x} y={14} textAnchor="middle" fill={color}>✕</text>
                        </g>
                      );
                    })}
                  </svg>
                  <div className="stats-chart-legend">
                    {state.players.map((player) => {
                      const lastEntry = [...state.timeline]
                        .filter((entry) => entry.playerId === player.id)
                        .sort((a, b) => b.turn - a.turn)[0];
                      return (
                        <span key={player.id}>
                          <span className="stats-legend-swatch" style={{ background: PLAYER_BADGE_COLORS[player.color] }} />
                          {player.name} ({lastEntry ? lastEntry[key] : 0})
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
          </>
        ) : (
          <>
            <h3>Battle report</h3>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Status</th>
                  <th>Units built</th>
                  <th>Units lost</th>
                  <th>Units killed</th>
                  <th>Buildings razed</th>
                </tr>
              </thead>
              <tbody>
                {state.players.map((player) => (
                  <tr key={player.id}>
                    <td>
                      <span className="stats-player-dot" style={{ background: PLAYER_BADGE_COLORS[player.color] }} />
                      {player.name}
                    </td>
                    <td>{player.alive ? 'Active' : `Eliminated on turn ${player.eliminatedOnTurn ?? '?'}`}</td>
                    <td>{player.stats.unitsBuilt}</td>
                    <td>{player.stats.unitsLost}</td>
                    <td>{player.stats.unitsKilled}</td>
                    <td>{player.stats.buildingsRazed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>Combat log</h3>
            {battleLog.length === 0 ? (
              <p className="hint">No combat has been recorded yet.</p>
            ) : (
              <div className="stats-battle-log">
                {battleLog.map((entry, index) => <div key={`${index}-${entry}`}>{entry}</div>)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function HowToPlayModal({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState<'basics' | 'units' | 'buildings' | 'terrain'>('basics');

  return (
    <div className="stats-overlay" onClick={onClose}>
      <div className="stats-panel howtoplay-panel" onClick={(event) => event.stopPropagation()}>
        <div className="stats-panel-header">
          <h2>❓ How to play</h2>
          <button className="stats-close" onClick={onClose} aria-label="Close how to play">✕</button>
        </div>
        <div className="stats-tabs" role="tablist" aria-label="How to play pages">
          {(['basics', 'units', 'buildings', 'terrain'] as const).map((tab) => (
            <button
              key={tab}
              className={page === tab ? 'selected' : ''}
              onClick={() => setPage(tab)}
              role="tab"
              aria-selected={page === tab}
            >
              {tab === 'basics' ? 'Basics' : tab === 'units' ? 'Units' : tab === 'buildings' ? 'Buildings' : 'Terrain & fog'}
            </button>
          ))}
        </div>

        {page === 'basics' && (
          <div className="howtoplay-body">
            <h3>Objective</h3>
            <p>
              Up to 4 players each defend a base on a shared grid. Destroy every other player's base to win —
              lose yours and you're eliminated. Last base standing wins.
            </p>
            <h3>Setup</h3>
            <p>
              Each player takes a turn picking a spot for their base before the game begins. Pick somewhere with
              room to expand and access to resource nodes — you can see your whole starting area from the outset,
              even though the rest of the map is hidden.
            </p>
            <h3>Each turn has 3 phases</h3>
            <ol className="howtoplay-list">
              <li><strong>1. Collect income</strong> — choose one resource (food, wood or stone) to gain this turn, plus
                any guaranteed income from resource nodes and economy buildings you already control.</li>
              <li><strong>2. Build</strong> — spend resources on a new unit, or use a builder already on the board to
                found a settlement, raise a sentry tower, build an economy building, or lay a road/bridge.</li>
              <li><strong>3. Act</strong> — move and/or attack with each of your units (most units can do one or the
                other; cavalry and the hero can move then attack in the same turn).</li>
            </ol>
            <h3>Choose one special skill</h3>
            <ul className="howtoplay-list">
              {(Object.keys(SPECIAL_SKILL_INFO) as SpecialSkill[]).map((skill) => (
                <li key={skill}><strong>{SPECIAL_SKILL_INFO[skill].label}</strong> — {SPECIAL_SKILL_INFO[skill].description}</li>
              ))}
            </ul>
            <h3>Winning and losing</h3>
            <p>
              Losing your <strong>main base</strong> normally eliminates you, but your closest surviving settlement
              becomes the new base. Settlements and other buildings can be destroyed without eliminating you, but
              losing a settlement removes it as a spawn point. Buildings connected by road back to your base slowly
              self-repair each turn, and a nearby builder repairs the base by 1 HP per turn.
            </p>
          </div>
        )}

        {page === 'units' && (
          <div className="howtoplay-body">
            <p className="hint">All costs are paid on top of any resources you already have.</p>
            <table className="stats-table howtoplay-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>HP</th>
                  <th>Move</th>
                  <th>Attack</th>
                  <th>Range</th>
                  <th>Food</th>
                  <th>Wood</th>
                  <th>Stone</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {UNIT_TYPES.map((type) => {
                  const def = UNIT_DEFS[type];
                  const Icon = UNIT_ICONS[type];
                  const notes: string[] = [];
                  if (def.canMoveThenAttack) notes.push('Can move then attack in the same turn.');
                  if (def.areaDamage) notes.push(`Splash: hits enemy units and buildings within ${def.areaRadius} tile(s) for ${def.areaDamage} on arrival.`);
                  if (type === 'builder') notes.push('Normally no attack; Builder troops grants footsoldier attack stats.');
                  if (type === 'cavalry') notes.push('Archer cavalry grants range 3.');
                  return (
                    <tr key={type}>
                      <td className="howtoplay-unit-cell"><Icon size={22} /> {UNIT_LABELS[type]}</td>
                      <td>{def.maxHp}</td>
                      <td>{def.moveRange}</td>
                      <td>{def.attack || '—'}</td>
                      <td>{def.attackRange || '—'}</td>
                      <td>{def.cost.food}</td>
                      <td>{def.cost.wood}</td>
                      <td>{def.cost.stone}</td>
                      <td>{notes.join(' ') || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {page === 'buildings' && (
          <div className="howtoplay-body">
            <table className="stats-table howtoplay-table">
              <thead>
                <tr>
                  <th>Building</th>
                  <th>HP</th>
                  <th>Food</th>
                  <th>Wood</th>
                  <th>Stone</th>
                  <th>What it does</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="howtoplay-unit-cell"><BaseIcon size={22} /> Base</td>
                  <td>{BASE_MAX_HP}</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>
                    Your main base. Placed at setup. Destroying it eliminates that player. A nearby builder can
                    expand its command radius to level {BASE_COMMAND_MAX_LEVEL}, increasing spawning and healing reach.
                  </td>
                </tr>
                <tr>
                  <td className="howtoplay-unit-cell"><SettlementIcon size={22} /> Settlement</td>
                  <td>{SETTLEMENT_MAX_HP}</td>
                  <td>{SETTLEMENT_COST.food}</td>
                  <td>{SETTLEMENT_COST.wood}</td>
                  <td>{SETTLEMENT_COST.stone}</td>
                  <td>Founded by a builder, which is consumed in the process. Acts as an extra spot to build new units.</td>
                </tr>
                <tr>
                  <td className="howtoplay-unit-cell"><TowerIcon size={22} /> Sentry tower</td>
                  <td>{TOWER_MAX_HP}</td>
                  <td>{TOWER_COST.food}</td>
                  <td>{TOWER_COST.wood}</td>
                  <td>{TOWER_COST.stone}</td>
                  <td>Raised by a builder, who survives. Fires automatically every turn at any enemy within {TOWER_ATTACK_RANGE} tiles for {TOWER_ATTACK} damage.</td>
                </tr>
                {(['food', 'wood', 'stone'] as ResourceKey[]).map((resource) => {
                  const info = ECONOMY_TYPES[resource];
                  const Icon = ECONOMY_ICON_COMPONENTS[resource];
                  return (
                    <tr key={resource}>
                      <td className="howtoplay-unit-cell"><Icon size={22} /> {info.label[0].toUpperCase()}{info.label.slice(1)}</td>
                      <td>{ECONOMY_MAX_HP}</td>
                      <td>{info.cost.food}</td>
                      <td>{info.cost.wood}</td>
                      <td>{info.cost.stone}</td>
                      <td>
                        Raised by a builder, who survives. Yields {ECONOMY_YIELD_PER_TURN} {resource}/turn (+{ECONOMY_TERRAIN_BONUS} more
                        on {info.terrain} terrain) every income phase, no choice required.
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="howtoplay-unit-cell"><MarketIcon size={22} /> Market</td>
                  <td>{MARKET_MAX_HP}</td>
                  <td>{MARKET_COST.food}</td>
                  <td>{MARKET_COST.wood}</td>
                  <td>{MARKET_COST.stone}</td>
                  <td>
                    Raised by a builder, who survives. Only one at a time. Trade any resource for another at{' '}
                    {MARKET_EXCHANGE_RATE}:1, and buy yield research: each level permanently adds{' '}
                    +{ECONOMY_RESEARCH_BONUS}/turn to every one of your economy buildings producing that resource,
                    up to level {RESEARCH_MAX_LEVEL}. Research is kept even if the market is destroyed.
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="hint">Settlements, towers and economy buildings can't be placed right next to another of the same kind.</p>
          </div>
        )}

        {page === 'terrain' && (
          <div className="howtoplay-body">
            <h3>Terrain</h3>
            <ul className="howtoplay-list">
              <li><strong>Mountains</strong> — impassable to every unit.</li>
              <li><strong>Lakes</strong> — impassable, unless a bridge has been built across ({ROAD_COST} wood).</li>
              <li><strong>Hills / forest</strong> — passable, but cost extra movement. Economy buildings placed on their
                matching terrain (forest for lumber camps, hills for quarries) yield extra resources.</li>
              <li><strong>Roads</strong> — built by a builder for {ROAD_COST} wood, they speed up movement, let connected buildings self-repair,
                and extend the main base's command radius to connected settlements.</li>
            </ul>
            <h3>Resource nodes</h3>
            <p>
              Scattered food/wood/stone deposits on the map. Move a unit onto an unclaimed node to capture it —
              some pay out a one-time lump sum ({LUMP_SUM_BONUS} resource), others pay a smaller amount every turn
              you hold them ({ONGOING_BONUS_PER_TURN}/turn).
            </p>
            <h3>Fog of war</h3>
            <p>
              Tiles you haven't explored are greyed out — you can't see terrain, units or buildings there. Your
              starting area is visible from the very first turn. Moving a unit near fogged tiles reveals them for
              as long as you keep a unit in range.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function VictoryOverlay({
  winner,
  onViewStats,
  onNewGame,
}: {
  winner: GameState['players'][number] | null | undefined;
  onViewStats: () => void;
  onNewGame: () => void;
}) {
  return (
    <div className="victory-overlay">
      <div
        className="victory-card"
        style={winner ? { borderColor: PLAYER_BADGE_COLORS[winner.color] } : undefined}
      >
        <div className="victory-confetti" aria-hidden="true">🎉🎊🏆🎊🎉</div>
        <h2 style={winner ? { color: PLAYER_BADGE_COLORS[winner.color] } : undefined}>
          {winner ? `${winner.name} wins!` : "It's a draw!"}
        </h2>
        <p className="hint">
          {winner ? `${winner.name} destroyed every other base on the board.` : 'No bases remain standing.'}
        </p>
        <div className="victory-actions">
          <button className="primary" onClick={onViewStats}>📊 Review stats</button>
          <button className="stats-toggle" onClick={onNewGame}>🔁 New game</button>
        </div>
      </div>
    </div>
  );
}

function GameScreen({ settings, onRestart }: { settings: GameSettings; onRestart: () => void }) {
  const [state, setState] = useState<GameState>(() => createInitialState({
    width: settings.boardSize,
    height: settings.boardSize,
    playerCount: settings.playerCount,
    nodeCount: settings.nodeCount,
    seed: `${Date.now()}`,
    theme: settings.mapTheme,
    specialSkill: settings.specialSkill,
    startingResources: settings.startingResources,
  }));
  const activePlayer = getActivePlayer(state);
  const isSetupPhase = state.phase === 'setup';
  const setupPlayer = isSetupPhase ? state.players[state.setupPlayerIndex] : null;
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedBuildType, setSelectedBuildType] = useState<UnitType>('footsoldier');
  const [buildRoadMode, setBuildRoadMode] = useState(false);
  const [selectedIncome, setSelectedIncome] = useState<ResourceKey | null>(null);
  const [phase, setPhase] = useState<'income' | 'build' | 'actions'>('income');
  const [aiEnabled, setAiEnabled] = useState(settings.aiEnabled);
  const [unitsBuiltThisTurn, setUnitsBuiltThisTurn] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [draggedUnitType, setDraggedUnitType] = useState<UnitType | null>(null);
  const [dismissedVictory, setDismissedVictory] = useState(false);

  // Every player after the human (player 0) is treated as AI-controlled when AI is enabled.
  const aiPlayerIds = new Set(state.players.slice(1).map((player) => player.id));
  const aliveCount = state.players.filter((player) => player.alive).length;
  const gameOver = !isSetupPhase && aliveCount <= 1;
  const winner = gameOver ? state.players.find((player) => player.alive) : null;
  const showVictoryOverlay = gameOver && !dismissedVictory && !showStats;
  const isAiTurn =
    !isSetupPhase && aiEnabled && aiPlayerIds.has(activePlayer.id) && !gameOver;
  const aiPlayer = aiEnabled && aiPlayerIds.has(activePlayer.id) ? activePlayer : null;
  const fogEnabled = settings.fogOfWar && state.players.length > 1;
  const humanViewerId = state.players[0]?.id;
  const [exploredTiles, setExploredTiles] = useState<Set<string>>(() =>
    fogEnabled && humanViewerId ? getVisibleTilesForPlayer(state, humanViewerId) : new Set(),
  );

  useEffect(() => {
    if (!fogEnabled || !humanViewerId) return;
    const visible = getVisibleTilesForPlayer(state, humanViewerId);
    setExploredTiles((previous) => {
      const next = new Set(previous);
      for (const tile of visible) next.add(tile);
      return next.size === previous.size ? previous : next;
    });
  }, [fogEnabled, humanViewerId, isSetupPhase, state]);

  // Clear the pending income selection whenever we leave the income phase or
  // the active player changes (new turn), so the picker always starts fresh.
  useEffect(() => {
    if (phase !== 'income') {
      setSelectedIncome(null);
    }
  }, [phase, activePlayer.id]);

  // Detect HP loss between renders (from any attack, human or AI) and briefly
  // flash the affected tile so combat feels more alive than a silent number change.
  // Also detect newly-captured resource nodes and flash those in gold.
  const [flashTiles, setFlashTiles] = useState<Record<string, 'damage' | 'capture' | 'heal' | 'income'>>({});
  const prevHpRef = useRef<Record<string, number>>({});
  const prevNodeOwnersRef = useRef<Record<string, { ownerId: string | null; key: string }> | null>(null);

  useEffect(() => {
    const currentHp: Record<string, number> = {};
    const damaged: string[] = [];
    const healed: string[] = [];

    for (const unit of state.units) {
      currentHp[unit.id] = unit.hp;
      const prev = prevHpRef.current[unit.id];
      if (prev !== undefined && unit.hp < prev) {
        damaged.push(`${unit.position.x},${unit.position.y}`);
      } else if (prev !== undefined && unit.hp > prev) {
        healed.push(`${unit.position.x},${unit.position.y}`);
      }
    }
    for (const base of state.bases) {
      currentHp[base.id] = base.hp;
      const prev = prevHpRef.current[base.id];
      if (prev !== undefined && base.hp < prev) {
        damaged.push(`${base.position.x},${base.position.y}`);
      }
    }

    // A node flashes gold when it changes hands (ongoing/territory nodes) or when
    // it vanishes from the board entirely (a looted treasure chest). Chests are
    // removed on capture, so we have to remember where they were.
    const currentNodes: Record<string, { ownerId: string | null; key: string }> = {};
    const captured: string[] = [];
    for (const node of state.resourceNodes) {
      const key = `${node.position.x},${node.position.y}`;
      currentNodes[node.id] = { ownerId: node.ownerId, key };
      const prev = prevNodeOwnersRef.current?.[node.id];
      if (prev !== undefined && prev.ownerId !== node.ownerId) {
        captured.push(key);
      }
    }
    if (prevNodeOwnersRef.current) {
      for (const [id, prev] of Object.entries(prevNodeOwnersRef.current)) {
        if (!(id in currentNodes)) captured.push(prev.key);
      }
    }

    const damageKeys = new Set(damaged);
    const healKeys = new Set(healed);
    const captureKeys = new Set(captured);
    if (damageKeys.size > 0 || healKeys.size > 0 || captureKeys.size > 0) {
      setFlashTiles((existing) => {
        const next = { ...existing };
        for (const key of damageKeys) next[key] = 'damage';
        for (const key of healKeys) next[key] = 'heal';
        for (const key of captureKeys) next[key] = 'capture';
        return next;
      });
      const timeout = setTimeout(() => {
        setFlashTiles((existing) => {
          const next = { ...existing };
          for (const key of damageKeys) delete next[key];
          for (const key of healKeys) delete next[key];
          for (const key of captureKeys) delete next[key];
          return next;
        });
      }, 700);
      prevHpRef.current = currentHp;
      prevNodeOwnersRef.current = currentNodes;
      return () => clearTimeout(timeout);
    }

    prevHpRef.current = currentHp;
    prevNodeOwnersRef.current = currentNodes;
  }, [state]);

  useEffect(() => {
    if (!isAiTurn || !aiPlayer) return;
    const timeout = setTimeout(() => {
      const next = runAiTurn(state, aiPlayer.id, settings.difficulty);
      setState({ ...next });
      setPhase('income');
      setSelectedUnitId(null);
    }, 500);
    return () => clearTimeout(timeout);
  }, [state, isAiTurn, aiPlayer, settings.difficulty]);

  const isAiSetupTurn = isSetupPhase && aiEnabled && !!setupPlayer && aiPlayerIds.has(setupPlayer.id);
  useEffect(() => {
    if (!isAiSetupTurn || !setupPlayer) return;
    const timeout = setTimeout(() => {
      const next = runAiBasePlacement(state, setupPlayer.id);
      setState({ ...next });
    }, 500);
    return () => clearTimeout(timeout);
  }, [state, isAiSetupTurn, setupPlayer]);

  const selectedUnit = selectedUnitId ? getUnitById(state, selectedUnitId) : null;
  const reachableTiles = selectedUnit ? getReachableTiles(state, selectedUnit) : [];
  const attackRangeTiles = selectedUnit
    ? Array.from({ length: state.height }, (_, y) =>
        Array.from({ length: state.width }, (_, x) => ({ x, y })),
      )
        .flat()
        .filter(
          (position) =>
            selectedUnit.attackRange > 0 &&
            (position.x !== selectedUnit.position.x || position.y !== selectedUnit.position.y) &&
            chebyshevDistance(selectedUnit.position, position) <= selectedUnit.attackRange &&
            hasLineOfSight(state, selectedUnit.position, position),
        )
    : [];
  const reachableTileKeys = new Set(reachableTiles.map((tile) => `${tile.x}:${tile.y}`));
  const attackRangeTileKeys = new Set(attackRangeTiles.map((tile) => `${tile.x}:${tile.y}`));
  const legalBuildPositions =
    !isSetupPhase && phase === 'build'
      ? getLegalBuildPositions(state, getPlayerById(state, activePlayer.id))
      : [];
  const legalRoadPositions =
    !isSetupPhase && phase === 'build'
      ? getLegalRoadPositions(state, getPlayerById(state, activePlayer.id))
      : [];
  const legalBasePositions = isSetupPhase ? getLegalBasePositions(state) : [];

  // Can the active player still spend anything this build phase? Used to warn
  // *before* the click rather than interrupting with a modal after it — saving
  // resources on purpose is a legitimate strategy and shouldn't be nagged.
  const affordableUnitTypes = UNIT_TYPES.filter((unitType) => {
    const cost = UNIT_DEFS[unitType].cost;
    return (Object.keys(cost) as ResourceKey[]).every(
      (key) => getPlayerById(state, activePlayer.id).resources[key] >= cost[key],
    );
  });
  const canStillBuild =
    !isSetupPhase &&
    phase === 'build' &&
    ((legalBuildPositions.length > 0 && affordableUnitTypes.length > 0) ||
      (legalRoadPositions.length > 0 &&
        getPlayerById(state, activePlayer.id).resources.wood >= ROAD_COST));
  const skippingBuild = phase === 'build' && unitsBuiltThisTurn === 0 && canStillBuild;

  const isUnitExhausted = (unit: { type: UnitType; hasMovedThisTurn: boolean; hasAttackedThisTurn: boolean }) => {
    const def = unitStatsForSkill(unit.type, activePlayer.specialSkill);
    const canStillMove = !unit.hasMovedThisTurn && (def.canMoveThenAttack || !unit.hasAttackedThisTurn);
    const canStillAttack = !unit.hasAttackedThisTurn && (def.canMoveThenAttack || !unit.hasMovedThisTurn);
    return !canStillMove && !canStillAttack;
  };

  const activePlayerUnits = state.units.filter((unit) => unit.ownerId === activePlayer.id);
  const activePlayerRef = getPlayerById(state, activePlayer.id);
  // A builder that has already moved can still found a settlement, so it is not
  // "done" in the sense the end-of-turn prompt means.
  const hasPendingAction = (unit: (typeof activePlayerUnits)[number]) =>
    !isUnitExhausted(unit) ||
    (unit.type === 'builder' && settlementBlockReason(state, activePlayerRef, unit) === null);
  const allUnitsExhausted =
    !isSetupPhase &&
    phase === 'actions' &&
    activePlayerUnits.length > 0 &&
    !activePlayerUnits.some((unit) => hasPendingAction(unit));

  // Nodes the active player will claim when they end the turn: a unit of theirs
  // is parked on one they don't already own and hasn't acted. Surfacing this
  // makes "changing hands" visible instead of a surprise at end of turn.
  const capturingNodeKeys = new Set<string>();
  if (!isSetupPhase) {
    for (const unit of activePlayerUnits) {
      if (unit.hasMovedThisTurn || unit.hasAttackedThisTurn) continue;
      if (unit.position.x !== unit.turnStartPosition.x || unit.position.y !== unit.turnStartPosition.y) continue;
      const node = state.resourceNodes.find(
        (entry) => entry.position.x === unit.position.x && entry.position.y === unit.position.y,
      );
      if (!node || node.ownerId === activePlayer.id) continue;
      capturingNodeKeys.add(`${node.position.x},${node.position.y}`);
    }
  }

  const selectedBuilder =
    selectedUnit && selectedUnit.type === 'builder' && selectedUnit.ownerId === activePlayer.id
      ? selectedUnit
      : null;
  const settlementBlocked = selectedBuilder
    ? settlementBlockReason(state, activePlayerRef, selectedBuilder)
    : 'Select one of your builders first.';
  const towerBlocked = selectedBuilder
    ? towerBlockReason(state, activePlayerRef, selectedBuilder)
    : 'Select one of your builders first.';
  const marketBlocked = selectedBuilder
    ? marketBlockReason(state, activePlayerRef, selectedBuilder)
    : 'Select one of your builders first.';
  const baseUpgradeBlocked = !activePlayer.hasCollectedIncomeThisTurn
    ? 'Collect income before upgrading your main base.'
    : selectedBuilder
      ? baseUpgradeBlockReason(state, activePlayerRef, selectedBuilder)
      : 'Select one of your builders next to your main base.';
  const builderTerrain = selectedBuilder
    ? state.terrain[selectedBuilder.position.y]?.[selectedBuilder.position.x]
    : undefined;
  // One entry per building type, so the player picks the resource they actually
  // need. Terrain no longer gates the choice — it just doubles the yield.
  const economyChoices = (Object.keys(ECONOMY_TYPES) as ResourceKey[]).map((produces) => ({
    produces,
    label: economyLabelFor(produces),
    cost: economyCostFor(produces),
    perTurn: economyYieldOn(produces, builderTerrain, activePlayerRef.research[produces]),
    blocked: selectedBuilder
      ? economyBlockReason(state, activePlayerRef, selectedBuilder, produces)
      : 'Select one of your builders first.',
  }));

  // Whether the active player currently has a market standing, which unlocks
  // the resource-exchange panel regardless of what is selected right now.
  const hasMarket = state.bases.some(
    (entry) => entry.ownerId === activePlayer.id && entry.kind === 'market',
  );
  const activeMainBase = state.bases.find(
    (entry) => entry.ownerId === activePlayer.id && entry.kind === 'base',
  );
  const commandLevel = activeMainBase?.commandLevel ?? 1;
  const nextCommandCost = BASE_COMMAND_UPGRADE_COSTS[commandLevel + 1];

  // Per-resource reason the next research level is unavailable, or null when
  // it can be bought. Computed here so the market panel stays presentational.
  const researchBlocked = (Object.keys(ECONOMY_TYPES) as ResourceKey[]).reduce(
    (acc, resource) => {
      acc[resource] = researchBlockReason(state, activePlayerRef, resource);
      return acc;
    },
    {} as Record<ResourceKey, string | null>,
  );

  // When every builder job is blocked for the *same* reason ("already used its
  // turn", "standing on a resource node"), say it once above the buttons rather
  // than repeating the identical sentence under all five of them.
  const sharedBuilderBlock = (() => {
    if (!selectedBuilder) return null;
    const reasons = [
      baseUpgradeBlocked,
      settlementBlocked,
      towerBlocked,
      marketBlocked,
      ...economyChoices.map((choice) => choice.blocked),
    ];
    const first = reasons[0];
    return first && reasons.every((reason) => reason === first) ? first : null;
  })();
  // Full action log, grouped and colour-coded, kept scrolled to the newest
  // entry unless the player has deliberately scrolled back through history.
  const logLines = parseActionLog(state.actionLog, state.players);
  const visibleLogLines = fogEnabled
    ? logLines.filter((line) => !line.color || line.color === PLAYER_BADGE_COLORS[activePlayer.color])
    : logLines;
  const currentVisibleTiles = fogEnabled
    ? humanViewerId
      ? getVisibleTilesForPlayer(state, humanViewerId)
      : new Set<string>()
    : null;
  const recurringIncomeByPlayer = new Map(
    state.players.map((player) => {
      const income: Record<ResourceKey, number> = { food: 0, wood: 0, stone: 0 };
      for (const node of state.resourceNodes) {
        if (node.ownerId === player.id && node.bonus === 'ongoing') {
          income[node.resource] += ONGOING_BONUS_PER_TURN;
        }
      }
      for (const building of state.bases) {
        if (building.ownerId !== player.id || building.kind !== 'economy' || !building.produces) continue;
        const terrain = state.terrain[building.position.y]?.[building.position.x];
        income[building.produces] += economyYieldOn(
          building.produces,
          terrain,
          player.research[building.produces],
        );
      }
      return [player.id, income];
    }),
  );
  const logRef = useRef<HTMLDivElement | null>(null);
  const logStuckToBottomRef = useRef(true);
  useEffect(() => {
    const element = logRef.current;
    if (!element || !logStuckToBottomRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [state.actionLog.length]);
  const handleLogScroll = () => {
    const element = logRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    logStuckToBottomRef.current = distanceFromBottom < 24;
  };

  // Isometric geometry. Tile size shrinks as the board grows so the whole
  // diamond always fits the panel instead of overflowing into a scrollbar.
  const viewport = useViewportSize();
  const isIsometric = settings.artStyle === 'isometric';
  const isoSpan = state.width + state.height;
  // Fit the diamond to whatever is left after the sidebar and the header/player
  // card strips, constrained on both axes so it never spills into a scrollbar.
  const isoBudgetWidth = Math.max(360, viewport.width - 460);
  const isoBudgetHeight = Math.max(240, viewport.height - 360);
  const isoTileWidth = Math.max(
    ISO_MIN_TILE_WIDTH,
    Math.min(
      ISO_MAX_TILE_WIDTH,
      Math.floor(Math.min((2 * isoBudgetWidth) / isoSpan, (4 * isoBudgetHeight) / isoSpan)),
    ),
  );
  const isoTileHeight = Math.round(isoTileWidth / 2);
  const isoDepth = Math.max(6, Math.round(isoTileHeight * 0.3));
  const isoBoardWidth = (isoSpan * isoTileWidth) / 2;
  const isoBoardHeight = (isoSpan * isoTileHeight) / 2 + isoDepth;
  // Isometric art is sized as a fraction of the tile so pieces stay in
  // proportion as the board scales. Each piece's footprint diamond is exactly
  // its `size` wide, so these read directly as "fraction of a tile".
  const isoUnitSize = Math.round(isoTileWidth * 0.58);
  const isoBuildingSize = Math.round(isoTileWidth * 0.62);
  const isoTerrainSize = Math.round(isoTileWidth * 0.56);

  const boardCursor = (() => {
    if (isSetupPhase) {
      return buildCursorDataUri('base', (setupPlayer?.color ?? 'red') as TeamKey);
    }
    if (phase !== 'build' || isAiTurn || gameOver) return undefined;
    return buildRoadMode
      ? 'crosshair'
      : buildCursorDataUri(selectedBuildType, activePlayer.color as TeamKey);
  })();

  const handleBuildRoadAt = (position: Position) => {
    try {
      const next = applyAction(state, {
        type: 'buildRoad',
        playerId: activePlayer.id,
        position,
      });
      setState({ ...next });
    } catch (error) {
      alert((error as Error).message);
    }
  };

  const handleFoundSettlement = () => {
    if (!selectedBuilder) return;
    try {
      const next = applyAction(state, {
        type: 'foundSettlement',
        playerId: activePlayer.id,
        unitId: selectedBuilder.id,
      });
      setState({ ...next });
      setSelectedUnitId(null);
    } catch (error) {
      alert((error as Error).message);
    }
  };

  const handleBuildTower = () => {
    if (!selectedBuilder) return;
    try {
      const next = applyAction(state, {
        type: 'buildTower',
        playerId: activePlayer.id,
        unitId: selectedBuilder.id,
      });
      setState({ ...next });
      setSelectedUnitId(null);
    } catch (error) {
      alert((error as Error).message);
    }
  };

  const handleBuildEconomy = (produces: ResourceKey) => {
    if (!selectedBuilder) return;
    try {
      const next = applyAction(state, {
        type: 'buildEconomy',
        playerId: activePlayer.id,
        unitId: selectedBuilder.id,
        produces,
      });
      setState({ ...next });
      setSelectedUnitId(null);
    } catch (error) {
      alert((error as Error).message);
    }
  };

  const handleBuildMarket = () => {
    if (!selectedBuilder) return;
    try {
      const next = applyAction(state, {
        type: 'buildMarket',
        playerId: activePlayer.id,
        unitId: selectedBuilder.id,
      });
      setState({ ...next });
      setSelectedUnitId(null);
    } catch (error) {
      alert((error as Error).message);
    }
  };

  const handleUpgradeBase = () => {
    if (!selectedBuilder) return;
    try {
      const next = applyAction(state, {
        type: 'upgradeBase',
        playerId: activePlayer.id,
        unitId: selectedBuilder.id,
      });
      setState({ ...next });
    } catch (error) {
      alert((error as Error).message);
    }
  };

  const handleExchangeResources = (from: ResourceKey, to: ResourceKey, amount: number) => {
    try {
      const next = applyAction(state, {
        type: 'exchangeResources',
        playerId: activePlayer.id,
        from,
        to,
        amount,
      });
      setState({ ...next });
    } catch (error) {
      alert((error as Error).message);
    }
  };

  const handleResearchYield = (resource: ResourceKey) => {
    try {
      const next = applyAction(state, {
        type: 'researchYield',
        playerId: activePlayer.id,
        resource,
      });
      setState({ ...next });
    } catch (error) {
      alert((error as Error).message);
    }
  };

  const handleBuildAt = (position: Position, unitType: UnitType) => {
    const player = getPlayerById(state, activePlayer.id);
    const canBuildHere = canBuildAtPosition(state, player, position);
    if (!canBuildHere) {
      alert('Build must be adjacent to the base on a free, passable tile.');
      return;
    }

    try {
      const next = applyAction(state, {
        type: 'build',
        playerId: activePlayer.id,
        unitType,
        position,
      });
      setState({ ...next });
      setUnitsBuiltThisTurn((count) => count + 1);
    } catch (error) {
      alert((error as Error).message);
    }
  };

  const handleTileClick = (position: Position) => {
    if (isSetupPhase) {
      if (!setupPlayer) return;
      try {
        const next = applyAction(state, {
          type: 'placeBase',
          playerId: setupPlayer.id,
          position,
        });
        setState({ ...next });
      } catch (error) {
        alert((error as Error).message);
      }
      return;
    }

    if (isAiTurn || gameOver) return;
    if (phase === 'build') {
      if (buildRoadMode) {
        handleBuildRoadAt(position);
        return;
      }
      handleBuildAt(position, selectedBuildType);
      return;
    }

    if (phase === 'actions') {
      const unitOnTile = state.units.find(
        (unit) => unit.position.x === position.x && unit.position.y === position.y,
      );
      const baseOnTile = state.bases.find(
        (base) => base.position.x === position.x && base.position.y === position.y,
      );

      if (unitOnTile) {
        if (unitOnTile.ownerId === activePlayer.id) {
          setSelectedUnitId(unitOnTile.id);
          return;
        }

        if (selectedUnitId) {
          try {
            const next = applyAction(state, {
              type: 'attack',
              playerId: activePlayer.id,
              unitId: selectedUnitId,
              targetUnitId: unitOnTile.id,
            });
            setState({ ...next });
            setSelectedUnitId(null);
          } catch (error) {
            alert((error as Error).message);
          }
        }
        return;
      }

      if (baseOnTile && baseOnTile.ownerId !== activePlayer.id) {
        if (selectedUnitId) {
          try {
            const next = applyAction(state, {
              type: 'attack',
              playerId: activePlayer.id,
              unitId: selectedUnitId,
              targetBaseId: baseOnTile.id,
            });
            setState({ ...next });
            setSelectedUnitId(null);
          } catch (error) {
            alert((error as Error).message);
          }
        }
        return;
      }

      if (selectedUnitId) {
        try {
          const next = applyAction(state, {
            type: 'move',
            playerId: activePlayer.id,
            unitId: selectedUnitId,
            to: position,
          });
          setState({ ...next });
          setSelectedUnitId(null);
        } catch (error) {
          alert((error as Error).message);
        }
      }
    }
  };

  const handleNextPhase = () => {
    if (isAiTurn || gameOver) return;
    if (phase === 'income') {
      if (!selectedIncome) {
        alert('Pick a resource (food, wood, or stone) before confirming.');
        return;
      }
      try {
        const next = applyAction(state, {
          type: 'income',
          playerId: activePlayer.id,
          resource: selectedIncome,
        });
        // Highlight the nodes that just paid out, so passive income from a
        // captured node is visible on the board rather than buried in the log.
        const payingNodes = next.resourceNodes.filter(
          (node) => node.ownerId === activePlayer.id && node.bonus === 'ongoing',
        );
        if (payingNodes.length > 0) {
          const keys = payingNodes.map((node) => `${node.position.x},${node.position.y}`);
          setFlashTiles((existing) => {
            const updated = { ...existing };
            for (const key of keys) updated[key] = 'income';
            return updated;
          });
          setTimeout(() => {
            setFlashTiles((existing) => {
              const updated = { ...existing };
              for (const key of keys) delete updated[key];
              return updated;
            });
          }, 900);
        }
        setState({ ...next });
        setPhase('build');
        setUnitsBuiltThisTurn(0);
      } catch (error) {
        alert((error as Error).message);
      }
      return;
    }

    if (phase === 'build') {
      setBuildRoadMode(false);
      setPhase('actions');
      return;
    }

    setSelectedUnitId(null);
    try {
      const next = applyAction(state, { type: 'endTurn', playerId: activePlayer.id });
      setState({ ...next });
      setPhase('income');
    } catch (error) {
      alert((error as Error).message);
    }
  };

  const handleQuickIncome = (resource: ResourceKey) => {
    if (isAiTurn || gameOver) return;
    if (phase !== 'income' || activePlayer.hasCollectedIncomeThisTurn) return;
    setSelectedIncome(resource);
  };

  // Whose special skill the top bar advertises. During setup that is the player
  // currently placing a base; afterwards it is whoever is taking their turn, so
  // the pill always describes the units the player is about to command.
  const skillOnShow = (isSetupPhase ? setupPlayer : activePlayer)?.specialSkill ?? settings.specialSkill;

  return (
    <div className="app-shell">
      <header className="top-bar">
        <h1>Dominium <span className="map-theme-label" title={`Map theme: ${settings.mapTheme}`}>🗺️ {settings.mapTheme}</span></h1>
        <div className="turn-info">
          <button className="stats-toggle" onClick={() => setShowStats(true)}>📊 Stats</button>
          <button className="stats-toggle" onClick={() => setShowHowToPlay(true)}>❓ How to play</button>
          <a
            className="stats-toggle feedback-link"
            href="https://github.com/martinctc/dominium/issues/new/choose"
            target="_blank"
            rel="noreferrer"
          >
            🐞 Feedback
          </a>
          <button className="stats-toggle" onClick={onRestart}>🔁 New game</button>
          <label className="ai-toggle">
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(event) => setAiEnabled(event.target.checked)}
            />
            🤖 Players 2+ are AI ({settings.difficulty})
          </label>
          {!isSetupPhase && <span className="turn-pill">⏱️ Turn {state.turn}</span>}
          <span
            className="skill-pill"
            title={`${SPECIAL_SKILL_INFO[skillOnShow].label} — ${SPECIAL_SKILL_INFO[skillOnShow].description}`}
          >
            ✨ {SPECIAL_SKILL_INFO[skillOnShow].label}
          </span>
          <span className="phase-pill">
            {gameOver
              ? 'Game over'
              : isSetupPhase
                ? <span className="phase-pill-icon-label"><BaseIcon size={16} /> Placing bases</span>
                : isAiTurn
                  ? '🤖 AI is thinking…'
                  : phase === 'income'
                    ? '1. Collect income'
                    : phase === 'build'
                      ? '2. Build'
                      : '3. Act'}
          </span>
          <span
            className="active-player-pill"
            style={{
              background: PLAYER_BADGE_COLORS[
                (isSetupPhase ? setupPlayer?.color : activePlayer.color) ?? 'red'
              ],
            }}
          >
            {gameOver
              ? winner
                ? `${winner.name} wins!`
                : 'Draw'
              : isSetupPhase
                ? `${setupPlayer?.name}, place your base`
                : `${activePlayer.name}'s turn`}
          </span>
        </div>
      </header>

      <div className="main-row">
        <aside className="hud">
          {isSetupPhase && (
            <div className="setup-prompt">
              <strong className="phase-pill-icon-label"><BaseIcon size={16} /> Base placement</strong>
              <p className="hint">
                {setupPlayer?.name}, click a highlighted tile on the board to place your base.
                You can only build inside your own corner of the map.
              </p>
            </div>
          )}

          {!isSetupPhase && phase === 'income' && (
            <div className="income-prompt">
              <strong>Collect your income for this turn:</strong>
              <div className="income-buttons">
                {(Object.keys(RESOURCE_ICONS) as ResourceKey[]).map((resource) => {
                  const isChosen = selectedIncome === resource;
                  return (
                    <button
                      key={resource}
                      className={isChosen ? 'selected' : ''}
                      onClick={() => handleQuickIncome(resource)}
                    >
                      <span className="icon">{(() => { const Icon = isIsometric ? ISO_RESOURCE_NODE_COMPONENTS[resource] : RESOURCE_ICONS[resource]; return <Icon size={18} />; })()}</span>
                      {resource}
                      {isChosen && <span className="chosen-check">✓</span>}
                    </button>
                  );
                })}
              </div>
              {selectedIncome ? (
                <p className="income-confirmed-hint">
                  Selected: <strong>{selectedIncome}</strong>. Click a different resource to change it, or "Confirm income" to continue.
                </p>
              ) : (
                <p className="hint">Pick a resource to collect this turn.</p>
              )}
            </div>
          )}


          {phase === 'build' && (
            <div className="unit-picker">
              <strong>Choose what to build:</strong>
              <button
                className={`road-picker-button ${buildRoadMode ? 'selected' : ''}`}
                onClick={() => setBuildRoadMode((selected) => !selected)}
                disabled={isAiTurn || gameOver}
                title={`Build a road or bridge for ${ROAD_COST} wood. Roads speed movement and bridges cross lakes.`}
              >
                🛤️ Road / bridge <span className="road-cost">({ROAD_COST} wood)</span>
              </button>
              <div className="unit-picker-grid">
                {UNIT_TYPES.map((unitType) => {
                  const affordable = affordableUnitTypes.includes(unitType);
                  return (
                  <button
                    key={unitType}
                    className={`${selectedBuildType === unitType ? 'selected' : ''} ${affordable ? '' : 'unaffordable'}`}
                    disabled={isAiTurn || gameOver || !affordable}
                    onClick={() => {
                      setBuildRoadMode(false);
                      setSelectedBuildType(unitType);
                    }}
                    title={affordable ? unitTooltip(unitType, activePlayer.specialSkill) : `${unitTooltip(unitType, activePlayer.specialSkill)} — not enough resources`}
                    draggable={!isAiTurn && !gameOver && affordable}
                    onDragStart={(event) => {
                      setBuildRoadMode(false);
                      event.dataTransfer.setData('text/plain', unitType);
                      event.dataTransfer.effectAllowed = 'copy';
                      setSelectedBuildType(unitType);
                      setDraggedUnitType(unitType);
                    }}
                    onDragEnd={() => setDraggedUnitType(null)}
                  >
                    <span className="icon">{(() => { const Icon = isIsometric ? ISO_UNIT_COMPONENTS[unitType] : UNIT_ICONS[unitType]; return <Icon size={28} team={activePlayer.color as TeamKey} />; })()}</span>
                    <span className="unit-label">{UNIT_LABELS[unitType]}</span>
                  </button>
                  );
                })}
              </div>
              <p className="hint">
                {buildRoadMode
                  ? 'Click a highlighted tile next to your base or units to build a road or bridge.'
                  : 'Click, or drag a unit onto the board, to build it next to your base. Hover a unit for stats.'}
              </p>
              <p className={unitsBuiltThisTurn > 0 ? 'build-status build-status-done' : 'build-status'}>
                {unitsBuiltThisTurn > 0
                  ? `✅ ${unitsBuiltThisTurn} unit${unitsBuiltThisTurn > 1 ? 's' : ''} built this turn.`
                  : canStillBuild
                    ? `⚠️ Nothing built yet — you can still afford ${affordableUnitTypes.map((t) => UNIT_LABELS[t]).join(', ') || 'a road'}.`
                    : '💰 Nothing built yet — saving up. Nothing here is affordable.'}
              </p>
            </div>
          )}

          {phase === 'actions' && (
            <div className="action-hint">
              <strong>Move or attack with your units.</strong>
              <p className="hint">Click a unit to select it, then click a highlighted tile to move, or an enemy to attack.</p>
              {sharedBuilderBlock && <p className="hint settlement-blocked">{sharedBuilderBlock}</p>}
              <button
                className={`settlement-button ${baseUpgradeBlocked ? '' : 'ready'}`}
                onClick={handleUpgradeBase}
                disabled={Boolean(baseUpgradeBlocked) || isAiTurn || gameOver}
                title={
                  baseUpgradeBlocked ??
                  `Expand your base command radius to ${commandLevel + 1} for ${costSummary(nextCommandCost!)}. This increases spawning and healing reach.`
                }
              >
                <span className="icon"><BaseIcon size={20} team={activePlayer.color as TeamKey} /></span>
                <span className="settlement-button-text">
                  <span className="settlement-button-label">Expand base scope</span>
                  <span className="road-cost">
                    {commandLevel >= BASE_COMMAND_MAX_LEVEL ? 'Fully expanded' : `${costSummary(nextCommandCost!)} · level ${commandLevel + 1}`}
                  </span>
                </span>
              </button>
              {selectedBuilder && baseUpgradeBlocked && !sharedBuilderBlock && (
                <p className="hint settlement-blocked">{baseUpgradeBlocked}</p>
              )}
              <button
                className={`settlement-button ${settlementBlocked ? '' : 'ready'}`}
                onClick={handleFoundSettlement}
                disabled={Boolean(settlementBlocked) || isAiTurn || gameOver}
                title={
                  settlementBlocked ??
                  `Spend this builder plus ${costSummary(SETTLEMENT_COST)} to found a settlement here.`
                }
              >
                <span className="icon">{isIsometric ? <IsoSettlement size={20} team={activePlayer.color as TeamKey} /> : <SettlementIcon size={20} team={activePlayer.color as TeamKey} />}</span>
                <span className="settlement-button-text">
                  <span className="settlement-button-label">Found settlement</span>
                  <span className="road-cost">{costSummary(SETTLEMENT_COST)} + builder</span>
                </span>
              </button>
              {selectedBuilder && settlementBlocked && !sharedBuilderBlock && (
                <p className="hint settlement-blocked">{settlementBlocked}</p>
              )}
              <button
                className={`settlement-button ${towerBlocked ? '' : 'ready'}`}
                onClick={handleBuildTower}
                disabled={Boolean(towerBlocked) || isAiTurn || gameOver}
                title={
                  towerBlocked ??
                  `Build a sentry tower here for ${costSummary(TOWER_COST)}. It shoots the nearest enemy within ${TOWER_ATTACK_RANGE} tiles at the start of every one of your turns. The builder survives but its turn is used up.`
                }
              >
                <span className="icon">{isIsometric ? <IsoTower size={20} team={activePlayer.color as TeamKey} /> : <TowerIcon size={20} team={activePlayer.color as TeamKey} />}</span>
                <span className="settlement-button-text">
                  <span className="settlement-button-label">Raise sentry tower</span>
                  <span className="road-cost">{costSummary(TOWER_COST)}</span>
                </span>
              </button>
              {selectedBuilder && towerBlocked && !sharedBuilderBlock && (
                <p className="hint settlement-blocked">{towerBlocked}</p>
              )}
              {economyChoices.map((choice) => (
                <button
                  key={choice.produces}
                  className={`settlement-button ${choice.blocked ? '' : 'ready'}`}
                  onClick={() => handleBuildEconomy(choice.produces)}
                  disabled={Boolean(choice.blocked) || isAiTurn || gameOver}
                  title={
                    choice.blocked ??
                    `Build a ${choice.label} here for ${costSummary(choice.cost)}, earning +${choice.perTurn} ${choice.produces} every turn. The builder survives but its turn is used up.`
                  }
                >
                  <span className="icon">
                    {(() => {
                      const Icon = isIsometric ? ISO_ECONOMY_COMPONENTS[choice.produces] : ECONOMY_ICON_COMPONENTS[choice.produces];
                      return <Icon size={20} team={activePlayer.color as TeamKey} />;
                    })()}
                  </span>
                  <span className="settlement-button-text">
                    <span className="settlement-button-label">
                      Build {choice.label}
                      {choice.perTurn > ECONOMY_YIELD_PER_TURN && (
                        <span className="economy-bonus" title="Home terrain — double yield">
                          ×2
                        </span>
                      )}
                    </span>
                    <span className="road-cost">
                      {costSummary(choice.cost)} → +{choice.perTurn} {choice.produces}/turn
                    </span>
                  </span>
                </button>
              ))}
              {selectedBuilder && !sharedBuilderBlock && economyChoices.every((choice) => choice.blocked) && (
                <p className="hint settlement-blocked">{economyChoices[0].blocked}</p>
              )}
              <button
                className={`settlement-button ${marketBlocked ? '' : 'ready'}`}
                onClick={handleBuildMarket}
                disabled={Boolean(marketBlocked) || isAiTurn || gameOver}
                title={
                  marketBlocked ??
                  `Build a market here for ${costSummary(MARKET_COST)}. Lets you exchange resources at a ${MARKET_EXCHANGE_RATE}:1 ratio. Only one market may stand at a time. The builder survives but its turn is used up.`
                }
              >
                <span className="icon">{isIsometric ? <IsoMarket size={20} team={activePlayer.color as TeamKey} /> : <MarketIcon size={20} team={activePlayer.color as TeamKey} />}</span>
                <span className="settlement-button-text">
                  <span className="settlement-button-label">Build market</span>
                  <span className="road-cost">{costSummary(MARKET_COST)}</span>
                </span>
              </button>
              {selectedBuilder && marketBlocked && !sharedBuilderBlock && (
                <p className="hint settlement-blocked">{marketBlocked}</p>
              )}
              {hasMarket && (
                <MarketExchangePanel
                  resources={activePlayer.resources}
                  research={activePlayer.research}
                  researchBlocked={researchBlocked}
                  disabled={isAiTurn || gameOver || !activePlayer.hasCollectedIncomeThisTurn}
                  onExchange={handleExchangeResources}
                  onResearch={handleResearchYield}
                />
              )}
              {allUnitsExhausted && (
                <p className="build-status build-status-done">
                  ✅ All your units have acted this turn. Click "End turn" when ready.
                </p>
              )}
            </div>
          )}

          <button
            className={`primary turn-advance-button ${skippingBuild ? 'primary-warn' : ''}`}
            onClick={handleNextPhase}
            disabled={isSetupPhase || gameOver}
            title={
              skippingBuild
                ? 'You have not built anything this turn. That is fine if you are saving up — this will not ask again.'
                : undefined
            }
          >
            {phase === 'income'
              ? 'Confirm income'
              : phase === 'build'
                ? skippingBuild
                  ? 'Start actions without building'
                  : 'Start actions'
                : 'End turn'}
          </button>

          <div className="unit-reference">
            <strong>Unit guide</strong>
            <p className="hint">Hover an icon for stats, abilities and cost.</p>
            <div className="unit-reference-grid">
              {UNIT_TYPES.map((unitType) => {
                const Icon = isIsometric ? ISO_UNIT_COMPONENTS[unitType] : UNIT_ICONS[unitType];
                return (
                  <button
                    className="unit-reference-card"
                    key={unitType}
                    title={unitTooltip(unitType, activePlayer.specialSkill)}
                    aria-label={unitTooltip(unitType, activePlayer.specialSkill)}
                  >
                    <Icon size={30} team={activePlayer.color as TeamKey} />
                    <span>{UNIT_LABELS[unitType]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="builder-reference">
            <strong>Builder guide</strong>
            <p className="hint">Builders can raise these structures. They survive towers and economy buildings, but founding a settlement consumes them.</p>
            <div className="builder-guide-list">
              <div className="builder-guide-item">
                {isIsometric ? (
                  <IsoSettlement size={24} team={activePlayer.color as TeamKey} />
                ) : (
                  <SettlementIcon size={24} team={activePlayer.color as TeamKey} />
                )}
                <span><b>Settlement</b><small>{costSummary(SETTLEMENT_COST)} + builder · spawns units</small></span>
              </div>
              <div className="builder-guide-item">
                {isIsometric ? (
                  <IsoTower size={24} team={activePlayer.color as TeamKey} />
                ) : (
                  <TowerIcon size={24} team={activePlayer.color as TeamKey} />
                )}
                <span><b>Sentry tower</b><small>{costSummary(TOWER_COST)} · auto-attacks nearby enemies</small></span>
              </div>
              {(['food', 'wood', 'stone'] as ResourceKey[]).map((resource) => {
                const Icon = isIsometric ? ISO_ECONOMY_COMPONENTS[resource] : ECONOMY_ICON_COMPONENTS[resource];
                const definition = ECONOMY_TYPES[resource];
                return (
                  <div className="builder-guide-item" key={resource}>
                    <Icon size={24} team={activePlayer.color as TeamKey} />
                    <span><b>{definition.label}</b><small>{costSummary(definition.cost)} · +{ECONOMY_YIELD_PER_TURN}/turn</small></span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="log-panel">
            <div className="log-header">
              <strong>Action log</strong>
              <span className="log-count">{state.actionLog.length} entries</span>
            </div>
            <div className="log" ref={logRef} onScroll={handleLogScroll}>
              {visibleLogLines.map((line) =>
                line.isTurnHeader ? (
                  <div className="log-turn-header" key={line.key}>
                    <span className="log-turn-badge">Turn {line.turn}</span>
                    <span className="log-turn-who" style={line.color ? { color: line.color } : undefined}>
                      {line.text.replace(/^Turn \d+:\s*/, '')}
                    </span>
                  </div>
                ) : (
                  <div
                    className={`log-line ${line.color ? 'log-line-owned' : ''}`}
                    key={line.key}
                    style={line.color ? { borderLeftColor: line.color } : undefined}
                  >
                    {line.text}
                  </div>
                ),
              )}
            </div>
          </div>
        </aside>

        <div className="board-column">
          <main className="board-panel">
            {selectedUnit && (
              <div className="range-legend" aria-label="Selected unit ranges">
                <span><i className="range-swatch move" /> Move range</span>
                {selectedUnit.attackRange > 0 && <span><i className="range-swatch attack" /> Attack range</span>}
              </div>
            )}
            <div
              className={`board ${isIsometric ? 'isometric-board' : ''}`}
              style={{
                ...(isIsometric
                  ? {
                      width: `${isoBoardWidth}px`,
                      height: `${isoBoardHeight}px`,
                      ['--iso-lift' as string]: `${Math.round(isoTileHeight * 0.3)}px`,
                    }
                  : {
                      gridTemplateColumns: `repeat(${state.width}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${state.height}, minmax(0, 1fr))`,
                    }),
                cursor: boardCursor,
              }}
            >
              {Array.from({ length: state.width * state.height }, (_, index) => {
                const x = index % state.width;
                const y = Math.floor(index / state.width);
                const terrain = state.terrain[y][x];
                const actualUnit = state.units.find(
                  (entry) => entry.position.x === x && entry.position.y === y,
                );
                const actualBase = state.bases.find(
                  (entry) => entry.position.x === x && entry.position.y === y,
                );
                const tileKey = `${x},${y}`;
                const tileExplored = !fogEnabled || exploredTiles.has(tileKey);
                const tileVisible = !fogEnabled || Boolean(currentVisibleTiles?.has(tileKey));
                const unit =
                  actualUnit &&
                  (tileVisible || actualUnit.ownerId === humanViewerId)
                    ? actualUnit
                    : undefined;
                const base =
                  actualBase &&
                  (tileVisible || actualBase.ownerId === humanViewerId)
                    ? actualBase
                    : undefined;
                const actualNode = state.resourceNodes.find(
                  (entry) => entry.position.x === x && entry.position.y === y,
                );
                const node = tileVisible ? actualNode : undefined;
                const road = tileVisible && state.roads.some((entry) => entry.x === x && entry.y === y);
                const hasRoadOrAnchorAt = (rx: number, ry: number) =>
                  state.roads.some((entry) => entry.x === rx && entry.y === ry) ||
                  state.bases.some((entry) => entry.position.x === rx && entry.position.y === ry) ||
                  state.units.some((entry) => entry.position.x === rx && entry.position.y === ry);
                // Buildings and units are valid road endpoints too. Including
                // them prevents a road from looking disconnected while it is
                // being extended toward an anchor.
                const roadConnections = {
                  top: hasRoadOrAnchorAt(x, y - 1),
                  right: hasRoadOrAnchorAt(x + 1, y),
                  bottom: hasRoadOrAnchorAt(x, y + 1),
                  left: hasRoadOrAnchorAt(x - 1, y),
                };
                const roadConnectionCount = Object.values(roadConnections).filter(Boolean).length;
                const hasHorizontalConnection = roadConnections.left || roadConnections.right;
                const hasVerticalConnection = roadConnections.top || roadConnections.bottom;
                const isCornerConnection =
                  roadConnectionCount === 2 &&
                  hasHorizontalConnection &&
                  hasVerticalConnection;
                const roadSprite =
                  roadConnectionCount >= 3
                    ? 'crossroad'
                    : isCornerConnection
                      ? 'corner'
                      : 'straight';
                const roadRotation =
                  roadSprite === 'corner'
                    ? roadConnections.bottom && roadConnections.right
                      ? 0
                      : roadConnections.left && roadConnections.bottom
                        ? 90
                        : roadConnections.top && roadConnections.left
                          ? 180
                          : 270
                    : roadSprite === 'straight' && hasVerticalConnection && !hasHorizontalConnection
                      ? 90
                      : 0;
                const nodeOwner = node?.ownerId
                  ? state.players.find((p) => p.id === node.ownerId)
                  : null;
                const isReachable = reachableTileKeys.has(`${x}:${y}`);
                const isAttackRange = attackRangeTileKeys.has(`${x}:${y}`);
                const isSelected = selectedUnitId && unit && unit.id === selectedUnitId;
                const isFlashing = tileVisible ? flashTiles[tileKey] : undefined;
                const isLegalBuildTile =
                  !isSetupPhase &&
                  phase === 'build' &&
                  legalBuildPositions.some((tile) => tile.x === x && tile.y === y);
                const isLegalRoadTile =
                  !isSetupPhase &&
                  phase === 'build' &&
                  buildRoadMode &&
                  legalRoadPositions.some((tile) => tile.x === x && tile.y === y);
                const isBuildable = !isSetupPhase && phase === 'build' && !buildRoadMode;
                const isLegalBaseTile =
                  isSetupPhase && legalBasePositions.some((tile) => tile.x === x && tile.y === y);
                const unitOwner = unit ? state.players.find((p) => p.id === unit.ownerId) : null;
                const baseOwner = base ? state.players.find((p) => p.id === base.ownerId) : null;
                const isSettlement = base?.kind === 'settlement';
                const isTower = base?.kind === 'tower';
                const isEconomy = base?.kind === 'economy';
                const isMarket = base?.kind === 'market';
                const commandRadius = base && (base.kind === 'base' || base.kind === 'settlement')
                  ? getCommandRadius(state, base)
                  : null;
                const economyLabel =
                  isEconomy && base?.produces ? economyLabelFor(base.produces) : null;
                const isCapturing = node ? capturingNodeKeys.has(`${x},${y}`) : false;
                const nodeSummary = node
                  ? node.bonus === 'lumpSum'
                    ? `treasure chest — park a unit here for a full turn to loot +${LUMP_SUM_BONUS} ${node.resource}${
                        isCapturing ? '\n⏳ Looting: your unit opens this at end of turn.' : ''
                      }`
                    : `${node.resource} node — ${
                        nodeOwner
                          ? `held by ${nodeOwner.name} (+${ONGOING_BONUS_PER_TURN} ${node.resource} every turn)`
                          : `unclaimed; park a unit here for a full turn to capture it (+${ONGOING_BONUS_PER_TURN} ${node.resource} every turn)`
                      }${isCapturing ? '\n⏳ Changing hands: your unit claims this at end of turn.' : ''}`
                  : null;
                const tileTitle = unit
                  ? `${unitOwner?.name ?? ''} ${unitTooltip(unit.type, unitOwner?.specialSkill)}\nHP: ${unit.hp}/${unit.maxHp}${
                      nodeSummary ? `\n\nStanding on a ${nodeSummary}` : ''
                    }`
                  : base
                  ? `${baseOwner?.name ?? ''}'s ${economyLabel ?? (isMarket ? 'market' : isTower ? 'sentry tower' : isSettlement ? 'settlement' : 'base')}\nHP: ${base.hp}/${base.maxHp}${
                      isEconomy
                        ? `\nYields +${economyYieldOn(base.produces ?? 'food', terrain, baseOwner?.research[base.produces ?? 'food'] ?? 0)} ${base.produces} every turn. Undefended.`
                        : isMarket
                        ? `\nLets its owner exchange resources at a ${MARKET_EXCHANGE_RATE}:1 ratio. Undefended.`
                        : isTower
                        ? `\nShoots the nearest enemy within ${TOWER_ATTACK_RANGE} tiles each turn.`
                        : isSettlement
                          ? `\nSpawns units within ${commandRadius} tile${commandRadius === 1 ? '' : 's'}${isSuppliedByMainBase(state, base) ? ' (supplied)' : ''}. Losing it does not lose the game.`
                          : '\nLose this and you are out.'
                    }${base.kind === 'base' ? `\nCommand radius: ${commandRadius} tile${commandRadius === 1 ? '' : 's'} for spawning; healing reaches one tile farther.` : ''}${nodeSummary ? `\n\nBuilt on a ${nodeSummary}` : ''}`
                    : nodeSummary
                      ? nodeSummary
                      : road
                        ? 'Road / bridge — stepping between connected road/bridge tiles costs 0.25 movement, and lake tiles are crossable'
                      : terrain === 'hills'
                        ? 'Hills — passable, but costs extra movement to cross'
                        : terrain === 'forest'
                          ? 'Forest — costs extra movement to cross and blocks line of sight'
                        : isSetupPhase
                          ? (isLegalBaseTile ? 'Valid base location' : 'Outside your home zone, too close to another base, on a resource node, or impassable')
                          : undefined;

                const isBridge = road && terrain === 'lake';
                // A bridge sprite is drawn spanning left-to-right, so a bridge
                // that actually runs north-south has to be rotated. Work out
                // which way it spans from what it connects to. Another bridge
                // tile outweighs a dry bank, so a multi-tile crossing stays
                // visually continuous instead of kinking at the last plank.
                const bridgeSpan = (() => {
                  if (!isBridge) return null;
                  const bankWeight = (bx: number, by: number) => {
                    if (bx < 0 || by < 0 || bx >= state.width || by >= state.height) return 0;
                    const neighbourTerrain = state.terrain[by]?.[bx];
                    if (neighbourTerrain !== 'lake') return neighbourTerrain === 'mountain' ? 0 : 1;
                    return state.roads.some((entry) => entry.x === bx && entry.y === by) ? 2 : 0;
                  };
                  const horizontal = bankWeight(x - 1, y) + bankWeight(x + 1, y);
                  const vertical = bankWeight(x, y - 1) + bankWeight(x, y + 1);
                  // Ties fall back to horizontal so a bridge in open water still
                  // matches the sprite's default orientation.
                  return vertical > horizontal ? 'vertical' : 'horizontal';
                })();
                const tileBackground =
                  terrain === 'lake'
                    ? waterTile(x, y)
                    : road && isIsometric
                      ? DIRT_TILE
                      : grassTile(x, y);
                const isFogHidden = fogEnabled && !tileExplored;
                const overlayTerrain =
                  tileVisible && !road && (terrain === 'mountain' || terrain === 'hills' || terrain === 'forest')
                    ? terrain
                    : null;
                const visibleTileTitle = tileVisible ? tileTitle : undefined;
                const isoLeft = (x - y) * (isoTileWidth / 2) + ((state.height - 1) * isoTileWidth) / 2;
                const isoTop = ((x + y) * isoTileHeight) / 2;

                return (
                  <button
                    key={`${x}-${y}`}
                    className={[
                      'tile',
                      terrain,
                      isReachable ? 'reachable' : '',
                      isAttackRange ? 'attack-range' : '',
                      isSelected ? 'selected' : '',
                      isFlashing === 'damage' ? 'hit-flash' : '',
                      isFlashing === 'capture' ? 'capture-flash' : '',
                      isFlashing === 'heal' ? 'heal-flash' : '',
                      isFlashing === 'income' ? 'income-flash' : '',
                      isBuildable ? (isLegalBuildTile ? 'build-valid' : 'build-invalid') : '',
                      buildRoadMode ? (isLegalRoadTile ? 'road-valid' : 'road-invalid') : '',
                      isSetupPhase ? (isLegalBaseTile ? 'base-valid' : 'base-invalid') : '',
                      isFogHidden ? 'fogged' : '',
                      isIsometric ? 'isometric-tile' : '',
                    ].join(' ')}
                    style={{
                      ...(isIsometric
                        ? {
                            left: `${isoLeft}px`,
                            top: `${isoTop}px`,
                            width: `${isoTileWidth}px`,
                            height: `${isoTileHeight}px`,
                            zIndex: x + y,
                          }
                        : isFogHidden
                          ? {}
                          : { backgroundImage: `url(${tileBackground})` }),
                    }}
                    onClick={() => handleTileClick({ x, y })}
                    onDragOver={(event) => {
                      if (isBuildable && (draggedUnitType || buildRoadMode)) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const droppedType = (event.dataTransfer.getData('text/plain') || draggedUnitType) as UnitType;
                      setDraggedUnitType(null);
                      if (isBuildable && droppedType) handleBuildAt({ x, y }, droppedType);
                    }}
                    title={visibleTileTitle}
                    aria-label={visibleTileTitle ?? (isFogHidden ? 'Unexplored tile' : `Tile ${x}, ${y}`)}
                  >
                    {isIsometric && (
                      <>
                        <span
                          className={`isometric-edge ${isFogHidden ? 'fogged' : ''}`}
                          style={{ transform: `translateY(${isoDepth}px)` }}
                          aria-hidden="true"
                        />
                        <span
                          className={`isometric-top ${isFogHidden ? 'fogged' : ''}`}
                          style={isFogHidden ? undefined : { backgroundImage: `url(${tileBackground})` }}
                          aria-hidden="true"
                        />
                      </>
                    )}
                    {isBridge && (
                      <span
                        className={`terrain-overlay bridge-overlay bridge-${bridgeSpan} ${isIsometric ? 'iso-bridge' : ''}`}
                        aria-label="Bridge"
                      >
                        {isIsometric ? (
                          <IsoBridge size={isoTileWidth} horizontal={bridgeSpan === 'horizontal'} />
                        ) : (
                          <BridgeIcon size={TILE_ART_SIZE} />
                        )}
                      </span>
                    )}
                    {road && !isBridge && !isIsometric && (
                      <span
                        className="terrain-overlay road-overlay"
                        aria-label="Road"
                        style={{ transform: `rotate(${roadRotation}deg)` }}
                      >
                        {roadSprite === 'crossroad' ? (
                          <CrossroadIcon size={TILE_ART_SIZE} />
                        ) : roadSprite === 'corner' ? (
                          <RoadBottomToRightIcon size={TILE_ART_SIZE} />
                        ) : (
                          <RoadIcon size={TILE_ART_SIZE} />
                        )}
                      </span>
                    )}
                    {overlayTerrain && !base && !unit && !node && (
                      <span className={`terrain-overlay terrain-${overlayTerrain}-overlay ${isIsometric ? 'iso-structure' : ''}`}>
                        {(() => {
                          if (isIsometric) {
                            const IsoIcon = ISO_TERRAIN_COMPONENTS[overlayTerrain];
                            // Mountains and hills are impassable, tile-filling
                            // elevation rather than decoration sitting on open
                            // grass (like the forest's trees), so they need to
                            // cover the whole footprint or the grass shows
                            // through around their base and they read as a
                            // small floating model instead of solid ground.
                            const fillsTile = overlayTerrain === 'mountain' || overlayTerrain === 'hills';
                            return <IsoIcon size={fillsTile ? isoTileWidth : isoTerrainSize} />;
                          }
                          const Icon = TERRAIN_ICONS[overlayTerrain];
                          return <Icon size={TILE_ART_SIZE} />;
                        })()}
                      </span>
                    )}
                    {node && !base && !unit && (
                      <span
                        className={`node-icon ${isIsometric ? 'iso-structure' : ''} ${node.ownerId ? 'node-owned' : ''} ${isCapturing ? 'node-capturing' : ''}`}
                        style={nodeOwner ? { borderColor: PLAYER_BADGE_COLORS[nodeOwner.color] } : undefined}
                      >
                        {(() => {
                          if (isIsometric && node.bonus === 'lumpSum') {
                            return <IsoChest size={isoTerrainSize} />;
                          }
                          if (isIsometric) {
                            const IsoNodeIcon = ISO_RESOURCE_NODE_COMPONENTS[node.resource];
                            return <IsoNodeIcon size={isoTerrainSize} />;
                          }
                          const Icon = node.bonus === 'lumpSum' ? ChestIcon : RESOURCE_ICONS[node.resource];
                          return <Icon size={20} />;
                        })()}
                        {node.bonus === 'ongoing' && (
                          <span className="node-flag">
                            <FlagIcon size={14} team={(nodeOwner?.color ?? null) as TeamKey | null} />
                          </span>
                        )}
                      </span>
                    )}
                    {/* When something is standing on a node, the node still has to be
                        readable — otherwise you forget the tile was ever worth holding. */}
                    {node && (base || unit) && (
                      <span
                        className={`node-badge ${node.ownerId ? 'node-owned' : ''} ${isCapturing ? 'node-capturing' : ''}`}
                        style={nodeOwner ? { borderColor: PLAYER_BADGE_COLORS[nodeOwner.color] } : undefined}
                        title={nodeSummary ?? undefined}
                      >
                        {(() => {
                          if (isIsometric && node.bonus === 'lumpSum') return <IsoChest size={12} />;
                          if (isIsometric) {
                            const IsoNodeIcon = ISO_RESOURCE_NODE_COMPONENTS[node.resource];
                            return <IsoNodeIcon size={12} />;
                          }
                          const Icon = node.bonus === 'lumpSum' ? ChestIcon : RESOURCE_ICONS[node.resource];
                          return <Icon size={12} />;
                        })()}
                      </span>
                    )}
                    {node && isCapturing && (
                      <span className="node-capture-pip" aria-label="Capturing this node at end of turn">
                        ⏳
                      </span>
                    )}
                    {base && !unit && (
                      <span
                        className={`base-icon ${isIsometric ? 'iso-structure' : ''} ${isSettlement ? 'settlement-icon' : ''} ${isTower ? 'tower-icon' : ''} ${isEconomy ? 'economy-icon' : ''} ${isMarket ? 'market-icon' : ''}`}
                        style={{ borderColor: PLAYER_BADGE_COLORS[baseOwner?.color ?? 'red'] }}
                      >
                        {isIsometric
                          ? (() => {
                              const IsoIcon = isEconomy
                                ? ISO_ECONOMY_COMPONENTS[base.produces ?? 'food']
                                : isMarket
                                  ? IsoMarket
                                  : isTower
                                    ? IsoTower
                                    : isSettlement
                                      ? IsoSettlement
                                      : IsoBase;
                              return (
                                <IsoIcon
                                  size={isoBuildingSize}
                                  team={(baseOwner?.color ?? 'red') as TeamKey}
                                />
                              );
                            })()
                          : isEconomy ? (
                          (() => {
                            const Icon = ECONOMY_ICON_COMPONENTS[base.produces ?? 'food'];
                            return <Icon size={26} team={(baseOwner?.color ?? 'red') as TeamKey} />;
                          })()
                        ) : isMarket ? (
                          <MarketIcon size={26} team={(baseOwner?.color ?? 'red') as TeamKey} />
                        ) : isTower ? (
                          <TowerIcon size={26} team={(baseOwner?.color ?? 'red') as TeamKey} />
                        ) : isSettlement ? (
                          <SettlementIcon size={26} team={(baseOwner?.color ?? 'red') as TeamKey} />
                        ) : (
                          <BaseIcon size={28} team={(baseOwner?.color ?? 'red') as TeamKey} />
                        )}
                      </span>
                    )}
                    {/* A builder survives the buildings it raises, so it ends the
                        turn standing on top of one. Same trick as an occupied
                        resource node: the unit keeps the tile, the building
                        drops to a corner badge rather than fighting for space. */}
                    {base && unit && (
                      <span
                        className="building-badge"
                        style={{ borderColor: PLAYER_BADGE_COLORS[baseOwner?.color ?? 'red'] }}
                        title={tileTitle ?? undefined}
                      >
                        {(() => {
                          const Icon = isEconomy
                            ? ECONOMY_ICON_COMPONENTS[base.produces ?? 'food']
                            : isMarket
                              ? MarketIcon
                              : isTower
                                ? TowerIcon
                                : isSettlement
                                  ? SettlementIcon
                                  : BaseIcon;
                          return <Icon size={14} team={(baseOwner?.color ?? 'red') as TeamKey} />;
                        })()}
                      </span>
                    )}
                    {unit && (
                      <span
                        className={`unit-icon ${!isSetupPhase && phase === 'actions' && isUnitExhausted(unit) ? 'exhausted' : ''}`}
                        style={{ borderColor: PLAYER_BADGE_COLORS[unitOwner?.color ?? 'red'] }}
                      >
                        {(() => {
                          const Icon = isIsometric ? ISO_UNIT_COMPONENTS[unit.type] : UNIT_ICONS[unit.type];
                          return <Icon size={isIsometric ? isoUnitSize : 32} team={(unitOwner?.color ?? 'red') as TeamKey} />;
                        })()}
                      </span>
                    )}
                    {(unit || base) && (
                      <span className="hp">{unit ? unit.hp : base?.hp}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </main>

          <footer className="resource-cards">
            {state.players.map((player) => (
              <div
                key={player.id}
                className={`resource-card ${player.id === activePlayer.id ? 'active' : ''} ${!player.alive ? 'eliminated' : ''}`}
                style={{ borderColor: PLAYER_BADGE_COLORS[player.color] }}
              >
                <div className="resource-card-header" style={{ background: PLAYER_BADGE_COLORS[player.color] }}>
                  {player.name}
                </div>
                <div className="resource-card-body">
                  <div className="resource-row resource-row-icons">
                    <span className="resource-row-label" />
                    <span>{(() => { const Icon = isIsometric ? ISO_RESOURCE_NODE_COMPONENTS.food : RESOURCE_ICONS.food; return <Icon size={16} />; })()}</span>
                    <span>{(() => { const Icon = isIsometric ? ISO_RESOURCE_NODE_COMPONENTS.wood : RESOURCE_ICONS.wood; return <Icon size={16} />; })()}</span>
                    <span>{(() => { const Icon = isIsometric ? ISO_RESOURCE_NODE_COMPONENTS.stone : RESOURCE_ICONS.stone; return <Icon size={16} />; })()}</span>
                  </div>
                  <div className="resource-row resource-row-totals" title="Resources available now">
                    <span className="resource-row-label">Have</span>
                    <span>{player.resources.food}</span>
                    <span>{player.resources.wood}</span>
                    <span>{player.resources.stone}</span>
                  </div>
                  <div
                    className="resource-row resource-row-income"
                    title="Guaranteed recurring income per turn from captured ongoing nodes and economy buildings."
                  >
                    <span className="resource-row-label">/turn</span>
                    {(['food', 'wood', 'stone'] as ResourceKey[]).map((resource) => {
                      const amount = recurringIncomeByPlayer.get(player.id)?.[resource] ?? 0;
                      return <span key={resource}>+{amount}</span>;
                    })}
                  </div>
                </div>
                <div className="resource-card-nodes" title="Resource nodes captured">
                  🚩 {state.resourceNodes.filter((node) => node.ownerId === player.id).length} node
                  {state.resourceNodes.filter((node) => node.ownerId === player.id).length === 1 ? '' : 's'}
                </div>
              </div>
            ))}
          </footer>
        </div>
      </div>
      {showStats && <StatsPanel state={state} onClose={() => setShowStats(false)} />}
      {showHowToPlay && <HowToPlayModal onClose={() => setShowHowToPlay(false)} />}
      {showVictoryOverlay && (
        <VictoryOverlay
          winner={winner}
          onViewStats={() => {
            setDismissedVictory(true);
            setShowStats(true);
          }}
          onNewGame={onRestart}
        />
      )}
    </div>
  );
}

function App() {
  const [settings, setSettings] = useState<GameSettings | null>(null);

  if (!settings) {
    return <SettingsScreen onStart={setSettings} />;
  }

  return <GameScreen key={JSON.stringify(settings)} settings={settings} onRestart={() => setSettings(null)} />;
}

export default App;
