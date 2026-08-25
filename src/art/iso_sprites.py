"""
2:1 isometric pixel-art sprite sheet generator.
Dark-fantasy-lite palette, flat shading, hard edges, no AA/dithering.
Light source: top-left. Shadow face: lower-right (the "right" iso face).
Footprint: 32w x 16h diamond. Sprite canvas: 32w x 40h.
"""

from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Palette (flat, dark-fantasy-lite, muted/desaturated)
# ---------------------------------------------------------------------------
TEAM_GREY      = (150, 150, 158, 255)   # flat mid-grey, recolour target
TEAM_GREY_DK   = (120, 120, 128, 255)   # shaded side of team-colour elements

STONE_TOP      = (146, 142, 138, 255)
STONE_L        = (110, 107, 104, 255)
STONE_R        = (76, 74, 72, 255)
STONE_TOP_LT   = (168, 164, 158, 255)

WOOD_TOP       = (146, 106, 66, 255)
WOOD_L         = (112, 80, 48, 255)
WOOD_R         = (78, 55, 32, 255)

THATCH_TOP     = (196, 168, 96, 255)
THATCH_L       = (162, 136, 74, 255)
THATCH_R       = (120, 100, 54, 255)

DIRT_TOP       = (108, 84, 58, 255)
DIRT_L         = (84, 64, 44, 255)
DIRT_R         = (60, 46, 32, 255)

GRASS_TOP      = (94, 122, 72, 255)
GRASS_L        = (74, 100, 56, 255)
GRASS_R        = (54, 76, 40, 255)

PINE_DK        = (46, 82, 58, 255)
PINE_MD        = (60, 100, 70, 255)
PINE_LT        = (78, 118, 84, 255)
TRUNK          = (70, 50, 32, 255)

ROCK_TOP       = (128, 124, 132, 255)
ROCK_L         = (96, 92, 102, 255)
ROCK_R         = (66, 63, 72, 255)
ROCK_HI        = (172, 168, 176, 255)

GOLD           = (188, 156, 74, 255)
GOLD_DK        = (140, 112, 50, 255)

OUTLINE        = (24, 20, 22, 255)
SHADOW_GROUND  = (0, 0, 0, 70)

TRANSPARENT    = (0, 0, 0, 0)

# ---------------------------------------------------------------------------
# Sprite canvas geometry
# ---------------------------------------------------------------------------
SPRITE_W, SPRITE_H = 32, 40
FOOT_W, FOOT_H = 32, 16          # footprint diamond, 2:1
FEET_Y = 34                       # y (within sprite canvas) of footprint centre

def foot_pts(cx, cy, w=FOOT_W, h=FOOT_H):
    """N, E, S, W points of an iso diamond centred at (cx, cy)."""
    return {
        "N": (cx, cy - h / 2),
        "E": (cx + w / 2, cy),
        "S": (cx, cy + h / 2),
        "W": (cx - w / 2, cy),
    }

def draw_ground_shadow(d, cx, cy, w=FOOT_W, h=FOOT_H):
    p = foot_pts(cx, cy, w, h)
    d.polygon([p["N"], p["E"], p["S"], p["W"]], fill=SHADOW_GROUND)

def draw_diamond(d, cx, cy, w, h, top_col, outline=OUTLINE):
    p = foot_pts(cx, cy, w, h)
    d.polygon([p["N"], p["E"], p["S"], p["W"]], fill=top_col, outline=outline)

def draw_iso_box(d, cx, base_y, w, h, wall_h, top_col, left_col, right_col, outline=OUTLINE):
    """
    Draws an extruded iso box: base diamond centred at (cx, base_y) with
    footprint w x h, extruded upward by wall_h. Top face + two visible walls.
    """
    b = foot_pts(cx, base_y, w, h)
    t = foot_pts(cx, base_y - wall_h, w, h)

    # left wall (W -> S -> S' -> W')
    d.polygon([b["W"], b["S"], t["S"], t["W"]], fill=left_col, outline=outline)
    # right wall (S -> E -> E' -> S')
    d.polygon([b["S"], b["E"], t["E"], t["S"]], fill=right_col, outline=outline)
    # top face
    d.polygon([t["N"], t["E"], t["S"], t["W"]], fill=top_col, outline=outline)
    return t  # top diamond points, for stacking things on top

def draw_pyramid_roof(d, cx, apex_y, base_y, w, h, left_col, right_col, outline=OUTLINE):
    """Simple hip-roof: 2 triangular faces meeting at a ridge/apex point."""
    p = foot_pts(cx, base_y, w, h)
    apex = (cx, apex_y)
    d.polygon([p["W"], p["S"], apex], fill=left_col, outline=outline)
    d.polygon([p["S"], p["E"], apex], fill=right_col, outline=outline)
    d.polygon([p["N"], p["W"], apex], fill=left_col, outline=outline)
    d.polygon([p["N"], p["E"], apex], fill=right_col, outline=outline)

