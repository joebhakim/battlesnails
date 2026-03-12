# BattleSnails

BattleSnails is a small Three.js duel game with a Half Sword-style control adaptation. You control a blue snail in third person and drive a single eye stalk directly with held mouse input.

## Controls

- `WASD` or arrow keys: move relative to the camera
- Hold `Left mouse` and move the mouse: sweep the eye stalk
- Hold `Right mouse` and move the mouse: thrust the eye stalk
- Click the arena: capture the mouse for relative motion
- `Esc`: release the mouse
- `Music Off / Music On`: toggle the synth soundtrack
- `Debug`: open the debug panel

## Current Game Loop

- Single-player only
- One player snail versus one NPC snail
- Both snails start with `3 HP`
- A landed impact deals `1` damage
- Damage only applies when the eye stalk collides with enough impact power
- Player movement contributes to attack momentum
- Body contact pushes the snails apart but does not deal damage

## Tech

- Three.js
- Vite
- Plain JavaScript

## Development

```bash
npm install
npm run dev
```

Build the project with:

```bash
npm run build
```

## Docs

- [Documentation index](docs/README.md)
