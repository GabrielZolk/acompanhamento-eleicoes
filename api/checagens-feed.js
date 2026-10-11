// Checagens recentes sobre a eleição, direto dos feeds públicos das agências de checagem.
// Sem seleção editorial: entra todo item cujo título fala da disputa (palavras-chave abaixo), dos
// dois lados, na ordem de publicação. Cache na borda de 15 minutos.
import { json } from './_util.js';

const FEEDS = [
  { fonte: 'Aos Fatos', url: 'https://www.aosfatos.org/noticias/feed/' },
  { fonte: 'Agência Lupa', url: 'https://lupa.uol.com.br/feed/' },
  { fonte: 'Estadão Verifica', url: 'https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/estadao-verifica/' },
  { fonte: 'Boatos.org', url: 'https://www.boatos.org/feed' },
];
const ASSUNTO = /\b(lula|fl[áa]vio|bolsonaro|janja|alckmin|gaspar|elei[çc][ãõa]o|elei[çc][õo]es|urna|urnas|tse|segundo turno|2º turno|candidat|pesquisa eleitoral|votos?|votar|apura[çc][ãa]o)\b/i;
const MEMO_MS = 10 * 60 * 1000;
let memo = null;

const limpar = (s = '') => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&#8217;/g, '’').replace(/&#8220;|&#8221;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const campo = (item, tag) => limpar((item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')) || [])[1]);

async function lerFeed({ fonte, url }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RaioXBrasil/1.0)' } });
    if (!r.ok) return [];
    const xml = await r.text();
    return (xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []).map((item) => {
      const titulo = campo(item, 'title');
      const link = campo(item, 'link') || campo(item, 'guid');
      const data = Date.parse(campo(item, 'pubDate')) || null;
      return { fonte, titulo, link, data };
    }).filter((i) => i.titulo && /^https:\/\//.test(i.link) && ASSUNTO.test(i.titulo));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function obterFeed() {
  if (memo && Date.now() - memo.em < MEMO_MS) return memo.valor;
  const listas = await Promise.all(FEEDS.map(lerFeed));
  const vistos = new Set();
  const itens = listas.flat()
    .filter((i) => (vistos.has(i.link) ? false : vistos.add(i.link)))
    .sort((a, b) => (b.data || 0) - (a.data || 0))
    .slice(0, 40);
  const valor = { atualizadoEm: Date.now(), fontes: FEEDS.map((f) => f.fonte), itens };
  if (itens.length) memo = { valor, em: Date.now() };
  return valor;
}

export default async function handler(req, res) {
  try {
    return json(res, 200, await obterFeed(), 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600');
  } catch (err) {
    console.error(err);
    return json(res, 502, { erro: 'Falha ao ler os feeds.' });
  }
}
