# Star Atlas SideScroller (Prototype)

A small **3D-ish side-scroller arcade shooter** (R-Type inspired) built with **Three.js + TypeScript**.

## New Features Added

### Enemy Types
- **Kamikaze Enemies**: Fast red tetrahedrons that track and accelerate toward the player
- **Shooter Enemies**: Orange boxes that patrol and fire bullets at the player
- **Boss Battle**: Epic purple boss at distance 165 with two phases and multi-bullet attacks

### Power-ups
- **Shield Pickup**: Blue torus that grants temporary invulnerability (5 seconds)
- **Health Pickup**: Green octahedron that restores HP
- **Power Pickup**: Blue octahedron that increases firepower

### Visual & Audio Improvements
- **Enhanced Particle Effects**: More explosions with better colors
- **Shield Visual Aura**: Wireframe sphere surrounds player when shield is active
- **Boss Warning System**: Alert banner before boss appears

### Gameplay Improvements
- **Score System**: Points awarded for kills, pickups, and checkpoints
- **Health Bar**: Visual HP display in HUD
- **Enemy Waves**: Progressive difficulty with mixed enemy types

## Controls

- **Move**: **WASD** or **Arrow Keys**
- **Shoot**: **Space**
- **Pause**: **P**
- **Restart**: **R**

## Run

```bash
npm install
npm run dev
```

## Gameplay

- **Enemy Waves**: Spawn at specific distances, mix of Kamikaze and Shooter enemies
- **Boss Battle**: Appears at distance 165, 50 HP, shoots spread patterns
- **Checkpoints**: Every 45 distance units
- **Power-ups**: Drop from destroyed enemies (18% chance)

## Assets

Optionally uses Star Atlas images as billboard textures:
- `public/assets/staratlas/airbike.jpg` (player)

## Notes

The game now features:
- 3 distinct enemy types with unique behaviors
- Epic boss battle at end of level
- Shield, health, and power pickups
- Score tracking and health display
- Enhanced visual and audio feedback
