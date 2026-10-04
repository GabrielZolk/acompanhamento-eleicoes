import { listarMunicipios } from '../server/core.js';
import { json } from './_util.js';

export default async function handler(req, res) {
  try {
    return json(res, 200, await listarMunicipios(), 'public, max-age=3600, s-maxage=86400');
  } catch (err) {
    console.error(err);
    return json(res, 502, { erro: 'Falha ao consultar o TSE.', detalhe: err.message });
  }
}
