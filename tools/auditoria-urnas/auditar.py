# Auditoria independente do 2º turno de 2026 a partir dos arquivos que cada urna transmitiu ao TSE
# (pacote bu_imgbu_logjez_rdv_vscmr_2026_2t_<UF>.zip, dadosabertos.tse.jus.br).
#
# Para cada seção lê:
#   - o boletim de urna (BU, .bu.dat, ASN.1/BER): votos por candidato, comparecimento, abertura,
#     encerramento e como os eleitores foram habilitados (biometria ou liberação manual);
#   - o log da urna (.log.jez): hora de cada voto computado e o tipo de habilitação de cada eleitor.
# Grava uma linha JSON por seção em saida/<UF>.jsonl.
#
# Uso: python -I auditar.py <UF> [processos]
import sys, os, io, json, zipfile, re
from multiprocessing import Pool
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ber

BASE = os.environ.get('AUDITORIA_BASE', 'S:/auditoria-tse-2026/2t')
DIA = '25/10/2026'
# Fusos aceitos por UF (horas em relação a Brasília). O relógio da urna marca a hora local.
FUSOS = {'ac': (-2,), 'am': (-1, -2), 'rr': (-1,), 'ro': (-1,), 'mt': (-1,), 'ms': (-1,), 'pe': (0, 1)}
CARGO = {1: 'presidente', 3: 'governador'}


def seg(hhmmss):
    return int(hhmmss[0:2]) * 3600 + int(hhmmss[3:5]) * 60 + int(hhmmss[6:8])


def ler_bu(dado):
    env = ber.ler(dado)[0][1]
    conteudo = [v for t, v in env if t == 0x04][-1]
    bu = ber.ler(conteudo)[0][1]
    r = {}
    urna = bu[2][1]
    r['tipo_urna'] = ber.inteiro(urna[0][1])
    r['versao'] = urna[1][1].decode('latin-1')
    r['tipo_arquivo'] = next((ber.inteiro(v) for t, v in urna[3:] if t == 0x0a), None)
    r['emissao'] = bu[4][1].decode('latin-1')
    t5, v5 = bu[5]
    if t5 == 0xa0:
        r['abertura'] = v5[0][1].decode('latin-1')
        r['encerramento'] = v5[1][1].decode('latin-1')
    else:
        r['sa'] = True  # apurada no Sistema de Apuração (cédulas ou recuperação)
    eleicoes = {}
    for t, v in bu[6:]:
        if t == 0x02:
            r['comparecimento_bu'] = ber.inteiro(v)
        elif t == 0xa1 and all(tt == 0x02 for tt, _ in v):
            r['habilitacao'] = [ber.inteiro(x) for _, x in v]
        elif t == 0x30 and v and v[0][0] == 0x30 and v[0][1] and v[0][1][0][0] == 0x02:
            for _, rpe in v:  # ResultadoVotacaoPorEleicao
                ints = [ber.inteiro(x) for tt, x in rpe if tt == 0x02]
                ele = {'aptos': ints[1] if len(ints) > 1 else None, 'cargos': {}}
                for tt, lista in rpe:
                    if tt != 0x30: continue
                    for _, rv in lista:  # ResultadoVotacao
                        comp = ber.inteiro(rv[1][1])
                        for _, tvc in rv[2][1]:  # TotalVotosCargo
                            cod = ber.inteiro(tvc[0][1])
                            votos = {}
                            for _, vv in tvc[2][1]:  # TotalVotosVotavel
                                d = {tt2: x for tt2, x in vv}
                                tipo = ber.inteiro(d[0x81]); q = ber.inteiro(d[0x82])
                                if tipo == 1 or tipo == 4:
                                    num = ber.inteiro(d[0xa3][1][1]) if isinstance(d.get(0xa3), list) else '?'
                                    chave = str(num)
                                else:
                                    chave = {2: 'branco', 3: 'nulo'}.get(tipo, f't{tipo}')
                                votos[chave] = votos.get(chave, 0) + q
                            ele['cargos'][CARGO.get(cod, str(cod))] = {'comparecimento': comp, 'votos': votos}
                eleicoes[str(ints[0])] = ele
    r['eleicoes'] = eleicoes
    return r


