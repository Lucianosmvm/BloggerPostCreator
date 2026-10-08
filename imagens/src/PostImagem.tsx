import { AbsoluteFill, Img, staticFile } from "remotion";
import { loadFont } from "@remotion/google-fonts/Poppins";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

loadFont("normal", { weights: ["600", "800", "900"], subsets: ["latin", "latin-ext"] });
loadMono("normal", { weights: ["500", "700"], subsets: ["latin"] });

// Imagens paradas dos posts do blog (capa + cenas), com as mesmas poses
// recortadas do mascote dos vídeos: o personagem fica idêntico, custo zero.
//
//   capa: título grande + mascote, 1200x630 (tamanho de compartilhamento)
//   cena: mascote ao lado de um quadro com código, lista ou frase, 1200x675
export type PostImagemProps = {
  tipo: "capa" | "cena";
  titulo?: string;
  subtitulo?: string; // capa: linha pequena acima do título; cena: legenda do quadro
  pose: string;
  placa?: string; // texto curto na placa (pose vira "placa")
  codigo?: string[]; // linhas de código no quadro
  itens?: string[]; // ou uma lista
  frase?: string; // ou uma frase grande
  marca?: string; // rodapé, ex. "Devs na Prática"
  lado?: "esq" | "dir"; // lado do mascote
};

const COR = { fundo: "#14111f", fundo2: "#221a3a", roxo: "#a78bfa", ambar: "#fbbf24", texto: "#f4f1ff", suave: "#b9b2d6" };
const OLHA_ESQ = ["apontando", "explicando", "lupa", "perfil"];
// área branca da placa em placa.png, em % do sprite (igual a Mascote.tsx)
const PLACA = { x: 5.4, y: 37.4, w: 88.8, h: 37.9 };

