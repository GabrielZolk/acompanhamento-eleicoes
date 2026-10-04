// Armazenamento do histórico da apuração.
// - Upstash Redis / Vercel KV (REST), se as variáveis de ambiente existirem: compartilhado entre instâncias.
// - Disco (data/), ao rodar localmente.
// - Memória, na Vercel sem Redis (vale enquanto a instância estiver ativa; o navegador completa o histórico).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function redisStore() {
  const headers = { Authorization: `Bearer ${REDIS_TOKEN}` };
  return {
    tipo: 'redis',
    async get(key) {
      const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, { headers, signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
      const { result } = await r.json();
      return result ? JSON.parse(result) : null;
    },
    // Trava simples (SET NX EX): só uma instância recalcula a mesma coisa por vez.
    async travar(key, segundos) {
      const r = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}/1/NX/EX/${segundos}`, { headers, signal: AbortSignal.timeout(4000) });
      if (!r.ok) return true;
      return (await r.json()).result === 'OK';
    },
    async set(key, value) {
      const r = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(value),
        signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
    },
  };
}

function fileStore() {
  const dir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'data');
  const arquivo = (key) => path.join(dir, `${key.replace(/[^a-z0-9-]/gi, '-')}.json`);
  return {
    tipo: 'arquivo',
    async travar() {
      return true;
    },
    async get(key) {
      try {
        return JSON.parse(fs.readFileSync(arquivo(key), 'utf8'));
      } catch {
        return null;
      }
    },
    async set(key, value) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(arquivo(key), JSON.stringify(value));
    },
  };
}

function memoryStore() {
  const m = new Map();
  return {
    tipo: 'memoria',
    async travar() {
      return true;
    },
    async get(key) {
      return m.get(key) ?? null;
    },
    async set(key, value) {
      m.set(key, value);
    },
  };
}

export const store = REDIS_URL && REDIS_TOKEN ? redisStore() : process.env.VERCEL ? memoryStore() : fileStore();
