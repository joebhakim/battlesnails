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
