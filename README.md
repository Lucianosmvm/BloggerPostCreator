# Blog Studio

App para celular que gera posts com IA (Gemini) e publica no Blogger.
É um site estático (HTML + JS) na pasta `docs/`, pronto para o GitHub Pages — não precisa de servidor.

- Chave do Gemini, login do Google e posts ficam salvos **só no aparelho** (nada vai para o GitHub).
- Pode ser instalado na tela inicial do celular e abre como app.

## Tipos de post

Na aba **Criar**, escolha o tipo. Cada um tem campos, instruções para a IA e visual próprios:

| Tipo | O post já sai com |
|---|---|
| 💻 Tecnologia | Resumo rápido, requisitos, passo a passo com código e saída esperada, tabelas de apoio em cada seção (ex.: potências de 2, tipos de dados), exemplos resolvidos, dicas, exercícios com resposta, tabela comparativa, prós e contras, perguntas frequentes. Formato **Aula passo a passo** já sai no tamanho Extra (≈ 2500 palavras) |
| 🍲 Receitas | Ficha (rendimento, tempos, dificuldade), ingredientes e preparo por grupo, dicas, substituições, conservação |
| 💡 Dicas | Resumo rápido, dicas numeradas, erros comuns, checklist |
| 🎮 Games | Ficha técnica, nota com critérios (reviews), prós e contras, requisitos de PC, aviso de spoiler |
| 📖 Histórias | Ficção original com gênero, narrador, público e tipo de final |
| 📝 Geral | Post livre |

**Perfil do blog automático:** cada blog tem o seu perfil. Ao escolher um blog pela primeira vez,
o app lê o nome, a descrição, os posts recentes e os marcadores do Blogger e a IA monta o perfil
(quem escreve, público, tom, regras e mensagem de fechamento). Ao trocar de blog, o perfil dele é
carregado. Dá para revisar ou recriar em **Ajustes → Perfil do blog**. Os marcadores que o blog já
usa são reaproveitados com a mesma grafia.

**Capa automática:** com a chave do Pexels cadastrada, cada post gerado já vem com foto de capa
(dá para trocar no editor ou desligar em **Ajustes → 4 · Imagens**).

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

## Marcadores e descrição de pesquisa (SEO)

- **Marcadores:** a vírgula separa marcadores (no app e no Blogger). Vírgulas dentro de parênteses
  viram "/", ex.: `Tipos de redes (LAN/WAN)`. Marcadores quebrados de posts antigos são consertados
  ao abrir o post; toque em **Atualizar** para corrigir no blog.
- **Descrição de pesquisa:** a IA gera 120–155 caracteres em cada post (ou toque em **✨ Gerar com IA**
  no editor). A API do Blogger **não** aceita esse campo, então, depois de enviar:
  1. Uma vez só: no Blogger, **Configurações → Metatags → Ativar descrição da pesquisa**.
  2. Em cada post: no editor do app toque em **Copiar** e **Abrir no Blogger**, e cole em
     **Configurações da postagem → Descrição de pesquisa**. É ela que preenche o `og:description`.

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

1. Repositório: https://github.com/Lucianosmvm/BloggerPostCreator
2. No repositório: **Settings → Pages → Build and deployment**.
   Em **Source** escolha **Deploy from a branch**, branch **main**, pasta **/docs**, e salve.
3. Em 1–2 minutos o app fica em `https://lucianosmvm.github.io/BloggerPostCreator/`.

## 2. Chave do Gemini

No app: **Ajustes → Inteligência artificial**. Crie a chave em https://aistudio.google.com/apikey,
cole e toque em **Salvar e testar**.

Recomendado: no Google Cloud, em **APIs e serviços → Credenciais**, edite a chave e restrinja a
**Sites** `https://lucianosmvm.github.io/*`.

## 3. Login do Google (Blogger) — uma única vez

1. Crie um projeto em https://console.cloud.google.com/projectcreate
2. Ative a **Blogger API v3**: https://console.cloud.google.com/apis/library/blogger.googleapis.com
3. Em **Google Auth Platform** (https://console.cloud.google.com/auth/overview): **Começar**,
   nome do app, seu e-mail, público **Externo**.
4. Em **Público-alvo**, adicione seu Gmail em **Usuários de teste**.
5. Em **Clientes** (https://console.cloud.google.com/auth/clients): **Criar cliente** do tipo
   **Aplicativo da Web**. Em **Origens JavaScript autorizadas** adicione `https://lucianosmvm.github.io`
   (sem barra e sem o nome do repositório).
6. Copie o **ID do cliente** e cole em **Ajustes → Blogger** no app. Toque em **Conectar e escolher blog**.

> Em modo "Teste", o Google mostra "O Google não verificou este app": toque em **Continuar**.
> O login dura cerca de 1 hora; depois disso o app pede para entrar de novo ao publicar.

## 4. Instalar no celular

- **Android (Chrome):** menu ⋮ → **Instalar app** / **Adicionar à tela inicial**.
- **iPhone (Safari):** Compartilhar → **Adicionar à Tela de Início**.

## Posts por blog

Cada post pertence ao blog que estava escolhido quando foi criado e é enviado para esse blog.
Em **Meus posts**, com mais de um blog, aparecem botões para ver cada blog (o atual vem
selecionado) ou **Todos**, agrupados por blog. Antes de enviar, dá para trocar o destino no
editor em **⋯ → Mudar blog de destino**.

## Posts excluídos no Blogger

Ao abrir **Meus posts** com o login do Google ativo, o app confere (no máximo a cada 10 minutos)
se os posts enviados ainda existem no Blogger e atualiza status e links. Os que foram excluídos lá
aparecem num aviso **Ver e remover do app**. Também dá para conferir na hora pelo menu **⋯ →
Sincronizar com o Blogger**, ou apagar vários de uma vez em **⋯ → Selecionar posts para excluir**.
Nada é apagado no Blogger por essas opções.

## Backup

Os posts ficam no navegador do aparelho. Use **Ajustes → Backup → Exportar** de vez em quando
(e **Importar** para passar para outro aparelho).

## Testar no computador

```bash
python -m http.server 8000 --directory docs
```

Abra http://localhost:8000 e adicione `http://localhost:8000` nas **Origens JavaScript autorizadas** do cliente Google.
