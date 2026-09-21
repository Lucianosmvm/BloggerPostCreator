"use strict";

/* =========================================================
   Categorias de post: campos do formulário, instruções para a IA,
   formato da resposta (JSON) e montagem do HTML final.
   O HTML usa estilos inline para ficar igual em qualquer tema do Blogger.
   ========================================================= */

function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------- Limpeza do HTML gerado pela IA ---------------- */

const TAGS_TEXTO = new Set(["P", "H3", "H4", "UL", "OL", "LI", "STRONG", "EM", "B", "I", "A", "BLOCKQUOTE", "BR", "CODE",
  "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "PRE"]);
const ESTILO_CELULA = "padding:8px 12px;border:1px solid rgba(128,128,128,.35);text-align:left;vertical-align:top;";
const ESTILO_PRE = "background:#1e1f22;color:#f1f1f1;padding:14px 16px;border-radius:8px;overflow-x:auto;font-size:14px;line-height:1.5;margin:0 0 20px;white-space:pre;";
const TAGS_REMOVER = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON", "TEMPLATE", "SVG", "MATH"]);
const TAGS_LAYOUT = new Set(["DIV", "SPAN", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "PRE", "H2", "DETAILS", "SUMMARY"]);
const ESTILO_PERIGOSO = /url\s*\(|expression|javascript:|@import|behavior|position\s*:\s*fixed/i;

/**
 * Mantém só tags de texto seguras; remove scripts e atributos (exceto links http/https).
 * manterEstilo: também aceita as tags e o atributo style usados nos blocos visuais (usado na reescrita).
 * envolverP: envolve texto solto num <p>.
 */
function limparHtml(html, { permitirH2 = false, manterEstilo = false, envolverP = true } = {}) {
  if (manterEstilo) permitirH2 = true;
  const doc = new DOMParser().parseFromString(`<body>${html || ""}</body>`, "text/html");
  const limpar = (no) => {
    for (const filho of [...no.childNodes]) {
      if (filho.nodeType === Node.TEXT_NODE) continue;
      if (filho.nodeType !== Node.ELEMENT_NODE || TAGS_REMOVER.has(filho.tagName)) { filho.remove(); continue; }
      limpar(filho);
      let el = filho;
      if (el.tagName === "H1" || (el.tagName === "H2" && !permitirH2)) {
        const novo = doc.createElement(permitirH2 ? "h2" : "h3");
        novo.append(...el.childNodes);
        el.replaceWith(novo);
        el = novo;
      } else if (!TAGS_TEXTO.has(el.tagName) && !(permitirH2 && el.tagName === "H2") && !(manterEstilo && TAGS_LAYOUT.has(el.tagName))) {
        el.replaceWith(...el.childNodes);
        continue;
      }
      for (const atributo of [...el.attributes]) {
        const linkValido = el.tagName === "A" && atributo.name === "href" && /^https?:\/\//i.test(atributo.value.trim());
        const estiloValido = manterEstilo && atributo.name === "style" && !ESTILO_PERIGOSO.test(atributo.value);
        if (!linkValido && !estiloValido) el.removeAttribute(atributo.name);
      }
      if (el.tagName === "A") { el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener"); }
    }
  };
  limpar(doc.body);
  // Tabelas e blocos de código escritos pela IA: mesmo visual dos blocos do app, e tabela larga rola no celular.
  if (!manterEstilo) {
    for (const tabela of doc.body.querySelectorAll("table")) {
      tabela.setAttribute("style", "width:100%;border-collapse:collapse;");
      tabela.querySelectorAll("th, td").forEach(c => c.setAttribute("style", ESTILO_CELULA + (c.tagName === "TH" ? "background:rgba(128,128,128,.12);" : "")));
      const caixa = doc.createElement("div");
      caixa.setAttribute("style", "overflow-x:auto;margin:20px 0;");
      tabela.replaceWith(caixa);
      caixa.append(tabela);
    }
    doc.body.querySelectorAll("pre").forEach(pre => pre.setAttribute("style", ESTILO_PRE));
  }
  const resultado = doc.body.innerHTML.trim();
  if (!resultado) return "";
  if (!envolverP) return resultado;
  return /<(p|ul|ol|h[234]|blockquote|div|table|pre)\b/i.test(resultado) ? resultado : `<p>${resultado}</p>`;
}

/* ---------------- Blocos visuais (HTML com estilo inline) ---------------- */

function corValida(cor) { return /^#[0-9a-f]{6}$/i.test(cor || "") ? cor : "#e8710a"; }
function transparente(cor, alfa) {
  const n = parseInt(corValida(cor).slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alfa})`;
}
const lista = (itens, ordenada = false) => {
  const validos = (itens || []).map(i => String(i).trim()).filter(Boolean);
  if (!validos.length) return "";
  const tag = ordenada ? "ol" : "ul";
  return `<${tag}>${validos.map(i => `<li>${esc(i)}</li>`).join("")}</${tag}>`;
};

/**
 * Campos de chips podem sugerir um tamanho de post para cada opção (tamanhoPorOpcao),
 * ex.: resumo completo de um anime não cabe em 800 palavras. Devolve o tamanho sugerido ou "".
 */
function tamanhoSugerido(cat, entrada) {
  for (const campo of cat.campos) {
    if (!campo.tamanhoPorOpcao) continue;
    const valor = campo.opcoes.includes(entrada[campo.nome]) ? entrada[campo.nome] : (campo.padrao ?? campo.opcoes[0]);
    if (campo.tamanhoPorOpcao[valor]) return campo.tamanhoPorOpcao[valor];
  }
  return "";
}

const Bloco = {
  h2: (texto) => `<h2>${esc(texto)}</h2>`,
  caixa(titulo, conteudoHtml, cor) {
    if (!conteudoHtml) return "";
    return `<div style="border-left:4px solid ${corValida(cor)};background:${transparente(cor, 0.08)};padding:14px 18px;margin:24px 0;border-radius:6px;">` +
      (titulo ? `<p style="margin:0 0 8px;font-weight:bold;">${esc(titulo)}</p>` : "") + conteudoHtml + `</div>`;
  },
  ficha(pares, cor, titulo = "") {
    const linhas = pares.filter(([, v]) => v && String(v).trim());
    if (!linhas.length) return "";
    return `<div style="border:1px solid ${transparente(cor, 0.35)};border-radius:8px;margin:24px 0;overflow:hidden;">` +
      (titulo ? `<p style="margin:0;padding:10px 14px;background:${transparente(cor, 0.12)};font-weight:bold;">${esc(titulo)}</p>` : "") +
      `<table style="width:100%;border-collapse:collapse;">` +
      linhas.map(([k, v], i) => `<tr${i ? ` style="border-top:1px solid ${transparente(cor, 0.2)};"` : ""}>` +
        `<td style="padding:10px 14px;font-weight:bold;width:40%;vertical-align:top;">${esc(k)}</td>` +
        `<td style="padding:10px 14px;vertical-align:top;">${esc(v)}</td></tr>`).join("") +
      `</table></div>`;
  },
  tabela(colunas, linhas, cor) {
    if (!colunas?.length || !linhas?.length) return "";
    const celula = (t, cab) => `<${cab ? "th" : "td"} style="padding:10px 12px;border:1px solid ${transparente(cor, 0.25)};text-align:left;vertical-align:top;${cab ? `background:${transparente(cor, 0.12)};` : ""}">${esc(t)}</${cab ? "th" : "td"}>`;
    return `<div style="overflow-x:auto;margin:24px 0;"><table style="width:100%;border-collapse:collapse;min-width:420px;">` +
      `<thead><tr>${colunas.map(c => celula(c, true)).join("")}</tr></thead>` +
      `<tbody>${linhas.map(l => `<tr>${colunas.map((_, i) => celula(l?.[i] ?? "", false)).join("")}</tr>`).join("")}</tbody>` +
      `</table></div>`;
  },
  prosContras(pros, contras) {
    const bloco = (titulo, itens, cor) => itens?.length
      ? `<div style="border-left:4px solid ${cor};background:${transparente(cor, 0.08)};padding:12px 18px;margin:12px 0;border-radius:6px;"><p style="margin:0 0 6px;font-weight:bold;">${titulo}</p>${lista(itens)}</div>`
      : "";
    const html = bloco("Pontos positivos", pros, "#2e7d32") + bloco("Pontos negativos", contras, "#c62828");
    return html ? `<div style="margin:24px 0;">${html}</div>` : "";
  },
  faq(itens) {
    const validos = (itens || []).filter(i => i?.pergunta && i?.resposta);
    if (!validos.length) return "";
    return Bloco.h2("Perguntas frequentes") + validos.map(i => `<h3>${esc(i.pergunta)}</h3>${limparHtml(i.resposta)}`).join("");
  },
  codigo(codigo, linguagem) {
    if (!codigo?.trim()) return "";
    return (linguagem ? `<p style="margin:16px 0 4px;font-size:13px;opacity:.75;">${esc(linguagem)}</p>` : "") +
      `<pre style="${ESTILO_PRE}"><code>${esc(codigo.replace(/\s+$/, ""))}</code></pre>`;
  },
  /** Saída esperada de um programa ou comando: bloco claro, para não confundir com o código. */
  saida(texto) {
    if (!texto?.trim()) return "";
    return `<p style="margin:0 0 4px;font-size:13px;opacity:.75;">Saída esperada</p>` +
      `<pre style="background:rgba(128,128,128,.12);border:1px dashed rgba(128,128,128,.45);padding:12px 16px;border-radius:8px;overflow-x:auto;font-size:14px;line-height:1.5;margin:0 0 20px;white-space:pre;"><code>${esc(texto.replace(/\s+$/, ""))}</code></pre>`;
  },
  /** Seções do post. Campos extras (tabela, código, saída, observação) só aparecem se a IA preencher. */
  secoes(secoes, { comCodigo = false, cor = "" } = {}) {
    return (secoes || []).filter(s => s?.titulo || s?.conteudo_html).map(s =>
      (s.titulo ? Bloco.h2(s.titulo) : "") + limparHtml(s.conteudo_html) +
      (s.tabela?.titulo?.trim() && s.tabela?.colunas?.length ? `<p style="margin:20px 0 -12px;font-weight:bold;">${esc(s.tabela.titulo.trim())}</p>` : "") +
      Bloco.tabela(s.tabela?.colunas, s.tabela?.linhas, cor) +
      (comCodigo ? Bloco.codigo(s.codigo, s.linguagem) + Bloco.saida(s.saida) : "") +
      (s.observacao?.trim() ? Bloco.caixa("", `<p style="margin:0;">${esc(s.observacao.trim())}</p>`, cor) : "")).join("");
  },
  /** Exercícios com a resposta escondida (o leitor tenta antes de ver). */
  exercicios(itens) {
    const validos = (itens || []).filter(i => i?.pergunta?.trim() && i?.resposta?.trim());
    if (!validos.length) return "";
    return Bloco.h2("Exercícios para praticar") + `<ol>` + validos.map(i =>
      `<li style="margin-bottom:14px;"><p style="margin:0 0 6px;">${esc(i.pergunta.trim())}</p>` +
      `<details><summary style="cursor:pointer;font-weight:bold;">Ver resposta</summary>` +
      `<div style="margin-top:8px;">${limparHtml(i.resposta)}</div></details></li>`).join("") + `</ol>`;
  },
  avaliacao(a, cor) {
    if (!a || !(Number(a.nota_geral) > 0)) return "";
    const nota = (n) => numeroBR(Math.max(0, Math.min(10, Number(n) || 0)));
    return `<div style="text-align:center;border:2px solid ${corValida(cor)};border-radius:12px;padding:18px;margin:28px 0;">` +
      `<div style="font-size:52px;font-weight:bold;line-height:1;color:${corValida(cor)};">${nota(a.nota_geral)}</div><div style="opacity:.75;">de 10</div>` +
      (a.veredito ? `<p style="margin:12px 0 0;"><strong>Veredito:</strong> ${esc(a.veredito)}</p>` : "") + `</div>` +
      Bloco.ficha((a.criterios || []).map(c => [c.nome, `${nota(c.nota)} / 10`]), cor, "Notas por critério");
  },
  avisoSpoiler(entrada) {
    return entrada.spoilers === "Pode ter spoilers" ? Bloco.caixa("", "<p style=\"margin:0;font-weight:bold;\">⚠️ Atenção: este post contém spoilers.</p>", "#c62828") : "";
  },
  personagens(itens, cor, titulo = "Personagens principais") {
    const validos = (itens || []).filter(p => p?.nome?.trim());
    if (!validos.length) return "";
    return Bloco.caixa(titulo, `<ul>${validos.map(p => `<li><strong>${esc(p.nome.trim())}</strong>${p.descricao?.trim() ? ` — ${esc(p.descricao.trim())}` : ""}</li>`).join("")}</ul>`, cor);
  },
  fechamento(perfil) {
    return perfil.rodape?.trim() ? Bloco.caixa("", `<p style="margin:0;">${esc(perfil.rodape.trim()).replace(/\n/g, "<br>")}</p>`, perfil.cor) : "";
  },
};

const numeroBR = (n) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const dataHoje = () => new Date().toLocaleDateString("pt-BR");

/* ---------------- Pedaços de schema reaproveitados ---------------- */

const S = {
  texto: (descricao) => ({ type: "string", description: descricao }),
  lista: (descricao) => ({ type: "array", items: { type: "string" }, description: descricao }),
  secoes: (descricao, extra = {}) => ({
    type: "array", description: descricao,
    items: { type: "object", properties: { titulo: { type: "string" }, conteudo_html: { type: "string" }, ...extra }, required: ["titulo", "conteudo_html"] },
  }),
  faq: { type: "array", description: "3 a 5 perguntas frequentes reais sobre o tema", items: { type: "object", properties: { pergunta: { type: "string" }, resposta: { type: "string" } }, required: ["pergunta", "resposta"] } },
  avaliacao: {
    type: "object", description: "Somente para reviews",
    properties: {
      nota_geral: { type: "number", description: "0 a 10" },
      criterios: { type: "array", items: { type: "object", properties: { nome: { type: "string" }, nota: { type: "number" } }, required: ["nome", "nota"] } },
      veredito: { type: "string", description: "Veredito em uma ou duas frases" },
    },
  },
  personagens: (descricao) => ({
    type: "array", description: descricao,
    items: { type: "object", properties: { nome: { type: "string", description: "Nome real, como aparece na obra" }, descricao: { type: "string", description: "Quem é, em uma frase" } }, required: ["nome", "descricao"] },
  }),
};

function schema(propriedades, obrigatorios) {
  return {
    type: "object",
    properties: {
      titulo: S.texto("Título atraente e claro, até 70 caracteres"),
      descricao: S.texto("Descrição para buscadores e redes sociais: 120 a 155 caracteres, resume o post e convida a ler, sem aspas e sem emojis"),
      busca_imagem: S.texto("2 a 4 palavras em inglês para buscar uma foto de capa num banco de imagens (ex.: 'home wifi router')"),
      ...propriedades,
      marcadores: S.lista("3 a 6 marcadores curtos (1 a 3 palavras cada), sem vírgulas e sem parênteses"),
    },
    required: ["titulo", "descricao", "busca_imagem", ...obrigatorios, "marcadores"],
  };
}

/* ---------------- Categorias ---------------- */

const CATEGORIAS = {
  tecnologia: {
    nome: "Tecnologia",
    icone: "💻",
    marcador: "Tecnologia",
    esbocoDica: "Tópicos = seções do post. Em tutoriais, as etapas na ordem em que o leitor vai executar. Em aulas: conceito → tabela de apoio → método → exemplos resolvidos → erros comuns.",
    exemploTema: "Ex.: Como calcular sub-redes: máscara, rede, broadcast e hosts válidos",
    aviso: "Confira versões, preços, especificações, datas e as contas dos exemplos antes de publicar. A IA pode errar.",
    campos: [
      { nome: "formato", rotulo: "Formato", tipo: "chips", opcoes: ["Tutorial", "Aula passo a passo", "Explicação", "Comparativo", "Review", "Novidade"],
        tamanhoPorOpcao: { "Tutorial": "longo", "Aula passo a passo": "extra", "Explicação": "longo" } },
      { nome: "nivel", rotulo: "Nível do leitor", tipo: "chips", opcoes: ["Iniciante", "Intermediário", "Avançado"] },
      { nome: "produto", rotulo: "Produto, software ou versão", tipo: "texto", placeholder: "Ex.: Windows 11, Python 3.14, Cisco Packet Tracer" },
    ],
    instrucoes: `Categoria: TECNOLOGIA (programação, redes, banco de dados, sistemas, hardware, ferramentas). Escreva como um professor experiente e didático, que ensina para o leitor conseguir fazer sozinho depois.
- Adapte o vocabulário ao nível do leitor; explique siglas e termos na primeira vez. Explique o porquê antes do como.
- Em tutoriais, cada seção é uma etapa clara, na ordem certa, com o que o leitor deve ver ao final.
- Sempre que o tema tiver cálculo, conversão, fórmula, regra ou código, resolva ao menos um exemplo completo passo a passo, com valores reais, mostrando cada conta ou cada linha e o resultado final. Não pule etapas "óbvias" para iniciantes.
- Confira cada conta e cada código antes de responder: número errado ou código que não roda é o pior erro num tutorial.
- "tabela" de cada seção: use para tabelas de referência que o leitor consulta durante a explicação, logo abaixo do texto da seção. Exemplos: potências de 2, conversão binário/decimal, máscaras e prefixos CIDR, portas e protocolos, tipos de dados, operadores, comandos e o que fazem, tabela-verdade, comparação de sintaxes. Cada linha deve ter o mesmo número de colunas.
- "codigo": código ou comandos de verdade, completos e funcionais, ou contas passo a passo em texto puro (nesse caso, linguagem "Cálculo"). Em programação, explique as partes importantes do código no texto da seção.
- "saida": o que aparece ao executar o código ou comando daquela seção (opcional, só quando houver código).
- "observacao": uma dica ou atenção curta sobre a seção, como um erro comum (opcional).
- Formato "Aula passo a passo": 1) conceito com analogia simples; 2) tabelas de apoio de que o leitor precisa; 3) o método em etapas numeradas; 4) exemplo resolvido completo; 5) segundo exemplo com uma variação; 6) erros comuns; e preencha "exercicios" com 3 a 5 exercícios parecidos com os exemplos, com resposta explicada.
- "exercicios" também vale em Tutorial e Explicação quando o tema pede prática (cálculo, lógica, código).
- "comparativo" é uma tabela final de comparação entre opções; use no formato Comparativo ou quando comparar alternativas ajudar. Tabelas de apoio vão em "tabela" das seções.
- Não invente números de versão, preços, datas de lançamento ou especificações. Se não tiver certeza, fale de forma genérica ou diga que o leitor deve confirmar no site oficial.`,
    schema: schema({
      resumo: S.lista("3 a 5 frases curtas com os pontos principais (resumo rápido)"),
      introducao_html: S.texto("Introdução em HTML (1 a 2 parágrafos)"),
      requisitos: S.lista("O que o leitor precisa antes de começar (pode ser vazio)"),
      secoes: S.secoes("Seções do post", {
        tabela: {
          type: "object", description: "Tabela de apoio desta seção, exibida logo abaixo do texto (opcional)",
          properties: {
            titulo: S.texto("Título curto da tabela (opcional)"),
            colunas: { type: "array", items: { type: "string" } },
            linhas: { type: "array", items: { type: "array", items: { type: "string" } } },
          },
        },
        codigo: S.texto("Código, comandos ou contas passo a passo desta seção, sem HTML (opcional)"),
        linguagem: S.texto("Linguagem do código, ou 'Cálculo' para contas (opcional)"),
        saida: S.texto("Saída esperada ao executar o código ou comando (opcional)"),
        observacao: S.texto("Dica ou atenção curta sobre esta seção (opcional)"),
      }),
      comparativo: {
        type: "object", description: "Tabela comparativa final entre opções (opcional)",
        properties: { colunas: { type: "array", items: { type: "string" } }, linhas: { type: "array", items: { type: "array", items: { type: "string" } } } },
      },
      pros: S.lista("Pontos positivos (opcional)"),
      contras: S.lista("Pontos negativos (opcional)"),
      exercicios: {
        type: "array", description: "Exercícios para o leitor praticar, com resposta explicada passo a passo (opcional; obrigatório em Aula passo a passo)",
        items: { type: "object", properties: { pergunta: { type: "string" }, resposta: { type: "string", description: "Resposta em HTML, com as contas ou o raciocínio" } }, required: ["pergunta", "resposta"] },
      },
      faq: S.faq,
      conclusao_html: S.texto("Conclusão em HTML"),
    }, ["resumo", "introducao_html", "secoes", "conclusao_html"]),
    montar(d, perfil) {
      return Bloco.caixa("Resumo rápido", lista(d.resumo), perfil.cor) +
        limparHtml(d.introducao_html) +
        (d.requisitos?.length ? Bloco.h2("O que você vai precisar") + lista(d.requisitos) : "") +
        Bloco.secoes(d.secoes, { comCodigo: true, cor: perfil.cor }) +
        Bloco.tabela(d.comparativo?.colunas, d.comparativo?.linhas, perfil.cor) +
        Bloco.prosContras(d.pros, d.contras) +
        Bloco.exercicios(d.exercicios) +
        Bloco.faq(d.faq) +
        Bloco.h2("Conclusão") + limparHtml(d.conclusao_html) +
        `<p style="font-size:13px;opacity:.7;margin-top:24px;">Atualizado em ${dataHoje()}.</p>`;
    },
  },

  receitas: {
    nome: "Receitas",
    icone: "🍲",
    marcador: "Receitas",
    esbocoDica: "Tópicos = destaques que o post vai cobrir além da receita em si (ex.: segredo da massa, variações, como servir). Ficha, ingredientes e modo de preparo já entram automaticamente.",
    exemploTema: "Ex.: Bolo de cenoura fofinho com cobertura de chocolate",
    esconder: ["tamanho"],
    campos: [
      { nome: "rendimento", rotulo: "Rendimento", tipo: "texto", placeholder: "Ex.: 8 fatias" },
      { nome: "dificuldade", rotulo: "Dificuldade", tipo: "chips", opcoes: ["Fácil", "Média", "Difícil"] },
      { nome: "restricoes", rotulo: "Restrições alimentares", tipo: "texto", placeholder: "Ex.: sem glúten, vegana, sem lactose" },
    ],
    instrucoes: `Categoria: RECEITAS. Escreva como um chef que ensina em casa, de forma calorosa e precisa.
