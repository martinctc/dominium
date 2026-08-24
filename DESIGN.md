# Grid Wars — Game Design Document (v1)

A turn-based strategy game on a square grid for 2–4 players, hot-seat in the browser.
Descended from a pen-and-paper game. Deterministic, no dice.

---

## 1. Core concept

Each player commands a **base** and an army of units on a shared square grid. Every turn
you collect one resource of your choice, build as many units as you can afford, and act
with every unit you own. Destroy the enemy bases. Last base standing wins.

**Design pillars**

1. **No luck.** Combat is fully deterministic. Every loss is your own fault.
2. **Choice pressure.** One resource per turn is the only bottleneck; the whole economy is
   the question "what am I saving towards?"
3. **Readable at a glance.** The board state should be understandable from a screenshot.

---

## 2. Setup

### Board

- Square grid, configurable. Presets: **10×10** (fast, 2p), **14×14** (2–3p), **18×18** (4p).
- Each player is assigned a **side** of the board: North, South, East, West.
- **Home zone** = the 3 rows (or columns) nearest that player's side.
- Terrain is generated or loaded from a map file (see §7).

### Player count

- 2 players: opposite sides (N/S).
- 3 players: N, S, E.
- 4 players: N, S, E, W.
- **Free-for-all only in v1.** No teams. Last surviving base wins.

### Turn 1 — base placement

- In turn order, each player places their base on any **passable, unoccupied tile inside
  their own home zone**.
- Bases occupy exactly one tile.
- No other action is taken on turn 1. Resource collection *does* happen on turn 1.

---

## 3. Turn structure

Turn order is fixed and cycles: P1 → P2 → P3 → P4 → P1 …

A turn consists of three phases, in order:

### Phase A — Income (mandatory)
Choose **one** of `food`, `wood`, `stone`. `+1` to that stockpile. Stockpiles are
uncapped. This is the only source of income in v1.

### Phase B — Build (optional, repeatable)
Spend resources to place new units. You may build **as many units as you can afford**,
subject to space.

- New units appear on the **base tile itself or any of the 8 tiles adjacent to it**, on a
  passable, unoccupied tile of your choosing.
- If no legal placement tile exists, you cannot build.
- Newly built units are **exhausted** — they cannot move or attack until your next turn.

### Phase C — Actions (optional)
**Every unit you own may act once**, in any order you like. An action is either **move**
or **attack** — with unit-specific exceptions (see §4).

The turn ends when the player chooses to end it. Unused actions are lost.

---

## 4. Units

| Unit | HP | Attack | Move | Range | Move + attack same turn? |
|---|---|---|---|---|---|
| **Footsoldier** | 10 | 3 | 2 | 1 | No |
| **Cavalry** | 12 | 4 | 5 | 1 | **Yes** (move then attack) |
| **Cannon** | 8 | 7 | 1 | 4 | **No** — must not have moved this turn to fire |
| **Base** | 40 | — | — | — | Cannot act; builds units |

### Costs

| Unit | Food | Wood | Stone | Total (turns of income) |
|---|---|---|---|---|
| **Footsoldier** | 2 | 1 | 0 | 3 |
| **Cavalry** | 3 | 2 | 1 | 6 |
| **Cannon** | 1 | 3 | 4 | 8 |

Roughly: footsoldiers are your tempo, cavalry is your reach, cannon is your siege.
A cannon two-shots a footsoldier and drops a base in 6 hits.

### Unit rules

- One unit per tile. Units block movement (friendly and enemy alike) — no passing through.
- Units never move onto or through impassable terrain.
- Cavalry's move-then-attack makes it the only unit that can threaten from out of sight.
  It cannot attack *then* move.
- Cannon is the only unit that must trade mobility for damage — it fires only if it has
  not moved this turn.

---

## 5. Movement

- **Diagonals are allowed** (8-directional). Every step, orthogonal or diagonal, costs
  **1 movement point**.
- Movement is **pathfinding-based**: a destination is legal only if a path exists within
  the unit's movement allowance that avoids impassable terrain and occupied tiles.
  (Implementation: BFS over the 8-neighbourhood, cost 1 per step.)
- A unit may not move diagonally between two impassable tiles ("no corner cutting") —
  keeps mountain ranges feeling solid.
- Partial moves are allowed; a unit may move fewer tiles than its allowance, but it has
  still used its action (except cavalry, which may then attack).

