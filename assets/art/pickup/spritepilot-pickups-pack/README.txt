SpritePilot Pickups Pack — 10 animated pixel-art assets
https://spritepilot.com/free-game-assets

Coins, gems, hearts, keys, potions, a treasure chest and power-ups that spin, shine, bob and pulse to say “pick me up”.

LICENSE
CC0 1.0 (public domain): use these in any project, commercial or not,
change them and share them. No credit needed (a link to spritepilot.com is
always appreciated). See LICENSE.txt.

HOW THEY WERE MADE
Drawn pixel by pixel by code written for SpritePilot. Not AI-generated, and
not traced or adapted from anyone else's art.

WHAT'S INSIDE
  16px/ and 32px/    one PNG per asset: the frames side by side, left to right
  previews/          an animated GIF of each one at 4x size, plus a still PNG
  pickups-pack.json  the frame size, frame count and speed of every file

  Coin             8 frames  10 fps  loops       coin-16px_strip8.png, coin-32px_strip8.png
  Gem              8 frames  10 fps  loops       gem-16px_strip8.png, gem-32px_strip8.png
  Heart            5 frames   8 fps  loops       heart-16px_strip5.png, heart-32px_strip5.png
  Key              8 frames   8 fps  loops       key-16px_strip8.png, key-32px_strip8.png
  Star            10 frames  10 fps  loops       star-16px_strip10.png, star-32px_strip10.png
  Potion           8 frames   8 fps  loops       potion-16px_strip8.png, potion-32px_strip8.png
  Treasure chest  10 frames  12 fps  plays once  chest-16px_strip10.png, chest-32px_strip10.png
  Shield           8 frames  10 fps  loops       shield-16px_strip8.png, shield-32px_strip8.png
  Lightning bolt   8 frames  12 fps  loops       lightning-16px_strip8.png, lightning-32px_strip8.png
  Extra-life orb   8 frames  10 fps  loops       life-orb-16px_strip8.png, life-orb-32px_strip8.png

The speeds are what each one was timed for; change them to taste.
Pixels are either fully opaque or fully transparent, so the art stays crisp
and never picks up dark fringes from blending.

USING A STRIP
The file name says how to slice it: coin-32px_strip8.png is 8 frames
of 32 x 32 pixels in one row. GameMaker reads the "_strip8" by itself.
  Godot 4   AnimatedSprite2D > SpriteFrames > Add Frames from Sprite Sheet,
            Horizontal = the frame count, Vertical = 1.
  Unity     Sprite Mode Multiple, Filter Mode Point (no filter), Compression
            None; Sprite Editor > Slice > Grid By Cell Size, 32 x 32.
  Phaser    this.load.spritesheet('coin', 'coin-32px_strip8.png',
              { frameWidth: 32, frameHeight: 32 })
  Anywhere  use nearest-neighbor ("point") filtering and scale by whole
            numbers (2x, 3x, 4x) so the pixels stay sharp.

Step-by-step guides:
  https://spritepilot.com/blog/godot-4-sprite-animation
  https://spritepilot.com/blog/unity-sprite-sheet-animation
  https://spritepilot.com/blog/phaser-sprite-sheets-and-atlases
Preview, re-time or convert any strip in your browser:
  https://spritepilot.com/sprite-player
