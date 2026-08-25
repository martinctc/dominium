// Isometric buildings and terrain, built from real 2:1 geometry rather than
// pixel grids.
//
// The hand-authored sprites in `sprites.ts` are drawn in front elevation, which
// reads as a flat standee once the board is projected isometrically. These
// components instead compose structures out of shaded solids in a proper
// isometric coordinate space, so they have a top face and two side faces and sit
// convincingly on the diamond tiles. Shared primitives live in `isoCore.tsx`.
import {
  pt,
  shade,
  Solid,
  Roof,
  Banner,
  Frame,
  rampFor,
  STONE,
  DARK_STONE,
  WOOD,
  WOOD_LIGHT,
  LEAF,
  LEAF_DEEP,
  GRASS,
  ROCK,
  SOIL,
  GOLD,
  type IsoIconProps,
} from './isoCore.js';

export { ISO_ASPECT, ISO_ANCHOR_RATIO } from './isoCore.js';
export type { IsoIconProps } from './isoCore.js';
export function IsoBase({ team, ...rest }: IsoIconProps) {
  const ramp = rampFor(team);
  return (
    <Frame {...rest}>
      {/* Keep, with corner turrets and the owner's banner. */}
      <Solid x0={0.1} y0={0.1} x1={0.9} y1={0.9} z0={0} z1={0.28} color={DARK_STONE} />
      <Solid x0={0.22} y0={0.22} x1={0.78} y1={0.78} z0={0.28} z1={1.05} color={STONE} />
      <Solid x0={0.12} y0={0.12} x1={0.34} y1={0.34} z0={0.28} z1={1.35} color={STONE} />
      <Solid x0={0.66} y0={0.66} x1={0.88} y1={0.88} z0={0.28} z1={1.35} color={STONE} />
      <Solid x0={0.66} y0={0.12} x1={0.88} y1={0.34} z0={0.28} z1={1.2} color={DARK_STONE} />
      <Solid x0={0.12} y0={0.66} x1={0.34} y1={0.88} z0={0.28} z1={1.2} color={DARK_STONE} />
      {/* Gatehouse arch, in the team colour so ownership reads at a glance. */}
      <polygon
        fill={ramp.dark}
        points={`${pt(0.78, 0.42, 0)} ${pt(0.78, 0.62, 0)} ${pt(0.78, 0.62, 0.42)} ${pt(0.78, 0.42, 0.42)}`}
      />
      <Banner x={0.5} y={0.5} z={1.05} height={0.55} color={ramp.mid} />
    </Frame>
  );
}

export function IsoSettlement({ team, ...rest }: IsoIconProps) {
  const ramp = rampFor(team);
  return (
    <Frame {...rest}>
      <Solid x0={0.06} y0={0.06} x1={0.94} y1={0.94} z0={0} z1={0.1} color={SOIL} />
      {/* Back cottage, thatched. Drawn first so the near one overlaps it. */}
      <Solid x0={0.12} y0={0.1} x1={0.5} y1={0.44} z0={0.1} z1={0.44} color={'#d8c9a8'} />
      <Roof x0={0.08} y0={0.06} x1={0.54} y1={0.48} z0={0.44} peak={0.76} color={'#a8762f'} />
      {/* Front cottage, roofed in the owner's colour. */}
      <Solid x0={0.46} y0={0.5} x1={0.9} y1={0.9} z0={0.1} z1={0.5} color={'#e7dcc2'} />
      <Roof x0={0.42} y0={0.46} x1={0.94} y1={0.94} z0={0.5} peak={0.88} color={ramp.mid} />
      {/* Doorway, so the front cottage reads as a building not a block. */}
      <polygon
        fill={shade(WOOD, -0.3)}
        points={`${pt(0.9, 0.64, 0.1)} ${pt(0.9, 0.76, 0.1)} ${pt(0.9, 0.76, 0.34)} ${pt(0.9, 0.64, 0.34)}`}
      />
    </Frame>
  );
}

export function IsoTower({ team, ...rest }: IsoIconProps) {
  const ramp = rampFor(team);
  return (
    <Frame {...rest}>
      <Solid x0={0.2} y0={0.2} x1={0.8} y1={0.8} z0={0} z1={0.16} color={DARK_STONE} />
      <Solid x0={0.3} y0={0.3} x1={0.7} y1={0.7} z0={0.16} z1={1.15} color={WOOD} />
      {/* Overhanging crenellated platform. */}
      <Solid x0={0.2} y0={0.2} x1={0.8} y1={0.8} z0={1.15} z1={1.4} color={WOOD_LIGHT} />
      <Solid x0={0.24} y0={0.24} x1={0.36} y1={0.36} z0={1.4} z1={1.56} color={STONE} />
      <Solid x0={0.64} y0={0.64} x1={0.76} y1={0.76} z0={1.4} z1={1.56} color={STONE} />
      <Solid x0={0.64} y0={0.24} x1={0.76} y1={0.36} z0={1.4} z1={1.56} color={STONE} />
      <Banner x={0.5} y={0.5} z={1.4} height={0.5} color={ramp.mid} />
    </Frame>
  );
}

