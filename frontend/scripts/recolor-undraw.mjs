// Recolors unDraw SVGs into Gitarchy's stone palette for a dark canvas.
// usage: node scripts/recolor-undraw.mjs <inDir> <outDir> [slug...]
import fs from "node:fs";
import path from "node:path";

const [inDir, outDir, ...only] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const hex = (h) => {
  h = h.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const toHex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

// Light-art neutrals invert onto the canvas: white paper sits just above #19191a, ink lands on dim stone.
const PAPER = hex("#1f1f20"), INK = hex("#77716f");
const ACCENT = "#b3a9a5"; // between stone and stone-hi: the one bright note
function remap(h) {
  const rgb = hex(h);
  const [hue, s, l] = hsl(rgb);
  const skin = (hue >= 340 || hue <= 30) && s > 0.25 && l > 0.3 && l < 0.92;
  if (skin) return l > 0.6 ? "#a8908a" : "#7d6560";
  if (s > 0.35 && l < 0.75) return ACCENT;
  return toHex(mix(PAPER, INK, Math.min(1, 1 - lum(rgb)) ** 1.15));
}

const files = fs.readdirSync(inDir).filter((f) => f.endsWith(".svg") && (!only.length || only.includes(f.replace(".svg", ""))));
for (const f of files) {
  let svg = fs.readFileSync(path.join(inDir, f), "utf8");
  svg = svg
    .replace(/<\?xml[^>]*>|<!--[\s\S]*?-->/g, "")
    .replace(/\s(id|data-name)="[^"]*"/g, "")
    .replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b(?![\w-])/g, (m) => remap(m))
    .replace(/(fill|stroke)="white"/g, `$1="${toHex(PAPER)}"`)
    .replace(/(fill|stroke)="black"/g, `$1="${toHex(INK)}"`)
    .replace(/<svg([^>]*?)\s(width|height)="[^"]*"/, "<svg$1")
    .replace(/<svg([^>]*?)\s(width|height)="[^"]*"/, "<svg$1")
    .replace(/>\s+</g, "><")
    .trim();
  fs.writeFileSync(path.join(outDir, f), svg);
}
console.log(`recolored ${files.length}`);
