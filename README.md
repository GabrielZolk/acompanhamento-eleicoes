# Apuração Eleitoral 2026

Painel para acompanhar a apuração das Eleições 2026 em tempo real, com dados oficiais do TSE
(`resultados.tse.jus.br`). Sem dependências: só Node.js 18+.

## Rodar localmente

```bash
npm start
```

Abra http://localhost:5173.

## Deploy na Vercel

O projeto já está pronto para a Vercel (`vercel.json`): os arquivos de `public/` são servidos como estáticos e
`api/*.js` viram funções serverless (região `gru1`, São Paulo). Basta importar o repositório na Vercel, sem
configurar build.

**Recomendado:** adicione um Redis (Vercel → Storage → Upstash Redis, ou qualquer Upstash) ao projeto. As variáveis
`KV_REST_API_URL`/`KV_REST_API_TOKEN` (ou `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`) são detectadas
automaticamente e guardam a curva de evolução e o feed de atualizações para todos os visitantes. Sem Redis o painel
funciona igual, mas esse histórico fica na memória da função e no navegador de cada visitante.

## O que tem

- **Presidente**: resultado nacional, mapa por estado (mais votado, seções apuradas ou votação de cada candidato),
  panorama por região (clique para abrir os estados), resumo, últimas atualizações, evolução e previsão de conclusão.
- **Incluir exterior** (marcado por padrão): o total nacional do TSE já inclui os votos do exterior. Desmarcado,
  o exterior é subtraído de candidatos, seções, eleitorado, brancos/nulos e da curva de evolução. O exterior também
  aparece no mapa (marcador "Exterior") e no feed de atualizações (`EX`).
- **Governadores e Senado**: resultado por estado (escolha no seletor ou clicando no mapa); o mapa mostra o partido
  líder em cada UF.
- **Deputados**: Federal ou Estadual (Distrital no DF), por partido (nominais + legenda) ou por candidato. O mapa
  mostra o partido mais votado em cada UF.
- **Projeção de cadeiras** (deputados): usa as vagas por agremiação que o TSE recalcula a cada atualização
  (quociente eleitoral, partidário e sobras); nas federações, as vagas vão aos mais votados. Hemiciclo por estado e
  da Câmara inteira (513).
- **Desempenho por partido** (menu Consultas ou busca): Presidente, governador, Senado e deputados de cada partido,
  no país e por estado (`/api/partidos`).
- **Histórico de resultado**: percentual dos dois primeiros colocados a cada divulgação do TSE (gravado pelo servidor
  a partir de 04/10 às 18h21; o TSE não publica histórico).
- **Pessoas acompanhando**: cada aba visível avisa a cada minuto; cada instância conta na memória e grava só o seu
  total no Redis a cada 20 s (custo fixo, não cresce com o número de visitantes).
- **Projeção do resultado** (estimativa): cidade a cidade (`/api/projecao`), votos válidos apurados × eleitorado total ÷
  eleitorado apurado; cidades sem seções entram com o padrão do estado. Card de evolução → Projeção (Presidente) e
  modal "Projeções por cidade" com Presidente (país e estados), Governador e Senado por estado.
- **Eleitos** (botão no canto e menu Consultas): por cargo e lugar; oficial do TSE quando a totalização termina,
  antes disso quem lidera ou está dentro das vagas (provisório). `/api/eleitos`.
- **2º turno** (25/10/2026): faixa no card do Presidente (eleito, 2º turno oficial/garantido ou muito provável) com contagem regressiva; modal com o par de Presidente e os governadores com 2º turno.
- **Simulador do 2º turno**: cada visitante distribui os votos dos eliminados entre os finalistas e compartilha a imagem do cenário.
- **Aviso de virada**: quando muda o primeiro colocado (país ou estado) ou, no Senado, quem está dentro das vagas.
- **Compartilhar**: gera uma imagem 4:5 do resultado exibido (WhatsApp/Instagram) ou baixa o PNG no computador.
- **Modo TV** (menu Consultas): tela cheia, alterna sozinho entre cargos e estados a cada 15 s, mantém a tela ligada.
- **Mapa por cidade**: 5.570 municípios coloridos pelo vencedor (`/api/municipios-mapa`).
- **Lista completa de candidatos** de qualquer cargo estadual, com pesquisa por nome, número ou partido, filtro de
  eleitos e busca em todos os estados (`/api/candidatos`).
- **Busca** (Ctrl/⌘ K): estados, exterior e todos os municípios — abre o resultado da cidade para o cargo atual.
- **Comparação com 2022** (Presidente): cartões e dica do mapa, resultado de cada cidade e modal de partidos (PT e PL)
  mostram o resultado de 2022 e a variação de cada partido; o seletor do mapa tem "Variação desde 2022" (mudança da
  vantagem PL × PT, por estado ou cidade). A comparação é por partido, porque o candidato do PL mudou (Jair Bolsonaro
  em 2022, Flávio Bolsonaro em 2026); o 1º turno compara com o 1º de 2022 e o 2º com o 2º. Dados estáticos em
  `public/data/historico/` (baixados pelo navegador só quando usados, sem consultar o TSE), gerados por
  `npm run build:historico` a partir do Portal de Dados Abertos do TSE.

