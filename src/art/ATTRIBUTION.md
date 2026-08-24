# Art attribution

## Terrain tiles (`src/art/tiles/*.png`)

Cropped 16×16 tiles from two asset packs by **Kenney** (<https://kenney.nl>),
both released under **CC0 1.0 Universal (public domain)**:

| File | Source pack | Sheet index | Transform |
| --- | --- | --- | --- |
| `grass-a.png` | Tiny Battle | 0 | — |
| `grass-b.png` | Tiny Battle | 1 | — |
| `grass-c.png` | Tiny Battle | 1 | mirrored horizontally |
| `water-a.png` | Tiny Battle | 37 | — |
| `water-b.png` | Tiny Battle | 37 | mirrored horizontally |
| `dirt.png` | Tiny Town | 25 | — |

Tiles 0, 1 and 37 are the only tiles on the Tiny Battle sheet that are *purely*
grass or *purely* water — every other candidate carries flowers, an islet or a
shoreline, which would read as a game object rather than as terrain. The extra
variants are therefore mirrors of those same tiles rather than different tiles.

- Tiny Battle — <https://kenney.nl/assets/tiny-battle>
- Tiny Town — <https://kenney.nl/assets/tiny-town>

CC0 imposes no attribution requirement; this file is recorded as a courtesy and
so the provenance of every binary asset in the repository stays traceable.

## Everything else

All unit, building, resource and marker sprites in `src/art/sprites.ts` are
original work authored for this project as plain-text pixel matrices. They carry
no third-party licence obligations.

The isometric buildings and terrain in `src/art/IsoStructures.tsx` and the
isometric unit figures in `src/art/IsoUnits.tsx` are likewise original work.
Rather than pixel matrices they are composed from shaded solids in a true 2:1
isometric projection (shared primitives live in `src/art/isoCore.tsx`), so they
present a top face and two side
faces. Player-owned structures take their accent colour from the same team ramp
in `palette.ts` that the pixel sprites use, so one definition serves all four
players. `preview.html` (dev server only — it is not part of the production
build) renders every structure and unit in every team colour for quick visual
review.
