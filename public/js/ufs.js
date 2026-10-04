// Metadados compartilhados entre servidor e navegador.

export const UFS = [
  { uf: 'ac', ibge: '12', nome: 'Acre', regiao: 'N' },
  { uf: 'al', ibge: '27', nome: 'Alagoas', regiao: 'NE' },
  { uf: 'ap', ibge: '16', nome: 'Amapá', regiao: 'N' },
  { uf: 'am', ibge: '13', nome: 'Amazonas', regiao: 'N' },
  { uf: 'ba', ibge: '29', nome: 'Bahia', regiao: 'NE' },
  { uf: 'ce', ibge: '23', nome: 'Ceará', regiao: 'NE' },
  { uf: 'df', ibge: '53', nome: 'Distrito Federal', regiao: 'CO' },
  { uf: 'es', ibge: '32', nome: 'Espírito Santo', regiao: 'SE' },
  { uf: 'go', ibge: '52', nome: 'Goiás', regiao: 'CO' },
  { uf: 'ma', ibge: '21', nome: 'Maranhão', regiao: 'NE' },
  { uf: 'mt', ibge: '51', nome: 'Mato Grosso', regiao: 'CO' },
  { uf: 'ms', ibge: '50', nome: 'Mato Grosso do Sul', regiao: 'CO' },
  { uf: 'mg', ibge: '31', nome: 'Minas Gerais', regiao: 'SE' },
  { uf: 'pa', ibge: '15', nome: 'Pará', regiao: 'N' },
  { uf: 'pb', ibge: '25', nome: 'Paraíba', regiao: 'NE' },
  { uf: 'pr', ibge: '41', nome: 'Paraná', regiao: 'S' },
  { uf: 'pe', ibge: '26', nome: 'Pernambuco', regiao: 'NE' },
  { uf: 'pi', ibge: '22', nome: 'Piauí', regiao: 'NE' },
  { uf: 'rj', ibge: '33', nome: 'Rio de Janeiro', regiao: 'SE' },
  { uf: 'rn', ibge: '24', nome: 'Rio Grande do Norte', regiao: 'NE' },
  { uf: 'rs', ibge: '43', nome: 'Rio Grande do Sul', regiao: 'S' },
  { uf: 'ro', ibge: '11', nome: 'Rondônia', regiao: 'N' },
  { uf: 'rr', ibge: '14', nome: 'Roraima', regiao: 'N' },
  { uf: 'sc', ibge: '42', nome: 'Santa Catarina', regiao: 'S' },
  { uf: 'sp', ibge: '35', nome: 'São Paulo', regiao: 'SE' },
  { uf: 'se', ibge: '28', nome: 'Sergipe', regiao: 'NE' },
  { uf: 'to', ibge: '17', nome: 'Tocantins', regiao: 'N' },
];

export const EXTERIOR = { uf: 'zz', nome: 'Exterior', regiao: null };

export const UF_BY_CODE = Object.fromEntries(UFS.map((u) => [u.uf, u]));
UF_BY_CODE.zz = EXTERIOR;

export const REGIOES = [
  { id: 'N', nome: 'Norte' },
  { id: 'NE', nome: 'Nordeste' },
  { id: 'CO', nome: 'Centro-Oeste' },
  { id: 'SE', nome: 'Sudeste' },
  { id: 'S', nome: 'Sul' },
];

// Eleitorado apto no 1º turno de 2022 (TSE), base da comparação do painel.
export const ELEITORADO_2022 = 156454011;
export const ELEITORADO_2022_EXTERIOR = 697078;

export const CARGOS = {
  presidente: { key: 'presidente', cd: 1, ele: '6257', nome: 'Presidente', titulo: 'Disputa para Presidente', federal: true },
  governador: { key: 'governador', cd: 3, ele: '6259', nome: 'Governador', titulo: 'Disputa para Governador', federal: false },
  senado: { key: 'senado', cd: 5, ele: '6259', nome: 'Senador', titulo: 'Disputa para o Senado', federal: false },
  camara: { key: 'camara', cd: 6, ele: '6259', nome: 'Deputado Federal', titulo: 'Câmara dos Deputados', federal: false, proporcional: true },
  // No DF não há Assembleia: a Câmara Legislativa elege deputados distritais (cargo 8 no TSE).
  assembleia: { key: 'assembleia', cd: 7, cdDF: 8, ele: '6259', nome: 'Deputado Estadual', titulo: 'Assembleia Legislativa', federal: false, proporcional: true },
};

export const cdDoCargo = (cargo, uf) => (uf === 'df' && cargo.cdDF) || cargo.cd;
export const tituloDoCargo = (cargo, uf) => (cargo.key === 'assembleia' && uf === 'df' ? 'Câmara Legislativa' : cargo.titulo);
export const nomeDoCargo = (cargo, uf) => (cargo.key === 'assembleia' && uf === 'df' ? 'Deputado Distrital' : cargo.nome);
