"use strict";

/* =========================================================
   Blog Studio — app web estático (GitHub Pages)
   Gera posts com o Gemini e publica no Blogger.
   Tudo roda no navegador; chaves e posts ficam só neste aparelho.
   ========================================================= */

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const BLOGGER_URL = "https://www.googleapis.com/blogger/v3";
const BLOGGER_SCOPE = "https://www.googleapis.com/auth/blogger";
const MODELO_PADRAO = "gemini-3.8-flash";
const MODELOS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"];

const SISTEMA_BASE = `Você é um redator profissional de blogs. Escreva conteúdo original, útil e agradável de ler, em português do Brasil, a menos que o usuário peça outro idioma.

Regras gerais:
- Responda somente no formato JSON pedido.
- Campos terminados em "_html" usam apenas HTML simples: <p>, <h3>, <ul>/<ol>/<li>, <strong>, <em>, <blockquote>, <a href>. Não use <h1>, <h2>, <div>, estilos, classes nem scripts (a não ser que a categoria diga outra coisa): os títulos das seções e o visual são montados pelo aplicativo.
- Os demais campos de texto são texto puro, sem HTML e sem Markdown.
- Parágrafos curtos (2 a 4 frases), linguagem clara e específica. Evite frases genéricas como "Neste artigo vamos...", "No mundo de hoje..." ou "Em resumo...".
- Não invente dados, estatísticas, citações, estudos ou fontes. Quando algo depender de informação atual, oriente o leitor a confirmar.
- Use as palavras-chave de forma natural no título, na introdução e em pelo menos um subtítulo.
- Campos opcionais que não fizerem sentido para o post devem ficar vazios.`;

const TAMANHOS = { curto: "cerca de 400 palavras", medio: "cerca de 800 palavras", longo: "cerca de 1500 palavras" };
const TONS = ["Padrão", "Informal", "Profissional", "Didático", "Bem-humorado", "Inspirador"];

class ErroApp extends Error {
  constructor(mensagem, status) { super(mensagem); this.status = status; }
}

/* ---------------- Armazenamento local ---------------- */

const armazenamento = {
  ler(chave, padrao) {
    try {
      const valor = localStorage.getItem(chave);
      return valor === null ? padrao : JSON.parse(valor);
    } catch { return padrao; }
  },
  gravar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); return true; }
    catch { toast("Não foi possível salvar neste navegador (modo anônimo ou sem espaço).", "erro"); return false; }
  },
};

function cfg() {
  return {
    geminiKey: "", geminiModel: MODELO_PADRAO, clientId: "", blogId: "", blogNome: "", perfil: {},
    pexelsKey: "", modeloImagem: "", ...armazenamento.ler("bs.config", {}),
  };
}
function perfilBlog() {
  const c = cfg();
  const p = c.perfil || {};
  return {
    nomeBlog: p.nomeBlog || c.blogNome || "", autor: p.autor || "", publico: p.publico || "",
    tom: p.tom || "", regras: p.regras || "", rodape: p.rodape || "", cor: corValida(p.cor),
  };
}
function salvarConfig(parcial) { armazenamento.gravar("bs.config", { ...cfg(), ...parcial }); }