def draw_flag(d, x, y, h=10, w=8, pole_col=WOOD_R):
    d.line([(x, y), (x, y - h)], fill=pole_col, width=1)
    d.polygon([(x, y - h), (x + w, y - h + 3), (x, y - h + 5), (x, y - h + 8)],
              fill=TEAM_GREY, outline=OUTLINE)

def draw_cone(d, cx, base_y, w, h, dark, mid, light, outline=OUTLINE):
    """A tree-like cone: 3 stacked triangular tiers, left half mid, right half dark."""
    tiers = 3
    tier_h = h / tiers
    for i in range(tiers):
        top_y = base_y - h + i * tier_h * 0.55
        bot_y = top_y + tier_h * 1.15
        tw = w * (1 - i * 0.28)
        apex = (cx, top_y)
        left = (cx - tw / 2, bot_y)
        right = (cx + tw / 2, bot_y)
        bottom = (cx, bot_y + 2)
        d.polygon([apex, bottom, left], fill=mid, outline=outline)
        d.polygon([apex, right, bottom], fill=dark, outline=outline)

# ---------------------------------------------------------------------------
# Individual sprite builders — each returns an RGBA Image of SPRITE_W x SPRITE_H
# ---------------------------------------------------------------------------

def new_canvas():
    return Image.new("RGBA", (SPRITE_W, SPRITE_H), TRANSPARENT)

def s01_keep():
    img = new_canvas(); d = ImageDraw.Draw(img)
    cx, fy = SPRITE_W // 2, FEET_Y
    draw_ground_shadow(d, cx, fy)
    top = draw_iso_box(d, cx, fy, 22, 11, 18, STONE_TOP, STONE_L, STONE_R)
    ny = top["N"][1]
    # crenellations along the back top edge, sitting flush on the roofline
    for i in (-7, -2, 3):
        d.rectangle([cx + i, ny - 3, cx + i + 2, ny + 1], fill=STONE_TOP_LT, outline=OUTLINE)
    draw_flag(d, cx, ny - 3, h=11)
    return img

def s02_settlement():
    img = new_canvas(); d = ImageDraw.Draw(img)
    cx, fy = SPRITE_W // 2, FEET_Y
    draw_ground_shadow(d, cx, fy)
    wtop = draw_iso_box(d, cx, fy, 26, 13, 6, STONE_L, STONE_L, STONE_R)
    # two small huts peeking above the wall
    h1_base = wtop["W"][1] + 5
    h1top = draw_iso_box(d, cx - 6, h1_base, 9, 5, 6, WOOD_TOP, WOOD_L, WOOD_R)
    draw_pyramid_roof(d, cx - 6, h1top["N"][1] - 5, h1top["N"][1] + 2, 9, 5, THATCH_L, THATCH_R)
    h2_base = wtop["W"][1] + 2
    h2top = draw_iso_box(d, cx + 6, h2_base, 8, 4, 5, WOOD_TOP, WOOD_L, WOOD_R)
    draw_pyramid_roof(d, cx + 6, h2top["N"][1] - 4, h2top["N"][1] + 2, 8, 4, THATCH_L, THATCH_R)
    return img

def s03_tower():
    img = new_canvas(); d = ImageDraw.Draw(img)
    cx, fy = SPRITE_W // 2, FEET_Y
    draw_ground_shadow(d, cx, fy, 16, 8)
    top = draw_iso_box(d, cx, fy, 14, 7, 24, WOOD_TOP, WOOD_L, WOOD_R)
    ny = top["N"][1]
    for i in (-5, -1, 3):
        d.rectangle([cx + i, ny - 3, cx + i + 2, ny + 1], fill=WOOD_TOP, outline=OUTLINE)
    draw_flag(d, cx, ny - 3, h=10)
    return img

def s04_farm():
    img = new_canvas(); d = ImageDraw.Draw(img)
    cx, fy = SPRITE_W // 2, FEET_Y + 3
    field_cx = cx - 4
    draw_diamond(d, field_cx, fy, 24, 12, DIRT_TOP)
    p = foot_pts(field_cx, fy, 24, 12)
    for k in range(1, 5):
        t = k / 5
        left = (p["N"][0]*(1-t)+p["W"][0]*t, p["N"][1]*(1-t)+p["W"][1]*t)
        right = (p["E"][0]*(1-t)+p["S"][0]*t, p["E"][1]*(1-t)+p["S"][1]*t)
        d.line([left, right], fill=DIRT_R, width=1)
    # small barn, overlapping the near-right edge of the field
    barn_cx = field_cx + 9
    barn_base = fy - 3
    btop = draw_iso_box(d, barn_cx, barn_base, 10, 5, 5, WOOD_TOP, WOOD_L, WOOD_R)
    draw_pyramid_roof(d, barn_cx, btop["N"][1] - 4, btop["N"][1] + 1, 10, 5, THATCH_L, THATCH_R)
    return img

