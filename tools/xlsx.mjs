// Leitor mínimo de XLSX (e de ODS, ver lerOds) sem dependências (só node:zlib), suficiente para as planilhas de
// dados abertos da ANP, do Tesouro e do IBGE.
// Um .xlsx é um ZIP: lemos o diretório central, descomprimimos as entradas (deflate "cru") e interpretamos
// xl/workbook.xml, xl/_rels/workbook.xml.rels, xl/sharedStrings.xml e o XML de cada planilha com regex simples.
// Não trata fórmulas, estilos nem ZIP64: devolve o valor gravado em cada célula (texto ou número).
import zlib from 'node:zlib';

// ---------------------------------------------------------------- ZIP
// Devolve Map(nome → Buffer descomprimido).
export function lerZip(buf) {
  // Fim do diretório central (assinatura 0x06054b50), procurado de trás para frente (pode haver comentário).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('arquivo não é um ZIP válido (sem diretório central)');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const arquivos = new Map();
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('diretório central do ZIP corrompido');
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const lenNome = buf.readUInt16LE(p + 28), lenExtra = buf.readUInt16LE(p + 30), lenComent = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + lenNome);
    p += 46 + lenNome + lenExtra + lenComent;
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`cabeçalho local inválido em ${nome}`);
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const dados = buf.subarray(ini, ini + tamComp);
    if (metodo === 0) arquivos.set(nome, Buffer.from(dados));
    else if (metodo === 8) arquivos.set(nome, zlib.inflateRawSync(dados));
    else throw new Error(`método de compressão ${metodo} não suportado (${nome})`);
  }
  return arquivos;
}

// ---------------------------------------------------------------- XML
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const desescapar = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTIDADES[e]);
const atributo = (tag, nome) => tag.match(new RegExp(`\\s${nome}="([^"]*)"`))?.[1];
// Texto de um <si> ou <is>: concatena os <t> (inclusive os "runs" <r><t>), ignorando a fonética (<rPh>).
const textoRico = (xml) => desescapar([...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

// "AB12" → 27 (índice de coluna a partir de 0).
function coluna(ref) {
  let c = 0;
  for (const ch of ref.match(/^[A-Z]+/)[0]) c = c * 26 + ch.charCodeAt(0) - 64;
  return c - 1;
}

// ---------------------------------------------------------------- planilha
// Devolve [{ nome, linhas }] na ordem do arquivo; `linhas` é uma matriz densa (células vazias = null),
// com números como Number e textos como String. Datas ficam como número de série do Excel (ver dataExcel).
export function lerXlsx(buf) {
  const zip = lerZip(buf);
  const texto = (nome) => { const b = zip.get(nome); if (!b) throw new Error(`XLSX sem ${nome}`); return b.toString('utf8'); };
  const compart = zip.has('xl/sharedStrings.xml')
    ? [...texto('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textoRico(m[1]))
    : [];
  const rels = new Map([...texto('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)]
    .map((m) => [atributo(m[0], 'Id'), atributo(m[0], 'Target')]));
  const planilhas = [];
  for (const m of texto('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const nome = desescapar(atributo(m[0], 'name') || '');
    let alvo = rels.get(atributo(m[0], 'r:id'));
    if (!alvo) continue;
    alvo = alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo}`;
    planilhas.push({ nome, linhas: lerPlanilha(texto(alvo), compart) });
  }
  return planilhas;
}

function lerPlanilha(xml, compart) {
  const linhas = [];
  for (const mr of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(atributo(mr[0].slice(0, mr[0].indexOf('>') + 1), 'r')) - 1;
    const linha = [];
    for (const mc of (mr[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const abre = `<c${mc[1]}>`, corpo = mc[2] || '';
      const ref = atributo(abre, 'r'), tipo = atributo(abre, 't');
      let valor = null;
      if (tipo === 'inlineStr') valor = textoRico(corpo.match(/<is\b[^>]*>([\s\S]*?)<\/is>/)?.[1] || '');
      else {
        const v = corpo.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
        if (v != null) {
          if (tipo === 's') valor = compart[Number(v)];
          else if (tipo === 'str' || tipo === 'e') valor = desescapar(v);
          else if (tipo === 'b') valor = v === '1';
          else valor = Number(v);
        }
      }
      const c = ref ? coluna(ref) : linha.length;
      while (linha.length < c) linha.push(null);
      linha[c] = valor;
    }
    const idx = Number.isFinite(r) ? r : linhas.length;
    while (linhas.length < idx) linhas.push([]);
    linhas[idx] = linha;
  }
  return linhas;
}

// ---------------------------------------------------------------- ODS (OpenDocument)
// Planilha .ods (tabelas da Síntese de Indicadores Sociais do IBGE): também é um ZIP, com tudo em content.xml.
// Devolve [{ nome, linhas }] como lerXlsx. Células mescladas (<table:covered-table-cell>) ocupam a coluna
// (ficam null) para que os cabeçalhos fiquem alinhados com os dados; células repetidas são expandidas, menos as
// vazias do fim da linha. Linhas repetidas vazias viram uma só (não importam para a leitura por rótulo).
export function lerOds(buf) {
  const xml = lerZip(buf).get('content.xml')?.toString('utf8');
  if (!xml) throw new Error('ODS sem content.xml');
  const planilhas = [];
  for (const mt of xml.matchAll(/<table:table\b([^>]*)>([\s\S]*?)<\/table:table>/g)) {
    const nome = desescapar(atributo(mt[1], 'table:name') || '');
    const linhas = [];
    for (const mr of mt[2].matchAll(/<table:table-row\b[^>]*?(?:\/>|>([\s\S]*?)<\/table:table-row>)/g)) {
      const linha = [];
      for (const mc of (mr[1] || '').matchAll(/<table:(?:covered-)?table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g)) {
        const attrs = ` ${mc[1]}`, corpo = mc[2] || '';
        const rep = Number(atributo(attrs, 'table:number-columns-repeated') || 1);
        const tipo = atributo(attrs, 'office:value-type');
        let valor = null;
        if (tipo === 'float' || tipo === 'percentage' || tipo === 'currency') valor = Number(atributo(attrs, 'office:value'));
        else if (corpo) {
          const txt = [...corpo.matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)]
            .map((m) => desescapar(m[1].replace(/<text:s\b[^>]*\/>/g, ' ').replace(/<[^>]+>/g, ''))).join('\n');
          if (txt) valor = txt;
        }
        for (let i = 0; i < Math.min(rep, valor == null ? 1024 : rep); i++) linha.push(valor);
      }
      while (linha.length && linha[linha.length - 1] == null) linha.pop();
      linhas.push(linha);
    }
    planilhas.push({ nome, linhas });
  }
  return planilhas;
}

// Número de série do Excel (sistema 1900) → "AAAA-MM-DD".
export function dataExcel(serie) {
  const d = new Date(Math.round((serie - 25569) * 86400e3));
  return d.toISOString().slice(0, 10);
}
