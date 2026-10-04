// Números do TSE chegam como string, com vírgula decimal ("32,40").
export const num = (s) => (s == null || s === '' ? 0 : Number(String(s).replace(',', '.')) || 0);
export const int = (s) => (s == null || s === '' ? 0 : parseInt(s, 10) || 0);

// "03/10/2026" + "14:47:37" (horário de Brasília) -> epoch ms
export function parseTseDate(d, h) {
  if (!d) return null;
  const [dd, mm, yyyy] = d.split('/');
  const t = Date.parse(`${yyyy}-${mm}-${dd}T${h || '00:00:00'}-03:00`);
  return Number.isNaN(t) ? null : t;
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}
