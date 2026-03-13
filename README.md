# BattleSnails

BattleSnails is a small Three.js arena duel game with two modes: single-player against a bot and 2-player PvP over localhost or LAN. The fight is driven by held mouse input rather than a click-to-strike action.

## Controls

- `WASD` or arrow keys: move relative to the camera
- `Space`: jump
- Hold `Left mouse` and move the mouse: sweep the eye stalk
- Hold `Right mouse` and move the mouse: thrust the eye stalk
- Hold `Shift`: enable lock-on camera and target-facing mode
- Click the arena: capture the mouse for relative motion
- `Esc`: release the mouse
- `Music Off / Music On`: toggle the synth soundtrack
- `Debug`: open the debug panel

## Modes

- `Single Player`: one human versus a bot
- `LAN Multiplayer`: two browser clients connected to a server running on the host machine
- Both modes start with `40 HP` per snail
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

`npm run dev` now auto-starts the multiplayer server on port `2567`.

The Vite app is also exposed on your LAN, so another device on the same network can open `http://<your-host-ip>:5173` and will automatically connect to `ws://<your-host-ip>:2567`.

If you want to run the app outside the Vite dev server, start the multiplayer server manually with:

```bash
npm run mp:server
```

Build the project with:

```bash
npm run build
```

## Docs

- [Documentation index](docs/README.md)
