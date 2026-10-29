# Reprocessa seções específicas (uf mu zo se ...) e substitui as linhas delas em saida/<uf>.jsonl.
import sys, os, json, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auditar
alvos = [tuple(a.split('/')) for a in sys.argv[1:]]
for uf in sorted({a[0] for a in alvos}):
    z = zipfile.ZipFile(f'{auditar.BASE}/zips/{uf.upper()}.zip')
    novas = {}
    for (u, mu, zo, se) in [a for a in alvos if a[0] == uf]:
        base = f'o03221{uf}{mu}{zo}{se}'
        arqs = {k: z.read(f'{base}-{k}.{ext}') for k, ext in (('bu', 'dat'), ('log', 'jez')) if f'{base}-{k}.{ext}' in z.namelist()}
        novas[(mu, zo, se)] = auditar.trabalho(((uf, mu, zo, se), arqs))
    arq = f'{auditar.BASE}/saida/{uf}.jsonl'
    linhas = []
    for l in open(arq):
        r = json.loads(l)
        linhas.append(novas.pop((r['mu'], r['zo'], r['se']), l.rstrip('\n')))
    open(arq, 'w').write('\n'.join(linhas) + '\n')
    for k, v in novas.items(): print('não achou', k)
    print(uf, 'ok')
