// Hand-authored 16x16 pixel sprites, stored as plain text so they stay
// diffable, reviewable and dependency-free.
//
// Each sprite is exactly 16 rows of exactly 16 characters. Every character is a
// key into the palette in `palette.ts`; '.' means transparent. The characters
// '1', '2' and '3' are the dark/mid/light shades of the owning player's colour,
// substituted at render time.

export type PixelRows = readonly string[];

const footsoldier: PixelRows = [
  '...........M....',
  '..........oMo...',
  '..........oMo...',
  '......ooo.oWo...',
  '.....o222ooWo...',
  '....o2222ooWo...',
  '....o2ss2ooWo...',
  '....oosssooWo...',
  '.....oSSo.oWo...',
  '....o2222ooWo...',
  '.oMoo2222ooWo...',
  'oMMoo2222ooWo...',
  'oMMoo2222ooWo...',
  '.oMo.o11o.oWo...',
  '.....o11o.oWo...',
  '.....oooo..o....',
];

const archer: PixelRows = [
  '................',
  '..o.............',
  '.oWo..oooo......',
  'oW.M.o1111o.....',
  'oW.M.o2222o.....',
  'oW.M.o2ss2o.....',
  'oW.M.oososoo....',
  'oW.M..osSso.....',
  'oW.M.o2222o.....',
  'oW.Mo222222o....',
  'oWoM.o2222o.....',
  '.oWo.o2222o.....',
  '..o..o1111o.....',
  '.....o1oo1o.....',
  '.....oo..oo.....',
  '................',
];

const cavalry: PixelRows = [
  '................',
  '.....oooo.......',
  '....o2222o......',
  '....o2ss2o......',
  '....oosSsoo.....',
  '...o222222o.....',
  '..o12222221o.oo.',
  '...o222222o.oWWo',
  '..oo222222oooWno',
  '.oWWWWWWWWWWWWWo',
  'oWnWWWWWWWWWWWWo',
  'oWWWWWWWWWWWWWo.',
  '.oWWWWWWWWWWWo..',
  '.oWo.oWWo.oWo...',
  '.oWo.oWWo.oWo...',
  '.ooo.oooo.ooo...',
];

const cannon: PixelRows = [
  '................',
  '................',
  '................',
  '...ooooooooooo..',
  '..odMMMMMMMMMdo.',
  '.oxdMMMMMMMMMMdo',
  '.oxdmmmmmmmmmmdo',
  '.oxoddddddddddo.',
  '..oo2222222o....',
  '...o2222222o....',
  '..oooooooooo....',
  '.oWWo...oWWo....',
  'oWnWWo.oWnWWo...',
  'oWWnWo.oWWnWo...',
  '.oWWo...oWWo....',
  '..oo.....oo.....',
];

// Converted from the hand-authored 16x16 hero.png artwork. Transparent
// source pixels remain transparent; red/pink accents use the team ramp.
const hero: PixelRows = [
  '....22..........',
  '...2.dd.........',
  '....dmM.....m...',
  '.....Mdd.o.o....',
  '.....mMM..WW....',
  '.....M11.oWoW...',
  '....Md11moWWWW..',
  '....MMM11oWWwo..',
  '.....m2M2o222o..',
  '.....o2dM2oWo...',
  '...owW2mdWoWwW..',
  '..oosWWdWWWwWw..',
  '..o.WWWooo..oo..',
  '....WoW.........',
  '....WoWW........',
  '................',
];

const base: PixelRows = [
  '................',
  '......o2o.......',
  '......o22o......',
  '......o2o.......',
  '......ooo.......',
  '.oooo.opo.oooo..',
  '.oPPo.oPo.oPPo..',
  '.oPPooPPPooPPo..',
  '.oPPPPPPPPPPPo..',
  '.oPpPPPpPPPpPo..',
  '.oPPPPPPPPPPPo..',
  '.oPPPPo1oPPPPo..',
  '.oPpPPo1oPPpPo..',
  '.oPPPPo1oPPPPo..',
  '.oPPPPo1oPPPPo..',
  '.ooooooooooooo..',
];

