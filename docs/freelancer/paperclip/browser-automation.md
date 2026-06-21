# Especificacao de navegador assistido

Esta regra existe para permitir analise completa de leads usando Chrome local autorizado, sem baguncar a janela pessoal que o usuario esta usando.

## Decisao

Os workers podem usar o Chrome pessoal do usuario e o perfil pessoal ja logado para analise de leads, redes sociais, Google, mapas, sites e perfis publicos/visiveis na conta do usuario quando isso for necessario e aprovado por esta regra.

Para o Scout, a regra preferencial e diferente: usar o perfil operacional dedicado `Paperclip Scout`. Esse perfil pode reutilizar a janela existente do proprio perfil operacional, porque ele nao e a janela pessoal diaria do usuario.

Essa e uma permissao permanente para a rotina de prospeccao e analise. O worker nao precisa pedir autorizacao a cada rodada para abrir navegador, desde que respeite as regras abaixo.

## Regras obrigatorias

1. Usar o Chrome/perfil autorizado para o worker: `Paperclip Scout` para Scout; perfil pessoal somente nos demais casos aprovados.
2. No perfil pessoal diario, abrir uma nova janela antes de iniciar a analise. No perfil operacional `Paperclip Scout`, pode reutilizar a janela existente do proprio perfil e abrir/mirar uma aba de trabalho.
3. Nao reutilizar, navegar, recarregar ou alterar abas abertas da janela pessoal que o usuario esta usando.
4. Nao fechar, mover, recarregar, navegar ou alterar abas pessoais ja abertas.
5. Nao usar `--user-data-dir`, porque isso criaria outro perfil e perderia o acesso da conta atual.
6. Usar o navegador em modo somente leitura para analise.
7. Nunca enviar WhatsApp, DM, formulario, comentario, curtida, follow, unfollow, salvamento ou qualquer acao social.
8. Nunca publicar, editar perfil, alterar configuracao, aceitar convite ou clicar em botao que gere acao externa.
9. Nao coletar dados em massa nem burlar limite de plataforma.
10. Se uma pagina exigir acao manual sensivel, login novo, captcha, 2FA ou confirmacao, interrompa e registre o bloqueio.
11. Dados privados continuam proibidos em `docs/`, `demos/` e `outputs/`; salve somente em `.scratch/` ou SQLite via CLI.
12. Antes de uma etapa do Scout que dependa de Instagram, Linktree, bio.site, agenda ou site logado, rode `node scripts/paperclip-chrome-scout-smoke.mjs --instagram` no perfil operacional `Paperclip Scout` e trate a saida JSON como contrato de maquina. O preflight `node scripts/paperclip-open-chrome-window.mjs --preflight` continua sendo diagnostico de abertura do Chrome, mas nao substitui leitura navegada de DOM.
13. Nao chamar `open -a "Google Chrome"` direto em heartbeats do Paperclip; use sempre `node scripts/paperclip-open-chrome-window.mjs`.
14. Nao usar Playwright WebKit (`org.webkit.Playwright`), Playwright Firefox/Nightly (`org.mozilla.nightly`) nem in-app browser para navegador assistido no Paperclip. Ha crash conhecido no macOS; use Chrome pessoal ou validacao estatica.

## Abertura segura no macOS

Use este comando quando for necessario abrir uma janela no mesmo Chrome/perfil:

```sh
node scripts/paperclip-open-chrome-window.mjs
```

Antes de pesquisa de leads com Instagram/Linktree, rode o preflight:

```sh
node scripts/paperclip-open-chrome-window.mjs --preflight
```

O preflight abre uma janela `about:blank` em modo controlado e retorna JSON com `ready`, `status`, `warnings` e `smokeTest`. O status `ready` libera uso assistido. Se `mdutil`/`mdls` falharem no runtime do Paperclip mas o smoke test abrir a janela, isso entra em `warnings` e nao bloqueia a rotina. Qualquer status `blocked_*` deve virar bloqueio operacional ou evidencia incompleta, nunca sucesso silencioso.

Para o Scout, a validacao operacional obrigatoria antes de usar Instagram e:

