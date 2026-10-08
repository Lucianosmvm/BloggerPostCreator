"""Monta o HTML final de um post a partir de uma fonte enxuta e confere o código.

    python ferramentas/montar_post.py posts-sobrevivente/6-variaveis-em-csharp.fonte.html

Gera posts-sobrevivente/6-variaveis-em-csharp.html (com os estilos inline do
blog) e, antes, roda cada <codigo> seguido de <saida> com `dotnet run` para
garantir que a saída mostrada no post é a real. --sem-verificar pula isso.

Tags da fonte (o resto é HTML normal, passa direto):
  <resumo>item\nitem</resumo>          caixa roxa "Resumo rápido", um item por linha
  <dica titulo="Dica">texto</dica>     caixa âmbar
  <codigo>C# cru</codigo>              bloco de código (o script escapa < > &)
  <codigo entrada="Ana|25">            stdin para Console.ReadLine (| = nova linha)
  <codigo nao-roda>                    trecho que não compila sozinho / mostra erro
  <codigo terminal>                    comandos de terminal (rótulo "Terminal", não roda)
  <saida>texto</saida>                 "Saída esperada" do <codigo> anterior
  <tabela>A | B\n1 | 2</tabela>        tabela, primeira linha = cabeçalho (` vira <code>)
  <desafio><q>pergunta</q><r>resposta</r>...</desafio>   card DESAFIO
Dentro de <q>, <r>, <dica>, <tabela> e <resumo>, `trecho` vira <code>trecho</code>.
"""
import html
import os
import re
import subprocess
import sys
import tempfile

COD = "background:#1e1f22;color:#f1f1f1;padding:14px 16px;border-radius:8px;overflow-x:auto;font-size:14px;line-height:1.5;margin:0 0 20px;white-space:pre;"
SAI = "background:rgba(128,128,128,.12);border:1px dashed rgba(128,128,128,.45);padding:12px 16px;border-radius:8px;overflow-x:auto;font-size:14px;line-height:1.5;margin:0 0 20px;white-space:pre;"
CEL = "padding:10px 12px;border:1px solid rgba(167,139,250,.25);"
# cultura invariante: a saída do post usa ponto decimal, como no código
AMBIENTE = {**os.environ, "DOTNET_SYSTEM_GLOBALIZATION_INVARIANT": "1", "DOTNET_CLI_TELEMETRY_OPTOUT": "1", "DOTNET_NOLOGO": "1"}
ATTR = re.compile(r'(\w[\w-]*)(="[^"]*")?')


def atributos(texto):
    # nome="valor" ou só nome (vira True)
    return {k: (v[2:-1] if v else True) for k, v in ATTR.findall(texto or "")}


def crases(t):
    return re.sub(r"`([^`]+)`", lambda m: "<code>" + html.escape(m.group(1), quote=False) + "</code>", t)


def resumo(corpo):
    itens = "".join(f"<li>{crases(l.strip())}</li>" for l in corpo.strip().splitlines() if l.strip())
    return ('<div style="border-left:4px solid #a78bfa;background:rgba(167,139,250,.08);padding:14px 18px;'
            'margin:24px 0;border-radius:6px;"><p style="margin:0 0 8px;font-weight:bold;">Resumo rápido</p>'
            f"<ul>{itens}</ul></div>")


def dica(attrs, corpo):
    titulo = attrs.get("titulo") or "Dica"
    return ('<div style="border-left:4px solid #f5c518;background:rgba(245,197,24,.08);padding:14px 18px;'
            f'margin:24px 0;border-radius:6px;"><p style="margin:0 0 6px;font-weight:bold;">💡 {titulo}</p>'
            f'<p style="margin:0;">{crases(corpo.strip())}</p></div>')


def tabela(corpo):
    linhas = [[crases(c.strip()) for c in l.split(" | ")] for l in corpo.strip().splitlines() if l.strip()]
    th = "".join(f'<th style="{CEL}text-align:left;background:rgba(167,139,250,.12);">{c}</th>' for c in linhas[0])
    trs = "\n".join("<tr>" + "".join(f'<td style="{CEL}">{c}</td>' for c in l) + "</tr>" for l in linhas[1:])
    return ('<div style="overflow-x:auto;margin:24px 0;"><table style="width:100%;border-collapse:collapse;min-width:420px;">'
            f"<thead><tr>{th}</tr></thead><tbody>\n{trs}\n</tbody></table></div>")


def desafio(corpo):
    itens = []
    for q, r in re.findall(r"<q>(.*?)</q>\s*<r>(.*?)</r>", corpo, re.S):
        itens.append('<li style="margin-bottom:14px;"><p style="margin:0 0 6px;">' + crases(q.strip()) + "</p>"
                     '<details><summary style="cursor:pointer;font-weight:bold;color:#f5c518;">Ver resposta</summary>'
                     '<div style="margin-top:8px;"><p>' + crases(r.strip()) + "</p></div></details></li>")
    return ('<div style="background:#1f2420;color:#eef0ea;border:3px solid #111;border-radius:10px;padding:18px 20px;margin:32px 0;">'
            '<p style="margin:0 0 4px;font:900 30px/1.1 system-ui,sans-serif;letter-spacing:2px;color:#f5c518;">DESAFIO</p>'
            '<p style="margin:0 0 14px;opacity:.85;">Tente resolver antes de abrir a resposta. Sobreviveu? Vá para o próximo.</p><ol>\n'
            + "\n".join(itens) + "\n</ol></div>")


