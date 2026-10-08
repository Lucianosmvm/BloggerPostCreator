// Gera as imagens de um post do blog (capa + cenas) com o mascote dos vídeos.
//
//   node render.mjs <spec.json>   (normalmente chamado por ferramentas/imagens_post.py)
//
// spec.json: { "post": "1-operadores-em-csharp", "saida": "<pasta opcional>",
//   "imagens": [ { "arquivo": "capa.png", "tipo": "capa", "titulo": "...", "pose": "apontando" },
//                { "arquivo": "cena-1.png", "tipo": "cena", "codigo": ["..."], "pose": "lupa" } ] }
// Campos de cada imagem: ver PostImagemProps em src/PostImagem.tsx.
// Saída padrão: out/<post>/
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const arq = process.argv[2];
if (!arq) {
  console.error("uso: node render.mjs <spec.json>");
  process.exit(1);
}
const spec = JSON.parse(fs.readFileSync(arq, "utf8"));
const raiz = path.dirname(fileURLToPath(import.meta.url));
const saida = spec.saida || path.join(raiz, "out", spec.post);
fs.mkdirSync(saida, { recursive: true });

const serveUrl = await bundle({ entryPoint: path.join(raiz, "src", "index.ts") });
const browser = await openBrowser("chrome");
for (const img of spec.imagens) {
  const { arquivo, ...props } = img;
  // campo ausente vira null: senão o Remotion completa com o exemplo do Root.tsx
  const vazios = Object.fromEntries(["titulo", "subtitulo", "placa", "codigo", "itens", "frase", "lado"].map((k) => [k, null]));
  const props2 = { ...vazios, marca: spec.marca, ...props };
  const id = props.tipo === "capa" ? "PostCapa" : "PostCena";
  const composition = await selectComposition({ serveUrl, id, inputProps: props2, puppeteerInstance: browser });
  const destino = path.join(saida, arquivo);
  await renderStill({ composition, serveUrl, output: destino, inputProps: props2, puppeteerInstance: browser, imageFormat: arquivo.endsWith(".jpg") ? "jpeg" : "png" });
  console.log(destino);
}
await browser.close({ silent: true });
