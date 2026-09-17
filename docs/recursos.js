"use strict";

/* =========================================================
   Recursos extras: ideias de pauta, imagem de capa e agendamento.
   Usa funções globais de app.js (cfg, gerarJson, montar, toast...) só em tempo de execução.
   ========================================================= */

/* ---------------- Ideias de pauta ---------------- */

const IDEIAS_SCHEMA = {
  type: "object",
  properties: {
    ideias: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título provisório atraente, até 70 caracteres" },
          angulo: { type: "string", description: "Uma frase: o enfoque do post e por que o leitor vai querer ler" },
          palavras_chave: { type: "array", items: { type: "string" }, description: "2 a 4 palavras-chave de busca" },
        },
        required: ["titulo", "angulo", "palavras_chave"],
      },
    },
  },
  required: ["ideias"],
};

function lerIdeias() {
  const ideias = armazenamento.ler("bs.ideias", []);
  return Array.isArray(ideias) ? ideias : [];
}
function gravarIdeias(ideias) { armazenamento.gravar("bs.ideias", ideias); }

async function gerarIdeias({ categoria: idCategoria, nicho, quantidade }) {
  const cat = categoria(idCategoria);
  const perfil = perfilBlog();
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const jaExistem = [
    ...listarPosts().filter(p => (p.categoria || "geral") === idCategoria).map(p => p.titulo),
    ...lerIdeias().filter(i => i.categoria === idCategoria).map(i => i.titulo),
  ].filter(Boolean).slice(-60);

  const sistema = [
    `Você é o editor-chefe de um blog e sugere pautas. Hoje é ${hoje}.
- Ideias específicas e úteis, com um ângulo claro (evite temas genéricos demais).
- Varie os formatos (guia, lista, comparação, erros comuns, história, etc.) conforme a categoria.
- Aproveite a época do ano e datas comemorativas próximas quando fizer sentido.
- Prefira temas que continuam relevantes com o tempo. Não invente lançamentos, notícias ou eventos recentes.
- Não repita nem parafraseie os títulos que o blog já tem.
- Responda em português do Brasil, somente no formato JSON pedido, em texto puro.`,
    linhasPerfil(perfil) && `Perfil do blog:\n${linhasPerfil(perfil)}`,
    `Categoria das ideias: ${cat.nome}\n${cat.instrucoes}`,
  ].filter(Boolean).join("\n\n");

  const texto = [
    `Gere ${quantidade} ideias de posts da categoria ${cat.nome}.`,
    nicho && `Assunto ou nicho: ${nicho}`,
    jaExistem.length && `Títulos que já existem (não repetir):\n${jaExistem.map(t => `- ${t}`).join("\n")}`,
  ].filter(Boolean).join("\n\n");

  const dados = await gerarJson({ sistema, texto, schema: IDEIAS_SCHEMA, maxTokens: 8192, timeoutMs: 120000 });
  const agora = new Date().toISOString();
  return (dados.ideias || [])
    .filter(i => i?.titulo?.trim())
    .map(i => ({
      id: novoId(), categoria: idCategoria, nicho: nicho || "", criadaEm: agora, usada: false,
      titulo: String(i.titulo).trim(), angulo: String(i.angulo || "").trim(),
      palavrasChave: (i.palavras_chave || []).map(p => String(p).trim()).filter(Boolean),
    }));
}

let formularioIdeias = { categoria: "", nicho: "", quantidade: "10" };

