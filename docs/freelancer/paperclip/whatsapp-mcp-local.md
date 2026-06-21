# WhatsApp MCP Local

Este guia configura `lharries/whatsapp-mcp` como ponte local do WhatsApp atual do Luiz. O MCP fica atras do nosso Gateway Local; workers Paperclip nao recebem acesso direto a tools cruas do WhatsApp.

Modo alvo: automacao controlada depois do "Pode!". O Gateway importa inbound, Atendimento WhatsApp escreve resposta candidata, Humanizer limpa o texto, Guardiao aprova, e somente o Gateway despacha Outbox aprovada.

## Por Que Nao Expor O MCP Direto

O projeto `lharries/whatsapp-mcp` oferece leitura e envio: `send_message`, `send_file` e `send_audio_message`. Na operacao freelancer, essas tools nao devem ser expostas aos workers comerciais.

Regra operacional:

- workers leem somente CRM/Paperclip;
- `whatsapp-local-gateway.mjs` importa inbound de `store/messages.db`;
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
- importa somente mensagens inbound de leads conhecidos no CRM;
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

O esperado e `Importados: 0`, `Ignorados: 0`, `Falhas: 0` ate chegar mensagem nova.

## Watcher Local

Depois que nao houver task sensivel rodando e o Luiz decidir ativar leitura continua:

```bash
node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Documents/programacao/freela watch-mcp-sqlite --db /Users/luiz_fbm/Documents/programacao/freela/.scratch/whatsapp-mcp/whatsapp-bridge/store/messages.db --interval-ms 10000
```

Sem `--dispatch-approved`, esse watcher apenas repete o import do `messages.db` e alimenta o CRM.

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
