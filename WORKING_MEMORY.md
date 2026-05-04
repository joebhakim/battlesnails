# Working Memory

## Stalk Control Experiments

The alternate mouse-to-stalk mappings were implemented for comparison, but they felt too subtle to solve the main control issue by themselves.

- `Yaw/Pitch Chart`: original two-angle chart on the forward-tilted hemisphere.
- `Absolute Dome Reticle`: mouse moves a virtual `(u, v)` cursor in the rear-facing disk, then maps to the hemisphere with `z = sqrt(1 - u^2 - v^2)`.
- `Virtual Trackball`: mouse deltas rotate the current target vector along the hemisphere.
- `Tangent Velocity`: mouse deltas move the target in the tangent plane at the current vector, then project back to the hemisphere.
- `Spring Dome Reticle`: absolute dome reticle plus a first-order spring lag.

These also did not solve the core feel problem well enough:

- Mouse wheel controls stalk target reach/depth for held stalks.
- Large left/right thrashes should sweep around the outside of the forward hemisphere instead of jumping directly across the chord.
- Stalk turgidity should be tunable: `0` keeps today's flaccid rope behavior, while `1` makes the held stalk behave like a stiff line to the target.

The current default experiment is `Top-Down Plane`: store a body-local target point `(x, y, z)`, move its `(x, z)` components directly with mouse X/Y as if seen from above, clamp it to the forward reachable range, and derive stalk direction/reach from that point. Scroll wheel moves the horizontal control plane up/down by changing `y`.

## Combat Feedback

Damage is blunt delivered normal impulse, not pressure. The contact solver measures eye closing speed toward the target, adds a configurable slice of attacker body velocity, then damage scales by stalk/eye radius mass scale. Tangent sliding is non-damaging; it was too confusing as a damage source. Innervation is intentionally not a final damage multiplier; it should matter by changing stalk motion and closing speed. Pressure is the wrong abstraction here because it would divide by contact area and make larger eyes less effective unless paired with a separate force model.

## Terrain Clearance

Grounded snail height is terrain height plus terrain-aware body clearance. The quick approximation treats the body as a horizontal capsule with visual radius `R = 1` and half-length `S = 1`: center clearance is about `groundSkin + R * sqrt(1 + |slope|^2) + S * |slopeAlongBody| + 0.5 * positiveCurvature * footprintReach^2`. `aboveGroundHeight` is now just the tiny final ground skin, not the spawn height. `spawnDropHeight` is the separate vertical spawn offset that makes snails visibly fall in. Clearance is intentionally calculated from numerical derivatives of `getTerrainHeight`, not hard-coded by terrain preset, because the conic/ripple curvature constants are likely to change.

The exaggerated hover test used final visible hover `8`, producing a plane center height of `9`, which confirmed the setting reaches single player but was the wrong behavior. The normal final skin is `0`; sampled grounded center clearances are roughly: plane `1`, hyperboloid `2`, sphere dome `2.25`, sphere bowl `2.71`, cone `3.16`, paraboloid/saddle `3.67`, ripple `4.41`.

## Online Performance Checkpoints

Measured on 2026-05-02 in Node on the local dev machine. Re-run these occasionally as local/single-player changes accumulate, especially after changing snapshot shape, trail serialization, stalk node counts, bot counts, or collision rules.

- Before network-shape reduction, the 2-human snapshot payload was `3,165` bytes JSON, mostly player state; `2,364` bytes were stalks and `1,204` bytes were stalk node arrays.
- Before network-shape reduction, the full 2-human + 40-NPC authoritative snapshot payload was roughly `70-90 KiB` JSON depending on trail state.
- 42 active actors with bot AI, trails, stalk collisions, and forced alive state: `5.48 ms/tick`, about `183 ticks/sec`, roughly `3x` CPU headroom against a 60 Hz server tick.
- 42-player snapshot stringify: about `0.184 ms` per JSON payload.
- After omitting stalk nodes and splitting static metadata from dynamic updates, a 42-player match measured: internal authoritative snapshot `97,086` bytes, one-time static network snapshot `19,572` bytes, repeated dynamic network snapshot `13,130` bytes, and dynamic snapshot plus ten trail-cell deltas `13,315` bytes.
- The target online rate is `30 Hz` dynamic snapshots from a `60 Hz` authoritative sim. At that rate, the 42-player dynamic payload is about `3.15 Mbps` per receiving client before WebSocket framing. At `20 Hz` it is about `2.10 Mbps`; at `10 Hz` it is about `1.05 Mbps`, but those lower rates are fallback/LOD experiments rather than the main combat target.
- The sim CPU is acceptable for one current-style room; the remaining network bottleneck is JSON object shape, repeated dynamic player field names, and unquantized vector numbers.
- Rounding all numbers to 3 decimals previously reduced the 2-human payload by only about `14%`; a compact array sketch reduced it by about `75%`. Main bloat is still JSON object shape plus repeated fields, even though full rope nodes are no longer transmitted.

## Browser Rendering Checkpoints

