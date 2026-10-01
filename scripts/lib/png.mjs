import {inflateSync} from 'node:zlib';
/** Minimal PNG reader for 8-bit, non-interlaced images (enough to inspect game sprites). Throws on anything else. */
export function decodePng(buf) {
  if (buf.toString('latin1', 1, 4) !== 'PNG') throw new Error('not a PNG');
  let pos = 8,
    width,
    height,
    depth,
    color,
    interlace;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos),
      type = buf.toString('latin1', pos + 4, pos + 8),
      data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      color = data[9];
      interlace = data[12];
    }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`only 8-bit non-interlaced PNGs are supported (depth ${depth}, interlace ${interlace})`);
  const channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color];
  const bpp = Math.max(1, (channels * depth) / 8),
    stride = Math.ceil((width * channels * depth) / 8);
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)],
      line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0,
        b = y ? out[(y - 1) * stride + x] : 0,
        c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c,
          pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  return {width, height, depth, color, interlace, channels, stride, data: out};
}

/** Opaque bounding box (alpha above 8) and its padding inside the image, or null when fully transparent / no alpha. */
export function opaqueBounds(im) {
  if (im.color !== 6) return null;
  let minX = im.width,
    minY = im.height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < im.height; y++) {
    for (let x = 0; x < im.width; x++) {
      if (im.data[y * im.stride + x * 4 + 3] > 8) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return null;
  return {left: minX, top: minY, right: im.width - 1 - maxX, bottom: im.height - 1 - maxY};
}
