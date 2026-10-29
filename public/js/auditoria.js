// Auditoria independente do 2º turno de 2026. Lê o resumo gerado por tools/auditoria-urnas (a partir dos
// arquivos que cada urna transmitiu ao TSE) e mostra, para cada suspeita, o que se diz, o que os dados
// mostram e o que não dá para saber. Mesma régua para os dois candidatos.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const int = (n) => Math.round(n || 0).toLocaleString('pt-BR');
const pct = (n, c = 2) => `${(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })}%`;
const NOMES = { 13: 'Lula', 22: 'Flávio Bolsonaro', branco: 'Brancos', nulo: 'Nulos' };
const CORES = { 13: '#e5484d', 22: '#3b82f6', branco: '#8a93a6', nulo: '#5f687b' };
const UFN = { ac: 'Acre', al: 'Alagoas', am: 'Amazonas', ap: 'Amapá', ba: 'Bahia', ce: 'Ceará', df: 'Distrito Federal', es: 'Espírito Santo', go: 'Goiás', ma: 'Maranhão', mg: 'Minas Gerais', ms: 'Mato Grosso do Sul', mt: 'Mato Grosso', pa: 'Pará', pb: 'Paraíba', pe: 'Pernambuco', pi: 'Piauí', pr: 'Paraná', rj: 'Rio de Janeiro', rn: 'Rio Grande do Norte', ro: 'Rondônia', rr: 'Roraima', rs: 'Rio Grande do Sul', sc: 'Santa Catarina', se: 'Sergipe', sp: 'São Paulo', to: 'Tocantins', zz: 'Exterior' };
const titulo = (s) => String(s || '').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());
const lugar = (x) => `${esc(titulo(x.nm) || x.mu)} (${x.uf === 'zz' ? 'exterior, hora local' : x.uf.toUpperCase()}) · zona ${+x.zo} · seção ${+x.se}`;

function selo(estado, txt) {
  const ic = { ok: '✓', alerta: '!', info: 'i', nao: '–' }[estado];
  return `<span class="selo selo--${estado}"><b>${ic}</b>${txt}</span>`;
}

// Três blocos fixos em cada suspeita.
function blocos(diz, mostram, naoSabe) {
  return `<div class="tri">
      <div class="tri__b tri__b--diz"><h4>O que se diz</h4>${diz}</div>
      <div class="tri__b tri__b--dados"><h4>O que os dados mostram</h4>${mostram}</div>
      <div class="tri__b tri__b--limite"><h4>O que não dá para saber</h4>${naoSabe}</div>
    </div>`;
}

function barras(itens, { max, fmt = int, destaque } = {}) {
  const m = max ?? Math.max(...itens.map((i) => i.v), 1);
  return `<div class="hbar">${itens.map((i) => `<div class="hbar__l${i.k === destaque ? ' is-destaque' : ''}">
      <span class="hbar__rot">${i.rot}</span>
      <span class="hbar__trilho"><i style="width:${Math.max(0.4, (100 * i.v) / m).toFixed(2)}%;background:${i.cor || '#6d86ff'}"></i></span>
      <b>${fmt(i.v)}</b></div>`).join('')}</div>`;
}

function colunas(pares, { marca, corDe } = {}) {
  const m = Math.max(...pares.map(([, v]) => v), 1);
  return `<div class="vbar">${pares.map(([k, v]) => `<div class="vbar__c${marca && marca(k) ? ' is-marca' : ''}" title="${esc(k)}: ${int(v)}">
      <i style="height:${Math.max(v ? 1.5 : 0, (100 * v) / m).toFixed(2)}%;${corDe ? `background:${corDe(k)}` : ''}"></i><span>${esc(k)}</span></div>`).join('')}</div>`;
}

function lista(itens, linha, vazio = 'Nenhuma.') {
  if (!itens?.length) return `<p class="vazio">${vazio}</p>`;
  return `<ol class="lst">${itens.map((x) => `<li>${linha(x)}</li>`).join('')}</ol>`;
}

