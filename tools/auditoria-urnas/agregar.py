# Junta a saída de auditar.py (uma linha por seção), confere com a planilha de boletins do TSE (bweb) e
# com o resultado oficial publicado, e grava os resumos que o site mostra:
#   <destino>/2t.json         resumo nacional, por UF, listas de seções fora do padrão
#   <destino>/2t-municipios.json   números por município (busca)
# Uso: python -I agregar.py <destino>
import sys, os, json, glob, zipfile, io, csv, urllib.request, math, statistics
from collections import defaultdict

BASE = os.environ.get('AUDITORIA_BASE', 'S:/auditoria-tse-2026/2t')
DEST = sys.argv[1]
UFS = 'ac al am ap ba ce df es go ma mg ms mt pa pb pe pi pr rj rn ro rr rs sc se sp to zz'.split()
H17 = 17 * 3600


def hhmm(s):
    return None if s is None else f'{s // 3600:02d}:{s % 3600 // 60:02d}'


def oficial(uf, ele='6258', cargo='0001'):
    u = f'https://resultados.tse.jus.br/oficial/ele2026/{ele}/dados/{uf}/{uf}-c{cargo}-e00{ele}-u.json'
    j = json.loads(urllib.request.urlopen(u, timeout=60).read())
    votos = {}
    for agr in j['carg'][0].get('agr', []):
        for par in agr.get('par', []):
            for c in par.get('cand', []):
                votos[c['n']] = int(c['vap'])
    v = j['v']
    return {'votos': votos, 'branco': int(v['vb']), 'nulo': int(v['tvn']), 'comparecimento': int(j['e']['c']),
            'secoes': int(j['s']['ts']), 'secoes_apuradas': int(j['s']['st']), 'gerado': f"{j['dg']} {j['hg']}"}


def ler_bweb(uf):
    f = glob.glob(f'{BASE}/bweb/bweb_2t_{uf.upper()}_*.zip')
    if not f: return {}, {}
    z = zipfile.ZipFile(f[0])
    nome = [n for n in z.namelist() if n.lower().endswith('.csv')][0]
    secoes, nomes = {}, {}
    with z.open(nome) as fh:
        for r in csv.DictReader(io.TextIOWrapper(fh, encoding='latin-1'), delimiter=';'):
            chave = (uf, r['CD_MUNICIPIO'].zfill(5), r['NR_ZONA'].zfill(4), r['NR_SECAO'].zfill(4))
            nomes[chave[1]] = r['NM_MUNICIPIO']
            s = secoes.setdefault(chave, {'cargos': {}, 'tipo': r['DS_TIPO_URNA'], 'agregadas': r['DS_SECOES_AGREGADAS']})
            cargo = 'presidente' if r['CD_CARGO_PERGUNTA'] == '1' else 'governador' if r['CD_CARGO_PERGUNTA'] == '3' else r['CD_CARGO_PERGUNTA']
            c = s['cargos'].setdefault(cargo, {'votos': {}, 'comparecimento': int(r['QT_COMPARECIMENTO']), 'aptos': int(r['QT_APTOS'])})
            n = r['NR_VOTAVEL']
            n = 'branco' if n == '95' else 'nulo' if n == '96' else n
            c['votos'][n] = c['votos'].get(n, 0) + int(r['QT_VOTOS'])
            s['biom_sem_hab'] = int(r['QT_ELEI_BIOM_SEM_HABILITACAO'] or 0) if r['QT_ELEI_BIOM_SEM_HABILITACAO'] not in ('', '#NULO#') else None
    return secoes, nomes


