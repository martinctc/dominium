// Presentational icon components for units, resources, terrain and bases.
//
// These are thin wrappers over the hand-authored pixel sprites in `src/art`, so
// the same artwork drives the board, the HUD, the build picker and the drag
// cursors. Passing `team` recolours a sprite for the owning player.
import type { CSSProperties } from 'react';
import { PixelSprite, spriteCursor } from './art/PixelSprite.js';
import type { SpriteName } from './art/sprites.js';
import type { TeamKey } from './art/palette.js';

export type { TeamKey };

export interface IconProps {
  size?: number;
  className?: string;
  title?: string;
  style?: CSSProperties;
  /** Player colour to tint the sprite with. Omit for a neutral grey ramp. */
  team?: TeamKey | null;
}

function makeIcon(name: SpriteName, displayName: string) {
  const Icon = ({ size = 20, className, style, title, team = null }: IconProps) => (
    <PixelSprite name={name} size={size} className={className} style={style} title={title} team={team} />
  );
  Icon.displayName = displayName;
  return Icon;
}

export const FootsoldierIcon = makeIcon('footsoldier', 'FootsoldierIcon');
export const CavalryIcon = makeIcon('cavalry', 'CavalryIcon');
export const CannonIcon = makeIcon('cannon', 'CannonIcon');
export const ArcherIcon = makeIcon('archer', 'ArcherIcon');
export const BuilderIcon = makeIcon('builder', 'BuilderIcon');
export const HeroIcon = makeIcon('hero', 'HeroIcon');

export const FoodIcon = makeIcon('food', 'FoodIcon');
export const WoodIcon = makeIcon('wood', 'WoodIcon');
export const StoneIcon = makeIcon('stone', 'StoneIcon');

export const MountainIcon = makeIcon('mountain', 'MountainIcon');
export const HillsIcon = makeIcon('hills', 'HillsIcon');
export const ForestIcon = makeIcon('forest', 'ForestIcon');
export const BridgeIcon = makeIcon('bridge', 'BridgeIcon');
export const FlagIcon = makeIcon('flag', 'FlagIcon');
export const BaseIcon = makeIcon('base', 'BaseIcon');
export const SettlementIcon = makeIcon('settlement', 'SettlementIcon');
export const TowerIcon = makeIcon('tower', 'TowerIcon');
export const ChestIcon = makeIcon('chest', 'ChestIcon');
export const FarmIcon = makeIcon('farm', 'FarmIcon');
export const LumberCampIcon = makeIcon('lumberCamp', 'LumberCampIcon');
export const QuarryIcon = makeIcon('quarry', 'QuarryIcon');

/** Which sprite an economy building shows, keyed by the resource it yields. */
export const ECONOMY_ICON_COMPONENTS = {
  food: FarmIcon,
  wood: LumberCampIcon,
  stone: QuarryIcon,
} as const;

export const UNIT_ICON_COMPONENTS = {
  footsoldier: FootsoldierIcon,
  cavalry: CavalryIcon,
  cannon: CannonIcon,
  archer: ArcherIcon,
  builder: BuilderIcon,
  hero: HeroIcon,
} as const;

export const RESOURCE_ICON_COMPONENTS = {
  food: FoodIcon,
  wood: WoodIcon,
  stone: StoneIcon,
} as const;

// Only terrain that is drawn as a sprite *on top of* a tile background. Lakes
// and plains are the tile background itself, so they need no overlay icon.
export const TERRAIN_ICON_COMPONENTS = {
  mountain: MountainIcon,
  hills: HillsIcon,
  forest: ForestIcon,
} as const;

export type OverlayTerrain = keyof typeof TERRAIN_ICON_COMPONENTS;

const CURSOR_SPRITES = {
  footsoldier: 'footsoldier',
  cavalry: 'cavalry',
  cannon: 'cannon',
  archer: 'archer',
  builder: 'builder',
  hero: 'hero',
  base: 'base',
} as const satisfies Record<string, SpriteName>;

/** A CSS `cursor` value showing the sprite being placed, for build/setup modes. */
export function buildCursorDataUri(
  kind: keyof typeof CURSOR_SPRITES,
  team: TeamKey | null = null,
): string {
  return spriteCursor(CURSOR_SPRITES[kind], team);
}
