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

const TAGS_TEXTO = new Set(["P", "H3", "H4", "UL", "OL", "LI", "STRONG", "EM", "B", "I", "A", "BLOCKQUOTE", "BR", "CODE"]);
const TAGS_REMOVER = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON", "TEMPLATE", "SVG", "MATH"]);
const TAGS_LAYOUT = new Set(["DIV", "SPAN", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "PRE", "H2"]);
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
      `<pre style="background:#1e1f22;color:#f1f1f1;padding:14px 16px;border-radius:8px;overflow-x:auto;font-size:14px;line-height:1.5;margin:0 0 20px;white-space:pre;"><code>${esc(codigo.replace(/\s+$/, ""))}</code></pre>`;
  },
  secoes(secoes, { comCodigo = false } = {}) {
    return (secoes || []).filter(s => s?.titulo || s?.conteudo_html).map(s =>
      (s.titulo ? Bloco.h2(s.titulo) : "") + limparHtml(s.conteudo_html) +
      (comCodigo ? Bloco.codigo(s.codigo, s.linguagem) : "")).join("");
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
};

function schema(propriedades, obrigatorios) {
  return {
    type: "object",
    properties: {
      titulo: S.texto("Título atraente e claro, até 70 caracteres"),
      ...propriedades,
      marcadores: S.lista("3 a 6 marcadores curtos e relevantes"),
    },
    required: ["titulo", ...obrigatorios, "marcadores"],
  };
}

/* ---------------- Categorias ---------------- */

