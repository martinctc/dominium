# Dominium Art Guide

This folder contains the project’s art assets and the rules that the current renderer expects.

## Pixel art format

The classic game view uses a small, hand-authored pixel art system.

Key files:
- `sprites.ts` — sprite definitions
- `palette.ts` — palette and team recoloring rules
- `PixelSprite.tsx` — renderer

### Requirements
- Each sprite is a fixed grid: 16x16 pixels
- Each row must be exactly 16 characters long
- `.` means transparent
- Palette letters map to fixed colors in `palette.ts`
- `1`, `2`, and `3` are team-colour ramps; these are recolored at render time per team

### Typical sprite names
- `footsoldier`
- `archer`
- `cavalry`
- `cannon`
- `hero`
- `base`
- `builder`

### Good practices
- Keep the sprite on a transparent background
- Use strong silhouettes, not soft edges
- Keep the sprite anchored to the ground visually
- Favor a limited palette and readable shapes over detail
- Avoid anti-aliased edges if you want it to match the current style

## Isometric art

The isometric mode is created in SVG, not as a PNG sprite sheet.

Key files:
- `isoCore.tsx` — isometric projection math and shared primitives
- `IsoStructures.tsx` — buildings and terrain
- `IsoUnits.tsx` — unit figures and mounted units

### Style notes
- Built from shaded solids and roofs in a true 2:1 isometric projection
- Uses a single light source from the upper left
- Team colours are applied via a consistent ramp system
- The goal is a readable, chunky 2.5D silhouette rather than full 3D realism

## Asset workflow

### Preferred workflow for manual art
1. Draw one transparent 16x16 sprite per unit or structure
2. Keep the silhouette bold and readable at small size
3. Match the repo’s limited palette and team-colour logic
4. Convert the final pixel art into the text-grid format used by `sprites.ts`

### Acceptable file formats
- Best for hand-authored work: transparent PNGs for preview/iteration
- Best for engine integration: the `sprites.ts` text-matrix format
- Editable Aseprite starting files are in `ase-export/`
- For isometric work: SVG is the native format used by this codebase

### Aseprite editing workflow

The `ase-export/` folder contains one editable 16x16 RGBA `.ase` file for
each classic sprite. These are exports of the current `sprites.ts` artwork,
so they are safe starting points for manual beautification.

When bringing an edited sprite back into the game:
1. Keep the canvas exactly 16x16 with one frame.
2. Keep empty pixels fully transparent.
3. Preserve the palette meaning: `1`, `2`, and `3` are team-colour shades.
4. Export a PNG or map the finished colours back to the character grid in `sprites.ts`.

The `.ase` files use the rendered red team ramp for `1`, `2`, and `3`. The
engine recolours those keys for the other teams, so painting directly over
team-coloured pixels with fixed red colours will remove that behaviour.

### Folder layout

- `ase-export/` — one canonical, engine-matching `.ase` starting point per
  classic sprite (`footsoldier.ase`, `hills.ase`, ...). These are always kept
  in sync with `sprites.ts` and are the safe files to copy from when starting
  a fresh manual edit.
- `drafts/` — in-progress or superseded manual `.ase`/`.png` edits (e.g. an
  earlier pass at `hero` or `tower` before the final version was folded back
  into `sprites.ts`/`ase-export/`). Kept around so nothing is lost, but not
  treated as authoritative. Feel free to delete a draft once you're sure you
  no longer need it, or promote it into `ase-export/` if it becomes the new
  canonical version.

### Naming conventions
Use concise names that match gameplay roles, for example:
- `footsoldier.png`
- `archer.png`
- `cavalry.png`
- `cannon.png`
- `hero.png`
- `base.png`
- `builder.png`

For grouped work, use descriptive sheets such as:
- `units-sheet.png`
- `buildings-sheet.png`
- `terrain-sheet.png`

## Pitfalls to avoid
- Don’t use large, highly detailed sprites for the classic view; they won’t read at the board scale
- Don’t mix anti-aliased and crisp-edged art styles in the same set
- Don’t add a full-color treatment if the game expects recoloring by team
- Don’t forget transparency; the sprite renderer expects empty pixels to stay empty
- Don’t assume a sprite sheet will work automatically; the current classic renderer expects individual grid definitions in `sprites.ts`

## Quick rule of thumb

If it is a small, readable, transparent, 16x16 sprite with a strong silhouette and a limited palette, it is a good fit for the classic pixel art system.

If it is a building or unit built as layered isometric SVG geometry, it fits the 2.5D system instead.
