# WhatsApp MCP Local

Este guia configura `lharries/whatsapp-mcp` como ponte local do WhatsApp atual do Luiz. O MCP fica atras do nosso Gateway Local; workers Paperclip nao recebem acesso direto a tools cruas do WhatsApp.

Modo alvo: automacao controlada depois do "Pode!". O Gateway importa inbound, Atendimento WhatsApp escreve resposta candidata, Humanizer limpa o texto, Guardiao aprova, e somente o Gateway despacha Outbox aprovada.

## Por Que Nao Expor O MCP Direto

O projeto `lharries/whatsapp-mcp` oferece leitura e envio: `send_message`, `send_file` e `send_audio_message`. Na operacao freelancer, essas tools nao devem ser expostas aos workers comerciais.

Regra operacional:

- workers leem somente CRM/Paperclip;
- `whatsapp-local-gateway.mjs` importa inbound de `store/messages.db`;
- contatos que chegam como `@lid` ou outro JID sem telefone publico entram em `Sem identidade`, nao somem;
- Atendimento WhatsApp so cria resposta candidata na Outbox;
- Humanizer e obrigatorio antes de qualquer Outbox automatica;
- Guardiao revisa e aprova;
- envio real so pode existir via `dispatch-approved-outbox`, depois de Outbox aprovada.

## Instalacao Local

Instale dentro de `.scratch/`, porque o bridge grava banco local com conversas privadas:

```bash
mkdir -p /Users/luiz_fbm/Documents/programacao/freela/.scratch
git clone https://github.com/lharries/whatsapp-mcp.git /Users/luiz_fbm/Documents/programacao/freela/.scratch/whatsapp-mcp
cd /Users/luiz_fbm/Documents/programacao/freela/.scratch/whatsapp-mcp/whatsapp-bridge
go run main.go
```

Na primeira execucao, o terminal mostra um QR. No celular, abra WhatsApp > Dispositivos conectados > Conectar dispositivo e leia o QR.

O bridge cria:

```txt
/Users/luiz_fbm/Documents/programacao/freela/.scratch/whatsapp-mcp/whatsapp-bridge/store/messages.db
```

Esse e o banco que o Gateway Local le. O servidor REST do bridge expoe `/api/send`, mas somente `scripts/whatsapp-local-gateway.mjs` pode chamar essa rota, e apenas para Outbox aprovada pelo Guardiao com `humanizer_pass = true`.

## Importar Uma Vez

Com o bridge rodando e o QR pareado:

```bash
node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Documents/programacao/freela import-mcp-sqlite --db /Users/luiz_fbm/Documents/programacao/freela/.scratch/whatsapp-mcp/whatsapp-bridge/store/messages.db
```

O comando:

- ignora mensagens enviadas pelo Luiz;
- ignora grupos;
- ignora midia sem texto;
- importa mensagens inbound de leads conhecidos no CRM para `whatsapp_inbound_events`;
- quando o contato chega como `@lid` ou sem match confiavel, grava em `whatsapp_unmatched_inbound_events` e mostra `Sem identidade: N`;
- grava falhas em `.scratch/whatsapp-inbound-*.json.error.txt`;
- grava cursor em `.scratch/whatsapp-mcp-cursor.json`.

No primeiro pareamento, o bridge pode puxar historico antigo do WhatsApp. Para operar somente daqui para frente, posicione o cursor no fim do historico atual antes de ligar watcher continuo:

```bash
cd /Users/luiz_fbm/Documents/programacao/freela
node - <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
const dbPath = '.scratch/whatsapp-mcp/whatsapp-bridge/store/messages.db';
const cursorPath = '.scratch/whatsapp-mcp-cursor.json';
const db = new DatabaseSync(dbPath, { readOnly: true });
const row = db.prepare('select id, chat_jid, timestamp from messages order by timestamp desc, id desc, chat_jid desc limit 1').get();
db.close();
if (row) {
  mkdirSync(dirname(cursorPath), { recursive: true });
  writeFileSync(cursorPath, JSON.stringify({
    lastTimestamp: String(row.timestamp || '').trim(),
    lastKey: `${row.id}:${row.chat_jid}`,
    updatedAt: new Date().toISOString(),
    mode: 'baseline-current-history'
  }, null, 2));
}
NODE
```

