// Gera public/data/historico/presidente-2022-{1t,2t}.json: resultado de Presidente em 2022 (1º e 2º turno)
// por município, por UF e no exterior, para a comparação "2026 × 2022" do painel; e
// presidente-2022-uf.json, só os totais por UF dos dois turnos (poucos KB, para o mapa por estado).
// Uso: node tools/build-historico-2022.mjs
//
// Fonte: Portal de Dados Abertos do TSE (cdn.tse.jus.br/estatistica/sead/odsele/...).
//   - votacao_candidato_munzona_2022.zip (~640 MB): votos de cada candidato por município e zona;
//   - detalhe_votacao_munzona_2022.zip (~4 MB): eleitorado apto e votos válidos por município e zona.
// O servidor de resultados (resultados.tse.jus.br/oficial/ele2022/...) não publica mais 2022: os arquivos
// saíram do ar quando venceu o prazo da eleição ("dtlim" em comum/config/ele-c.json), e respondem 404.
//
// Nada é gravado em disco além dos arquivos finais. Os zips não são baixados inteiros: o CDN aceita
// HTTP Range, então o script lê só o diretório central (fim do arquivo), localiza a entrada do Brasil
// (`..._BR.csv`, que traz Presidente em todos os municípios e no exterior) e baixa só esses bytes
// (~2 MB + ~0,6 MB), descompactando em fluxo. O código IBGE vem da lista de municípios do TSE de 2026
// (`mun-e006257-cm.json`, campos cd = TSE e cdi = IBGE), 1 requisição ao servidor de resultados.
//
// Formato (inteiros, chaves curtas):
//   br: [eleitorado, válidos, Lula, Bolsonaro]            Brasil + exterior (total oficial)
//   uf: { sp: [eleitorado, válidos, Lula, Bolsonaro], …, zz: [...] }   zz = exterior
//   m:  { "<IBGE 7 dígitos>": [código TSE, eleitorado, válidos, Lula, Bolsonaro] }
//   ex: { "<código TSE>": [eleitorado, válidos, Lula, Bolsonaro] }      cidades do exterior
// presidente-2022-uf.json: { "1": { br, uf }, "2": { br, uf } }
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { UF_BY_CODE } from '../public/js/ufs.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'public', 'data', 'historico');
const ODSELE = 'https://cdn.tse.jus.br/estatistica/sead/odsele';
const ZIP_CAND = `${ODSELE}/votacao_candidato_munzona/votacao_candidato_munzona_2022.zip`;
const ZIP_DET = `${ODSELE}/detalhe_votacao_munzona/detalhe_votacao_munzona_2022.zip`;
const LISTA_MUN = 'https://resultados.tse.jus.br/oficial/ele2026/6257/config/mun-e006257-cm.json';
const ELEICAO = { 1: 544, 2: 545 };
const LULA = '13', BOLSONARO = '22';
const UA = { 'User-Agent': 'apuracao-2026-painel/1.0 (dados historicos)' };

const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const pad5 = (s) => String(s).replace(/\D/g, '').padStart(5, '0');

// Uma requisição por vez, com pausa entre elas e novas tentativas (o TSE responde 429 se apressado).
async function baixar(url, headers = {}) {
  for (let tentativa = 1; ; tentativa++) {
    await pausa(300);
    try {
      const res = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(120e3) });
      if (res.ok) return res;
      if (tentativa >= 4 || (res.status !== 429 && res.status < 500)) throw new Error(`HTTP ${res.status} em ${url}`);
    } catch (err) {
      if (tentativa >= 4) throw err;
    }
    await pausa(3000 * tentativa);
  }
}