def textos_log(dado, prof=0):
    # O .jez é um zip com o logd.dat e, às vezes, logs anteriores compactados (.jez dentro do .jez).
    z = zipfile.ZipFile(io.BytesIO(dado))
    out = []
    for n in z.namelist():
        b = z.read(n)
        if n.endswith('.dat'):
            out.append(b.decode('latin-1'))
        elif b[:2] == b'PK' and prof < 3:
            try: out += textos_log(b, prof + 1)
            except zipfile.BadZipFile: pass
    return out


def secoes_do_texto(texto):
    # Seções que a urna declarou no dia da eleição ("Seção Eleitoral: 0085"); 0000 = urna ainda sem seção.
    out = set()
    for l in texto.splitlines():
        if l.startswith(DIA) and 'o Eleitoral: ' in l:
            p = l.split('\t')
            if len(p) > 4 and p[4].startswith('Se') and 'o Eleitoral: ' in p[4]:
                out.add(p[4].rsplit(' ', 1)[-1].strip())
    return out - {'0000'}


def ler_log(dado, uf, abertura, secao=None):
    votos = []  # (hora local em s, tipo de habilitação)
    extra = {'tipos': {}, 'confirmados': [], 'habilitados': [], 'mesario': 0}
    vistos = set()
    for texto in textos_log(dado):
        # Um .jez pode trazer junto o log de uma urna usada em outra seção (ex.: urna de contingência
        # que antes atendeu a seção 0112): só conta o log que declarou esta seção.
        decl = secoes_do_texto(texto)
        if secao and decl and secao not in decl:
            continue
        votos += votos_do_texto(texto, extra, vistos)
    votos.sort()
    return resumo_log(votos, extra, uf, abertura)


def votos_do_texto(texto, extra, vistos):
    tipos = extra['tipos']
    votos = []
    bio = manual = mesario = False
    # Só o trecho do dia da eleição (o log é cronológico e guarda também o 1º turno e a preparação).
    i = texto.find('\n' + DIA)
    if i < 0 and not texto.startswith(DIA): return votos
    j = texto.rfind('\n' + DIA)
    k = texto.find('\n', j + 1)
    texto = texto[max(i, 0):(k if k > 0 else len(texto))]
    for linha in texto.splitlines():
        if not linha.startswith(DIA): continue
        p = linha.split('\t')
        if len(p) < 5: continue
        m = p[4]
        if m.startswith('Aguardando digita'):
            bio = manual = mesario = False
        elif m.startswith('Tipo de habilita'):
            i = m.find('['); tipo = m[i + 1:m.find(']', i)] if i >= 0 else m
            tipos[tipo] = tipos.get(tipo, 0) + 1
            if 'biom' in tipo: bio = True
        elif 'habilita' in m and 'manual' in m:
            manual = True
        elif m.startswith('Mes') and m.endswith('habilitou o eleitor'):
            mesario = True
            extra['mesario'] += 1
        elif m.startswith('Voto confirmado para'):
            if linha not in vistos:
                vistos.add(linha); extra['confirmados'].append(seg(p[0][11:19]))
        elif m.startswith('Eleitor foi habilitado'):
            if linha not in vistos:
                vistos.add(linha); extra['habilitados'].append(seg(p[0][11:19]))
        elif m.startswith('O voto do eleitor foi computado'):
            if linha in vistos: continue  # mesma linha em dois arquivos de log (cópia)
            vistos.add(linha)
            votos.append((seg(p[0][11:19]), 'bio' if bio else ('manual' if (manual or mesario) else 'outro')))
            bio = manual = mesario = False
    return votos


