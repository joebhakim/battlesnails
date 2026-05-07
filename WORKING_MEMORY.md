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

Damage is blunt contact response, not pressure. The contact solver measures eye closing speed toward the target, adds a configurable slice of attacker body velocity, then turns normal impulse into bash damage. Tangent sliding now contributes a smaller scrape channel using the eye bounce tangent damping force after a small speed deadzone. Bash contact memory only tracks renewed normal impulse, so scrape can tick during sliding without re-arming held bash damage. Innervation is intentionally not a final damage multiplier; it should matter by changing stalk motion and closing speed. Pressure is the wrong abstraction here because it would divide by contact area and make larger eyes less effective unless paired with a separate force model.

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

Current stalk-authority state as of 2026-05-04: the analytic stalk authority path is dramatically faster, but the old rope-authoritative stalks still feel much better. Treat old rope stalks as the current gameplay/feel baseline while optimizing around them. A downstream regression was found after the analytic merge: disabling analytic authority restored old rope simulation internally, but snapshots still omitted `stalk.nodes`, causing the renderer to fall back to synthetic straight/bent stalk reconstruction. The fix is to keep `ANALYTIC_STALK_AUTHORITY` configurable and include serialized rope nodes in local snapshots only when analytic authority is disabled; network snapshots still omit stalk payloads. The default is old rope authority again; use `VITE_ANALYTIC_STALK_AUTHORITY=1` or `ANALYTIC_STALK_AUTHORITY=1` only for explicit analytic experiments.

Old-rope aggressive optimization checkpoint on 2026-05-04, Adventure seed `137`, `15` NPCs, `random-lock`, `1280x720@1`, `20s + 3s warmup`, headful desktop browser: before old-rope-safe changes, `30.37 FPS`, game frame `31.74 ms avg / 48.1 ms p95`, session update `24.08 ms avg / 39.9 ms p95`, render `5.26 ms avg`, `355` draw calls avg. After changing world-prop spatial cells from `80` to `16`, per-stalk obstacle bounds pruning, and bot stalk fidelity tiers, the same benchmark reached `66.85 FPS`, game frame `11.38 ms avg / 17.1 ms p95`, session update `3.65 ms avg / 9.2 ms p95`, render `5.30 ms avg`, `362` draw calls avg. Fidelity tier rule: humans and bots within `18` units of any living human use full old rope prop/body collision; distant bots use cheaper terrain-only stalk constraints.

Optimization checkpoint on 2026-05-05 after removing hidden permanent actors for batched props, reducing ground-detail LOD distance to `165`, lowering bot full-stalk-fidelity radius to `12`, hiding far non-focused bot stalk presentation, and merging damage indicators per target: Node `explorer_mossland` 15-bot random-lock sim improved from `6.80 ms` avg step to `5.51 ms` avg step. Headful Adventure seed `137`, 15 NPCs, 10s + 2s warmup, `1280x720@1`, `--no-gl-finish`: `69.60 FPS`, game frame `8.77 ms avg / 13.5 ms p95`, session update `3.66 ms avg / 8.1 ms p95`, render `3.17 ms avg / 4.2 ms p95`, scene meshes `947 avg / 844 visible avg` versus the prior `35.93 FPS` and `23,334` scene meshes. No-extra-NPC Adventure baseline: `70.13 FPS`, game frame `3.51 ms avg / 4.4 ms p95`, scene meshes `812 avg`. 16-snail plane Arena random-lock after damage-window target merging: `69.90 FPS`, game frame `4.50 ms avg / 6.2 ms p95`, render `0.91 ms avg / 1.3 ms p95`, no frames over `50 ms`; before that damage grouping pass, the same shape was about `28 FPS` with render p95 spikes over `160 ms`.

