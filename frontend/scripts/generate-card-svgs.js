/**
 * Generates 81 Set game card SVGs into src/assets/cards/.
 * Run: npm run generate-cards
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "src", "assets", "cards");

const CARD_COLORS = {
  Red: "#e53935",
  Green: "#43a047",
  Purple: "#8e24aa",
};

const numbers = ["1", "2", "3"];
const colors = ["Red", "Green", "Purple"];
const fills = ["Solid", "Striped", "Empty"];
const shapes = ["Diamond", "Oval", "Squiggle"];

const allCards = [];
for (const a of numbers) {
  for (const b of colors) {
    for (const c of fills) {
      for (const d of shapes) {
        allCards.push(`${a}-${b}-${c}-${d}`);
      }
    }
  }
}

function getShapePath(shape, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const w = width * 0.85;
  const h = height * 0.85;
  // Diamond: 90° rotated (long axis horizontal) — left, top, right, bottom
  if (shape === "Diamond") {
    return `M ${cx - h / 2} ${cy} L ${cx} ${cy - w / 2} L ${cx + h / 2} ${cy} L ${cx} ${cy + w / 2} Z`;
  }
  // Oval: 90° rotated (long axis horizontal) — swap rx/ry so ellipse is wide
  if (shape === "Oval") {
    const rx = h / 2;
    const ry = w / 2;
    return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx - rx} ${cy} Z`;
  }
  // Squiggle: from Swift SquiggleShape (Stack Overflow CC BY-SA 4.0), scaled to fit, rotated 90° CW
  const pathMinX = 4.6;
  const pathMinY = 6.9;
  const pathW = 107.8;
  const pathH = 58.7;
  const scx = w / 2;
  const scy = h / 2;
  const tx = (x) => ((x - pathMinX) * w) / pathW;
  const ty = (y) => ((y - pathMinY) * h) / pathH;
  // 90° clockwise around (scx, scy): (px, py) -> (scx + py - scy, scy - px + scx)
  const r = (px, py) => `${scx + py - scy} ${scy - px + scx}`;
  return [
    `M ${r(tx(104), ty(15))}`,
    `C ${r(tx(112.4), ty(36.9))} ${r(tx(89.7), ty(60.8))} ${r(tx(63), ty(54))}`,
    `C ${r(tx(52.3), ty(51.3))} ${r(tx(42.2), ty(42))} ${r(tx(27), ty(53))}`,
    `C ${r(tx(9.6), ty(65.6))} ${r(tx(5.4), ty(58.3))} ${r(tx(5), ty(40))}`,
    `C ${r(tx(4.6), ty(22))} ${r(tx(19.1), ty(9.7))} ${r(tx(36), ty(12))}`,
    `C ${r(tx(59.2), ty(15.2))} ${r(tx(61.9), ty(31.5))} ${r(tx(89), ty(14))}`,
    `C ${r(tx(95.3), ty(10))} ${r(tx(100.9), ty(6.9))} ${r(tx(104), ty(15))}`,
    "Z",
  ].join(" ");
}

function generateSvg(cardId) {
  const [n, color, fill, shape] = cardId.split("-");
  const count = Math.min(3, Math.max(1, parseInt(n, 10) || 1));
  const stroke = CARD_COLORS[color] ?? "#333";
  const fillColor = fill === "Empty" ? "none" : stroke;
  const patternId = "s";

  const w = 90;
  const h = 60;
  const shapeW = 28;
  const shapeH = 18;
  const gap = 1;
  const strokeWidth = 0.9;
  const totalShapeW = count * shapeW + (count - 1) * gap;
  let startX = (w - totalShapeW) / 2 + shapeW / 2;
  const cy = h / 2;

  const shapePath = getShapePath(shape, shapeW, shapeH);

  // Stripes: one line per pattern cell; spacing between stripes = strokeWidth (evenly spaced)
  const patternHeight = 2 * strokeWidth;
  const stripeLine = `    <line x1="0" y1="0" x2="${w}" y2="0" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;

  const shapes = [];
  for (let i = 0; i < count; i++) {
    const x = startX;
    const tx = x - shapeW / 2;
    const ty = cy - shapeH / 2;
    shapes.push(
      `    <path d="${shapePath}" fill="${fill === "Striped" ? `url(#${patternId})` : fillColor}" stroke="${stroke}" stroke-width="${strokeWidth}" transform="translate(${tx}, ${ty})"/>`
    );
    startX += shapeW + gap;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${cardId.replace(/-/g, " ")}">
  <defs>
    <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="${w}" height="${patternHeight}">
${stripeLine}
    </pattern>
  </defs>
  <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="4" ry="4" fill="#fff8f0" stroke="#e0d8d0" stroke-width="1"/>
${shapes.join("\n")}
</svg>
`;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const cardId of allCards) {
  const svg = generateSvg(cardId);
  const filePath = path.join(OUT_DIR, `${cardId}.svg`);
  fs.writeFileSync(filePath, svg, "utf8");
}
console.log(`Wrote ${allCards.length} card SVGs to ${OUT_DIR}`);
