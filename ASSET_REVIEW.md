# BattleSnails Asset Review

This file tracks the two-pass Asset Studio audit requested on 2026-05-05. The image sets are kept on disk for side-by-side review.

## Checklist

- [x] Inventory Asset Studio tooling and asset kinds.
- [x] Capture baseline `review-v1` visual and collision images.
- [x] Review baseline assets for realism, performance, LOD, size, and collision fit.
- [x] Implement first improvement pass, producing assets v2.
- [x] Capture `review-v2` visual and collision images.
- [x] Review assets v2.
- [x] Implement second improvement pass, producing assets v3.
- [x] Capture `review-v3` visual and collision images.
- [x] Write final v3 review notes.
- [x] Run verification.
- [x] Implement v4 collision-derived overlay pass for branches, bamboo, shrubs, shell shards, rocks, and tree branches.
- [x] Capture `review-v4` visual/collision images and screen-space collision Jaccard metrics.

## Image Sets

- Baseline: `asset_studio/review-v1`
- Assets v2: `asset_studio/review-v2`
- Assets v3: `asset_studio/review-v3`
- Assets v4 collision pass: `asset_studio/review-v4`

Each set contains `*-visual.png`, `*-collision.png`, `metadata.json`, and contact sheets when generated.
The v4 set also contains `collision-jaccard.json`, a rough screen-space mask Jaccard between visual silhouettes and cyan collision overlays.

## Baseline Review, V1

| Asset | Realism | Perf | LOD | Size/Ratio | Action For V2 |
| --- | --- | --- | --- | --- | --- |
| `ant_trail` | Too thin to read as a trail. | Very cheap. | Batches fine. | Long, nearly invisible. | Thicken visual road and add dotted ant-scale texture. |
| `bamboo_stick` | Reads as a single green line. | Cheap. | Batches fine. | Collision is tall and broad compared to line. | Add nodes/leaves for silhouette; keep primitive collision. |
| `conifer_tree` | Too schematic: trunk plus top cone. | Medium due tree count. | Batched; far draw OK. | Tall/narrow is good, foliage too high. | Add lower branch needles and more cone tiers. |
| `deciduous_tree` | Better trunk scale, but branch leaves are sparse and ornamental. | Medium. | Batched; far draw OK. | Tall/narrow is good. | Add bark bands and more branch density. |
| `dew_bead` | Clear readable magic dew. | Individual, low count. | No cheaper LOD needed yet. | Some beads are intentionally huge. | Keep. |
| `dew_pool` | Reads as water but too cropped in studio. | Individual, low count. | No cheaper LOD needed yet. | Flat pool OK. | Keep for now. |
| `dirt_stick_patch` | Good dirt floor concept, sticks could be more legible. | High for ground patches, but batched. | Has near/far ground cover behavior. | Good low bumpy plate. | Leave geometry, monitor cost. |
| `dry_leaf_patch` | Strongest asset; reads as rough leaf litter. | High local geometry, batched. | Far simplification exists. | Good snail-scale roughness. | Keep. |
| `fallen_branch` | Reads as branch, slightly clean. | Cheap/medium. | Batched. | Good angled line. | Keep, maybe later add bark. |
| `forest_rock` | Good faceted rock. | Cheap. | Batched. | Often large enough for vantage. | Keep. |
| `giant_tree` | Landmark scale works; trunk/canopy too sparse in studio. | Medium. | Batched. | Tall/narrow correct. | Improve tree shared visual. |
| `gravel` | Good tiny chunk. | Cheap but many. | Batched. | Correct snail-scale smallness. | Keep. |
| `lichen_tower` | Too much like a faceted pole with crown. | Cheap. | Batched. | Good climb marker, odd silhouette. | Add shelf-like lichen plates. |
| `moss_cushion` | Too smooth, reads like green puck. | Cheap. | Batched. | Good cushion scale. | Defer to v3 after moss mat review. |
| `moss_mat` | Improved over earlier, but still reads as green polygon under bumps. | High local geometry, batched. | Far simplification exists. | Good broad floor tile. | Keep for v2, revisit v3. |
| `mushroom` | Too clean and pancake-like. | Cheap; moderate count. | Batched. | Magical large mushrooms are OK. | Add gills/spots and more domed cap. |
| `rock` | Good faceted boulder. | Cheap. | Batched. | Some are very large, intentionally. | Keep. |
| `rock_cluster` | Good grouped silhouette. | Cheap/medium. | Batched. | Good. | Keep. |
| `rock_spire` | Simple cone, useful landmark/arena marker. | Cheap. | Batched. | Good extreme shape. | Keep. |
| `root_branch` | Functional branch line; clean. | Cheap. | Batched. | Good. | Keep. |
| `rotting_log` | Too clean cylinder. | Individual, moderate count. | No far LOD yet; count low. | Good scale, too smooth. | Add bark bands and knots. |
| `salt_cone` | Simple and readable. | Cheap. | Batched. | Good. | Keep. |
| `sharp_grit` | Good small triangular danger/power object. | Individual, moderate count. | No far LOD needed yet. | Good pickup scale. | Keep. |
| `shell_shard` | Too much like a rectangular plank. | Individual, moderate count. | No far LOD needed yet. | Correct small pickup size. | Replace box visual with tapered shard. |
| `shrub` | Reads as small abstract bush but too sparse; collision appears columnar. | Medium/high because many stems/leaves. | Batched. | Size range useful for horizon breakup. | Add leaf density, keep primitive collision. |
| `soft_food` | Reads as edible lump, a bit too clean. | Individual, many. | No far LOD yet; watch count. | Good pickup size. | Add mold spots. |
| `sprout` | Simple but readable. | Cheap but many. | Batched. | Good size variety from generator. | Keep. |
| `talus_rock` | Good faceted large rock. | Cheap. | Batched. | Good mountain scale. | Keep. |
| `twig` | Too thin in studio, but useful floor clutter. | Cheap but many. | Batched. | Good. | Keep unless visibility remains poor. |

