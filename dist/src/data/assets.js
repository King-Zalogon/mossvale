/* Asset manifest: every image the game loads. Validated at build time by scripts/validate-assets.mjs (see docs/ASSETS.md).
   name   - what it looks like (never a story role), kebab-case, unique; maps and species refer to this
   kind   - prop | creature | person | item; decides the folder: assets/<kind>s/ (people, props, creatures, items)
   w, h   - source pixel size of the PNG; anchor - where the sprite stands on its tile (feet at bottom-centre)
   required:true assets block play until they load (with retry); required:false assets fall back silently. */
export const assets = [
  {name: 'tree-oak', kind: 'prop', src: 'assets/props/tree-oak.png', w: 307, h: 348, anchor: 'bottom-center', required: true},
  {name: 'tree-pine', kind: 'prop', src: 'assets/props/tree-pine.png', w: 246, h: 355, anchor: 'bottom-center', required: true},
  {name: 'cottage-tiled', kind: 'prop', src: 'assets/props/cottage-tiled.png', w: 312, h: 359, anchor: 'bottom-center', required: true},
  {name: 'boulder-mossy', kind: 'prop', src: 'assets/props/boulder-mossy.png', w: 261, h: 228, anchor: 'bottom-center', required: true},
  {name: 'creature-fernling', kind: 'creature', src: 'assets/creatures/creature-fernling.png', w: 281, h: 281, anchor: 'bottom-center', required: true},
  {name: 'creature-emberkin', kind: 'creature', src: 'assets/creatures/creature-emberkin.png', w: 270, h: 274, anchor: 'bottom-center', required: true},
  {name: 'creature-brooklet', kind: 'creature', src: 'assets/creatures/creature-brooklet.png', w: 279, h: 208, anchor: 'bottom-center', required: true},
  {name: 'creature-duskwing', kind: 'creature', src: 'assets/creatures/creature-duskwing.png', w: 282, h: 260, anchor: 'bottom-center', required: true},
  {name: 'person-red-cap-south', kind: 'person', src: 'assets/people/person-red-cap-south.png', w: 144, h: 256, anchor: 'bottom-center', required: true},
  {name: 'person-red-cap-north', kind: 'person', src: 'assets/people/person-red-cap-north.png', w: 142, h: 256, anchor: 'bottom-center', required: true},
  {name: 'person-red-cap-west', kind: 'person', src: 'assets/people/person-red-cap-west.png', w: 158, h: 256, anchor: 'bottom-center', required: true},
  {name: 'person-red-cap-east', kind: 'person', src: 'assets/people/person-red-cap-east.png', w: 162, h: 256, anchor: 'bottom-center', required: true},
  {name: 'grass-tuft', kind: 'prop', src: 'assets/props/grass-tuft.png', w: 267, h: 214, anchor: 'bottom-center', required: true},
  {name: 'bush-flowering', kind: 'prop', src: 'assets/props/bush-flowering.png', w: 295, h: 253, anchor: 'bottom-center', required: true},
  {name: 'signpost-wood', kind: 'prop', src: 'assets/props/signpost-wood.png', w: 208, h: 269, anchor: 'bottom-center', required: true},
  {name: 'item-capture-orb', kind: 'item', src: 'assets/items/item-capture-orb.png', w: 177, h: 177, anchor: 'bottom-center', required: false},
  {name: 'creature-voltkit', kind: 'creature', src: 'assets/creatures/creature-voltkit.png', w: 366, h: 395, anchor: 'bottom-center', required: true},
  {name: 'creature-mushmallow', kind: 'creature', src: 'assets/creatures/creature-mushmallow.png', w: 361, h: 330, anchor: 'bottom-center', required: true},
  {name: 'creature-frostowl', kind: 'creature', src: 'assets/creatures/creature-frostowl.png', w: 336, h: 400, anchor: 'bottom-center', required: true},
  {name: 'creature-pebblit', kind: 'creature', src: 'assets/creatures/creature-pebblit.png', w: 385, h: 329, anchor: 'bottom-center', required: true},
  {name: 'shrine-crystal-stone', kind: 'prop', src: 'assets/props/shrine-crystal-stone.png', w: 353, h: 418, anchor: 'bottom-center', required: true},
  {name: 'tree-pine-snow', kind: 'prop', src: 'assets/props/tree-pine-snow.png', w: 321, h: 427, anchor: 'bottom-center', required: true},
  {name: 'rock-spire-red', kind: 'prop', src: 'assets/props/rock-spire-red.png', w: 381, h: 410, anchor: 'bottom-center', required: true},
  {name: 'chest-wooden', kind: 'prop', src: 'assets/props/chest-wooden.png', w: 343, h: 319, anchor: 'bottom-center', required: true},
];

/** Index of an asset by name; used by content that refers to art (species, regions, direction sprites). Throws on a typo. */
export function spriteId(name) {
  const i = assets.findIndex(a => a.name === name);
  if (i < 0) throw new Error(`unknown asset "${name}"`);
  return i;
}