const Fundo: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(circle at 78% 30%, ${COR.fundo2} 0%, ${COR.fundo} 62%)`,
    }}
  >
    <AbsoluteFill
      style={{
        backgroundImage: `linear-gradient(rgba(167,139,250,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,.07) 1px, transparent 1px)`,
        backgroundSize: "48px 48px",
      }}
    />
  </AbsoluteFill>
);

const Boneco: React.FC<{ pose: string; placa?: string; altura: number; espelhar: boolean }> = ({ pose: pedida, placa, altura, espelhar }) => {
  const pose = placa ? "placa" : pedida;
  return (
    <div style={{ position: "relative", height: altura, filter: "drop-shadow(0 18px 24px rgba(0,0,0,.45))" }}>
      <Img src={staticFile(`mascote/${pose}.png`)} style={{ height: altura, transform: espelhar ? "scaleX(-1)" : undefined }} />
      {pose === "placa" && placa && (
        <div
          style={{
            position: "absolute", left: `${PLACA.x}%`, top: `${PLACA.y}%`, width: `${PLACA.w}%`, height: `${PLACA.h}%`,
            display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
            fontFamily: "Poppins", fontWeight: 900, color: "#1d2416", lineHeight: 1.05,
            fontSize: Math.min(altura * 0.1, (altura * 0.5) / Math.max(4, Math.min(placa.length, 12))),
          }}
        >
          {placa}
        </div>
      )}
    </div>
  );
};

const Marca: React.FC<{ texto?: string; direita?: boolean }> = ({ texto, direita }) =>
  texto ? (
    <div style={{ position: "absolute", bottom: 26, [direita ? "right" : "left"]: 48, fontFamily: "Poppins", fontWeight: 800, fontSize: 22, color: COR.suave, letterSpacing: 1 }}>
      <span style={{ color: COR.ambar }}>●</span> {texto}
    </div>
  ) : null;

const Quadro: React.FC<Pick<PostImagemProps, "codigo" | "itens" | "frase" | "subtitulo" | "titulo">> = ({ codigo, itens, frase, subtitulo, titulo }) => (
  <div
    style={{
      background: "rgba(20,17,31,.85)", border: `2px solid rgba(167,139,250,.45)`, borderRadius: 20,
      padding: "28px 34px", boxShadow: "0 20px 50px rgba(0,0,0,.4)", maxWidth: 700,
    }}
  >
    {titulo && <div style={{ fontFamily: "Poppins", fontWeight: 900, fontSize: 38, color: COR.texto, marginBottom: 16, lineHeight: 1.1 }}>{titulo}</div>}
    {codigo && (
      <div style={{ fontFamily: "JetBrains Mono", fontWeight: 500, fontSize: codigo.length > 7 ? 24 : 30, lineHeight: 1.5, color: COR.texto, whiteSpace: "pre" }}>
        {codigo.map((l, i) => (
          <div key={i}>{colorir(l)}</div>
        ))}
      </div>
    )}
    {itens && (
      <div style={{ fontFamily: "Poppins", fontWeight: 600, fontSize: 30, color: COR.texto, lineHeight: 1.45 }}>
        {itens.map((t, i) => (
          <div key={i}>
            <span style={{ color: COR.ambar, fontWeight: 900 }}>›</span> {t}
          </div>
        ))}
      </div>
    )}
    {frase && <div style={{ fontFamily: "Poppins", fontWeight: 800, fontSize: 44, color: COR.texto, lineHeight: 1.2 }}>{frase}</div>}
    {subtitulo && <div style={{ fontFamily: "Poppins", fontWeight: 600, fontSize: 24, color: COR.suave, marginTop: 16 }}>{subtitulo}</div>}
  </div>
);

// realce simples: comentários, strings, números e palavras-chave do C#
const CHAVES = /\b(int|float|double|bool|string|var|if|else|switch|case|break|for|while|do|return|true|false|new|void|public|static|class|foreach|in|const)\b/;
function colorir(linha: string): React.ReactNode {
  const coment = linha.indexOf("//");
  const codigo = coment >= 0 ? linha.slice(0, coment) : linha;
  const partes = codigo.split(/(\"[^\"]*\"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]+\b)/g);
  return (
    <>
      {partes.map((p, i) =>
        /^"/.test(p) ? <span key={i} style={{ color: "#86efac" }}>{p}</span>
        : /^\d/.test(p) ? <span key={i} style={{ color: COR.ambar }}>{p}</span>
        : CHAVES.test(p) && /^[A-Za-z_]+$/.test(p) ? <span key={i} style={{ color: COR.roxo, fontWeight: 700 }}>{p}</span>
        : p,
      )}
      {coment >= 0 && <span style={{ color: "#7c7799" }}>{linha.slice(coment)}</span>}
    </>
  );
}

export const PostImagem: React.FC<PostImagemProps> = (p) => {
  const dir = p.lado !== "esq";
  // espelha quando a pose olha para o lado errado do conteúdo
  const olhaEsq = OLHA_ESQ.includes(p.placa ? "placa" : p.pose);
  const espelhar = !dir && olhaEsq;

  if (p.tipo === "capa") {
    return (
      <AbsoluteFill>
        <Fundo />
        <AbsoluteFill style={{ flexDirection: dir ? "row" : "row-reverse", alignItems: "center", padding: "0 56px", gap: 30 }}>
          <div style={{ flex: 1 }}>
            {p.subtitulo && (
              <div style={{ display: "inline-block", background: COR.ambar, color: COR.fundo, fontFamily: "Poppins", fontWeight: 900, fontSize: 24, padding: "6px 16px", borderRadius: 8, marginBottom: 20, letterSpacing: 1 }}>
                {p.subtitulo}
              </div>
            )}
            <div style={{ fontFamily: "Poppins", fontWeight: 900, fontSize: (p.titulo?.length ?? 0) > 40 ? 58 : 72, lineHeight: 1.05, color: COR.texto }}>
              {destacar(p.titulo ?? "")}
            </div>
          </div>
          <Boneco pose={p.pose} placa={p.placa} altura={540} espelhar={espelhar} />
        </AbsoluteFill>
        <Marca texto={p.marca} />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      <Fundo />
      <AbsoluteFill style={{ flexDirection: dir ? "row" : "row-reverse", alignItems: "center", justifyContent: "center", padding: "0 48px", gap: 40 }}>
        <Quadro codigo={p.codigo} itens={p.itens} frase={p.frase} subtitulo={p.subtitulo} titulo={p.titulo} />
        <Boneco pose={p.pose} placa={p.placa} altura={560} espelhar={espelhar} />
      </AbsoluteFill>
      <Marca texto={p.marca} direita={!dir} />
    </AbsoluteFill>
  );
};

// *palavra* no título vira âmbar
function destacar(t: string): React.ReactNode {
  return t.split(/(\*[^*]+\*)/g).map((s, i) =>
    s.startsWith("*") ? <span key={i} style={{ color: COR.ambar }}>{s.slice(1, -1)}</span> : s,
  );
}