Measured on 2026-05-04 on this desktop with the browser profiler. Re-run this loop when changing Adventure/worldgen density, prop rendering, batching, culling, trails, materials, camera draw distance, or renderer settings. Use `--headful` when possible to match real play FPS; headless Chromium on this machine appears to throttle `requestAnimationFrame` to roughly `13 FPS`, so measured timing buckets are more reliable than headless `effectiveFps`.

Current feedback-loop command:

```bash
npm run perf:browser -- --mode adventure --seconds 20 --warmup 3 --headful
```

Current production-preview loop:

```bash
npm run build
npm run preview -- --host 127.0.0.1
npm run perf:browser -- --mode adventure --url http://127.0.0.1:4173/ --seconds 20 --warmup 3 --headful
```

Headless Adventure baseline on `main`, seed `137`, `1280x720@1`, `input roam`, `gl.finish on`, dev server, `8s + 1s warmup`:

- Headless effective FPS: `13.18`, but likely RAF-throttled in this shell.
- Game frame timing: `9.51 ms avg`, `11.1 ms p95`, `14.1 ms max`.
- Update timing: `5.06 ms avg`, `6.3 ms p95`; session update `3.88 ms avg`, `5.0 ms p95`; session per tick `1.29 ms avg`, `1.67 ms p95`.
- Render timing: `4.44 ms avg`, `5.4 ms p95`, `6.6 ms max`; `gl.finish` wait was negligible at `0.01 ms avg`.
- Renderer load: `157` draw calls avg, `198` max; `157k` triangles avg, `179k` p95; `84` geometries max; `26` textures max.
- Scene load: about `6.0k` visible meshes avg, `6.1k` p95/max; `1988` world props; final trail cells about `325`.

Headless Adventure with `--no-gl-finish` was effectively the same: `13.05` effective FPS, `9.86 ms` game frame avg, `12.3 ms` p95, `4.62 ms` render avg, `5.6 ms` render p95. This suggests GPU queue waiting is not the measured bottleneck in headless Chromium.

Production preview headless Adventure baseline on the same scene was also similar: `12.73` effective FPS, `10.04 ms` game frame avg, `13.1 ms` p95, `4.77 ms` render avg, `6.4 ms` render p95, about `156` draw calls avg and `159k` triangles avg. Dev-server overhead is not the obvious cause of the local `30-60 FPS` play reports.

Headless Arena browser baseline on `main`, plane stage, `40` bots plus player, `1280x720@1`, `6s + 1s warmup`:

- Headless effective FPS: `10.84`, also likely RAF-throttled.
- Game frame timing: `26.20 ms avg`, `32.1 ms p95`; session update `16.05 ms avg`; session per tick `5.35 ms avg`.
- Render timing: `3.66 ms avg`, `4.6 ms p95`.
- Renderer load: about `1058` draw calls avg, `1211` max; `148k` triangles avg, `161k` max; about `1.1k-1.2k` visible meshes.

Headful Adventure real-desktop baseline on `main`, seed `137`, `1280x720@1`, `input roam`, `20s + 3s warmup`:

- Effective FPS: `70.00`; interval `14.29 ms avg`, `15.9 ms p95`, `24.8 ms max`, no frames over `50 ms`.
- Game frame timing: `6.93 ms avg`, `11.2 ms p95`, `17.0 ms max`.
- Update timing: `2.27 ms avg`, `3.3 ms p95`; session update `1.09 ms avg`, `1.6 ms p95`; session per tick `1.28 ms avg`, `1.6 ms p95`.
- Render timing: `4.66 ms avg`, `7.9 ms p95`, `13.1 ms max`; `gl.finish` wait was negligible.
- Renderer load: about `92` draw calls avg, `232` max; `109k` triangles avg, `167k` p95; about `6.5k` visible meshes avg.

Headful Adventure lock-on stress profile on `main`, seed `137`, `15` extra NPC snails plus boss, `input random-lock`, `1280x720@1`, `20s + 3s warmup`:

- Command: `npm run perf:browser -- --mode adventure --npcs 15 --input random-lock --seconds 20 --warmup 3 --headful`
- Effective FPS: `22.99`; interval `43.50 ms avg`, `56.6 ms p95`, `77.1 ms max`, `139` frames over `50 ms`.
- Game frame timing: `42.25 ms avg`, `55.1 ms p95`, `74.9 ms max`.
- Update timing: `33.01 ms avg`, `43.1 ms p95`; session update `30.45 ms avg`, `40.2 ms p95`; session per tick `11.93 ms avg`, `13.5 ms p95`, `18.13 ms max`.
- Render timing: `9.24 ms avg`, `12.3 ms p95`, `17.3 ms max`; `gl.finish` wait was negligible.
- Renderer load: about `1856` draw calls avg, `3109` p95, `3228` max; `292k` triangles avg, `341k` p95; about `7.6k` visible meshes avg.
- Interpretation: this stress case is primarily simulation-bound (`session update` dominates), with a secondary draw-call/render cost from many snail actors and active stalks. It is much more representative of the lock-on combat slowdown than the empty Adventure roam baseline.

