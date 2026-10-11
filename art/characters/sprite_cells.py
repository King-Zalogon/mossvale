"""Separate packed source poses without cutting at arbitrary grid lines.

Small eroded body cores only identify ownership. All original foreground pixels,
including thin anatomy and detached effects, are restored after that assignment.
"""
from collections import deque
from PIL import Image, ImageFilter, ImageChops


def components(mask, width, height):
    remaining = bytearray(mask)
    for start in range(len(remaining)):
        if not remaining[start]:
            continue
        remaining[start] = 0
        queue = deque([start])
        points = []
        left = right = start % width
        top = bottom = start // width
        while queue:
            point = queue.popleft()
            points.append(point)
            x, y = point % width, point // width
            left, right, top, bottom = min(left, x), max(right, x), min(top, y), max(bottom, y)
            for ny in range(max(0, y - 1), min(height, y + 2)):
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = ny * width + nx
                    if remaining[neighbor]:
                        remaining[neighbor] = 0
                        queue.append(neighbor)
        yield points, (left, top, right + 1, bottom + 1)


def extract_poses(source, columns, rows, threshold, seed_inset=4, row_bounds=None, column_bounds=None, barriers=()):
    width, height = source.size
    row_bounds = row_bounds or [round(i * height / rows) for i in range(rows + 1)]
    if len(row_bounds) != rows + 1 or row_bounds[0] != 0 or row_bounds[-1] != height or any(a >= b for a, b in zip(row_bounds, row_bounds[1:])):
        raise ValueError("source row bounds must cover every ordered source row")
    def row_at(y):
        return next(row for row in range(rows) if y < row_bounds[row + 1])
    column_bounds = column_bounds or [[round(i * width / columns) for i in range(columns + 1)] for _ in range(rows)]
    if len(column_bounds) != rows or any(len(b) != columns + 1 or b[0] != 0 or b[-1] != width or any(a >= c for a, c in zip(b, b[1:])) for b in column_bounds):
        raise ValueError("source column bounds must cover every ordered source column")
    alpha = source.getchannel("A")
    foreground = alpha.point(lambda value: 255 if value > threshold else 0)
    cores = foreground
    for _ in range(seed_inset):
        cores = cores.filter(ImageFilter.MinFilter(3))
    seeds = {}
    for row in range(rows):
        for column in range(columns):
            left, right = column_bounds[row][column], column_bounds[row][column + 1]
            top, bottom = row_bounds[row], row_bounds[row + 1]
            cell = cores.crop((left, top, right, bottom))
            candidates = list(components(cell.tobytes(), cell.width, cell.height))
            if not candidates:
                raise ValueError("source poses cannot be separated: re-author with wider transparent gutters")
            points, box = max(candidates, key=lambda candidate: len(candidate[0]))
            seeds[row * columns + column] = (
                [((point // cell.width) + top) * width + point % cell.width + left for point in points],
                (box[0] + left, box[1] + top, box[2] + left, box[3] + top),
            )

    owners = bytearray(width * height)
    queue = deque()
    for index, (points, _box) in seeds.items():
        for point in points:
            owners[point] = index + 1
            queue.append(point)
    opaque = foreground.tobytes()
    # Restore thin limbs and outlines by flooding the ORIGINAL alpha, not the cores.
    while queue:
        point = queue.popleft()
        x, y = point % width, point // width
        for ny in range(max(0, y - 1), min(height, y + 2)):
            for nx in range(max(0, x - 1), min(width, x + 2)):
                neighbor = ny * width + nx
                if opaque[neighbor] and not owners[neighbor] and not any(
                    top <= min(y, ny) < bottom and min(x, nx) < cut <= max(x, nx) for cut, top, bottom in barriers
                ):
                    owners[neighbor] = owners[point]
                    queue.append(neighbor)

    # Detached particles/limbs belong to the nearest body core, rather than to
    # whichever nominal rectangle happens to intersect them.
    detached = bytes(255 if opaque[i] and not owners[i] else 0 for i in range(len(owners)))
    for points, box in components(detached, width, height):
        x, y = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        def distance(index):
            b = seeds[index][1]
            dx, dy = max(b[0] - x, 0, x - b[2]), max(b[1] - y, 0, y - b[3])
            return (dx * dx + dy * dy, (x - (b[0] + b[2]) / 2) ** 2 + (y - (b[1] + b[3]) / 2) ** 2)
        row = row_at(y)
        owner = min((index for index in seeds if index // columns == row), key=distance) + 1
        for point in points:
            owners[point] = owner

    ownership = Image.frombytes("L", source.size, bytes(owners))
    poses = []
    for index in range(columns * rows):
        selection = ownership.point([255 if owner == index + 1 else 0 for owner in range(256)])
        mask = ImageChops.multiply(alpha, selection)
        box = mask.getbbox()
        pose = source.crop(box)
        pose.putalpha(mask.crop(box))
        poses.append(pose)
    return poses


def validate_gutters(source, columns, rows, threshold, fraction=0.15):
    """Reject newly generated sheets with artwork inside the reserved gutters."""
    for row in range(rows):
        for column in range(columns):
            cell = source.crop((round(column * source.width / columns), round(row * source.height / rows),
                                round((column + 1) * source.width / columns), round((row + 1) * source.height / rows)))
            box = cell.getchannel("A").point(lambda value: 255 if value > threshold else 0).getbbox()
            if box is None or min(box[0] / cell.width, box[1] / cell.height,
                                  (cell.width - box[2]) / cell.width, (cell.height - box[3]) / cell.height) < fraction:
                raise ValueError(f"source cell {row},{column} violates transparent gutter contract")