// ------------------------------------------------------------------ seções
function placar(d) {
  const r = d.recontagem;
  const dif = ['13', '22', 'branco', 'nulo'].map((k) => r.boletins[k] + (r.sem_arquivo?.[k] || 0) - r.oficial[k]);
  const recontOk = dif.every((x) => x === 0);
  const planOk = d.consistencia.bu_x_planilha_total === 0;
  const logDif = d.consistencia.log_x_bu_total;
  const h = d.horario, b = d.biometria;
  const comp = r.comparecimento.boletins;
  const semBio = b.falhou + b.codigo;
  return `<section class="aud-placar">
      <div class="aud-placar__item ${recontOk ? 'ok' : 'alerta'}"><b>${recontOk ? '✓' : '!'}</b><span><strong>Recontagem</strong>${recontOk ? 'A soma dos boletins de todas as urnas é igual ao resultado oficial, voto a voto.' : `A soma dos boletins difere do oficial (Lula ${dif[0] >= 0 ? '+' : ''}${int(dif[0])}, Flávio ${dif[1] >= 0 ? '+' : ''}${int(dif[1])}).`}</span></div>
      <div class="aud-placar__item ${planOk ? 'ok' : 'alerta'}"><b>${planOk ? '✓' : '!'}</b><span><strong>Planilha do TSE</strong>${planOk ? 'Bate com o boletim gravado em cada urna.' : `${int(d.consistencia.bu_x_planilha_total)} seções com números diferentes.`}</span></div>
      <div class="aud-placar__item ${logDif === 0 ? 'ok' : 'info'}"><b>${logDif === 0 ? '✓' : 'i'}</b><span><strong>Log × boletim</strong>${logDif === 0 ? 'Em todas as urnas, os votos registrados no log com hora são os mesmos do boletim.' : `Bate em ${int(d.secoes.arquivos - logDif)} urnas. ${int(logDif)} têm diferença${d.consistencia.log_x_bu.every((x) => x.motivo) ? ', todas explicadas (urna trocada no dia ou 1 linha faltando no log)' : ' (detalhes abaixo)'}.`}</span></div>
      <div class="aud-placar__item info"><b>i</b><span><strong>Depois das 17h</strong>${int(h.apos17)} votos (${pct((100 * h.apos17) / comp, 3)} do total), em ${int(h.secoes_apos17)} seções.</span></div>
      <div class="aud-placar__item info"><b>i</b><span><strong>Sem biometria</strong>${pct((100 * semBio) / comp, 1)} dos eleitores votaram liberados sem a digital.</span></div>
      <div class="aud-placar__item nao"><b>–</b><span><strong>Falecidos</strong>Não dá para verificar com dados públicos (explicação abaixo).</span></div>
    </section>`;
}

