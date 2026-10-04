// Cores por partido (compartilhado entre servidor e navegador).
// Quando dois candidatos da mesma disputa caem na mesma cor, o segundo recebe a
// próxima cor livre da paleta, para que o mapa e as barras continuem legíveis.

export const PALETA = [
  '#ef4b55', // vermelho
  '#3d7bf5', // azul
  '#2fbf71', // verde
  '#f59e2b', // laranja
  '#8b5cf6', // roxo
  '#f2c230', // amarelo
  '#14b8a6', // turquesa
  '#ec4899', // rosa
  '#22d3ee', // ciano
  '#a3e635', // lima
  '#818cf8', // índigo
  '#fb7185', // salmão
  '#d97706', // âmbar
  '#7dd3fc', // céu
  '#c084fc', // lilás
  '#94a3b8', // cinza
];

export const CORES_PARTIDO = {
  PT: '#ef4b55',
  PL: '#3d7bf5',
  MDB: '#2fbf71',
  PSB: '#f59e2b',
  NOVO: '#8b5cf6',
  'UNIÃO': '#f2c230',
  PSD: '#14b8a6',
  AVANTE: '#ec4899',
  'MISSÃO': '#22d3ee',
  REPUBLICANOS: '#7dd3fc',
  PP: '#818cf8',
  PSDB: '#60a5fa',
  PDT: '#fb7185',
  PSOL: '#facc15',
  'PC do B': '#dc2626',
  PCDOB: '#dc2626',
  PV: '#a3e635',
  REDE: '#2dd4bf',
  PODE: '#84cc16',
  SOLIDARIEDADE: '#d97706',
  CIDADANIA: '#c084fc',
  PRD: '#93c5fd',
  DEMOCRATA: '#38bdf8',
  DC: '#a78bfa',
  AGIR: '#fde047',
  PMB: '#f9a8d4',
  MOBILIZA: '#67e8f9',
  PRTB: '#34d399',
  PCO: '#b91c1c',
  PSTU: '#e11d48',
  UP: '#fda4af',
  PCB: '#f87171',
};

const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

export const corPartido = (sigla) => CORES_PARTIDO[sigla] || PALETA[hash(sigla || '') % PALETA.length];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
function hsl(hex) {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, d, l];
}
function semelhantes(a, b, matiz) {
  const [h1, , l1] = hsl(a), [h2, , l2] = hsl(b);
  const dh = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));
  return dh < matiz && Math.abs(l1 - l2) < 0.22;
}

// itens: [{ key, partido }] -> { [key]: cor }. A ordem dos itens define a prioridade.
// 1ª passada: cada um fica com a cor do partido, se ela não colidir com uma já usada.
// 2ª passada: quem colidiu recebe a primeira cor livre da paleta.
// matiz: diferença mínima de tom (graus) para duas cores não serem consideradas iguais.
export function atribuirCores(itens, { matiz = 10.5 } = {}) {
  const parecida = (cor, usadas) => usadas.some((u) => semelhantes(cor, u, matiz));
  const usadas = [];
  const out = {};
  for (const it of itens) {
    const cor = corPartido(it.partido);
    if (!parecida(cor, usadas)) {
      usadas.push(cor);
      out[it.key] = cor;
    }
  }
  for (const it of itens) {
    if (out[it.key]) continue;
    const cor = PALETA.find((c) => !parecida(c, usadas)) || PALETA.find((c) => !usadas.includes(c)) || '#94a3b8';
    usadas.push(cor);
    out[it.key] = cor;
  }
  return out;
}