120 Hz / 16-snail experiment checkpoint on 2026-05-06, branch `try-120hz-16-snails`: `BATTLESNAILS_120HZ=1` or `VITE_BATTLESNAILS_120HZ=1` makes the fixed tick `120 Hz`; profiler-only `--stalk-authority rope|human_rope|analytic` selects the authoritative stalk model. Node sim-only plane Arena, `15` bots plus player, `8s + 1s warmup`, `input stress`, no presentation: rope `0.94 ms avg / 1.21 ms p95` sim step, human-rope `0.52 ms avg / 0.73 ms p95`, analytic `0.46 ms avg / 0.62 ms p95`. Headful browser plane Arena, `15` bots plus player, `12s + 2s warmup`, `1280x720@1`, `input random-lock`, `--no-gl-finish`: rope projected-120 frame `3.96 ms avg / 5.9 ms p95`, game frame `5.89 ms avg / 8.0 ms p95`; human-rope projected-120 `3.54 ms avg / 5.5 ms p95`, game frame `5.17 ms avg / 6.9 ms p95`; analytic after fixed-step clock cleanup projected-120 `3.43 ms avg / 5.3 ms p95`, game frame `5.00 ms avg / 6.6 ms p95`. Effective FPS stayed `65-69` because this desktop/browser run is still RAF-display-cadence limited, so use the projected-120 bucket plus a true 120 Hz monitor playtest before declaring victory. Render cost was already low in this plane stress (`~0.8-1.1 ms p95`, `~147` draw calls max, `~84k-88k` triangles p95). The branch also skips rebuilding synthetic stalk node chains for hidden remote stalks and caps catch-up to four fixed sim ticks per frame so a 144 Hz display no longer over-simulates.

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

Use Asset Studio for the visual/worldgen feedback loop when an individual prop, collision primitive, or LOD path looks wrong. Browser URL form: `/?asset-studio=1&asset=dry_leaf_patch&index=0&lod=near&view=three-quarter`. Screenshot form: `npm run asset:shot -- --asset dry_leaf_patch --index 0 --lod near`. The default screenshot command writes paired single-view images: one visual-only and one with an inflated cyan collision overlay. This intentionally goes through `WorldPropActor` and `WorldPropBatchActor`, so `lod=near` and `lod=far` can expose mismatches between detailed ground-cover plates, simplified far ground-cover meshes, and analytic collision bounds. Multi-angle contact sheets were deferred; if we bring them back, stitch separate screenshots rather than overriding the live renderer viewport.

Asset collision v5 moves the worst drift-prone props to `collisionShape.type = "visual_mesh"`: mushrooms, salt cones, rock spires, bamboo, shrubs, trees, fallen/root branches, twigs, rotting logs, lichen towers, and shell shards. Their runtime collision is now lazily extracted from the same `createPropMesh` render geometry and decimated by triangle limits stored on the collision shape, instead of maintaining hand-copied boxes/cylinders/capsules. Asset Studio collision screenshots now render those derived triangle meshes; body support, planar separation, and stalk obstacles can consume them generically. Ground-cover patches intentionally remain analytic polygon-prism support surfaces, not triangle meshes.

Current v5 review artifacts: `asset_studio/review-v5`. Useful metric changes from `collision-jaccard.json`: `salt_cone` `0.8029`, `rock_spire` `0.9984`, `shell_shard` `0.9210`, `talus_rock` `0.8346`, `forest_rock` `0.8591`. Shrubs/trees/branches still have modest raw Jaccard because thin/occluded silhouettes make the mask harsh, but their collision excess dropped sharply and the overlay is now visibly generated from the rendered mesh. Mushroom remains low numerically (`0.0037`) because the large transparent cap overlay interacts badly with the silhouette mask, but the v5 collision image includes the cap, stem, underside, rim, and spots.

## Mobile Controls

The first mobile beta deliberately avoids gyro/motion sensing and uses touch controls that emit the existing local input packet: virtual move pad, right-side drag pad for camera/stalk aim, hold buttons for left/right/both stalks, jump/interact buttons, lock-on toggle, and up/down plane buttons that mimic scroll-wheel reach deltas. The mobile branch keeps the web/Vite/Three stack viable for later motion control: browser `DeviceOrientationEvent`/`DeviceMotionEvent` can be added behind an explicit tap-to-enable calibration flow on secure origins, then mapped into the same `MobileControls` packet. Likely gyro prototype mapping: roll sweeps stalks left/right, pitch adjusts plane height or turgidity/reach, yaw assists snail/camera turn, and thumbs still decide left/right/both stalk engagement.