export function IsoFarm({ team, ...rest }: IsoIconProps) {
  const ramp = rampFor(team);
  return (
    <Frame {...rest}>
      <Solid x0={0.04} y0={0.04} x1={0.96} y1={0.96} z0={0} z1={0.08} color={SOIL} />
      {/* Barn sits at the back so it never covers the field. */}
      <Solid x0={0.1} y0={0.12} x1={0.44} y1={0.44} z0={0.08} z1={0.44} color={'#c4703f'} />
      <Roof x0={0.06} y0={0.08} x1={0.48} y1={0.48} z0={0.44} peak={0.78} color={ramp.mid} />
      {/* Crop rows in front of it, alternating shades so they read as furrows. */}
      {[0.52, 0.66, 0.8].map((y, i) => (
        <Solid
          key={y}
          x0={0.08}
          y0={y}
          x1={0.92}
          y1={y + 0.1}
          z0={0.08}
          z1={0.2}
          color={i % 2 === 0 ? '#9dc44f' : '#7fae3d'}
        />
      ))}
    </Frame>
  );
}

export function IsoLumberCamp({ team, ...rest }: IsoIconProps) {
  const ramp = rampFor(team);
  return (
    <Frame {...rest}>
      <Solid x0={0.04} y0={0.04} x1={0.96} y1={0.96} z0={0} z1={0.08} color={SOIL} />
      {/* Open-sided shelter at the back, roofed in the owner's colour. */}
      <Solid x0={0.1} y0={0.1} x1={0.18} y1={0.18} z0={0.08} z1={0.46} color={WOOD} />
      <Solid x0={0.42} y0={0.1} x1={0.5} y1={0.18} z0={0.08} z1={0.46} color={WOOD} />
      <Roof x0={0.06} y0={0.06} x1={0.54} y1={0.44} z0={0.46} peak={0.7} color={ramp.mid} />
      {/* Stacked log pile in front. */}
      <Solid x0={0.14} y0={0.56} x1={0.86} y1={0.7} z0={0.08} z1={0.26} color={WOOD} />
      <Solid x0={0.14} y0={0.74} x1={0.86} y1={0.88} z0={0.08} z1={0.26} color={shade(WOOD, -0.1)} />
      <Solid x0={0.22} y0={0.65} x1={0.78} y1={0.79} z0={0.26} z1={0.44} color={WOOD_LIGHT} />
      {/* Cut stump with an axe-bright top. */}
      <Solid x0={0.66} y0={0.24} x1={0.86} y1={0.42} z0={0.08} z1={0.28} color={'#8d6034'} />
    </Frame>
  );
}

export function IsoQuarry({ team, ...rest }: IsoIconProps) {
  const ramp = rampFor(team);
  return (
    <Frame {...rest}>
      {/* Pit floor, sunk below ground level. */}
      <polygon
        fill={shade(ROCK, -0.45)}
        points={`${pt(0.04, 0.04, 0)} ${pt(0.96, 0.04, 0)} ${pt(0.96, 0.96, 0)} ${pt(0.04, 0.96, 0)}`}
      />
      {/* Rock face at the back, with the owner's pennant planted on top. */}
      <Solid x0={0.08} y0={0.08} x1={0.56} y1={0.4} z0={0} z1={0.5} color={DARK_STONE} />
      <Banner x={0.3} y={0.24} z={0.5} height={0.46} color={ramp.mid} />
      {/* Cut blocks stacked in the pit. */}
      <Solid x0={0.62} y0={0.16} x1={0.9} y1={0.42} z0={0} z1={0.22} color={STONE} />
      <Solid x0={0.12} y0={0.56} x1={0.44} y1={0.86} z0={0} z1={0.26} color={STONE} />
      <Solid x0={0.52} y0={0.6} x1={0.84} y1={0.9} z0={0} z1={0.18} color={shade(STONE, -0.08)} />
      <Solid x0={0.56} y0={0.64} x1={0.78} y1={0.84} z0={0.18} z1={0.34} color={shade(STONE, 0.08)} />
    </Frame>
  );
}

/** A market stall: a striped awning in the owner's colour over an open wooden
 * counter, with a coin pile — deliberately distinct from the production
 * buildings above since it never yields resources, only exchanges them. */
