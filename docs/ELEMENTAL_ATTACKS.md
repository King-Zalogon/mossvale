# Elemental attack direction and material (#173)

## Design review before sprite production

Reviewed against `dist/maps/registries.json`, all eighteen species/moves, and the independent Lantern Crossing registry. The twelve registered display names below select effects; species IDs and creature poses do not select exceptions. No Holy element is introduced. Bramblebuck's Briar brace uses Bloom petal/blossom material; its thorn-like move description does not silently reclassify the creature. Rillume's Bell pulse remains Water, and Lanternix's Charge chime remains Spark.

Design decisions were recorded before generation. These are internal design decisions under the owner's request to complete the issue; they do not claim a new owner art approval.

| Element | Silhouette/material and palette | Preparation | Directed travel | Contact and recovery | Calm key pose |
| --- | --- | --- | --- | --- | --- |
| Leaf | Three pointed, veined leaf blades; dark forest outline, lime face, pale vein | Leaves gather in a compact fan | Blades sweep in a shallow cutting arc toward the rival | Two crossing leaf cuts, torn tips drift away | Crossed leaf blades at the target |
| Water | Cohesive curling water jet with a round leading splash; deep teal, blue and white foam | Small wave curls up | Jet unrolls toward the rival with a continuous water tail | Crown splash breaks into round droplets | Crown splash and droplets |
| Stone | One heavy angular rock; umber outline, slate/tan facets | Chips lift around the rock | Solid chunk follows a low, weighted arc | Rock breaks into angular chips and dust | Faceted fractured rock |
| Fire | A tapered fireball with a trailing flame; dark red, orange, yellow-white core | Compact ember grows into flame | Fireball travels nose-first, flame tail behind it | Short upward tongues and hot fragments flare then contract | Fiery impact tongues |
| Ice | Three long, sharp translucent shards; navy edge, cyan faces and white glints | Crystals form together | Narrow spear-like shards fly toward the rival | Shards break into pointed crystal splinters | Shattered sharp shards |
| Spark | A branched, jagged electrical bolt; blue edge, bright cyan, pale yellow core | Two small electrical forks charge | Bolt connects source to target, with branches along the path | Tight branching discharge and short sparks at the target | Branched target discharge |
| Air | Open curved wind strokes with gaps; desaturated blue, lavender-white | Short wind curls collect | A twisting, mostly transparent gust sweeps toward the rival | Wind strokes spread and unravel, without solid debris | Open sweeping wind strokes |
| Spore | Rounded fungal spores and a soft clustered puff; plum, mauve and pale cream | Three round spores lift | Cluster drifts in a gentle bob toward the rival | Localized mushroom-like spore cloud, round dots disperse | Round spore cloud |
| Bloom | Broad flower petals and small five-petal blossoms; berry outline, pink, peach and cream | Small blossom opens | Petals and blossoms roll toward the rival | Flower bursts into broad petals, not cutting Leaf blades | Open blossom with petals |
| Mire | Heavy irregular opaque mud glob; dark brown/olive, moss highlight | Glob bulges and sheds two drops | Wet lump travels in a sagging arc, heavier than clear Water | Low dark splat with short muddy droplets | Broad dark mud splat |
| Sand | Many small individual grains in a sweeping stream; brown, ochre, pale sand | Granules gather in a low curl | Granular ribbon sweeps forward; no large Stone chunks | Fine grains scatter in a low fan | Scattered granular fan |
| Frost | Broad pale freezing wave, rimed curls and crystalline lace; blue-grey, pale blue, white | Rime grows into a small crest | Broad translucent cold front advances; no Ice spears | Short branching frost pattern spreads on the target | Branching frost lace |

Each material has six authored cells: charge, launch, travel A, travel B, impact, dissolve. Travel cells face right; enemy attacks mirror horizontally, including directional tails and lightning branches. Source and target anchors are the centers of the visible creature canvases, recalculated for the current viewport. Effects remain inside the battle scene, above actors and below text.

Normal ally playback divides the existing 650 ms into preparation 100 ms, travel 280 ms and contact/recovery 270 ms. Enemy elemental playback divides its existing 700 ms into 100/300/300 ms. Preparation acknowledges the move immediately; HP, damage text, target recoil and contact audio appear at contact. The resolved domain state, RNG, save transaction and action-lock duration are unchanged. Calm motion shows one static material-specific contact pose during the existing 250 ms beat; it does not travel, shake or flash.

Quick strike retains its ordinary attack. Both allies and enemies use the same elemental pipeline. Existing five-state creature sheets remain compatible; an attack row or static portrait accompanies the separate effect. Unknown custom pack elements and unavailable optional effect images have an explicit neutral directional fallback, never a falsely labelled golden aura.

## Sources and application

The [Saint11 attack pose tutorial](https://saint11.art/img/pixel-tutorials/AttackSheet.gif) was inspected for clear preparation, action silhouette and recovery. The [pokeemerald battle animation scripts](https://github.com/pret/pokeemerald/blob/master/data/battle_anim_scripts.s) and [electric animation implementation](https://github.com/pret/pokeemerald/blob/master/src/battle_anim_electric.c) were inspected for separate attacker/target coordinates, directed material and timed contact. These inform sequencing; no Pokemon artwork, animation data or source code is copied into Mossvale. All new effect art is original and its generation/export evidence is retained under `art/effects/`.