- Introdução curta (sem história pessoal inventada): o que torna a receita especial.
- Ingredientes com medidas caseiras E em gramas/ml quando fizer sentido; agrupe (ex.: "Massa", "Cobertura") só se houver mais de uma parte.
- Passos numerados, um por ação, com tempo, temperatura e o ponto certo ("até dourar", "até desgrudar da panela").
- Respeite as restrições alimentares pedidas em todos os ingredientes.
- Siga boas práticas de segurança alimentar (temperaturas, conservação).
- Tempos e rendimento devem ser realistas.`,
    schema: schema({
      introducao_html: S.texto("Introdução em HTML (1 a 2 parágrafos curtos)"),
      rendimento: S.texto("Ex.: 8 porções"),
      tempo_preparo: S.texto("Ex.: 20 min"),
      tempo_cozimento: S.texto("Ex.: 40 min"),
      dificuldade: { type: "string", enum: ["Fácil", "Média", "Difícil"] },
      ingredientes: {
        type: "array", description: "Grupos de ingredientes",
        items: { type: "object", properties: { grupo: S.texto("Nome do grupo ou vazio"), itens: { type: "array", items: { type: "string" } } }, required: ["grupo", "itens"] },
      },
      preparo: {
        type: "array", description: "Grupos de passos",
        items: { type: "object", properties: { grupo: S.texto("Nome do grupo ou vazio"), passos: { type: "array", items: { type: "string" } } }, required: ["grupo", "passos"] },
      },
      dicas: S.lista("Dicas para acertar"),
      substituicoes: S.lista("Substituições possíveis de ingredientes"),
      conservacao: S.texto("Como e por quanto tempo conservar"),
    }, ["introducao_html", "rendimento", "tempo_preparo", "tempo_cozimento", "dificuldade", "ingredientes", "preparo", "conservacao"]),
    montar(d, perfil) {
      const grupos = (itens, chave, ordenada) => (itens || []).map(g =>
        (g.grupo?.trim() && itens.length > 1 ? `<h3>${esc(g.grupo)}</h3>` : "") + lista(g[chave], ordenada)).join("");
      return limparHtml(d.introducao_html) +
        Bloco.ficha([["Rendimento", d.rendimento], ["Tempo de preparo", d.tempo_preparo], ["Tempo de cozimento", d.tempo_cozimento], ["Dificuldade", d.dificuldade]], perfil.cor, "Ficha da receita") +
        Bloco.h2("Ingredientes") + grupos(d.ingredientes, "itens", false) +
        Bloco.h2("Modo de preparo") + grupos(d.preparo, "passos", true) +
        (d.dicas?.length ? Bloco.caixa("Dicas para acertar", lista(d.dicas), perfil.cor) : "") +
        (d.substituicoes?.length ? Bloco.h2("Substituições") + lista(d.substituicoes) : "") +
        (d.conservacao ? Bloco.h2("Como conservar") + `<p>${esc(d.conservacao)}</p>` : "");
    },
  },

  dicas: {
    nome: "Dicas",
    icone: "💡",
    marcador: "Dicas",
    esbocoDica: "Tópicos = as dicas, exatamente na quantidade pedida, das mais úteis para as menos úteis.",
    exemploTema: "Ex.: Como economizar na conta de luz",
    campos: [
      { nome: "quantidade", rotulo: "Quantidade de dicas", tipo: "chips", opcoes: ["5", "7", "10", "15"], padrao: "7" },
    ],
    instrucoes: `Categoria: DICAS. Escreva de forma prática e direta, como um especialista que quer ajudar de verdade.