function telaIdeias() {
  const f = formularioIdeias;
  if (!CATEGORIAS[f.categoria]) f.categoria = CATEGORIAS[formularioNovo.categoria] ? formularioNovo.categoria : "tecnologia";
  const ideias = lerIdeias().sort((a, b) => Number(a.usada) - Number(b.usada) || b.criadaEm.localeCompare(a.criadaEm));
  const daCategoria = ideias.filter(i => i.categoria === f.categoria);

  const main = montar({
    titulo: "Ideias de pauta", aba: "novo", voltar: "#/novo",
    html: `
      <form id="form-ideias" class="cartao">
        <div class="campo"><span>Categoria</span>${campoChips("categoria", ORDEM_CATEGORIAS.map(id => CATEGORIAS[id].nome), CATEGORIAS[f.categoria].nome)}</div>
        <label class="campo"><span>Assunto ou nicho (opcional)</span>
          <input name="nicho" value="${esc(f.nicho)}" placeholder="Ex.: doces sem açúcar, jogos indie, segurança no celular">
        </label>
        <div class="campo"><span>Quantas ideias</span>${campoChips("quantidade", ["5", "10", "15"], f.quantidade)}</div>
        <button class="btn primario largo">${ICONES.brilho} Gerar ideias</button>
      </form>
      ${daCategoria.length ? `
        <div class="titulo-lista">
          <h2 class="secao-titulo">${CATEGORIAS[f.categoria].icone} Ideias salvas (${daCategoria.length})</h2>
          <button type="button" class="btn texto" id="limpar-ideias">Limpar</button>
        </div>
        <ul class="lista ideias">
          ${daCategoria.map(i => `
            <li class="${i.usada ? "usada" : ""}">
              <div class="ideia">
                <strong>${esc(i.titulo)}</strong>
                ${i.angulo ? `<p>${esc(i.angulo)}</p>` : ""}
                ${i.palavrasChave.length ? `<p class="palavras">${i.palavrasChave.map(esc).join(" · ")}</p>` : ""}
                <div class="ideia-acoes">
                  <button type="button" class="btn primario" data-usar="${esc(i.id)}">${i.usada ? "Usar de novo" : "Usar ideia"}</button>
                  <button type="button" class="icone-btn perigo" data-descartar="${esc(i.id)}" aria-label="Descartar ideia">${ICONES.lixo}</button>
                </div>
              </div>
            </li>`).join("")}
        </ul>` : `
        <div class="vazio"><p>Nenhuma ideia salva para ${esc(CATEGORIAS[f.categoria].nome)}.<br>Gere algumas acima.</p></div>`}`,
  });

  const form = $("#form-ideias", main);
  const nomeParaId = (nome) => ORDEM_CATEGORIAS.find(id => CATEGORIAS[id].nome === nome) || "geral";
  const ler = () => {
    const d = new FormData(form);
    formularioIdeias = { categoria: nomeParaId(d.get("categoria")), nicho: String(d.get("nicho") || "").trim(), quantidade: String(d.get("quantidade") || "10") };
  };
  form.addEventListener("input", ler);
  form.querySelectorAll('input[name="categoria"]').forEach(r => r.addEventListener("change", () => { ler(); telaIdeias(); }));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    ler();
    if (!cfg().geminiKey) { toast("Cadastre a chave do Gemini em Ajustes.", "erro"); return; }
    carregando("Pensando em pautas…");
    try {
      const novas = await gerarIdeias(formularioIdeias);
      if (!novas.length) throw new ErroApp("O Gemini não devolveu ideias. Tente de novo.");
      gravarIdeias([...novas, ...lerIdeias()].slice(0, 200));
      toast(`${novas.length} ideias novas.`, "ok");
      telaIdeias();
    } catch (erro) {
      toast(erro instanceof ErroApp ? erro.message : `Erro inesperado: ${erro.message}`, "erro");
    } finally {
      carregando(null);
    }
  });

  main.querySelectorAll("[data-usar]").forEach(b => b.onclick = () => {
    const todas = lerIdeias();
    const ideia = todas.find(i => i.id === b.dataset.usar);
    if (!ideia) return;
    ideia.usada = true;
    gravarIdeias(todas);
    formularioNovo = {
      ...formularioNovo,
      categoria: ideia.categoria,
      tema: ideia.titulo,
      palavrasChave: ideia.palavrasChave.join(", "),
      instrucoes: ideia.angulo ? `Ângulo do post: ${ideia.angulo}` : "",
    };
    armazenamento.gravar("bs.ultimaCategoria", ideia.categoria);
    location.hash = "#/novo";
    toast("Ideia colocada no formulário. Ajuste e gere o post.", "ok");
  });
  main.querySelectorAll("[data-descartar]").forEach(b => b.onclick = () => {
    gravarIdeias(lerIdeias().filter(i => i.id !== b.dataset.descartar));
    telaIdeias();
  });
  $("#limpar-ideias", main)?.addEventListener("click", () => {
    if (!confirm(`Apagar todas as ideias salvas de ${CATEGORIAS[formularioIdeias.categoria].nome}?`)) return;
    gravarIdeias(lerIdeias().filter(i => i.categoria !== formularioIdeias.categoria));
    telaIdeias();
  });
}