---

## 6. Combat

- **Deterministic.** The attacker deals damage equal to its Attack value. No dice, no
  modifiers, no counter-attack in v1.
- A target is attackable if it is an **enemy unit or enemy base** within the attacker's
  **Range**, measured as **Chebyshev distance** (diagonals count as 1), and line of sight
  is clear (see below).
- Damage reduces the target's current HP. At **HP ≤ 0** the unit is removed from the board.
- Attacking a **base** works identically. When a base reaches 0 HP its owner is
  **eliminated**.

### Line of sight

- **Mountains block line of sight.** Lakes do **not**.
- LOS is computed as a straight line from attacker centre to target centre (Bresenham).
  If that line passes through any mountain tile, the attack is illegal.
- Units do **not** block line of sight in v1 — you can shoot past your own troops.
- Range 1 (melee) attacks are always adjacent and therefore never LOS-blocked.

---

## 7. Terrain

| Tile | Passable | Blocks LOS | Notes |
|---|---|---|---|
| **Plain** | Yes | No | Default |
| **Lake** | **No** | No | Impassable in v1; shootable over |
| **Mountain** | **No** | **Yes** | Impassable and blocks ranged fire |

Terrain is static — it never changes during a game.

**Map generation** should guarantee:
- Every player's home zone contains at least 6 passable tiles.
- All players' home zones are mutually reachable by land (connectivity check).
- No terrain inside the outer ring of any home zone that would trap a base.
- Rotational symmetry where practical, for fairness.

Maps are stored as plain data files so hand-made maps can be dropped in later.

---

## 8. Elimination and victory

- A player is **eliminated** when their base reaches 0 HP.
- **Their surviving units are captured** by the player who dealt the killing blow, and
  immediately change ownership. Captured units are exhausted for the remainder of that
  turn and act normally from the capturing player's next turn onwards.
- Eliminated players are skipped in turn order.
- **Victory: the last player with a surviving base wins.**
- Optional safety valve (configurable, off by default): if no base has taken damage for
  N turns, the player with the highest total HP on the board wins.

---

## 9. AI opponent (v1)

A deliberately simple, transparent, deterministic bot — enough for solo playtesting.

**Income policy:** buy toward a target unit mix (roughly 3 footsoldiers : 1 cavalry :
1 cannon), always taking the resource that is furthest from the next purchase.

**Build policy:** build the most expensive affordable unit that the mix is short of.

**Action policy**, per unit, evaluated in order:
1. If an enemy base is in range and LOS — attack it.
2. If an enemy unit is in range that this attack would kill — attack it.
3. If any enemy is in range — attack the one with lowest current HP.
4. Otherwise move along the shortest path toward the nearest enemy base, stopping short
   of enemy melee range if the unit is a cannon.

No lookahead, no search. A stronger AI (minimax or MCTS over the rules engine) is a
post-v1 project — the engine is designed to make that a drop-in addition.

---

## 10. Presentation

- **Pixel-art sprites, retro strategy look.** Distinct silhouette per unit type; player
  identity carried by a colour palette swap (blue / red / green / yellow).
- Chunky tile grid, crisp nearest-neighbour scaling, no blurring.
- HP shown as a small pip bar under each unit; exhausted units drawn desaturated.
- **Overlays on selection:** reachable tiles (blue tint), attackable targets (red tint),
  path preview on hover.
- Persistent HUD: current player, resource stockpiles, turn number, unit costs, and an
  action log ("P2 cannon hit P1 base for 7").
- Full keyboard support and undo-before-commit for misclicked moves (an action is only
  final once confirmed).

---

## 11. Explicitly out of scope for v1

Deferred, but the architecture should not preclude them:

- Online multiplayer (see the tech doc — the engine is built for it).
- Teams / 2v2.
- Extra units (pikeman, scout, ship), unit upgrades, veterancy.
- Terrain that modifies movement cost or grants defensive bonuses.
- Resource tiles / territory control as an income source.
- Fog of war.
- Campaign, persistence, ranking.

---

## 12. Open questions to revisit after first playtest

1. Is 1 resource/turn too slow once every unit can act every turn?
2. Is the cannon too strong at range 4 with no counter-attack?
3. Should bases be able to defend themselves at all?
4. Does unit capture on elimination create a runaway leader in 4-player games?
5. Is impassable water too restrictive on larger maps?