def limpar(bloco):
    # tira a quebra logo após a tag de abertura e o recuo final
    return bloco.strip("\n").rstrip()


def montar(fonte):
    blocos = []  # (codigo, attrs, saida) para verificar

    def f_codigo(m):
        attrs = atributos(m.group(1))
        cod = limpar(m.group(2))
        blocos.append({"codigo": cod, "attrs": attrs, "saida": None})
        rotulo = "Terminal" if attrs.get("terminal") else "C#"
        return (f'<p style="margin:16px 0 4px;font-size:13px;opacity:.75;">{rotulo}</p>'
                f'<pre style="{COD}"><code>{html.escape(cod, quote=False)}</code></pre>')

    def f_saida(m):
        sai = limpar(m.group(3))
        if blocos and blocos[-1]["saida"] is None:
            blocos[-1]["saida"] = sai
        return ('<p style="margin:0 0 4px;font-size:13px;opacity:.75;">Saída esperada</p>'
                f'<pre style="{SAI}"><code>{html.escape(sai, quote=False)}</code></pre>')

    # um passe só, na ordem do texto: cada saída fica com o código logo antes dela
    t = re.sub(r"<codigo([^>]*)>(.*?)</codigo>|<saida>(.*?)</saida>",
               lambda m: f_codigo(m) if m.group(2) is not None else f_saida(m), fonte, flags=re.S)
    t = re.sub(r"<resumo>(.*?)</resumo>", lambda m: resumo(m.group(1)), t, flags=re.S)
    t = re.sub(r"<dica([^>]*)>(.*?)</dica>", lambda m: dica(atributos(m.group(1)), m.group(2)), t, flags=re.S)
    t = re.sub(r"<tabela>(.*?)</tabela>", lambda m: tabela(m.group(1)), t, flags=re.S)
    t = re.sub(r"<desafio>(.*?)</desafio>", lambda m: desafio(m.group(1)), t, flags=re.S)
    return t, blocos


def sem_espaco_final(texto):
    # espaço no fim da linha não aparece na tela: não conta na comparação
    return [l.rstrip() for l in texto.split("\n")]


def verificar(blocos):
    erros = 0
    pasta = tempfile.mkdtemp(prefix="post-cs-")
    for i, b in enumerate(blocos, 1):
        if b["attrs"].get("nao-roda") or b["attrs"].get("terminal"):
            continue
        arq = os.path.join(pasta, f"bloco{i}.cs")
        open(arq, "w", encoding="utf8").write(b["codigo"] + "\n")
        entrada = str(b["attrs"].get("entrada") or "").replace("|", "\n")
        r = subprocess.run(["dotnet", "run", arq], input=entrada, capture_output=True, text=True, encoding="utf8", cwd=pasta, env=AMBIENTE)
        # avisos do compilador saem no stdout do dotnet run: não fazem parte da saída
        linhas = r.stdout.replace("\r\n", "\n").split("\n")
        real = "\n".join(l for l in linhas if ": warning CS" not in l).rstrip()
        esperado = (b["saida"] or "").rstrip() + "\n"
        # no post, o que o usuário digita aparece na tela (eco do terminal);
        # com stdin redirecionado não aparece: tira cada entrada, em ordem
        for valor in entrada.split("\n") if entrada else []:
            esperado = esperado.replace(valor + "\n", "", 1)
        esperado = esperado.rstrip()
        if r.returncode != 0 and not real:
            print(f"✗ bloco {i}: não compilou\n{r.stdout}{r.stderr}\n--- código:\n{b['codigo']}\n")
            erros += 1
        elif b["saida"] is not None and sem_espaco_final(real) != sem_espaco_final(esperado):
            print(f"✗ bloco {i}: saída diferente\n--- no post:\n{b['saida']}\n--- real:\n{real}\n")
            erros += 1
        else:
            print(f"✓ bloco {i}" + ("" if b["saida"] is not None else " (compila; sem saída no post)"))
    return erros


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1 or not args[0].endswith(".fonte.html"):
        sys.exit(__doc__)
    fonte = args[0]
    t, blocos = montar(open(fonte, encoding="utf8").read())
    if "--sem-verificar" not in sys.argv and verificar(blocos):
        sys.exit("Corrija os blocos acima; o HTML não foi gerado.")
    destino = fonte.replace(".fonte.html", ".html")
    open(destino, "w", encoding="utf8").write(t)
    print("HTML em", destino)


if __name__ == "__main__":
    main()