def main():
    os.makedirs(DEST, exist_ok=True)
    br = defaultdict(int)
    por_uf = {}
    mun = {}
    por_hora = [0] * 16
    ultimo_hist = defaultdict(int)
    listas = defaultdict(list)
    metodos = defaultdict(int)
    tipos_urna = defaultdict(int)
    tipos_hab = defaultdict(int)
    dentro = []  # (municipio, comparecimento, % sem biometria, fatia Lula) para a análise dentro do município
    bu_x_bweb, log_x_bu = [], []
    recont = {'bu': defaultdict(int), 'bweb': defaultdict(int), 'faltantes': defaultdict(int)}
    recont_gov = defaultdict(lambda: {'bu': defaultdict(int), 'bweb': defaultdict(int)})
    secoes_total = 0
    nomes_glob = {}

    for uf in UFS:
        arq = f'{BASE}/saida/{uf}.jsonl'
        if not os.path.exists(arq):
            print('sem', uf); continue
        bweb, nomes = ler_bweb(uf)
        for k, v in nomes.items(): nomes_glob[(uf, k)] = v
        u = defaultdict(int)
        vistos = set()
        for linha in open(arq):
            r = json.loads(linha)
            chave = (uf, r['mu'], r['zo'], r['se'])
            vistos.add(chave)
            secoes_total += 1; u['secoes'] += 1
            tipos_urna[str(r.get('tipo_urna'))] += 1
            if r.get('sa'): u['secoes_sa'] += 1
            if 'erro_bu' in r or 'erro_log' in r:
                listas['erros'].append({'uf': uf, 'mu': r['mu'], 'zo': r['zo'], 'se': r['se'], 'erro': r.get('erro_bu') or r.get('erro_log')})
            pres = r.get('eleicoes', {}).get('6258', {}).get('cargos', {}).get('presidente')
            comp = r.get('comparecimento_bu') or (pres or {}).get('comparecimento') or 0
            u['comparecimento'] += comp
            if pres:
                for k, v in pres['votos'].items():
                    recont['bu'][k] += v; u['bu_' + k] += v
            gov = r.get('eleicoes', {}).get('6260', {}).get('cargos', {}).get('governador')
            if gov:
                for k, v in gov['votos'].items(): recont_gov[uf]['bu'][k] += v
            # planilha do TSE (bweb) × boletim da urna
            b = bweb.get(chave)
            bp = b and b['cargos'].get('presidente')
            if bp:
                if pres and {k: v for k, v in pres['votos'].items() if v} != {k: v for k, v in bp['votos'].items() if v}:
                    bu_x_bweb.append({'uf': uf, 'mu': r['mu'], 'nm': nomes.get(r['mu']), 'zo': r['zo'], 'se': r['se'], 'bu': pres['votos'], 'bweb': bp['votos']})
            # log × boletim: votos registrados no log com a hora × comparecimento do BU
            vl = r.get('votos_log')
            if vl is not None and comp and vl != comp:
                if r.get('tipo_urna') in (4, 6) and vl < comp:
                    motivo = 'Urna trocada durante a votação: os votos da urna original estão no boletim, mas o log dela não veio no pacote.'
                elif comp - vl == 1 and (r.get('confirmados_total_pres') in (None, comp)):
                    motivo = 'Falta no log a linha final “voto computado” de 1 eleitor; a confirmação do voto para Presidente dele está no log.'
                else:
                    motivo = None
                log_x_bu.append({'uf': uf, 'mu': r['mu'], 'nm': nomes.get(r['mu']), 'zo': r['zo'], 'se': r['se'], 'log': vl, 'bu': comp, 'tipo_urna': r.get('tipo_urna'), 'sa': bool(r.get('sa')), 'motivo': motivo})
            # habilitação (BU: [sem biometria/código, biometria, biometria não reconhecida])
            hab = r.get('habilitacao') or []
            if len(hab) >= 3:
                u['hab_codigo'] += hab[0]; u['hab_bio'] += hab[1]; u['hab_bio_falhou'] += hab[2]
            for k, v in (r.get('tipos_hab') or {}).items(): tipos_hab[k] += v
            # horário
            for k in ('apos17', 'apos1730', 'apos18', 'antes8', 'apos17_sem_bio'):
                u[k] += r.get(k, 0) or 0
            if (r.get('apos17') or 0) > 0: u['secoes_apos17'] += 1
            for i, v in enumerate(r.get('por_hora') or []): por_hora[i] += v
            if r.get('ultimo') is not None and uf != 'zz':
                ultimo_hist[min(max(r['ultimo'] // 300 * 300, 15 * 3600), 20 * 3600)] += 1
            # outros métodos de contar "votos depois das 17h"
            if uf != 'zz' and r.get('votos_log'):
                metodos['confirmados_apos17'] += r.get('confirmados_apos17', 0)
                metodos['habilitados_apos17'] += r.get('habilitados_apos17', 0)
                metodos['apos17_local'] += r.get('apos17_local', 0)
                metodos['apos17_brasil'] += r.get('apos17', 0) or 0
                enc = r.get('encerramento')
                if enc:
                    enc_br = int(enc[9:11]) * 3600 + int(enc[11:13]) * 60 + int(enc[13:15]) - (r.get('fuso') or 0) * 3600
                    if enc_br >= H17: metodos['comparecimento_secoes_encerradas_apos17'] += comp; metodos['secoes_encerradas_apos17'] += 1
                if (r.get('apos17') or 0) > 0: metodos['comparecimento_secoes_com_voto_apos17'] += comp
            ident = {'uf': uf, 'mu': r['mu'], 'nm': nomes.get(r['mu']), 'zo': r['zo'], 'se': r['se'], 'comp': comp}
            if (r.get('apos17') or 0) > 0:
                listas['apos17'].append({**ident, 'n': r['apos17'], 'sem_bio': r.get('apos17_sem_bio', 0), 'ultimo': hhmm(r.get('ultimo')), 'horas': [hhmm(s) for s in r.get('apos17_horas', [])]})
            if (r.get('antes8') or 0) > 0:
                listas['antes8'].append({**ident, 'n': r['antes8'], 'primeiro': hhmm(r.get('primeiro'))})
            sem_bio = (hab[0] + hab[2]) if len(hab) >= 3 else None
            if sem_bio is not None and comp >= 50:
                listas['sem_bio'].append({**ident, 'n': sem_bio, 'pct': round(100 * sem_bio / comp, 1), 'falhou': hab[2], 'codigo': hab[0]})
            if (r.get('seq_sem_bio') or 0) >= 5 and uf != 'zz':
                listas['seq'].append({**ident, 'n': r['seq_sem_bio'], 'ate': hhmm(r.get('seq_sem_bio_fim'))})
            # município
            m = mun.setdefault((uf, r['mu']), defaultdict(int))
            m['secoes'] += 1; m['comp'] += comp; m['apos17'] += r.get('apos17', 0) or 0
            if sem_bio is not None: m['sem_bio'] += sem_bio
            if pres:
                m['v13'] += pres['votos'].get('13', 0); m['v22'] += pres['votos'].get('22', 0)
                val = pres['votos'].get('13', 0) + pres['votos'].get('22', 0)
                if sem_bio is not None and comp >= 50 and val >= 30 and uf != 'zz':
                    dentro.append((uf + r['mu'], comp, 100 * sem_bio / comp, 100 * pres['votos'].get('13', 0) / val))
        # seções que estão na planilha do TSE mas não vieram no pacote de arquivos
        for chave, b in bweb.items():
            bp = b['cargos'].get('presidente')
            if bp:
                for k, v in bp['votos'].items(): recont['bweb'][k] += v
            bg = b['cargos'].get('governador')
            if bg:
                for k, v in bg['votos'].items(): recont_gov[uf]['bweb'][k] += v
            if chave not in vistos and bp:
                for k, v in bp['votos'].items():
                    recont['faltantes'][k] += v; u['falt_' + k] += v
                u['falt_comparecimento'] += bp['comparecimento']; u['falt_secoes'] += 1
                listas['sem_arquivo'].append({'uf': uf, 'mu': chave[1], 'nm': nomes.get(chave[1]), 'zo': chave[2], 'se': chave[3], 'tipo': b['tipo'], 'comp': bp['comparecimento'], 'agregadas': b['agregadas']})
        of = oficial(uf)
        u['of_13'] = of['votos'].get('13', 0); u['of_22'] = of['votos'].get('22', 0)
        u['of_branco'] = of['branco']; u['of_nulo'] = of['nulo']; u['of_comparecimento'] = of['comparecimento']
        u['bweb_13'] = sum(b['cargos'].get('presidente', {}).get('votos', {}).get('13', 0) for b in bweb.values())
        u['bweb_22'] = sum(b['cargos'].get('presidente', {}).get('votos', {}).get('22', 0) for b in bweb.values())
        por_uf[uf] = dict(u)
        for k, v in u.items(): br[k] += v
        print(uf, u['secoes'], flush=True)

    of_br = oficial('br')
    # Governador (2º turno em 6 UFs): soma dos boletins × oficial
    gov = {}
    for uf, d in recont_gov.items():
        if not d['bu']: continue
        o = oficial(uf, '6260', '0003')
        gov[uf] = {'bu': dict(d['bu']), 'bweb': dict(d['bweb']), 'oficial': {**o['votos'], 'branco': o['branco'], 'nulo': o['nulo']}}

    # Análise dentro do município: sobe a % de liberação sem biometria, muda a votação?
    grupos = defaultdict(list)
    for g, w, x, y in dentro: grupos[g].append((w, x, y))
    num = den = 0.0
    bins = defaultdict(lambda: [0.0, 0.0])
    for g, lst in grupos.items():
        if len(lst) < 5: continue
        W = sum(w for w, _, _ in lst)
        mx = sum(w * x for w, x, _ in lst) / W; my = sum(w * y for w, _, y in lst) / W
        for w, x, y in lst:
            num += w * (x - mx) * (y - my); den += w * (x - mx) ** 2
            b = max(-10, min(10, round(x - mx)))  # desvio em p.p. em relação à média da cidade
            bins[b][0] += w * (y - my); bins[b][1] += w
    inclinacao = num / den if den else None
    # entre municípios (sem controlar a região), para comparar
    xs = [x for _, _, x, _ in dentro]; ys = [y for _, _, _, y in dentro]
    corr_bruta = statistics.correlation(xs, ys) if len(xs) > 2 else None

    def top(lst, chave, n=40):
        return sorted(lst, key=chave, reverse=True)[:n]

    saida = {
        'eleicao': '2º turno 2026 (Presidente)', 'pleito': 3221, 'eleicao_tse': 6258,
        'geradoEm': __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M'),
        'oficial_gerado': of_br['gerado'],
        'fontes': {
            'arquivos': 'https://dadosabertos.tse.jus.br/dataset/resultados-2026-arquivos-transmitidos-para-totalizacao',
            'bweb': 'https://dadosabertos.tse.jus.br/dataset/resultados-2026-boletim-de-urna',
            'oficial': 'https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.json',
            'especificacao': 'https://www.tse.jus.br/eleicoes/eleicoes-2022/documentacao-tecnica-do-software-da-urna-eletronica',
        },
        'secoes': {'arquivos': secoes_total, 'oficial': of_br['secoes'], 'sem_arquivo': len(listas['sem_arquivo']), 'sa': br['secoes_sa'], 'tipos_urna': dict(tipos_urna)},
        'recontagem': {
            'boletins': {k: recont['bu'].get(k, 0) for k in ('13', '22', 'branco', 'nulo')},
            'planilha_tse': {k: recont['bweb'].get(k, 0) for k in ('13', '22', 'branco', 'nulo')},
            'sem_arquivo': {k: recont['faltantes'].get(k, 0) for k in ('13', '22', 'branco', 'nulo')},
            'oficial': {'13': of_br['votos'].get('13', 0), '22': of_br['votos'].get('22', 0), 'branco': of_br['branco'], 'nulo': of_br['nulo']},
            'comparecimento': {'boletins': br['comparecimento'], 'sem_arquivo': br['falt_comparecimento'], 'oficial': of_br['comparecimento']},
            'governador': gov,
        },
        'consistencia': {'log_x_bu': log_x_bu[:200], 'log_x_bu_total': len(log_x_bu), 'bu_x_planilha': bu_x_bweb[:200], 'bu_x_planilha_total': len(bu_x_bweb), 'erros': listas['erros'][:50], 'erros_total': len(listas['erros']), 'sem_arquivo': listas['sem_arquivo'][:200]},
        'horario': {
            'apos17': br['apos17'], 'apos1730': br['apos1730'], 'apos18': br['apos18'], 'antes8': br['antes8'],
            'apos17_sem_bio': br['apos17_sem_bio'], 'secoes_apos17': br['secoes_apos17'],
            'por_hora': dict(zip(range(6, 22), por_hora)),
            'ultimo_voto': {hhmm(k): v for k, v in sorted(ultimo_hist.items())},
            'metodos': dict(metodos),
            'top_apos17': top(listas['apos17'], lambda x: x['n']),
            'antes8_lista': top(listas['antes8'], lambda x: x['n']),
        },
        'biometria': {
            'bio': br['hab_bio'], 'falhou': br['hab_bio_falhou'], 'codigo': br['hab_codigo'], 'tipos_log': dict(tipos_hab),
            'top_pct': top([x for x in listas['sem_bio'] if x['comp'] >= 100], lambda x: x['pct']),
            'top_seq': top(listas['seq'], lambda x: x['n']),
            'distribuicao': {str(b): sum(1 for x in listas['sem_bio'] if b <= x['pct'] < b + 5) for b in range(0, 100, 5)},
            'dentro_municipio': {
                'inclinacao_pp_por_10pp': round(inclinacao * 10, 2) if inclinacao is not None else None,
                'curva': {str(b): round(s / w, 2) for b, (s, w) in sorted(bins.items()) if w > 0},
                'correlacao_sem_controle': round(corr_bruta, 3) if corr_bruta is not None else None,
                'secoes': len(dentro), 'municipios': sum(1 for l in grupos.values() if len(l) >= 5),
            },
        },
        'uf': por_uf,
    }
    json.dump(saida, open(f'{DEST}/2t.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    # municípios: [uf, código, nome, seções, comparecimento, votos após 17h, sem biometria, votos 13, votos 22]
    mlist = [[uf, mu, nomes_glob.get((uf, mu), ''), m['secoes'], m['comp'], m['apos17'], m['sem_bio'], m['v13'], m['v22']] for (uf, mu), m in sorted(mun.items())]
    json.dump(mlist, open(f'{DEST}/2t-municipios.json', 'w', encoding='utf-8'), separators=(',', ':'))
    print('ok', secoes_total)


if __name__ == '__main__':
    main()
