# BloggerPostCreator — como o Claude gera um post completo

O usuário fala em português; responda em português. Ele passa só o **tema**
("faz um post sobre métodos em C#") e o Claude entrega o post pronto para colar
no Blogger: texto, capa e cenas com o mascote.

Primeira vez numa máquina: `cd imagens && npm install`. Não depende do VSCreatorApp
(as poses do mascote foram copiadas para `imagens/public/mascote/`).

Padrão: blog **Devs na Prática** (https://devsnapratica.blogspot.com), **modo Sobrevivente**.

## Fluxo (tema → post)

1. **Escrever o HTML** em `posts-sobrevivente/<n>-<slug>.html` (`n` = próximo número da pasta).
   Modelo de estrutura e estilos inline: `posts-sobrevivente/1-operadores-em-csharp.html`
   (copiar os mesmos `style=` das caixas, tabelas, código, saída e card DESAFIO).
2. **Escrever o spec das imagens** em `posts-sobrevivente/<n>-<slug>.imagens.json`:
   uma capa + 2 a 4 cenas, cada cena com `"cena": n` igual ao `<!-- CENA n -->` do HTML e `alt`.
3. **Gerar e encaixar as imagens**:
   ```bash
   python ferramentas/imagens_post.py posts-sobrevivente/<n>-<slug>.html
   ```
   Renderiza com o Remotion próprio do blog (`imagens/render.mjs`,
   mesmas poses do mascote dos vídeos, sem Replicate/Gemini) em `docs/img/posts/<slug>/`
   e troca capa e `<!-- CENA n -->` pelas imagens com link do GitHub Pages.
4. **Conferir** as imagens geradas (abrir os .jpg) e corrigir o spec se algo ficou ruim
   (texto estourando, pose errada); rodar de novo.
5. **Commit + push** (`docs/img/posts/<slug>/`, o HTML e o spec) — sem push os links não
   abrem. Os links são `https://lucianosmvm.github.io/BloggerPostCreator/img/posts/<slug>/<arquivo>`.
6. Avisar o usuário: título, marcadores, descrição de pesquisa (estão no comentário do topo)
   e que é só colar o HTML no modo HTML do Blogger.

## Regras do post (modo Sobrevivente)

- Comentário no topo: POST NOVO ou REESCREVER (com URL), Título, Marcadores, Descrição de
  pesquisa (até ~155 caracteres), aviso do VÍDEO, lista das CENAS.
- `<!-- VIDEO -->` logo depois do cabeçalho (o usuário troca pelo embed do YouTube).
- Resumo rápido (caixa roxa) → introdução com gancho de jogo de sobrevivência → seções `<h2>`
  com tabela de apoio, código C# comentado e **Saída esperada** → card **DESAFIO** com
  exercícios e `<details>` de resposta → Conclusão → link "📖 Continue a série" para o
  post seguinte/anterior.
- Exemplos sempre de jogo de sobrevivência: vida, dano, munição, inventário, portas, ervas.
- Código precisa compilar e a saída mostrada precisa ser a real. Escapar `<`, `>`, `&` no HTML.
- Sem `<h1>` (o título é do Blogger). Português do Brasil, tom direto, frases curtas.

## Imagens (spec)

Campos (ver `imagens/src/PostImagem.tsx`):
- `tipo`: `capa` (1200x630) ou `cena` (1200x675). Usar `arquivo` `.jpg`.
- capa: `subtitulo` (etiqueta, ex. "C# NA PRÁTICA"), `titulo` com `*destaque*` em âmbar, `pose`.
- cena: `titulo` curto, um de `codigo` (≤ 8 linhas, ≤ 34 caracteres), `itens` ou `frase`,
  `subtitulo` (legenda), `pose`, `lado` (`esq`/`dir`, alternar), `placa` opcional (1–3 palavras).
- Poses: frente, lado, costas, apontando, digitando, pensando, comemorando, surpreso,
  desconfiado, cocando, bracos, acenando, sentado, explicando, confiante, tapando, alcas,
  lupa, cafe, triste, pulando, correndo, placa, ideia, animado, paz, perfil.
  Não usar as de busto (neutro, feliz, determinado): ficam gigantes na imagem.
