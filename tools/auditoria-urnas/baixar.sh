#!/bin/bash
# Baixa os pacotes públicos do TSE do 2º turno de 2026: arquivos de cada urna (zips/) e planilhas de boletim (bweb/).
set -e
BASE="${AUDITORIA_BASE:?defina AUDITORIA_BASE}"
mkdir -p "$BASE/zips" "$BASE/bweb"
cd "$BASE"
curl -s "https://dadosabertos.tse.jus.br/api/3/action/package_show?id=resultados-2026-boletim-de-urna" \
  | python -I -c "import sys,json; print('\n'.join(r['url'] for r in json.load(sys.stdin)['result']['resources'] if '_2t_' in r['url'] and r['url'].endswith('.zip')))" \
  > bweb.txt
while read -r u; do curl -s -C - -o "bweb/$(basename "$u")" "$u" < /dev/null; done < bweb.txt
baixa() {
  u="https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/arqurnatot/bu_imgbu_logjez_rdv_vscmr_2026_2t_$1.zip"
  for i in 1 2 3 4 5; do
    curl -s -C - --retry 5 -o "zips/$1.zip.part" "$u" && mv "zips/$1.zip.part" "zips/$1.zip" && echo "ok $1" && return
    sleep 10
  done
  echo "FALHOU $1"
}
export -f baixa
printf "%s\n" AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO ZZ | xargs -P 4 -I{} bash -c 'baixa {}'
