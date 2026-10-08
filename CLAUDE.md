# BloggerPostCreator — como o Claude gera um post completo

O usuário fala em português; responda em português. Ele passa só o **tema**
("faz um post sobre métodos em C#") e o Claude entrega o post pronto para colar
no Blogger: texto, capa e cenas com o mascote.

Primeira vez numa máquina: `cd imagens && npm install`. Não depende do VSCreatorApp
(as poses do mascote foram copiadas para `imagens/public/mascote/`).

Padrão: blog **Devs na Prática** (https://devsnapratica.blogspot.com), **modo Sobrevivente**.

## Fluxo (tema → post)

1. **Escrever a fonte** em `posts-sobrevivente/<n>-<slug>.fonte.html` (`n` = próximo número da
   pasta) com as tags enxutas (`<resumo>`, `<codigo>`, `<saida>`, `<tabela>`, `<dica>`, `<desafio>`;
   lista completa no topo de `ferramentas/montar_post.py`). Modelo: `6-variaveis-em-csharp.fonte.html`.
   Montar e **verificar o código**:
   ```bash
   python ferramentas/montar_post.py posts-sobrevivente/<n>-<slug>.fonte.html
   ```
   Roda cada `<codigo>` com `dotnet run` e compara com o `<saida>` seguinte; só gera o `.html`
   se tudo bater. Cada bloco precisa rodar sozinho (top-level statements). Atenção: métodos no
   código solto do topo viram funções locais e **não aceitam sobrecarga** — use `class Program`.
   Trecho que não compila de propósito: `<codigo nao-roda>`; com `Console.ReadLine`:
   `<codigo entrada="Leon|2">` e, na saída, o que foi digitado como aparece no terminal.
   Rodar o montar_post de novo **apaga as imagens do .html**: rode o passo 3 depois.
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
