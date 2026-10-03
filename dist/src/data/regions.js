import {spriteId} from './assets.js';

/* Region presentation and progression labels. Geometry, encounters and landmarks live in dist/maps/<id>.json.
   `id` matches the map id and is persisted in saves: never rename or reuse it. */
export const regions = [
  {
    id: 'meadow',
    biome: 'meadow',
    name: 'Mossvale Meadow',
    short: 'Meadow',
    subtitle: 'Tall grass, old trails, and new friends.',
    tag: 'THE MEADOW TRAIL',
    palette: ['#86ae70', '#97b76a', '#8aa55c', '#d6c08b', '#4e9c9a', '#577b48'],
    seal: 'Verdant seal',
    preview: spriteId('tree-oak'),
    desc: 'A sunlit meadow where every trail begins.',
  },
  {
    id: 'amber-ridge',
    biome: 'badlands',
    name: 'Amber Ridge',
    short: 'Ridge',
    subtitle: 'Golden trails and sparks in the sandstone.',
    tag: 'THE AMBER TRAIL',
    palette: ['#c7a075', '#d6b47e', '#b19459', '#e8cc99', '#739ca4', '#986f48'],
    seal: 'Amber seal',
    preview: spriteId('rock-spire-red'),
    desc: 'Stone spires, electric friends, and a sleeping guardian.',
  },
  {
    id: 'frostveil-grove',
    biome: 'snowy-forest',
    name: 'Frostveil Grove',
    short: 'Grove',
    subtitle: 'Follow the snowflakes to a quiet shrine.',
    tag: 'THE FROSTVEIL TRAIL',
    palette: ['#a9c7c9', '#d4e3dc', '#acc2bb', '#b0c7c5', '#6d9cab', '#7c9898'],
    seal: 'Frostveil seal',
    preview: spriteId('tree-pine-snow'),
    desc: 'A quiet snowy grove at the edge of the isles.',
  },
  {
    id: 'reedfen-wetlands',
    biome: 'wetland',
    name: 'Reedfen Wetlands',
    short: 'Reedfen',
    subtitle: 'Quiet pools, reed paths, and ripples in the grass.',
    tag: 'THE REEDFEN TRAIL',
    palette: ['#799a82', '#91aa7a', '#7e9c69', '#d1bf86', '#4c9297', '#536d55'],
    seal: 'Reedfen seal',
    preview: spriteId('cattail-clump'),
    desc: 'A sheltered wetland where paths wind between pools and tall reeds.',
  },
];