- Gere exatamente a quantidade de dicas pedida.
- Cada dica tem um título curto e acionável (começando com verbo) e uma explicação com o "como fazer" e o "por quê".
- Evite dicas óbvias ou repetidas; prefira as mais úteis e específicas primeiro.
- Inclua erros comuns e um checklist final para o leitor aplicar.`,
    schema: schema({
      introducao_html: S.texto("Introdução em HTML (1 a 2 parágrafos)"),
      resumo: S.lista("3 a 5 frases curtas com o essencial"),
      dicas: {
        type: "array", description: "Lista de dicas",
        items: { type: "object", properties: { titulo: S.texto("Título curto começando com verbo"), explicacao_html: S.texto("Explicação em HTML") }, required: ["titulo", "explicacao_html"] },
      },
      erros_comuns: S.lista("Erros comuns a evitar"),
      checklist: S.lista("Checklist final, itens curtos"),
      conclusao_html: S.texto("Conclusão em HTML"),
    }, ["introducao_html", "resumo", "dicas", "checklist", "conclusao_html"]),
    montar(d, perfil) {
      return limparHtml(d.introducao_html) +
        Bloco.caixa("Resumo rápido", lista(d.resumo), perfil.cor) +
        (d.dicas || []).map((dica, i) => `<h2>${i + 1}. ${esc(dica.titulo)}</h2>${limparHtml(dica.explicacao_html)}`).join("") +
        (d.erros_comuns?.length ? Bloco.caixa("Erros comuns", lista(d.erros_comuns), "#c62828") : "") +
        (d.checklist?.length ? Bloco.h2("Checklist") + `<ul style="list-style:none;padding-left:0;">${d.checklist.map(i => `<li style="margin:6px 0;">✅ ${esc(i)}</li>`).join("")}</ul>` : "") +
        Bloco.h2("Conclusão") + limparHtml(d.conclusao_html);
    },
  },

  games: {
    nome: "Games",
    icone: "🎮",
    marcador: "Games",
    esbocoDica: "Tópicos = seções do post. Em reviews: jogabilidade, gráficos, som, história, desempenho. Em top listas: os itens na ordem da lista.",
    exemploTema: "Ex.: Vale a pena jogar Hollow Knight em 2026?",
    aviso: "Confira datas de lançamento, plataformas, preços e requisitos antes de publicar. A IA pode estar desatualizada.",
    campos: [
      { nome: "formato", rotulo: "Formato", tipo: "chips", opcoes: ["Review", "Resumo da história", "Guia", "Dicas", "Top lista", "Notícia"], tamanhoPorOpcao: { "Resumo da história": "longo" } },
      { nome: "jogo", rotulo: "Jogo", tipo: "texto", placeholder: "Ex.: Hollow Knight" },
      { nome: "plataforma", rotulo: "Plataforma", tipo: "texto", placeholder: "Ex.: PC, PS5, Switch" },
      { nome: "spoilers", rotulo: "Spoilers", tipo: "chips", opcoes: ["Sem spoilers", "Pode ter spoilers"] },
    ],
    instrucoes: `Categoria: GAMES. Escreva como um jornalista de games apaixonado, mas criterioso e honesto.
