/**
 * Generates / repairs data/outcomes.json so it contains exactly the 32 pattern
 * keys, in canonical order. Existing entries are preserved untouched; only
 * missing keys are added (with placeholder content). Nothing is ever deleted.
 *
 * Run:  npm run generate:outcomes
 *
 * Use this after editing the question set or when starting a fresh content pass,
 * so you never have to hand-type or risk mistyping the 32 keys.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTCOMES_PATH = join(__dirname, "..", "data", "outcomes.json");

const QUESTION_COUNT = 5;

function allPatterns() {
  const out = [];
  const total = 1 << QUESTION_COUNT;
  for (let i = 0; i < total; i++) {
    let p = "";
    for (let bit = QUESTION_COUNT - 1; bit >= 0; bit--) {
      p += (i >> bit) & 1 ? "B" : "A";
    }
    out.push(p);
  }
  return out;
}

function placeholderOutcome(pattern) {
  return {
    title: `Outcome ${pattern} — placeholder title`,
    prompts: [1, 2, 3].map((n) => ({
      text: `Outcome ${pattern} · follow-up prompt ${n} (placeholder)`,
      optionA: `Prompt ${n} option A`,
      optionB: `Prompt ${n} option B`,
      tuned: "A",
    })),
  };
}

const existing = existsSync(OUTCOMES_PATH)
  ? JSON.parse(readFileSync(OUTCOMES_PATH, "utf8"))
  : {};

const next = {};
let added = 0;
for (const pattern of allPatterns()) {
  if (existing[pattern]) {
    next[pattern] = existing[pattern];
  } else {
    next[pattern] = placeholderOutcome(pattern);
    added++;
  }
}

writeFileSync(OUTCOMES_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
console.log(
  `outcomes.json written: ${Object.keys(next).length} keys (${added} added, ${
    Object.keys(next).length - added
  } preserved).`
);
