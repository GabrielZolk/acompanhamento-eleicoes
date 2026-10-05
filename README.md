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