- Review: avalie jogabilidade, gráficos, som, história e desempenho; preencha "avaliacao" com notas de 0 a 10 coerentes com o texto.
- Resumo da história: conte a história REAL do jogo, na ordem, com os nomes verdadeiros dos personagens, lugares e acontecimentos. Não é ficção: nunca invente personagens ou eventos. Cada seção é um capítulo, ato ou arco do jogo. Preencha "personagens". Não preencha "avaliacao".
- Guia/Dicas: seções práticas e ordenadas, com nomes corretos de itens, fases e mecânicas.
- Top lista: cada item da lista é uma seção com o porquê de estar ali.
- Respeite a opção de spoilers; em "Sem spoilers" não revele reviravoltas nem o final.
- Não invente datas, preços, requisitos de PC, desenvolvedoras ou notas de outros sites. Use "A confirmar" quando não tiver certeza.
- Preencha "requisitos_pc" só se tiver certeza dos dados.`,
    schema: schema({
      introducao_html: S.texto("Introdução em HTML"),
      ficha: {
        type: "object", description: "Ficha técnica; use 'A confirmar' se não souber",
        properties: { jogo: { type: "string" }, genero: { type: "string" }, plataformas: { type: "string" }, desenvolvedora: { type: "string" }, lancamento: { type: "string" } },
        required: ["jogo", "genero", "plataformas", "desenvolvedora", "lancamento"],
      },
      personagens: S.personagens("Só em resumos da história: 3 a 8 personagens principais"),
      secoes: S.secoes("Seções do post"),
      avaliacao: S.avaliacao,
      pros: S.lista("Pontos positivos"),
      contras: S.lista("Pontos negativos"),
      requisitos_pc: { type: "object", description: "Opcional", properties: { minimos: { type: "string" }, recomendados: { type: "string" } } },
      conclusao_html: S.texto("Conclusão em HTML"),
    }, ["introducao_html", "ficha", "secoes", "conclusao_html"]),
    montar(d, perfil, entrada) {
      const f = d.ficha || {};
      const requisitos = d.requisitos_pc?.minimos || d.requisitos_pc?.recomendados
        ? Bloco.h2("Requisitos para PC") + Bloco.ficha([["Mínimos", d.requisitos_pc.minimos], ["Recomendados", d.requisitos_pc.recomendados]], perfil.cor)
        : "";
      return Bloco.avisoSpoiler(entrada) +
        limparHtml(d.introducao_html) +
        Bloco.ficha([["Jogo", f.jogo], ["Gênero", f.genero], ["Plataformas", f.plataformas], ["Desenvolvedora", f.desenvolvedora], ["Lançamento", f.lancamento]], perfil.cor, "Ficha técnica") +
        Bloco.personagens(d.personagens, perfil.cor) +
        Bloco.secoes(d.secoes) +
        Bloco.avaliacao(d.avaliacao, perfil.cor) +
        Bloco.prosContras(d.pros, d.contras) +
        requisitos +
        Bloco.h2("Conclusão") + limparHtml(d.conclusao_html);
    },
  },

  filmes: {
    nome: "Filmes e Animes",
    icone: "🎬",
    marcador: "Filmes e Animes",
    esbocoDica: "Tópicos = seções do post. Em resumos: arcos, sagas ou temporadas na ordem. Em reviews: roteiro, personagens, direção/animação, trilha. Em top listas: os itens na ordem da lista.",
    exemploTema: "Ex.: Resumo de Dragon Ball: da busca pelas esferas ao Torneio de Artes Marciais",
    aviso: "Confira nomes, datas, episódios e onde assistir antes de publicar. A IA pode errar detalhes ou estar desatualizada.",
    campos: [
      { nome: "formato", rotulo: "Formato", tipo: "chips", opcoes: ["Resumo", "Review", "Explicação do final", "Guia de temporadas", "Top lista", "Notícia"], tamanhoPorOpcao: { "Resumo": "longo", "Guia de temporadas": "longo" } },
      { nome: "obra", rotulo: "Filme, série ou anime", tipo: "texto", placeholder: "Ex.: Dragon Ball, Interestelar, Breaking Bad" },
      { nome: "tipoObra", rotulo: "Tipo", tipo: "chips", opcoes: ["Anime", "Filme", "Série", "Desenho", "Dorama"] },
      { nome: "spoilers", rotulo: "Spoilers", tipo: "chips", opcoes: ["Sem spoilers", "Pode ter spoilers"] },
    ],
    instrucoes: `Categoria: FILMES E ANIMES. Escreva como um crítico e fã de cinema, séries e animes: apaixonado, mas fiel à obra.