export function IsoMarket({ team, ...rest }: IsoIconProps) {
  const ramp = rampFor(team);
  return (
    <Frame {...rest}>
      <Solid x0={0.06} y0={0.06} x1={0.94} y1={0.94} z0={0} z1={0.06} color={SOIL} />
      {/* Four corner posts holding up the awning. */}
      {[
        [0.14, 0.14],
        [0.78, 0.14],
        [0.14, 0.78],
        [0.78, 0.78],
      ].map(([px, py]) => (
        <Solid key={`${px}-${py}`} x0={px} y0={py} x1={px + 0.08} y1={py + 0.08} z0={0.06} z1={0.62} color={WOOD} />
      ))}
      {/* Striped canopy: alternating team colour and cream. */}
      <Roof x0={0.06} y0={0.06} x1={0.94} y1={0.94} z0={0.62} peak={0.86} color={ramp.mid} />
      <Solid x0={0.06} y0={0.06} x1={0.94} y1={0.2} z0={0.6} z1={0.66} color={'#f1e6cf'} />
      <Solid x0={0.06} y0={0.4} x1={0.94} y1={0.54} z0={0.6} z1={0.66} color={'#f1e6cf'} />
      {/* Counter with a coin pile on top. */}
      <Solid x0={0.22} y0={0.3} x1={0.78} y1={0.62} z0={0.06} z1={0.3} color={WOOD_LIGHT} />
      <Solid x0={0.42} y0={0.42} x1={0.58} y1={0.5} z0={0.3} z1={0.36} color={GOLD} />
      <Solid x0={0.46} y0={0.46} x1={0.54} y1={0.54} z0={0.36} z1={0.4} color={shade(GOLD, 0.2)} />
    </Frame>
  );
}


function Conifer({ x, y, scale = 1, base = 0 }: { x: number; y: number; scale?: number; base?: number }) {
  const r = 0.19 * scale;
  return (
    <>
      <Solid
        x0={x - 0.04}
        y0={y - 0.04}
        x1={x + 0.04}
        y1={y + 0.04}
        z0={base}
        z1={base + 0.18 * scale}
        color={'#6b4423'}
      />
      <Solid
        x0={x - r}
        y0={y - r}
        x1={x + r}
        y1={y + r}
        z0={base + 0.14 * scale}
        z1={base + 0.6 * scale}
        color={LEAF_DEEP}
        taper={0.62}
      />
      <Solid
        x0={x - r * 0.72}
        y0={y - r * 0.72}
        x1={x + r * 0.72}
        y1={y + r * 0.72}
        z0={base + 0.55 * scale}
        z1={base + 1.02 * scale}
        color={LEAF}
        taper={1}
      />
    </>
  );
}

export function IsoForest(props: IsoIconProps) {
  return (
    <Frame {...props}>
      {/* Drawn back-to-front so the near trees overlap the far ones. */}
      <Conifer x={0.26} y={0.24} scale={0.95} />
      <Conifer x={0.76} y={0.38} scale={0.78} />
      <Conifer x={0.46} y={0.76} scale={1.15} />
    </Frame>
  );
}

export function IsoHills(props: IsoIconProps) {
  return (
    <Frame {...props}>
      {/* Three stacked tiers read as a rounded mound at this size. */}
      <Solid x0={0.0} y0={0.0} x1={1.0} y1={1.0} z0={0} z1={0.26} color={shade(GRASS, -0.06)} taper={0.22} />
      <Solid x0={0.16} y0={0.16} x1={0.86} y1={0.86} z0={0.22} z1={0.5} color={GRASS} taper={0.28} />
      <Solid x0={0.34} y0={0.32} x1={0.74} y1={0.72} z0={0.46} z1={0.72} color={shade(GRASS, 0.1)} taper={0.4} />
      {/* An outcrop to break up the silhouette. */}
      <Solid x0={0.06} y0={0.58} x1={0.24} y1={0.78} z0={0.08} z1={0.28} color={ROCK} taper={0.3} />
    </Frame>
  );
}

export function IsoMountain(props: IsoIconProps) {
  return (
    <Frame {...props}>
      <Solid x0={0.0} y0={0.0} x1={1.0} y1={1.0} z0={0} z1={0.7} color={ROCK} taper={0.5} />
      <Solid x0={0.24} y0={0.24} x1={0.76} y1={0.76} z0={0.62} z1={1.4} color={shade(ROCK, -0.1)} taper={0.86} />
      {/* Snow cap. */}
      <Solid x0={0.36} y0={0.36} x1={0.64} y1={0.64} z0={1.16} z1={1.42} color={'#e8eef7'} taper={1} />
      <Solid x0={0.04} y0={0.5} x1={0.3} y1={0.78} z0={0} z1={0.42} color={shade(ROCK, -0.16)} taper={0.6} />
    </Frame>
  );
}

