// "X pessoas acompanhando agora".
// Cada aba visível avisa a cada minuto. A contagem fica na memória de cada instância e só o
// total da instância vai para o Redis, no máximo a cada 20 s, numa única chamada (HSET + HGETALL
// em pipeline). Assim o custo no Redis não cresce com o número de visitantes.
import crypto from 'node:crypto';
import { store } from './store.js';

const ONLINE_MS = 75e3; // sem aviso há mais que isso: saiu (o navegador avisa a cada 60 s)
const FLUSH_MS = 20e3;
const INSTANCIA_VIVA_MS = 90e3; // instância que não grava há mais que isso deixa de contar
const CHAVE = 'apuracao2026:presenca';
const instancia = crypto.randomUUID().slice(0, 12);

const vistos = new Map(); // id -> último aviso
let total = 0;
let fonte = 'local'; // 'redis' quando a soma entre instâncias funcionou na última gravação
let ultimoFlush = 0;
let gravando = null;

function contarLocal(agora) {
  let n = 0;
  for (const [id, t] of vistos) {
    if (agora - t > ONLINE_MS) vistos.delete(id);
    else n++;
  }
  return n;
}

async function gravar(agora) {
  ultimoFlush = agora;
  const local = contarLocal(agora);
  if (!store.pipeline) {
    total = local; // sem Redis: só esta instância (servidor local)
    fonte = 'local';
    return;
  }
  try {
    const [, todos] = await store.pipeline([
      ['HSET', CHAVE, instancia, `${local}:${agora}`],
      ['HGETALL', CHAVE],
    ]);
    let soma = 0;
    const mortas = [];
    for (let i = 0; i < (todos || []).length; i += 2) {
      const [n, t] = String(todos[i + 1]).split(':').map(Number);
      if (agora - t <= INSTANCIA_VIVA_MS) soma += n || 0;
      else mortas.push(todos[i]);
    }
    if (mortas.length) store.pipeline([['HDEL', CHAVE, ...mortas]]).catch(() => {});
    total = Math.max(soma, local);
    fonte = 'redis';
  } catch (err) {
    console.error('[presenca] Redis indisponível:', err.message);
    total = local;
    fonte = 'local';
  }
}

export async function registrarPresenca(id) {
  const agora = Date.now();
  if (id) vistos.set(id, agora);
  if (agora - ultimoFlush >= FLUSH_MS && !gravando) {
    gravando = gravar(agora).finally(() => (gravando = null));
  }
  if (!total && gravando) await gravando; // primeira chamada da instância espera o número real
  return { total: Math.max(total, contarLocal(agora)), fonte };
}