- Trate sempre da obra REAL indicada, com os nomes verdadeiros dos personagens, lugares, técnicas e acontecimentos. Isto NÃO é ficção: nunca invente personagens, cenas ou eventos, nem troque nomes.
- Resumo: conte a história na ordem em que acontece; cada seção é um arco, saga, temporada ou ato. Explique quem é quem, o que está em jogo e como a trama avança.
- Review: avalie roteiro, personagens, direção ou animação, trilha e ritmo; preencha "avaliacao" com notas de 0 a 10 coerentes com o texto.
- Explicação do final: relembre o essencial da trama e explique o final e as interpretações mais aceitas, deixando claro o que é teoria.
- Guia de temporadas: uma seção por temporada, saga ou filme, na ordem de lançamento ou na ordem recomendada para assistir.
- Top lista: cada item é uma seção com o porquê de estar ali.
- Respeite a opção de spoilers; em "Sem spoilers" apresente só a premissa e o início, sem reviravoltas nem final.
- Se não conhecer bem a obra, diga isso na introdução e fique no que tem certeza; nunca preencha lacunas inventando.
- Não invente datas, número de episódios, estúdios, bilheteria ou onde assistir. Use "A confirmar" quando não tiver certeza.
- "faq": 3 a 5 perguntas que as pessoas realmente pesquisam sobre a obra (ordem para assistir, quantos episódios, se tem continuação, onde assistir…), com respostas curtas. Respeite a opção de spoilers e não invente respostas: se não tiver certeza, deixe a pergunta de fora.`,
    schema: schema({
      introducao_html: S.texto("Introdução em HTML"),
      ficha: {
        type: "object", description: "Ficha técnica; use 'A confirmar' se não souber",
        properties: {
          titulo: S.texto("Título no Brasil e, se diferente, o original"), tipo: { type: "string" }, ano: S.texto("Ano ou período de exibição"),
          criacao: S.texto("Diretor, criador, autor do mangá ou estúdio"), duracao: S.texto("Duração do filme ou número de temporadas/episódios"),
          generos: { type: "string" }, onde_assistir: S.texto("Onde assistir no Brasil, ou 'A confirmar'"),
        },
        required: ["titulo", "tipo", "ano", "criacao", "duracao", "generos"],
      },
      personagens: S.personagens("3 a 8 personagens principais da obra, com os nomes reais"),
      secoes: S.secoes("Seções do post"),
      avaliacao: S.avaliacao,
      pros: S.lista("Somente em reviews: pontos positivos"),
      contras: S.lista("Somente em reviews: pontos negativos"),
      faq: S.faq,
      conclusao_html: S.texto("Conclusão em HTML"),
    }, ["introducao_html", "ficha", "personagens", "secoes", "conclusao_html"]),
    montar(d, perfil, entrada) {
      const f = d.ficha || {};
      return Bloco.avisoSpoiler(entrada) +
        limparHtml(d.introducao_html) +
        Bloco.ficha([["Título", f.titulo], ["Tipo", f.tipo], ["Ano", f.ano], ["Criação", f.criacao], ["Duração", f.duracao], ["Gêneros", f.generos], ["Onde assistir", f.onde_assistir]], perfil.cor, "Ficha técnica") +
        Bloco.personagens(d.personagens, perfil.cor) +
        Bloco.secoes(d.secoes) +
        Bloco.avaliacao(d.avaliacao, perfil.cor) +
        Bloco.prosContras(d.pros, d.contras) +
        Bloco.faq(d.faq) +
        Bloco.h2("Conclusão") + limparHtml(d.conclusao_html);
    },
  },

  resumos: {
    nome: "Resumos",
    icone: "📚",
    marcador: "Resumos",
    esbocoDica: "Tópicos = as partes do resumo na ordem (capítulos, arcos, fases, períodos ou ideias principais), com uma frase cada.",
    exemploTema: "Ex.: Resumo do livro Dom Casmurro",
    aviso: "Confira nomes, datas e fatos antes de publicar. A IA pode errar detalhes de obras e acontecimentos.",
    campos: [
      { nome: "tipoResumo", rotulo: "O que resumir", tipo: "chips", opcoes: ["Livro", "Filme", "Série ou anime", "Jogo", "Fato histórico", "Assunto de estudo", "Outro"] },
      { nome: "obra", rotulo: "Nome da obra ou assunto", tipo: "texto", placeholder: "Ex.: Dom Casmurro, The Last of Us, Revolução Francesa" },
      { nome: "profundidade", rotulo: "Profundidade", tipo: "chips", opcoes: ["Rápido", "Completo", "Por partes"], padrao: "Completo", tamanhoPorOpcao: { "Rápido": "curto", "Completo": "longo", "Por partes": "longo" } },
      { nome: "spoilers", rotulo: "Spoilers", tipo: "chips", opcoes: ["Pode ter spoilers", "Sem spoilers"] },
    ],
    instrucoes: `Categoria: RESUMOS. Escreva como um professor que resume com clareza e fidelidade.
