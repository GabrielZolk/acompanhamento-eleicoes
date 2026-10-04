// Servidor local: arquivos estáticos + as mesmas funções da pasta api/ usadas na Vercel. Sem dependências.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import painel from '../api/painel.js';
import municipio from '../api/municipio.js';
import municipios from '../api/municipios.js';
import versao from '../api/versao.js';
import candidatos from '../api/candidatos.js';
import municipiosMapa from '../api/municipios-mapa.js';
import partidos from '../api/partidos.js';
import presenca from '../api/presenca.js';
import eleitos from '../api/eleitos.js';
import { json } from '../api/_util.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUBLIC = path.join(root, 'public');
const PORT = Number(process.env.PORT || 5173);
const ROTAS = { '/api/painel': painel, '/api/versao': versao, '/api/candidatos': candidatos, '/api/municipios-mapa': municipiosMapa, '/api/partidos': partidos, '/api/presenca': presenca, '/api/eleitos': eleitos, '/api/municipio': municipio, '/api/municipios': municipios };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function servirArquivo(res, pathname) {
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC)) return json(res, 403, { erro: 'Proibido' });
  if (pathname === '/' || !path.extname(file)) file = path.join(PUBLIC, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, { erro: 'Não encontrado' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const rota = ROTAS[pathname];
    if (rota) return rota(req, res);
    if (pathname.startsWith('/api/')) return json(res, 404, { erro: 'Rota inexistente' });
    servirArquivo(res, pathname);
  })
  .listen(PORT, () => console.log(`Apuração Eleitoral 2026 em http://localhost:${PORT}`));