## Indicadores (Raio-X do Brasil)

Séries históricas de indicadores oficiais (desde jan/2003, quando há série comparável) em
`public/data/indicadores/` (`indice.json` com mandatos, contexto e metadados; um `{id}.json` por indicador, pontos
`["AAAA-MM", valor]`; trimestres usam o último mês). Só fontes oficiais, sem chave de API:

| Indicador | Fonte |
| --- | --- |
| Inflação (IPCA 12 meses) | Banco Central, SGS 13522 (IBGE) |
| Inflação dos alimentos (alimentação no domicílio, 12 meses) | IBGE, IPCA — SIDRA 1419 e 7060 (variável 2265, desde 2012); antes, 12 meses encadeados das variações mensais das tabelas 655 e 2938 (classificação 315, código 7171) |
| Desemprego | IBGE, PNAD Contínua — SIDRA 6381 (Brasil, trimestre móvel) e 4099 (UFs, trimestral); desde 2012 |
| Renda média real do trabalho | IBGE, PNAD Contínua — SIDRA 6390, variável 5933; desde 2012 |
| PIB (acumulado em 4 trimestres) | IBGE, Contas Nacionais — SIDRA 5932, variável 6562 |
| Salário mínimo real | SGS 1619 (nominal) deflacionado pelo IPCA mensal (SGS 433) até o último mês divulgado |
| Preço da gasolina comum e do botijão de gás (13 kg) | ANP, Levantamento de Preços de Combustíveis — [série histórica mensal](https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis/serie-historica-do-levantamento-de-precos) (planilhas XLSX Brasil e estados, 2001–2012 e desde 2013; preço médio de revenda). `serie`/`porUF` em valores reais (IPCA, SGS 433, até o último mês da série; o último ponto é igual ao nominal) e `nominal` com o preço da época. Sem dado em set/2020 (ANP não pesquisou de 18/8 a 17/10/2020) |
| Selic (meta) | SGS 432 (diária; valor em vigor no fim de cada mês) |
| Dólar comercial | SGS 3698 (venda, média mensal; nominal) |
| Dívida bruta do governo geral (% PIB) | SGS 13762; desde dez/2006 |
| Juros do cartão de crédito rotativo (pessoa física, % a.a.) | SGS 22022; desde mar/2011 |
| Juros do crédito livre a pessoas físicas (% a.a.) | SGS 20740; desde mar/2011 |
| Endividamento das famílias (% da renda de 12 meses) | SGS 29037 (com crédito habitacional; sem ele, SGS 29038); desde 2005 |
| Comprometimento da renda das famílias com dívidas | SGS 29034 (com ajuste sazonal); desde 2005 |
| Carga tributária bruta do governo geral (% PIB, anual) | Tesouro Nacional — [Estimativa da Carga Tributária Bruta do Governo Geral](https://www.tesourotransparente.gov.br/publicacoes/carga-tributaria-do-governo-geral) (anexo XLSX da edição mais recente, Tabela 1); desde 2010 |
| Arrecadação federal em 12 meses (R$ bi, corrigida pelo IPCA) | Tesouro Nacional — [Resultado do Tesouro Nacional, série histórica mensal](https://www.tesourotransparente.gov.br/ckan/dataset/resultado-do-tesouro-nacional) (XLSX localizado pela API CKAN): receita administrada pela Receita Federal + arrecadação líquida do RGPS, mês a mês corrigida pelo IPCA (SGS 433) e somada em 12 meses |
| Resultado primário do setor público consolidado (12 meses, % PIB) | SGS 5793 (NFSP) com o sinal invertido: superávit positivo |
| Juros nominais do setor público consolidado (12 meses, % PIB) | SGS 5760 |
| Desmatamento na Amazônia Legal (km², anual) | INPE — PRODES, [TerraBrasilis](https://terrabrasilis.dpi.inpe.br/app/dashboard/deforestation/biomes/legal_amazon/rates) (soma dos nove estados; ano PRODES de agosto a julho, período "AAAA-07") |
| Famílias no Bolsa Família / Auxílio Brasil (milhões) e benefício médio por família (R$, corrigido pelo IPCA) | MDS — [VIS DATA / MI Social](https://aplicacoes.mds.gov.br/sagi/vis/data3/data-explorer.php) (base Solr `aplicacoes.mds.gov.br/sagi/servicos/misocial`, soma dos municípios por mês com `stats.facet`); desde jan/2004. Auxílio Brasil (nov/2021–fev/2023) pelos campos `pab_*`, com o benefício extraordinário somado ao valor. Benefício médio = valor repassado ÷ famílias, deflacionado pelo IPCA (SGS 433); sem pontos em abr–dez/2020 e abr–out/2021 (Auxílio Emergencial no lugar do benefício) |
| Ideb anos iniciais, anos finais e ensino médio (rede pública) | INEP — [resultados do Ideb](https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb/resultados) (`divulgacao_brasil_ideb_{edição}.zip`, planilha XLSX dentro do ZIP; edição mais recente achada automaticamente); bienal desde 2005, período "AAAA-12" |
| Homicídios por 100 mil habitantes (anual) | Ministério da Saúde — SIM via [DATASUS/TabNet](http://tabnet.datasus.gov.br/cgi/deftohtm.exe?sim/cnv/ext10uf.def) (óbitos por agressão, CID-10 X85–Y09, por residência; só anos com dados finais) ÷ IBGE, [Projeções da População, revisão 2024](https://ftp.ibge.gov.br/Projecao_da_Populacao/Projecao_da_Populacao_2024/) (população em 1º de julho) |

Cada indicador do índice tem um `tema` (custo de vida, renda e emprego, crédito e dívidas, impostos e contas públicas,
economia, meio ambiente, social, educação, segurança). Nas séries com `periodicidade` "anual", o período "AAAA-MM" é o ano de 12 meses terminado
naquele mês (carga tributária: "AAAA-12"; desmatamento: "AAAA-07"). O saldo do Novo Caged ficou de fora: o Ministério
do Trabalho hoje só publica apresentações em PDF e microdados compactados em 7z, sem tabela legível por máquina.
A cobertura vacinal também ficou de fora: o TabNet do SI-PNI só vai até 2022 e os dados desde 2023 estão só no painel
do Ministério da Saúde, sem tabela legível por máquina. Os indicadores sociais (Bolsa Família, Ideb, homicídios) ficam
em `tools/indicadores-sociais.mjs`.

Fora do índice, `mercado.json` traz a variação mensal do IPCA (Brasil, desde jan/2012; SIDRA 1419 e 7060) do índice
geral, da alimentação no domicílio e de itens do mercado e da casa (arroz, feijão-carioca, café moído, carnes, frango,
ovo, leite longa vida, pão francês, óleo de soja, açúcar, tomate, batata, banana-prata, alimentação fora do domicílio,
refeição, lanche, aluguel residencial, condomínio, taxa de água e esgoto, plano de saúde, produtos farmacêuticos,
acesso à internet, ônibus urbano, gás de botijão, energia elétrica e gasolina). As planilhas da ANP e do Tesouro são
lidas sem dependências por `tools/xlsx.mjs` (ZIP + XML).

Para regenerar: `npm run build:indicadores`. O workflow `.github/workflows/indicadores.yml` roda todo dia
(09:30 UTC) e só faz commit quando algum dado muda: a saída não tem carimbo de hora (`atualizadoEm` é o período do
último ponto e `geradoEm`, o mais recente deles). Se uma fonte falhar, o arquivo anterior é mantido.

## Como funciona

O TSE não oferece push (WebSocket/SSE): ele publica arquivos num CDN, com cache de ~30 s, e numera cada
publicação (`idg`). O navegador consulta `/api/versao` a cada 5 s (resposta de ~50 bytes, com 2 s de cache de
borda) e só baixa o `/api/painel` completo quando a numeração muda. As funções buscam os arquivos do TSE com ETag
(arquivos sem mudança custam um `304`) e o cache de borda da Vercel faz com que muitos visitantes não multipliquem as
consultas ao TSE. Abas em segundo plano param de consultar.

O TSE publica só o estado atual. A curva de evolução e o feed de atualizações são montados comparando cada
publicação com a anterior; ficam no Redis (Vercel), em `data/` (local) e também no `localStorage` do navegador.

Arquivos usados (eleição `6257` = Presidente, `6259` = estaduais):

| Dado | Arquivo |
| --- | --- |
| Resultado por abrangência | `ele2026/{eleição}/dados/{uf}/{uf}-c{cargo}-e{eleição}-u.json` |
| Município | `ele2026/{eleição}/dados/{uf}/{uf}{município}-c{cargo}-e{eleição}-u.json` |
| Andamento por UF | `ele2026/{eleição}/dados/br/br-e{eleição}-ab.json` |
| Lista de municípios | `ele2026/{eleição}/config/mun-e{eleição}-cm.json` |
| Fotos | `ele2026/{eleição}/fotos/{br\|uf}/{sqcand}.jpeg` |

## Configuração (variáveis de ambiente)

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORT` | `5173` | Porta HTTP (local) |
| `TSE_ELE_FEDERAL` | `6257` | Código da eleição de Presidente. **2º turno (25/10): `6258`** |
| `TSE_ELE_ESTADUAL` | `6259` | Código da eleição estadual. **2º turno: `6260`** |
| `ELEICAO_DATA` | `2026-10-04` | Dia da eleição (eixo de 17h da curva de evolução) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | — | Redis (Upstash) para o histórico compartilhado |
| `PRESENCA` | — | `0` desliga o contador "pessoas acompanhando" |

Para o 2º turno, use os códigos novos e `ELEICAO_DATA=2026-10-25` (o histórico é separado por eleição).

O mapa vem da malha de UFs do IBGE, pré-processada em `public/data/brasil-uf.json`
(`npm run build:map -- --fetch` baixa a malha de novo e regenera).