- Resuma o assunto ou a obra REAL indicada, com nomes, lugares, datas e acontecimentos verdadeiros. Isto NÃO é ficção: nunca invente personagens, fatos ou eventos, nem troque nomes.
- Rápido: poucas seções curtas com o essencial. Completo: todas as partes importantes, na ordem. Por partes: uma seção por capítulo, arco, temporada, fase ou período.
- Obras (livro, filme, série, anime, jogo): conte a trama na ordem, explique quem é quem e preencha "personagens". Fatos históricos: contexto, causas, principais acontecimentos e consequências; em "personagens", as pessoas importantes. Assuntos de estudo: conceitos na ordem lógica; deixe "personagens" vazio.
- Respeite a opção de spoilers; em "Sem spoilers" fique na premissa e no começo, sem revelar reviravoltas nem o final.
- "ficha": 3 a 6 dados objetivos adequados ao assunto (ex.: autor, ano, gênero; ou período, local). Use "A confirmar" quando não tiver certeza.
- Se não conhecer bem o assunto, diga isso na introdução e fique no que tem certeza; nunca preencha lacunas inventando.
- "faq": 3 a 5 perguntas que as pessoas realmente pesquisam sobre o assunto, com respostas curtas. Respeite a opção de spoilers e não invente respostas: se não tiver certeza, deixe a pergunta de fora.`,
    schema: schema({
      resumo_rapido: S.lista("3 a 5 frases curtas com o essencial (para quem tem pressa)"),
      introducao_html: S.texto("Introdução em HTML: do que se trata e por que importa"),
      ficha: {
        type: "array", description: "3 a 6 dados objetivos sobre a obra ou o assunto",
        items: { type: "object", properties: { rotulo: { type: "string" }, valor: { type: "string" } }, required: ["rotulo", "valor"] },
      },
      personagens: S.personagens("Personagens ou pessoas principais, com os nomes reais; vazio se não se aplicar"),
      secoes: S.secoes("Partes do resumo, na ordem"),
      pontos_chave: S.lista("3 a 6 ideias, temas ou lições principais"),
      faq: S.faq,
      conclusao_html: S.texto("Conclusão em HTML"),
    }, ["resumo_rapido", "introducao_html", "ficha", "secoes", "conclusao_html"]),
    montar(d, perfil, entrada) {
      return Bloco.avisoSpoiler(entrada) +
        Bloco.caixa("Resumo rápido", lista(d.resumo_rapido), perfil.cor) +
        limparHtml(d.introducao_html) +
        Bloco.ficha((d.ficha || []).map(i => [i?.rotulo, i?.valor]).filter(([k]) => k), perfil.cor, "Ficha") +
        Bloco.personagens(d.personagens, perfil.cor, "Quem é quem") +
        Bloco.secoes(d.secoes) +
        (d.pontos_chave?.length ? Bloco.h2("Pontos principais") + lista(d.pontos_chave) : "") +
        Bloco.faq(d.faq) +
        Bloco.h2("Conclusão") + limparHtml(d.conclusao_html);
    },
  },

  historias: {
    nome: "Histórias",
    icone: "📖",
    marcador: "Histórias",
    checarFatos: false,
    esbocoDica: "Tópicos = momentos da história em ordem (apresentação, conflito, virada, clímax, desfecho), com uma frase cada. Títulos das opções criativos e curtos.",
    exemploTema: "Ex.: Um farol que acende sozinho em noites sem tempestade",
    esconder: ["palavrasChave", "publico", "tom"],
    campos: [
      { nome: "genero", rotulo: "Gênero", tipo: "chips", opcoes: ["Aventura", "Fantasia", "Mistério", "Terror", "Romance", "Ficção científica", "Drama", "Comédia", "Infantil"] },
      { nome: "narrador", rotulo: "Narrador", tipo: "chips", opcoes: ["1ª pessoa", "3ª pessoa"] },
      { nome: "publicoHistoria", rotulo: "Para quem", tipo: "chips", opcoes: ["Crianças", "Jovens", "Adultos"] },
      { nome: "final", rotulo: "Final", tipo: "chips", opcoes: ["Feliz", "Aberto", "Reviravolta", "Melancólico"] },
    ],
    instrucoes: `Categoria: HISTÓRIAS (ficção original). Escreva como um autor literário talentoso.
