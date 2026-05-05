# BattleSnails

BattleSnails is a deliberately jarring third-person arena game built with Three.js and Vite. You control a blue snail, drive two floppy eye stalks with held mouse input, fight across configurable terrain, and leave permanent wet trails that turn the map into a speed trap.

The project currently supports five modes:
- `Arena`: configurable local combat against one or more enemy presets, with persisted stage and encounter options
- `The Hunt`: the named `Moss Atoll` explorer map, with seven continuous forest hexes wrapped by a twelve-hex beach ring, shallow water, fixed landmarks, dense micro-props, and configurable NPC snail count/strength
- `LAN Multiplayer`: two human players in Arena 1v1, Adventure co-op PvE, or Adventure PvP formats
- `Test Mode`: a debug-key tuning lab with staged sliders, configurable bot count, and an explicit apply step
- `Simulator`: a debug-key balance harness that batch-runs a simulated humanlike player against the bot

The browser client handles rendering, input, HUD, music, simulator reports, and debug tools. The actual match rules live in a shared authoritative simulation used by local modes and the LAN server.

## Table Of Contents

- [Quick Start](#quick-start)
- [Modes And Rules](#modes-and-rules)
- [Controls](#controls)
- [Gameplay Flow](#gameplay-flow)
- [Arena And Combat](#arena-and-combat)
- [LAN Multiplayer](#lan-multiplayer)
- [Development](#development)
- [Deployment](#deployment)
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

5. Choose `Arena`, `The Hunt`, or `LAN Multiplayer` from the start menu. Press the backtick key to reveal `Test Mode` and `Simulator`.

If you want to run the WebSocket server separately, use:

```bash
npm run mp:server
```

## Deployment

The static browser client is Netlify-ready. Production deploys use `npm run build` and publish the generated `dist` directory, as configured in `netlify.toml`.

Netlify serves Arena, The Hunt, debug modes, and the browser client. The LAN multiplayer WebSocket server is still a separate Node process and needs a separate host before online multiplayer can work from the deployed site.

## Modes And Rules

- `Arena`: one human player vs a simple encounter preset chosen from the start menu. Stages include the conic-section heightfields plus small, extreme designed event arenas.
- `The Hunt`: one human player on the `Moss Atoll` forest/beach map. Setup is intentionally narrow: choose NPC snail count and a `1..9` strength scale.
- `LAN Multiplayer`: two human players in Arena 1v1, Adventure co-op PvE, or Adventure PvP.
- `Test Mode`: hidden behind the backtick key; one human player plus `0..40` local bots, staged tuning controls, local browser persistence for the last-used lab settings, and switchable terrain presets.
- `Simulator`: hidden behind the backtick key; an automated browser-visible balance runner. It runs an average-but-skilled simulated humanlike player across selected stage/enemy-mode searches, reports aggregate and per-scenario metrics, replays a representative match, and uses the same duel knobs for HP, movement, combat, stalk, and bot behavior.
- Human players have `600 HP` by default.
- Bots and NPCs have `600 HP` by default.
- Each stalk can deal damage independently on a strong enough contact.
- Damage is momentum-based and scales with impact strength, not button-window-based.
- Passive body contact does not deal damage.
- Body overlap only pushes snails apart.
- Snails automatically climb world props through cheap primitive surface queries rather than mesh collision.
- There is no level progression.
- There is no persistence, matchmaking, auth, rollback, or prediction.

## Controls

- `WASD` or arrow keys: move relative to the camera.
- Outside lock-on, backward and pure side movement backpedal or strafe without rotating the body; forward-diagonal movement turns.
- `Space`: jump.
- Hold `Shift`: enable lock-on framing and target-facing behavior while held.
- `E` in The Hunt: nibble a nearby rotting log.
- Click the arena: capture the mouse with pointer lock.
- With pointer lock and no stalk button held, move the mouse horizontally to turn the snail in free mode.
- `Esc`: release pointer lock.
- Hold `Left mouse` and move the mouse: innervate the left stalk.
- Hold `Right mouse` and move the mouse: innervate the right stalk.
- Hold both mouse buttons: drive both stalks with the same mouse motion.
- While holding a stalk in the default top-down mode, scroll the mouse wheel to raise or lower the stalk control plane. Other stalk modes use the wheel for reach.
- Release a stalk: it stops actively steering and continues as an inertial rope under gravity, damping, and constraints.
- `Music`: toggle the procedural soundtrack.
- `Debug`: show or hide the text-only debug panel.
- Backtick key: show or hide the debug-only Test Mode and Simulator menu entries.

On-screen HUD:
- Top left: player health.
- Top right: current enemy or opponent health.
- Bottom left: left stalk top-down plane widget showing target point vs current point.
- Bottom right: right stalk top-down plane widget showing target point vs current point.
- Arena: stage and enemy setup options appear before the match starts.
- The Hunt: choose NPC snail count and strength before entering the deterministic `Moss Atoll` expedition.
- Test Mode and Simulator: hidden until the backtick key is pressed, then right-side tuning panels expose terrain, HP, movement, trail, combat, stalk, bot-AI tuning, and simulator search scope.

## Gameplay Flow

1. Start in the menu and choose a mode.
2. Click into the arena to capture the mouse.
3. Move with the keyboard and use the mouse as a joystick for one or both stalks.
4. Hold `Shift` whenever you want the camera and facing to lock onto the current nearest live threat.
5. Build impact with fast stalk motion, body movement, or both.
6. Reduce the target's health to zero before they do the same to you.

Arena win condition:
- The match ends when only one combatant is left alive.
- Pick a stage and enemy setup from the start menu before the match begins.
- The current Arena options are saved locally in the browser and remain separate from Test Mode settings.

The Hunt flow:
- The map is `Moss Atoll`: seven contiguous forest hexes sharing one continuous terrain and prop process, outlined by a twelve-hex beach ring and shallow transparent water.
- Forest, beach, and water are masks over global coordinate-space terrain/noise fields rather than independently generated tile chunks, so height and density waves continue across tile boundaries.
- Massive trees and the rocky mountain landmark stay fixed so the world can be learned.
- Current worldgen aims for snail-scale concerns: rough climbable dry-leaf carpet polygons, thick moss carpet polygons, dirt-with-sticks patches, exposed root branches, twigs, young plants, wet dew beads and pools, mushrooms, rotting logs, lichen towers, old shell shards, ant roads, salt piles, gravel, high mountain talus, dense deciduous/conifer tree clusters, and giant tree/mountain landmarks.
- Prop queries use a spatial grid broadphase so the denser forest-floor clutter does not force every collision pass to scan the whole explorer map.
- The Hunt props are climbable analytic surfaces; walking into a mushroom, log, rock, salt pile, dew bead, raised leaf/moss/dirt polygon, slender tree trunk, or vertical landmark tree automatically attaches and crawls without a separate button.
- The generated world can be exported as sparse Unicode grids for feature symbols and elevation buckets via `createExplorerMapGrids` or `npm run map:explorer -- <seed> <cellSize>`. For tile previews, pass `--shape hex --hex-radius <units> --hex-rotation-deg <degrees> --output <path>` to clip the printed map to a candidate hex.
- Press `E` near a rotting log to nibble it; this is cosmetic and gives no resource, health, score, or progression.
- The Rocky Crown boss is optional; defeating it does not end exploration.

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
- Arena 1v1 and Adventure PvP end when only one human player remains alive.
- Adventure co-op PvE continues while at least one human and one enemy are alive.

## Arena And Combat

### Terrain

- The shipped default arena is a flat `plane`.
- Arena can swap the map to `plane`, `hyperboloid_bowl`, `sphere_dome`, `sphere_bowl`, `cone`, `paraboloid_bowl`, `saddle`, `ripple_bowl`, or the designed event stages: `Dew Rush`, `Salt Bowl`, `Shell Derby`, `Feast Frenzy`, `High Leaf`, `Bird Panic`, and `Calcium Crown`.
- The Hunt uses the generated forest-floor terrain and prop generator as its full expedition map.
- Terrain remains heightfield-based in every mode: the surface is always `y = f(x, z)`.
- Snails stay upright while moving over the surface.
- Snails use a cheap blob drop shadow for vertical readability, especially while jumping, falling, or climbing props.
- Body vertical velocity has light damping so jumps and drops read more like a platformer than a raw ballistic arc.
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
- Damage has two channels: bash damage from normal impulse, and lower scrape damage from tangential damping while the eye slides across a target.
- Each stalk can deal damage if its strongest eye contact exceeds the threshold; stronger hits can remove more HP.
- Contact hysteresis prevents a held collision from re-arming bash damage until it separates or substantially renews its impulse. Scrape does not re-arm bash.

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
- There is one fixed two-player room.
- The first client becomes player `1`.
- The second client becomes player `2`.
- A third client is rejected as room full.
- Arena 1v1 starts with only the two human players.
- Adventure co-op PvE and Adventure PvP use the generated forest-floor world with a boss enemy.
- The online target is `30 Hz` server-to-client dynamic snapshots while the authoritative simulation keeps running at `60 Hz`.
- `NETWORK_SNAPSHOT_RATE` can override the server-to-client snapshot rate for experiments, clamped to `10..60` Hz and defaulting to `30` Hz.
- Clients send inputs only.
- The server owns movement, jumps, rope simulation, hits, health, trails, and win state.
- LAN match start sends static terrain/prop/player metadata once; regular snapshots send dynamic state plus trail-cell deltas.
- LAN snapshots omit authoritative stalk rope nodes; clients draw remote stalks as procedural visuals from compact player state.
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

Run TypeScript checks:

```bash
npm run typecheck
```

Preview the production build:

```bash
npm run preview
```

Run the controls probe:

```bash
npm run probe:controls
```

Print the explorer Unicode feature and elevation maps:

```bash
npm run map:explorer -- 137 50
```

Open a single generated asset in the browser Asset Studio:

```text
http://localhost:5173/?asset-studio=1&asset=dry_leaf_patch&index=0&lod=near&view=three-quarter
```

Capture repeatable visual and collision/support screenshots of one generated asset through the same Three.js prop renderer used by gameplay:

```bash
npm run asset:shot -- --asset dry_leaf_patch --index 0 --lod near
```

By default this writes two images under `asset_studio/`: `*-visual.png` and `*-collision.png`. Use this as the main prop-iteration loop when changing generated forest-floor assets:

```bash
npm run asset:shot -- --asset dry_leaf_patch --index 0 --lod near --collision-only --output asset_studio/dry-leaf-collision.png
npm run asset:shot -- --asset moss_mat --index 0 --lod near --collision-only --output asset_studio/moss-collision.png
npm run asset:shot -- --asset dirt_stick_patch --index 0 --lod near --collision-only --output asset_studio/dirt-stick-collision.png
```

For ordinary primitive props, the collision image shows the collision primitive. For v5 `visual_mesh` props such as mushrooms, salt cones, shell shards, shrubs, trees, bamboo, logs, and branches, the collision image shows a decimated triangle collision mesh extracted from the same `createPropMesh` rendered geometry used by gameplay. For rough ground-cover props such as `dry_leaf_patch`, `moss_mat`, and `dirt_stick_patch`, the overlay shows the sampled support surface that the snail rides in the simulation, not a literal render mesh triangle-by-triangle collision model. That support surface is generated from the same footprint, relief, grain, scale, and edge-blend data used by gameplay, so it is the right debugging view for bumpy-road movement. Use `--lod near|far`, `--view three-quarter|top|side`, `--seed`, `--index`, `--id`, `--labels`, `--headful`, `--single`, `--visual-only`, `--collision-only`, and `--output` to compare detail meshes, far simplified meshes, collision/support surfaces, and generated prop variants.

Capture every generated asset kind as visual/collision pairs and contact sheets:

```bash
npm run asset:suite -- --output-dir asset_studio/review-v5 --seed 137 --width 960 --height 540
```

Then measure the rough screen-space overlap between visual silhouettes and cyan collision overlays:

```bash
npm run asset:jaccard -- --dir asset_studio/review-v5 --output asset_studio/review-v5/collision-jaccard.json
```

The Jaccard metric is a smoke-test for collision/visual drift, not a physical truth source. It is useful for chunky isolated assets and noisy for very thin or heavily occluded assets.

Run the headless Arena performance profile:

```bash
npm run perf:arena -- --bots 40
```

By default this runs a deterministic `15s` mixed-input soak: random movement, target navigation, lock-on, free turning, stalk swinging, reach-wheel pulses, and jump pulses. It also validates finite player/stalk/event/trail state while it runs, so this is the quick headless sanity check for movement and physics bugs. Use `--input idle` for the old idle-human profile, or `--input walk` for a simple forward-walk profile.

For CI, add thresholds so regressions fail the command:

```bash
npm run perf:arena -- --bots 40 --max-local-frame-p95-ms 16 --max-sim-step-p95-ms 8
```

This profiler does not measure WebGL draw time. It measures deterministic authoritative Arena simulation, snapshot export/stringify cost, and Three.js presentation actor sync without a browser.

Run the headless Chromium Arena draw-time profile:

```bash
npm run perf:browser-arena -- --bots 40 --seconds 8 --warmup 1
```

Run the same browser profiler against the dense Adventure world:

```bash
npm run perf:browser -- --mode adventure --seconds 8 --warmup 1
```

Use the browser profiler as the main rendering feedback loop when changing worldgen density, actor rendering, culling, batching, trails, camera range, materials, or renderer settings:

```bash
npm run perf:browser -- --mode adventure --seconds 20 --warmup 3 --headful
```

Use this heavier stress profile when testing lock-on combat with many rendered snails:

```bash
npm run perf:browser -- --mode adventure --npcs 15 --input random-lock --seconds 20 --warmup 3 --headful
```

For production-build measurements, run preview in one terminal and point the profiler at it from another:

```bash
npm run build
npm run preview -- --host 127.0.0.1
npm run perf:browser -- --mode adventure --url http://127.0.0.1:4173/ --seconds 20 --warmup 3 --headful
```

The browser profiler measures the live Three.js scene in Chromium. The primary draw metric is `renderer.render(...)` plus `gl.finish()`, and the report also includes effective FPS, update time, session tick time, draw calls, triangles, and scene mesh counts. Use `--width`, `--height`, `--device-scale-factor`, `--input idle|walk|roam`, `--scene-sample-every`, `--headful`, and optional CI thresholds such as `--max-render-p95-ms`, `--max-frame-p95-ms`, and `--min-fps`.

Prefer `--headful` for matching the FPS you see while playing. Headless Chromium is useful for repeatable CI-style timing buckets, but some machines throttle headless `requestAnimationFrame`, so `effectiveFps` can be misleading even when measured update/render work is under budget. When that happens, compare `game frame`, `update`, `render + finish`, draw calls, triangles, and visible meshes against the baselines in `WORKING_MEMORY.md`.

## Architecture

<details>
<summary>Main runtime and rendering</summary>

- `src/game/Game.ts`: top-level runtime that owns the scene, renderer, actors, input, UI, debug, and the active session.
- `src/game/SinglePlayerSession.ts`: local solo mode with persisted stage and encounter presets.
- `src/game/ExplorerSession.ts`: local mossland expedition mode with world props and one optional boss.
- `src/game/TestSession.ts`: local endless tuning lab with persisted slider state and dynamic bot count.
- `src/game/Scene.ts`: lights, arena mesh, and other scene setup.
- `src/game/Renderer.ts`: Three.js renderer setup with fallback profiles for weaker WebGL environments.
- `src/game/CameraController.ts`: follow camera and lock-on framing logic.
- `src/game/TrailRenderer.ts`: renders the permanent wet trail cells from authoritative snapshots.
- `src/main.ts`: boots the game and reports startup errors instead of failing silently.

</details>

<details>
<summary>Entities and view actors</summary>

- `src/entities/SnailActor.ts`: shared rendered snail body, shell, stalk ropes, pupils, damage flash, health visuals, death burst, and snapshot application.
- `src/entities/PlayerSnail.ts`: local player presentation actor and local input-facing helpers.
- `src/entities/NPCSnail.ts`: presentation actor for non-local opponents and NPCs.

</details>

<details>
<summary>Input, HUD, and debug tools</summary>

- `src/controls/MouseControls.ts`: pointer lock, idle free-turn capture, held-button stalk ownership, and relative mouse delta capture.
- `src/controls/KeyboardControls.ts`: movement axes, lock-on hold state, jump requests, and explorer interact requests.
- `src/utils/UI.ts`: menu, overlays, HUD bars, stalk plane widgets, and music controls.
- `src/sim/Tuning.ts`: shared tuning schema, default values, normalization, and bot/simulation profile derivation.
- `src/utils/Debug.ts`: text-only debug panel and recent-event log.
- `src/utils/CollisionDetection.ts`: debug-facing impact inspection against rendered actors.

</details>

<details>
<summary>Shared simulation and world state</summary>

- `src/protocol/InputProtocol.ts`: shared input defaults and normalization used by browser sessions, bots, simulator tooling, and the LAN server.
- `src/protocol/SnapshotProtocol.ts`: custom network snapshot merge and trail-delta helpers. This is the home for future quantized network payloads.
- `src/sim/MatchSimulation.ts`: authoritative match orchestrator for player state, movement, jump, rope control, collisions, wet trails, health, and victory.
- `src/sim/SnapshotSerialization.ts`: sim-owned full and network snapshot DTO construction.
- `src/sim/PlayerStateSystem.ts`: spawn point selection, terrain-aware spawn clearance, fixture/static target state, and profile reapplication.
- `src/sim/CollisionShape.ts`: shared collision-shape cloning, radius, and height helpers.
- `src/sim/WorldPropSystem.ts`: normalized world prop state, fixture placement, and world-prop spatial indexing.
- `src/sim/PowerupSystem.ts`: coveted resource pickups, direct debug grants, stat mutation, and rotting-log interaction events.
- `src/sim/MatchLifecycleSystem.ts`: living-player filtering, target preference, and mode-specific win/draw evaluation.
- `src/sim/MovementSupportSystem.ts`: terrain/water grounding, climbable prop support, and planar world-prop collision.
- `src/sim/SpatialIndex.ts`: reusable broadphase grid used by world prop and player queries.
- `src/sim/StalkControlSystem.ts`: stalk state creation, held-input control modes, target lag, attachment translation, and stalk snapshot helpers.
- `src/sim/DamageSystem.ts`: stalk impact damage, contact hysteresis, damage events, and knockback application.
- `src/sim/StalkRope.ts`: rope-chain helpers, target direction math, and impact evaluation.
- `src/sim/TrailSystem.ts`: wet trail cell storage, deposition, contact queries, and serialization helpers.
- `src/sim/CreatureSystem.ts`: non-snail creature defaults, bird movement constants, cover helpers, and creature serialization.
- `src/sim/BotController.ts`: NPC decision loop that drives the same authoritative input model as players.
- `src/sim/HumanLikeController.ts`: deterministic simulated human input model for the balance harness.
- `src/sim/HumanVision.ts`: simple geometric FOV and short noisy memory for simulator perception.
- `src/sim/BalanceRunner.ts`: seeded batch runner and aggregate balance metrics.
- `src/world/Terrain.ts`: shared terrain-preset math and mesh generation used by both rendering and simulation.
- `src/world/ExplorerWorld.ts`: deterministic explorer terrain, landmark, prop generation, and coarse Unicode map-grid export.

</details>

<details>
<summary>Sessions and networking</summary>

- `src/game/SinglePlayerSession.ts`: runs the shared simulation locally against a simple enemy preset.
- `src/game/SimulatorSession.ts`: runs visual humanlike-vs-bot balance batches and exposes simulator reports.
- `src/game/MultiplayerSession.ts`: connects to the LAN server, sends local input, and renders authoritative snapshots.
- `src/network/LocalMultiplayerClient.ts`: minimal browser WebSocket client for the fixed LAN room.
- `server/`: Node-side authoritative multiplayer runtime and minimal WebSocket server implementation.

</details>

<details>
<summary>Audio</summary>

- `src/audio/AudioController.ts`: optional procedural soundtrack driven by the music toggle.

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

- Arena, The Hunt, and LAN multiplayer use the same movement, jump, stalk physics, trail, damage, and win logic.
- The browser client is primarily a renderer and input source.
- LAN clients do not author world state.
- Terrain is part of authoritative snapshot state. Arena uses conic-section and designed event stages; The Hunt uses the generated forest-floor map as its full expedition map.

### Bot behavior

- Bots use a readable loop rather than the older erratic motion experiments.
- The main behavior phases are `approach`, `windup`, `strike`, and `recover`.
- Bots use the same dual-stalk input model as players, including one-sided and two-sided attacks.

### Camera and input direction

- Movement remains camera-relative.
- Lock-on is hold-to-enable, not a toggle.
- Pointer-locked idle mouse X turns the snail in free mode; held mouse buttons reserve mouse motion for stalk control.
- Mouse input does not orbit the camera.

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
- Runtime code, server code, tests, scripts, and Vite config are TypeScript. Node-side commands run through `tsx`; production builds run `tsc --noEmit` before Vite.
- The multiplayer server is intentionally tiny and does not depend on a full networking stack.
- The project keeps the UI and visuals intentionally rough in places when that serves the game's awkward tone better than polish.

</details>
