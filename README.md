# BattleSnails

BattleSnails is a deliberately jarring third-person arena game built with Three.js and Vite. You control a blue snail, drive two floppy eye stalks with held mouse input, fight across configurable terrain, and leave permanent wet trails that turn the map into a speed trap.

The project currently supports four modes:
- `Single Player`: one human vs a simple enemy preset, with persisted stage and encounter options
- `Test Mode`: a local tuning lab with staged sliders, configurable bot count, and an explicit apply step
- `Simulator`: a visual balance harness that batch-runs a simulated humanlike player against the bot
- `LAN Multiplayer`: two human players plus a crowd of NPC snails driven by the server

The browser client handles rendering, input, HUD, music, simulator reports, and debug tools. The actual match rules live in a shared authoritative simulation used by local modes and the LAN server.

## Table Of Contents

- [Quick Start](#quick-start)
- [Modes And Rules](#modes-and-rules)
- [Controls](#controls)
- [Gameplay Flow](#gameplay-flow)
- [Arena And Combat](#arena-and-combat)
- [LAN Multiplayer](#lan-multiplayer)
- [Development](#development)
- [Architecture](#architecture)
- [Debugging](#debugging)
- [Implementation Notes](#implementation-notes)

## Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the game:

   ```bash
   npm run dev
   ```

3. Open the Vite URL in your browser. In dev mode the app is served on your LAN and the multiplayer server is auto-started on port `2567`.

4. For LAN play, open the same URL on a second machine on the same network, for example:

   ```text
   http://<host-ip>:5173
   ```

5. Choose `Single Player`, `Test Mode`, `Simulator`, or `LAN Multiplayer` from the start menu.

If you want to run the WebSocket server separately, use:

```bash
npm run mp:server
```

## Modes And Rules

- `Single Player`: one human player vs a simple encounter preset chosen from the start menu.
- `Test Mode`: one human player plus `0..40` local bots, staged tuning controls, local browser persistence for the last-used lab settings, and switchable terrain presets.
- `Simulator`: an automated browser-visible balance runner. It runs an average-but-skilled simulated humanlike player across selected stage/enemy-mode searches, reports aggregate and per-scenario metrics, replays a representative match, and uses the same duel knobs for HP, movement, combat, stalk, and bot behavior.
- `LAN Multiplayer`: two human players plus `40` NPC snails by default.
- Human players have `600 HP` by default.
- Bots and NPCs have `600 HP` by default.
- Each stalk can deal damage independently on a strong enough contact.
- Damage is momentum-based and scales with impact strength, not button-window-based.
- Passive body contact does not deal damage.
- Body overlap only pushes snails apart.
- There is no level progression.
- There is no persistence, matchmaking, auth, rollback, or prediction.

## Controls

- `WASD` or arrow keys: move relative to the camera.
- Outside lock-on, backward and pure side movement backpedal or strafe without rotating the body; forward-diagonal movement turns.
- `Space`: jump.
- Hold `Shift`: enable lock-on framing and target-facing behavior while held.
- Click the arena: capture the mouse with pointer lock.
- `Esc`: release pointer lock.
- Hold `Left mouse` and move the mouse: innervate the left stalk.
- Hold `Right mouse` and move the mouse: innervate the right stalk.
- Hold both mouse buttons: drive both stalks with the same mouse motion.
- While holding a stalk in the default top-down mode, scroll the mouse wheel to raise or lower the stalk control plane. Other stalk modes use the wheel for reach.
- Release a stalk: it stops actively steering and continues as an inertial rope under gravity, damping, and constraints.
- `Music`: toggle the procedural soundtrack.
- `Debug`: show or hide the text-only debug panel.

On-screen HUD:
- Top left: player health.
- Top right: current enemy or opponent health.
- Bottom left: left stalk top-down plane widget showing target point vs current point.
- Bottom right: right stalk top-down plane widget showing target point vs current point.
- Single Player: stage and enemy setup options appear before the match starts.
- Test Mode and Simulator: right-side tuning panel for terrain, HP, movement, trail, combat, stalk, bot-AI tuning, and simulator search scope.

## Gameplay Flow

1. Start in the menu and choose a mode.
2. Click into the arena to capture the mouse.
3. Move with the keyboard and use the mouse as a joystick for one or both stalks.
4. Hold `Shift` whenever you want the camera and facing to lock onto the current nearest live threat.
5. Build impact with fast stalk motion, body movement, or both.
6. Reduce the target's health to zero before they do the same to you.

Single-player win condition:
- The match ends when only one combatant is left alive.
- Pick a stage and enemy setup from the start menu before the match begins.
- The current single-player options are saved locally in the browser and remain separate from Test Mode settings.

Test mode flow:
- The match does not end automatically.
- Use the right-side panel to stage slider changes, apply them explicitly, reset the arena, or reset back to defaults.
- The current slider set is saved locally in the browser.

Simulator flow:
- The right-side panel runs a seeded batch of `100` matches by default.
- Stage search, enemy-mode search, HP, movement, combat, stalk, and bot settings can be staged and applied before a batch.
- Search scope can run only the current stage/mode or expand across all stage presets and all single-player enemy modes.
- The simulated human uses geometric field of view, short noisy target memory, imperfect movement, and jerky slash-like stalk inputs.
- After the batch completes, the arena shows a representative visual match.
- The panel reports overall and per-scenario win rate, duration, damage, hit events, trail usage, remaining HP, and can copy the report as JSON.

LAN multiplayer win condition:
- The match ends when only one human player remains alive, even if NPCs are still alive.

## Arena And Combat

### Terrain

- The shipped default arena is a flat `plane`.
- Single Player, Test Mode, and Simulator can swap the map to `plane`, `hyperboloid_bowl`, `sphere_dome`, `sphere_bowl`, `cone`, `paraboloid_bowl`, `saddle`, or `ripple_bowl`.
- Terrain remains heightfield-based in every mode: the surface is always `y = f(x, z)`.
- Snails stay upright while moving over the surface.
- Traversing slopes is intentionally easy; the terrain affects position more than body tilt.

### Camera

- The camera is a dedicated duel-follow camera rather than a free orbit camera.
- It uses a very wide field of view and sits close to the stalk line for an exaggerated, high-speed look.
- Lock-on changes both framing and facing behavior while held.

### Dual Stalks

- Every snail has two separate rope-driven eye stalks.
- Each stalk is simulated as a segmented chain with simple gravity and constraints.
- Stalk aim is limited by a forward-tilted hemisphere, so neutral aim is almost straight ahead and high pitch can reach downward.
- The default stalk control mode is `Top-Down Plane`: mouse X moves side-to-side and mouse Y moves forward/back on a body-local horizontal plane; scroll wheel raises or lowers that plane for held stalks.
- The tuning panel can still switch stalk controls between top-down plane, the original yaw/pitch chart, absolute dome reticle, virtual trackball, tangent velocity, and spring dome reticle mappings.
- Non-top-down modes still use scroll-wheel reach control. Held stalks also have outside-of-dome target sweep smoothing and a tunable turgidity value that blends from flaccid rope motion toward a stiff line to the target.
- A held stalk is pulled toward the requested joystick direction.
- An unheld stalk becomes inertial and keeps moving until gravity, damping, collisions, and constraints change it.
- Only eye contacts currently deal damage; shaft contact is collision-only.

### Damage Model

- Hits are evaluated from actual stalk movement, not from a canned attack animation or strike window.
- The simulation combines eye velocity with body movement to measure normal impact quality.
- Damage is bash-only: tangent sliding can bounce or slide, but it does not remove HP.
- Each stalk can deal damage if its strongest eye contact exceeds the threshold; stronger hits can remove more HP.
- Contact hysteresis prevents a held collision from re-arming bash damage until it separates or substantially renews its impulse.

### Wet Trails

- Snails leave behind permanent wet trail cells wherever they move.
- The trails are rendered as specular blue patches on the active terrain surface.
- Any snail contacting a trail receives `6x` movement speed, a `500%` increase.

### Death Burst

- When an NPC dies, its body rapidly swells and its pieces burst outward in random directions for about five seconds.
- The effect is intentionally rough and janky rather than polished.

## LAN Multiplayer

The LAN mode is authoritative and intentionally simple.

- The browser connects to a WebSocket server on port `2567`.
- In `npm run dev`, Vite auto-starts the multiplayer server and binds both HTTP and WebSocket services to `0.0.0.0` for LAN access.
- `npm run mp:server` starts the same server manually.
- There is one fixed room.
- The first client becomes player `1`.
- The second client becomes player `2`.
- A third client is rejected as room full.
- The server also spawns `40` NPC snails by default.
- `NPC_COUNT` can override the NPC count, clamped to `1..40`.
- Clients send inputs only.
- The server owns movement, jumps, rope simulation, hits, health, trails, and win state.
- If one player disconnects, the other is returned to a waiting state and the next join starts a fresh match.

## Development

Install dependencies:

```bash
npm install
```

Run the app in dev mode:

```bash
npm run dev
```

Run the standalone multiplayer server:

```bash
npm run mp:server
```

Build for production:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Preview the production build:

```bash
npm run preview
```

Run the controls probe:

```bash
npm run probe:controls
```

Every so often, re-run a quick online-readiness profile: measure authoritative tick cost, snapshot JSON size, stringify time, and estimated outbound bandwidth for both a 2-player room and the 2-player + 40-NPC LAN crowd. Record notable results in `WORKING_MEMORY.md`.

## Architecture

<details>
<summary>Main runtime and rendering</summary>

- `src/game/Game.js`: top-level runtime that owns the scene, renderer, actors, input, UI, debug, and the active session.
- `src/game/SinglePlayerSession.js`: local solo mode with persisted stage and encounter presets.
- `src/game/TestSession.js`: local endless tuning lab with persisted slider state and dynamic bot count.
- `src/game/Scene.js`: lights, arena mesh, and other scene setup.
- `src/game/Renderer.js`: Three.js renderer setup with fallback profiles for weaker WebGL environments.
- `src/game/CameraController.js`: follow camera and lock-on framing logic.
- `src/game/TrailRenderer.js`: renders the permanent wet trail cells from authoritative snapshots.
- `src/main.js`: boots the game and reports startup errors instead of failing silently.

</details>

<details>
<summary>Entities and view actors</summary>

- `src/entities/SnailActor.js`: shared rendered snail body, shell, stalk ropes, pupils, damage flash, health visuals, death burst, and snapshot application.
- `src/entities/PlayerSnail.js`: local player presentation actor and local input-facing helpers.
- `src/entities/NPCSnail.js`: presentation actor for non-local opponents and NPCs.

</details>

<details>
<summary>Input, HUD, and debug tools</summary>

- `src/controls/MouseControls.js`: pointer lock, held-button stalk ownership, and relative mouse delta capture.
- `src/controls/KeyboardControls.js`: movement axes, lock-on hold state, and jump requests.
- `src/utils/UI.js`: menu, overlays, HUD bars, stalk plane widgets, and music controls.
- `src/sim/Tuning.js`: shared tuning schema, default values, normalization, and bot/simulation profile derivation.
- `src/utils/Debug.js`: text-only debug panel and recent-event log.
- `src/utils/CollisionDetection.js`: debug-facing impact inspection against rendered actors.

</details>

<details>
<summary>Shared simulation and world state</summary>

- `src/sim/MatchSimulation.js`: authoritative match rules, player state, movement, jump, rope control, collisions, wet trails, health, and victory.
- `src/sim/StalkRope.js`: rope-chain helpers, target direction math, and impact evaluation.
- `src/sim/BotController.js`: NPC decision loop that drives the same authoritative input model as players.
- `src/sim/HumanLikeController.js`: deterministic simulated human input model for the balance harness.
- `src/sim/HumanVision.js`: simple geometric FOV and short noisy memory for simulator perception.
- `src/sim/BalanceRunner.js`: seeded batch runner and aggregate balance metrics.
- `src/world/Terrain.js`: shared terrain-preset math and mesh generation used by both rendering and simulation.

</details>

<details>
<summary>Sessions and networking</summary>

- `src/game/SinglePlayerSession.js`: runs the shared simulation locally against a simple enemy preset.
- `src/game/SimulatorSession.js`: runs visual humanlike-vs-bot balance batches and exposes simulator reports.
- `src/game/MultiplayerSession.js`: connects to the LAN server, sends local input, and renders authoritative snapshots.
- `src/network/LocalMultiplayerClient.js`: minimal browser WebSocket client for the fixed LAN room.
- `server/`: Node-side authoritative multiplayer runtime and minimal WebSocket server implementation.

</details>

<details>
<summary>Audio</summary>

- `src/audio/AudioController.js`: optional procedural soundtrack driven by the music toggle.

</details>

## Debugging

<details>
<summary>What the debug panel shows</summary>

- player tip to opponent distance
- opponent tip to player distance
- current session state
- local slot
- current control mode
- current impact power vs threshold
- mouse capture state
- current opponent state
- current opponent health
- current local stalk-tip position
- current opponent body position and radius
- recent combat and session events

The current debug mode is text-only. It does not add scene helpers, wireframes, or other debug geometry to the world.

</details>

## Implementation Notes

<details>
<summary>Current design choices</summary>

### Shared authoritative simulation

- Single-player and LAN multiplayer use the same movement, jump, stalk physics, trail, damage, and win logic.
- The browser client is primarily a renderer and input source.
- LAN clients do not author world state.
- Terrain is part of authoritative snapshot state, and Single Player, Test Mode, and Simulator expose terrain switching in the UI.

### Bot behavior

- Bots use a readable loop rather than the older erratic motion experiments.
- The main behavior phases are `approach`, `windup`, `strike`, and `recover`.
- Bots use the same dual-stalk input model as players, including one-sided and two-sided attacks.

### Camera and input direction

- Movement remains camera-relative.
- Lock-on is hold-to-enable, not a toggle.
- Mouse input is reserved for stalk control rather than orbit camera control.

### Systems that were removed or replaced

- boundary-based attack mode
- cursor raycast aiming
- orbit-camera mouse controls
- discrete strike windows
- the abandoned browser-only multiplayer scaffolding
- level progression and scaling enemy stats
- the old split documentation tree

### Technical notes

- The renderer tries multiple WebGL profiles before giving up.
- The multiplayer server is intentionally tiny and does not depend on a full networking stack.
- The project keeps the UI and visuals intentionally rough in places when that serves the game's awkward tone better than polish.

</details>