/* ---------------- Imagem de capa ---------------- */

const MODELO_IMAGEM_PADRAO = "gemini-3.1-flash-image";

/** HTML da capa que vai no topo do post publicado (a capa não fica no texto editável). */
function capaHtml(capa) {
  if (!capa?.url || !/^https:\/\//i.test(capa.url)) return "";
  const link = (url, texto) => /^https:\/\//i.test(url || "") ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(texto)}</a>` : esc(texto);
  const credito = capa.fonte === "pexels"
    ? `<p style="margin:6px 0 0;font-size:12px;opacity:.7;">Foto: ${link(capa.autorUrl, capa.autor || "Pexels")} / ${link(capa.paginaUrl || "https://www.pexels.com", "Pexels")}</p>`
    : "";
  return `<div style="margin:0 0 24px;"><img src="${esc(capa.url)}" alt="${esc(capa.alt || "")}" style="width:100%;height:auto;border-radius:8px;display:block;">${credito}</div>`;
}

/** Conteúdo final enviado ao Blogger: capa + texto. */
function conteudoFinal(post) { return capaHtml(post.capa) + (post.conteudo || ""); }

async function buscarPexels(consulta, pagina = 1, chave = cfg().pexelsKey) {
  if (!chave) throw new ErroApp("Cadastre a chave do Pexels em Ajustes.");
  let resposta;
  try {
    const url = `https://api.pexels.com/v1/search?${new URLSearchParams({ query: consulta, page: pagina, per_page: 12, orientation: "landscape", locale: "pt-BR" })}`;
    resposta = await fetch(url, { headers: { Authorization: chave } });
  } catch {
    throw new ErroApp("Sem conexão com o Pexels. Verifique sua internet.");
  }
  if (resposta.status === 401 || resposta.status === 403) throw new ErroApp("Chave do Pexels inválida. Confira em Ajustes.");
  if (resposta.status === 429) throw new ErroApp("Limite de buscas do Pexels atingido. Tente mais tarde.");
  if (!resposta.ok) throw new ErroApp(`Erro do Pexels (${resposta.status}).`);
  const dados = await resposta.json();
  return {
    fotos: (dados.photos || []).map(f => ({
      miniatura: f.src?.medium, url: f.src?.landscape || f.src?.large, alt: f.alt || "",
      autor: f.photographer || "", autorUrl: f.photographer_url || "", paginaUrl: f.url || "",
    })).filter(f => /^https:\/\//.test(f.url || "") && /^https:\/\//.test(f.miniatura || "")),
    temMais: Boolean(dados.next_page),
  };
}

/** Abre a busca de fotos do Pexels. Resolve com a capa escolhida ou null. */
async function escolherFotoPexels(sugestao) {
  let consulta = sugestao;
  let pagina = 1;
  let fotos = [];
  while (true) {
    const { valor, campos } = await abrirDialogo({
      titulo: "Foto de capa (Pexels)",
      html: `
        <label class="campo"><span>Buscar fotos</span><input name="consulta" value="${esc(consulta)}" enterkeyhint="search"></label>
        ${fotos.length ? `<div class="grade-fotos">${fotos.map((f, i) => `
          <button type="button" class="foto" data-foto="${i}" aria-label="${esc(f.alt || `Foto de ${f.autor}`)}">
            <img src="${esc(f.miniatura)}" alt="" loading="lazy"><span>${esc(f.autor)}</span>
          </button>`).join("")}</div>
          <p class="pequeno suave">Fotos do <a href="https://www.pexels.com" target="_blank" rel="noopener">Pexels</a>. O crédito do fotógrafo entra no post.</p>` : ""}`,
      botoes: [
        { rotulo: "Cancelar", valor: null },
        fotos.length && pagina > 0 ? { rotulo: "Mais fotos", valor: "mais" } : null,
        { rotulo: "Buscar", valor: "buscar", primario: !fotos.length },
      ].filter(Boolean),
      aoAbrir: (folha, fechar) => {
        folha.querySelectorAll("[data-foto]").forEach(b => b.onclick = () => fechar({ foto: Number(b.dataset.foto) }));
        const campo = folha.querySelector('input[name="consulta"]');
        campo.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); fechar("buscar"); } });
      },
    });
    if (valor === null) return null;
    if (valor?.foto !== undefined) return { fonte: "pexels", ...fotos[valor.foto], miniatura: undefined };
    const novaConsulta = (campos.consulta || "").trim();
    if (!novaConsulta) { toast("Digite o que buscar.", "erro"); continue; }
    const maisDaMesma = valor === "mais" && novaConsulta === consulta;
    pagina = maisDaMesma ? pagina + 1 : 1;
    consulta = novaConsulta;
    carregando("Buscando fotos…");
    try {
      const resultado = await buscarPexels(consulta, pagina);
      fotos = maisDaMesma ? [...fotos, ...resultado.fotos] : resultado.fotos;
      if (!resultado.temMais) pagina = -1;
      if (!fotos.length) toast("Nenhuma foto encontrada. Tente outras palavras.", "erro");
    } catch (erro) {
      toast(erro.message, "erro");
    } finally {
      carregando(null);
    }
  }
}

