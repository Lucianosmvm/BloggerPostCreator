"use strict";

/* =========================================================
   Modo Sobrevivente: posts com clima de jogo de sobrevivência,
   ilustrações com o mascote do blog no meio do texto e o vídeo do canal embutido.
   Liga por blog em Ajustes → Perfil do blog. Usa funções globais de app.js e recursos.js.
   ========================================================= */

const MASCOTE_PADRAO = "Mascote original do blog, o \"Dev Sobrevivente\": rapaz em estilo chibi 2D, cabeça grande, " +
  "olhos de traço preto vertical e sem boca, cabelo preto bagunçado com franja cobrindo um dos olhos, " +
  "jaqueta bomber verde-oliva com gola alta lisa (sem pelo) e punhos cor de areia, camiseta preta, " +
  "headset preto pendurado no pescoço, luvas pretas sem dedos, calça cargo preta com bolsos laterais, coturnos pretos " +
  "e uma pequena mochila com adesivos de chaves { }. Em vez de arma, carrega um notebook.";

const ESTILO_CENA = "Ilustração 2D estilo chibi, contorno preto grosso, cores chapadas com sombra suave, " +
  "paleta fria e dessaturada (cinzas, verde-acinzentado, bege) em que a jaqueta do personagem se destaca. " +
  "Clima de jogo de sobrevivência, mas leve e didático. Nada de armas, sangue ou logotipos de jogos e marcas.";

const INSTRUCOES_SOBREVIVENTE = `Estilo do blog: MODO SOBREVIVENTE. O blog tem um mascote, um dev que sobrevive no mundo da programação como num jogo de survival horror.
- Use exemplos com o vocabulário de jogos de sobrevivência quando couber: munição, vida, inventário, maleta, mapa, save point, chefe da fase, mercador. Ex.: int municao = 15; string arma = "pistola" vira string item = "lanterna".
- O tom continua didático e claro; o tema de jogo serve para fixar o conceito, não para atrapalhar. Não cite nomes de jogos, personagens ou empresas reais.
- Preencha "cena" em 2 a 4 seções (as mais importantes): uma frase descrevendo a ilustração daquela seção, com o mascote fazendo algo que explique o conceito. Cenários: sala de aula com lousa verde, quadro branco, mesa com PC de tela escura, cavalete de apresentação. Pode incluir no máximo uma linha curta de código ou palavra escrita na lousa/tela, entre aspas. Ex.: "Mascote aponta para a lousa onde está escrito 'int municao = 15;', com setas indicando tipo, nome e valor."
- Quando houver "exercicios", eles aparecem como um card DESAFIO: escreva como missões curtas.`;

/** Cenas pedidas pela IA, na mesma ordem e numeração de Bloco.secoes. */
function cenasDasSecoes(secoes) {
  return (secoes || [])
    .filter(s => s?.titulo || s?.conteudo_html)
    .filter(s => s.cena?.trim())
    .map((s, i) => ({ n: i + 1, descricao: s.cena.trim(), secao: String(s.titulo || "").trim(), url: "", alt: "" }));
}

/** ID de um vídeo do YouTube a partir do link (youtu.be, watch?v=, shorts, embed, live). */
function idYoutube(link) {
  const m = String(link || "").trim().match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/i);
  return m ? m[1] : "";
}

function videoHtml(post, perfil) {
  const id = idYoutube(post.video);
  if (!id) return "";
  const canal = /^https:\/\//i.test(perfil.canalUrl || "")
    ? ` <a href="${esc(perfil.canalUrl)}" target="_blank" rel="noopener">Inscreva-se no canal</a> para ver os próximos.` : "";
  return `<div style="margin:0 0 24px;">` +
    `<p style="margin:0 0 8px;font-weight:bold;">▶ Prefere em vídeo? Assista à explicação:</p>` +
    `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;background:#000;">` +
    `<iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${esc(post.titulo || "Vídeo")}" ` +
    `style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" loading="lazy" ` +
    `allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>` +
    `<p style="margin:6px 0 0;font-size:14px;"><a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">Abrir no YouTube</a>.${canal}</p></div>`;
}

/**
 * Troca os lugares de cena pela imagem que o autor colou.
 * Cena sem imagem some no envio; na prévia continua visível para lembrar de preencher.
 */
