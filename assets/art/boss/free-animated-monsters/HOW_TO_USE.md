# Free Animated Monsters

Two animated bosses from **Monsters & Bosses Complete**
(https://gegx.itch.io/monsters-bosses-complete, 132 animated enemies).

## What is inside

| Folder | Animations | Frame size |
|---|---|---|
| stormharpy/ | idle, walk, attack | 209 x 209 px |
| staticweaver/ | idle, walk, attack | 203 x 203 px |

- Each PNG is one sprite sheet: 6 columns x 4 rows, 24 frames.
- Rows are the directions, top to bottom: down, left, right, up.
- Transparent background, no scaling needed. Scale by whole numbers (2x, 3x) to keep pixels crisp.
- `preview_gif/` has one GIF per animation (facing down) to browse without an engine.
- `MANIFEST.csv` lists file, frame size, columns, rows and row order for automatic import.

## Quick start

**Godot 4:** AnimatedSprite2D, new SpriteFrames, "Add frames from sprite sheet",
Horizontal 6, Vertical 4, then pick the row you need (one row per direction).
Turn texture filtering off (Nearest).

**Unity:** Sprite Mode Multiple, Slice Grid By Cell Size (209 x 209 or 203 x 203),
Filter Mode Point, Compression None.

**GameMaker / others:** strip import with 6 frames per row, 4 rows.

Suggested speed: 8 to 10 fps for idle, 10 to 12 fps for walk and attack.

## License

See LICENSE.txt. Commercial use is fine, credit is not required,
reselling or redistributing the assets themselves is not allowed.

AI-generated, curated by hand: every animation was checked direction by direction
before it went into the full pack.
