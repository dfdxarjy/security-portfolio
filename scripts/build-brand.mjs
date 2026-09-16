import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

import {
  MARK_T,
  MARK_T_TRANSFORM,
  MARK_DOT,
  MARK_VIEW_TIGHT,
} from "../src/brand/mark.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(root, "public");
const brandDir = path.join(pub, "brand");
await mkdir(brandDir, { recursive: true });

const dot = `<rect x="${MARK_DOT.x}" y="${MARK_DOT.y}" width="${MARK_DOT.w}" height="${MARK_DOT.h}" rx="${MARK_DOT.r}"/>`;
const glyph = `<g transform="${MARK_T_TRANSFORM}"><path d="${MARK_T}"/></g>`;

const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEW_TIGHT}" fill="none">
  <g fill="currentColor">${glyph}</g>
  <g fill="var(--portfolio-accent, #7a3e2a)">${dot}</g>
</svg>\n`;

const portableMarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEW_TIGHT}" fill="none">
  <g fill="#1a1a17">${glyph}</g>
  <g fill="#7a3e2a">${dot}</g>
</svg>\n`;

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEW_TIGHT}" fill="none">
  <style>
    .ink{fill:#1a1a17}.accent{fill:#7a3e2a}
    @media (prefers-color-scheme:dark){.ink{fill:#efeae1}.accent{fill:#c98a63}}
  </style>
  <g class="ink">${glyph}</g>
  <g class="accent">${dot}</g>
</svg>\n`;

await writeFile(path.join(brandDir, "mark.svg"), markSvg);
await writeFile(path.join(brandDir, "mark-portable.svg"), portableMarkSvg);
await writeFile(path.join(pub, "favicon.svg"), faviconSvg);

const rasterSvg = faviconSvg
  .replace(/<style>[\s\S]*?<\/style>/, "")
  .replace('class="ink"', 'fill="#1a1a17"')
  .replace('class="accent"', 'fill="#7a3e2a"');

const frames = [];
for (const size of [16, 32, 48]) {
  const png = await sharp(Buffer.from(rasterSvg)).resize(size, size).png().toBuffer();
  await writeFile(path.join(pub, `favicon-${size}.png`), png);
  frames.push({ size, png });
}

// ICO with PNG-compressed 16/32/48 frames. No extra dependency required.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // icon
header.writeUInt16LE(frames.length, 4);

const entries = [];
let offset = 6 + frames.length * 16;
for (const { size, png } of frames) {
  const e = Buffer.alloc(16);
  e.writeUInt8(size === 256 ? 0 : size, 0);
  e.writeUInt8(size === 256 ? 0 : size, 1);
  e.writeUInt8(0, 2); // palette
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // planes
  e.writeUInt16LE(32, 6); // bpp
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += png.length;
}

await writeFile(path.join(pub, "favicon.ico"), Buffer.concat([header, ...entries, ...frames.map((f) => f.png)]));
console.log("Generated public/brand/mark.svg, public/brand/mark-portable.svg and favicon.svg/.ico/.png from src/brand/mark.mjs");
