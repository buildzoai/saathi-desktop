// make-tray-icon.js — draws the macOS menu-bar template icon (a simple
// microphone) as black-on-transparent PNGs, with no image library: a tiny
// signed-distance rasteriser plus a hand-rolled PNG encoder (zlib is built
// in). macOS treats any image named *Template.png as a template and tints it
// for light/dark menu bars itself, so only the alpha channel matters.
//
//   node scripts/make-tray-icon.js   -> src/assets/trayTemplate.png (16x16)
//                                       src/assets/trayTemplate@2x.png (32x32)
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, alphaAt) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = raw[o + 1] = raw[o + 2] = 0;
      raw[o + 3] = Math.round(255 * alphaAt(x, y));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Shapes in a 16-unit design grid; distance < 0 is inside.
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function micDistance(x, y) {
  // Capsule body: vertical segment (8,3)-(8,7.5), radius 2.5
  const body = segDist(x, y, 8, 3.5, 8, 7) - 2.5;
  // Cradle: lower half of a ring centred (8,7.5) radius 4.5, stroke 0.75
  let cradle = Infinity;
  if (y >= 7.5) cradle = Math.abs(Math.hypot(x - 8, y - 7.5) - 4.5) - 0.75;
  // Stem and foot
  const stem = segDist(x, y, 8, 12, 8, 14) - 0.75;
  const foot = segDist(x, y, 5.5, 14.25, 10.5, 14.25) - 0.75;
  return Math.min(body, cradle, stem, foot);
}

function render(size) {
  const scale = 16 / size;
  return encodePng(size, (px, py) => {
    // 4x4 supersampling for antialiasing
    let hits = 0;
    for (let sy = 0; sy < 4; sy++)
      for (let sx = 0; sx < 4; sx++) {
        const x = (px + (sx + 0.5) / 4) * scale;
        const y = (py + (sy + 0.5) / 4) * scale;
        if (micDistance(x, y) < 0) hits++;
      }
    return hits / 16;
  });
}

const outDir = path.join(__dirname, "..", "src", "assets");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "trayTemplate.png"), render(16));
fs.writeFileSync(path.join(outDir, "trayTemplate@2x.png"), render(32));
console.log("wrote", path.join(outDir, "trayTemplate.png"), "and @2x");
