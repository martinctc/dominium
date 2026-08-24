// Isometric unit figures, built from the same shaded solids as the buildings in
// `IsoStructures.tsx`.
//
// The pixel sprites in `sprites.ts` are drawn in front elevation, so next to the
// solid isometric buildings they read as flat cardboard. These are deliberately
// chunky and low on detail: at board scale a unit is only ~50px tall, so
// silhouette and team colour carry the read, not detail.
//
// Every figure faces +x, which projects to "down and to the right" on screen,
// and is drawn back-to-front so nearer parts overdraw farther ones.
import type { ReactElement } from 'react';
import {
  Solid,
  Frame,
  rampFor,
  shade,
  STEEL,
  STEEL_DARK,
  SKIN,
  WOOD,
  WOOD_LIGHT,
  LEATHER,
  HORSE,
  IRON,
  GOLD,
  type IsoIconProps,
} from './isoCore.js';
import type { TeamKey } from './palette.js';

interface Ramp {
  dark: string;
  mid: string;
  light: string;
}

/**
 * A standing figure. `base` lifts it onto a mount and `scale` shrinks a rider so
 * it stays in proportion with the horse beneath it.
 */
function Figure({
  ramp,
  base = 0,
  scale = 1,
  tunic,
  helm = STEEL,
  legs = true,
}: {
  ramp: Ramp;
  base?: number;
  scale?: number;
  tunic?: string;
  helm?: string;
  legs?: boolean;
}) {
  const body = tunic ?? ramp.mid;
  const z = (h: number) => base + h * scale;
  return (
    <>
      {legs && (
        <>
          <Solid x0={0.4} y0={0.34} x1={0.6} y1={0.46} z0={z(0)} z1={z(0.44)} color={LEATHER} />
          <Solid x0={0.4} y0={0.54} x1={0.6} y1={0.66} z0={z(0)} z1={z(0.44)} color={shade(LEATHER, 0.08)} />
        </>
      )}
      {/* Arms stand proud of the torso so the silhouette isn't a plain slab. */}
      <Solid x0={0.38} y0={0.22} x1={0.62} y1={0.31} z0={z(0.5)} z1={z(0.9)} color={shade(body, -0.16)} />
      <Solid x0={0.38} y0={0.69} x1={0.62} y1={0.78} z0={z(0.5)} z1={z(0.9)} color={shade(body, -0.16)} />
      <Solid x0={0.34} y0={0.3} x1={0.66} y1={0.7} z0={z(0.42)} z1={z(0.96)} color={body} />
      <Solid x0={0.38} y0={0.36} x1={0.62} y1={0.64} z0={z(0.96)} z1={z(1.2)} color={SKIN} />
      <Solid x0={0.35} y0={0.33} x1={0.65} y1={0.67} z0={z(1.14)} z1={z(1.34)} color={helm} />
    </>
  );
}

/** A horse facing +x, for the mounted units. */
function Horse({ coat = HORSE, barding }: { coat?: string; barding?: string }) {
  return (
    <>
      {/* Far legs and tail first, then the body, then the near legs. The body is
          deliberately deep and the legs short, or the rider sitting on top
          leaves the horse reading as a set of stilts. */}
      <Solid x0={0.22} y0={0.26} x1={0.36} y1={0.38} z0={0} z1={0.42} color={shade(coat, -0.3)} />
      <Solid x0={0.64} y0={0.26} x1={0.78} y1={0.38} z0={0} z1={0.42} color={shade(coat, -0.3)} />
      <Solid x0={0.02} y0={0.44} x1={0.16} y1={0.56} z0={0.46} z1={0.86} color={shade(coat, -0.22)} />
      <Solid x0={0.14} y0={0.26} x1={0.82} y1={0.74} z0={0.4} z1={0.86} color={coat} />
      <Solid x0={0.22} y0={0.62} x1={0.36} y1={0.74} z0={0} z1={0.42} color={shade(coat, -0.12)} />
      <Solid x0={0.64} y0={0.62} x1={0.78} y1={0.74} z0={0} z1={0.42} color={shade(coat, -0.12)} />
      {/* Saddle cloth rather than full barding, so it carries the team colour
          without hiding the animal. */}
      {barding && <Solid x0={0.3} y0={0.22} x1={0.62} y1={0.78} z0={0.8} z1={0.9} color={barding} />}
      <Solid x0={0.74} y0={0.38} x1={0.9} y1={0.62} z0={0.76} z1={1.14} color={shade(coat, 0.08)} />
      <Solid x0={0.84} y0={0.4} x1={1.08} y1={0.6} z0={1.0} z1={1.18} color={coat} />
    </>
  );
}

