# PROVENANCE: Pixel Gun FX (v1.0.2: 31 effects / 65 colourways / 513 frames)

- **Built:** 2026-10-14 (America/New_York), on a Linux build box, by the same pipeline as Pixel Impact FX and Pixel Spooky FX.
- **v1.0.1 (10/14 early morning):** Dirt Impact rebuilt as a dirt spray + dust plume that thins away; Reload Glint 1.5x bigger; more smoke on Pistol Muzzle Flash; thicker head + end spark on Ricochet Streak; more chips, grit and a punchier dust burst on Stone Impact; pale splinters and lighter sawdust on Wood Impact; Laser Impact now fades out as a broken ring with embers.
- **v1.0.2 (10/14 early morning):** Stone Impact dust repainted in a lighter, warmer tan-grey (sand dithered with pale grey) with softer, rounder puffs, so it reads as dust distinct from the grey chips; Sandstone colourway gets grey dust against sand chips.
- **Build command** (from the project root): `python3 src/build.py`, then `python3 src/package.py` for the release zips.
- **Note for buyers:** this file describes the build repository. The generator source (`src/`) is **not** included in the itch.io downloads.

## How it was made (AI disclosure)

- Pixel art drawn by code, not by an image-generation model. The code was written with help from an AI coding assistant.
- Every pixel in every PNG and GIF, including the colour variants, is computed by Python code from numeric parameters and fixed random seeds, directly into the 25-colour palette defined in code. No external images, photos, fonts or textures are loaded, and nothing is traced.
- A human-directed AI agent wrote the generators, tuned the parameters and reviewed rendered output frame by frame at zoom, iterating on weak effects.
- The itch.io page's AI disclosure is ticked for Code, Graphics and Text (AI Assisted), because AI-written code drew the graphics.

## Tool versions

| Tool | Version |
|---|---|
| Python | 3.13.5 |
| numpy | 2.5.4 (all maths; RNG = `numpy.random.default_rng(seed)`) |
| Pillow | 12.3.0 (PNG/GIF encoding only) |

## Pipeline

1. **Palette:** the identical 25-colour palette of Pixel Impact FX (index 0 transparent). Frames are 64x64 palette-index arrays, so off-palette colours cannot occur.
2. **Drawing:** scalar fields (distance, angle, noise), seeded particle systems, keyframed paths (shell casings), small hand-specified pixel patterns (casings, hulls, rocket, splinters) and hard-threshold colour ramps. No blur, no anti-aliasing, hard 1-bit alpha.
3. **Clean-up and checks:** isolated single pixels are removed; every frame must be non-empty, 1-bit alpha, in-palette, and every connected blob must contain a light enough colour to read on dark backgrounds.
4. **Colourways:** palette-index remaps of the original frames (for example muzzle orange to plasma blue, laser red to blue and green), re-checked after recolouring.
5. **Determinism:** every random choice is seeded; PNGs are written with fixed settings; two clean builds produce byte-identical files (`checksums.sha256`), and the zips use fixed timestamps and ordering.