function secRecontagem(d) {
  const r = d.recontagem;
  const temFalta = Object.values(r.sem_arquivo || {}).some((v) => v);
  const linhas = ['13', '22', 'branco', 'nulo'].map((k) => {
    const falta = r.sem_arquivo?.[k] || 0;
    const dif = r.boletins[k] + falta - r.oficial[k];
    return `<tr><th scope="row"><i class="pt" style="background:${CORES[k]}"></i>${NOMES[k]}</th><td>${int(r.boletins[k])}</td>${temFalta ? `<td>+ ${int(falta)}</td>` : ''}<td>${int(r.planilha_tse[k])}</td><td>${int(r.oficial[k])}</td>
      <td class="${dif ? 'dif' : 'ok'}">${dif ? (dif > 0 ? '+' : '') + int(dif) : '✓ igual'}</td></tr>`;
  }).join('');
  const ufs = Object.entries(d.uf).sort((a, b) => b[1].comparecimento - a[1].comparecimento);
  const linhasUF = ufs.map(([uf, u]) => {
    const d13 = (u.bu_13 || 0) + (u.falt_13 || 0) - u.of_13, d22 = (u.bu_22 || 0) + (u.falt_22 || 0) - u.of_22;
    return `<tr><th scope="row">${UFN[uf]}</th><td>${int(u.secoes)}</td><td>${int(u.bu_13)}</td><td class="${d13 ? 'dif' : 'ok'}">${d13 ? int(d13) : '✓'}</td><td>${int(u.bu_22)}</td><td class="${d22 ? 'dif' : 'ok'}">${d22 ? int(d22) : '✓'}</td></tr>`;
  }).join('');
  const gov = Object.entries(r.governador || {}).map(([uf, g]) => {
    const ks = Object.keys(g.oficial).filter((k) => !['branco', 'nulo'].includes(k));
    const ok = ks.every((k) => (g.bu[k] || 0) === g.oficial[k]);
    return `<span class="chipx ${ok ? 'ok' : 'dif'}">${ok ? '✓' : '!'} ${UFN[uf]}</span>`;
  }).join('');
  const total = r.comparecimento;
  return `<section class="aud-card" id="recontagem">
      <h2>1. Recontagem própria: somamos o boletim de cada urna</h2>
      <p class="aud-lead">Cada urna imprime e grava um boletim (BU) assinado digitalmente ao fim da votação. Lemos o arquivo gravado de <b>${int(d.secoes.arquivos)} urnas</b>,
        somamos os votos e comparamos com a planilha de boletins do TSE e com o resultado oficial.</p>
      <div class="tabela"><table><thead><tr><th></th><th>Soma dos boletins (nossa)</th>${temFalta ? '<th>Seções sem arquivo (pela planilha)</th>' : ''}<th>Planilha do TSE</th><th>Resultado oficial</th><th>Diferença</th></tr></thead><tbody>${linhas}</tbody></table></div>
      ${temFalta ? `<p class="aud-nota">${int(d.secoes.sem_arquivo)} seções aparecem na planilha do TSE, mas o arquivo da urna não veio no pacote público (a maioria no exterior). Os votos delas entram pela planilha e estão listados na parte 5, para quem quiser cobrar os arquivos.</p>` : ''}
      <p class="aud-nota">Comparecimento: ${int(total.boletins)} nos boletins${total.sem_arquivo ? ` + ${int(total.sem_arquivo)} nas seções sem arquivo` : ''} × ${int(total.oficial)} no oficial. Seções no resultado oficial: ${int(d.secoes.oficial)}; arquivos de urna lidos: ${int(d.secoes.arquivos)}${d.secoes.sem_arquivo ? `; seções da planilha sem arquivo no pacote: ${int(d.secoes.sem_arquivo)} (lista na parte 5)` : ''}.</p>
      ${gov ? `<p class="aud-nota">Governador (2º turno em 6 estados), soma dos boletins × oficial: ${gov}</p>` : ''}
      <details class="aud-det"><summary>Ver estado por estado</summary>
        <div class="tabela"><table><thead><tr><th>Estado</th><th>Urnas</th><th>Lula (boletins)</th><th>× oficial</th><th>Flávio (boletins)</th><th>× oficial</th></tr></thead><tbody>${linhasUF}</tbody></table></div>
      </details>
      ${blocos(
        '<p>Que o resultado divulgado não corresponde ao que as urnas registraram.</p>',
        '<p>A soma feita aqui, urna por urna, a partir do arquivo que cada uma gravou, é comparada número a número com o oficial na tabela acima.</p>',
        '<p>A recontagem confere a <b>soma</b>. Ela não prova que cada voto digitado foi gravado como o eleitor quis: isso depende do software da urna, testado em auditorias públicas (teste público de segurança, teste de integridade no dia da eleição).</p>',
      )}
    </section>`;
}