```sh
node scripts/paperclip-chrome-scout-smoke.mjs --instagram
```

Esse smoke test aciona o Chrome local no perfil `Paperclip Scout` com `--profile-directory`, sem forcar `--new-window`. Se ja houver janela do perfil operacional, o Chrome pode reutilizar a janela existente; se nao houver, ele cria a janela necessaria. O script tenta ler `document.location.href`, `document.title` e `document.body.innerText` por AppleScript/Chrome e retorna JSON de maquina com `chromeOpenReady`, `domReadReady`, `instagramSessionReady`, `browser_evidence_status`, `browser_evidence_method` esperado como `chrome_operational_profile` e `instagram_session_status`. Quando `--url` for usado, a leitura do DOM deve mirar a URL solicitada, nao qualquer aba do mesmo dominio. Se retornar `blocked_apple_events_javascript_disabled`, ative uma vez no Chrome: `View > Developer > Allow JavaScript from Apple Events`. Se retornar login, challenge, captcha ou sessao indisponivel, a rodada com Instagram nao inicia.

Para abrir uma pagina especifica em uma nova janela, passe a URL explicitamente:

```sh
node scripts/paperclip-open-chrome-window.mjs --url "https://exemplo.com/"
```

Observacoes:

- O script aplica lock para evitar duas tentativas concorrentes de abrir Chrome.
- O script tem `--preflight` para diagnostico de maquina antes da prospeccao: `ready`, `blocked_spotlight`, `blocked_metadata`, `blocked_recent_chrome_crash`, `blocked_recent_playwright_crash`, `blocked_recent_firefox_crash`, `blocked_stale_version`, `blocked_locked`, `blocked_launchservices` ou `blocked_open_failed`.
- `spotlight_unavailable` e `chrome_metadata_unavailable` sao alertas quando `smokeTest.opened=true`; bloqueiam apenas quando o `open` real tambem falha.
- O script bloqueia abertura quando detecta crash recente, evitando loop de `Google Chrome quit unexpectedly`.
- O script reporta crash recente de Playwright WebKit (`org.webkit.Playwright`) e Playwright Firefox/Nightly (`org.mozilla.nightly`) e bloqueia nova abertura de navegador assistido para evitar loop.
- O script bloqueia abertura quando detecta versao desalinhada entre Chrome instalado e helpers antigos ainda rodando.
- O script reporta `spotlightStatus`, `spotlightServerDisabled`, `chromeMetadataVisible` e `chromeMetadataStatus`; se o Spotlight/metadata services estiver desativado e o LaunchServices nao conseguir resolver apps, trate como bloqueio tecnico de configuracao do macOS.
- O script abre o bundle instalado de Chrome por caminho, nao por nome de LaunchServices, para evitar falha quando `open -a "Google Chrome"` nao resolve o app.
- Se o LaunchServices retornar `kLSNoExecutableErr` apesar do bundle/binario existirem, registre bloqueio tecnico; nao contorne pelo binario direto porque ele pode crashar ao registrar AppKit.
- Nao use `-n`, porque uma segunda instancia do app pode causar conflito com o perfil em uso.
- Nao use `--user-data-dir` para o Scout; ele deve usar o perfil operacional existente `Paperclip Scout` via `--profile-directory`, preservando a sessao logada sem misturar com o perfil pessoal diario.
- Para o Scout, nao force `--new-window`: o perfil operacional `Paperclip Scout` pode reutilizar a janela existente e trabalhar em aba propria. O isolamento vem do perfil dedicado, nao de uma janela nova por execucao.
- Se o Chrome tiver varios perfis, ele normalmente usa o perfil ativo/ultimo usado. Se for necessario fixar um perfil especifico, configurar isso uma unica vez fora da rotina operacional.

## Regra para automacao

Quando a ferramenta de automacao permitir, o worker deve:

1. conectar ao Chrome pessoal/perfil pessoal ja disponivel;
2. no perfil pessoal, criar uma nova janela/pagina dedicada; no perfil operacional do Scout, reutilizar a janela existente do perfil e abrir/mirar uma aba de trabalho;
3. manter todas as acoes em modo somente leitura;
4. fechar somente a janela/pagina criada pelo proprio worker, se isso for seguro.

