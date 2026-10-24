# Scene reaction art (#270)

The three retained generated sources are [`notice-generated.png`](source/scene-reactions/notice-generated.png), [`surprise-generated.png`](source/scene-reactions/surprise-generated.png), and [`happy-generated.png`](source/scene-reactions/happy-generated.png). They depict the canonical traveler with a hand-to-brow notice pose, raised-hands surprise pose, and smiling raised-fist happy pose.

[`prepare-scene-reactions.py`](prepare-scene-reactions.py) removes only near-transparent matte pixels, crops the visible silhouette, and exports each pose to a 160 × 256 RGBA cell with a bottom-center anchor. Runtime assets are optional: if one is unavailable, the existing text/glyph reaction remains visible.

These sources are an internal authored draft; owner visual approval remains pending. `docs/SCENE_ACTIONS.md` records the reduced-motion behavior: the pose is held statically for the shorter reaction window.
