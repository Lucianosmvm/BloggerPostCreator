"""Gera a capa e as cenas de um post com o mascote (Remotion em imagens/)
e coloca as imagens no HTML, com endereço do GitHub Pages.

    python ferramentas/imagens_post.py posts-sobrevivente/6-metodos-em-csharp.html

Ao lado do HTML precisa existir <mesmo-nome>.imagens.json no formato do
imagens/render.mjs (sem "post"/"saida", que saem daqui):
    {"imagens": [{"arquivo": "capa.jpg", "tipo": "capa", ...},
                 {"arquivo": "cena-1.jpg", "tipo": "cena", "cena": 1, "alt": "...", ...}]}

- capa.jpg entra no topo do post (o Blogger usa a primeira imagem como miniatura);
- cada imagem com "cena": n substitui o comentário <!-- CENA n -->.
As imagens vão para docs/img/posts/<slug>/; depois é só commit + push para
os links funcionarem.
"""
import html
import json
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REMOTION = os.path.join(RAIZ, "imagens")
PAGES = "https://lucianosmvm.github.io/BloggerPostCreator/img/posts/"
MARCA = "Devs na Prática"


def figura(url, alt):
    return ('<div class="separator" style="clear:both;text-align:center;margin:24px 0;">'
            f'<img src="{url}" alt="{html.escape(alt, quote=True)}" width="1200" '
            'style="max-width:100%;height:auto;border-radius:10px;" loading="lazy"/></div>')


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    post = os.path.abspath(sys.argv[1])
    slug = re.sub(r"^\d+-", "", os.path.splitext(os.path.basename(post))[0])
    spec_path = os.path.splitext(post)[0] + ".imagens.json"
    spec = json.load(open(spec_path, encoding="utf8"))
    saida = os.path.join(RAIZ, "docs", "img", "posts", slug)

    # campos só deste script não vão para o Remotion
    render = {"post": slug, "saida": saida, "marca": spec.get("marca", MARCA),
              "imagens": [{k: v for k, v in i.items() if k not in ("cena", "alt")} for i in spec["imagens"]]}
    tmp = os.path.join(saida, "_spec.json")
    os.makedirs(saida, exist_ok=True)
    json.dump(render, open(tmp, "w", encoding="utf8"), ensure_ascii=False)
    try:
        subprocess.run(["node", "render.mjs", tmp], cwd=REMOTION, check=True, shell=os.name == "nt")
    finally:
        os.remove(tmp)

    texto = open(post, encoding="utf8").read()
    for img in spec["imagens"]:
        url = PAGES + slug + "/" + img["arquivo"]
        alt = img.get("alt") or img.get("titulo") or ""
        bloco = figura(url, alt)
        if img.get("tipo") == "capa":
            texto = re.sub(r'\n?<div class="separator"[^\n]*' + re.escape(PAGES + slug + "/" + img["arquivo"]) + r'[^\n]*', "", texto)
            # logo depois do comentário de cabeçalho
            fim = texto.find("-->") + 3 if texto.lstrip().startswith("<!--") else 0
            texto = texto[:fim] + "\n" + bloco + texto[fim:]
        elif img.get("cena"):
            texto = texto.replace(f"<!-- CENA {img['cena']} -->", bloco)
    open(post, "w", encoding="utf8").write(texto)
    print("Imagens em", saida)


if __name__ == "__main__":
    main()