Nao conecte em abas pessoais ja abertas para navegar nelas. Nao reaproveite uma aba que o usuario esteja usando.

Nao usar Playwright WebKit (`org.webkit.Playwright`), Playwright Firefox/Nightly (`org.mozilla.nightly`) nem in-app browser para pesquisa, prospeccao ou QA visual. Se uma ferramenta tentar abrir `Playwright.app` ou `Nightly.app`, interrompa a etapa e use `curl`, parser HTML, leitura direta dos arquivos, ou Chrome pessoal via `node scripts/paperclip-open-chrome-window.mjs`.

Se a ferramenta exigir uma configuracao tecnica unica para acessar o Chrome pessoal, registre isso como bloqueio tecnico. Depois de configurado, o uso diario nao deve pedir autorizacao por rodada.

Se o smoke `paperclip-chrome-scout-smoke.mjs --instagram` falhar, o Scout nao inicia rodada com Instagram e nao deve declarar bio OK. Leads com Instagram/Linktree que dependam dessa navegacao devem ficar com `bio_status: erro_tecnico`, `bloqueado`, `privado` ou `nao_encontrado`, `browser_evidence_status` diferente de `ok`, `browser_evidence_method` coerente com a fonte usada e `instagram_session_status` real. O Validador deve reter o lead em validacao ou `apto_com_observacao`.

## Permitido

- Abrir uma nova janela para pesquisar leads quando estiver usando o perfil pessoal, ou uma aba de trabalho no perfil operacional `Paperclip Scout`.
- Ver perfis de Instagram/Facebook/Google acessiveis pela conta do usuario.
- Ler posts, bio, links, destaques, horarios, mapas, site e diretorios.
- Ler a bio do Instagram, abrir o link da bio quando existir e analisar Linktree, bio.site, pagina de agenda, WhatsApp, site ou mapa em modo somente leitura.
- Capturar evidencias textuais necessarias para o dossie privado.
- Fechar a janela criada pelo worker quando terminar, se isso nao afetar o usuario.

## Proibido

- Enviar mensagem.
- Responder cliente.
- Curtir, seguir, comentar, salvar, compartilhar ou reagir.
- Preencher e enviar formulario.
- Alterar conta, perfil, senha, configuracao, cookies ou extensoes.
- Usar a janela principal do usuario.
- Salvar historico privado em arquivos publicos.

## Em caso de crash

Se aparecer alerta `Google Chrome quit unexpectedly`, trate como falha do Chrome acionado pelo Paperclip/Node.

Se aparecer `Playwright quit unexpectedly`, `Playwright cannot be opened because of a problem` ou `firefox quit unexpectedly`, trate como falha de engine Playwright nao-Chrome: Playwright WebKit (`org.webkit.Playwright`) ou Playwright Firefox/Nightly (`org.mozilla.nightly`) acionada por automacao. Nao clique em `Reopen`.

Procedimento:

1. Nao clique em `Reopen` repetidamente.
2. Registre no handoff qual worker tentou abrir navegador.
3. Rode `node scripts/paperclip-open-chrome-window.mjs --preflight` e registre `status`, `spotlightStatus`, `chromeMetadataVisible`, crash recente de Chrome, Playwright WebKit, Playwright Firefox/Nightly, lock ou versao desalinhada.
4. Se houver versao desalinhada, o usuario precisa fechar e reabrir o Chrome uma vez; o agente nao deve forcar isso sozinho.
5. Se houver crash de Playwright WebKit (`org.webkit.Playwright`) ou Playwright Firefox/Nightly (`org.mozilla.nightly`), nao usar in-app browser; continue com `curl`, parser HTML, leitura dos arquivos ou Chrome pessoal.
6. Se `spotlightServerDisabled` for `true` ou `chromeMetadataVisible` for `false`, marque bloqueio tecnico para reativar Spotlight/metadata services antes de tentar Chrome assistido novamente.
7. Se o navegador for indispensavel, marque bloqueio tecnico para ajuste da configuracao.