// A non-combatant: hammer raised, plank under one arm, leather apron. Reads as
// "civilian with tools" so it is never mistaken for a fighting unit.
const builder: PixelRows = [
  '.........oMMMo..',
  '.........oMMMo..',
  '.........oMMMo..',
  '......ooo.oWo...',
  '.....o222.oWo...',
  '....o2222.oWo...',
  '....o2so2.oWo...',
  '....oosss.oWo...',
  '.....oSSo.oWo...',
  '....o2222.oWo...',
  '..W.o2ee2ooWo...',
  '.WWoo2ee2ooWo...',
  '.Wnoo2ee2.oWo...',
  '.....o11o.oWo...',
  '.....o11o.ooo...',
  '.....oooo.......',
];

// Deliberately unlike the stone castle `base`: a small hut with an oversized
// team-coloured roof, so a forward outpost is readable at a glance.
const settlement: PixelRows = [
  '................',
  '................',
  '.......oo.......',
  '......o12o......',
  '.....o1122o.....',
  '....o111222o....',
  '...o11122222o...',
  '..o1111222222o..',
  '.o111122222222o.',
  'oooooooooooooooo',
  '.oPPPPPPPPPPPo..',
  '.oPPoWWWWoPPPo..',
  '.oPPoWnnWoPPPo..',
  '.oPpoWnnWoPpPo..',
  '.oPPoWWWWoPPPo..',
  '.ooooooooooooo..',
];

const mountain: PixelRows = [
  '................',
  '................',
  '......oo........',
  '.....oMMo.......',
  '.....oMMPo......',
  '....oPMMPpo.....',
  '....oPPppqo.....',
  '...oPppppqqo....',
  '..oPppqppqqqo...',
  '..oPpqqppqqqo...',
  '.oPppqqpppqqqo..',
  '.oppqqqppqqqqo..',
  'oPppqqqppqqqqqo.',
  'oppqqqqqqqqqqqo.',
  'oqqqqqqqqqqqqqo.',
  '.oooooooooooooo.',
];

// Earth-toned rather than green: hills sit on grass tiles, so a green mound
// would be nearly invisible against the terrain it is meant to stand out from.
const hills: PixelRows = [
  '................',
  '................',
  '................',
  '................',
  '.......ooo......',
  '..oo..oEEEo.....',
  '.oEEo.oEeeEo....',
  'oEeeoooEhheEo...',
  'EehheEEhhhheEo..',
  'ehhhhohhhhhheEoo',
  'hhhhoEohhhooheee',
  'hhhoEeEohoEohhoh',
  'hhoEeeeEoEeEoEEo',
  'hoEehhheEeheEEEE',
  'eeehhhhhhhhhheee',
  'ehhhhhhhhhhhhhhh',
];

const food: PixelRows = [
  '..............g.',
  '..........GGggg.',
  '.........GGGGgo.',
  '........GGGGGGo.',
  '........GGGGGGf.',
  '.....GGGGGGGGGf.',
  '.....GGGGGGGGf..',
  '....GGGGGGGffo..',
  '....GGGGGGGo....',
  '..GGGGGGGGf.....',
  '.GGGGGGGGfo.....',
  '.GGGGGGGf.......',
  '.GGGGGGo........',
  '.GGGGGGo........',
  '.Gffffo.........',
  '................',
];

const wood: PixelRows = [
  '..nnnnnno.......',
  '.nnWEWWnno......',
  'nWWEWEWwnno.....',
  'nwWWEWEWwwno....',
  'nwwWWEWEWwwno...',
  'nwwwwWEWEWwwwo..',
  'nnwwwwWEWEWnwwo.',
  'onnwwwwWEnnWWwo.',
  '.onnwwwwnWEwnWwo',
  '..onnwwwnEwEEwWo',
  '...onnwwnEwEEwWo',
  '....onnwwWEwwWwo',
  '.....onnwwWWWwwo',
  '......oonwwwwwo.',
  '........oooooo..',
  '................',
];

const stone: PixelRows = [
  '................',
  '................',
  '......oooo......',
  '.....oPPPPo.....',
  '....oPPPPppo....',
  '....oPPpppqo....',
  '...ooppqqqqoo...',
  '..oPPoqqqoPPoo..',
  '.oPPPPoooPPPPPo.',
  'oPPPppo.oPPpppqo',
  'oPppqqo.oPppqqqo',
  'oppqqqo.opqqqqqo',
  'oqqqqqo.oqqqqqqo',
  '.ooooo...oooooo.',
  '................',
  '................',
];