## V2 Changes

- Added bark bands, denser branch/needle silhouettes, and lower conifer foliage in shared tree rendering.
- Added bamboo nodes and small leaves so sticks read as plant matter rather than a single line.
- Added mushroom underside, gills, and cap spots.
- Added mold spots to soft food.
- Added more shrub leaves while keeping primitive collision.
- Thickened ant trails and added more visible ant-dot pattern.
- Added shelf plates to lichen towers.
- Replaced shell shard box visuals with tapered shard geometry and a ridge.
- Added rings and knots to rotting logs.

## V2 Review

The v2 contact sheets are a clear improvement over baseline: logs, shrubs, lichen towers, shell shards, and deciduous trees now read faster. The remaining weak assets are the ones whose silhouette is still too thin or too smooth from the Asset Studio camera.

| Asset | Realism | Perf | LOD | Size/Ratio | Action For V3 |
| --- | --- | --- | --- | --- | --- |
| `ant_trail` | Still nearly invisible; reads like a single scratch. | Very cheap. | No LOD concern. | Too narrow for debugging or play readability. | Make it a broader dirt seam with dark broken marks. |
| `bamboo_stick` | Nodes help, but the pole is still too thin at review distance. | Cheap. | No LOD concern. | Collision remains bigger than visual; acceptable for climbable abstraction. | Thicken only the rendered pole/nodes. |
| `conifer_tree` | Better, but still trunk-heavy and sparse for a forest landmark. | Medium; added meshes are acceptable because tree count is controlled. | Current distant simplification still OK. | Tall/narrow correct; foliage should start lower. | Add lower/larger tiers and more branch spokes. |
| `moss_cushion` | Still too much like a smooth green puck. | Cheap. | No LOD concern. | Good object scale. | Split into overlapping moss lobes. |
| `mushroom` | Still pancake-clean; spots/gills are hard to see from side view. | Cheap/medium. | No LOD concern. | Magical size is OK; cap needs stronger dome/rim. | Dome cap more and add visible side rim/spots. |
| `soft_food` | Mold spots are subtle but acceptable. | Cheap enough at current counts. | Watch if pickup count grows. | Good pickup scale. | Keep for v3. |
| Ground patches | Dry leaves, moss mat, and dirt sticks read well and are worth their geometry cost. | Highest local geometry, but batched. | Existing near/far approach is the right path. | Good snail-scale roughness. | Keep for v3. |
| Rocks/logs/shrubs/sprouts/pickups | Broadly acceptable after v2. | Mostly cheap or batched. | Current strategy acceptable. | Good enough for alpha review. | Keep unless v3 screenshots expose regressions. |

## V3 Changes

- Made conifer foliage start lower, added two more foliage tiers, and increased conifer branch spokes.
- Thickened rendered bamboo stems and nodes without changing the collision abstraction.
- Rebuilt moss cushions as overlapping low lobes instead of one smooth sphere.
- Made mushrooms more domed and added a visible rim plus side spots.
- Turned ant trails into broad low dirt seams with broken dark marks and ant dots.

## Final Review, V3

