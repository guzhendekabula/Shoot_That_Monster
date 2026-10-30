# Pixel Gun FX: Free Sampler (v1.0.2)

A free taste of **Pixel Gun FX**: **5 effects** (Rifle Muzzle Flash (side), Bullet Tracer (loop), Laser Bolt (loop), Metal Impact + Ricochet, Grenade Explosion), 11 sprite sheets and 82 frames at **64x64 px**.

The full pack has **31 effects / 65 colourways / 513 frames**. See `previews/preview_sheet_full_pack.png`.

> The sampler is free to use in your games under the same terms as the full pack
> (see `LICENSE.txt`), but it may not be redistributed.

## What's in the zip

```
README.md, LICENSE.txt, PROVENANCE.md, manifest.json
palette/     palette.hex, palette.gpl, palette.png
previews/    sampler_preview.gif, preview_sheet_full_pack.png
effects/<name>/  sheets (original + colourways), 4x preview GIFs, frames/
```

## Contents

### Muzzle Flashes

| Animation | Folder | Frames | FPS | Type | Anchor / pivot | Colourways |
|---|---|---|---|---|---|---|
| Rifle Muzzle Flash (side) | `effects/rifle_muzzle_flash/` | 8 | 20 (50 ms) | one-shot | left-center (muzzle x=6,y=32), fires right | original, `plasma` (Plasma Blue) |

### Tracers + Projectiles

| Animation | Folder | Frames | FPS | Type | Anchor / pivot | Colourways |
|---|---|---|---|---|---|---|
| Bullet Tracer (loop) | `effects/bullet_tracer/` | 4 | 20 (50 ms) | **loop** | round centre (x=50,y=32), flies right | original, `green` (Green Tracer) |
| Laser Bolt (loop) | `effects/laser_bolt/` | 4 | 20 (50 ms) | **loop** | bolt head (x=46,y=32), flies right | original, `blue` (Blue), `green` (Green) |

### Impacts

| Animation | Folder | Frames | FPS | Type | Anchor / pivot | Colourways |
|---|---|---|---|---|---|---|
| Metal Impact + Ricochet | `effects/metal_impact/` | 9 | 15 (67 ms) | one-shot | impact point (x=44,y=32), surface faces left | original, `energy` (Energy Blue) |

### Utility + Explosions

| Animation | Folder | Frames | FPS | Type | Anchor / pivot | Colourways |
|---|---|---|---|---|---|---|
| Grenade Explosion | `effects/grenade_explosion/` | 14 | 12 (83 ms) | one-shot | bottom-center (ground x=32,y=54) | original, `plasma` (Plasma Charge) |

## Using the effects in your engine

Every sheet is a single horizontal strip of 64x64 frames. The frame count is in the
file name (`*_64x64_<N>f.png`), and there is no padding or spacing. The same frames
also come as separate PNGs in each `frames/` folder, and `manifest.json` lists
frames, FPS, loop flag and anchor for every animation. The images are RGBA PNGs
with hard 1-bit alpha (no semi-transparent pixels), so they need no premultiplied-alpha
setup. Keep them unfiltered (nearest-neighbour) and scale by whole numbers.

**Godot 4.x**
1. Project Settings > Rendering > Textures > Default Texture Filter = `Nearest`
   (or set `texture_filter = Nearest` on the node).
2. Add an `AnimatedSprite2D`, create a new `SpriteFrames`, and click
   "Add frames from sprite sheet". Set Horizontal = N (frame count), Vertical = 1,
   and select all frames.
3. Set the animation speed to the FPS in the table. Turn **Loop** on only for looping
   animations. For one-shots, free the node on `animation_finished`.
4. Offset the sprite so the listed anchor sits on your hit point (for example, a
   bottom-center anchor at y=56 means offset.y = -24 when centered).

**Unity (2D)**
1. Import settings: Texture Type = Sprite (2D and UI), Sprite Mode = Multiple,
   Filter Mode = Point (no filter), Compression = None. Set Pixels Per Unit to match
   your game (for example 16 or 32).
2. In the Sprite Editor, choose Slice > Grid By Cell Size > 64 x 64 and set the
   pivot to the listed anchor (Center / Bottom, or a custom pixel pivot).
3. Select the slices and drag them into the scene to create an Animation clip. Set
   Samples to the FPS. Untick **Loop Time** on one-shot clips and destroy the object
   from an Animation Event on the last frame.

**GameMaker**
1. Create a Sprite, then use "Import Strip" in the Inspector (or Image > Import
   Strip Image in the Image Editor). In the Convert to Frames window set Number of
   Frames = N, Frames per Row = N, Frame Width = 64, Frame Height = 64.
   Tip: if you rename a sheet to end in `_stripN` (for example
   `rifle_muzzle_flash_strip8.png`), GameMaker splits it automatically on import.
2. Set the sprite speed to the FPS as *frames per second*, and set the origin to
   the anchor (Middle Centre, Bottom Centre, or a custom x/y from the table).
3. For one-shots, `instance_destroy()` in the Animation End event.

**Other engines / frameworks** (Defold, Phaser, LÖVE, MonoGame, Construct, etc.)
use the strips as uniform 64x64 grids, or load the individual frames.
Recolour further by swapping palette colours. All pixels use the included
25-colour palette (`palette/`).

## How these were made

Pixel art drawn by code, not by an image-generation model. The code was written with
help from an AI coding assistant (see the itch.io page's AI disclosure).

Every pixel is drawn by deterministic Python code (numpy + Pillow): particles,
noise fields, sprite patterns and palette-indexed shading, rendered directly at
64x64 into the same 25-colour palette as Pixel Impact FX. No third-party art or
photos went in, and there is no tracing. Every effect was directed and reviewed
frame by frame at zoom, then iterated. The same seeds rebuild byte-identical files.
`PROVENANCE.md` documents the pipeline. The generator source code is not part of
this download.