// ---------------------------------------------------------------- zip remoto (HTTP Range)
async function entradaDoZip(url, nome) {
  const tam = Number((await fetch(url, { method: 'HEAD', headers: UA })).headers.get('content-length'));
  if (!tam) throw new Error(`tamanho desconhecido: ${url}`);
  const cauda = Math.min(tam, 65536 + 22);
  const fim = Buffer.from(await (await baixar(url, { Range: `bytes=${tam - cauda}-${tam - 1}` })).arrayBuffer());
  let eocd = -1;
  for (let i = fim.length - 22; i >= 0; i--) if (fim.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('fim do diretório central não encontrado');
  const total = fim.readUInt16LE(eocd + 10), cdTam = fim.readUInt32LE(eocd + 12), cdIni = fim.readUInt32LE(eocd + 16);
  const cd = cdIni >= tam - cauda
    ? fim.subarray(cdIni - (tam - cauda))
    : Buffer.from(await (await baixar(url, { Range: `bytes=${cdIni}-${cdIni + cdTam - 1}` })).arrayBuffer());
  for (let p = 0, k = 0; k < total; k++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('diretório central inválido');
    const metodo = cd.readUInt16LE(p + 10);
    let comp = cd.readUInt32LE(p + 20), orig = cd.readUInt32LE(p + 24), local = cd.readUInt32LE(p + 42);
    const nl = cd.readUInt16LE(p + 28), xl = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
    const nm = cd.toString('latin1', p + 46, p + 46 + nl);
    if (nm === nome) {
      // Zip64: os campos que não cabem em 32 bits vêm no extra 0x0001, nesta ordem.
      for (let x = p + 46 + nl; x < p + 46 + nl + xl; x += 4 + cd.readUInt16LE(x + 2)) {
        if (cd.readUInt16LE(x) !== 1) continue;
        let q = x + 4;
        if (orig === 0xffffffff) { orig = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (comp === 0xffffffff) { comp = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (local === 0xffffffff) local = Number(cd.readBigUInt64LE(q));
      }
      if (metodo !== 8) throw new Error(`${nome}: compressão ${metodo} não suportada`);
      return { url, nome, comp, orig, local };
    }
    p += 46 + nl + xl + cl;
  }
  throw new Error(`${nome} não está em ${url}`);
}

// Linhas do CSV (latin1, ";" e aspas) de uma entrada do zip, descompactadas em fluxo.
async function* linhasDoCSV({ url, nome, comp, local }) {
  const lh = Buffer.from(await (await baixar(url, { Range: `bytes=${local}-${local + 29}` })).arrayBuffer());
  if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error(`${nome}: cabeçalho local inválido`);
  const ini = local + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  const res = await baixar(url, { Range: `bytes=${ini}-${ini + comp - 1}` });
  const fluxo = Readable.fromWeb(res.body).pipe(zlib.createInflateRaw());
  fluxo.setEncoding('latin1');
  let campos = null;
  for await (const linha of readline.createInterface({ input: fluxo, crlfDelay: Infinity })) {
    if (!linha) continue;
    const v = separar(linha);
    if (!campos) campos = v;
    else yield Object.fromEntries(campos.map((c, i) => [c, v[i]]));
  }
}

function separar(linha) {
  const out = [];
  let atual = '', aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (aspas) {
      if (ch === '"' && linha[i + 1] === '"') { atual += '"'; i++; }
      else if (ch === '"') aspas = false;
      else atual += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ';') { out.push(atual); atual = ''; }
    else atual += ch;
  }
  out.push(atual);
  return out;
}

// ---------------------------------------------------------------- agregação
const n = (s) => parseInt(s, 10) || 0;
// turno -> "uf:cdTSE" -> { e, v, l, b, vd }   (vd = válidos segundo o arquivo de detalhe, para conferência)
const acc = { 1: new Map(), 2: new Map() };
const reg = (t, uf, cd) => {
  const k = `${uf}:${cd}`;
  let r = acc[t].get(k);
  if (!r) acc[t].set(k, (r = { uf, cd, e: 0, v: 0, l: 0, b: 0, vd: 0 }));
  return r;
};

process.stdout.write('votos por candidato… ');
let linhas = 0;
for await (const r of linhasDoCSV(await entradaDoZip(ZIP_CAND, 'votacao_candidato_munzona_2022_BR.csv'))) {
  if (r.CD_CARGO !== '1' || !acc[r.NR_TURNO]) continue;
  linhas++;
  const x = reg(r.NR_TURNO, r.SG_UF.toLowerCase(), pad5(r.CD_MUNICIPIO));
  // QT_VOTOS_NOMINAIS_VALIDOS já desconta votos anulados (nenhum candidato a Presidente teve votos anulados em 2022).
  const v = n(r.QT_VOTOS_NOMINAIS_VALIDOS);
  x.v += v;
  if (r.NR_CANDIDATO === LULA) x.l += v;
  else if (r.NR_CANDIDATO === BOLSONARO) x.b += v;
}
console.log(`${linhas} linhas`);

process.stdout.write('eleitorado… ');
linhas = 0;
for await (const r of linhasDoCSV(await entradaDoZip(ZIP_DET, 'detalhe_votacao_munzona_2022_BR.csv'))) {
  if (r.CD_CARGO !== '1' || !acc[r.NR_TURNO]) continue;
  linhas++;
  const x = reg(r.NR_TURNO, r.SG_UF.toLowerCase(), pad5(r.CD_MUNICIPIO));
  x.e += n(r.QT_APTOS);
  x.vd += n(r.QT_TOTAL_VOTOS_VALIDOS);
}
console.log(`${linhas} linhas`);

process.stdout.write('códigos IBGE… ');
const lista = await (await baixar(LISTA_MUN, { Accept: 'application/json' })).json();
const ibge = new Map(); // "uf:cdTSE" -> cdIBGE
for (const abr of lista.abr || []) for (const m of abr.mu || []) if (m.cdi) ibge.set(`${abr.cd.toLowerCase()}:${pad5(m.cd)}`, String(m.cdi));
console.log(`${ibge.size} municípios na lista de 2026`);

// ---------------------------------------------------------------- arquivos
fs.mkdirSync(outDir, { recursive: true });
const soma = (a, x) => { a[0] += x.e; a[1] += x.v; a[2] += x.l; a[3] += x.b; return a; };
const fmt = (v) => v.toLocaleString('pt-BR');
const pc = (a, b) => (b ? ((a / b) * 100).toFixed(2).replace('.', ',') + '%' : '-');
const FONTE = 'TSE, Portal de Dados Abertos: votacao_candidato_munzona_2022 e detalhe_votacao_munzona_2022 (arquivos _BR)';
const resumo = { ano: 2022, cargo: 'Presidente', fonte: FONTE, campos: 'eleitorado,validos,lula,bolsonaro' };
let bytes = 0;
for (const t of [1, 2]) {
  const br = [0, 0, 0, 0], uf = {}, m = {}, ex = {};
  const semIBGE = [];
  let difValidos = 0;
  for (const x of [...acc[t].values()].sort((a, b) => (a.uf + a.cd).localeCompare(b.uf + b.cd))) {
    if (!UF_BY_CODE[x.uf]) throw new Error(`UF desconhecida: ${x.uf}`);
    if (x.vd !== x.v) difValidos++;
    soma(br, x);
    soma((uf[x.uf] ||= [0, 0, 0, 0]), x);
    if (x.uf === 'zz') ex[Number(x.cd)] = [x.e, x.v, x.l, x.b];
    else if (ibge.has(`${x.uf}:${x.cd}`)) m[ibge.get(`${x.uf}:${x.cd}`)] = [Number(x.cd), x.e, x.v, x.l, x.b];
    else semIBGE.push(`${x.uf}:${x.cd}`);
  }
  const out = {
    ano: 2022,
    turno: t,
    eleicao: ELEICAO[t],
    cargo: 'Presidente',
    fonte: FONTE,
    campos: { br: 'eleitorado,validos,lula,bolsonaro', m: 'cdTSE,eleitorado,validos,lula,bolsonaro', ex: 'eleitorado,validos,lula,bolsonaro' },
    br,
    uf: Object.fromEntries(Object.keys(uf).sort().map((k) => [k, uf[k]])),
    m,
    ex,
  };
  resumo[t] = { br: out.br, uf: out.uf };
  const arquivo = path.join(outDir, `presidente-2022-${t}t.json`);
  fs.writeFileSync(arquivo, JSON.stringify(out));
  const kb = fs.statSync(arquivo).size;
  bytes += kb;
  console.log(`\n${t}º turno → ${path.relative(root, arquivo)} (${(kb / 1024).toFixed(0)} KB)`);
  console.log(`  Brasil: eleitorado ${fmt(br[0])} · válidos ${fmt(br[1])} · Lula ${fmt(br[2])} (${pc(br[2], br[1])}) · Bolsonaro ${fmt(br[3])} (${pc(br[3], br[1])})`);
  const sp = m['3550308'];
  if (sp) console.log(`  São Paulo (SP): válidos ${fmt(sp[2])} · Lula ${pc(sp[3], sp[2])} · Bolsonaro ${pc(sp[4], sp[2])}`);
  const zz = uf.zz;
  if (zz) console.log(`  Exterior: válidos ${fmt(zz[1])} · Lula ${pc(zz[2], zz[1])} · Bolsonaro ${pc(zz[3], zz[1])}`);
  console.log(`  ${Object.keys(m).length} municípios com código IBGE, ${Object.keys(ex).length} cidades no exterior`);
  if (semIBGE.length) console.log(`  sem código IBGE: ${semIBGE.join(', ')}`);
  if (difValidos) console.log(`  atenção: ${difValidos} municípios com válidos diferentes entre os dois arquivos`);
}
const arqUF = path.join(outDir, 'presidente-2022-uf.json');
fs.writeFileSync(arqUF, JSON.stringify(resumo));
bytes += fs.statSync(arqUF).size;
console.log(`\ntotais por UF → ${path.relative(root, arqUF)} (${(fs.statSync(arqUF).size / 1024).toFixed(1)} KB)`);

const semDados = [...ibge.entries()].filter(([k, cdi]) => !k.startsWith('zz:') && !acc[1].has(k)).map(([k, cdi]) => `${k} (${cdi})`);
if (semDados.length) console.log(`\nmunicípios de 2026 sem resultado em 2022: ${semDados.join(', ')}`);
console.log(`\nok, ${(bytes / 1024).toFixed(0)} KB no total`);
