// Atualiza um elemento a partir de uma string HTML alterando só o que mudou.
// Preserva nós existentes (imagens não recarregam e transições CSS de largura funcionam).
// Filhos com data-key são casados por chave, então reordenações movem o nó em vez de recriá-lo.

export function morph(target, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  morphChildren(target, tpl.content);
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
  for (const a of [...from.attributes]) if (!to.hasAttribute(a.name)) from.removeAttribute(a.name);
  for (const a of to.attributes) if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
  morphChildren(from, to);
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