def s05_lumber_camp():
    img = new_canvas(); d = ImageDraw.Draw(img)
    cx, fy = SPRITE_W // 2, FEET_Y
    draw_diamond(d, cx, fy, 26, 13, GRASS_TOP)
    # log pile: stacked ellipses
    for i, (dx, dy) in enumerate([(-6, -2), (-2, -4), (2, -2), (-4, -6), (0, -6)]):
        lx, ly = cx + dx, fy + dy
        d.ellipse([lx - 5, ly - 2, lx + 5, ly + 2], fill=WOOD_L, outline=OUTLINE)
        d.ellipse([lx - 5 + 3, ly - 1, lx - 5 + 4, ly], fill=WOOD_TOP)
    # sawhorse (X shape)
    sx, sy = cx + 8, fy - 1
    d.line([(sx - 4, sy + 3), (sx + 3, sy - 6)], fill=WOOD_R, width=2)
    d.line([(sx - 3, sy - 6), (sx + 4, sy + 3)], fill=WOOD_R, width=2)
    # axe leaning
    ax, ay = cx + 10, fy - 5
    d.line([(ax, ay), (ax - 3, ay - 9)], fill=WOOD_R, width=1)
    d.polygon([(ax - 3, ay - 9), (ax + 2, ay - 10), (ax + 1, ay - 6)], fill=TEAM_GREY, outline=OUTLINE)
    return img

def s06_quarry():
    img = new_canvas(); d = ImageDraw.Draw(img)
    cx, fy = SPRITE_W // 2, FEET_Y + 1
    draw_diamond(d, cx, fy, 28, 14, ROCK_TOP)
    # pit edge (darker inset diamond, offset toward the back-left)
    draw_diamond(d, cx - 2, fy - 1, 16, 8, ROCK_R)
    # cut stone blocks stacked at the near-right side, sitting on the ground
    bx, by = cx + 7, fy - 1
    draw_iso_box(d, bx, by, 9, 4.5, 5, STONE_TOP_LT, STONE_L, STONE_R)
    draw_iso_box(d, bx - 4, by - 5, 9, 4.5, 5, STONE_TOP_LT, STONE_L, STONE_R)
    return img

def s07_conifers():
    img = new_canvas(); d = ImageDraw.Draw(img)
    cx, fy = SPRITE_W // 2, FEET_Y
    draw_ground_shadow(d, cx, fy, 26, 13)
    draw_cone(d, cx - 7, fy, 12, 22, PINE_DK, PINE_MD, PINE_LT)
    draw_cone(d, cx + 6, fy + 2, 10, 18, PINE_DK, PINE_MD, PINE_LT)
    draw_cone(d, cx, fy - 3, 11, 26, PINE_DK, PINE_MD, PINE_LT)
    return img

def s08_hill():
    img = new_canvas(); d = ImageDraw.Draw(img)
    cx, fy = SPRITE_W // 2, FEET_Y + 2
    draw_ground_shadow(d, cx, fy, 28, 14)
    d.polygon([(cx - 14, fy), (cx, fy - 16), (cx + 14, fy), (cx, fy + 7)],
              fill=GRASS_L, outline=OUTLINE)
    d.polygon([(cx - 14, fy), (cx, fy - 16), (cx, fy + 7)], fill=GRASS_TOP, outline=OUTLINE)
    return img

def s09_mountain():
    img = new_canvas(); d = ImageDraw.Draw(img)
    cx, fy = SPRITE_W // 2, FEET_Y + 2
    draw_ground_shadow(d, cx, fy, 26, 13)
    d.polygon([(cx - 12, fy), (cx, fy - 26), (cx + 12, fy), (cx, fy + 6)],
              fill=ROCK_R, outline=OUTLINE)
    d.polygon([(cx - 12, fy), (cx, fy - 26), (cx, fy + 6)], fill=ROCK_L, outline=OUTLINE)
    d.polygon([(cx - 4, fy - 20), (cx, fy - 26), (cx + 4, fy - 19), (cx, fy - 15)],
              fill=ROCK_HI, outline=OUTLINE)
    return img

