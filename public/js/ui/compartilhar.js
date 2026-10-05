// Botão "compartilhar": gera uma imagem do resultado exibido (formato 4:5, bom para WhatsApp e
// Instagram) e abre o compartilhamento do celular; no computador, baixa o PNG.
// As fotos dos candidatos não entram: o servidor do TSE não permite usá-las em <canvas>.
import { pct, int, nomeProprio, hora } from '../format.js';
import { UF_BY_CODE, tituloDoCargo, nomeDoCargo } from '../ufs.js';

const W = 1080, H = 1350;

function linhas(d, uf) {
  if (d.cargo.federal) {
    const n = d.nacional;
    return { onde: d.semExterior ? 'Brasil (sem exterior)' : 'Brasil', secoes: n.secoes, itens: n.candidatos.slice(0, 5).map((c) => ({ nome: nomeProprio(c.nome), sub: c.partido, pct: c.pct, votos: c.votos, cor: c.cor })) };
  }
  const e = d.estados[uf] || {};
  const onde = UF_BY_CODE[uf]?.nome || uf.toUpperCase();
  if (d.cargo.proporcional) {
    return {
      onde,
      secoes: e.secoes,
      itens: (e.partidos || []).slice(0, 6).map((p) => ({ nome: p.sigla, sub: p.cadeiras ? `≈ ${p.cadeiras} ${p.cadeiras === 1 ? 'cadeira' : 'cadeiras'}` : nomeProprio(p.nome), pct: p.pct, votos: p.votos, cor: p.cor })),
    };
  }
  return { onde, secoes: e.secoes, itens: (e.candidatos || []).slice(0, 5).map((c) => ({ nome: nomeProprio(c.nome), sub: c.partido, pct: c.pct, votos: c.votos, cor: c.cor })) };
}

function retangulo(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export async function gerarImagem(d, uf) {
  await Promise.all(['400', '600', '700'].map((p) => document.fonts.load(`${p} 40px Inter`).catch(() => {})));
  const { onde, secoes, itens } = linhas(d, uf);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const F = (peso, tam) => `${peso} ${tam}px Inter, system-ui, sans-serif`;

  // fundo
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0e1420');
  g.addColorStop(1, '#090c12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const brilho = (x, y, r, cor) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, cor);
    rg.addColorStop(1, 'transparent');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  };
  brilho(180, 120, 520, `${itens[0]?.cor || '#3d7bf5'}33`);
  brilho(950, 260, 460, `${itens[1]?.cor || '#ef4b55'}22`);

  // cabeçalho
  ctx.fillStyle = '#8a93a6';
  ctx.font = F(600, 30);
  ctx.fillText('APURAÇÃO ELEITORAL 2026', 72, 112);
  ctx.fillStyle = '#ffffff';
  ctx.font = F(700, 64);
  ctx.fillText(d.cargo.federal ? 'Presidente' : tituloDoCargo(d.cargo, uf).replace('Disputa para ', ''), 72, 196);
  ctx.font = F(600, 40);
  ctx.fillStyle = '#c9cfdb';
  ctx.fillText(onde, 72, 252);

  // seções apuradas
  const sp = secoes?.pct || 0;
  ctx.font = F(600, 30);
  ctx.fillStyle = '#8a93a6';
  ctx.fillText(`${pct(sp, 2)} das seções apuradas`, 72, 318);
  retangulo(ctx, 72, 338, W - 144, 14, 7);
  ctx.fillStyle = '#1a2030';
  ctx.fill();
  retangulo(ctx, 72, 338, Math.max(14, ((W - 144) * sp) / 100), 14, 7);
  ctx.fillStyle = '#22c55e';
  ctx.fill();

  // candidatos / partidos
  const topo = 410, alto = itens.length > 5 ? 136 : 160;
  itens.forEach((it, i) => {
    const y = topo + i * alto;
    retangulo(ctx, 56, y, W - 112, alto - 22, 26);
    ctx.fillStyle = i === 0 ? `${it.cor}26` : '#121824';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = i === 0 ? `${it.cor}99` : '#1f2735';
    ctx.stroke();
    // posição
    ctx.beginPath();
    ctx.arc(116, y + 52, 28, 0, Math.PI * 2);
    ctx.fillStyle = it.cor;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = F(700, 30);
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), 116, y + 63);
    ctx.textAlign = 'left';
    // nome e partido
    ctx.font = F(700, 40);
    ctx.fillStyle = '#fff';
    let nome = it.nome;
    while (ctx.measureText(nome).width > 560 && nome.length > 4) nome = nome.slice(0, -2) + '…';
    ctx.fillText(nome, 166, y + 62);
    ctx.font = F(600, 26);
    ctx.fillStyle = it.cor;
    ctx.fillText(it.sub || '', 166, y + 100);
    // percentual
    ctx.textAlign = 'right';
    ctx.font = F(700, 52);
    ctx.fillStyle = '#fff';
    ctx.fillText(pct(it.pct), W - 88, y + 68);
    ctx.font = F(400, 24);
    ctx.fillStyle = '#8a93a6';
    ctx.fillText(`${int(it.votos)} votos`, W - 88, y + 102);
    ctx.textAlign = 'left';
    // barra
    const bw = W - 112 - 64;
    retangulo(ctx, 88, y + alto - 46, bw, 10, 5);
    ctx.fillStyle = '#1a2030';
    ctx.fill();
    retangulo(ctx, 88, y + alto - 46, Math.max(10, (bw * Math.min(100, it.pct)) / 100), 10, 5);
    ctx.fillStyle = it.cor;
    ctx.shadowColor = it.cor;
    ctx.shadowBlur = i === 0 ? 18 : 0;
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  // rodapé
  ctx.font = F(400, 26);
  ctx.fillStyle = '#8a93a6';
  ctx.fillText(`Dados oficiais do TSE · atualizado às ${hora(d.resultadoEm || d.atualizadoEm)}`, 72, H - 92);
  ctx.font = F(700, 30);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(location.host, 72, H - 48);

  const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
  const arquivo = `apuracao-2026-${d.cargo.key}-${d.cargo.federal ? 'brasil' : uf}.png`;
  return { blob, arquivo, texto: `${d.cargo.federal ? 'Presidente' : nomeDoCargo(d.cargo, uf)} · ${onde}: ${itens.slice(0, 2).map((it) => `${it.nome} ${pct(it.pct)}`).join(' × ')} (${pct(sp)} apurado)` };
}

export async function compartilhar(d, uf) {
  const { blob, arquivo, texto } = await gerarImagem(d, uf);
  const file = new File([blob], arquivo, { type: 'image/png' });
  const url = location.origin + location.pathname + location.search;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Apuração Eleitoral 2026', text: `${texto}\n${url}` });
      return 'compartilhado';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelado';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = arquivo;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
  return 'baixado';
}