function aplicarCenas(html, cenas, { previa = false } = {}) {
  if (!html || !html.includes(MARCA_CENA)) return html || "";
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  for (const el of doc.body.querySelectorAll(`[${MARCA_CENA}]`)) {
    const cena = (cenas || []).find(c => String(c.n) === el.getAttribute(MARCA_CENA));
    if (cena && /^https:\/\//i.test(cena.url || "")) {
      const fig = doc.createElement("div");
      fig.setAttribute("style", "margin:24px 0;text-align:center;");
      const img = doc.createElement("img");
      img.setAttribute("src", cena.url);
      img.setAttribute("alt", cena.alt || cena.descricao || "");
      img.setAttribute("loading", "lazy");
      img.setAttribute("style", "width:100%;height:auto;border-radius:8px;display:block;");
      fig.append(img);
      el.replaceWith(fig);
    } else if (!previa) {
      el.remove();
    }
  }
  return doc.body.innerHTML.trim();
}

/* ---------------- Imagens com o mascote ---------------- */

/** Ficha de referência do mascote fica no IndexedDB (imagem grande demais para o localStorage). */
const bancoImagens = {
  abrir() {
    return new Promise((ok, falha) => {
      const req = indexedDB.open("bs.imagens", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("imagens");
      req.onsuccess = () => ok(req.result);
      req.onerror = () => falha(req.error);
    });
  },
  async ler(chave) {
    try {
      const db = await this.abrir();
      return await new Promise((ok) => {
        const req = db.transaction("imagens").objectStore("imagens").get(chave);
        req.onsuccess = () => ok(req.result || null);
        req.onerror = () => ok(null);
      });
    } catch { return null; }
  },
  async gravar(chave, blob) {
    const db = await this.abrir();
    await new Promise((ok, falha) => {
      const tx = db.transaction("imagens", "readwrite");
      if (blob) tx.objectStore("imagens").put(blob, chave); else tx.objectStore("imagens").delete(chave);
      tx.oncomplete = ok;
      tx.onerror = () => falha(tx.error);
    });
  },
};
const chaveFicha = (blogId) => `ficha-mascote:${blogId || "padrao"}`;

async function blobParaBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

/** Gera uma imagem com o Gemini. referencia: imagem enviada junto para manter o personagem igual. */
async function gerarImagemGemini(texto, { aspecto = "16:9", referencia = null } = {}) {
  const { geminiKey, modeloImagem } = cfg();
  if (!geminiKey) throw new ErroApp("Cadastre a chave do Gemini em Ajustes.");
  const partes = [{ text: texto }];
  if (referencia) partes.unshift({ inlineData: { mimeType: referencia.type || "image/png", data: await blobParaBase64(referencia) } });
  const dados = await chamarGemini(`${encodeURIComponent(modeloImagem || MODELO_IMAGEM_PADRAO)}:generateContent`, {
    metodo: "POST",
    chave: geminiKey,
    timeoutMs: 180000,
    corpo: {
      contents: [{ role: "user", parts: partes }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: aspecto } },
    },
  });
  if (dados.promptFeedback?.blockReason) throw new ErroApp("O Gemini bloqueou esse pedido de imagem. Tente outra descrição.");
  const inline = (dados.candidates?.[0]?.content?.parts || []).map(p => p.inlineData || p.inline_data).find(i => i?.data);
  if (!inline) {
    const motivo = dados.candidates?.[0]?.finishReason;
    throw new ErroApp(motivo && motivo !== "STOP"
      ? `O Gemini não gerou a imagem (${motivo}). Tente outra descrição.`
      : "O Gemini não devolveu imagem. Confira o modelo de imagem em Ajustes.");
  }
  const bytes = Uint8Array.from(atob(inline.data), c => c.charCodeAt(0));
  return new Blob([bytes], { type: inline.mimeType || inline.mime_type || "image/png" });
}

function promptFicha(mascote) {
  return `Crie uma ficha de referência de personagem (character turnaround sheet) para animação 2D, fundo branco liso.
Personagem: ${mascote}
Linha de cima: o personagem em pé de frente, de perfil esquerdo, de costas e de perfil direito, mesmo tamanho e alinhados.
Linha de baixo: três poses — apontando para a frente como quem explica algo numa lousa, correndo, e sentado digitando no notebook.
${ESTILO_CENA}
Mesmas cores, roupas e proporções em todas as vistas. Sem textos, rótulos ou marca d'água.`;
}

function promptCena(cena, mascote, comReferencia) {
  return `Crie uma cena horizontal para ilustrar um post de blog de programação.
${comReferencia ? "Use o personagem da imagem enviada exatamente como ele é (mesmas roupas, cores e proporções)." : ""}
Personagem: ${mascote}
Cena: ${cena.descricao}
${ESTILO_CENA}
Textos só se a cena pedir (código ou palavra na lousa/tela), curtos e legíveis; nenhum outro texto, legenda ou marca d'água.`;
}