On 2026-05-04, `aggressive-optimizations` was branched from `main` after merging `analytic-stalk-prototype`. The same 15-NPC random-lock stress shape became fast enough after analytic authority plus render batching:

- After analytic stalk authority only, 10s headful stress: `69.77 FPS`, `11.15 ms` game frame avg, `13.2 ms` p95; session update `1.36 ms` avg, `1.9 ms` p95; render `7.31 ms` avg, `9.2 ms` p95; draw calls `1161` avg, `1795` p95.
- After wet-trail instancing and player-pair broadphase: `69.53 FPS`, `9.17 ms` game frame avg, `10.9 ms` p95; render `5.44 ms` avg, `6.1 ms` p95; draw calls `468` avg, `534` p95.
- After per-snail stalk segment instancing: `70.07 FPS`, `8.75 ms` game frame avg, `10.2 ms` p95; render `5.12 ms` avg, `5.8 ms` p95; draw calls `314` avg, `374` p95.
- Current remaining cost is not the old all-rope sim wall; it is normal render/update overhead plus triangle count. Trails and stalk segments are no longer the main draw-call explosion.

Node-only analytic stalk prototype comparison on 2026-05-04, `40` bots plus player, plane Arena, `8s + 1s warmup`:

- `main` sim-only: `5.35 ms/tick avg`, `5.90 ms/tick p95`, about `187 ticks/sec`.
- `analytic-stalk-prototype` sim-only: `0.65 ms/tick avg`, `0.91 ms/tick p95`, about `1542 ticks/sec`, roughly `8.25x` faster than `main`.
- With Node-side presentation sync included: `main` local frame `6.43 ms avg`; analytic branch `1.15 ms avg`.
- Snapshot size also improved on analytic: network snapshot `16.6 KiB avg` to `15.2 KiB avg`; full snapshot `107.5 KiB avg` to `72.8 KiB avg`.
- No explicit laptop/other-machine perf numbers were found in repo notes as of this check.

## TypeScript Migration

The codebase is now TypeScript end to end: browser runtime, shared sim, server, tests, scripts, and Vite config all use `.ts` sources. Node commands use `tsx`; browser imports keep `.js` specifiers for ESM compatibility under TypeScript bundler resolution. The first migration pass is intentionally behavior-preserving and compiler-loose (`strict: false`, `noImplicitAny: false`) with many internal `declare ...: any` class fields. Tightening public simulation/network shapes and then re-enabling stricter compiler flags should be done incrementally after gameplay churn slows.

## Explorer Worldgen V3

Explorer worldgen v3 should feel like a snail-scale forest floor rather than a human-scale terrain demo. The ground-cover layer is now a deterministic random-site Voronoi patchwork over most non-mountain forest floor: roughly `60%` rough dry-leaf carpet, `30%` moss mat, and `10%` dirt-with-sticks. These cells must render from their clipped polygon footprints without random actor rotation, otherwise they stop reading as a tessellation and look like placed patches. Do not generate individual dead-leaf props or flower petals. Keep leaf debris as rough, climbable polygon-prism cells with oriented overlapping “snake scale” facets; the sim uses cheap point-in-polygon top support plus a ridged height function, not mesh collision. Moss and dirt cells use the same polygon support at lower relief. Keep bare dirt as explicit `dirt_stick_patch` cells rather than exposed empty terrain. The prop language is: beauty/wetness (`dew_bead`, `dew_pool`, moss cushions/mats), edible decay/cover (`rotting_log`, mushrooms), fretting/danger mood (`salt_cone`, rough dry-leaf carpet patches, ant roads), and climbable memory anchors (`giant_tree`, `deciduous_tree`, `conifer_tree`, lichen towers, shell shards, rocky crown, root branches, twigs, talus rocks). Keep new props expressed as existing cheap primitives or analytic polygon prisms. Tree collision uses slim trunks, with deciduous and conifer canopies as visual mass rather than fat collision bodies. The denser prop field is backed by a spatial grid broadphase in the sim. Use `npm run map:explorer -- <seed> <cellSize>` to inspect the Unicode feature/elevation grids.

Snail readability now includes a visual-only blob drop shadow plus light `bodyVerticalDamping` on vertical velocity. Keep that damping modest; it is for platformer readability, not for turning jumps into a heavy hover.

## Mobile Controls

The first mobile beta deliberately avoids gyro/motion sensing and uses touch controls that emit the existing local input packet: virtual move pad, right-side drag pad for camera/stalk aim, hold buttons for left/right/both stalks, jump/interact buttons, lock-on toggle, and up/down plane buttons that mimic scroll-wheel reach deltas. The mobile branch keeps the web/Vite/Three stack viable for later motion control: browser `DeviceOrientationEvent`/`DeviceMotionEvent` can be added behind an explicit tap-to-enable calibration flow on secure origins, then mapped into the same `MobileControls` packet. Likely gyro prototype mapping: roll sweeps stalks left/right, pitch adjusts plane height or turgidity/reach, yaw assists snail/camera turn, and thumbs still decide left/right/both stalk engagement.