const flag: PixelRows = [
  '................',
  '................',
  '..oWo...........',
  '..oW2222o.......',
  '..oW222222o.....',
  '..oW3333332o....',
  '..oW222222o.....',
  '..oW2222o.......',
  '..oWo...........',
  '..oWo...........',
  '..oWo...........',
  '..oWo...........',
  '..oWo...........',
  '..oWo...........',
  '...ooWoo........',
  '................',
];

const bridge: PixelRows = [
  '................',
  '................',
  'nnnnnnnnnnnnnnnn',
  'WWWWWWWWWWWWWWWW',
  'nnnnnnnnnnnnnnnn',
  'wWwWwWwWwWwWwWwW',
  'wWwWwWwWwWwWwWwW',
  'wWwWwWwWwWwWwWwW',
  'wWwWwWwWwWwWwWwW',
  'wWwWwWwWwWwWwWwW',
  'wWwWwWwWwWwWwWwW',
  'nnnnnnnnnnnnnnnn',
  'WWWWWWWWWWWWWWWW',
  'nnnnnnnnnnnnnnnn',
  '................',
  '................',
];

// A neutral paved-road overlay imported from road.ase. It is deliberately
// separate from the bridge sprite because road tiles may form any shape.
const road: PixelRows = [
  '................',
  '................',
  '................',
  'PPddddPPdddddPPP',
  'PPddPmPPmPPPmPPP',
  'PPmPPmmdddmddmmm',
  'dddmddPdddPddPdd',
  'dddPddPPmPPmPPdd',
  'PmPPddmmddddmmmm',
  'dmmddPPmddddPPmm',
  'PPPddPddPPmmPPmP',
  'PPPdddddPPdddddP',
  '................',
  '................',
  '................',
  '................',
];

const crossroad: PixelRows = [
  '...PPdPmmmPPP...',
  '...PPmmmmmPdd...',
  '...PPmPmmmmmm...',
  'PdddddPPdddddPPP',
  'PdddPmPPmPPPmPPP',
  'PPmPPmmdddmddmmm',
  'dddmddPdddPddPdd',
  'dddPddPPmPPmPPdd',
  'PmPPddmmddddmmmm',
  'dmmddPPmddddPPmm',
  'PPPddPddPPmmPPmP',
  'ddddddddPPdddddd',
  'ddddPPmPPddmdddd',
  '...dPPmPPPmPP...',
  '...dmmmdddmPP...',
  '...PPmmdddmPP...',
];

const roadBottomToRight: PixelRows = [
  '................',
  '................',
  '................',
  '...dddPPdddddPPP',
  '...dPmPPmPPPmPPP',
  '...PPmmdddmddmmm',
  '...mddPdddPddPdd',
  '...PddPPmPPmPPdd',
  '...Pddmmddddmmmm',
  '...ddPPmddddPPmm',
  '...ddPddPPmmPPmP',
  '...dddddPPdddddd',
  '...dPPmPPddmdddd',
  '...dPPmPPPmPP...',
  '...dmmmdddmPP...',
  '...PPmmdddmPP...',
];

const chest: PixelRows = [
  '................',
  '................',
  '....oooooooo....',
  '...oWWWWWWWWo...',
  '..oWWwwwwwwWWo..',
  '.oWWwwwwwwwwWWo.',
  '.oyyyyyyyyyyyyo.',
  '.oYYyyyyyyyyYYo.',
  '.owwwwoooowwwwo.',
  '.owwwwoyyowwwwo.',
  '.owwwwoyyowwwwo.',
  '.owwwwoooowwwwo.',
  '.owwwwwwwwwwwwo.',
  '.oyyyyyyyyyyyyo.',
  '..oooooooooooo..',
  '................',
];

const tower: PixelRows = [
  '................',
  '.......2........',
  '......o22o......',
  '.....o2222o.....',
  '....o222222o....',
  '...o22222222o...',
  '..oooooooooooo..',
  '..oPpPpPpPpPqo..',
  '..oPPPPPPPPqqo..',
  '..oPPPPPPPPPqo..',
  '..oPPPPooPPPqo..',
  '..oPPPPxxPPPqo..',
  '..oPPPPxxPPPqo..',
  '..oPPPPPPPPPqo..',
  '..oooooooooooo..',
  '................',
];