| Asset | Realism | Perf | LOD | Size/Ratio | Status / Next Improvement |
| --- | --- | --- | --- | --- | --- |
| `ant_trail` | Low but legible as an ant road in world; still reads thin in studio because it is extremely long and flat. | Very cheap. | No LOD concern. | Length is huge compared to width by design. | Accept for now; if it matters, render as clustered ant traffic instead of a floor seam. |
| `bamboo_stick` | Better nodes and leaf flags; now reads as segmented plant matter. | Cheap, batched. | No LOD concern. | Rendered shaft is slightly exaggerated; collision remains intentionally generous. | Accept. |
| `conifer_tree` | Improved landmark silhouette with lower tiers; still abstract. | Medium; many instances, but simple cones/cylinders and batched. | Current batching is acceptable; future far tree impostors may help. | Tall/narrow works better than v1/v2. | Accept. |
| `deciduous_tree` | Abstract but recognizable; bark bands and branches help. | Medium; many instances, batched. | Current batching OK. | Tall/narrow trunk reads closer to real forest scale. | Accept; later add sparse canopy variation. |
| `dew_bead` | Strong stylized dew read. | Low, individual pickup count is moderate. | No current LOD need. | Intentionally magical-large. | Accept. |
| `dew_pool` | Cheap transparent pool, very plain but readable. | Low. | No current LOD need. | Flat and broad. | Accept; later add shoreline/ripple only if cheap. |
| `dirt_stick_patch` | Good snail-scale dirt/root floor. | High local geometry, but batched and worth it. | Near/far ground-cover path is the right strategy. | Bumpy low plate with usable roughness. | Accept. |
| `dry_leaf_patch` | Strongest floor tile; evokes crinkled leaves with simple polygons. | Highest local geometry, batched. | Near/far strategy important. | Good roughness and coverage. | Accept. |
| `fallen_branch` | Simple but recognizable branch. | Cheap/medium, batched. | No current LOD concern. | Good long obstacle/vantage aspect. | Accept; later bark bands if needed. |
| `forest_rock` | Good faceted forest boulder. | Cheap, batched. | No current LOD concern. | Large enough for snail vantage. | Accept. |
| `giant_tree` | Landmark role works; visual is still sparse when isolated. | Medium, only a few instances. | Fine. | Correct massive/narrow scale. | Accept; later add base roots and canopy breakup. |
| `gravel` | Good tiny faceted chunk. | Cheap but many, batched. | Fine. | Correct snail-scale grit. | Accept. |
| `lichen_tower` | Shelf plates helped; now reads as weird lichen rather than a pole. | Cheap, batched. | Fine. | Good small climb marker. | Accept. |
| `moss_cushion` | Improved from smooth puck, but still reads chunky in studio. | Cheap, batched. | Fine. | Large cushion scale is useful. | Accept with caveat; v4 could add top micro-lobes or merge with moss mat style. |
| `moss_mat` | Good thick moss tile; simple but evocative. | High local geometry, batched. | Near/far strategy important. | Good low continuous terrain. | Accept. |
| `mushroom` | More readable after rim/side spots; intentionally magical-large. | Cheap/medium, batched. | Fine. | Wide cap is deliberate, but collision cylinder is visibly broad. | Accept. |
| `rock` | Good faceted boulder. | Cheap, batched. | Fine. | Good large obstacle. | Accept. |
| `rock_cluster` | Good grouped rocky silhouette. | Cheap/medium, batched. | Fine. | Good mountain/forest transition shape. | Accept. |
| `rock_spire` | Extreme simple landmark, readable. | Cheap. | Fine. | Huge cone is intentionally gamey. | Accept. |
| `root_branch` | Plain but useful ground obstacle. | Cheap, batched. | Fine. | Good root scale. | Accept. |
| `rotting_log` | Bark rings/knots made it much better. | Medium individual props, but count is low. | Future far simplification possible. | Good long edible/climbable object. | Accept. |
| `salt_cone` | Clear salt pile. | Cheap, batched. | Fine. | Good small hazard/pickup scale. | Accept. |
| `sharp_grit` | Simple tetra reads as sharp mineral chunk. | Low, individual count moderate. | Fine. | Correct pickup scale. | Accept. |
| `shell_shard` | Better tapered shard; still very small in studio. | Low, individual count moderate. | Fine. | Correct small calcium pickup. | Accept; later color striping would help. |
| `shrub` | Denser and horizon-breaking. | Medium/high per shrub, batched; watch counts. | Fine for now. | Collision is much narrower than leaves, intentionally sticky/forgiving. | Accept. |
| `soft_food` | Readable soft lump with subtle mold spots. | Low/medium, individual count is high enough to watch. | Future far pickup simplification possible. | Good pickup scale. | Accept. |
| `sprout` | Simple and readable; useful vertical clutter. | Cheap but very many, batched. | Fine. | Size variety is good. | Accept. |
| `talus_rock` | Good faceted mountain rock. | Cheap, batched. | Fine. | Good intermediate rock scale. | Accept. |
| `twig` | Still thin but recognizable as floor clutter. | Cheap, batched. | Fine. | Correct small obstacle scale. | Accept. |