function nomeArquivo(prefixo, texto, blob) {
  const base = String(texto || "").toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${prefixo}${base ? `-${base}` : ""}.${blob.type.includes("jpeg") ? "jpg" : "png"}`;
}
function baixarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: nome }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Diálogo para gerar a ficha do mascote: baixar (para os vídeos) e guardar como referência das cenas. */
async function criarFichaMascote(blogId, mascote) {
  let blob = await bancoImagens.ler(chaveFicha(blogId));
  let url = blob ? URL.createObjectURL(blob) : null;
  let guardada = !!blob;
  try {
    while (true) {
      const { valor } = await abrirDialogo({
        titulo: "Ficha do mascote",
        html: `
          <p class="pequeno suave">Frente, perfil, costas e poses do mascote, para usar nos vídeos e manter o personagem igual nas cenas dos posts.</p>
          ${url ? `<img class="imagem-gerada" src="${url}" alt="Ficha de referência do mascote">
            <p class="pequeno suave">${guardada ? "✅ Esta ficha é a referência usada nas cenas." : "Toque em “Usar nas cenas” para as cenas seguirem este visual."} Imagens do Gemini têm marca d'água invisível SynthID.</p>` : ""}`,
        botoes: [
          { rotulo: "Fechar", valor: null },
          { rotulo: url ? "Gerar outra" : "Gerar ficha", valor: "gerar", primario: !url },
          url && !guardada ? { rotulo: "Usar nas cenas", valor: "guardar" } : null,
          url ? { rotulo: "Baixar", valor: "baixar", primario: true } : null,
          guardada ? { rotulo: "Esquecer", valor: "esquecer", perigo: true } : null,
        ].filter(Boolean),
      });
      if (valor === null) return;
      if (valor === "baixar") { baixarBlob(blob, nomeArquivo("ficha-mascote", "", blob)); toast("Ficha baixada.", "ok"); continue; }
      if (valor === "guardar") { await bancoImagens.gravar(chaveFicha(blogId), blob); guardada = true; toast("As próximas cenas vão seguir esta ficha.", "ok"); continue; }
      if (valor === "esquecer") {
        await bancoImagens.gravar(chaveFicha(blogId), null);
        guardada = false;
        toast("Ficha esquecida. As cenas usam só a descrição do mascote.");
        continue;
      }
      carregando("Desenhando o mascote… pode levar até 1 minuto");
      try {
        blob = await gerarImagemGemini(promptFicha(mascote), { aspecto: "4:3" });
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(blob);
        guardada = false;
      } catch (erro) {
        toast(erro instanceof ErroApp ? erro.message : `Erro inesperado: ${erro.message}`, "erro");
      } finally {
        carregando(null);
      }
    }
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

/** Gera a imagem de uma cena com o mascote e oferece para baixar (o Blogger não recebe imagens pela API). */
async function criarImagemCena(post, cena) {
  const mascote = perfilSalvo(blogDoPost(post)).mascote || MASCOTE_PADRAO;
  const referencia = await bancoImagens.ler(chaveFicha(blogDoPost(post)));
  let blob = null;
  let url = null;
  try {
    while (true) {
      const { valor } = await abrirDialogo({
        titulo: `Cena ${cena.n}`,
        html: `<p class="pequeno">${esc(cena.descricao)}</p>
          ${referencia ? "" : `<p class="pequeno suave">Sem ficha do mascote guardada: o personagem pode variar entre as cenas. Gere a ficha em Ajustes → Perfil do blog.</p>`}
          ${url ? `<img class="imagem-gerada" src="${url}" alt="">
            <p class="pequeno suave">Baixe, suba a imagem no Blogger (ou outro lugar) e cole o link dela no campo da cena.</p>` : ""}`,
        botoes: [
          { rotulo: "Fechar", valor: null },
          { rotulo: url ? "Gerar outra" : "Gerar", valor: "gerar", primario: !url },
          url ? { rotulo: "Baixar", valor: "baixar", primario: true } : null,
        ].filter(Boolean),
      });
      if (valor === null) return;
      if (valor === "baixar") { baixarBlob(blob, nomeArquivo(`cena-${cena.n}`, post.titulo, blob)); toast("Cena baixada.", "ok"); continue; }
      carregando("Desenhando a cena… pode levar até 1 minuto");
      try {
        blob = await gerarImagemGemini(promptCena(cena, mascote, !!referencia), { referencia });
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(blob);
      } catch (erro) {
        toast(erro instanceof ErroApp ? erro.message : `Erro inesperado: ${erro.message}`, "erro");
      } finally {
        carregando(null);
      }
    }
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

/* ---------------- Telas ---------------- */

function ajustesSobreviventeHtml(pf) {
  return `
    <fieldset class="grupo-sobrevivente">
      <legend>🎮 Modo Sobrevivente</legend>
      <label class="interruptor">
        <span><strong>Ligar neste blog</strong><small>Exemplos com clima de jogo, cenas com o mascote no meio do texto, card “Desafio” e vídeo do canal</small></span>
        <input type="checkbox" name="modoSobrevivente" ${pf.modoSobrevivente === true ? "checked" : ""}>
      </label>
      <label class="campo"><span>Mascote</span>
        <textarea name="mascote" rows="5">${esc(pf.mascote || MASCOTE_PADRAO)}</textarea>
        <small>Descreva roupa, cabelo e cores. A mesma descrição vai em todas as cenas.</small>
      </label>
      <label class="campo"><span>Link do canal no YouTube</span>
        <input name="canalUrl" type="url" value="${esc(pf.canalUrl || "")}" placeholder="https://www.youtube.com/@seucanal" autocapitalize="off">
        <small>Aparece junto do vídeo embutido no post.</small>
      </label>
      <button type="button" class="btn largo" id="ficha-mascote">${ICONES.brilho} Ficha de referência do mascote</button>
    </fieldset>`;
}

function editorSobreviventeHtml(post) {
  const ligado = perfilSalvo(blogDoPost(post)).modoSobrevivente === true;
  const cenas = post.cenas || [];
  if (!ligado && !cenas.length && !post.video) return "";
  return `
    <details class="cartao sobrevivente-editor" ${cenas.some(c => !c.url) || (ligado && !post.video) ? "open" : ""}>
      <summary><strong>🎮 Vídeo e cenas</strong></summary>
      <label class="campo"><span>Vídeo do YouTube</span>
        <input id="video" type="url" value="${esc(post.video || "")}" placeholder="https://youtu.be/…" autocapitalize="off">
        <small>Entra no topo do post, logo depois da capa.</small>
      </label>
      ${cenas.length ? `<p class="pequeno suave">Cenas sem link de imagem não vão para o Blogger. Gere, baixe, suba a imagem e cole o link.</p>` : ""}
      ${cenas.map((c, i) => `
        <div class="cena-editor">
          <p><strong>Cena ${c.n}</strong>${c.secao ? ` · ${esc(c.secao)}` : ""}</p>
          <p class="pequeno">${esc(c.descricao)}</p>
          ${/^https:\/\//i.test(c.url) ? `<img src="${esc(c.url)}" alt="">` : ""}
          <label class="campo"><span>Link da imagem</span>
            <input data-cena-url="${i}" type="url" value="${esc(c.url || "")}" placeholder="https://…" autocapitalize="off"></label>
          <label class="campo"><span>Texto alternativo</span>
            <input data-cena-alt="${i}" value="${esc(c.alt || "")}" placeholder="${esc(c.descricao)}"></label>
          <div class="botoes">
            <button type="button" class="btn" data-cena-gerar="${i}">${ICONES.brilho} Criar com IA</button>
            <button type="button" class="btn" data-cena-copiar="${i}">${ICONES.copiar} Copiar prompt</button>
          </div>
        </div>`).join("")}
    </details>`;
}

function ligarEditorSobrevivente(main, post, { salvarAgora, atualizarPrevia }) {
  const caixa = $(".sobrevivente-editor", main);
  if (!caixa) return;
  const gravar = () => { salvarPost(post); atualizarPrevia(); };
  $("#video", caixa).addEventListener("change", (e) => {
    const link = e.target.value.trim();
    if (link && !idYoutube(link)) { toast("Não reconheci esse link do YouTube.", "erro"); return; }
    post.video = link;
    gravar();
    if (link) toast("Vídeo adicionado ao topo do post.", "ok");
  });
  caixa.querySelectorAll("[data-cena-url]").forEach(el => el.addEventListener("change", () => {
    const link = el.value.trim();
    if (link && !/^https:\/\//i.test(link)) { toast("O link da imagem precisa começar com https://", "erro"); return; }
    post.cenas[Number(el.dataset.cenaUrl)].url = link;
    salvarAgora();
    gravar();
    telaEditor(post.id);
  }));
  caixa.querySelectorAll("[data-cena-alt]").forEach(el => el.addEventListener("input", () => {
    post.cenas[Number(el.dataset.cenaAlt)].alt = el.value;
    salvarPost(post);
  }));
  caixa.querySelectorAll("[data-cena-gerar]").forEach(el => el.addEventListener("click", () => {
    criarImagemCena(post, post.cenas[Number(el.dataset.cenaGerar)]);
  }));
  caixa.querySelectorAll("[data-cena-copiar]").forEach(el => el.addEventListener("click", () => {
    const perfil = perfilSalvo(blogDoPost(post));
    copiar(promptCena(post.cenas[Number(el.dataset.cenaCopiar)], perfil.mascote || MASCOTE_PADRAO, false));
  }));
}