const CATEGORIAS = {
  tecnologia: {
    nome: "Tecnologia",
    icone: "💻",
    marcador: "Tecnologia",
    esbocoDica: "Tópicos = seções do post. Em tutoriais, as etapas na ordem em que o leitor vai executar.",
    exemploTema: "Ex.: Como configurar uma VPN no roteador de casa",
    aviso: "Confira versões, preços, especificações e datas antes de publicar. A IA pode estar desatualizada.",
    campos: [
      { nome: "formato", rotulo: "Formato", tipo: "chips", opcoes: ["Tutorial", "Explicação", "Comparativo", "Review", "Novidade"] },
      { nome: "nivel", rotulo: "Nível do leitor", tipo: "chips", opcoes: ["Iniciante", "Intermediário", "Avançado"] },
      { nome: "produto", rotulo: "Produto, software ou versão", tipo: "texto", placeholder: "Ex.: Windows 11, iPhone 17, Python 3.14" },
    ],
    instrucoes: `Categoria: TECNOLOGIA. Escreva como um jornalista de tecnologia experiente e didático.
- Adapte o vocabulário ao nível do leitor; explique siglas na primeira vez.
- Em tutoriais, cada seção é uma etapa clara, na ordem certa, com o que o leitor deve ver ao final.
- Use "codigo" só quando houver comandos ou código de verdade; o código deve ser completo e funcional.
- Preencha "comparativo" apenas no formato Comparativo (ou quando uma tabela realmente ajudar).
- Não invente números de versão, preços, datas de lançamento ou especificações. Se não tiver certeza, fale de forma genérica ou diga que o leitor deve confirmar no site oficial.`,
    schema: schema({
      resumo: S.lista("3 a 5 frases curtas com os pontos principais (resumo rápido)"),
      introducao_html: S.texto("Introdução em HTML (1 a 2 parágrafos)"),
      requisitos: S.lista("O que o leitor precisa antes de começar (pode ser vazio)"),
      secoes: S.secoes("Seções do post", { codigo: S.texto("Código ou comandos desta seção, sem HTML (opcional)"), linguagem: S.texto("Linguagem do código (opcional)") }),
      comparativo: {
        type: "object", description: "Tabela comparativa (opcional)",
        properties: { colunas: { type: "array", items: { type: "string" } }, linhas: { type: "array", items: { type: "array", items: { type: "string" } } } },
      },
      pros: S.lista("Pontos positivos (opcional)"),
      contras: S.lista("Pontos negativos (opcional)"),
      faq: S.faq,
      conclusao_html: S.texto("Conclusão em HTML"),
    }, ["resumo", "introducao_html", "secoes", "conclusao_html"]),
    montar(d, perfil) {
      return Bloco.caixa("Resumo rápido", lista(d.resumo), perfil.cor) +
        limparHtml(d.introducao_html) +
        (d.requisitos?.length ? Bloco.h2("O que você vai precisar") + lista(d.requisitos) : "") +
        Bloco.secoes(d.secoes, { comCodigo: true }) +
        Bloco.tabela(d.comparativo?.colunas, d.comparativo?.linhas, perfil.cor) +
        Bloco.prosContras(d.pros, d.contras) +
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
      { nome: "formato", rotulo: "Formato", tipo: "chips", opcoes: ["Review", "Guia", "Dicas", "Top lista", "Notícia"] },
      { nome: "jogo", rotulo: "Jogo", tipo: "texto", placeholder: "Ex.: Hollow Knight" },
      { nome: "plataforma", rotulo: "Plataforma", tipo: "texto", placeholder: "Ex.: PC, PS5, Switch" },
      { nome: "spoilers", rotulo: "Spoilers", tipo: "chips", opcoes: ["Sem spoilers", "Pode ter spoilers"] },
    ],
    instrucoes: `Categoria: GAMES. Escreva como um jornalista de games apaixonado, mas criterioso e honesto.
- Review: avalie jogabilidade, gráficos, som, história e desempenho; preencha "avaliacao" com notas de 0 a 10 coerentes com o texto.
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
      secoes: S.secoes("Seções do post"),
      avaliacao: {
        type: "object", description: "Somente para reviews",
        properties: {
          nota_geral: { type: "number", description: "0 a 10" },
          criterios: { type: "array", items: { type: "object", properties: { nome: { type: "string" }, nota: { type: "number" } }, required: ["nome", "nota"] } },
          veredito: S.texto("Veredito em uma ou duas frases"),
        },
      },
      pros: S.lista("Pontos positivos"),
      contras: S.lista("Pontos negativos"),
      requisitos_pc: { type: "object", description: "Opcional", properties: { minimos: { type: "string" }, recomendados: { type: "string" } } },
      conclusao_html: S.texto("Conclusão em HTML"),
    }, ["introducao_html", "ficha", "secoes", "conclusao_html"]),
    montar(d, perfil, entrada) {
      const f = d.ficha || {};
      const a = d.avaliacao;
      const nota = (n) => numeroBR(Math.max(0, Math.min(10, Number(n) || 0)));
      const avaliacao = a && Number.isFinite(Number(a.nota_geral)) && Number(a.nota_geral) > 0
        ? `<div style="text-align:center;border:2px solid ${corValida(perfil.cor)};border-radius:12px;padding:18px;margin:28px 0;">` +
          `<div style="font-size:52px;font-weight:bold;line-height:1;color:${corValida(perfil.cor)};">${nota(a.nota_geral)}</div><div style="opacity:.75;">de 10</div>` +
          (a.veredito ? `<p style="margin:12px 0 0;"><strong>Veredito:</strong> ${esc(a.veredito)}</p>` : "") + `</div>` +
          Bloco.ficha((a.criterios || []).map(c => [c.nome, `${nota(c.nota)} / 10`]), perfil.cor, "Notas por critério")
        : "";
      const requisitos = d.requisitos_pc?.minimos || d.requisitos_pc?.recomendados
        ? Bloco.h2("Requisitos para PC") + Bloco.ficha([["Mínimos", d.requisitos_pc.minimos], ["Recomendados", d.requisitos_pc.recomendados]], perfil.cor)
        : "";
      return (entrada.spoilers === "Pode ter spoilers" ? Bloco.caixa("", "<p style=\"margin:0;font-weight:bold;\">⚠️ Atenção: este post contém spoilers.</p>", "#c62828") : "") +
        limparHtml(d.introducao_html) +
        Bloco.ficha([["Jogo", f.jogo], ["Gênero", f.genero], ["Plataformas", f.plataformas], ["Desenvolvedora", f.desenvolvedora], ["Lançamento", f.lancamento]], perfil.cor, "Ficha técnica") +
        Bloco.secoes(d.secoes) +
        avaliacao +
        Bloco.prosContras(d.pros, d.contras) +
        requisitos +
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

const ORDEM_CATEGORIAS = ["tecnologia", "receitas", "dicas", "games", "historias", "geral"];

function categoria(id) { return CATEGORIAS[id] || CATEGORIAS.geral; }

/** Monta o HTML final do post a partir da resposta estruturada da IA. */
function montarPost(idCategoria, dados, perfil, entrada = {}) {
  const cat = categoria(idCategoria);
  const html = cat.montar(dados, perfil, entrada) + Bloco.fechamento(perfil);
  const marcadores = [cat.marcador, ...(dados.marcadores || [])].map(m => String(m || "").trim()).filter(Boolean);
  const unicos = marcadores.filter((m, i) => marcadores.findIndex(x => x.toLowerCase() === m.toLowerCase()) === i);
  return { titulo: String(dados.titulo || "").trim(), conteudo: html, marcadores: unicos };
}
