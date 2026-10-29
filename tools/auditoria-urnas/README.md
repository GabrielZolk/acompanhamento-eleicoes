# Auditoria das urnas (2º turno de 2026)

Código usado na página `/auditoria`. Ele lê os arquivos que cada urna gravou e o TSE publicou, refaz a soma e
examina o log de cada urna. Qualquer pessoa pode rodar e conferir.

## Fontes (todas públicas)

- Arquivos de cada urna (boletim, log, registro digital do voto, assinaturas), um zip por UF, cerca de 115 GB no total:
  `https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/arqurnatot/bu_imgbu_logjez_rdv_vscmr_2026_2t_<UF>.zip`
- Planilha de boletins de urna (bweb), uma por UF: dataset `resultados-2026-boletim-de-urna` no Portal de Dados Abertos do TSE.
- Resultado oficial: `https://resultados.tse.jus.br/oficial/ele2026/6258/dados/<uf>/<uf>-c0001-e006258-u.json`
- Especificação do boletim de urna (ASN.1) publicada pelo TSE (2022). A versão de 2026 acrescentou campos, e
  `ber.py` lê o formato sem depender da especificação. `bu.asn1` fica aqui só como referência.

## Como rodar

```bash
export AUDITORIA_BASE=/caminho/para/dados   # pastas zips/ e bweb/ dentro dele
bash baixar.sh                               # baixa os pacotes (115 GB)
for uf in ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to zz; do
  python -I auditar.py $uf 10                # uma linha JSON por seção em saida/<uf>.jsonl
done
python -I agregar.py ../../public/data/auditoria   # resumos usados pelo site
```

## O que é medido

- **Recontagem:** soma dos votos de cada boletim de urna, comparada com a planilha do TSE e com o resultado oficial.
  As seções que estão na planilha mas não têm arquivo no pacote são somadas pela planilha e listadas.
- **Log × boletim:** em cada urna, o número de votos computados no log ("O voto do eleitor foi computado") é comparado
  com o comparecimento do boletim.
- **Horário:** hora de cada voto computado. O relógio da urna marca a hora local, e a conversão para Brasília usa a hora
  de abertura da seção (8h de Brasília). No exterior, conta a hora local.
- **Biometria:** o boletim separa os eleitores habilitados por biometria, os que tinham digital mas não foram
  reconhecidos (liberados pelo mesário) e os liberados sem digital por outro motivo. A mesma classificação também é
  feita a partir do log, eleitor por eleitor.
- **Análise dentro do município:** compara seções da mesma cidade com mais e menos liberação sem biometria, para ver se
  a votação muda, sem misturar diferenças entre regiões.

## O que não dá para verificar com estes arquivos

Em quem foi cada voto dado num horário (o registro digital do voto é embaralhado e não tem hora); a identidade de quem
votou (os arquivos não têm nome, título ou CPF); e, portanto, se alguém votou no lugar de um eleitor falecido.
