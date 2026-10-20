import fs from "node:fs";
import zlib from "node:zlib";

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const idat = zlib.deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeInt32BE(crc(body), 8 + data.length);
  return out;
}

function crc(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}

function icon(size, pad) {
  return png(size, (x, y) => {
    const nx = (x + 0.5) / size;
    const ny = (y + 0.5) / size;
    const inset = pad;
    const inBox = nx > inset && nx < 1 - inset && ny > inset && ny < 1 - inset;
    if (!inBox) return [18, 24, 32, 255];
    const pulse = 0.62 + 0.08 * Math.sin((nx - 0.15) * 28);
    const dist = Math.abs(ny - pulse);
    if (dist < 0.015 && nx > 0.22 && nx < 0.82) return [94, 224, 208, 255];
    const moon = (nx - 0.72) ** 2 + (ny - 0.3) ** 2;
    if (moon < 0.012) return [240, 180, 41, 255];
    return [18, 24, 32, 255];
  });
}

fs.writeFileSync("public/icon-192.png", icon(192, 0.08));
fs.writeFileSync("public/icon-512.png", icon(512, 0.08));
fs.writeFileSync("public/icon-512-maskable.png", icon(512, 0.18));
fs.writeFileSync("public/apple-touch-icon.png", icon(180, 0.1));
console.log("icons written");