/** A vertical shaft, for spears, lances and hafts. */
function Shaft({
  x,
  y,
  z0,
  z1,
  color = WOOD,
  w = 0.045,
}: {
  x: number;
  y: number;
  z0: number;
  z1: number;
  color?: string;
  w?: number;
}) {
  return <Solid x0={x - w} y0={y - w} x1={x + w} y1={y + w} z0={z0} z1={z1} color={color} />;
}

export function IsoFootsoldier({ team, ...rest }: IsoIconProps) {
  const ramp = rampFor(team);
  return (
    <Frame {...rest}>
      {/* Shield on the far side, drawn before the body so the body overlaps it. */}
      <Solid x0={0.36} y0={0.14} x1={0.64} y1={0.22} z0={0.48} z1={0.98} color={ramp.dark} />
      <Figure ramp={ramp} />
      <Shaft x={0.94} y={0.5} z0={0} z1={1.44} />
      <Solid x0={0.885} y0={0.445} x1={0.995} y1={0.555} z0={1.44} z1={1.62} color={STEEL} taper={1} />
    </Frame>
  );
}

export function IsoArcher({ team, ...rest }: IsoIconProps) {
  const ramp = rampFor(team);
  return (
    <Frame {...rest}>
      {/* Quiver slung across the back. */}
      <Solid x0={0.24} y0={0.4} x1={0.36} y1={0.6} z0={0.62} z1={1.14} color={LEATHER} />
      <Figure ramp={ramp} helm={shade(ramp.dark, -0.05)} />
      {/* Bow: three segments stepped in x to suggest a curve. Held out to the
          figure's right so it clears the head in screen space — anything on the
          x == y diagonal projects straight onto the body's centre line. */}
      <Solid x0={0.86} y0={0.46} x1={0.95} y1={0.55} z0={0.4} z1={0.66} color={WOOD_LIGHT} />
      <Solid x0={0.92} y0={0.46} x1={1.01} y1={0.55} z0={0.66} z1={1.1} color={WOOD_LIGHT} />
      <Solid x0={0.86} y0={0.46} x1={0.95} y1={0.55} z0={1.1} z1={1.36} color={WOOD_LIGHT} />
    </Frame>
  );
}

export function IsoBuilder({ team, ...rest }: IsoIconProps) {
  const ramp = rampFor(team);
  return (
    <Frame {...rest}>
      {/* A workman's smock, with the team colour kept to a sash and cap so
          builders read as civilians rather than soldiers. */}
      <Figure ramp={ramp} tunic={'#cdb083'} helm={ramp.mid} />
      <Solid x0={0.33} y0={0.29} x1={0.67} y1={0.71} z0={0.7} z1={0.8} color={ramp.mid} />
      {/* Hammer shouldered. */}
      <Shaft x={0.92} y={0.52} z0={0.4} z1={1.3} />
      <Solid x0={0.81} y0={0.41} x1={1.03} y1={0.63} z0={1.26} z1={1.46} color={STEEL_DARK} />
    </Frame>
  );
}

