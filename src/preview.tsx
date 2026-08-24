// Dev-only art harness: renders every isometric piece in every team colour.
// Served by the Vite dev server at /preview.html; Vite only bundles index.html
// for production, so this never ships.
import { createRoot } from 'react-dom/client';
import {
  IsoBase,
  IsoSettlement,
  IsoTower,
  IsoFarm,
  IsoLumberCamp,
  IsoQuarry,
  IsoForest,
  IsoHills,
  IsoMountain,
  IsoChest,
} from './art/IsoStructures.js';
import { ISO_UNIT_COMPONENTS } from './art/IsoUnits.js';
import type { ReactElement } from 'react';
import type { IsoIconProps } from './art/isoCore.js';

type Comp = (props: IsoIconProps) => ReactElement;

const structures: [string, Comp][] = [
  ['base', IsoBase],
  ['settlement', IsoSettlement],
  ['tower', IsoTower],
  ['farm', IsoFarm],
  ['lumberCamp', IsoLumberCamp],
  ['quarry', IsoQuarry],
  ['forest', IsoForest],
  ['hills', IsoHills],
  ['mountain', IsoMountain],
  ['chest', IsoChest],
];

const units = Object.entries(ISO_UNIT_COMPONENTS) as [string, Comp][];

const teams = ['red', 'blue', 'green', 'yellow'] as const;

function Cell({ label, Comp, team }: { label: string; Comp: Comp; team: (typeof teams)[number] }) {
  return (
    <div style={{ width: 128, textAlign: 'center', color: '#0b1220', fontFamily: 'sans-serif', fontSize: 11 }}>
      <div
        style={{
          height: 120,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: 10,
        }}
      >
        <Comp size={72} team={team} />
      </div>
      {label}
    </div>
  );
}

function Row({ items, team }: { items: [string, Comp][]; team: (typeof teams)[number] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid #3f6b39' }}>
      {items.map(([label, Comp]) => (
        <Cell key={label} label={`${label} (${team})`} Comp={Comp} team={team} />
      ))}
    </div>
  );
}

createRoot(document.getElementById('preview')!).render(
  <div>
    {teams.map((team) => (
      <Row key={`u-${team}`} items={units} team={team} />
    ))}
    {teams.map((team) => (
      <Row key={`s-${team}`} items={structures} team={team} />
    ))}
  </div>,
);
