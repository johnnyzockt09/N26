import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public', 'assets');
const CELL = 46;
const PITCH = 58;
const COL0 = 36;
const ROW0 = 78;
const LIT = '#8aff9a';
const BORDER = 'rgba(60,80,105,0.35)';

function cellField(rows, cols, title, subtitle, coords) {
  const set = new Set(coords.map(([r, c]) => `${r},${c}`));
  const width = COL0 * 2 + (cols - 1) * PITCH + CELL;
  const height = ROW0 + (rows - 1) * PITCH + CELL + 34;
  let cells = '';
  let count = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = COL0 + c * PITCH;
      const y = ROW0 + r * PITCH;
      const on = set.has(`${r},${c}`);
      if (on) count++;
      cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${on ? LIT : '#0c1118'}" stroke="${BORDER}" stroke-width="2"/>\n    `;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="monospace">
  <title>${title}</title>
  <desc>${subtitle}</desc>
  <rect width="${width}" height="${height}" fill="#0a0d12"/>
  <g font-size="14" fill="#3f4c61">
    <text x="${COL0}" y="42">${title}</text>
    <text x="${COL0}" y="${height - 16}">AKTIV: ${count} / ${rows}x${cols}</text>
  </g>
  <g>
    ${cells}</g>
</svg>`;
}

// Level 03: LICHT — 13 cols x 7 rows (exactly 40 lit cells)
const LICHT = [
  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [6, 1],                // L
  [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3],                        // I
  [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [0, 6], [6, 6],        // C
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [3, 9],                // H
  [0, 11], [1, 11], [2, 11], [3, 11], [4, 11], [5, 11], [6, 11], [0, 12],        // T
];

// Level 09: digits "07" — 5 cols x 7 rows (23 lit cells)
const N07 = [
  // 0 ring on cols 0-1
  [0, 0], [1, 0], [0, 6], [1, 6],
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5],
  [1, 1], [1, 2], [1, 3], [1, 4], [1, 5],
  // 7 on cols 3-4
  [3, 0], [4, 0],
  [3, 1],
  [4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6],
];

mkdirSync(join(OUT, 'levels', '03'), { recursive: true });
mkdirSync(join(OUT, 'levels', '09'), { recursive: true });
mkdirSync(join(OUT, 'levels', '14'), { recursive: true });
writeFileSync(join(OUT, 'levels', '03', 'scene.svg'), cellField(7, 13, 'SEKTOR-03 / LEUCHTBLOCKFELD', '13x7 RASTER, 40 leuchtende Blöcke', LICHT));
writeFileSync(join(OUT, 'levels', '09', 'scene.svg'), cellField(7, 5, 'SEKTOR-09 / RANG-ANZEIGE', 'Ziffernpaar in Leuchtschrift', N07));

// Level 14: mirrored poster — FERNGESPRÄCH reads right-to-left (decoy image)
{
  const W = 720;
  const H = 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>SEKTOR-14 / BILDBAND-AUSSCHNITT</title>
  <desc>Gespiegelter Ausdruck eines Funkprotokolls.</desc>
  <rect width="${W}" height="${H}" fill="#0c0f14"/>
  <g font-family="monospace">
    <text x="24" y="30" font-size="13" fill="#3f4c61">SEKTOR-14 / BILDBAND-AUSSCHNITT</text>
    <text x="24" y="${H - 18}" font-size="12" fill="#33404f">SCAN 8812-C · ORIGINAL IM GLAS NEGATIV</text>
  </g>
  <g stroke="#1d2530" stroke-width="1" fill="none">
    <rect x="24" y="52" width="${W - 48}" height="${H - 84}"/>
    <line x1="24" y1="52" x2="${W - 24}" y2="${H - 32}"/>
    <line x1="${W - 24}" y1="52" x2="24" y2="${H - 32}"/>
  </g>
  <text x="40" y="200" font-size="44" fill="#d7e6ef" transform="translate(${W - 40} 0) scale(-1 1)" text-anchor="end">FERNGESPRÄCH</text>
  <rect x="24" y="196" width="${W - 48}" height="2" fill="#1d2530"/>
  <text x="40" y="${H - 60}" font-size="20" fill="#4b5b70" transform="translate(${W - 40} 0) scale(-1 1)" text-anchor="end">SEKTOR-14 · AUDIO-LOG</text>
</svg>`;
  writeFileSync(join(OUT, 'levels', '14', 'scene.svg'), svg);
}

mkdirSync(join(OUT, 'audio', 'ambient'), { recursive: true });
console.log('wrote SVG scenes 03, 09, 14');