function secHorario(d) {
  const h = d.horario, comp = d.recontagem.comparecimento.boletins, m = h.metodos;
  const metodos = [
    { k: 'certo', rot: '<b>Votos computados depois das 17h</b> (contagem certa)', v: m.apos17_brasil ?? h.apos17, cor: '#f5b13d' },
    { k: 'conf', rot: 'Linhas “voto confirmado” depois das 17h (conta cada cargo)', v: m.confirmados_apos17 || 0, cor: '#5f687b' },
    { k: 'secoes', rot: 'Todos os votos das seções que tiveram algum voto depois das 17h', v: m.comparecimento_secoes_com_voto_apos17 || 0, cor: '#5f687b' },
    { k: 'encerradas', rot: 'Todos os votos das seções encerradas depois das 17h', v: m.comparecimento_secoes_encerradas_apos17 || 0, cor: '#5f687b' },
  ];
  const horas = Object.entries(h.por_hora).filter(([hr]) => +hr >= 7 && +hr <= 19).map(([hr, v]) => [`${hr}h`, v]);
  const ult = Object.entries(h.ultimo_voto).filter(([t]) => t >= '16:00' && t <= '18:30');
  const ufs = Object.entries(d.uf).map(([uf, u]) => ({ k: uf, rot: UFN[uf], v: (100 * u.apos17) / Math.max(1, u.comparecimento), cor: '#f5b13d' })).sort((a, b) => b.v - a.v);
  return `<section class="aud-card" id="horario">
      <h2>2. Votos depois das 17h</h2>
      <div class="kpis">
        <div class="kpi kpi--amb"><b>${int(h.apos17)}</b><span>votos computados depois das 17h de Brasília</span></div>
        <div class="kpi"><b>${pct((100 * h.apos17) / comp, 3)}</b><span>do total de ${int(comp)} votos</span></div>
        <div class="kpi"><b>${int(h.apos18)}</b><span>depois das 18h</span></div>
        <div class="kpi"><b>${int(h.antes8)}</b><span>antes das 8h (abertura)</span></div>
      </div>
      <h3>De onde pode sair um número como “8 milhões”</h3>
      <p class="aud-lead">O mesmo log, contado de jeitos diferentes, dá números muito diferentes. Só a primeira barra mede votos depois das 17h (urnas no Brasil):</p>
      ${barras(metodos, { destaque: 'certo' })}
      <p class="aud-nota">As seções encerram às 17h ou alguns minutos depois (o mesário fecha a urna depois do último eleitor da fila). Por isso “seções encerradas depois das 17h” são quase todas, e somar todos os votos delas, ou de quem teve um voto às 17h01, conta votos dados de manhã.</p>
      <div class="duas">
        <div><h3>Votos por hora (Brasília)</h3>${colunas(horas, { marca: (k) => parseInt(k, 10) >= 17, corDe: (k) => (parseInt(k, 10) >= 17 ? '#f5b13d' : '#6d86ff') })}</div>
        <div><h3>Hora do último voto de cada seção</h3>${colunas(ult, { marca: (k) => k >= '17:00', corDe: (k) => (k >= '17:00' ? '#f5b13d' : '#6d86ff') })}</div>
      </div>
      <details class="aud-det"><summary>Por estado (% dos votos depois das 17h)</summary>${barras(ufs, { fmt: (v) => pct(v, 3) })}</details>
      <details class="aud-det"><summary>Seções com mais votos depois das 17h</summary>
        ${lista(h.top_apos17, (x) => `<b>${int(x.n)} votos</b> até ${esc(x.ultimo)} · ${lugar(x)}${x.sem_bio ? ` · ${int(x.sem_bio)} sem biometria` : ''}<small>${x.horas.map(esc).join(' · ')}</small>`)}
      </details>
      ${blocos(
        '<p>Que houve votação irregular depois do horário, em volume capaz de mudar o resultado.</p>',
        `<p>O log de cada urna registra a hora exata de cada voto. Depois das 17h de Brasília entraram <b>${int(h.apos17)}</b> votos (${pct((100 * h.apos17) / comp, 3)}). A lei permite votar depois das 17h a quem já estava na fila às 17h.</p>`,
        '<p>Em quem foram esses votos: o registro digital do voto é embaralhado e não tem hora, justamente para manter o voto secreto. Também não dá para saber, pelos arquivos, se a pessoa estava na fila antes das 17h.</p>',
      )}
    </section>`;
}

