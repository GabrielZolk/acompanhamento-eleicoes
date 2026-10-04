// Utilidades das funções serverless (assinatura Node pura: funciona na Vercel e no servidor local).
export function json(res, status, body, cache = 'no-store') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.end(JSON.stringify(body));
}

export const query = (req) => new URL(req.url, 'http://localhost').searchParams;
