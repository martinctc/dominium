# Dominium

A turn-based strategy game on a square grid, for 2–4 players, playable hot-seat in the
browser. Descended from a pen-and-paper game played at school: each player defends a base,
gathers resources, and builds an army to destroy every other base on the board.

**▶ Play it now: [martinctc.github.io/dominium](https://martinctc.github.io/dominium/)**

## Gameplay

- Up to **4 players** each pick a spot for their base on a shared grid (8×8 up to 14×14).
- Every turn has three phases: **collect income** (pick one resource — food, wood or
  stone), **build** (spend resources on units or buildings), and **act** (move and/or
  attack with your units).
- Six unit types (`footsoldier`, `cavalry`, `cannon`, `archer`, `hero`, `builder`), each
  with different HP, movement range, attack range and cost — see the in-game **❓ How to
  play** guide for the full stat table.
- Builders can found settlements (extra spawn points), raise sentry towers, build economy
  buildings (farms/lumber camps/quarries), and lay roads and bridges.
- Fog of war hides unexplored terrain; your starting area is visible from turn one.
- Terrain (mountains, lakes, hills, forest) affects movement and where buildings can go.
- Two art styles: classic flat pixel art, and an experimental isometric "2.5D view".
- Optional AI opponents (easy/normal/hard) so you can play solo.

See [`DESIGN.md`](DESIGN.md) for the full design document and open design questions.

## Tech stack

- **TypeScript + React**, built with **Vite**.
- The rules live in a dependency-free, pure-function engine (`src/engine/`) — a single
  `applyAction(state, action)` reducer with no DOM/React/randomness in it, unit-tested
  with **Vitest**.
- Hand-authored pixel art and isometric art in `src/art/` (see
  [`src/art/ATTRIBUTION.md`](src/art/ATTRIBUTION.md) for third-party asset credits).
- No backend — it's a fully static site, hosted on GitHub Pages.

See [`TECH_STACK.md`](TECH_STACK.md) for the full architecture rationale.

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:3000)
npm test         # run the engine test suite (Vitest)
npm run build    # production build to dist/
```

## Deployment

Pushing to `main` automatically builds and deploys to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Feedback

Found a bug, or have an idea? Use the in-game **🐞 Feedback** link, or
[open an issue](https://github.com/martinctc/dominium/issues/new/choose) directly.