function secBiometria(d) {
  const b = d.biometria, comp = d.recontagem.comparecimento.boletins;
  const sem = b.falhou + b.codigo;
  const ufs = Object.entries(d.uf).filter(([uf]) => uf !== 'zz')
    .map(([uf, u]) => ({ k: uf, rot: UFN[uf], v: (100 * ((u.hab_bio_falhou || 0) + (u.hab_codigo || 0))) / Math.max(1, u.comparecimento), cor: '#a78bfa' })).sort((a, b2) => b2.v - a.v);
  const dm = b.dentro_municipio;
  const curva = Object.entries(dm.curva).sort((x, y) => +x[0] - +y[0]).map(([k, v]) => [`${+k > 0 ? '+' : ''}${k}`, v]);
  const maxAbs = Math.max(1, ...curva.map(([, v]) => Math.abs(v)));
  const dist = Object.entries(b.distribuicao).map(([k, v]) => [`${k}%`, v]);
  return `<section class="aud-card" id="biometria">
      <h2>3. Eleitores liberados sem biometria</h2>
      <div class="kpis">
        <div class="kpi"><b>${pct((100 * b.bio) / comp, 1)}</b><span>votaram com a digital reconhecida (${int(b.bio)})</span></div>
        <div class="kpi kpi--roxo"><b>${pct((100 * b.falhou) / comp, 1)}</b><span>tinham digital cadastrada, ela não foi reconhecida, e o mesário liberou (${int(b.falhou)})</span></div>
        <div class="kpi kpi--roxo"><b>${pct((100 * b.codigo) / comp, 1)}</b><span>liberados sem digital por outro motivo, como eleitor sem biometria cadastrada (${int(b.codigo)})</span></div>
      </div>
      <p class="aud-nota">Números do boletim de cada urna, que separa como cada eleitor foi habilitado. Conferimos com o log urna por urna: a classificação feita pelo log bate com a do boletim.</p>
      <div class="duas">
        <div><h3>Por estado</h3>${barras(ufs, { fmt: (v) => pct(v, 1) })}</div>
        <div><h3>Quantas seções em cada faixa de liberação sem biometria</h3>${colunas(dist)}</div>
      </div>
      <h3>Liberar mais sem biometria muda a votação?</h3>
      <p class="aud-lead">Comparamos seções <b>da mesma cidade</b>: as que liberaram mais eleitores sem digital do que a média da cidade votaram diferente das outras?
        Resultado: a cada 10 pontos a mais de liberação sem biometria, a votação de Lula muda <b>${dm.inclinacao_pp_por_10pp > 0 ? '+' : ''}${(dm.inclinacao_pp_por_10pp ?? 0).toLocaleString('pt-BR')} ponto(s)</b> (${int(dm.secoes)} seções em ${int(dm.municipios)} cidades).</p>
      <div class="curva">${curva.map(([k, v]) => `<div class="curva__c" title="${esc(k)} p.p. de liberação: ${v.toLocaleString('pt-BR')} p.p. de Lula">
          <i class="${v >= 0 ? 'pos' : 'neg'}" style="height:${((50 * Math.abs(v)) / maxAbs).toFixed(1)}%"></i><span>${esc(k)}</span></div>`).join('')}</div>
      <p class="aud-nota">Eixo de baixo: quanto a seção liberou sem biometria acima ou abaixo da média da própria cidade (pontos percentuais). Barra para cima: Lula teve votação maior que a média da cidade; para baixo, menor. Comparar dentro da cidade evita confundir com diferenças entre regiões: lugares com mais falha de leitura de digital (mais idosos e trabalhadores manuais, por exemplo) podem votar diferente por outros motivos. Sem esse controle, a correlação entre seções do país todo seria ${(dm.correlacao_sem_controle ?? 0).toLocaleString('pt-BR')}.</p>
      <details class="aud-det"><summary>Seções com maior proporção de liberação sem biometria (100 votos ou mais)</summary>
        ${lista(b.top_pct, (x) => `<b>${pct(x.pct, 1)}</b> (${int(x.n)} de ${int(x.comp)}) · ${lugar(x)}<small>${int(x.falhou)} digitais não reconhecidas · ${int(x.codigo)} sem digital cadastrada</small>`)}
      </details>
      <details class="aud-det"><summary>Maiores sequências de eleitores seguidos liberados sem biometria</summary>
        ${lista(b.top_seq, (x) => `<b>${int(x.n)} seguidos</b> até ${esc(x.ate)} · ${lugar(x)}`)}
      </details>
      ${blocos(
        '<p>Que mesários liberaram muitos eleitores sem identificação, o que permitiria alguém votar no lugar de outro.</p>',
        `<p>${pct((100 * sem) / comp, 1)} dos eleitores votaram sem a digital reconhecida. Quando a digital falha 4 vezes, o mesário confere o documento com foto, digita o ano de nascimento e libera com a própria digital. Fica tudo no log. As seções fora do padrão estão listadas acima, com local.</p>`,
        '<p>Se a pessoa liberada era mesmo o eleitor: isso só se confere na seção, com o documento. Os arquivos públicos não têm nome, título nem foto do eleitor.</p>',
      )}
    </section>`;
}

