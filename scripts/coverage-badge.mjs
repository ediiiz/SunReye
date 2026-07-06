#!/usr/bin/env bun
// Generate a self-contained "coverage" SVG badge from an lcov report.
// No third-party services: parses LF/LH totals and writes a shields-style
// flat badge. Usage: bun run scripts/coverage-badge.mjs <lcov> <out.svg>

import { readFileSync, writeFileSync } from "node:fs";

const [lcovPath = "coverage/lcov.info", outPath = "coverage/coverage.svg"] = process.argv.slice(2);

const lcov = readFileSync(lcovPath, "utf8");
let found = 0;
let hit = 0;
for (const line of lcov.split("\n")) {
  if (line.startsWith("LF:")) found += Number(line.slice(3));
  else if (line.startsWith("LH:")) hit += Number(line.slice(3));
}

const pct = found === 0 ? 0 : (hit / found) * 100;
const label = "coverage";
const value = `${pct.toFixed(pct >= 100 || Number.isInteger(pct) ? 0 : 1)}%`;

// shields color ramp
const color =
  pct >= 90
    ? "#4c1"
    : pct >= 80
      ? "#97ca00"
      : pct >= 70
        ? "#a4a61d"
        : pct >= 60
          ? "#dfb317"
          : pct >= 50
            ? "#fe7d37"
            : "#e05d44";

// Approximate Verdana 11px text width; good enough for a badge.
const textWidth = (s) => s.length * 6.5 + 10;
const lw = Math.round(textWidth(label));
const vw = Math.round(textWidth(value));
const w = lw + vw;
const lx = (lw / 2) * 10;
const vx = (lw + vw / 2) * 10;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${lw}" height="20" fill="#555"/>
    <rect x="${lw}" width="${vw}" height="20" fill="${color}"/>
    <rect width="${w}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${lx}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(lw - 10) * 10}">${label}</text>
    <text x="${lx}" y="140" transform="scale(.1)" fill="#fff" textLength="${(lw - 10) * 10}">${label}</text>
    <text aria-hidden="true" x="${vx}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(vw - 10) * 10}">${value}</text>
    <text x="${vx}" y="140" transform="scale(.1)" fill="#fff" textLength="${(vw - 10) * 10}">${value}</text>
  </g>
</svg>
`;

writeFileSync(outPath, svg);
console.log(`coverage ${value} -> ${outPath}`);