function listarPosts() {
  const posts = armazenamento.ler("bs.posts", []);
  return Array.isArray(posts) ? posts : [];
}
function gravarPosts(posts) { return armazenamento.gravar("bs.posts", posts); }
function obterPost(id) { return listarPosts().find(p => p.id === id) || null; }
function salvarPost(post) {
  post.atualizadoEm = new Date().toISOString();
  const posts = listarPosts();
  const i = posts.findIndex(p => p.id === post.id);
  if (i >= 0) posts[i] = post; else posts.push(post);
  return gravarPosts(posts);
}
function criarPost(dados = {}) {
  const agora = new Date().toISOString();
  const post = {
    id: novoId(), tema: "", titulo: "", conteudo: "", marcadores: [],
    status: "local", blogId: null, bloggerId: null, url: null,
    criadoEm: agora, atualizadoEm: agora, ...dados,
  };
  salvarPost(post);
  return post;
}
function excluirPost(id) { gravarPosts(listarPosts().filter(p => p.id !== id)); }
function novoId() {
  return (crypto.randomUUID && crypto.randomUUID()) || Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/* ---------------- Gemini ---------------- */

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

async function chamarGemini(caminho, { metodo = "GET", corpo, chave, timeoutMs = 30000 } = {}) {
  // "?..." lista os modelos (…/models?...); o resto é …/models/<modelo>:<ação>
  const url = caminho.startsWith("?") ? GEMINI_URL.slice(0, -1) + caminho : GEMINI_URL + caminho;
  const modelo = decodeURIComponent(caminho.split(/[:?]/)[0]) || "selecionado";
  for (let tentativa = 1; ; tentativa++) {
    let resposta;
    try {
      resposta = await fetch(url, {
        method: metodo,
        headers: { "x-goog-api-key": chave, ...(corpo ? { "Content-Type": "application/json" } : {}) },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
      });
    } catch (e) {
      if (e.name === "TimeoutError") throw new ErroApp(`O modelo ${modelo} demorou demais para responder. Tente de novo ou escolha outro modelo.`);
      throw new ErroApp("Sem conexão com a API do Gemini. Verifique sua internet.");
    }
    // Sobrecarga momentânea: tenta mais uma vez antes de desistir.
    if ((resposta.status === 503 || resposta.status === 500) && tentativa < 2) { await esperar(2000); continue; }

    const dados = await resposta.json().catch(() => ({}));
    if (resposta.ok) return dados;
    const msg = dados.error?.message || resposta.statusText;
    const detalhes = msg + JSON.stringify(dados.error?.details || "");
    if (resposta.status === 503 || resposta.status === 500)
      throw new ErroApp(`O modelo ${modelo} está sobrecarregado agora (muita demanda). Escolha outro modelo no seletor e tente de novo.`, resposta.status);
    if (resposta.status === 429)
      throw new ErroApp(`Limite de uso do modelo ${modelo} atingido. Aguarde um pouco ou escolha outro modelo no seletor.`, 429);
    if ([400, 401, 403].includes(resposta.status) && /API[ _]?key/i.test(detalhes))
      throw new ErroApp("Chave da API do Gemini inválida. Confira em Ajustes.", resposta.status);
    if (resposta.status === 404) throw new ErroApp(`Modelo ${modelo} não encontrado para a sua chave. Escolha outro no seletor.`, 404);
    throw new ErroApp(`Erro do Gemini (${resposta.status}): ${msg}`, resposta.status);
  }
}

/* ---------------- Lista de modelos ---------------- */

const MODELOS_IMAGEM_FIXOS = ["gemini-3.1-flash-image", "gemini-3.1-flash-lite-image", "gemini-3-pro-image", "gemini-2.5-flash-image"];
const NAO_SAO_DE_TEXTO = /embedding|aqa|tts|audio|live|robotics|computer-use|learnlm|veo|imagen|image/i;

/** Ordena do mais novo para o mais antigo, com as versões estáveis antes das prévias. */
function ordenarModelos(lista) {
  return lista.sort((a, b) =>
    Number(/preview|exp/i.test(a.id)) - Number(/preview|exp/i.test(b.id)) ||
    b.id.localeCompare(a.id, "en", { numeric: true }));
}

/** Busca na API os modelos disponíveis para a chave e guarda no aparelho. */
async function atualizarModelos(chave = cfg().geminiKey) {
  if (!chave) throw new ErroApp("Cadastre a chave do Gemini primeiro.");
  const dados = await chamarGemini("?pageSize=1000", { chave });
  const todos = (dados.models || [])
    .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
    .map(m => ({ id: String(m.name || "").replace(/^models\//, ""), nome: m.displayName || "" }))
    .filter(m => /^gemini-/.test(m.id));
  const texto = ordenarModelos(todos.filter(m => !NAO_SAO_DE_TEXTO.test(m.id)));
  const imagem = ordenarModelos(todos.filter(m => /image/i.test(m.id)));
  armazenamento.gravar("bs.modelos", { texto, imagem, quando: Date.now() });
  return { texto, imagem };
}

function listaModelos(tipo) {
  const salvo = armazenamento.ler("bs.modelos", null)?.[tipo];
  if (Array.isArray(salvo) && salvo.length) return salvo;
  return (tipo === "imagem" ? MODELOS_IMAGEM_FIXOS : MODELOS).map(id => ({ id, nome: "" }));
}

/** <select> de modelos; mantém o modelo atual na lista mesmo que a API não o liste. */
function seletorModelo(nome, tipo, atual) {
  const lista = listaModelos(tipo);
  const opcoes = lista.some(m => m.id === atual) ? lista : [{ id: atual, nome: "" }, ...lista];
  return `<select name="${esc(nome)}" aria-label="Modelo de IA">${opcoes.map(m =>
    `<option value="${esc(m.id)}" ${m.id === atual ? "selected" : ""}>${esc(m.nome && m.nome !== m.id ? `${m.nome} · ${m.id}` : m.id)}</option>`).join("")}</select>`;
}

/** Campo compacto para trocar o modelo de texto direto nas telas de geração. */
function campoModelo() {
  return `<label class="campo campo-modelo"><span>Modelo de IA</span>
    ${seletorModelo("modeloIa", "texto", cfg().geminiModel || MODELO_PADRAO)}
    <small>Se aparecer "sobrecarregado" ou "limite", troque o modelo aqui.</small></label>`;
}
function ligarCampoModelo(raiz) {
  const select = raiz.querySelector('select[name="modeloIa"]');
  select?.addEventListener("change", () => {
    salvarConfig({ geminiModel: select.value });
    toast(`Modelo: ${select.value}`);
  });
}

function testarGemini(chave, modelo) {
  return chamarGemini(encodeURIComponent(modelo), { chave });
}

function montarInstrucoes(cat, perfil) {
  const perfilTexto = [
    linhasPerfil(perfil),
    perfil.rodape && "- O aplicativo já adiciona uma mensagem de fechamento ao post; não crie outra chamada para comentar ou compartilhar.",
  ].filter(Boolean).join("\n");
  return [SISTEMA_BASE, perfilTexto && `Perfil do blog:\n${perfilTexto}`, cat.instrucoes].filter(Boolean).join("\n\n");
}

function linhasPerfil(perfil) {
  return [
    perfil.nomeBlog && `- Nome do blog: ${perfil.nomeBlog}`,
    perfil.autor && `- Quem escreve: ${perfil.autor}`,
    perfil.publico && `- Público do blog: ${perfil.publico}`,
    perfil.tom && `- Tom de voz padrão: ${perfil.tom}`,
    perfil.regras && `- Regras do blog (siga sempre):\n${perfil.regras}`,
  ].filter(Boolean).join("\n");
}

/** Descreve o pedido do formulário Criar em linhas de texto para a IA. */
function descreverPedido(entrada) {
  const cat = categoria(entrada.categoria);
  const esconder = new Set(cat.esconder || []);
  const partes = [`Tipo de post: ${cat.nome}`, `Tema do post: ${entrada.tema}`];
  for (const campo of cat.campos) if (entrada[campo.nome]) partes.push(`${campo.rotulo}: ${entrada[campo.nome]}`);
  if (!esconder.has("tamanho")) partes.push(`Tamanho: ${TAMANHOS[entrada.tamanho] || TAMANHOS.medio}`);
  if (!esconder.has("palavrasChave") && entrada.palavrasChave) partes.push(`Palavras-chave para incluir naturalmente (SEO): ${entrada.palavrasChave}`);
  if (!esconder.has("publico") && entrada.publico) partes.push(`Público-alvo: ${entrada.publico}`);
  if (!esconder.has("tom") && entrada.tom && entrada.tom !== "Padrão") partes.push(`Tom de voz: ${entrada.tom}`);
  if (entrada.instrucoes) partes.push(`Instruções adicionais: ${entrada.instrucoes}`);
  return partes;
}

/** Chama o Gemini pedindo JSON no schema informado e devolve o objeto já interpretado. */
/** Confere bloqueios e motivo de parada; devolve o candidato e o texto final (sem pensamentos). */
function lerResposta(dados) {
  if (dados.promptFeedback?.blockReason) throw new ErroApp("O Gemini bloqueou esse pedido. Tente reformular.");
  const candidato = dados.candidates?.[0];
  if (candidato?.finishReason === "MAX_TOKENS") throw new ErroApp("A resposta ficou longa demais e foi cortada. Tente um tamanho menor.");
  if (candidato?.finishReason && candidato.finishReason !== "STOP")
    throw new ErroApp(`O Gemini interrompeu a geração (${candidato.finishReason}). Tente reformular.`);
  const saida = (candidato?.content?.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join("").trim();
  return { candidato, saida };
}

async function gerarJson({ sistema, texto, schema, maxTokens = 32000, timeoutMs = 240000 }) {
  const { geminiKey, geminiModel } = cfg();
  if (!geminiKey) throw new ErroApp("Cadastre a chave do Gemini em Ajustes.");
  const dados = await chamarGemini(`${encodeURIComponent(geminiModel || MODELO_PADRAO)}:generateContent`, {
    metodo: "POST",
    chave: geminiKey,
    timeoutMs,
    corpo: {
      systemInstruction: { parts: [{ text: sistema }] },
      contents: [{ role: "user", parts: [{ text: texto }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, maxOutputTokens: maxTokens },
    },
  });

  const { saida } = lerResposta(dados);
  try {
    return JSON.parse(saida);
  } catch {
    throw new ErroApp("Resposta do Gemini em formato inesperado. Tente de novo.");
  }
}

const ESBOCO_SCHEMA = {
  type: "object",
  properties: {
    titulos: { type: "array", items: { type: "string" }, description: "3 opções de título bem diferentes entre si, até 70 caracteres" },
    abordagem: { type: "string", description: "1 a 2 frases: o ângulo do post e o que o leitor ganha ao ler" },
    topicos: {
      type: "array", description: "Tópicos na ordem em que aparecem no post",
      items: { type: "object", properties: { titulo: { type: "string" }, resumo: { type: "string", description: "Uma frase sobre o que o tópico cobre" } }, required: ["titulo", "resumo"] },
    },
  },
  required: ["titulos", "abordagem", "topicos"],
};

async function gerarEsboco(entrada) {
  const cat = categoria(entrada.categoria);
  const perfil = perfilBlog();
  const sistema = [
    `Você é o editor-chefe de um blog. Planeje um post antes de ele ser escrito: proponha 3 títulos, a abordagem e os tópicos.
- Títulos atraentes e específicos, sem clickbait enganoso e sem inventar números ou dados.
- A abordagem deve deixar claro o diferencial do post.
- Tópicos objetivos, sem repetição, cobrindo o que o leitor realmente precisa.
- Responda em português do Brasil, somente no formato JSON pedido, em texto puro (sem HTML).`,
    linhasPerfil(perfil) && `Perfil do blog:\n${linhasPerfil(perfil)}`,
    `Regras da categoria que o post vai seguir:\n${cat.instrucoes}`,
    cat.esbocoDica,
  ].filter(Boolean).join("\n\n");
  const dados = await gerarJson({ sistema, texto: descreverPedido(entrada).join("\n"), schema: ESBOCO_SCHEMA, maxTokens: 8192, timeoutMs: 120000 });
  const titulos = (dados.titulos || []).map(t => String(t).trim()).filter(Boolean).slice(0, 3);
  const topicos = (dados.topicos || []).map(t => ({ titulo: String(t?.titulo || "").trim(), resumo: String(t?.resumo || "").trim() })).filter(t => t.titulo);
  if (!titulos.length || !topicos.length) throw new ErroApp("O Gemini devolveu um esboço vazio. Tente de novo.");
  return { titulos, titulo: titulos[0], abordagem: String(dados.abordagem || "").trim(), topicos };
}

async function gerarPost(entrada, esboco = null) {
  const perfil = perfilBlog();
  const cat = categoria(entrada.categoria);
  const partes = descreverPedido(entrada);
  if (esboco) {
    partes.push("", "Esboço aprovado pelo autor (siga fielmente):",
      `Título (use exatamente este): ${esboco.titulo}`,
      esboco.abordagem && `Abordagem: ${esboco.abordagem}`,
      "Tópicos, nesta ordem (viram as seções, dicas ou partes do post):",
      ...esboco.topicos.map((t, i) => `${i + 1}. ${t.titulo}${t.resumo ? ` — ${t.resumo}` : ""}`));
  }
  const estruturado = await gerarJson({ sistema: montarInstrucoes(cat, perfil), texto: partes.filter(l => typeof l === "string").join("\n"), schema: cat.schema });
  const post = montarPost(entrada.categoria, estruturado, perfil, entrada);
  if (esboco?.titulo) post.titulo = esboco.titulo;
  if (!post.titulo || !post.conteudo.trim()) throw new ErroApp("O Gemini devolveu um post vazio. Tente de novo.");
  return { ...post, categoria: entrada.categoria, dados: estruturado };
}

const SISTEMA_CHECAGEM = `Você é um checador de fatos de um blog. Use a Pesquisa Google para verificar as afirmações objetivas do post: datas, versões, preços, especificações, nomes, números, requisitos, compatibilidade e lançamentos.
Hoje é {HOJE}. Considere desatualizado o que já mudou até hoje.

Responda em português do Brasil, em texto simples (sem Markdown, sem asteriscos), exatamente neste formato:

RESUMO: uma frase com a avaliação geral do post.

Depois, uma linha por afirmação checada, começando com um destes marcadores:
❌ INCORRETO: a afirmação — a correção, com a informação encontrada
⚠️ VERIFICAR: a afirmação — por que é incerta, ambígua ou pode estar desatualizada
✅ CONFIRMADO: a afirmação — o que a pesquisa mostrou

Liste primeiro os ❌, depois os ⚠️ e por último no máximo 5 ✅.
Não reescreva o post e não opine sobre estilo. Se o post não tiver afirmações que possam ser checadas, diga isso no RESUMO.`;

/** Texto do post com quebras de linha entre blocos, para a checagem. */
function textoDoPost(html) {
  const corpo = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
  corpo.querySelectorAll("p, li, h2, h3, h4, tr, pre, blockquote, div").forEach(el => el.after("\n"));
  corpo.querySelectorAll("td, th").forEach(el => el.after(" | "));
  return corpo.textContent.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

/**
 * Checa os fatos do post com a Pesquisa Google (Grounding).
 * Pelos termos do Gemini, o resultado só é mostrado a quem pediu, junto com as sugestões de busca,
 * sem modificar e sem salvar: por isso ele fica só na memória e nunca entra no post.
 */
async function checarFatos(post) {
  const { geminiKey, geminiModel } = cfg();
  if (!geminiKey) throw new ErroApp("Cadastre a chave do Gemini em Ajustes.");
  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const dados = await chamarGemini(`${encodeURIComponent(geminiModel || MODELO_PADRAO)}:generateContent`, {
    metodo: "POST",
    chave: geminiKey,
    timeoutMs: 180000,
    corpo: {
      systemInstruction: { parts: [{ text: SISTEMA_CHECAGEM.replace("{HOJE}", hoje) }] },
      contents: [{ role: "user", parts: [{ text: `Categoria: ${categoria(post.categoria).nome}\nTítulo: ${post.titulo || "(sem título)"}\n\nTexto do post:\n${textoDoPost(post.conteudo)}` }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 8192 },
    },
  });
  const { candidato, saida } = lerResposta(dados);
  if (!saida) throw new ErroApp("O Gemini não devolveu a checagem. Tente de novo.");
  const meta = candidato?.groundingMetadata || {};
  const fontes = [];
  for (const chunk of meta.groundingChunks || []) {
    const web = chunk?.web;
    if (web?.uri && /^https:\/\//i.test(web.uri) && !fontes.some(f => f.uri === web.uri)) fontes.push({ uri: web.uri, titulo: web.title || web.uri });
  }
  return {
    texto: saida,
    fontes,
    consultas: meta.webSearchQueries || [],
    sugestoesHtml: meta.searchEntryPoint?.renderedContent || "",
    pesquisou: Boolean(meta.webSearchQueries?.length || fontes.length),
    quando: new Date(),
  };
}

const PEDIDOS_REESCRITA = [
  { rotulo: "Mais curto", valor: "Deixe o trecho mais curto e direto (cerca de metade do tamanho), sem perder a informação principal." },
  { rotulo: "Mais detalhado", valor: "Desenvolva mais o trecho, com uma explicação mais completa e um exemplo prático." },
  { rotulo: "Mais simples", valor: "Reescreva com linguagem mais simples, para um leitor iniciante, explicando termos difíceis." },
  { rotulo: "Mais envolvente", valor: "Deixe o trecho mais envolvente e gostoso de ler, mantendo o tom do blog." },
  { rotulo: "Mais profissional", valor: "Deixe o trecho mais profissional e preciso, sem ficar frio." },
  { rotulo: "Corrigir português", valor: "Corrija ortografia, gramática e pontuação, mudando o mínimo possível." },
];

async function reescreverTrecho({ post, trecho, pedido, antes, depois, semTags }) {
  const perfil = perfilBlog();
  const sistema = [
    `Você é um editor de blog experiente. Reescreva APENAS o trecho enviado, atendendo ao pedido do autor.
- Mantenha o idioma, as informações corretas e os links.
- ${semTags
      ? "O trecho é texto sem tags HTML: devolva também texto sem tags."
      : "Mantenha a mesma estrutura HTML: as mesmas tags e os mesmos atributos style, alterando só o texto (e a quantidade de itens/parágrafos, se o pedido exigir)."}
- Não adicione títulos, introduções, conclusões nem comentários sobre a mudança.
- Não invente dados, números ou fontes; ao detalhar, use explicações e exemplos.
- O resultado precisa se encaixar no texto que vem antes e depois.`,
    linhasPerfil(perfil) && `Perfil do blog:\n${linhasPerfil(perfil)}`,
  ].filter(Boolean).join("\n\n");
  const texto = [
    `Post: ${post.titulo || "(sem título)"} — categoria ${categoria(post.categoria).nome}`,
    antes && `Texto logo antes do trecho (só contexto, não reescreva):\n${antes}`,
    depois && `Texto logo depois do trecho (só contexto, não reescreva):\n${depois}`,
    `Pedido: ${pedido}`,
    `Trecho a reescrever:\n${trecho}`,
  ].filter(Boolean).join("\n\n");
  const dados = await gerarJson({
    sistema, texto, maxTokens: 16000, timeoutMs: 120000,
    schema: { type: "object", properties: { trecho: { type: "string", description: "O trecho reescrito" } }, required: ["trecho"] },
  });
  const novo = String(dados.trecho || "").trim();
  if (!novo) throw new ErroApp("O Gemini devolveu um trecho vazio. Tente de novo.");
  return semTags ? esc(novo).replace(/\n+/g, " ") : limparHtml(novo, { manterEstilo: true, envolverP: false });
}

/* ---------------- Login Google (Google Identity Services) ---------------- */

let tokenClient = null;
let tokenClientId = null;
let pedidoToken = null;
let token = armazenamentoSessao("bs.token");

function armazenamentoSessao(chave, valor) {
  try {
    if (valor === undefined) return JSON.parse(sessionStorage.getItem(chave) || "null");
    if (valor === null) sessionStorage.removeItem(chave);
    else sessionStorage.setItem(chave, JSON.stringify(valor));
  } catch { /* sessão indisponível: o login só dura até recarregar */ }
  return null;
}

function tokenValido() { return token && Date.now() < token.expira - 60000; }

function prepararTokenClient() {
  const { clientId } = cfg();
  if (!clientId || !window.google?.accounts?.oauth2) return null;
  if (tokenClient && tokenClientId === clientId) return tokenClient;
  tokenClientId = clientId;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: BLOGGER_SCOPE,
    callback: (resposta) => {
      const pedido = pedidoToken; pedidoToken = null;
      if (!pedido) return;
      if (resposta.error) {
        return pedido.reject(new ErroApp(resposta.error === "access_denied"
          ? "O Google negou o acesso. Confira se seu e-mail está em “Usuários de teste” no Google Cloud."
          : `Falha no login do Google: ${resposta.error_description || resposta.error}`));
      }
      if (!google.accounts.oauth2.hasGrantedAllScopes(resposta, BLOGGER_SCOPE)) {
        return pedido.reject(new ErroApp("É preciso marcar a permissão de acesso ao Blogger na tela do Google."));
      }
      token = { valor: resposta.access_token, expira: Date.now() + Number(resposta.expires_in) * 1000 };
      armazenamentoSessao("bs.token", token);
      pedido.resolve(token.valor);
    },
    error_callback: (erro) => {
      const pedido = pedidoToken; pedidoToken = null;
      if (!pedido) return;
      pedido.reject(new ErroApp(erro.type === "popup_failed_to_open"
        ? "O navegador bloqueou a janela de login do Google. Permita pop-ups para este site."
        : "Login do Google cancelado."));
    },
  });
  return tokenClient;
}

/** Deve ser chamada direto no clique (antes de qualquer await), senão o navegador bloqueia o pop-up. */
function garantirToken({ escolherConta = false } = {}) {
  if (tokenValido() && !escolherConta) return Promise.resolve(token.valor);
  if (!cfg().clientId) return Promise.reject(new ErroApp("Cadastre o ID do cliente Google em Ajustes."));
  const cliente = prepararTokenClient();
  if (!cliente) return Promise.reject(new ErroApp("O login do Google ainda está carregando. Tente de novo em instantes."));
  return new Promise((resolve, reject) => {
    pedidoToken?.reject(new ErroApp("Login do Google cancelado."));
    pedidoToken = { resolve, reject };
    cliente.requestAccessToken({ prompt: escolherConta ? "select_account" : "" });
  });
}

function desconectarGoogle() {
  if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token.valor, () => {});
  token = null;
  armazenamentoSessao("bs.token", null);
}

/* ---------------- Blogger ---------------- */

async function chamarBlogger(tk, metodo, caminho, corpo) {
  let resposta;
  try {
    resposta = await fetch(BLOGGER_URL + caminho, {
      method: metodo,
      headers: { Authorization: `Bearer ${tk}`, ...(corpo ? { "Content-Type": "application/json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ErroApp("Sem conexão com o Blogger. Verifique sua internet.");
  }
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const msg = dados.error?.message || resposta.statusText;
    if (resposta.status === 401) {
      token = null; armazenamentoSessao("bs.token", null);
      throw new ErroApp("O login do Google expirou. Toque de novo para entrar.", 401);
    }
    if (resposta.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(msg + JSON.stringify(dados.error?.details || "")))
      throw new ErroApp("A Blogger API não está ativada no seu projeto do Google Cloud. Veja o passo 2 em Ajustes.", 403);
    throw new ErroApp(`Erro do Blogger (${resposta.status}): ${msg}`, resposta.status);
  }
  return dados;
}

async function listarBlogs(tk) {
  const dados = await chamarBlogger(tk, "GET", "/users/self/blogs");
  return (dados.items || []).map(b => ({ id: b.id, nome: b.name, url: b.url }));
}

const STATUS_BLOGGER = { DRAFT: "rascunho", SCHEDULED: "agendado", LIVE: "publicado" };

/**
 * Envia o post ao Blogger.
 * modo: "rascunho" | "publicar" (agora) | "agendar" (usa agendarPara) | "atualizar" (mantém o status atual)
 */
async function enviarPost(tk, post, modo, agendarPara = null) {
  const { blogId } = cfg();
  if (!blogId) throw new ErroApp("Escolha o blog em Ajustes antes de publicar.");
  const base = `/blogs/${encodeURIComponent(blogId)}/posts`;
  const corpo = { title: post.titulo, content: conteudoFinal(post), labels: post.marcadores };
  const acao = (id, nome, params = "") => chamarBlogger(tk, "POST", `${base}/${encodeURIComponent(id)}/${nome}${params}`);

  let r = null;
  if (post.bloggerId && post.blogId === blogId) {
    try {
      r = await chamarBlogger(tk, "PATCH", `${base}/${encodeURIComponent(post.bloggerId)}`, corpo);
    } catch (e) {
      if (e.status !== 404) throw e; // apagado no Blogger: cria de novo
    }
  }
  if (!r) {
    if (modo === "atualizar") modo = post.status === "agendado" && post.agendadoPara ? "agendar" : post.status === "publicado" ? "publicar" : "rascunho";
    if (modo === "agendar" && !agendarPara) agendarPara = new Date(post.agendadoPara);
    r = await chamarBlogger(tk, "POST", `${base}?isDraft=${modo !== "publicar"}`, corpo);
  }

  if (modo === "rascunho" && r.status !== "DRAFT") {
    r = await acao(r.id, "revert");
  } else if (modo === "publicar" && r.status !== "LIVE") {
    // Em post agendado, "publish" sem data manteria a data antiga: passa a hora atual.
    r = await acao(r.id, "publish", r.status === "SCHEDULED" ? `?publishDate=${encodeURIComponent(new Date().toISOString())}` : "");
  } else if (modo === "agendar") {
    if (r.status === "LIVE") r = await acao(r.id, "revert");
    r = await acao(r.id, "publish", `?publishDate=${encodeURIComponent(agendarPara.toISOString())}`);
  }

  const status = STATUS_BLOGGER[r.status] || "publicado";
  return {
    blogId, bloggerId: r.id, url: r.url || null, status,
    agendadoPara: status === "agendado" ? (r.published || agendarPara?.toISOString() || null) : null,
  };
}

/* ---------------- Utilidades de interface ---------------- */

const $ = (seletor, raiz = document) => raiz.querySelector(seletor);

let toastTimer;
function toast(mensagem, tipo = "") {
  const el = $("#toast");
  el.textContent = mensagem;
  el.className = `toast visivel ${tipo}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visivel"), tipo === "erro" ? 6000 : 3000);
}

function carregando(texto) {
  $("#carregando").hidden = !texto;
  if (texto) $("#carregando-texto").textContent = texto;
}

function abrirFolha(itens) {
  const fundo = $("#folha");
  const folha = $(".folha", fundo);
  folha.innerHTML = itens.map((item, i) => item === "-" ? "<hr>" :
    `<button type="button" data-i="${i}" class="${item.perigo ? "perigo" : ""}">${item.icone || ""}<span>${esc(item.rotulo)}</span></button>`).join("");
  fundo.hidden = false;
  return new Promise(resolve => {
    const fechar = (valor) => {
      fundo.hidden = true;
      fundo.onclick = null;
      document.removeEventListener("keydown", teclado);
      resolve(valor);
    };
    const teclado = (e) => { if (e.key === "Escape") fechar(null); };
    document.addEventListener("keydown", teclado);
    fundo.onclick = (e) => {
      const botao = e.target.closest("button[data-i]");
      if (botao) fechar(itens[Number(botao.dataset.i)].valor);
      else if (e.target === fundo) fechar(null);
    };
    $("button", folha)?.focus();
  });
}

/** Folha com conteúdo livre e botões. Resolve com { valor, campos } (campos = valores dos inputs com name). */
function abrirDialogo({ titulo, html = "", botoes, aoAbrir }) {
  const fundo = $("#folha");
  const folha = $(".folha", fundo);
  folha.innerHTML = `<div class="dialogo">
    ${titulo ? `<h2>${esc(titulo)}</h2>` : ""}
    <div class="dialogo-corpo">${html}</div>
    <div class="dialogo-botoes">${botoes.map((b, i) =>
      `<button type="button" class="btn ${b.primario ? "primario" : ""} ${b.perigo ? "perigo" : ""}" data-i="${i}">${esc(b.rotulo)}</button>`).join("")}</div>
  </div>`;
  fundo.hidden = false;
  return new Promise(resolve => {
    const fechar = (valor) => {
      const campos = Object.fromEntries([...folha.querySelectorAll("[name]")]
        .filter(el => !((el.type === "radio" || el.type === "checkbox") && !el.checked))
        .map(el => [el.name, el.value]));
      fundo.hidden = true;
      fundo.onclick = null;
      document.removeEventListener("keydown", teclado);
      resolve({ valor, campos });
    };
    const teclado = (e) => { if (e.key === "Escape") fechar(null); };
    document.addEventListener("keydown", teclado);
    fundo.onclick = (e) => {
      const botao = e.target.closest("button[data-i]");
      if (botao) fechar(botoes[Number(botao.dataset.i)].valor);
      else if (e.target === fundo) fechar(null);
    };
    aoAbrir?.(folha, fechar);
    (folha.querySelector("textarea, input:not([type=radio]):not([type=checkbox])") || folha.querySelector(".dialogo-botoes .primario"))?.focus();
  });
}

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); toast("Copiado!", "ok"); }
  catch { prompt("Copie o texto abaixo:", texto); }
}

function formatarData(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) + " · " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const ICONES = {
  mais: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
  brilho: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/></svg>',
  enviar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg>',
  rascunho: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>',
  copiar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>',
  lixo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  relogio: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  lupa: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>',
  doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7M9 7h4"/></svg>',
  blog: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h6M7 13h10M7 17h8"/></svg>',
  subir: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  descer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  desfazer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
};

/* ---------------- Navegação ---------------- */

let aoSairDaTela = null;
let salvarPendente = null;

function montar({ titulo, aba, voltar = null, acoesTopo = "", html, barraAcoes = "" }) {
  salvarPendente = null;
  if (aoSairDaTela) { const f = aoSairDaTela; aoSairDaTela = null; f(); }
  document.title = titulo === "Blog Studio" ? titulo : `${titulo} · Blog Studio`;
  $("#titulo-tela").textContent = titulo;
  const botaoVoltar = $("#voltar");
  botaoVoltar.hidden = !voltar;
  botaoVoltar.onclick = () => { location.hash = voltar; };
  $("#acoes-topo").innerHTML = acoesTopo;
  const main = $("#tela");
  main.className = barraAcoes ? "com-barra-acoes" : "";
  main.innerHTML = html + (barraAcoes ? `<div class="barra-acoes"><div>${barraAcoes}</div></div>` : "");
  document.querySelectorAll(".tabbar a").forEach(a => a.classList.toggle("ativa", a.dataset.aba === aba));
  window.scrollTo(0, 0);
  return main;
}

function rota() {
  const [nome, parametro] = location.hash.replace(/^#\/?/, "").split("/");
  const telas = { posts: telaPosts, novo: telaNovo, esboco: telaEsboco, ideias: telaIdeias, post: telaEditor, ajustes: telaAjustes };
  (telas[nome] || telaPosts)(parametro ? decodeURIComponent(parametro) : undefined);
}

/* ---------------- Tela: Posts ---------------- */

let filtroCategoria = "";

function telaPosts() {
  const c = cfg();
  const posts = listarPosts().sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
  const usadas = ORDEM_CATEGORIAS.filter(id => posts.some(p => (p.categoria || "geral") === id));
  if (!usadas.includes(filtroCategoria)) filtroCategoria = "";
  const avisos = [
    !c.geminiKey && `Para gerar posts com IA, cadastre a chave do Gemini em <a href="#/ajustes">Ajustes</a>.`,
    !c.blogId && `Para publicar, conecte o Blogger em <a href="#/ajustes">Ajustes</a>.`,
  ].filter(Boolean).map(t => `<div class="aviso">${t}</div>`).join("");

  const lista = posts.length ? `
    ${posts.length > 5 ? `<input type="search" class="busca" id="busca" placeholder="Buscar posts…" aria-label="Buscar posts">` : ""}
    ${usadas.length > 1 ? `<div class="filtros" role="group" aria-label="Filtrar por categoria">
      <button type="button" data-filtro="" class="${filtroCategoria ? "" : "ativo"}">Todas</button>
      ${usadas.map(id => `<button type="button" data-filtro="${id}" class="${filtroCategoria === id ? "ativo" : ""}">${CATEGORIAS[id].icone} ${esc(CATEGORIAS[id].nome)}</button>`).join("")}
    </div>` : ""}
    <ul class="lista" id="lista">
      ${posts.map(p => `
        <li data-busca="${esc((p.titulo + " " + p.tema).toLowerCase())}" data-categoria="${esc(p.categoria || "geral")}">
          <a href="#/post/${encodeURIComponent(p.id)}" class="${p.capa?.url ? "com-capa" : ""}">
            ${p.capa?.url ? `<img class="miniatura" src="${esc(p.capa.url)}" alt="" loading="lazy">` : ""}
            <strong>${esc(p.titulo || "(sem título)")}</strong>
            <span class="meta"><span class="selo ${p.status}">${esc(p.status)}</span><span>${categoria(p.categoria).icone} ${esc(categoria(p.categoria).nome)}</span><span>${formatarData(p.atualizadoEm)}</span></span>
          </a>
        </li>`).join("")}
    </ul>` : `
    <div class="vazio">
      ${ICONES.doc}
      <h2>Nenhum post ainda</h2>
      <p>Crie seu primeiro post com a ajuda da IA.</p>
      <a class="btn primario" href="#/novo">${ICONES.brilho} Criar post</a>
    </div>`;

  const main = montar({
    titulo: "Meus posts", aba: "posts",
    acoesTopo: `<button class="icone-btn" id="escrever" aria-label="Escrever do zero" title="Escrever do zero">${ICONES.mais}</button>`,
    html: avisos + lista,
  });

  $("#escrever").onclick = () => { location.hash = `#/post/${criarPost().id}`; };
  const filtrar = () => {
    const termo = ($("#busca", main)?.value || "").trim().toLowerCase();
    main.querySelectorAll("#lista li").forEach(li => {
      li.hidden = Boolean((termo && !li.dataset.busca.includes(termo)) || (filtroCategoria && li.dataset.categoria !== filtroCategoria));
    });
    main.querySelectorAll("[data-filtro]").forEach(b => b.classList.toggle("ativo", b.dataset.filtro === filtroCategoria));
  };
  $("#busca", main)?.addEventListener("input", filtrar);
  main.querySelectorAll("[data-filtro]").forEach(b => b.onclick = () => { filtroCategoria = b.dataset.filtro; filtrar(); });
  filtrar();
}

/* ---------------- Tela: Criar ---------------- */

let formularioNovo = {
  categoria: armazenamento.ler("bs.ultimaCategoria", "tecnologia"),
  tema: "", palavrasChave: "", publico: "", tom: "Padrão", tamanho: "medio", instrucoes: "",
};

function campoChips(nome, opcoes, valor) {
  return `<div class="chips">${opcoes.map(o =>
    `<label><input type="radio" name="${esc(nome)}" value="${esc(o)}" ${o === valor ? "checked" : ""}><span>${esc(o)}</span></label>`).join("")}</div>`;
}

function telaNovo() {
  const f = formularioNovo;
  if (!CATEGORIAS[f.categoria]) f.categoria = "geral";
  const cat = CATEGORIAS[f.categoria];
  const esconder = new Set(cat.esconder || []);

  const camposCategoria = cat.campos.map(campo => {
    if (campo.tipo === "chips") {
      const valor = campo.opcoes.includes(f[campo.nome]) ? f[campo.nome] : (campo.padrao ?? campo.opcoes[0]);
      return `<div class="campo"><span>${esc(campo.rotulo)}</span>${campoChips(campo.nome, campo.opcoes, valor)}</div>`;
    }
    return `<label class="campo"><span>${esc(campo.rotulo)}</span>
      <input name="${esc(campo.nome)}" value="${esc(f[campo.nome] || "")}" placeholder="${esc(campo.placeholder || "")}"></label>`;
  }).join("");

  const main = montar({
    titulo: "Criar post", aba: "novo",
    html: `
      <a class="btn largo atalho-ideias" href="#/ideias">💡 Sem ideia? Ver sugestões de pauta</a>
      <div class="categorias" role="radiogroup" aria-label="Tipo de post">
        ${ORDEM_CATEGORIAS.map(id => `<label><input type="radio" name="categoria" value="${id}" ${id === f.categoria ? "checked" : ""}>
          <span><b class="emoji" aria-hidden="true">${CATEGORIAS[id].icone}</b>${esc(CATEGORIAS[id].nome)}</span></label>`).join("")}
      </div>
      <form id="form-novo" class="cartao" novalidate>
        <label class="campo"><span>Sobre o que é o post? *</span>
          <textarea name="tema" rows="3" required placeholder="${esc(cat.exemploTema)}">${esc(f.tema)}</textarea>
        </label>
        ${camposCategoria}
        ${esconder.has("palavrasChave") ? "" : `<label class="campo"><span>Palavras-chave</span>
          <input name="palavrasChave" value="${esc(f.palavrasChave)}" placeholder="Separadas por vírgula" autocapitalize="off"></label>`}
        ${esconder.has("publico") ? "" : `<label class="campo"><span>Público-alvo</span>
          <input name="publico" value="${esc(f.publico)}" placeholder="${esc(perfilBlog().publico || "Ex.: iniciantes, pais, estudantes")}"></label>`}
        ${esconder.has("tom") ? "" : `<div class="campo"><span>Tom de voz</span>${campoChips("tom", TONS, f.tom)}</div>`}
        ${esconder.has("tamanho") ? "" : `<div class="campo"><span>Tamanho</span>
          <div class="segmentado">
            ${[["curto", "Curto"], ["medio", "Médio"], ["longo", "Longo"]].map(([v, r]) =>
              `<label><input type="radio" name="tamanho" value="${v}" ${v === f.tamanho ? "checked" : ""}><span>${r}</span></label>`).join("")}
          </div>
          <small>Curto ≈ 400 · Médio ≈ 800 · Longo ≈ 1500 palavras</small>
        </div>`}
        <label class="campo"><span>Instruções extras</span>
          <textarea name="instrucoes" rows="2" placeholder="Algo específico que o post precisa ter?">${esc(f.instrucoes)}</textarea>
        </label>
        ${campoModelo()}
        <label class="interruptor">
          <span><strong>Revisar esboço antes</strong><small>Escolha o título e ajuste os tópicos antes de escrever</small></span>
          <input type="checkbox" id="usar-esboco" ${usarEsboco() ? "checked" : ""}>
        </label>
        <button type="button" class="btn texto largo" id="do-zero">ou escrever do zero</button>
      </form>`,
    barraAcoes: `<button class="btn primario" id="gerar" form="form-novo" type="submit">${ICONES.brilho} <span id="rotulo-gerar">${usarEsboco() ? "Criar esboço" : "Gerar com IA"}</span></button>`,
  });
  ligarCampoModelo(main);
  $("#usar-esboco", main).addEventListener("change", (e) => {
    armazenamento.gravar("bs.usarEsboco", e.target.checked);
    $("#rotulo-gerar", main).textContent = e.target.checked ? "Criar esboço" : "Gerar com IA";
  });

  const form = $("#form-novo", main);
  const lerFormulario = () => {
    for (const [chave, valor] of new FormData(form)) if (chave !== "modeloIa") formularioNovo[chave] = String(valor).trim();
  };
  form.addEventListener("input", lerFormulario);
  form.addEventListener("change", lerFormulario);
  lerFormulario(); // registra os valores padrão dos chips
  main.querySelectorAll('input[name="categoria"]').forEach(r => r.addEventListener("change", () => {
    lerFormulario();
    formularioNovo.categoria = r.value;
    armazenamento.gravar("bs.ultimaCategoria", r.value);
    const y = window.scrollY;
    telaNovo();
    window.scrollTo(0, y);
  }));
  $("#do-zero", main).onclick = () => { location.hash = `#/post/${criarPost({ categoria: formularioNovo.categoria }).id}`; };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    lerFormulario();
    if (!formularioNovo.tema) { toast("Conte sobre o que é o post.", "erro"); form.tema.focus(); return; }
    if (!cfg().geminiKey) { toast("Cadastre a chave do Gemini em Ajustes.", "erro"); return; }
    const entrada = { ...formularioNovo };
    if (usarEsboco()) {
      carregando("Planejando o post…");
      try {
        salvarEsboco({ entrada, ...(await gerarEsboco(entrada)) });
        location.hash = "#/esboco";
      } catch (erro) {
        toast(erro instanceof ErroApp ? erro.message : `Erro inesperado: ${erro.message}`, "erro");
      } finally {
        carregando(null);
      }
      return;
    }
    carregando(`Escrevendo seu post de ${categoria(entrada.categoria).nome.toLowerCase()}… pode levar até 1 minuto`);
    try {
      const gerado = await gerarPost(entrada);
      const post = criarPost({ ...gerado, tema: entrada.tema });
      formularioNovo = { ...formularioNovo, tema: "", instrucoes: "" };
      location.hash = `#/post/${post.id}`;
      toast("Post gerado! Revise antes de publicar.", "ok");
    } catch (erro) {
      toast(erro instanceof ErroApp ? erro.message : `Erro inesperado: ${erro.message}`, "erro");
    } finally {
      carregando(null);
    }
  });
}

/* ---------------- Tela: Esboço ---------------- */

function usarEsboco() { return armazenamento.ler("bs.usarEsboco", true) !== false; }
function lerEsboco() { return armazenamento.ler("bs.esboco", null); }
function salvarEsboco(esboco) { armazenamento.gravar("bs.esboco", esboco); }

function telaEsboco() {
  const esboco = lerEsboco();
  if (!esboco?.entrada) { location.replace("#/novo"); return; }
  const cat = categoria(esboco.entrada.categoria);

  const main = montar({
    titulo: "Esboço", aba: "novo", voltar: "#/novo",
    html: `
      <p class="pequeno suave esboco-pedido">${cat.icone} ${esc(cat.nome)} · ${esc(esboco.entrada.tema)}</p>
      <section class="cartao">
        <h2>Título</h2>
        <div class="opcoes-titulo">
          ${esboco.titulos.map((t, i) => `<label><input type="radio" name="opcao-titulo" value="${i}" ${t === esboco.titulo ? "checked" : ""}><span>${esc(t)}</span></label>`).join("")}
        </div>
        <label class="campo"><span>Título escolhido (pode editar)</span>
          <input id="titulo-esboco" value="${esc(esboco.titulo)}">
        </label>
      </section>
      <section class="cartao">
        <h2>Abordagem</h2>
        <textarea id="abordagem" rows="3" aria-label="Abordagem">${esc(esboco.abordagem)}</textarea>
      </section>
      <section class="cartao">
        <h2>Tópicos</h2>
        <p class="pequeno suave">O post vai seguir esta ordem. Edite, reordene, apague ou adicione.</p>
        <ol class="topicos" id="topicos"></ol>
        <button type="button" class="btn largo" id="adicionar-topico">${ICONES.mais} Adicionar tópico</button>
      </section>
      <section class="cartao">${campoModelo()}</section>`,
    barraAcoes: `
      <button class="btn" id="novo-esboco">Refazer</button>
      <button class="btn primario" id="escrever-post">${ICONES.brilho} Escrever post</button>`,
  });

  ligarCampoModelo(main);
  const lista = $("#topicos", main);
  const gravar = () => salvarEsboco(esboco);
  const renderTopicos = (foco) => {
    lista.innerHTML = esboco.topicos.map((t, i) => `
      <li data-i="${i}">
        <div class="topico-campos">
          <input data-campo="titulo" value="${esc(t.titulo)}" placeholder="Título do tópico" aria-label="Título do tópico ${i + 1}">
          <textarea data-campo="resumo" rows="2" placeholder="Sobre o que é este tópico (opcional)" aria-label="Resumo do tópico ${i + 1}">${esc(t.resumo)}</textarea>
        </div>
        <div class="topico-acoes">
          <button type="button" class="icone-btn" data-acao="subir" aria-label="Subir" ${i === 0 ? "disabled" : ""}>${ICONES.subir}</button>
          <button type="button" class="icone-btn" data-acao="descer" aria-label="Descer" ${i === esboco.topicos.length - 1 ? "disabled" : ""}>${ICONES.descer}</button>
          <button type="button" class="icone-btn perigo" data-acao="remover" aria-label="Remover">${ICONES.lixo}</button>
        </div>
      </li>`).join("");
    if (foco !== undefined) lista.querySelector(`li[data-i="${foco}"] input`)?.focus();
  };
  renderTopicos();

  lista.addEventListener("input", (e) => {
    const li = e.target.closest("li[data-i]");
    if (!li || !e.target.dataset.campo) return;
    esboco.topicos[Number(li.dataset.i)][e.target.dataset.campo] = e.target.value;
    gravar();
  });
  lista.addEventListener("click", (e) => {
    const botao = e.target.closest("button[data-acao]");
    if (!botao) return;
    const i = Number(botao.closest("li").dataset.i);
    const t = esboco.topicos;
    if (botao.dataset.acao === "subir" && i > 0) [t[i - 1], t[i]] = [t[i], t[i - 1]];
    if (botao.dataset.acao === "descer" && i < t.length - 1) [t[i + 1], t[i]] = [t[i], t[i + 1]];
    if (botao.dataset.acao === "remover") t.splice(i, 1);
    gravar();
    renderTopicos();
  });
  $("#adicionar-topico", main).onclick = () => {
    esboco.topicos.push({ titulo: "", resumo: "" });
    gravar();
    renderTopicos(esboco.topicos.length - 1);
  };

  const campoTitulo = $("#titulo-esboco", main);
  main.querySelectorAll('input[name="opcao-titulo"]').forEach(r => r.addEventListener("change", () => {
    esboco.titulo = esboco.titulos[Number(r.value)];
    campoTitulo.value = esboco.titulo;
    gravar();
  }));
  campoTitulo.addEventListener("input", () => {
    esboco.titulo = campoTitulo.value;
    main.querySelectorAll('input[name="opcao-titulo"]').forEach(r => { r.checked = esboco.titulos[Number(r.value)] === esboco.titulo; });
    gravar();
  });
  $("#abordagem", main).addEventListener("input", (e) => { esboco.abordagem = e.target.value; gravar(); });

  $("#novo-esboco", main).onclick = async () => {
    if (!confirm("Gerar um novo esboço? As mudanças feitas neste serão perdidas.")) return;
    carregando("Planejando de novo…");
    try {
      salvarEsboco({ entrada: esboco.entrada, ...(await gerarEsboco(esboco.entrada)) });
      telaEsboco();
      toast("Novo esboço pronto.", "ok");
    } catch (erro) {
      toast(erro instanceof ErroApp ? erro.message : `Erro inesperado: ${erro.message}`, "erro");
    } finally {
      carregando(null);
    }
  };

  $("#escrever-post", main).onclick = async () => {
    const final = {
      titulo: esboco.titulo.trim(),
      abordagem: esboco.abordagem.trim(),
      topicos: esboco.topicos.map(t => ({ titulo: t.titulo.trim(), resumo: t.resumo.trim() })).filter(t => t.titulo),
    };
    if (!final.titulo) { toast("Escolha ou escreva um título.", "erro"); campoTitulo.focus(); return; }
    if (!final.topicos.length) { toast("Adicione pelo menos um tópico.", "erro"); return; }
    carregando(`Escrevendo seu post de ${cat.nome.toLowerCase()}… pode levar até 1 minuto`);
    try {
      const gerado = await gerarPost(esboco.entrada, final);
      const post = criarPost({ ...gerado, tema: esboco.entrada.tema, esboco: final });
      armazenamento.gravar("bs.esboco", null);
      formularioNovo = { ...formularioNovo, tema: "", instrucoes: "" };
      location.hash = `#/post/${post.id}`;
      toast("Post escrito! Revise antes de publicar.", "ok");
    } catch (erro) {
      toast(erro instanceof ErroApp ? erro.message : `Erro inesperado: ${erro.message}`, "erro");
    } finally {
      carregando(null);
    }
  };
}

/* ---------------- Checagem de fatos: exibição ---------------- */

/** Resultados da checagem ficam só na memória desta sessão (não são salvos nem publicados). */
const checagens = new Map();

function htmlChecagem(c) {
  const classeLinha = (linha) =>
    /^\s*❌/.test(linha) ? "linha-erro" : /^\s*⚠/.test(linha) ? "linha-aviso" : /^\s*✅/.test(linha) ? "linha-ok" : /^\s*RESUMO/i.test(linha) ? "linha-resumo" : "";
  const linhas = c.texto.split("\n").filter(l => l.trim())
    .map(l => `<div class="linha-checagem ${classeLinha(l)}">${esc(l)}</div>`).join("");
  // As sugestões de busca vêm prontas do Google (HTML + CSS) e são exigidas pelos termos.
  // Ficam num iframe isolado; os links abrem direto no Google, em outra aba.
  const sugestoes = c.sugestoesHtml
    ? `<p class="rotulo-comparar">Sugestões de busca do Google</p>
       <iframe class="sugestoes-google" sandbox="allow-popups allow-popups-to-escape-sandbox" title="Sugestões de busca do Google"
         srcdoc="${esc(`<base target="_blank">${c.sugestoesHtml}`)}"></iframe>`
    : "";
  const fontes = c.fontes.length
    ? `<p class="rotulo-comparar">Fontes encontradas (${c.fontes.length})</p>
       <ol class="fontes">${c.fontes.map(f => `<li><a href="${esc(f.uri)}" target="_blank" rel="noopener">${esc(f.titulo)}</a></li>`).join("")}</ol>`
    : "";
  return `<div class="checagem">
    <p class="pequeno suave">Pesquisado às ${c.quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Resultado só para você: não é salvo e não entra no post. Corrija o texto você mesmo (o botão ✨ ajuda).</p>
    ${c.pesquisou ? "" : `<div class="aviso">O Gemini respondeu sem fazer buscas no Google. Trate este resultado com cautela.</div>`}
    ${sugestoes}
    <div class="checagem-texto">${linhas}</div>
    ${fontes}
  </div>`;
}

/* ---------------- Tela: Editor ---------------- */

let modoEditor = "editar";

function telaEditor(id) {
  const post = obterPost(id);
  if (!post) { toast("Post não encontrado.", "erro"); location.replace("#/posts"); return; }

  const publicado = post.status === "publicado";
  const main = montar({
    titulo: "Editar post", aba: "posts", voltar: "#/posts",
    acoesTopo: `<button class="icone-btn" id="menu-post" aria-label="Mais opções">${ICONES.menu}</button>`,
    html: `
      <div class="editor-meta">
        <span class="selo ${post.status}">${esc(post.status)}</span>
        <span>${categoria(post.categoria).icone} ${esc(categoria(post.categoria).nome)}</span>
        ${post.url && publicado ? `<a href="${esc(post.url)}" target="_blank" rel="noopener">Ver no blog</a>` : ""}
        ${post.status === "agendado" && post.agendadoPara ? `<span>🕒 ${esc(formatarAgendamento(post.agendadoPara))}</span>` : ""}
        <span class="salvo" id="salvo">Salvo neste aparelho</span>
      </div>
      ${categoria(post.categoria).aviso ? `<div class="aviso aviso-checar">
        ${post.status !== "publicado" ? `<p>⚠️ ${esc(categoria(post.categoria).aviso)}</p>` : ""}
        <button type="button" class="btn largo" id="checar-fatos">${ICONES.lupa} Checar fatos na internet</button>
      </div>` : ""}
      <label class="campo"><span>Título</span>
        <input id="titulo" class="titulo-post" value="${esc(post.titulo)}" placeholder="Título do post">
      </label>
      <label class="campo"><span>Marcadores</span>
        <input id="marcadores" value="${esc(separarMarcadores(post.marcadores.join(",")).join(", "))}" placeholder="separados por vírgula" autocapitalize="off">
        <small>Vírgula separa marcadores. Dentro de parênteses ela vira “/” (o Blogger não aceita vírgula no nome).</small>
      </label>
      <div class="campo campo-descricao">
        <label for="descricao"><span>Descrição de pesquisa (SEO)</span><span class="contador" id="contador-descricao"></span></label>
        <textarea id="descricao" rows="3" maxlength="300" placeholder="Resumo de 120 a 155 caracteres que aparece no Google e ao compartilhar o link">${esc(post.descricao || "")}</textarea>
        <div class="acoes-descricao">
          <button type="button" class="btn" id="copiar-descricao">${ICONES.copiar} Copiar</button>
          <button type="button" class="btn" id="gerar-descricao">${ICONES.brilho} ${post.descricao ? "Refazer" : "Gerar com IA"}</button>
          ${post.bloggerId && post.blogId ? `<a class="btn" href="https://www.blogger.com/blog/post/edit/${encodeURIComponent(post.blogId)}/${encodeURIComponent(post.bloggerId)}" target="_blank" rel="noopener">${ICONES.link} Abrir no Blogger</a>` : ""}
        </div>
        <small>A API do Blogger não recebe este campo. Depois de enviar, abra o post no Blogger e cole em <strong>Configurações da postagem → Descrição de pesquisa</strong>. É ele que preenche o <code>og:description</code>.</small>
      </div>
      <div class="capa-editor">
        ${post.capa?.url ? `
          <img src="${esc(post.capa.url)}" alt="">
          <div class="capa-info">
            <label class="campo"><span>Texto alternativo da capa</span>
              <input id="capa-alt" value="${esc(post.capa.alt || "")}" placeholder="Descreva a imagem"></label>
            ${post.capa.autor ? `<p class="pequeno suave">Foto: ${esc(post.capa.autor)} / Pexels</p>` : ""}
            <div class="botoes"><button type="button" class="btn" id="capa-trocar">Trocar capa</button><button type="button" class="btn perigo" id="capa-remover">Remover</button></div>
          </div>` : `
          <button type="button" class="btn largo" id="capa-trocar">🖼️ Adicionar imagem de capa</button>`}
      </div>
      <div class="editor-ferramentas">
        <div class="segmentado editor-modo" role="tablist">
          <button type="button" role="tab" data-modo="editar">Editar HTML</button>
          <button type="button" role="tab" data-modo="visualizar">Visualizar</button>
        </div>
        <button type="button" class="icone-btn ferramenta" id="desfazer" aria-label="Desfazer reescrita" title="Desfazer reescrita" hidden>${ICONES.desfazer}</button>
        <button type="button" class="icone-btn ferramenta destaque" id="reescrever" aria-label="Reescrever trecho com IA" title="Reescrever trecho com IA">${ICONES.brilho}</button>
      </div>
      <textarea id="conteudo" aria-label="Conteúdo em HTML" placeholder="Escreva o conteúdo em HTML…">${esc(post.conteudo)}</textarea>
      <iframe id="previa" class="previa" sandbox title="Pré-visualização"></iframe>`,
    barraAcoes: `
      <button class="btn" id="rascunho">${ICONES.rascunho}${publicado || post.status === "agendado" ? "Despublicar" : "Rascunho"}</button>
      <button class="btn primario" id="publicar">${post.status === "agendado" ? "🕒 Agendado" : `${ICONES.enviar}${publicado ? "Atualizar" : "Publicar"}`}</button>`,
  });

  const campos = { titulo: $("#titulo", main), marcadores: $("#marcadores", main), descricao: $("#descricao", main), conteudo: $("#conteudo", main) };
  const previa = $("#previa", main);
  const indicador = $("#salvo", main);

  const aplicarModo = () => {
    main.querySelectorAll("[data-modo]").forEach(b => {
      b.classList.toggle("ativo", b.dataset.modo === modoEditor);
      b.setAttribute("aria-selected", b.dataset.modo === modoEditor);
    });
    campos.conteudo.hidden = modoEditor !== "editar";
    previa.hidden = modoEditor !== "visualizar";
    if (modoEditor === "visualizar") {
      previa.srcdoc = `<meta name="viewport" content="width=device-width,initial-scale=1"><style>
        body{font:17px/1.65 Georgia,serif;color:#222;margin:0;padding:16px;overflow-wrap:anywhere}
        h1,h2,h3{font-family:system-ui,sans-serif;line-height:1.25}img{max-width:100%;height:auto}</style>
        <h1>${esc(campos.titulo.value)}</h1>${capaHtml(post.capa)}${campos.conteudo.value}`;
    }
  };
  main.querySelectorAll("[data-modo]").forEach(b => b.onclick = () => { modoEditor = b.dataset.modo; aplicarModo(); });
  aplicarModo();

  let timer = null;
  const salvarAgora = () => {
    clearTimeout(timer); timer = null;
    Object.assign(post, {
      titulo: campos.titulo.value.trim(),
      conteudo: campos.conteudo.value,
      marcadores: separarMarcadores(campos.marcadores.value),
      descricao: campos.descricao.value.replace(/\s+/g, " ").trim(),
    });
    if (salvarPost(post)) indicador.textContent = "Salvo neste aparelho";
  };
  // Ouve os próprios campos (não o <main>, que é reaproveitado entre telas).
  Object.values(campos).forEach(campo => campo.addEventListener("input", () => {
    indicador.textContent = "Salvando…";
    clearTimeout(timer);
    timer = setTimeout(salvarAgora, 600);
  }));

  // ---- Reescrever trecho com IA ----
  let selecao = { inicio: 0, fim: 0 };
  const guardarSelecao = () => { selecao = { inicio: campos.conteudo.selectionStart, fim: campos.conteudo.selectionEnd }; };
  ["select", "keyup", "mouseup", "touchend", "blur"].forEach(ev => campos.conteudo.addEventListener(ev, guardarSelecao));

  let versaoAnterior = null;
  const botaoDesfazer = $("#desfazer", main);
  const definirConteudo = (html) => {
    campos.conteudo.value = html;
    salvarAgora();
    aplicarModo();
  };
  botaoDesfazer.onclick = () => {
    if (versaoAnterior === null) return;
    definirConteudo(versaoAnterior);
    versaoAnterior = null;
    botaoDesfazer.hidden = true;
    toast("Reescrita desfeita.");
  };

  /** Texto legível de um elemento: separa parágrafos, itens e células com espaço. */
  const textoDe = (el) => {
    const copia = el.cloneNode(true);
    copia.querySelectorAll("p, li, td, th, h2, h3, h4, br, div").forEach(e => e.after(" "));
    return copia.textContent.replace(/\s+/g, " ").trim();
  };
  const textoPuro = (html) => textoDe(new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body);
  const resumir = (texto, max = 70) => texto.length > max ? texto.slice(0, max - 1) + "…" : texto;

  /** Lista os blocos do conteúdo para escolher o que reescrever. Seções (h2 até o próximo h2) também entram. */
  const escolherBloco = async () => {
    const doc = new DOMParser().parseFromString(`<body>${campos.conteudo.value}</body>`, "text/html");
    const filhos = [...doc.body.children];
    const nomes = { P: "Parágrafo", UL: "Lista", OL: "Lista", H2: "Título", H3: "Subtítulo", H4: "Subtítulo", DIV: "Caixa", TABLE: "Tabela", PRE: "Código", BLOCKQUOTE: "Citação" };
    const itens = [];
    filhos.forEach((el, i) => {
      if (el.tagName === "H2") {
        let fim = i + 1;
        while (fim < filhos.length && filhos[fim].tagName !== "H2") fim++;
        if (fim - i > 1) itens.push({ rotulo: `Seção inteira: ${resumir(el.textContent.trim(), 50)}`, valor: { inicio: i, fim }, icone: ICONES.doc });
      }
      const texto = textoDe(el);
      if (texto && el.tagName !== "PRE") itens.push({ rotulo: `${nomes[el.tagName] || "Bloco"}: ${resumir(texto, 60)}`, valor: { inicio: i, fim: i + 1 } });
    });
    if (!itens.length) return null;
    const escolha = await abrirFolha(itens);
    if (!escolha) return null;
    const html = filhos.slice(escolha.inicio, escolha.fim).map(el => el.outerHTML).join("");
    return {
      html,
      semTags: false,
      antes: textoPuro(filhos.slice(Math.max(0, escolha.inicio - 2), escolha.inicio).map(el => el.outerHTML).join("")).slice(-600),
      depois: textoPuro(filhos.slice(escolha.fim, escolha.fim + 2).map(el => el.outerHTML).join("")).slice(0, 600),
      aplicar: (novoHtml) => {
        const modelo = doc.createElement("template");
        modelo.innerHTML = novoHtml;
        filhos[escolha.inicio].before(...modelo.content.childNodes);
        filhos.slice(escolha.inicio, escolha.fim).forEach(el => el.remove());
        return doc.body.innerHTML;
      },
    };
  };

  const trechoSelecionado = () => {
    const { inicio, fim } = selecao;
    const valor = campos.conteudo.value;
    if (modoEditor !== "editar" || fim - inicio < 15) return null;
    const html = valor.slice(inicio, fim);
    return {
      html,
      semTags: !/<[a-z/][^>]*>/i.test(html),
      antes: textoPuro(valor.slice(Math.max(0, inicio - 1500), inicio)).slice(-600),
      depois: textoPuro(valor.slice(fim, fim + 1500)).slice(0, 600),
      aplicar: (novoHtml) => valor.slice(0, inicio) + novoHtml + valor.slice(fim),
    };
  };

  $("#reescrever", main).onclick = async () => {
    if (!cfg().geminiKey) { toast("Cadastre a chave do Gemini em Ajustes.", "erro"); return; }
    if (!campos.conteudo.value.trim()) { toast("Escreva ou gere o conteúdo primeiro.", "erro"); return; }
    salvarAgora();
    const trecho = trechoSelecionado() || await escolherBloco();
    if (!trecho) return;

    let pedido = await abrirFolha([...PEDIDOS_REESCRITA, "-", { rotulo: "Pedido personalizado…", valor: "personalizado", icone: ICONES.rascunho }]);
    if (pedido === "personalizado") {
      const { valor, campos: dados } = await abrirDialogo({
        titulo: "O que mudar neste trecho?",
        html: `<textarea name="pedido" rows="3" placeholder="Ex.: incluir um exemplo com Android e falar de segurança"></textarea>`,
        botoes: [{ rotulo: "Cancelar", valor: null }, { rotulo: "Reescrever", valor: "ok", primario: true }],
      });
      pedido = valor && dados.pedido.trim();
    }
    if (!pedido) return;

    const antesTexto = textoPuro(trecho.html);
    while (true) {
      let novo;
      carregando("Reescrevendo o trecho…");
      try {
        novo = await reescreverTrecho({ post, trecho: trecho.html, pedido, antes: trecho.antes, depois: trecho.depois, semTags: trecho.semTags });
      } catch (erro) {
        toast(erro instanceof ErroApp ? erro.message : `Erro inesperado: ${erro.message}`, "erro");
        return;
      } finally {
        carregando(null);
      }
      const { valor } = await abrirDialogo({
        titulo: "Comparar",
        html: `<div class="comparar">
          <p class="rotulo-comparar">Antes · ${antesTexto.split(/\s+/).filter(Boolean).length} palavras</p><div class="texto-comparar">${esc(antesTexto)}</div>
          <p class="rotulo-comparar">Depois · ${textoPuro(novo).split(/\s+/).filter(Boolean).length} palavras</p><div class="texto-comparar novo">${esc(textoPuro(novo))}</div>
        </div>`,
        botoes: [{ rotulo: "Cancelar", valor: null }, { rotulo: "Outra versão", valor: "outra" }, { rotulo: "Aplicar", valor: "aplicar", primario: true }],
      });
      if (valor === "outra") continue;
      if (valor === "aplicar") {
        versaoAnterior = campos.conteudo.value;
        definirConteudo(trecho.aplicar(novo));
        botaoDesfazer.hidden = false;
        toast("Trecho reescrito.", "ok");
      }
      return;
    }
  };

  // ---- Checagem de fatos (Pesquisa Google) ----
  const abrirChecagem = async (nova) => {
    salvarAgora();
    if (!post.conteudo.trim()) { toast("Escreva ou gere o conteúdo primeiro.", "erro"); return; }
    if (nova || !checagens.has(post.id)) {
      if (!cfg().geminiKey) { toast("Cadastre a chave do Gemini em Ajustes.", "erro"); return; }
      carregando("Pesquisando no Google e checando os fatos… pode levar até 1 minuto");
      try {
        checagens.set(post.id, await checarFatos(post));
      } catch (erro) {
        toast(erro instanceof ErroApp ? erro.message : `Erro inesperado: ${erro.message}`, "erro");
        return;
      } finally {
        carregando(null);
      }
    }
    const { valor } = await abrirDialogo({
      titulo: "Checagem de fatos",
      html: htmlChecagem(checagens.get(post.id)),
      botoes: [{ rotulo: "Checar de novo", valor: "de-novo" }, { rotulo: "Fechar", valor: null, primario: true }],
    });
    if (valor === "de-novo") abrirChecagem(true);
  };
  $("#checar-fatos", main)?.addEventListener("click", () => abrirChecagem(!checagens.has(post.id)));

  // ---- Descrição de pesquisa ----
  const contador = $("#contador-descricao", main);
  const atualizarContador = () => {
    const n = campos.descricao.value.trim().length;
    contador.textContent = `${n}/155`;
    contador.className = `contador ${n === 0 ? "" : n < 70 || n > 160 ? "fora" : "ok"}`;
  };
  campos.descricao.addEventListener("input", atualizarContador);
  atualizarContador();
  $("#copiar-descricao", main).onclick = () => {
    if (!campos.descricao.value.trim()) { toast("A descrição está vazia. Toque em “Gerar com IA”.", "erro"); return; }
    copiar(campos.descricao.value.trim());
  };
  $("#gerar-descricao", main).onclick = async () => {
    salvarAgora();
    if (!post.conteudo.trim()) { toast("Escreva ou gere o conteúdo primeiro.", "erro"); return; }
    if (!cfg().geminiKey) { toast("Cadastre a chave do Gemini em Ajustes.", "erro"); return; }
    carregando("Escrevendo a descrição…");
    try {
      const dados = await gerarJson({
        sistema: `Você escreve descrições de pesquisa (meta description) para posts de blog, em português do Brasil.
- Entre 120 e 155 caracteres, uma frase ou duas, texto puro, sem aspas e sem emojis.
- Resuma o que o leitor ganha com o post e use a palavra-chave principal de forma natural.
- Não invente informações que não estão no post.`,
        texto: `Título: ${post.titulo}\n\nPost:\n${textoDoPost(post.conteudo).slice(0, 6000)}`,
        schema: { type: "object", properties: { descricao: { type: "string" } }, required: ["descricao"] },
        maxTokens: 2048, timeoutMs: 60000,
      });
      campos.descricao.value = limparDescricao(dados.descricao);
      salvarAgora();
      atualizarContador();
      toast("Descrição pronta. Copie e cole no Blogger.", "ok");
    } catch (erro) {
      toast(erro instanceof ErroApp ? erro.message : `Erro inesperado: ${erro.message}`, "erro");
    } finally {
      carregando(null);
    }
  };

  salvarPendente = () => { if (timer) salvarAgora(); };
  aoSairDaTela = () => {
    if (timer) salvarAgora();
    const atual = obterPost(post.id);
    if (atual && !atual.titulo && !atual.conteudo.trim() && atual.status === "local") excluirPost(post.id);
  };

  const MENSAGENS_ENVIO = {
    rascunho: ["Enviando rascunho…", "Salvo como rascunho no Blogger."],
    publicar: ["Publicando…", "Publicado no blog! 🎉"],
    agendar: ["Agendando…", "Publicação agendada! 🕒"],
    atualizar: ["Atualizando no blog…", "Post atualizado no blog."],
  };

  const validarEnvio = () => {
    salvarAgora();
    if (!post.titulo || !post.conteudo.trim()) { toast("Preencha título e conteúdo antes de enviar.", "erro"); return false; }
    if (!cfg().blogId) { toast("Conecte o Blogger e escolha o blog em Ajustes.", "erro"); return false; }
    return true;
  };

  /** Deve ser chamada direto a partir de um toque (o login do Google abre uma janela). */
  const enviar = (modo, agendarPara = null) => {
    const pedido = garantirToken();
    (async () => {
      try {
        const tk = await pedido;
        carregando(MENSAGENS_ENVIO[modo][0]);
        Object.assign(post, await enviarPost(tk, post, modo, agendarPara));
        salvarPost(post);
        toast(post.status === "agendado" && modo !== "rascunho"
          ? `Agendado para ${formatarAgendamento(post.agendadoPara)}.`
          : MENSAGENS_ENVIO[modo][1] + (post.descricao && modo !== "rascunho" ? " Lembre de colar a descrição de pesquisa no Blogger." : ""), "ok");
        telaEditor(post.id);
      } catch (erro) {
        toast(erro instanceof ErroApp ? erro.message : `Erro inesperado: ${erro.message}`, "erro");
      } finally {
        carregando(null);
      }
    })();
  };

  $("#publicar", main).onclick = async () => {
    if (!validarEnvio()) return;
    const opcoes = post.status === "publicado"
      ? [{ rotulo: "Atualizar no blog", valor: "atualizar", icone: ICONES.enviar }]
      : post.status === "agendado"
        ? [
          { rotulo: `Atualizar e manter para ${formatarAgendamento(post.agendadoPara)}`, valor: "atualizar", icone: ICONES.enviar },
          { rotulo: "Mudar data do agendamento…", valor: "agendar", icone: ICONES.relogio },
          { rotulo: "Publicar agora", valor: "publicar", icone: ICONES.enviar },
        ]
        : [
          { rotulo: "Publicar agora", valor: "publicar", icone: ICONES.enviar },
          { rotulo: "Agendar publicação…", valor: "agendar", icone: ICONES.relogio },
        ];
    const escolha = await abrirFolha(opcoes);
    if (!escolha) return;
    if (escolha === "agendar") {
      const quando = await escolherDataAgendamento(post.agendadoPara);
      if (quando) enviar("agendar", quando);
      return;
    }
    enviar(escolha);
  };
  $("#rascunho", main).onclick = () => {
    if (!validarEnvio()) return;
    if ((publicado || post.status === "agendado") && !confirm("Tirar o post do ar e voltar para rascunho no Blogger?")) return;
    enviar("rascunho");
  };

  // Capa
  $("#capa-trocar", main).onclick = async () => {
    salvarAgora();
    const origem = await abrirFolha([
      { rotulo: cfg().pexelsKey ? "Buscar foto grátis (Pexels)" : "Buscar foto grátis (Pexels) — requer chave em Ajustes", valor: "pexels", icone: ICONES.lupa },
      { rotulo: "Criar imagem com IA (para baixar)", valor: "ia", icone: ICONES.brilho },
    ]);
    if (origem === "ia") { criarImagemIA(post); return; }
    if (origem !== "pexels") return;
    if (!cfg().pexelsKey) { location.hash = "#/ajustes"; toast("Cadastre a chave gratuita do Pexels em “4 · Imagens”.", "erro"); return; }
    const capa = await escolherFotoPexels(post.tema || post.titulo || "");
    if (!capa) return;
    post.capa = capa;
    salvarPost(post);
    toast("Capa adicionada. Ela vai no topo do post.", "ok");
    telaEditor(post.id);
  };
  $("#capa-remover", main)?.addEventListener("click", () => {
    delete post.capa;
    salvarPost(post);
    telaEditor(post.id);
  });
  $("#capa-alt", main)?.addEventListener("input", (e) => {
    post.capa.alt = e.target.value;
    salvarPost(post);
  });

  $("#menu-post").onclick = async () => {
    const escolha = await abrirFolha([
      post.url && publicado && { rotulo: "Abrir no blog", valor: "abrir", icone: ICONES.link },
      categoria(post.categoria).checarFatos !== false && {
        rotulo: checagens.has(post.id) ? "Ver última checagem de fatos" : "Checar fatos na internet", valor: "checar", icone: ICONES.lupa,
      },
      checagens.has(post.id) && categoria(post.categoria).checarFatos !== false && { rotulo: "Checar fatos de novo", valor: "checar-novo", icone: ICONES.lupa },
      { rotulo: "Criar imagem com IA (para baixar)", valor: "imagem-ia", icone: ICONES.brilho },
      { rotulo: "Copiar HTML", valor: "copiar", icone: ICONES.copiar },
      "-",
      { rotulo: "Excluir deste aparelho", valor: "excluir", perigo: true, icone: ICONES.lixo },
    ].filter(Boolean));
    if (escolha === "abrir") window.open(post.url, "_blank", "noopener");
    if (escolha === "copiar") { salvarAgora(); copiar(conteudoFinal(post)); }
    if (escolha === "imagem-ia") criarImagemIA(post);
    if (escolha === "checar") abrirChecagem(!checagens.has(post.id));
    if (escolha === "checar-novo") abrirChecagem(true);
    if (escolha === "excluir" && confirm("Excluir este post do aparelho? O que já está no Blogger não é apagado.")) {
      aoSairDaTela = null;
      excluirPost(post.id);
      toast("Post excluído.");
      location.hash = "#/posts";
    }
  };
}

/* ---------------- Tela: Ajustes ---------------- */

let eventoInstalar = null;

function telaAjustes() {
  const c = cfg();
  const conectado = tokenValido();
  const instalado = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const origem = location.origin;

  const main = montar({
    titulo: "Ajustes", aba: "ajustes",
    html: `
      <h2 class="secao-titulo">1 · Inteligência artificial</h2>
      <section class="cartao">
        <div class="status">
          <span class="ponto ${c.geminiKey ? "ok" : ""}"></span>
          <div><strong>Gemini</strong>
            <small>${c.geminiKey ? `Chave ••••${esc(c.geminiKey.slice(-4))} · ${esc(c.geminiModel)}` : "Nenhuma chave cadastrada"}</small>
          </div>
        </div>
        <details class="ajuda" ${c.geminiKey ? "" : "open"}>
          <summary>Como obter a chave</summary>
          <ol>
            <li>Abra o <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> e toque em <strong>Criar chave de API</strong>.</li>
            <li>Copie a chave e cole abaixo.</li>
            <li>Recomendado: no Google Cloud, restrinja a chave ao site <code>${esc(origem)}/*</code>.</li>
          </ol>
        </details>
        <form id="form-gemini">
          <label class="campo"><span>Chave da API</span>
            <input type="password" name="chave" autocomplete="off" autocapitalize="off" spellcheck="false"
              placeholder="${c.geminiKey ? "Deixe em branco para manter a atual" : "Cole sua chave aqui"}">
          </label>
          <label class="campo"><span>Modelo de texto</span>
            ${seletorModelo("modelo", "texto", c.geminiModel || MODELO_PADRAO)}
            <small>${armazenamento.ler("bs.modelos", null)?.quando
              ? `Lista da sua conta, atualizada em ${new Date(armazenamento.ler("bs.modelos", null).quando).toLocaleDateString("pt-BR")}.`
              : "Lista padrão. Toque em “Atualizar lista” para ver todos os modelos da sua chave."}</small>
          </label>
          <div class="botoes">
            <button class="btn primario">Salvar e testar</button>
            ${c.geminiKey ? `<button type="button" class="btn" id="atualizar-modelos">Atualizar lista</button>` : ""}
            ${c.geminiKey ? `<button type="button" class="btn perigo" id="remover-gemini">Remover</button>` : ""}
          </div>
        </form>
      </section>

      <h2 class="secao-titulo">2 · Blogger</h2>
      <section class="cartao">
        <div class="status">
          <span class="ponto ${c.clientId ? "ok" : ""}"></span>
          <div><strong>ID do cliente Google</strong><small>${c.clientId ? esc(c.clientId) : "Não cadastrado"}</small></div>
        </div>
        <div class="status">
          <span class="ponto ${conectado ? "ok" : ""}"></span>
          <div><strong>Conta Google</strong><small>${conectado ? "Conectada" : "Não conectada (o login é pedido ao publicar)"}</small></div>
        </div>
        <div class="status">
          <span class="ponto ${c.blogId ? "ok" : ""}"></span>
          <div><strong>Blog</strong><small>${c.blogId ? esc(c.blogNome) : "Nenhum escolhido"}</small></div>
        </div>

        <details class="ajuda" ${c.clientId ? "" : "open"}>
          <summary>Como criar o ID do cliente (uma vez)</summary>
          <ol>
            <li>Crie um projeto no <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Google Cloud</a>.</li>
            <li>Ative a <a href="https://console.cloud.google.com/apis/library/blogger.googleapis.com" target="_blank" rel="noopener">Blogger API v3</a>.</li>
            <li>Em <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener">Google Auth Platform</a>, toque em <strong>Começar</strong>: nome do app, seu e-mail e público <strong>Externo</strong>.</li>
            <li>Em <a href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noopener">Público-alvo</a>, adicione seu Gmail em <strong>Usuários de teste</strong>.</li>
            <li>Em <a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noopener">Clientes</a>, crie um cliente do tipo <strong>Aplicativo da Web</strong> e, em <strong>Origens JavaScript autorizadas</strong>, adicione:
              <div class="copiar"><code>${esc(origem)}</code><button type="button" class="btn" id="copiar-origem">${ICONES.copiar}</button></div>
            </li>
            <li>Copie o <strong>ID do cliente</strong> e cole abaixo. A chave secreta não é necessária.</li>
          </ol>
        </details>

        <form id="form-google">
          <label class="campo"><span>ID do cliente</span>
            <input name="clientId" value="${esc(c.clientId)}" autocapitalize="off" spellcheck="false" placeholder="123-abc.apps.googleusercontent.com">
          </label>
          <button class="btn largo">Salvar ID do cliente</button>
        </form>
        <div class="botoes" style="margin-top:10px">
          <button type="button" class="btn primario" id="conectar" ${c.clientId ? "" : "disabled"}>${ICONES.blog}${c.blogId ? "Trocar blog" : "Conectar e escolher blog"}</button>
          ${conectado ? `<button type="button" class="btn perigo" id="desconectar">Desconectar</button>` : ""}
        </div>
      </section>

      <h2 class="secao-titulo">3 · Perfil do blog</h2>
      <section class="cartao">
        <p class="pequeno suave">Usado em todos os posts gerados, para manter a mesma voz e o mesmo visual.</p>
        <form id="form-perfil">
          <label class="campo"><span>Nome do blog</span>
            <input name="nomeBlog" value="${esc(c.perfil?.nomeBlog || "")}" placeholder="${esc(c.blogNome || "Ex.: Cozinha & Código")}">
          </label>
          <label class="campo"><span>Quem escreve</span>
            <input name="autor" value="${esc(c.perfil?.autor || "")}" placeholder="Ex.: Ana, desenvolvedora que adora cozinhar e jogar">
          </label>
          <label class="campo"><span>Público do blog</span>
            <input name="publico" value="${esc(c.perfil?.publico || "")}" placeholder="Ex.: adultos curiosos, sem conhecimento técnico">
          </label>
          <label class="campo"><span>Tom de voz padrão</span>
            <input name="tom" value="${esc(c.perfil?.tom || "")}" list="tons" placeholder="Ex.: próximo e bem-humorado, sem gírias">
            <datalist id="tons">${TONS.slice(1).map(t => `<option value="${esc(t)}">`).join("")}</datalist>
          </label>
          <label class="campo"><span>Regras do blog</span>
            <textarea name="regras" rows="4" placeholder="Uma por linha. Ex.:&#10;Tratar o leitor por você&#10;Nunca usar palavrões&#10;Citar marcas só quando necessário">${esc(c.perfil?.regras || "")}</textarea>
          </label>
          <label class="campo"><span>Mensagem no final de todo post</span>
            <textarea name="rodape" rows="2" placeholder="Ex.: Gostou? Deixe um comentário e compartilhe com quem vai curtir!">${esc(c.perfil?.rodape || "")}</textarea>
            <small>Aparece numa caixa destacada no fim dos posts gerados.</small>
          </label>
          <label class="campo"><span>Cor de destaque</span>
            <input type="color" name="cor" value="${esc(perfilBlog().cor)}">
            <small>Usada nas caixas de resumo, fichas e tabelas.</small>
          </label>
          <button class="btn primario largo">Salvar perfil</button>
        </form>
      </section>

      <h2 class="secao-titulo">4 · Imagens</h2>
      <section class="cartao">
        <div class="status">
          <span class="ponto ${c.pexelsKey ? "ok" : ""}"></span>
          <div><strong>Fotos de capa (Pexels)</strong><small>${c.pexelsKey ? `Chave ••••${esc(c.pexelsKey.slice(-4))}` : "Opcional · gratuito"}</small></div>
        </div>
        <details class="ajuda" ${c.pexelsKey ? "" : ""}>
          <summary>Como obter a chave do Pexels</summary>
          <ol>
            <li>Crie uma conta grátis em <a href="https://www.pexels.com/api/" target="_blank" rel="noopener">pexels.com/api</a> e toque em <strong>Your API Key</strong>.</li>
            <li>Preencha o motivo (ex.: "fotos de capa para meu blog") e copie a chave.</li>
            <li>As fotos ficam hospedadas no Pexels e o crédito do fotógrafo entra no post automaticamente.</li>
          </ol>
        </details>
        <form id="form-imagens">
          <label class="campo"><span>Chave do Pexels</span>
            <input type="password" name="pexelsKey" autocomplete="off" autocapitalize="off" spellcheck="false"
              placeholder="${c.pexelsKey ? "Deixe em branco para manter a atual" : "Cole sua chave aqui"}">
          </label>
          <label class="campo"><span>Modelo para imagens com IA</span>
            ${seletorModelo("modeloImagem", "imagem", c.modeloImagem || MODELO_IMAGEM_PADRAO)}
            <small>Gerar imagens com o Gemini pode exigir faturamento ativo na sua conta.</small>
          </label>
          <div class="botoes">
            <button class="btn primario">Salvar e testar</button>
            ${c.pexelsKey ? `<button type="button" class="btn perigo" id="remover-pexels">Remover chave</button>` : ""}
          </div>
        </form>
      </section>

      ${instalado ? "" : `
      <h2 class="secao-titulo">Instalar no celular</h2>
      <section class="cartao">
        ${eventoInstalar ? `<button class="btn primario largo" id="instalar">Instalar app</button>` : `
        <p class="pequeno"><strong>Android (Chrome):</strong> menu ⋮ → <em>Instalar app</em> ou <em>Adicionar à tela inicial</em>.</p>
        <p class="pequeno" style="margin-bottom:0"><strong>iPhone (Safari):</strong> botão Compartilhar → <em>Adicionar à Tela de Início</em>.</p>`}
      </section>`}

      <h2 class="secao-titulo">Backup</h2>
      <section class="cartao">
        <p class="pequeno suave">Os posts ficam salvos só neste aparelho. Faça backup para não perdê-los ou para passar para outro aparelho. As chaves não entram no backup.</p>
        <div class="botoes">
          <button type="button" class="btn" id="exportar">Exportar</button>
          <label class="btn">Importar<input type="file" id="importar" accept=".json,application/json" hidden></label>
        </div>
      </section>`,
  });

  // Gemini
  $("#form-gemini", main).addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const chave = form.chave.value.replace(/\s+/g, "") || c.geminiKey;
    const modelo = form.modelo.value || MODELO_PADRAO;
    if (!chave) { toast("Cole a chave da API do Gemini.", "erro"); return; }
    carregando("Testando a chave…");
    try {
      await testarGemini(chave, modelo);
      salvarConfig({ geminiKey: chave, geminiModel: modelo });
      await atualizarModelos(chave).catch(() => {});
      toast("Chave do Gemini salva e testada.", "ok");
      telaAjustes();
    } catch (erro) {
      toast(erro.message, "erro");
    } finally {
      carregando(null);
    }
  });
  $("#atualizar-modelos", main)?.addEventListener("click", async () => {
    carregando("Buscando modelos da sua conta…");
    try {
      const { texto, imagem } = await atualizarModelos();
      toast(`${texto.length} modelos de texto e ${imagem.length} de imagem encontrados.`, "ok");
      telaAjustes();
    } catch (erro) {
      toast(erro.message, "erro");
    } finally {
      carregando(null);
    }
  });
  $("#remover-gemini", main)?.addEventListener("click", () => {
    if (!confirm("Remover a chave do Gemini deste aparelho?")) return;
    salvarConfig({ geminiKey: "" });
    toast("Chave removida.");
    telaAjustes();
  });

  // Imagens
  $("#form-imagens", main).addEventListener("submit", async (e) => {
    e.preventDefault();
    const chave = e.target.pexelsKey.value.trim();
    const modeloImagem = e.target.modeloImagem.value;
    if (chave) {
      carregando("Testando a chave do Pexels…");
      try {
        await buscarPexels("blog", 1, chave);
      } catch (erro) {
        toast(erro.message, "erro");
        return;
      } finally {
        carregando(null);
      }
    }
    salvarConfig({ ...(chave ? { pexelsKey: chave } : {}), modeloImagem: modeloImagem === MODELO_IMAGEM_PADRAO ? "" : modeloImagem });
    toast(chave ? "Chave do Pexels salva e testada." : "Configurações de imagem salvas.", "ok");
    telaAjustes();
  });
  $("#remover-pexels", main)?.addEventListener("click", () => {
    if (!confirm("Remover a chave do Pexels deste aparelho?")) return;
    salvarConfig({ pexelsKey: "" });
    telaAjustes();
  });

  // Perfil do blog
  $("#form-perfil", main).addEventListener("submit", (e) => {
    e.preventDefault();
    const dados = Object.fromEntries([...new FormData(e.target)].map(([k, v]) => [k, String(v).trim()]));
    salvarConfig({ perfil: dados });
    toast("Perfil do blog salvo.", "ok");
  });

  // Google / Blogger
  $("#copiar-origem", main).onclick = () => copiar(origem);
  $("#form-google", main).addEventListener("submit", (e) => {
    e.preventDefault();
    const clientId = e.target.clientId.value.trim();
    if (clientId && !clientId.endsWith(".apps.googleusercontent.com")) {
      toast("ID inválido: deve terminar com .apps.googleusercontent.com", "erro"); return;
    }
    if (clientId !== c.clientId) {
      desconectarGoogle();
      salvarConfig({ clientId, blogId: "", blogNome: "" });
    }
    toast(clientId ? "ID do cliente salvo." : "ID do cliente removido.", "ok");
    telaAjustes();
  });
  $("#conectar", main).onclick = () => {
    const pedido = garantirToken({ escolherConta: !tokenValido() });
    (async () => {
      try {
        const tk = await pedido;
        carregando("Buscando seus blogs…");
        const blogs = await listarBlogs(tk);
        carregando(null);
        if (!blogs.length) { toast("Nenhum blog encontrado nesta conta Google.", "erro"); telaAjustes(); return; }
        const escolhido = await abrirFolha(blogs.map(b => ({ rotulo: `${b.nome} — ${b.url.replace(/^https?:\/\//, "")}`, valor: b, icone: ICONES.blog })));
        if (escolhido) {
          salvarConfig({ blogId: escolhido.id, blogNome: escolhido.nome });
          toast(`Blog escolhido: ${escolhido.nome}`, "ok");
        }
        telaAjustes();
      } catch (erro) {
        toast(erro.message, "erro");
      } finally {
        carregando(null);
      }
    })();
  };
  $("#desconectar", main)?.addEventListener("click", () => {
    desconectarGoogle();
    toast("Conta Google desconectada.");
    telaAjustes();
  });

  // Instalação
  $("#instalar", main)?.addEventListener("click", async () => {
    eventoInstalar.prompt();
    await eventoInstalar.userChoice;
    eventoInstalar = null;
    telaAjustes();
  });

  // Backup
  $("#exportar", main).onclick = () => {
    const blob = new Blob([JSON.stringify({ app: "blog-studio", versao: 1, posts: listarPosts() }, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `blog-studio-backup-${new Date().toISOString().slice(0, 10)}.json`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $("#importar", main).onchange = async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    try {
      const dados = JSON.parse(await arquivo.text());
      const recebidos = (Array.isArray(dados) ? dados : dados.posts || []).filter(p =>
        p && typeof p.id === "string" && typeof p.titulo === "string" && typeof p.conteudo === "string");
      if (!recebidos.length) throw new Error();
      const posts = listarPosts();
      let novos = 0;
      for (const p of recebidos) {
        const post = { marcadores: [], status: "local", tema: "", criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(), ...p };
        post.marcadores = Array.isArray(post.marcadores) ? post.marcadores.map(String) : [];
        const i = posts.findIndex(x => x.id === post.id);
        if (i < 0) { posts.push(post); novos++; }
        else if (post.atualizadoEm > posts[i].atualizadoEm) posts[i] = post;
      }
      gravarPosts(posts);
      toast(`Backup importado: ${recebidos.length} posts (${novos} novos).`, "ok");
    } catch {
      toast("Arquivo de backup inválido.", "erro");
    }
    e.target.value = "";
  };
}

/* ---------------- Início ---------------- */

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  eventoInstalar = e;
  if (location.hash.startsWith("#/ajustes")) telaAjustes();
});
window.addEventListener("hashchange", rota);
// Ao minimizar/fechar o app, grava o que estiver pendente no editor.
document.addEventListener("visibilitychange", () => { if (document.hidden) salvarPendente?.(); });

if (!location.hash) history.replaceState(null, "", "#/posts");
if (cfg().geminiKey && Date.now() - (armazenamento.ler("bs.modelos", null)?.quando || 0) > 7 * 86400e3) {
  atualizarModelos().catch(() => { /* sem internet ou chave inválida: fica a lista atual */ });
}
rota();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* sem modo offline */ });
}