function secFalecidos() {
  return `<section class="aud-card" id="falecidos">
      <h2>4. Falecidos votando</h2>
      ${blocos(
        '<p>Que títulos de pessoas mortas foram usados para votar.</p>',
        '<p>Não há como checar isso com dados públicos. Nenhum arquivo do TSE liga um eleitor ao voto ou ao comparecimento: o log da urna não traz título, nome ou CPF de quem votou, e o caderno de votação (lista de quem assinou) não é publicado.</p><p>O que existe: o TSE cancela o título de quem morre cruzando o cadastro com os cartórios (sistema SIRC), e a maioria dos eleitores vota com a digital, que não funciona para outra pessoa.</p>',
        '<p>Para verificar de verdade, seria preciso cruzar a lista de quem compareceu (não pública) com os óbitos dos cartórios. Isso só pode ser pedido à Justiça Eleitoral, por partido, Ministério Público ou pela própria Justiça.</p>',
      )}
    </section>`;
}

function secConsistencia(d) {
  const c = d.consistencia;
  const tu = d.secoes.tipos_urna || {};
  const nomesTipo = { 1: 'urna da própria seção', 3: 'urna de contingência', 4: 'urna de contingência que substituiu a da seção', 6: 'dados recuperados de outra urna' };
  return `<section class="aud-card" id="consistencia">
      <h2>5. Conferências urna por urna</h2>
      <div class="kpis">
        <div class="kpi"><b>${int(c.log_x_bu_total)}</b><span>urnas em que o total de votos no log difere do boletim (motivo de cada uma na lista)</span></div>
        <div class="kpi"><b>${int(c.bu_x_planilha_total)}</b><span>urnas em que o boletim difere da planilha do TSE</span></div>
        <div class="kpi"><b>${int(c.erros_total)}</b><span>arquivos que não conseguimos ler</span></div>
        <div class="kpi"><b>${int(d.secoes.sa)}</b><span>seções apuradas por cédula ou recuperação (sem votação eletrônica completa)</span></div>
      </div>
      <p class="aud-nota">Tipo de urna nos boletins: ${Object.entries(tu).map(([k, v]) => `${esc(nomesTipo[k] || `tipo ${k}`)}: ${int(v)}`).join(' · ')}.</p>
      <details class="aud-det"><summary>Urnas em que o log difere do boletim</summary>
        ${lista(c.log_x_bu, (x) => `${lugar(x)} · log ${int(x.log)} × boletim ${int(x.bu)}${x.sa ? ' · apurada por cédula' : ''}${x.motivo ? `<small>${esc(x.motivo)}</small>` : ''}`)}</details>
      <details class="aud-det"><summary>Urnas em que o boletim difere da planilha do TSE</summary>
        ${lista(c.bu_x_planilha, (x) => `${lugar(x)} · boletim ${esc(JSON.stringify(x.bu))} × planilha ${esc(JSON.stringify(x.bweb))}`)}</details>
      <details class="aud-det"><summary>Seções da planilha sem arquivo de urna no pacote</summary>
        ${lista(c.sem_arquivo, (x) => `${lugar(x)} · ${esc(x.tipo)} · ${int(x.comp)} votos${x.agregadas && x.agregadas !== '#NULO#' ? ` · seções agregadas: ${esc(x.agregadas)}` : ''}`)}</details>
    </section>`;
}

function secMunicipio() {
  return `<section class="aud-card" id="municipio">
      <h2>6. Procure sua cidade</h2>
      <input class="aud-busca" id="busca" type="search" placeholder="Digite o nome da cidade" autocomplete="off" aria-label="Cidade" />
      <div id="busca-res"></div>
    </section>`;
}