export function IsoChest(props: IsoIconProps) {
  return (
    <Frame {...props}>
      <Solid x0={0.24} y0={0.28} x1={0.78} y1={0.72} z0={0} z1={0.3} color={WOOD} />
      <Solid x0={0.22} y0={0.26} x1={0.8} y1={0.74} z0={0.3} z1={0.42} color={WOOD_LIGHT} />
      <polygon
        fill={GOLD}
        points={`${pt(0.8, 0.44, 0.42)} ${pt(0.8, 0.56, 0.42)} ${pt(0.8, 0.56, 0)} ${pt(0.8, 0.44, 0)}`}
      />
    </Frame>
  );
}

/** A wooden bridge deck, spanning the tile edge-to-edge with plank ties and a
 * simple rail on each side, so a lake crossing reads as solid ground instead
 * of appearing to vanish over open water (the flat pixel-sprite bridge, drawn
 * front-on, doesn't register once the tile itself is a diamond in isometric
 * projection). `horizontal` picks which pair of banks it connects. */
export function IsoBridge({ horizontal = true, ...props }: IsoIconProps & { horizontal?: boolean }) {
  const span = (x0: number, y0: number, x1: number, y1: number) =>
    horizontal ? { x0, y0, x1, y1 } : { x0: y0, y0: x0, x1: y1, y1: x1 };
  return (
    <Frame {...props}>
      <Solid {...span(0, 0.3, 1, 0.7)} z0={0.06} z1={0.16} color={WOOD} />
      {[0.08, 0.24, 0.4, 0.56, 0.72, 0.88].map((t) => (
        <Solid key={t} {...span(t, 0.28, t + 0.06, 0.72)} z0={0.16} z1={0.19} color={shade(WOOD, -0.15)} />
      ))}
      <Solid {...span(0, 0.28, 1, 0.32)} z0={0.16} z1={0.32} color={WOOD_LIGHT} />
      <Solid {...span(0, 0.68, 1, 0.72)} z0={0.16} z1={0.32} color={shade(WOOD_LIGHT, -0.1)} />
    </Frame>
  );
}

/** Small unclaimed resource nodes, built from the same solids as the
 * economy buildings/chest so they read consistently with the rest of the
 * isometric board instead of falling back to flat pixel icons. */
export function IsoFoodNode(props: IsoIconProps) {
  return (
    <Frame {...props}>
      <Solid x0={0.16} y0={0.5} x1={0.5} y1={0.86} z0={0} z1={0.14} color={SOIL} />
      <Solid x0={0.5} y0={0.14} x1={0.84} y1={0.5} z0={0} z1={0.14} color={SOIL} />
      {/* Two sheaves of wheat, leaning together. */}
      <Solid x0={0.24} y0={0.56} x1={0.42} y1={0.74} z0={0.1} z1={0.5} color={'#d8b24a'} taper={0.5} />
      <Solid x0={0.58} y0={0.24} x1={0.76} y1={0.42} z0={0.1} z1={0.5} color={'#e6c25a'} taper={0.5} />
      <polygon fill={'#c69a3a'} points={`${pt(0.33, 0.65, 0.46)} ${pt(0.67, 0.33, 0.46)} ${pt(0.5, 0.5, 0.62)}`} />
    </Frame>
  );
}

export function IsoWoodNode(props: IsoIconProps) {
  return (
    <Frame {...props}>
      <Solid x0={0.14} y0={0.34} x1={0.86} y1={0.5} z0={0} z1={0.18} color={WOOD} />
      <Solid x0={0.14} y0={0.5} x1={0.86} y1={0.66} z0={0} z1={0.18} color={shade(WOOD, -0.12)} />
      <Solid x0={0.28} y0={0.42} x1={0.72} y1={0.58} z0={0.18} z1={0.36} color={WOOD_LIGHT} />
    </Frame>
  );
}

export function IsoStoneNode(props: IsoIconProps) {
  return (
    <Frame {...props}>
      <Solid x0={0.14} y0={0.3} x1={0.5} y1={0.66} z0={0} z1={0.34} color={STONE} taper={0.7} />
      <Solid x0={0.42} y0={0.42} x1={0.84} y1={0.84} z0={0} z1={0.48} color={shade(STONE, -0.08)} taper={0.7} />
      <Solid x0={0.5} y0={0.16} x1={0.78} y1={0.44} z0={0} z1={0.26} color={shade(STONE, 0.08)} taper={0.7} />
    </Frame>
  );
}

export const ISO_RESOURCE_NODE_COMPONENTS = {
  food: IsoFoodNode,
  wood: IsoWoodNode,
  stone: IsoStoneNode,
} as const;

export const ISO_TERRAIN_COMPONENTS = {
  mountain: IsoMountain,
  hills: IsoHills,
  forest: IsoForest,
} as const;

export const ISO_ECONOMY_COMPONENTS = {
  food: IsoFarm,
  wood: IsoLumberCamp,
  stone: IsoQuarry,
} as const;