## Residual Notes

- Asset Studio collision overlays are still primitive-shape diagnostics, not perfect physical-surface renderings. Ground-cover patches are the exception: their collision/support surfaces are much closer to their visual geometry.
- The most expensive visual category remains rough ground cover: `dry_leaf_patch`, `moss_mat`, and `dirt_stick_patch`. They are also carrying most of the forest-floor feel, so the current tradeoff is intentional.
- The next likely art/perf pass should target LOD/impostors for trees and far ground patches before reducing asset density.

## V4 Collision Pass

The v4 pass responds to the collision-review issue: several overlays were still showing old primitive boxes/cylinders even after the visual assets became branchy, tapered, or faceted. V4 adds mesh-derived collision parts to the generated prop descriptors and uses those parts in Asset Studio overlays and stalk/world-prop collision obstacles.

| Asset | V4 Collision Change | Perf / Risk | Metric Note |
| --- | --- | --- | --- |
| `fallen_branch` | Added capsule parts for the main angled limb and each smaller side branch, derived from the same visual formulas. | More stalk obstacle checks only when nearby; body climbing still uses the cheap log support model. | Screen-space Jaccard is low because it is a very thin object, but the collision image now shows branch capsules instead of a slab. |
| `bamboo_stick` | Added a shaft capsule plus node spheres; Asset Studio framing now uses mesh radius instead of the old box footprint. | Cheap, very few parts. | Good excess rate; low Jaccard mostly comes from thin-line aliasing. |
| `shrub` | Widened the coarse body cylinder and added stem capsules plus leaf spheres for overlay/stalk collision. | Higher local part count, but shrubs are batched visually and spatially culled for collision. | Still approximate because leaves are dodecahedra while collision uses spheres. |
| `shell_shard` | Replaced the box collision with a tapered polygon prism footprint derived from the shard mesh. | Cheap; also makes gameplay support/pickup footprint less rectangular. | Better shape, but the tiny asset makes mask metrics noisy. |
| `talus_rock` / rocks | Collision overlay for sphere-backed faceted rocks now renders as a faceted dodecahedron rather than a high-segment sphere. | Physics remains cheap sphere support. | `talus_rock` Jaccard is now high: 0.8346 in `review-v4`. |
| Trees | Added mesh-derived trunk, branch, leaf-cluster, needle-tier, and canopy parts; tree tests now assert branch collision parts exist. | Larger broadphase radius around trees; acceptable because tree count is controlled and nearby queries are spatially indexed. | Full tree silhouette metrics remain modest because branches/leaves overlap and occlude heavily in this camera view. |

The Jaccard metric in `asset_studio/review-v4/collision-jaccard.json` is a diagnostic, not a pass/fail gate. It works best for chunky isolated assets like rocks/dew and is noisy for extremely thin or heavily occluded assets such as ant trails, branches, and trees.

## V5 Visual-Mesh Collision Pass

V5 removes the misleading second source of truth for the worst offenders. Generated mushrooms, salt cones, rock spires, bamboo sticks, shrubs, trees, fallen branches, root branches, twigs, rotting logs, lichen towers, and shell shards now declare `collisionShape.type = "visual_mesh"`. The runtime lazily extracts a decimated triangle collision mesh from the same `createPropMesh` geometry used for rendering, then uses that mesh for Asset Studio overlays, body support/attachment, planar body separation, and stalk collision obstacles.

| Asset | V5 Result | Metric Note |
| --- | --- | --- |
| `salt_cone` / `rock_spire` | No more cylinder overlay; collision is cone/spire triangles. | `salt_cone` improved to 0.8029 Jaccard and `rock_spire` to 0.9984 in `review-v5`. |
| `shell_shard` | Collision now includes the actual shard mesh and ridge instead of a rectangular/polygon proxy. | `shell_shard` improved to 0.9210 Jaccard. |
| `shrub` / trees | Branches and leaves come from the actual render mesh, not hand-copied formulas. | Jaccard remains modest because these are thin, occluded, and visually busy, but excess dropped sharply. |
| `mushroom` | Collision includes cap, stem, underside, spots, and rim from the rendered mesh. | Screen-space Jaccard is still low because the cap dominates and the cyan overlay is transparent, but the collision image is no longer missing geometry. |
| Branch/log assets | Collision is now a triangle mesh of the rendered branch/log rather than box/capsule formula copies. | Thin silhouettes still make the mask metric harsh; visual inspection is more useful here. |

The v5 screenshots and metric file are in `asset_studio/review-v5`. The old primitive path still exists for simple rocks, dew, gravel, and test fixtures; rough ground cover still uses the sampled support-surface model because that is the gameplay surface.
