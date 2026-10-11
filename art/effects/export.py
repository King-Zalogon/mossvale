"""Reproduce the 72 isolated elemental poses from immutable generated source sheets."""
from argparse import ArgumentParser
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'art/characters'))
from source_archive import source_bytes

GROUPS = ['leaf-water-stone', 'fire-ice-spark', 'air-spore-bloom', 'mire-sand-frost']
TYPES = ['Leaf', 'Water', 'Stone', 'Fire', 'Ice', 'Spark', 'Air', 'Spore', 'Bloom', 'Mire', 'Sand', 'Frost']
STAGES = ['charge', 'launch', 'travel-a', 'travel-b', 'impact', 'dissolve']
PROFILE = 'prop-elemental-effect-v1'
TARGET = 'dist/assets/props/effect-elemental-materials.png'
EDITABLE = 'art/assets/source/elemental-effects-atlas.png'
META = 'art/effects/metadata.json'


def build():
    profile = json.loads((ROOT / 'art/characters/export-profiles.json').read_text())['profiles'][PROFILE]
    atlas = Image.new('RGBA', (768, 1536))
    cells, pivots = [], []
    for group_index, group in enumerate(GROUPS):
        source = Image.open(BytesIO(source_bytes(ROOT, f'art/effects/source/{group}-spaced.png'))).convert('RGBA')
        xs = [round(i * source.width / 6) for i in range(7)]
        ys = profile['sourceRowBounds'][group]
        for row in range(3):
            poses, records = [], []
            for col in range(6):
                bounds = [xs[col], ys[row], xs[col+1], ys[row+1]]
                cell = source.crop(bounds)
                # Transparent low-alpha generator glow is not pixel-art ink. Keep foreground colors unchanged.
                alpha = cell.getchannel('A').point(lambda value: value if value >= profile['alphaThreshold'] else 0)
                cell.putalpha(alpha)
                bbox = alpha.getbbox()
                if not bbox or min(bbox[0], bbox[1], cell.width-bbox[2], cell.height-bbox[3]) < 4:
                    raise ValueError(f'{group} cell {col},{row} touches its reviewed extraction boundary')
                poses.append(cell.crop(bbox))
                records.append({'sourceBounds': bounds, 'inkBounds': list(bbox)})
            scale = min(1, profile['maxInk'] / max(max(p.width, p.height) for p in poses))
            row_pivots = []
            for col, pose in enumerate(poses):
                pose = pose.resize((max(1,round(pose.width*scale)),max(1,round(pose.height*scale))), Image.Resampling.NEAREST)
                pose = pose.crop(pose.getchannel('A').getbbox())
                type_index = group_index*3+row
                x = col*128+(128-pose.width)//2
                y = type_index*128+128-profile['footInset']-pose.height
                atlas.alpha_composite(pose,(x,y))
                row_pivots.append(128-profile['footInset']-pose.height/2)
                cells.append({'type':TYPES[type_index], 'stage':STAGES[col], **records[col], 'scale':scale, 'runtimeInkSize':list(pose.size)})
            pivots.append(row_pivots)
    return atlas, {'format':1,'types':TYPES,'stages':STAGES,'effectPivots':pivots,'cells':cells}


def main():
    parser=ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    atlas, meta = build()
    encoded=json.dumps(meta,indent=2)+'\n'
    if args.check:
        for path in [TARGET,EDITABLE]:
            image=Image.open(ROOT/path).convert('RGBA')
            if image.size != atlas.size or image.tobytes()!=atlas.tobytes():
                raise ValueError(f'{path} differs from reproducible elemental export')
        if json.loads((ROOT/META).read_text())!=meta:
            raise ValueError('Elemental metadata is stale')
    else:
        for path in [TARGET,EDITABLE]:
            (ROOT/path).parent.mkdir(parents=True,exist_ok=True)
            atlas.save(ROOT/path,optimize=True)
        (ROOT/META).write_text(encoded)
    print(f'Elemental effects: 12 materials, 72 complete poses; {"verified" if args.check else "exported"}; sha256 {sha256((ROOT/TARGET).read_bytes()).hexdigest()}')


if __name__=='__main__':
    main()
