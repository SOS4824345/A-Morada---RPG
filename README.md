# A Morada

Fundação do RPG solo de horror psicológico ambientado em Viksdal.

Esta versão contém o Hub da Alice, o Hub do Mestre, páginas provisórias e um teste opcional de mensagem compartilhada pelo Supabase. Não usa frameworks nem processo de compilação: são apenas arquivos HTML, CSS e JavaScript, compatíveis com GitHub Pages.

## Comece por aqui

Abra `docs/GUIA-PARA-DAVID.md`. O guia explica, em linguagem simples, como abrir o site, configurar o Supabase e publicar no GitHub Pages.

## Segurança

- O arquivo real `shared/config.js` não é enviado ao Git por padrão.
- Nunca coloque a chave `service_role` em arquivos deste site.
- O SQL desta etapa é incremental e não contém `DROP`, `TRUNCATE` ou exclusão de dados.
- A política de atualização pública é adequada apenas ao primeiro teste. Antes de usar o projeto como jogo real, o painel do Mestre deverá receber autenticação.