function secMetodo(d) {
  const f = d.fontes;
  return `<section class="aud-card aud-card--metodo" id="metodo">
      <h2>Como foi feito</h2>
      <ol class="metodo">
        <li>Baixamos do Portal de Dados Abertos do TSE o pacote com os arquivos que cada urna gravou no 2º turno (cerca de 115 GB): <a href="${esc(f.arquivos)}" target="_blank" rel="noopener noreferrer">arquivos transmitidos para totalização</a>.</li>
        <li>Lemos o boletim de urna de cada seção com a <a href="${esc(f.especificacao)}" target="_blank" rel="noopener noreferrer">especificação técnica publicada pelo TSE</a> e o log da urna, que registra cada evento com data e hora.</li>
        <li>Comparamos com a <a href="${esc(f.bweb)}" target="_blank" rel="noopener noreferrer">planilha de boletins</a> e com o <a href="${esc(f.oficial)}" target="_blank" rel="noopener noreferrer">resultado oficial</a> (versão de ${esc(d.oficial_gerado)}).</li>
        <li>Horários: o relógio da urna marca a hora local; convertemos para Brasília pela hora de abertura da seção (que abre às 8h de Brasília). No exterior, usamos a hora local.</li>
        <li>O código está no repositório do site (pasta <code>tools/auditoria-urnas</code>), e qualquer pessoa pode rodar e conferir.</li>
      </ol>
      <p class="aud-nota">Gerado em ${esc(d.geradoEm)}. Esta página não acusa nem defende ninguém: mostra o que os arquivos públicos permitem verificar e onde está o limite do que dá para saber.</p>
    </section>`;
}

// ------------------------------------------------------------------ busca por cidade
let municipios = null;
async function buscar(q) {
  const res = $('busca-res');
  q = q.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (q.length < 3) { res.innerHTML = ''; return; }
  municipios ||= await fetch('/data/auditoria/2t-municipios.json').then((r) => r.json());
  const achados = municipios.filter((m) => m[2].toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').includes(q)).slice(0, 8);
  res.innerHTML = achados.length ? achados.map(([uf, , nm, secoes, comp, apos17, semBio, v13, v22]) => {
    const val = v13 + v22 || 1;
    return `<div class="cid"><strong>${esc(titulo(nm))} (${uf.toUpperCase()})</strong>
      <span>${int(secoes)} urnas · ${int(comp)} votos</span>
      <span>Lula ${pct((100 * v13) / val, 1)} · Flávio ${pct((100 * v22) / val, 1)} <small>(dos válidos, soma dos boletins)</small></span>
      <span>${int(apos17)} votos depois das 17h · ${pct((100 * semBio) / Math.max(1, comp), 1)} liberados sem biometria</span></div>`;
  }).join('') : '<p class="vazio">Nenhuma cidade encontrada.</p>';
}

// ------------------------------------------------------------------ início
(async () => {
  try {
    const d = await fetch('/data/auditoria/2t.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    $('aud').innerHTML = `<section class="intro">
        <h1 class="intro__titulo">Auditoria independente do 2º turno</h1>
        <p class="intro__txt">Pegamos os arquivos que <b>cada uma das ${int(d.secoes.arquivos)} urnas</b> gravou no 2º turno (25/10/2026), refizemos a soma e olhamos o log de cada uma.
          Para cada suspeita que circula: o que se diz, o que os dados mostram e o que não dá para saber.</p>
      </section>
      ${placar(d)}
      <nav class="aud-indice" aria-label="Partes"><a href="#recontagem">Recontagem</a><a href="#horario">Depois das 17h</a><a href="#biometria">Sem biometria</a><a href="#falecidos">Falecidos</a><a href="#consistencia">Conferências</a><a href="#municipio">Sua cidade</a><a href="#metodo">Como foi feito</a></nav>
      ${secRecontagem(d)}${secHorario(d)}${secBiometria(d)}${secFalecidos()}${secConsistencia(d)}${secMunicipio()}${secMetodo(d)}`;
    let t;
    $('busca').addEventListener('input', (ev) => { clearTimeout(t); t = setTimeout(() => buscar(ev.target.value), 200); });
  } catch (e) {
    $('aud').innerHTML = '<p class="carregando">Os dados da auditoria ainda estão sendo processados. Volte em algumas horas.</p>';
  }
})();
