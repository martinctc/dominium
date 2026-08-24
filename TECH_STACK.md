# Tech Stack & Architecture

Recommendation for building **Grid Wars** (see `DESIGN.md`).

## Constraints driving the choice

- Browser game, hot-seat first, **online multiplayer later**.
- Pixel-art retro look.
- You playtest; I write the code. So: maintainable-by-agent matters more than
  familiar-to-you.
- Deterministic rules, no dice — which makes a pure-function engine both easy and valuable.

---

## Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | The rules have many interacting invariants. Types catch whole classes of bugs before you ever playtest them. |
| Build/dev server | **Vite** | One command (`npm run dev`), instant reload, trivial static deploy. |
| UI / HUD | **React** | HUD, menus, setup screen, action log — all plain declarative UI. |
| Board rendering | **HTML5 Canvas** (custom renderer, `image-rendering: pixelated`) | A grid of ≤324 tiles is far too small to justify a game framework. Canvas gives exact pixel-art control and dead-simple overlays. |
| State | **Zustand** (or plain reducer) | Small, boring, no ceremony. |
| Tests | **Vitest** | The engine is pure functions — cheap, high-value unit tests. |
| Deploy | **GitHub Pages / Netlify** | Static build, zero backend until multiplayer arrives. |

### Why not Phaser / Godot / Unity?

They're built for real-time physics, sprites, scenes and animation loops. This game is a
grid of integers that changes on discrete clicks. A framework would add a large dependency
and its own concepts without solving anything you actually have. Canvas + TS is less code,
not more.

**Phaser would be worth revisiting** if you later want animated attacks, particle effects
and sound design. The engine/renderer split below makes that a renderer swap, not a rewrite.

---

## Architecture: the critical decision

Split the game into two halves with a hard boundary:

```
src/
  engine/          <- PURE. No DOM, no React, no randomness, no I/O.
    types.ts       <- GameState, Unit, Tile, Action, PlayerId
    setup.ts       <- board + map generation, base placement rules
    rules.ts       <- legality: canMove, canAttack, canBuild
    pathfinding.ts <- BFS reachable tiles, path reconstruction
    los.ts         <- Bresenham line of sight
    combat.ts      <- damage resolution, death, elimination, unit capture
    reduce.ts      <- applyAction(state, action) -> newState
    units.ts       <- the stats/cost tables from DESIGN.md, in one place
  ai/              <- reads state, emits Actions. Nothing else.
  ui/              <- React HUD, setup screen, action log
  render/          <- Canvas board renderer + overlays
  net/             <- (later) transport, empty for now
```

**The rule:** `engine/` exports one function that matters —

```ts
applyAction(state: GameState, action: Action): GameState
```

It is pure, deterministic, and total: same input, same output, always. The UI never mutates
game state; it only produces `Action` objects and renders whatever comes back.

### Why this matters so much here

1. **Online multiplayer becomes a transport problem, not a rewrite.** Because state
   transitions are a pure function of `(state, action)`, you can move to a server by
   sending `Action` objects over a websocket and replaying them. The client code barely
   changes. This is the single biggest reason to do it this way given your "multiplayer
   later" answer.
2. **The AI is free.** It just proposes `Action`s against the same legality functions the
   UI uses. No duplicated rules.
3. **Testing is trivial.** "Cannon that moved cannot fire", "cavalry can move then attack",
   "capturing units on elimination reassigns ownership" — each is a three-line test.
4. **Undo and replay are free.** Keep the action list; a full game is reproducible from its
   seed plus actions. Invaluable when you're playtesting and something feels wrong.
5. **Balance tuning is a data edit.** All numbers live in `units.ts` and a `GameConfig`,
   never scattered in logic. Every open question in §12 of the design doc is answered by
   changing a number.

---

## Determinism and seeding

Combat has no randomness, but **map generation does**. Every game gets an explicit
integer seed and uses a small seeded PRNG (not `Math.random`). Consequences:

- You can replay the exact map that produced a lopsided game.
- A multiplayer server can send just the seed instead of the whole map.
- Bug reports from playtesting become `seed + action list`.

---

## Multiplayer path (when you're ready)

Do **not** build this now, but the shape is worth knowing so nothing blocks it:

- **Authoritative server:** a small Node service holds `GameState`, receives `Action`s,
  validates with the *same* `engine/` package, broadcasts the new state.
- Reuse the engine on both sides — it's already isolated and dependency-free.
- Transport: websockets (`socket.io` or plain `ws`). Rooms = games.
- Because turns are discrete and slow, there's no netcode complexity — no prediction,
  no rollback, no lag compensation. This is the easiest possible multiplayer.

---

## Build plan

| Milestone | Deliverable |
|---|---|
| **M1 — Engine core** | Types, unit tables, board, pathfinding, LOS, combat, `applyAction`. Fully unit-tested, no UI at all. |
| **M2 — Playable hot-seat** | Canvas renderer with placeholder coloured squares, click-to-select, move/attack overlays, HUD, turn cycling, win detection. **First playtest here.** |
| **M3 — Balance pass** | Play it, then tune `units.ts` and answer the open questions in DESIGN.md §12. Cheap, because it's all data. |
| **M4 — Maps & terrain** | Seeded generation with the fairness guarantees, connectivity checks, hand-authored map files, 3–4 player boards. |
| **M5 — AI** | The simple bot from DESIGN.md §9, so you can test solo. |
| **M6 — Pixel art** | Real sprites, palette swaps per player, polish, action log, undo-before-commit. |
| **M7 — Deploy** | Static build to a public URL. |
| **M8 — Online (optional)** | Node + websockets reusing `engine/`. |

Deliberately ugly until M6: **rules first, art last.** Balance problems are far more
expensive to find late, and placeholder squares are enough to find them.

---

## What I need from you at each stage

- **After M2:** play 3–4 games hot-seat and tell me what felt bad, slow, or broken.
- **After M3:** confirm the numbers feel right before we invest in art.
- **After M6:** pick the visual direction from a couple of sprite options.
