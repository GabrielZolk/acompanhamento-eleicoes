// Resumo no topo de cada aba: placar grande e tópicos curtos que explicam o placar, para quem só
// quer bater o olho. Tudo calculado dos mesmos dados e regras dos cartões (nada escrito à mão).
import { esc } from '../format.js';
import { compararIndicador, mandatosDuelo, REGRAS } from './comparar.js';
import { calcularMercado, contaCarrinho } from './mercado.js';
import { exemplosMinhaInflacao } from './minha.js';
import { exemplosIR } from './ir.js';
import { prepararSerie, estatisticasPorMandato, fmtValor, fmtVariacao, rotuloPeriodo } from './serie.js';

const pct = (v) => `${v > 0.05 ? '+' : v < -0.05 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const reais = (v) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
const nomeCurto = (ind) => ind.curto || ind.titulo;
const lista = (nomes) => (nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0] || '');

// Bloco: placar (números grandes por governo) + tópicos.
function bloco({ titulo, placar, topicos, nota }) {
  return `<section class="resumo" aria-label="${esc(titulo)}">
      <div class="resumo__placar">
        <div class="resumo__rot">${esc(titulo)}</div>
        <div class="resumo__nums">${placar}</div>
      </div>
      <ul class="resumo__topicos">${topicos.filter(Boolean).map((t) => `<li>${t}</li>`).join('')}</ul>
      ${nota ? `<p class="resumo__nota">${nota}</p>` : ''}
    </section>`;
}
const numGov = (g, n, rot) => `<div class="rnum" style="--c:${g.cor}"><b>${n}</b><span>${esc(g.curtoGov || g.curto)}</span>${rot ? `<small>${esc(rot)}</small>` : ''}</div>`;
const numNeutro = (n, rot) => `<div class="rnum rnum--neutro"><b>${n}</b><span>${esc(rot)}</span></div>`;
const vs = '<span class="rvs">×</span>';

// ------------------------------------------------------------------ Comparação
function placarIndicadores(indicadores, dados, mandatos, semPandemia) {
  const r = { venc: [[], []], igual: [], sem: [], cmps: [] };
  for (const ind of indicadores) {
    const d = dados.get(ind.id);
    if (!d) continue;
    const cmp = compararIndicador(ind, prepararSerie(d.serie, ind.periodicidade), mandatos, { semPandemia });
    if (!cmp) continue;
    r.cmps.push({ ind, cmp });
    if (!cmp.regra.melhor) r.sem.push(ind);
    else if (cmp.vencedor == null) r.igual.push(ind);
    else r.venc[cmp.vencedor].push(ind);
  }
  return r;
}

export function resumoComparacao({ indicadores, dados, mandatos, semPandemia }) {
  const gov = mandatosDuelo(mandatos);
  if (gov.length < 2) return '';
  const p = placarIndicadores(indicadores, dados, mandatos, semPandemia);
  const outro = placarIndicadores(indicadores, dados, mandatos, !semPandemia);
  const total = p.venc[0].length + p.venc[1].length + p.igual.length;
  const placar = numGov(gov[0], p.venc[0].length, 'melhor em') + vs + numGov(gov[1], p.venc[1].length, 'melhor em') + (p.igual.length ? numNeutro(p.igual.length, 'praticamente igual') : '');
  const maiores = (i) => p.cmps
    .filter((c) => c.cmp.vencedor === i)
    .map((c) => ({ c, rel: Math.abs(c.cmp.lados[0].valor - c.cmp.lados[1].valor) / Math.max(Math.abs(c.cmp.lados[0].valor), Math.abs(c.cmp.lados[1].valor), 1e-9) }))
    .sort((a, b) => b.rel - a.rel)
    .slice(0, 2)
    .map(({ c }) => {
      const [a, b] = c.cmp.lados;
      const f = (v) => (c.cmp.regra.criterio === 'variacao' ? fmtVariacao(0, v, c.ind) : fmtValor(v, c.ind));
      return `${esc(nomeCurto(c.ind))} (${esc(f(a.valor))} × ${esc(f(b.valor))})`;
    });
  const topicos = gov.map((g, i) => p.venc[i].length
    ? `<b style="color:${g.cor}">${esc(g.curtoGov)} melhor em:</b> ${esc(lista(p.venc[i].map(nomeCurto)))}.${maiores(i).length ? ` <span class="resumo__dest">Maiores diferenças: ${maiores(i).join('; ')}.</span>` : ''}`
    : '');
  if (p.igual.length) topicos.push(`<b>Praticamente igual:</b> ${esc(lista(p.igual.map(nomeCurto)))}.`);
  topicos.push(semPandemia
    ? `Contando a pandemia, o placar seria <b>${outro.venc[0].length} × ${outro.venc[1].length}</b>.`
    : `Sem os meses da pandemia, o placar fica <b>${outro.venc[0].length} × ${outro.venc[1].length}</b>.`);
  return bloco({
    titulo: `Placar em ${total} indicadores${semPandemia ? ' · sem a pandemia' : ''}`,
    placar,
    topicos,
    nota: 'Cada indicador vale 1 ponto, sem peso: desemprego conta o mesmo que dólar. Por isso, o placar resume, mas não decide: veja o cartão de cada um.',
  });
}

// ------------------------------------------------------------------ Mercado
export function resumoMercado({ mercado, mandatos, semPandemia }) {
  const { gov, linhas } = calcularMercado(mercado, mandatos, semPandemia);
  if (!linhas.length) return '';
  const itens = linhas.filter((l) => l.it.grupo !== 'referencia');
  const cont = [0, 1].map((i) => itens.filter((l) => l.menor === i).length);
  const iguais = itens.filter((l) => l.menor == null).length;
  const placar = numGov(gov[0], cont[0], 'subiu menos') + vs + numGov(gov[1], cont[1], 'subiu menos') + (iguais ? numNeutro(iguais, 'parecido') : '');
  // Itens em que cada governo teve a alta mais baixa, pela maior diferença.
  const dest = (i) => itens.filter((l) => l.menor === i)
    .sort((a, b) => Math.abs(b.lados[0].anual - b.lados[1].anual) - Math.abs(a.lados[0].anual - a.lados[1].anual))
    .slice(0, 4)
    .map((l) => `${esc(l.it.nome)} (${pct(l.lados[0].anual)} × ${pct(l.lados[1].anual)} ao ano)`);
  const topicos = [];
  const c = contaCarrinho(mercado, mandatos);
  if (c) topicos.push(`<b>Carrinho:</b> R$ 100 de compras em ${esc(rotuloPeriodo(c.b.ini.periodo, 'mensal'))} custam <b>${reais(c.hoje)}</b> hoje. Subiram <b style="color:${c.gov[0].cor}">${reais(c.fimB - 100)}</b> no governo Bolsonaro e <b style="color:${c.gov[1].cor}">${reais(c.hoje - c.fimB)}</b> no governo Lula.`);
  const geral = linhas.find((l) => l.it.id === 'geral');
  if (geral) topicos.push(`<b>Inflação geral:</b> ${pct(geral.lados[0].anual)} ao ano com Bolsonaro × ${pct(geral.lados[1].anual)} com Lula.`);
  const ex = exemplosMinhaInflacao(mercado, mandatos);
  if (ex.length) {
    topicos.push(`<b>🧮 Minha inflação</b> (exemplos): ${ex.map((e) => `${esc(e.nome.toLowerCase())}: <b style="color:${e.gov[0].cor}">${pct(e.r.anualB)}</b> × <b style="color:${e.gov[1].cor}">${pct(e.r.anualL)}</b> ao ano`).join('; ')}. <a href="#minha-inflacao" class="resumo__link">Calcule a sua ↓</a>`);
  }
  gov.forEach((g, i) => {
    const d = dest(i);
    if (d.length) topicos.push(`<b style="color:${g.cor}">Subiu menos com ${esc(g.curtoGov)}:</b> ${d.join('; ')}.`);
  });
  return bloco({
    titulo: `Em ${itens.length} itens do dia a dia${semPandemia ? ' · sem a pandemia' : ''}`,
    placar,
    topicos,
    nota: 'Comparação pela alta média por ano (os mandatos têm durações diferentes). Preço não volta quando a inflação cai: o que subiu antes continua no preço de hoje.',
  });
}

// ------------------------------------------------------------------ Impostos
export function resumoImpostos({ impostos, indicadores, dados, mandatos, semPandemia, ir, mercado }) {
  const gov = mandatosDuelo(mandatos);
  if (gov.length < 2) return '';
  const medidas = impostos?.medidas || [];
  const sobe = (m) => m.tipo === 'aumento' || m.tipo === 'criacao';
  const desce = (m) => m.tipo === 'reducao' || m.tipo === 'extincao';
  const dosGov = gov.map((g) => medidas.filter((m) => m.governo === g.id));
  const placar = gov.map((g, i) => `<div class="rnum rnum--duplo" style="--c:${g.cor}"><span>${esc(g.curtoGov)}</span>
      <div><b class="sobe">▲ ${dosGov[i].filter(sobe).length}</b><small>subiram</small></div>
      <div><b class="desce">▼ ${dosGov[i].filter(desce).length}</b><small>baixaram</small></div></div>`).join(vs);
  const topicos = [];
  const carga = dados.get('carga');
  const indCarga = indicadores.find((i) => i.id === 'carga');
  if (carga && indCarga) {
    const cmp = compararIndicador(indCarga, prepararSerie(carga.serie, indCarga.periodicidade), mandatos, { semPandemia });
    if (cmp) topicos.push(`<b>Carga tributária média:</b> ${cmp.lados.map((l) => `${esc(l.m.curtoGov)} ${esc(fmtValor(l.valor, indCarga))}`).join(' × ')}. Máxima: ${cmp.lados.map((l) => `${esc(fmtValor(l.pior.v, indCarga))} em ${esc(rotuloPeriodo(l.pior.periodo, 'anual'))}`).join(' × ')}.`);
  }
  const exIR = exemplosIR(ir, mercado);
  if (exIR.length) {
    const r2 = (v) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
    topicos.unshift(`<b>🧮 IR por mês, mesma renda real</b> (jan/2019 → dez/2022 → hoje): ${exIR.map((e) => `${r2(e.renda)}: ${r2(e.inicio)} → ${r2(e.fimB)} → <b>${r2(e.hoje)}</b>`).join('; ')}. <a href="#calc-ir" class="resumo__link">Calcule o seu ↓</a>`);
  }
  // Maiores medidas de cada lado (pelo impacto estimado; sem estimativa, as primeiras do período).
  const maior = (ms) => ms.slice().sort((a, b) => Math.abs(b.impactoBiAno || 0) - Math.abs(a.impactoBiAno || 0)).slice(0, 3)
    .map((m) => `${esc(m.titulo)}${Number.isFinite(m.impactoBiAno) ? ` (${m.impactoBiAno > 0 ? '+' : '−'}R$ ${Math.abs(m.impactoBiAno).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} bi)` : ''}`);
  gov.forEach((g, i) => {
    const s = maior(dosGov[i].filter(sobe)), d = maior(dosGov[i].filter(desce));
    if (s.length || d.length) topicos.push(`<b style="color:${g.cor}">${esc(g.curtoGov)}</b> · <span class="r-sobe">▲ maiores altas:</span> ${s.length ? s.join('; ') : 'nenhuma'}. <span class="r-desce">▼ maiores cortes:</span> ${d.length ? d.join('; ') : 'nenhum'}.`);
  });
  return bloco({
    titulo: `Medidas sobre impostos federais (${medidas.length})`,
    placar,
    topicos,
    nota: 'Contar medidas não mede o peso de cada uma: uma isenção de IR vale mais que dez ajustes pequenos. Valores entre parênteses são estimativas oficiais de impacto por ano, quando existem.',
  });
}

// ------------------------------------------------------------------ Leis e programas
export function resumoLeis({ leis, mandatos }) {
  const gov = mandatosDuelo(mandatos);
  const itens = leis?.itens || [];
  if (!itens.length || gov.length < 2) return '';
  const dosGov = gov.map((g) => itens.filter((i) => i.governo === g.id));
  const placar = gov.map((g, i) => numGov(g, dosGov[i].length, 'leis e programas')).join(vs);
  const topicos = gov.map((g, i) => {
    const porArea = {};
    for (const it of dosGov[i]) porArea[it.area] = (porArea[it.area] || 0) + 1;
    const areas = Object.entries(porArea).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, n]) => `${a} (${n})`);
    const dest = dosGov[i].filter((it) => it.alcance).slice(0, 4).map((it) => esc(it.titulo));
    return `<b style="color:${g.cor}">${esc(g.curtoGov)}:</b> mais itens em ${esc(lista(areas))}.${dest.length ? ` Maior alcance: ${dest.join(', ')}.` : ''}`;
  });
  const contra = itens.filter((i) => i.origem === 'congresso');
  if (contra.length) {
    const nomes = contra.slice(0, 4).map((i) => i.titulo);
    topicos.push(`<b>${contra.length} vieram do Congresso</b> (iniciativa própria ou contra o governo), como ${esc(nomes.join(', '))}${contra.length > 4 ? ' e outras' : ''}.`);
  }
  return bloco({
    titulo: 'Leis, emendas e programas de grande alcance',
    placar,
    topicos,
    nota: 'Aqui o número não é placar de quem foi melhor: mostra o volume de mudanças. O efeito de cada uma está no texto do item.',
  });
}

// ------------------------------------------------------------------ Todos os mandatos
// Em cada indicador, o mandato com o melhor valor pela mesma regra dos cartões (média, ou variação
// para a dívida). Só entram mandatos cobertos inteiros pela série.
export function resumoHistorico({ indicadores, dados, mandatos }) {
  const vitorias = new Map(mandatos.map((m) => [m.id, []]));
  for (const ind of indicadores) {
    const r = REGRAS[ind.id];
    const d = dados.get(ind.id);
    if (!r?.melhor || !d) continue;
    const pts = prepararSerie(d.serie, ind.periodicidade);
    const est = estatisticasPorMandato(pts, mandatos, ind, ind.periodicidade).filter((l) => !/a partir de/.test(l.cobertura));
    if (est.length < 3) continue;
    const valor = (l) => (r.criterio === 'variacao' ? l.fim.v - l.ini.v : l.media);
    const melhor = est.reduce((a, b) => ((r.melhor === 'menor' ? valor(b) < valor(a) : valor(b) > valor(a)) ? b : a));
    vitorias.get(melhor.mandato.id).push(ind);
  }
  const ordem = mandatos.filter((m) => vitorias.get(m.id).length).sort((a, b) => vitorias.get(b.id).length - vitorias.get(a.id).length);
  if (!ordem.length) return '';
  const placar = ordem.map((m) => `<div class="rnum rnum--neutro"><b>${vitorias.get(m.id).length}</b><span>${esc(m.curto || m.nome)}</span></div>`).join('');
  const topicos = ordem.map((m) => `<b>${esc(m.nome)}:</b> melhor em ${esc(lista(vitorias.get(m.id).map(nomeCurto)))}.`);
  return bloco({
    titulo: 'Mandato com o melhor número em cada indicador',
    placar,
    topicos,
    nota: 'Só entram mandatos cobertos do começo ao fim pela série (desemprego e renda começam em 2012). Contexto pesa: cada período teve sua crise e seu ciclo de preços internacionais.',
  });
}