export function IsoCavalry({ team, ...rest }: IsoIconProps) {
  const ramp = rampFor(team);
  return (
    <Frame {...rest}>
      <Horse barding={ramp.dark} />
      <Figure ramp={ramp} base={0.53} scale={0.78} legs={false} />
      {/* Lance couched on the rider's left, opposite the horse's head, so the
          two don't collide in screen space. */}
      <Shaft x={0.46} y={0.98} z0={0.66} z1={1.62} />
      <Solid x0={0.41} y0={0.93} x1={0.51} y1={1.03} z0={1.62} z1={1.78} color={STEEL} taper={1} />
    </Frame>
  );
}

export function IsoHero({ team, ...rest }: IsoIconProps) {
  const ramp = rampFor(team);
  return (
    <Frame {...rest}>
      <Horse coat={'#e2e6ee'} barding={ramp.mid} />
      {/* Gilded armour marks the hero out from ordinary cavalry. */}
      <Figure ramp={ramp} base={0.52} scale={0.82} legs={false} helm={GOLD} />
      <Solid x0={0.36} y0={0.28} x1={0.64} y1={0.72} z0={0.94} z1={1.06} color={GOLD} />
      {/* Plume on the helm. */}
      <Solid x0={0.42} y0={0.42} x1={0.58} y1={0.58} z0={1.62} z1={1.86} color={ramp.light} taper={0.6} />
      {/* Sword raised on the rider's left, clear of the horse's head: the tell
          for the area attack. */}
      <Shaft x={0.44} y={1.0} z0={1.14} z1={1.34} color={LEATHER} w={0.05} />
      <Solid x0={0.35} y0={0.91} x1={0.53} y1={1.09} z0={1.32} z1={1.42} color={GOLD} />
      <Solid x0={0.395} y0={0.955} x1={0.485} y1={1.045} z0={1.42} z1={1.86} color={STEEL} />
    </Frame>
  );
}

export function IsoCannon({ team, ...rest }: IsoIconProps) {
  const ramp = rampFor(team);
  return (
    <Frame {...rest}>
      {/* Far wheel, then carriage, then near wheel, so the axle reads correctly.
          Tall thin slabs stand in for wheels — a real disc would be mush at
          board scale. */}
      <Solid x0={0.26} y0={0.12} x1={0.52} y1={0.22} z0={0.02} z1={0.56} color={shade(WOOD, -0.26)} />
      {/* Trail dragging back behind the axle, then the carriage in team colours. */}
      <Solid x0={0.0} y0={0.42} x1={0.26} y1={0.58} z0={0.04} z1={0.18} color={WOOD} />
      <Solid x0={0.2} y0={0.2} x1={0.6} y1={0.8} z0={0.18} z1={0.44} color={ramp.dark} />
      <Solid x0={0.26} y0={0.78} x1={0.52} y1={0.88} z0={0.02} z1={0.56} color={WOOD} />
      {/* Barrel, stepped up and out in x so it reads as an elevated muzzle
          rather than a lump sitting on the carriage. */}
      <Solid x0={0.3} y0={0.38} x1={0.56} y1={0.62} z0={0.42} z1={0.68} color={IRON} />
      <Solid x0={0.56} y0={0.4} x1={0.82} y1={0.6} z0={0.52} z1={0.76} color={shade(IRON, 0.12)} />
      <Solid x0={0.82} y0={0.41} x1={1.04} y1={0.59} z0={0.62} z1={0.84} color={shade(IRON, 0.22)} />
      {/* Muzzle ring. */}
      <Solid x0={1.02} y0={0.39} x1={1.12} y1={0.61} z0={0.6} z1={0.86} color={STEEL_DARK} />
    </Frame>
  );
}

export const ISO_UNIT_COMPONENTS = {
  footsoldier: IsoFootsoldier,
  archer: IsoArcher,
  cavalry: IsoCavalry,
  cannon: IsoCannon,
  builder: IsoBuilder,
  hero: IsoHero,
} as const satisfies Record<string, (props: IsoIconProps) => ReactElement>;

export type IsoUnitName = keyof typeof ISO_UNIT_COMPONENTS;
export type { TeamKey };
