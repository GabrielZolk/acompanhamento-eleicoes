// Modo TV: tela cheia, alterna sozinho entre cargos e estados a cada 15 s e mantém a tela ligada.
const PASSO_MS = 15000;

export function criarModoTV({ proximo, aoSair }) {
  let ativo = false, timer = null, relogio = null, fim = 0, trava = null;
  const barra = document.createElement('div');
  barra.className = 'tv-barra';
  barra.hidden = true;
  barra.innerHTML = `<span class="tv-barra__tag">MODO TV</span><span class="tv-barra__txt" data-tv-txt></span>
    <span class="tv-barra__prox" data-tv-prox></span><button class="tv-barra__sair" data-tv-sair>Sair (Esc)</button><i class="tv-barra__tempo"></i>`;
  document.body.appendChild(barra);
  barra.querySelector('[data-tv-sair]').addEventListener('click', () => sair());

  async function manterTelaLigada() {
    try {
      trava = await navigator.wakeLock?.request('screen');
    } catch {
      /* navegador sem suporte ou sem permissão */
    }
  }

  function agendar() {
    clearTimeout(timer);
    fim = Date.now() + PASSO_MS;
    const t = barra.querySelector('.tv-barra__tempo');
    t.style.animation = 'none';
    void t.offsetWidth;
    t.style.animation = '';
    timer = setTimeout(() => {
      barra.querySelector('[data-tv-txt]').textContent = proximo();
      agendar();
    }, PASSO_MS);
  }

  async function entrar() {
    if (ativo) return;
    ativo = true;
    document.body.classList.add('tv');
    barra.hidden = false;
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      /* tela cheia recusada: segue em janela */
    }
    manterTelaLigada();
    barra.querySelector('[data-tv-txt]').textContent = proximo();
    agendar();
    relogio = setInterval(() => {
      barra.querySelector('[data-tv-prox]').textContent = `próximo em ${Math.max(0, Math.ceil((fim - Date.now()) / 1000))} s`;
    }, 250);
  }

  function sair() {
    if (!ativo) return;
    ativo = false;
    clearTimeout(timer);
    clearInterval(relogio);
    document.body.classList.remove('tv');
    barra.hidden = true;
    trava?.release?.().catch(() => {});
    trava = null;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    aoSair?.();
  }

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && ativo) sair();
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && ativo) sair();
  });
  document.addEventListener('visibilitychange', () => {
    if (ativo && document.visibilityState === 'visible') manterTelaLigada();
  });

  return { entrar, sair, get ativo() { return ativo; } };
}
