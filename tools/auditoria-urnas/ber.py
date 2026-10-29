# Leitor BER genérico (sem especificação): devolve a árvore (tag, valor|filhos).
def ler(b, o=0, fim=None):
    fim = len(b) if fim is None else fim
    out = []
    while o < fim:
        t = b[o]; o += 1
        if t & 0x1f == 0x1f:
            while b[o] & 0x80: o += 1
            o += 1
        l = b[o]; o += 1
        if l & 0x80:
            n = l & 0x7f; l = int.from_bytes(b[o:o + n], 'big'); o += n
        if t & 0x20:
            out.append((t, ler(b, o, o + l)))
        else:
            out.append((t, bytes(b[o:o + l])))
        o += l
    return out

def inteiro(v): return int.from_bytes(v, 'big', signed=False)
