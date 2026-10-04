// Gera public/data/municipios/{uf}.json (paths SVG dos municípios, na mesma projeção do mapa de UFs).
// Uso: node tools/build-municipios.mjs   (baixa as malhas municipais do IBGE, 1 requisição por UF)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UFS } from '../public/js/ufs.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'public', 'data', 'municipios');
const ibgeUF = (cod) =>
  `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${cod}?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio`;

// Mesma projeção de tools/build-map.mjs (calculada a partir da malha de UFs).
const ufGeo = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'ibge-uf.geojson'), 'utf8'));
const LAT0 = (-14 * Math.PI) / 180;
const kx = Math.cos(LAT0);
const W = 1000, PAD = 6;
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
let minX = Infinity, maxX = -Infinity, minY = Infinity;
for (const f of ufGeo.features)
  for (const poly of polysOf(f.geometry)) for (const ring of poly) for (const [lon, lat] of ring) {
    const x = lon * kx, y = -lat;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y;
  }
const scale = (W - PAD * 2) / (maxX - minX);
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
function simplifyRing(pts, tol) {
  let far = 0, farD = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > farD) { farD = d; far = i; }
  }
  return simplify(pts.slice(0, far + 1), tol).concat(simplify(pts.slice(far), tol).slice(1));
}

const r1 = (n) => Math.round(n * 10) / 10;
fs.mkdirSync(outDir, { recursive: true });
let total = 0, bytes = 0;
for (const u of UFS) {
  const res = await fetch(ibgeUF(u.ibge));
  if (!res.ok) throw new Error(`IBGE ${u.uf}: HTTP ${res.status}`);
  const geo = await res.json();
  const out = {};
  for (const f of geo.features) {
    let d = '';
    for (const poly of polysOf(f.geometry)) {
      const ring = poly[0]; // furos de municípios são irrelevantes nesta escala
      const pts = simplifyRing(ring.map(project), 0.12);
      if (pts.length < 4) continue;
      d += 'M' + pts.slice(0, -1).map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L') + 'Z';
    }
    if (d) out[f.properties.codarea] = d;
  }
  const file = path.join(outDir, `${u.uf}.json`);
  fs.writeFileSync(file, JSON.stringify(out));
  total += Object.keys(out).length;
  bytes += fs.statSync(file).size;
  process.stdout.write(`${u.uf}:${Object.keys(out).length} `);
}
console.log(`\nok ${total} municípios, ${(bytes / 1024).toFixed(0)} KB`);
