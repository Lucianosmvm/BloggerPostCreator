import { Still } from "remotion";
import { PostImagem, type PostImagemProps } from "./PostImagem";

// Exemplos para ajustar o visual no `npm run studio`; o render usa as props do spec.
export const Root: React.FC = () => (
  <>
    <Still id="PostCapa" component={PostImagem} width={1200} height={630}
      defaultProps={{ tipo: "capa", titulo: "Operadores em *C#*", subtitulo: "C# NA PRÁTICA", pose: "apontando", marca: "Devs na Prática" } as PostImagemProps} />
    <Still id="PostCena" component={PostImagem} width={1200} height={675}
      defaultProps={{ tipo: "cena", pose: "explicando", codigo: ["int vida = 100;", "vida = vida - 35; // ataque"], subtitulo: "Sobrou 65 de vida", marca: "Devs na Prática" } as PostImagemProps} />
  </>
);
