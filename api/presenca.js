import { registrarPresenca } from '../server/presenca.js';
import { json, query } from './_util.js';

// Interruptor: PRESENCA=0 nas variáveis de ambiente da Vercel desliga o contador.
export default async function handler(req, res) {
  if (process.env.PRESENCA === '0') return json(res, 404, { desligado: true });
  const id = query(req).get('id') || '';
  if (!/^[a-z0-9]{8,40}$/i.test(id)) return json(res, 400, { erro: 'id inválido' });
  try {
    const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return json(res, 200, await registrarPresenca(id, ip));
  } catch {
    return json(res, 503, { erro: 'indisponível' });
  }
}