- A história deve ser 100% original: não copie nem imite de perto obras, personagens ou marcas existentes.
- Mostre em vez de contar: cenas, sentidos, ações e diálogos. Diálogos com travessão (—), no padrão do português do Brasil.
- Mantenha o mesmo narrador e tempo verbal do início ao fim; personagens com nomes e motivações claras.
- Estrutura: gancho forte no primeiro parágrafo, conflito que cresce, clímax e o tipo de final pedido.
- Linguagem e temas adequados ao público escolhido; para crianças, nada assustador demais e frases mais simples.
- Evite clichês e moral explícita no final.
- Os parágrafos são texto puro, sem HTML. Use "partes" com título só se a história for longa; senão, uma única parte sem título.`,
    schema: schema({
      subtitulo: S.texto("Uma frase de gancho que desperta curiosidade"),
      partes: {
        type: "array", description: "Partes da história",
        items: { type: "object", properties: { titulo: S.texto("Título da parte ou vazio"), paragrafos: { type: "array", items: { type: "string" } } }, required: ["titulo", "paragrafos"] },
      },
    }, ["subtitulo", "partes"]),
    montar(d, perfil) {
      const partes = (d.partes || []).filter(p => p?.paragrafos?.length);
      return (d.subtitulo ? `<p style="font-size:1.15em;font-style:italic;opacity:.85;">${esc(d.subtitulo)}</p>` : "") +
        partes.map((p, i) =>
          (p.titulo?.trim() ? Bloco.h2(p.titulo) : i > 0 ? `<p style="text-align:center;letter-spacing:.5em;margin:28px 0;">* * *</p>` : "") +
          p.paragrafos.map(t => String(t).trim()).filter(Boolean).map(t => `<p>${esc(t)}</p>`).join("")).join("");
    },
  },

  geral: {
    nome: "Geral",
    icone: "📝",
    marcador: "",
    esbocoDica: "Tópicos = as seções (subtítulos) do post, na ordem.",
    exemploTema: "Ex.: Como montar uma horta em apartamento",
    campos: [],
    instrucoes: `Categoria: GERAL.
