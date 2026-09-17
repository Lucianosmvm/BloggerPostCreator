# Blog Studio

App para celular que gera posts com IA (Gemini) e publica no Blogger.
É um site estático (HTML + JS) na pasta `docs/`, pronto para o GitHub Pages — não precisa de servidor.

- Chave do Gemini, login do Google e posts ficam salvos **só no aparelho** (nada vai para o GitHub).
- Pode ser instalado na tela inicial do celular e abre como app.

## Tipos de post

Na aba **Criar**, escolha o tipo. Cada um tem campos, instruções para a IA e visual próprios:

| Tipo | O post já sai com |
|---|---|
| 💻 Tecnologia | Resumo rápido, requisitos, passo a passo com código, tabela comparativa, prós e contras, perguntas frequentes |
| 🍲 Receitas | Ficha (rendimento, tempos, dificuldade), ingredientes e preparo por grupo, dicas, substituições, conservação |
| 💡 Dicas | Resumo rápido, dicas numeradas, erros comuns, checklist |
| 🎮 Games | Ficha técnica, nota com critérios (reviews), prós e contras, requisitos de PC, aviso de spoiler |
| 📖 Histórias | Ficção original com gênero, narrador, público e tipo de final |
| 📝 Geral | Post livre |

Em **Ajustes → Perfil do blog** defina nome, quem escreve, público, tom, regras, a mensagem de
fechamento e a cor de destaque. Isso vale para todos os posts.

> Em Tecnologia e Games, confira datas, versões, preços e requisitos antes de publicar:
> a IA pode estar desatualizada.

## Esboço e reescrita

- **Esboço antes do texto** (interruptor na aba Criar, ligado por padrão): a IA propõe 3 títulos,
  a abordagem e os tópicos. Escolha o título, edite, reordene, apague ou adicione tópicos e toque em
  **Escrever post**. O post segue o esboço na ordem. O esboço fica salvo até o post ser escrito.
- **Reescrever trecho** (botão ✨ no editor): selecione um texto no modo *Editar HTML* ou, sem
  seleção, escolha um parágrafo, lista, caixa ou seção inteira. Escolha o pedido (mais curto, mais
  simples, corrigir português…) ou escreva o seu. Compare antes/depois e toque em **Aplicar**; o botão
  ↶ desfaz a última reescrita.

## Ideias de pauta

Na aba **Criar**, toque em **💡 Sem ideia? Ver sugestões de pauta**. Escolha a categoria, um nicho
(opcional) e quantas ideias quer. A IA evita repetir títulos que você já tem. **Usar ideia**
preenche o formulário de criação. As ideias ficam salvas no aparelho.

## Imagem de capa

No editor, **🖼️ Adicionar imagem de capa**:

- **Foto grátis (Pexels):** crie a chave gratuita em https://www.pexels.com/api/ e cadastre em
  **Ajustes → 4 · Imagens**. A foto fica hospedada no Pexels, entra no topo do post com crédito do
  fotógrafo e vira a miniatura do post no Blogger. Edite o texto alternativo no editor.
- **Imagem com IA (Gemini):** gera a imagem para você **baixar**. A API do Blogger não aceita envio
  de imagens, então adicione a imagem pelo editor do Blogger. Pode exigir faturamento ativo na conta
  do Gemini; as imagens têm a marca d'água invisível SynthID.

## Agendamento

No editor, **Publicar** abre as opções **Publicar agora** ou **Agendar publicação…** (data e hora do
aparelho). O Blogger publica sozinho na data, mesmo com o app fechado. Em posts agendados dá para
atualizar mantendo a data, mudar a data, publicar agora ou voltar para rascunho.

## Checagem de fatos na internet

No editor, **🔎 Checar fatos na internet** (em destaque em Tecnologia e Games; no menu ⋯ dos outros
tipos, exceto Histórias). O Gemini pesquisa no Google e mostra cada afirmação como ❌ incorreta,
⚠️ a verificar ou ✅ confirmada, com as fontes e as sugestões de busca do Google.

- O resultado é **só para você**: não é salvo, não entra no post e some ao fechar o app. Corrija o
  texto você mesmo (o botão ✨ ajuda). Isso segue os termos da pesquisa do Google no Gemini, que não
  permitem publicar, modificar ou guardar os resultados da pesquisa.
- Cada checagem faz buscas no Google, que podem ser cobradas na sua conta do Gemini depois da cota gratuita.
- Os links das fontes passam por um endereço de redirecionamento do Google.

Os blocos visuais usam estilos embutidos no HTML, então aparecem iguais em qualquer tema do Blogger.
Para os títulos das seções (`<h2>`, `<h3>`) vale o estilo do seu tema.

## 1. Publicar no GitHub Pages

1. Crie um repositório no GitHub (ex.: `blog-studio`) e envie os arquivos desta pasta.
2. No repositório: **Settings → Pages → Build and deployment**.
   Em **Source** escolha **Deploy from a branch**, branch **main**, pasta **/docs**, e salve.
3. Em 1–2 minutos o app fica em `https://SEU-USUARIO.github.io/blog-studio/`.

## 2. Chave do Gemini

No app: **Ajustes → Inteligência artificial**. Crie a chave em https://aistudio.google.com/apikey,
cole e toque em **Salvar e testar**.

Recomendado: no Google Cloud, em **APIs e serviços → Credenciais**, edite a chave e restrinja a
**Sites** `https://SEU-USUARIO.github.io/*`.

## 3. Login do Google (Blogger) — uma única vez

1. Crie um projeto em https://console.cloud.google.com/projectcreate
2. Ative a **Blogger API v3**: https://console.cloud.google.com/apis/library/blogger.googleapis.com
3. Em **Google Auth Platform** (https://console.cloud.google.com/auth/overview): **Começar**,
   nome do app, seu e-mail, público **Externo**.
4. Em **Público-alvo**, adicione seu Gmail em **Usuários de teste**.
5. Em **Clientes** (https://console.cloud.google.com/auth/clients): **Criar cliente** do tipo
   **Aplicativo da Web**. Em **Origens JavaScript autorizadas** adicione `https://SEU-USUARIO.github.io`
   (sem barra e sem o nome do repositório).
6. Copie o **ID do cliente** e cole em **Ajustes → Blogger** no app. Toque em **Conectar e escolher blog**.

> Em modo "Teste", o Google mostra "O Google não verificou este app": toque em **Continuar**.
> O login dura cerca de 1 hora; depois disso o app pede para entrar de novo ao publicar.

## 4. Instalar no celular

- **Android (Chrome):** menu ⋮ → **Instalar app** / **Adicionar à tela inicial**.
- **iPhone (Safari):** Compartilhar → **Adicionar à Tela de Início**.

## Backup

Os posts ficam no navegador do aparelho. Use **Ajustes → Backup → Exportar** de vez em quando
(e **Importar** para passar para outro aparelho).

## Testar no computador

```bash
python -m http.server 8000 --directory docs
```

Abra http://localhost:8000 e adicione `http://localhost:8000` nas **Origens JavaScript autorizadas** do cliente Google.