Depois confirme:

```bash
node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Documents/programacao/freela import-mcp-sqlite --db /Users/luiz_fbm/Documents/programacao/freela/.scratch/whatsapp-mcp/whatsapp-bridge/store/messages.db
```

O esperado e `Importados: 0`, `Ignorados: 0`, `Sem identidade: 0`, `Falhas: 0` ate chegar mensagem nova.

## Identidade WhatsApp

O WhatsApp pode entregar uma conversa individual como `273478418722987@lid` em vez de `5527...@s.whatsapp.net`. Isso nao deve virar gambiarra por nome de contato. A fonte oficial e o SQLite:

- `whatsapp_identity_aliases`: vincula um lead a um JID/alias WhatsApp, incluindo `@lid`;
- `whatsapp_unmatched_inbound_events`: guarda inbound sem lead identificado;
- `whatsapp_worker_wakes`: dedupe de tasks criadas automaticamente para workers.

Regra de envio: `@lid` serve somente para leitura/match. A Outbox nao deve despachar para `@lid`. Quando o inbound vem por LID, o CRM usa o telefone real do lead como `target_chat_id` em formato enviavel, como `5527999990000`. Se uma Outbox antiga ainda tiver `target_chat_id` terminando em `@lid`, o Gateway bloqueia antes de chamar `/api/send` e move o lead para `handoff_luiz` pedindo telefone real.

Quando o import mostrar `Sem identidade: 1`, localize o lead correto e vincule:

```bash
node scripts/freela-crm.mjs whatsapp identity link --name "Nome do Lead" --identity "273478418722987@lid" --source manual
node scripts/freela-crm.mjs whatsapp unmatched reconcile
```

Depois da reconciliação, o inbound sai de `whatsapp_unmatched_inbound_events.status = unmatched`, entra em `whatsapp_inbound_events` e atualiza `lead_conversation_state`.

## Watcher Local

Depois que nao houver task sensivel rodando e o Luiz decidir ativar leitura continua:

```bash
node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Documents/programacao/freela watch-mcp-sqlite --db /Users/luiz_fbm/Documents/programacao/freela/.scratch/whatsapp-mcp/whatsapp-bridge/store/messages.db --interval-ms 10000
```

Sem `--dispatch-approved`, esse watcher apenas repete o import do `messages.db` e alimenta o CRM.

Para acordar automaticamente o worker correto, use `--auto-wake`:

```bash
node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Documents/programacao/freela watch-mcp-sqlite --db /Users/luiz_fbm/Documents/programacao/freela/.scratch/whatsapp-mcp/whatsapp-bridge/store/messages.db --auto-wake --interval-ms 10000
```

Roteamento seletivo:

- Atendimento WhatsApp recebe conversa normal: `resposta_permissao`, `resposta_pediu_exemplo` e `resposta_recebida`.
- Jhon Snow / Atendimento e Fechamento recebe fechamento comercial: `preco_pedido`, `lead_quente`, `objecao_comercial`, `handoff_luiz`, `qualificacao_preco_pendente` e `bloqueado_guardiao`.
- `resposta_sem_interesse` ou estado `encerrado` nao gera auto-wake.

O auto-wake cria issue no Paperclip via API direta, usando `--paperclip-api-base`, `--paperclip-company-id`, `--paperclip-api-key`, `--paperclip-run-id`, `--atendimento-agent-id` e `--closer-agent-id` quando necessario. O dedupe fica em `whatsapp_worker_wakes`, entao a mesma mensagem nao cria tasks repetidas. Ele nao envia WhatsApp e nao chama `/api/send`.

## Dispatch Aprovado

Depois que Atendimento WhatsApp gerar Outbox com `humanizer_pass = true` e Guardiao aprovar, o Gateway pode despachar:

```bash
node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Documents/programacao/freela dispatch-approved-outbox --dry-run
node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Documents/programacao/freela dispatch-approved-outbox
```

