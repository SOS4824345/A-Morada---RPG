# Guia para David — A Morada

## O que foi criado

Esta pasta é a fundação do jogo. O **Hub da Alice** é o lado que a jogadora verá. O **Hub do Mestre** é o seu painel de controle. Nesta primeira versão, quase todas as áreas são páginas provisórias; o único teste com dados é uma mensagem que você escreve no Hub do Mestre e Alice lê no Hub dela.

## O que é cada pasta

- `alice`: contém o Hub da Alice e as páginas que ela poderá abrir.
- `mestre`: contém seu painel reservado e suas páginas.
- `shared`: contém a aparência e o comportamento compartilhados pelos dois hubs.
- `assets/images`: lugar para imagens futuras.
- `assets/audio`: lugar para sons futuros.
- `assets/documents`: lugar para documentos do jogo no futuro.
- `supabase`: guarda arquivos de instruções para criar ou modificar o banco com cuidado.
- `docs`: guarda guias como este.

O arquivo `index.html` é a porta de entrada. `shared/styles.css` controla a aparência. `shared/app.js` faz a mensagem viajar entre o site e o Supabase. `shared/config.example.js` mostra quais dados públicos de conexão serão necessários. `.gitignore` impede que o arquivo de configuração real seja enviado por engano.

## Conceitos em linguagem simples

**GitHub** é um lugar na internet para guardar versões do código. **GitHub Pages** pega esses arquivos e os transforma em um site acessível por um endereço. **Supabase** é o serviço que guardará os dados do jogo. Um **banco de dados** é um conjunto organizado de informações, parecido com várias planilhas conectadas.

Conectar o site ao Supabase significa permitir que o site leia ou altere dados guardados lá. O código fica nesta pasta e depois no GitHub. Os dados ficam no Supabase. Por isso, trocar a aparência do site não deve apagar os dados: eles vivem em lugares separados.

## Como abrir o site agora

1. Abra a pasta `A Morada - reformulado` em Documentos.
2. Dê dois cliques em `index.html`.
3. O navegador abrirá a entrada de A Morada.
4. Sem a configuração do Supabase, a mensagem de demonstração aparece apenas como texto local. Isso é esperado.

## Como criar a tabela de teste no Supabase

O arquivo SQL foi apenas preparado. Nada foi executado automaticamente.

1. Entre em [supabase.com](https://supabase.com) e abra seu projeto.
2. No menu da esquerda, clique em **SQL Editor**.
3. Clique em **New query** (nova consulta).
4. Em seu computador, abra `supabase/001_initial_test.sql` com o Bloco de Notas.
5. Selecione todo o conteúdo (`Ctrl + A`) e copie (`Ctrl + C`).
6. Volte ao SQL Editor, clique na área vazia e cole (`Ctrl + V`).
7. Clique em **Run**.
8. Você deve ver uma mensagem de sucesso. Em **Table Editor**, aparecerá a tabela `game_messages` com uma linha chamada `hub_message`.

Esse código não apaga tabelas nem dados. Se a tabela já existir com uma estrutura diferente, pare e não tente improvisar: peça uma revisão antes de executar.

## Como obter os dois dados públicos do Supabase

1. No projeto do Supabase, clique no ícone de engrenagem **Project Settings**.
2. Abra **API** (em algumas versões, o caminho aparece como **Data API** ou **API Keys**).
3. Copie a **Project URL**.
4. Copie a chave pública chamada **anon public** ou **publishable key**.
5. Nunca copie a chave chamada **service_role** ou **secret** para este site.

Depois, faça uma cópia de `shared/config.example.js`, dê à cópia o nome `config.js` e substitua somente os dois textos entre aspas pelos valores públicos. Não apague o arquivo de exemplo.

### O que é seguro no site público

- Project URL do Supabase.
- Chave pública `anon` ou `publishable`.

### O que jamais deve ir para o site público

- Chave `service_role`.
- Chaves marcadas como `secret`.
- Sua senha do Supabase ou GitHub.
- Códigos de recuperação e tokens pessoais.

Aviso importante: para provar o fluxo sem criar login nesta etapa, a política SQL permite que qualquer visitante do site altere a mensagem se souber como fazer. Isso serve apenas para o teste inicial. Antes do uso real, criaremos um login seguro para o Mestre e removeremos essa permissão pública por meio de uma nova migração, sem apagar a tabela.

## GitHub e GitHub Pages

1. Entre em [github.com](https://github.com) e faça login.
2. Clique no sinal **+** no alto à direita e em **New repository**.
3. Use o nome `a-morada-reformulado`.
4. Prefira **Private** enquanto estiver testando. Atenção: a disponibilidade do GitHub Pages em repositório privado depende do seu plano. Se quiser publicação gratuita e puder deixar o código visível, escolha **Public**.
5. Não marque opções para criar README, `.gitignore` ou licença, pois estes arquivos já existem.
6. Clique em **Create repository**.
7. Na página seguinte, o GitHub mostrará instruções para conectar uma pasta existente. Não execute nada ainda se não se sentir seguro; peça para eu acompanhar essa etapa.
8. Depois do primeiro envio, abra **Settings** no repositório e clique em **Pages**.
9. Em **Build and deployment**, escolha **Deploy from a branch**. Selecione a branch `main`, a pasta `/ (root)` e clique em **Save**.
10. Aguarde alguns minutos. O endereço aparecerá na mesma página e normalmente terá o formato `https://SEU-USUARIO.github.io/a-morada-reformulado/`.

O arquivo `config.js` está protegido pelo `.gitignore`, portanto não será publicado desse modo. Para o teste funcionar no GitHub Pages, precisaremos decidir com você como fornecer os valores públicos durante a publicação. Eles são públicos por natureza, mas essa decisão deve ser consciente.

## Como atualizar no futuro

As alterações de aparência serão feitas principalmente em HTML e CSS. Alterações de dados serão feitas no Supabase. Mudanças na estrutura do banco devem ganhar um novo arquivo numerado dentro de `supabase`, por exemplo `002_nome_da_mudanca.sql`. Nunca substitua uma migração já usada e nunca apague a tabela para adicionar um campo.

## Arquivos que você não deve apagar sem entender

- Todo o conteúdo de `supabase`: é o histórico da estrutura dos dados.
- `.git`: quando existir, guardará o histórico local do Git.
- `.gitignore`: ajuda a evitar o envio de arquivos sensíveis.
- `shared/config.js`: contém a conexão local; nunca compartilhe sem conferir o conteúdo.
- `shared/app.js` e `shared/styles.css`: sustentam o funcionamento e a aparência dos hubs.

Antes de uma mudança importante, faça uma cópia de segurança dos dados no Supabase. A criação de backups e snapshots será uma etapa futura, antes de guardar dados importantes da campanha.
