# Star Atlas SideScroller (Prototype)

A small **3D-ish side-scroller arcade shooter** (R-Type inspired) built with **Three.js + TypeScript**.

## Run

```bash
npm install
npm run dev
```

Then open the shown local URL.

## Controls

- Move: **WASD** or **Arrow Keys**
- Shoot: **Space**
- Pause: **P**
- Restart: **R**

## Gameplay (MVP)

- One playable "dungeon corridor" segment with **parallax** layers
- **Enemy waves** that trigger by distance
- Player + enemy **bullets**, collisions, HP
- **Pickups**: health / power (multi-shot)
- **Checkpoints** every ~45 distance units (respawn at last checkpoint)
- Simple **HUD** (HP / score / distance / checkpoint)
- Basic procedural **SFX** (no external audio files)
- Lightweight **explosions/particles** on kills and damage

## Assets

Optionally uses a few Star Atlas still images copied from the existing `games/staratlas-flappy/public/assets/_raw_drive` folder as billboard textures:

- `public/assets/staratlas/airbike.jpg` (player)
- `public/assets/staratlas/greenader.jpg` / `bombarella.jpg` (enemies)

If these fail to load, the game falls back to simple colored geometry.