- conteudo_html: HTML com <h2> para os subtítulos, <h3>, <p>, <ul>/<ol>/<li>, <strong>, <em>, <blockquote>, <a>.
- Comece com uma introdução que prenda o leitor e termine com uma conclusão.`,
    schema: schema({ conteudo_html: S.texto("Conteúdo completo do post em HTML") }, ["conteudo_html"]),
    montar(d) { return limparHtml(d.conteudo_html, { permitirH2: true }); },
  },
};

/**
 * Separa marcadores digitados/gerados. O Blogger usa a vírgula como separador de marcadores,
 * então vírgulas dentro de parênteses viram "/" (ex.: "Tipos de redes (LAN, WAN)" → "Tipos de redes (LAN/WAN)").
 * Também junta pedaços que ficaram quebrados antes desta correção ("… (LAN" + "WAN)").
 */
function separarMarcadores(texto) {
  const partes = [];
  let atual = "";
  let nivel = 0;
  for (const c of String(texto || "")) {
    if (c === "(") nivel++;
    if (c === ")") nivel = Math.max(0, nivel - 1);
    if ((c === "," || c === ";" || c === "\n") && nivel === 0) { partes.push(atual); atual = ""; continue; }
    atual += c;
  }
  partes.push(atual);
  const limpos = partes
    .map(m => m.replace(/\s*,\s*/g, "/").replace(/[<>&"]/g, "").replace(/\s+/g, " ").trim())
    .map(m => (m.split("(").length > m.split(")").length ? m + ")" : m))
    .filter(Boolean);
  return limpos.filter((m, i) => limpos.findIndex(x => x.toLowerCase() === m.toLowerCase()) === i);
}

/** Descrição de pesquisa: texto puro, uma linha, até 160 caracteres (corta em palavra inteira). */
function limparDescricao(texto) {
  let d = String(texto || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  if (d.length > 160) d = d.slice(0, 157).replace(/\s+\S*$/, "") + "…";
  return d;
}

const ORDEM_CATEGORIAS = ["tecnologia", "receitas", "dicas", "games", "filmes", "resumos", "historias", "geral"];

function categoria(id) { return CATEGORIAS[id] || CATEGORIAS.geral; }

/** Monta o HTML final do post a partir da resposta estruturada da IA. */
function montarPost(idCategoria, dados, perfil, entrada = {}) {
  const cat = categoria(idCategoria);
  const html = cat.montar(dados, perfil, entrada) + Bloco.fechamento(perfil);
  const marcadores = separarMarcadores([cat.marcador, ...(dados.marcadores || [])].map(m => String(m || "")).join(","));
  return {
    titulo: String(dados.titulo || "").trim(),
    descricao: limparDescricao(dados.descricao),
    buscaImagem: String(dados.busca_imagem || "").trim(),
    conteudo: html,
    marcadores,
  };
}