// A single broad pine. Drawn in shades darker than the grass tiles it sits on,
// because a canopy in the same green as the ground would read as decoration
// rather than as terrain that costs movement and blocks line of sight.
const forest: PixelRows = [
  '.......o........',
  '......oFo.......',
  '.....oFFFo......',
  '.....oFfFo......',
  '....oFFfFFo.....',
  '...oFFfffFFo....',
  '...oFfffffFo....',
  '..oFFfffffFFo...',
  '.oFFffffffFFFo..',
  '.oFfffffffffFo..',
  'oFFfffffffffFFo.',
  'offffffffffffffo',
  '.oooooownwooooo.',
  '......ownwo.....',
  '......ownwo.....',
  '.....oooooo.....',
];

// Economy buildings. All three share the settlement's team-coloured roof so
// ownership reads at a glance, and differ below the roofline by what they work.
const farm: PixelRows = [
  'wwwwwwwwwwwwwwww',
  'wYYYYYYYYYYYYYYw',
  'wYYYyYYYYYYyYYYw',
  'wYYyyyYYYYyyyYYw',
  'wYYyyyYYYYyyyYYw',
  'wYwwywwYYwwywwYw',
  'wYYwwwYYYYwwwYYw',
  'wYYYYYYYYYYYYYYw',
  'wYYYYYYYyYYYYYYw',
  'wYYYYYYyyyYYYYYw',
  'wYYYYYYyyyYYYYYw',
  'wYYYYYwwywwYYYYw',
  'wYYYYYYwwwYYYYYw',
  'wYYYYYYYYYYYYYYw',
  'wYYYYYYYYYYYYYYw',
  'wwwwwwwwwwwwwwww',
];

const lumberCamp: PixelRows = [
  '................',
  '................',
  '.......oo.......',
  '......o12o......',
  '.....o1122o.....',
  '....o111222o....',
  '...o11122222o...',
  '..o1111222222o..',
  'oooooooooooooooo',
  '.....ooooo......',
  '.....oWnWo......',
  '.oooooWnWooooo..',
  '.oWnWoooooWnWo..',
  '.oWnWo...oWnWo..',
  '.ooooo...ooooo..',
  '................',
];

const quarry: PixelRows = [
  '................',
  '................',
  '.......oo.......',
  '......o12o......',
  '.....o1122o.....',
  '....o111222o....',
  '...o11122222o...',
  '..o1111222222o..',
  'oooooooooooooooo',
  '.ooooooo........',
  '.oPPpPPo..ooo...',
  '.oPppPPo.omMmo..',
  '.ooooooo..oWo...',
  '.oPPpPPo..oWo...',
  '.oPppPPo..oWo...',
  '.ooooooo..ooo...',
];

// A market stall: a team-coloured striped awning over a wooden counter, with a
// pair of scales and a coin pile — reads as "trade a resource for another"
// rather than as a production building like the farm/camp/quarry.
const market: PixelRows = [
  '................',
  '...ooooooooo....',
  '..o111o222o1o...',
  '.o1111o222o11o..',
  '.o111o2222o11o..',
  'ooooooooooooooo.',
  '.oWWWWWWWWWWWo..',
  '.oWnWWWWWWWnWo..',
  '.oWnW.oyo.WnWo..',
  '.oWnWommmoWnWo..',
  '.oWnWoyYyoWnWo..',
  '.oWnW.ooo.WnWo..',
  '.oWnWWWWWWWnWo..',
  '.oWWWWWWWWWWWo..',
  '.ooooooooooooo..',
  '................',
];

export const SPRITES = {
  footsoldier,
  archer,
  cavalry,
  cannon,
  hero,
  builder,
  base,
  settlement,
  mountain,
  hills,
  forest,
  food,
  wood,
  stone,
  flag,
  bridge,
  road,
  crossroad,
  roadBottomToRight,
  chest,
  tower,
  farm,
  lumberCamp,
  quarry,
  market,
} satisfies Record<string, PixelRows>;

export type SpriteName = keyof typeof SPRITES;

export const SPRITE_SIZE = 16;

// Guard against typos in the art data: a row of the wrong length silently
// shears the whole sprite, which is painful to spot by eye.
for (const [name, rows] of Object.entries(SPRITES)) {
  if (rows.length !== SPRITE_SIZE) {
    throw new Error(`Sprite "${name}" has ${rows.length} rows, expected ${SPRITE_SIZE}`);
  }
  rows.forEach((row, index) => {
    if (row.length !== SPRITE_SIZE) {
      throw new Error(
        `Sprite "${name}" row ${index} has ${row.length} columns, expected ${SPRITE_SIZE}`,
      );
    }
  });
}
