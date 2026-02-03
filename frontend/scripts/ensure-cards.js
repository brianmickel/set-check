/**
 * Ensures src/assets/cards has all 81 card SVGs; runs generate-card-svgs if not.
 * Used by predev so `npm run dev` works without a prior generate-cards.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.join(__dirname, "..", "src", "assets", "cards");
const EXPECTED_COUNT = 81;

function countSvgFiles() {
  if (!fs.existsSync(CARDS_DIR)) return 0;
  const entries = fs.readdirSync(CARDS_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith(".svg")).length;
}

const count = countSvgFiles();
if (count !== EXPECTED_COUNT) {
  console.log(`Cards: ${count}/${EXPECTED_COUNT} — generating...`);
  const result = spawnSync("node", ["scripts/generate-card-svgs.js"], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
