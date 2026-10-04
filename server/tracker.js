// O TSE publica apenas o estado atual. A evolução da apuração e o feed de
// "últimas atualizações" são montados comparando cada novo arquivo de
// acompanhamento com o anterior. O estado é serializável para ser guardado
// em qualquer armazenamento (ver store.js).

const MAX_HISTORICO = 1500;
const MAX_ATUALIZACOES = 200;

export class Tracker {
  constructor(salvo) {
    this.historico = salvo?.historico || [];
    this.atualizacoes = salvo?.atualizacoes || [];
    this.ultimo = salvo?.ultimo || {};
  }

  // ab: retorno de parseAcompanhamento. Devolve true se algo mudou.
  ingest(ab) {
    if (!ab) return false;
    const t = ab.geradoEm || Date.now();
    let mudou = false;
    for (const [uf, item] of Object.entries(ab.ufs)) {
      const { apuradas, pct } = item.secoes;
      const prev = this.ultimo[uf];
      if (prev && apuradas > prev.apuradas && !this.atualizacoes.some((u) => u.t === t && u.uf === uf)) {
        this.atualizacoes.push({ t, uf, adicionadas: apuradas - prev.apuradas, delta: pct - prev.pct, pct });
        mudou = true;
      }
      if (!prev || apuradas !== prev.apuradas) {
        this.ultimo[uf] = { apuradas, pct };
        mudou = true;
      }
    }
    const nac = ab.br?.secoes;
    if (nac) {
      // Mesmo percentual sem as seções do exterior (checkbox "Incluir exterior" desmarcado).
      let ts = 0, st = 0;
      for (const [uf, item] of Object.entries(ab.ufs)) {
        if (uf === 'zz') continue;
        ts += item.secoes.total;
        st += item.secoes.apuradas;
      }
      const ponto = { t, pct: nac.pct, pctSE: ts ? (st / ts) * 100 : 0, apuradas: nac.apuradas };
      const last = this.historico.at(-1);
      if (!last || last.apuradas !== nac.apuradas) {
        if (last && t <= last.t) Object.assign(last, ponto, { t: last.t }); // mesmo instante de geração
        else this.historico.push(ponto);
        mudou = true;
      }
    }
    if (mudou) {
      this.historico = this.historico.slice(-MAX_HISTORICO);
      this.atualizacoes = this.atualizacoes.slice(-MAX_ATUALIZACOES);
    }
    return mudou;
  }

  toJSON() {
    return { historico: this.historico, atualizacoes: this.atualizacoes, ultimo: this.ultimo };
  }

  view() {
    return { historico: this.historico, atualizacoes: this.atualizacoes.slice(-60).reverse() };
  }
}
