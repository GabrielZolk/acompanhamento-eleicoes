// Gera public/data/brasil-uf.json (paths SVG pré-projetados) a partir da malha do IBGE.
// Uso: node tools/build-map.mjs [--fetch]
//   --fetch  baixa a malha atual da API de malhas do IBGE antes de gerar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UFS } from '../public/js/ufs.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'tools', 'ibge-uf.geojson');
const out = path.join(root, 'public', 'data', 'brasil-uf.json');
const IBGE_URL =
  'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=UF';

if (process.argv.includes('--fetch')) {
  const res = await fetch(IBGE_URL);
  if (!res.ok) throw new Error(`IBGE HTTP ${res.status}`);
  fs.writeFileSync(src, await res.text());
}

const geo = JSON.parse(fs.readFileSync(src, 'utf8'));
const byIbge = Object.fromEntries(UFS.map((u) => [u.ibge, u]));

const LAT0 = (-14 * Math.PI) / 180;
const kx = Math.cos(LAT0);
const W = 1000;
const PAD = 6;

let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
for (const f of geo.features) {
  for (const poly of polysOf(f.geometry)) for (const ring of poly) for (const [lon, lat] of ring) {
    const x = lon * kx, y = -lat;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
}
const scale = (W - PAD * 2) / (maxX - minX);
const H = Math.round((maxY - minY) * scale + PAD * 2);
const project = ([lon, lat]) => [(lon * kx - minX) * scale + PAD, (-lat - minY) * scale + PAD];

function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let best = -1, bestD = 0;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (bestD > tol) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// Anéis fechados (primeiro == último ponto) são divididos no ponto mais distante.
function simplifyRing(pts, tol) {
  let far = 0, farD = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > farD) { farD = d; far = i; }
  }
  const a = simplify(pts.slice(0, far + 1), tol);
  const b = simplify(pts.slice(far), tol);
  return a.concat(b.slice(1));
}

const ringArea = (r) => {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return s / 2;
};
const ringCentroid = (r) => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f;
  }
  return [cx / (3 * a), cy / (3 * a)];
};

const r1 = (n) => Math.round(n * 10) / 10;
const states = {};
for (const f of geo.features) {
  const meta = byIbge[f.properties.codarea];
  if (!meta) continue;
  let d = '';
  let bestRing = null, bestArea = 0, total = 0;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const poly of polysOf(f.geometry)) {
    poly.forEach((ring, idx) => {
      const pts = simplifyRing(ring.map(project), 0.45);
      if (pts.length < 4) return;
      const area = Math.abs(ringArea(pts));
      if (idx === 0) {
        total += area;
        if (area > bestArea) { bestArea = area; bestRing = pts; }
      }
      if (area < 0.6 && idx === 0 && total > 50) return; // ilhotas irrelevantes na escala
      for (const [x, y] of pts) {
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
        if (y < by0) by0 = y; if (y > by1) by1 = y;
      }
      d += 'M' + pts.slice(0, -1).map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L') + 'Z';
    });
  }
  const [cx, cy] = ringCentroid(bestRing);
  states[meta.uf] = {
    d,
    c: [r1(cx), r1(cy)],
    bbox: [r1(bx0), r1(by0), r1(bx1), r1(by1)],
    area: Math.round(total),
  };
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ w: W, h: H, states }));
console.log(`ok ${Object.keys(states).length} UFs, viewBox 0 0 ${W} ${H}, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