def resumo_log(votos, extra, uf, abertura):
    tipos = extra['tipos']
    if not votos:
        return {'votos_log': 0, 'tipos_hab': tipos}
    # Fuso da urna: a votação abre às 8h de Brasília; usa a hora de abertura do BU (ou o 1º voto).
    h0 = int(abertura[9:11]) if abertura else votos[0][0] // 3600
    aceitos = FUSOS.get(uf, (0,))
    off = min(aceitos, key=lambda f: (abs((h0 - 8) - f), -f)) if uf != 'zz' else 0
    br = [(s - off * 3600, t) for s, t in votos]  # hora de Brasília (exterior: hora local)
    tempos = [s for s, _ in br]
    apos = [(s, t) for s, t in br if s >= 17 * 3600]
    # Maior sequência de eleitores liberados sem biometria um atrás do outro.
    seq = mx = 0; mx_fim = None
    for s, t in br:
        seq = seq + 1 if t != 'bio' else 0
        if seq > mx: mx, mx_fim = seq, s
    lim = 17 * 3600 + off * 3600  # 17h de Brasília no relógio da urna
    return {
        'votos_log': len(br), 'fuso': off,
        'primeiro': min(tempos), 'ultimo': max(tempos),
        'antes8': sum(1 for s in tempos if s < 8 * 3600),
        'apos17': len(apos), 'apos1730': sum(1 for s in tempos if s >= 17 * 3600 + 1800), 'apos18': sum(1 for s in tempos if s >= 18 * 3600),
        'apos17_sem_bio': sum(1 for _, t in apos if t != 'bio'),
        'hab': {k: sum(1 for _, t in br if t == k) for k in ('bio', 'manual', 'outro')},
        'seq_sem_bio': mx, 'seq_sem_bio_fim': mx_fim, 'tipos_hab': tipos, 'mesario_hab': extra['mesario'],
        'apos17_horas': [s for s, _ in apos][:40],
        # contagens com outros métodos (para mostrar como números inflados aparecem)
        'confirmados_apos17': sum(1 for s in extra['confirmados'] if s >= lim),
        'habilitados_apos17': sum(1 for s in extra['habilitados'] if s >= lim),
        'apos17_local': sum(1 for s, _ in votos if s >= 17 * 3600),
        # votos por hora de Brasília (8..20) para o perfil do dia
        'por_hora': [sum(1 for s in tempos if h * 3600 <= s < (h + 1) * 3600) for h in range(6, 22)],
    }


RX = re.compile(r'o03221([a-z]{2})(\d{5})(\d{4})(\d{4})-(bu|log)\.(dat|jez)$')


def trabalho(item):
    (uf, mu, zo, se), arqs = item
    r = {'uf': uf, 'mu': mu, 'zo': zo, 'se': se}
    try:
        if 'bu' in arqs: r.update(ler_bu(arqs['bu']))
    except Exception as e:
        r['erro_bu'] = repr(e)[:200]
    try:
        if 'log' in arqs: r.update(ler_log(arqs['log'], uf, r.get('abertura'), se))
    except Exception as e:
        r['erro_log'] = repr(e)[:200]
    return json.dumps(r, separators=(',', ':'))


def secoes_em_ordem(z):
    # Lê o zip na ordem física do arquivo (disco sem saltos) e entrega cada seção com BU e log juntos.
    infos = sorted((i for i in z.infolist() if RX.search(i.filename)), key=lambda i: i.header_offset)
    pend = {}
    for i in infos:
        m = RX.search(i.filename)
        chave = m.groups()[:4]
        d = pend.setdefault(chave, {})
        d[m.group(5)] = z.read(i)
        if len(d) == 2:
            yield chave, pend.pop(chave)
    yield from pend.items()


def main():
    uf = sys.argv[1].lower()
    procs = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    z = zipfile.ZipFile(f'{BASE}/zips/{uf.upper()}.zip')
    os.makedirs(f'{BASE}/saida', exist_ok=True)
    tmp = f'{BASE}/saida/{uf}.jsonl.tmp'
    n = 0
    with open(tmp, 'w') as f, Pool(procs) as pool:
        for linha in pool.imap_unordered(trabalho, secoes_em_ordem(z), chunksize=20):
            f.write(linha + '\n'); n += 1
    os.replace(tmp, f'{BASE}/saida/{uf}.jsonl')
    print(uf, n, 'secoes', flush=True)


if __name__ == '__main__':
    main()
