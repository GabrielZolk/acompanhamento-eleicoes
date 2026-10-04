// Atualiza um elemento a partir de uma string HTML alterando só o que mudou.
// Preserva nós existentes (imagens não recarregam e transições CSS de largura funcionam).
// Filhos com data-key são casados por chave, então reordenações movem o nó em vez de recriá-lo.
//
// Animações:
// - <span class="cnt" data-v="51.07" data-f="pct|int" data-c="casas">: ao mudar data-v, o número
//   conta do valor antigo até o novo e pisca em verde (subiu) ou vermelho (desceu).
// - Contêiner com data-flip: filhos com data-key que mudam de posição deslizam até o novo lugar.
import { pct, int } from './format.js';

const calmo = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const formatar = (el, v) => (el.dataset.f === 'pct' ? pct(v, Number(el.dataset.c ?? 1)) : int(Math.round(v)));
const sufixo = (el) => el.dataset.s || '';

function contar(el, de, para) {
  if (calmo() || !Number.isFinite(de) || !Number.isFinite(para) || de === para) return;
  // Votos rolam por 2,4 s e percentuais por 1,6 s, como um placar girando.
  const t0 = performance.now(), dur = el.dataset.f === 'pct' ? 1600 : 2400;
  const id = (el._cnt = (el._cnt || 0) + 1);
  el.classList.remove('cnt--sobe', 'cnt--desce');
  void el.offsetWidth;
  el.classList.add(para > de ? 'cnt--sobe' : 'cnt--desce');
  const passo = (t) => {
    if (el._cnt !== id) return;
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 4);
    el.textContent = formatar(el, de + (para - de) * e) + sufixo(el);
    if (k < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

function flipAntes(el) {
  if (calmo() || !el.hasAttribute?.('data-flip')) return null;
  const pos = new Map();
  for (const c of el.children) if (c.dataset.key) pos.set(c.dataset.key, c.getBoundingClientRect().top);
  return pos;
}
function flipDepois(el, pos) {
  if (!pos) return;
  for (const c of el.children) {
    const antes = pos.get(c.dataset.key);
    if (antes == null) continue;
    const dy = antes - c.getBoundingClientRect().top;
    if (Math.abs(dy) < 2) continue;
    c.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 700, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    c.classList.remove('flip-subiu');
    if (dy > 0) {
      void c.offsetWidth;
      c.classList.add('flip-subiu');
    }
  }
}

export function morph(target, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const pos = flipAntes(target);
  morphChildren(target, tpl.content);
  flipDepois(target, pos);
}

function morphNode(from, to) {
  if (from.nodeType !== to.nodeType || from.nodeName !== to.nodeName) {
    from.replaceWith(to.cloneNode(true));
    return;
  }
  if (from.nodeType === 3 || from.nodeType === 8) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return;
  }
  const vAntes = from.classList?.contains('cnt') ? Number(from.dataset.v) : null;
  for (const a of [...from.attributes]) if (!to.hasAttribute(a.name)) from.removeAttribute(a.name);
  for (const a of to.attributes) if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
  const pos = flipAntes(from);
  morphChildren(from, to);
  flipDepois(from, pos);
  if (vAntes != null && Number(from.dataset.v) !== vAntes) contar(from, vAntes, Number(from.dataset.v));
}

const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute('data-key') : null);

function morphChildren(from, to) {
  const novos = [...to.childNodes];
  const porChave = new Map();
  for (const c of from.childNodes) {
    const k = keyOf(c);
    if (k) porChave.set(k, c);
  }
  novos.forEach((novo, i) => {
    const key = keyOf(novo);
    let atual = from.childNodes[i];
    if (key) {
      const match = porChave.get(key);
      if (match) {
        if (match !== atual) from.insertBefore(match, atual || null);
        atual = match;
      } else {
        from.insertBefore(novo.cloneNode(true), atual || null);
        return;
      }
    } else if (atual && keyOf(atual)) {
      from.insertBefore(novo.cloneNode(true), atual);
      return;
    }
    if (!atual) from.appendChild(novo.cloneNode(true));
    else morphNode(atual, novo);
  });
  while (from.childNodes.length > novos.length) from.removeChild(from.lastChild);
}