Watcher com envio:

```bash
node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Documents/programacao/freela watch-mcp-sqlite --db /Users/luiz_fbm/Documents/programacao/freela/.scratch/whatsapp-mcp/whatsapp-bridge/store/messages.db --dispatch-approved --interval-ms 10000
```

Somente o Gateway chama `/api/send`. Workers continuam sem acesso a `send_message`, `send_file` e `send_audio_message`.

Antes de ligar envio continuo, rode `dispatch-approved-outbox --dry-run` e confirme que nenhum item aprovado tem `target_chat_id` em `@lid`. O dispatcher bloqueia esse caso, mas o correto e manter o cadastro do lead com telefone real e o LID apenas em `whatsapp_identity_aliases`.

## Variavel Opcional

Para nao passar `--db` sempre:

```bash
export WHATSAPP_MCP_MESSAGES_DB=/Users/luiz_fbm/Documents/programacao/freela/.scratch/whatsapp-mcp/whatsapp-bridge/store/messages.db
node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Documents/programacao/freela import-mcp-sqlite
```

## Operacao Com Tasks Rodando

Se houver tasks Paperclip em andamento:

1. nao iniciar watcher continuo;
2. nao parear/reiniciar o bridge no meio de QA ou criacao;
3. se precisar testar, rode apenas `import-mcp-sqlite` uma vez;
4. nao sincronizar agentes vivos nem alterar escopo de tasks em andamento.

Quando as tasks terminarem, o watcher pode ficar rodando em uma janela separada do terminal.

## Troubleshooting

### `websocket: close 1006` e `Timeout waiting for QR code scan`

Esse erro acontece antes do pareamento. Se `whatsmeow_device` estiver vazio, o bridge nao chegou a criar sessao valida e e seguro tentar de novo.

Diagnostico:

```bash
cd /Users/luiz_fbm/Documents/programacao/freela
node - <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.scratch/whatsapp-mcp/whatsapp-bridge/store/whatsapp.db', { readOnly: true });
console.log(db.prepare('select count(*) as deviceCount from whatsmeow_device').get());
db.close();
NODE
```

Se `deviceCount` for `0`, repita com ambiente limpo:

```bash
cd /Users/luiz_fbm/Documents/programacao/freela/.scratch/whatsapp-mcp/whatsapp-bridge
rm -rf store
go clean -cache
go run main.go
```

Se o QR aparecer, escaneie em ate 3 minutos. Se cair de novo antes do QR:

- confirme que o Mac esta online e sem VPN/proxy bloqueando websocket;
- abra `https://web.whatsapp.com` no navegador para confirmar acesso normal;
- confirme que o celular tem espaco para novo dispositivo conectado em WhatsApp > Dispositivos conectados;
- rode novamente `go run main.go`.

Nao apague `store` depois que `deviceCount` estiver maior que `0`, porque ali ja existe sessao pareada.

### `Client outdated (405) connect failure`

Esse erro significa que a versao do cliente WhatsApp Web embutida no `whatsmeow` ficou velha. O `whatsapp-mcp` original fixa a dependencia em uma versao que pode ser rejeitada pelo WhatsApp antes do QR.

Correcao aplicada no clone local em `.scratch/whatsapp-mcp/whatsapp-bridge/main.go`:

- importar `go.mau.fi/whatsmeow/store`;
- chamar `whatsmeow.GetLatestVersion(nil)`;
- aplicar `store.SetWAVersion(*latestVersion)` antes de `client.Connect()`.
- no `whatsmeow` fixado pelo `whatsapp-mcp`, tambem atualizar `store.BaseClientPayload.UserAgent.AppVersion = latestVersion.ProtoAppVersion()`, porque essa versao antiga de `SetWAVersion` nao atualiza o payload base.

Depois dessa correcao, rode:

```bash
cd /Users/luiz_fbm/Documents/programacao/freela/.scratch/whatsapp-mcp/whatsapp-bridge
rm -rf store
go run main.go
```

Se o clone local for apagado e recriado, reaplicar essa correcao antes de tentar parear.