def s10_bridge():
    img = new_canvas(); d = ImageDraw.Draw(img)
    cx, fy = SPRITE_W // 2, FEET_Y
    p = foot_pts(cx, fy, 28, 14)
    # deck runs along the N-S (front-back) axis
    d.polygon([p["N"], p["E"], p["S"], p["W"]], fill=WOOD_L, outline=OUTLINE)
    # planks as cross-lines
    for k in range(1, 6):
        t = k / 6
        left = (p["W"][0]*(1-t)+p["N"][0]*t, p["W"][1]*(1-t)+p["N"][1]*t)
        right = (p["S"][0]*(1-t)+p["E"][0]*t, p["S"][1]*(1-t)+p["E"][1]*t)
        d.line([left, right], fill=WOOD_R, width=1)
    return img

def s11_chest():
    img = new_canvas(); d = ImageDraw.Draw(img)
    cx, fy = SPRITE_W // 2, FEET_Y
    draw_ground_shadow(d, cx, fy, 18, 9)
    top = draw_iso_box(d, cx, fy, 14, 7, 8, WOOD_TOP, WOOD_L, WOOD_R)
    draw_pyramid_roof(d, cx, top["N"][1] - 3, top["N"][1] + 1, 14, 7, WOOD_L, WOOD_R)
    # gold trim bands
    b = foot_pts(cx, fy, 14, 7)
    t = foot_pts(cx, fy - 8, 14, 7)
    d.line([b["S"], t["S"]], fill=GOLD, width=1)
    d.line([b["W"], t["W"]], fill=GOLD_DK, width=1)
    d.ellipse([cx - 1, fy - 8, cx + 1, fy - 6], fill=GOLD, outline=OUTLINE)
    return img

def s12_marker():
    img = new_canvas(); d = ImageDraw.Draw(img)
    cx, fy = SPRITE_W // 2, FEET_Y + 2
    draw_ground_shadow(d, cx, fy, 16, 8)
    d.polygon([(cx - 8, fy), (cx, fy - 5), (cx + 8, fy), (cx, fy + 3)],
              fill=DIRT_L, outline=OUTLINE)
    draw_flag(d, cx, fy - 5, h=16)
    return img

SPRITES = [
    ("1. Keep", s01_keep),
    ("2. Settle.", s02_settlement),
    ("3. Tower", s03_tower),
    ("4. Farm", s04_farm),
    ("5. Lumber", s05_lumber_camp),
    ("6. Quarry", s06_quarry),
    ("7. Conifers", s07_conifers),
    ("8. Hill", s08_hill),
    ("9. Mountain", s09_mountain),
    ("10. Bridge", s10_bridge),
    ("11. Chest", s11_chest),
    ("12. Marker", s12_marker),
]

# ---------------------------------------------------------------------------
# Assemble sheet
# ---------------------------------------------------------------------------
COLS, ROWS = 4, 3
CELL_PAD = 6
LABEL_H = 12
CELL_W = 64
CELL_H = SPRITE_H + CELL_PAD * 2 + LABEL_H

sheet_w = COLS * CELL_W
sheet_h = ROWS * CELL_H
sheet = Image.new("RGBA", (sheet_w, sheet_h), (30, 28, 30, 255))
draw = ImageDraw.Draw(sheet)

try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 9)
except Exception:
    font = ImageFont.load_default()

# also build a transparent "assets only" sheet (no grid bg / labels) for game use
assets_only = Image.new("RGBA", (sheet_w, sheet_h), TRANSPARENT)

for idx, (label, builder) in enumerate(SPRITES):
    col, row = idx % COLS, idx // COLS
    x0 = col * CELL_W
    y0 = row * CELL_H
    # cell border
    draw.rectangle([x0, y0, x0 + CELL_W - 1, y0 + CELL_H - 1], outline=(70, 68, 70, 255))
    sprite = builder()
    px, py = x0 + (CELL_W - SPRITE_W) // 2, y0 + CELL_PAD
    sheet.paste(sprite, (px, py), sprite)
    assets_only.paste(sprite, (px, py), sprite)
    draw.text((x0 + 4, y0 + CELL_H - LABEL_H), label, fill=(220, 218, 210, 255), font=font)

sheet.save("/home/claude/iso_sprite_sheet_native.png")
assets_only.save("/home/claude/iso_sprite_sheet_assets_only.png")

# Upscaled (4x, nearest-neighbour = still hard pixel edges) for easy viewing
scale = 4
sheet_big = sheet.resize((sheet_w * scale, sheet_h * scale), Image.NEAREST)
sheet_big.save("/home/claude/iso_sprite_sheet_preview_4x.png")

print("done", sheet_w, sheet_h)
