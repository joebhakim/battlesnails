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

- Current 2-human snapshot payload: `3,165` bytes JSON.
- Current 2-human + 40-NPC snapshot payload: roughly `70-90 KiB` JSON depending on trail state.
- 42 active actors with bot AI, trails, stalk collisions, and forced alive state: `5.48 ms/tick`, about `183 ticks/sec`, roughly `3x` CPU headroom against a 60 Hz server tick.
- 42-player snapshot stringify: about `0.184 ms` per JSON payload.
- Estimated outbound bandwidth at 60 Hz to two clients:
  - 2 humans: about `3 Mbps`.
  - 2 humans + 40 NPCs: about `67-85 Mbps`.
- The sim CPU is acceptable for one current-style room; the full JSON snapshot protocol is the online bottleneck.
- Snapshot byte breakdown for 2 humans: total `3,165` bytes; players `2,895`; stalks `2,364`; stalk node arrays `1,204`; top-level metadata about `238`.
- Rounding all numbers to 3 decimals only reduced the 2-human payload by about `14%`; a compact array sketch reduced it by about `75%`. Main bloat is JSON object shape plus repeated fields and full rope nodes, not precision alone.
