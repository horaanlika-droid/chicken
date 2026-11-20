# CUTOUT CINEMA — Visual style guide v1

## Intent

Original 2D cut-out language for small, authored stories. Characters are built from flat, reusable pieces with deliberate joints and limited, readable movement. The frame should feel like printed matter brought to life—not a 3D render, a photorealistic puppet, or a copy of an existing television style.

## Graphic rules

- **Silhouette first:** identifiable at thumbnail size; broad jacket, oversized delivery cube, loose trousers, chunky sneakers.
- **Shape language:** angular jackets and architecture against rounded head, hands and bag corners.
- **Contour:** near-black, slightly imperfect 3–5 px outlines at the 360×640 authoring size. Internal folds use thinner, quieter strokes.
- **Layering:** rear prop and back limbs → legs → torso → front limbs → head/face details. Joint pivots remain explicit and named.
- **Movement:** mostly held poses with intentional pose changes. Walks use a compact opposing-arm/leg cycle; camera moves remain slow and controlled.

## Palette

| Role | Color |
|---|---|
| asphalt / outline | `#222722` |
| stairwell concrete | `#4E594F` |
| worn limestone | `#9C9685` |
| technical silver | `#C4C4B9` |
| delivery yellow | `#F1D21A` |
| paper / warm highlight | `#E6E0CF` |

Yellow is the single high-saturation accent. Reserve it for the delivery bag, small jacket details and selected interface states.

## Texture and light

- Sparse xerox/paper grain; keep face and silhouette edges legible.
- Hard outlines plus one restrained shadow plane per object.
- Muted green-gray night environments with isolated warm practical lights.
- Avoid soft gradients on character pieces; reserve gentle gradients for light falloff and depth.

## Character continuity: Courier v1

- One adult male courier, fixed front three-quarter view for the current rig.
- Black/silver technical windbreaker with small yellow details; dark loose cargo trousers; bulky silver/black early-2000s sneakers.
- Bright yellow square insulated backpack, consistently oversized relative to the torso.
- Head, torso, both arms, hands, upper/lower legs, knees and backpack are independently named rig parts.
- Keep limb lengths and head size fixed. Do not add facial or outfit details on a per-shot basis without updating the rig asset.

## Avoid

- Photorealistic skin, realistic fabric rendering, 3D plastic shading, dense texture, extra accent colors, tiny unreadable details, changing outfit proportions, or copying the line/shape vocabulary of a named series.