const ESTILOS_IMAGEM = {
  "Foto realista": "fotografia realista, luz natural, alta qualidade",
  "Ilustração": "ilustração digital colorida e moderna",
  "3D": "renderização 3D suave, cores agradáveis",
  "Minimalista": "composição minimalista, poucas formas, fundo limpo",
};

async function gerarImagemIA(descricao, estilo) {
  const { geminiKey, modeloImagem } = cfg();
  if (!geminiKey) throw new ErroApp("Cadastre a chave do Gemini em Ajustes.");
  const modelo = modeloImagem || MODELO_IMAGEM_PADRAO;
  const dados = await chamarGemini(`${encodeURIComponent(modelo)}:generateContent`, {
    metodo: "POST",
    chave: geminiKey,
    timeoutMs: 180000,
    corpo: {
      contents: [{ role: "user", parts: [{ text: `Crie uma imagem de capa horizontal para um post de blog. Assunto: ${descricao}. Estilo: ${ESTILOS_IMAGEM[estilo] || estilo}. Sem textos, letras, marcas d'água ou logotipos na imagem.` }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "16:9" } },
    },
  });
  if (dados.promptFeedback?.blockReason) throw new ErroApp("O Gemini bloqueou esse pedido de imagem. Tente outra descrição.");
  const partes = dados.candidates?.[0]?.content?.parts || [];
  const imagem = partes.find(p => p.inlineData?.data || p.inline_data?.data);
  const inline = imagem?.inlineData || imagem?.inline_data;
  if (!inline) {
    const motivo = dados.candidates?.[0]?.finishReason;
    throw new ErroApp(motivo && motivo !== "STOP"
      ? `O Gemini não gerou a imagem (${motivo}). Tente outra descrição.`
      : "O Gemini não devolveu imagem. Confira o modelo de imagem em Ajustes.");
  }
  const tipo = inline.mimeType || inline.mime_type || "image/png";
  const bytes = Uint8Array.from(atob(inline.data), c => c.charCodeAt(0));
  return new Blob([bytes], { type: tipo });
}

/** Gera imagem com IA e oferece para baixar (o Blogger não aceita envio de imagens pela API). */
async function criarImagemIA(post) {
  let descricao = post.titulo || post.tema || "";
  let estilo = "Foto realista";
  let blob = null;
  let url = null;
  try {
    while (true) {
      const { valor, campos } = await abrirDialogo({
        titulo: "Imagem com IA",
        html: `
          <label class="campo"><span>Descreva a imagem</span><textarea name="descricao" rows="3">${esc(descricao)}</textarea></label>
          <div class="campo"><span>Estilo</span>${campoChips("estilo", Object.keys(ESTILOS_IMAGEM), estilo)}</div>
          ${url ? `<img class="imagem-gerada" src="${url}" alt="Imagem gerada">
          <p class="pequeno suave">A API do Blogger não recebe imagens. Baixe a imagem e adicione no editor do Blogger (ícone de imagem), de preferência no topo do post. Imagens do Gemini têm marca d'água invisível SynthID.</p>` : ""}`,
        botoes: [
          { rotulo: "Fechar", valor: null },
          { rotulo: url ? "Gerar outra" : "Gerar", valor: "gerar", primario: !url },
          url ? { rotulo: "Baixar", valor: "baixar", primario: true } : null,
        ].filter(Boolean),
      });
      if (valor === null) return;
      descricao = (campos.descricao || "").trim();
      estilo = campos.estilo || estilo;
      if (valor === "baixar") {
        const extensao = blob.type.includes("jpeg") ? "jpg" : "png";
        const a = Object.assign(document.createElement("a"), { href: url, download: `capa-${(post.titulo || "post").toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "post"}.${extensao}` });
        a.click();
        toast("Imagem baixada.", "ok");
        continue;
      }
      if (!descricao) { toast("Descreva a imagem.", "erro"); continue; }
      carregando("Criando a imagem… pode levar até 1 minuto");
      try {
        blob = await gerarImagemIA(descricao, estilo);
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

/* ---------------- Agendamento ---------------- */

function paraCampoDataHora(data) {
  const d = new Date(data.getTime() - data.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function formatarAgendamento(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }) + " às " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Pergunta data e hora do agendamento. Resolve com a data (Date) ou null. */
async function escolherDataAgendamento(atual) {
  const amanha = new Date(); amanha.setDate(amanha.getDate() + 1); amanha.setHours(9, 0, 0, 0);
  const inicial = atual && new Date(atual) > new Date() ? new Date(atual) : amanha;
  while (true) {
    const { valor, campos } = await abrirDialogo({
      titulo: "Agendar publicação",
      html: `
        <label class="campo"><span>Data e hora</span>
          <input type="datetime-local" name="quando" value="${paraCampoDataHora(inicial)}" min="${paraCampoDataHora(new Date())}">
        </label>
        <p class="pequeno suave">Horário deste aparelho. O Blogger publica sozinho na data escolhida, mesmo com o app fechado.</p>`,
      botoes: [{ rotulo: "Cancelar", valor: null }, { rotulo: "Agendar", valor: "ok", primario: true }],
    });
    if (!valor) return null;
    const quando = new Date(campos.quando);
    if (Number.isNaN(quando.getTime())) { toast("Escolha data e hora.", "erro"); continue; }
    if (quando.getTime() < Date.now() + 2 * 60000) { toast("Escolha um horário pelo menos 2 minutos no futuro.", "erro"); continue; }
    return quando;
  }
}
