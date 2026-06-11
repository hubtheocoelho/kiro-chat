#!/usr/bin/env node
// Generates the Kiro Chat icon set (PNGs + multi-size ICO) with no external
// dependencies. Outputs to src-tauri/icons/. Run via: npm run icons
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "icons");

// ---------------------------------------------------------------- rasterizer

const lerp = (a, b, t) => a + (b - a) * t;

// signed distance to a rounded rectangle [x0,y0,x1,y1] with corner radius r
function sdRoundRect(px, py, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2 - r;
  const hy = (y1 - y0) / 2 - r;
  const qx = Math.abs(px - cx) - hx;
  const qy = Math.abs(py - cy) - hy;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby)));
  return Math.hypot(apx - abx * t, apy - aby * t);
}

// Icon artwork: purple rounded square, white terminal chevron + cursor bar.
function render(size) {
  const SS = 4; // 16 samples per pixel
  const rgba = new Uint8Array(size * size * 4);
  const top = [139, 92, 246]; // #8B5CF6
  const bot = [76, 29, 149]; // #4C1D95
  const S = size * SS;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x * SS + sx + 0.5) / S;
          const v = (y * SS + sy + 0.5) / S;
          if (sdRoundRect(u, v, 0.03, 0.03, 0.97, 0.97, 0.22) > 0) continue;
          let cr = lerp(top[0], bot[0], v);
          let cg = lerp(top[1], bot[1], v);
          let cb = lerp(top[2], bot[2], v);
          const w = 0.072; // glyph stroke half-thickness
          const dChevron = Math.min(
            sdSegment(u, v, 0.295, 0.335, 0.475, 0.5) - w,
            sdSegment(u, v, 0.475, 0.5, 0.295, 0.665) - w
          );
          const dCursor = sdRoundRect(u, v, 0.545, 0.595, 0.76, 0.69, 0.035);
          if (Math.min(dChevron, dCursor) < 0) {
            cr = 255;
            cg = 255;
            cb = 255;
          }
          rSum += cr;
          gSum += cg;
          bSum += cb;
          hits++;
        }
      }
      const i = (y * size + x) * 4;
      if (hits > 0) {
        rgba[i] = Math.round(rSum / hits);
        rgba[i + 1] = Math.round(gSum / hits);
        rgba[i + 2] = Math.round(bSum / hits);
        rgba[i + 3] = Math.round((hits / (SS * SS)) * 255);
      }
    }
  }
  return rgba;
}

// ----------------------------------------------------------------- PNG codec

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ----------------------------------------------------------------- ICO codec

// Classic BMP (BITMAPINFOHEADER + BGRA bottom-up + AND mask) for broad
// compatibility at small sizes; PNG entry for 256px (supported since Vista).
function bmpEntry(rgba, w, h) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(w, 4);
  header.writeInt32LE(h * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const xor = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((h - 1 - y) * w + x) * 4;
      const di = (y * w + x) * 4;
      xor[di] = rgba[si + 2];
      xor[di + 1] = rgba[si + 1];
      xor[di + 2] = rgba[si];
      xor[di + 3] = rgba[si + 3];
    }
  }
  const and = Buffer.alloc(Math.ceil(w / 32) * 4 * h);
  return Buffer.concat([header, xor, and]);
}

function encodeICO(entries) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(entries.length, 4);
  let offset = 6 + 16 * entries.length;
  const headers = [];
  for (const e of entries) {
    const h = Buffer.alloc(16);
    h[0] = e.size >= 256 ? 0 : e.size;
    h[1] = e.size >= 256 ? 0 : e.size;
    h.writeUInt16LE(1, 4);
    h.writeUInt16LE(32, 6);
    h.writeUInt32LE(e.data.length, 8);
    h.writeUInt32LE(offset, 12);
    offset += e.data.length;
    headers.push(h);
  }
  return Buffer.concat([dir, ...headers, ...entries.map((e) => e.data)]);
}

// --------------------------------------------------------------------- write

mkdirSync(OUT, { recursive: true });

const pngTargets = [
  ["32x32.png", 32],
  ["128x128.png", 128],
  ["128x128@2x.png", 256],
  ["icon.png", 512],
];
for (const [name, size] of pngTargets) {
  writeFileSync(join(OUT, name), encodePNG(render(size), size, size));
  console.log(`wrote icons/${name}`);
}

const ico = encodeICO([
  ...[16, 24, 32, 48, 64].map((size) => ({ size, data: bmpEntry(render(size), size, size) })),
  { size: 256, data: encodePNG(render(256), 256, 256) },
]);
writeFileSync(join(OUT, "icon.ico"), ico);
console.log("wrote icons/icon.ico");
