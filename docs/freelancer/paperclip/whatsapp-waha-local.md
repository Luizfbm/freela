# WAHA Local Lab

WAHA e o motor local autorizado para inbound WhatsApp e dispatch controlado via Gateway. Ele nao substitui o contrato comercial manual nem libera envio livre: workers continuam proibidos de chamar WAHA diretamente, chamar `/api/sendText` cru ou enviar WhatsApp fora do Gateway.

## Estado local atual

Atualizado em 2026-06-21 21:25 -03.

- Repo operacional: `/Users/luiz_fbm/Developer/freela`.
- Compose versionado: `docker-compose.waha.yml`.
- Container: `freela-waha`.
- API/Dashboard local: `http://127.0.0.1:3000`.
- Sessao persistida em `.scratch/waha/.sessions`.
- Sessao `default`: validada como `WORKING`.
- Gateway webhook local: porta `3105`.
- Webhook do container: `http://host.docker.internal:3105/waha/webhook`.
- O Gateway deve ouvir somente em loopback (`127.0.0.1`). Se webhook vindo do container precisar alcancar o host, abrir decisao separada para proxy/tunel local aprovado; nao usar bind wildcard.
- `scripts/whatsapp-local-gateway.mjs` carrega automaticamente o `.env` local a partir de `--root` e nao sobrescreve variaveis ja existentes.
- Envio real controlado comprovado: Outbox 6 do contato de teste foi enviada via provider `waha`, recebeu ACK forte `DEVICE` e o CRM marcou `sent`/`delivered_at`.
- Incidente posterior: Outbox 8 ficou `dispatch_ambiguous` por `WAHA check-exists falhou: Unauthorized`; diagnostico operacional e falha de credencial/processo de dispatch, nao bloqueio de conteudo.
- Segredos ficam somente no `.env` local privado. Nao registrar valores em docs, issues, prompts, logs publicos ou arquivos versionados.

Regra operacional para agentes:

- Workers nao chamam WAHA diretamente.
- Workers nao chamam `/api/sendText`.
- Workers nao recebem ferramenta crua de envio.
- O unico caminho autorizado e `scripts/whatsapp-local-gateway.mjs`.
- Outbound real via WAHA existe somente como dispatch controlado por Outbox aprovada, `--outbox-id` explicito, Humanizer, Guardiao e ACK forte.
- `Unauthorized` em `check-exists` deve ser classificado como falha de credencial/transporte. Nao diga que WAHA esta quebrado por um `Unauthorized` isolado.
- Outbox em `dispatch_ambiguous` nao deve ser reaproveitada automaticamente. Outbox 8 permanece ambigua/handoff ate decisao manual ou liberacao auditada.

## Interpretação de incidentes

- `sent` com ACK `DEVICE`, `READ`, `PLAYED` ou `ack >= 2`: entrega forte registrada no CRM.
- `delivery_pending`: envio aceito, mas ainda nao entregue; aguardar `message.ack`.
- `message.waiting`, ausencia de `message_id`, resposta ambigua ou erro de transporte: marcar `dispatch_ambiguous` e mover para `handoff_luiz`.
- `WAHA check-exists falhou: Unauthorized`: tratar como credencial ausente/desatualizada no processo de dispatch. Verificar `.env`, `WAHA_API_KEY`, sessao `default` e chamada via Gateway; nao reenviar a mesma Outbox automaticamente.
- Outbox 8 do contato de teste: continua historicamente ambigua. Para novo teste, criar nova Outbox ou fazer liberacao explicita auditada.

## Outbox-first WAHA mode

Quando WAHA estiver saudavel, respostas seguras pos-consentimento deixam de ir para lead-cards por padrao. O caminho alvo e:

1. Atendimento WhatsApp ou Jhon cria nova Outbox com `whatsapp outbox propose`.
2. Guardiao revisa com `whatsapp guardian review --outbox-id [id] --auto-wake true --auto-dispatch true`.
3. Se aprovada e despachavel, Gateway despacha somente com `dispatch-approved-outbox --provider waha --outbox-id [id]`.
4. Follow-up so considera enviado apos ACK forte: `DEVICE`, `READ`, `PLAYED` ou `ack >= 2`.

Continuam manuais: primeira abordagem fria, preco, desconto, proposta, pagamento, fechamento, objecao sensivel, Guardiao bloqueado, WAHA/Gateway falho, `delivery_pending` prolongado e `dispatch_ambiguous`.

Workers nunca chamam `/api/sendText` diretamente.

## Fronteira

Somente `scripts/whatsapp-local-gateway.mjs` pode chamar WAHA.

Fluxo permitido:

```text
Inbound WhatsApp
-> WAHA webhook
-> CRM SQLite
-> Atendimento WhatsApp
-> Humanizer
-> Guardiao
-> whatsapp_outbox approved
-> Gateway dispatch-approved-outbox --provider waha
-> WAHA /api/sendText
-> WAHA message.ack
-> CRM marca entrega forte
```

Fluxo proibido:

```text
Worker -> WAHA
Worker -> /api/sendText
Worker -> mensagem direta para lead
```

## Webhook de entrada

O monitor local do Gateway recebe eventos WAHA em `POST /waha/webhook`, grava inbound no CRM e, com `--auto-wake`, acorda o worker certo sem criar Outbox e sem enviar mensagem.

```bash
node scripts/whatsapp-local-gateway.mjs \
  --root /Users/luiz_fbm/Developer/freela \
  serve-waha-webhook \
  --host 127.0.0.1 \
  --port 3105 \
  --auto-wake
```

Configure a WAHA para enviar eventos para:

```text
http://127.0.0.1:3105/waha/webhook
```

Quando a WAHA roda em Docker, `127.0.0.1` dentro do container e o proprio container. Por isso o Compose local configura o webhook como:

```text
http://host.docker.internal:3105/waha/webhook
```

Esse webhook deve enviar `X-Webhook-Secret`, definido por `WHATSAPP_WAHA_WEBHOOK_SECRET` no `.env` local privado.

Para replay/debug de um evento salvo:

```bash
node scripts/whatsapp-local-gateway.mjs \
  --root /Users/luiz_fbm/Developer/freela \
  import-waha-event \
  --file .scratch/waha-event.json \
  --auto-wake
```

Eventos `message` inbound entram em `whatsapp_inbound_events`. Texto normal da WAHA pode chegar como `type: "chat"`; o Gateway/CRM normalizam isso para `message_type: "text"`. Se o lead nao for identificado, o Gateway grava em `whatsapp_unmatched_inbound_events`, imprime `Sem identidade: N` e nao envia nada.

Todo POST recebido pelo monitor gera auditoria privada em:

```text
.scratch/whatsapp/waha-webhook-events.jsonl
```

Use esse arquivo quando a WAHA mostrar status 200 mas a mensagem nao aparecer no CRM. Cada linha informa `event`, `messageId`, `chatId`, `result.imported`, `result.skipped`, `result.unmatched` e `result.failed`, alem do payload bruto local para diagnostico.

Para reconciliar identidade, use:

```bash
node scripts/freela-crm.mjs whatsapp identity link --name "Nome do Lead" --identity "999000111222333@lid"
node scripts/freela-crm.mjs whatsapp unmatched reconcile
```

Quando a auditoria mostrar que o inbound nao pertence a um lead comercial, preserve o bruto como `no_match`:

```bash
node scripts/freela-crm.mjs whatsapp unmatched mark-no-match --id 123 --reason "status broadcast"
node scripts/freela-crm.mjs whatsapp unmatched mark-no-match --chat-id "999000111222333@lid" --reason "conversa pessoal"
```

O dedupe de acordar workers fica em `whatsapp_worker_wakes`.

Roteamento com `--auto-wake`:

- Atendimento WhatsApp recebe conversa normal: `resposta_permissao`, `resposta_pediu_exemplo`, `resposta_recebida`.
- Jhon Snow / Atendimento e Fechamento recebe fechamento comercial: `preco_pedido`, `lead_quente`, `objecao_comercial`, `handoff_luiz`, `qualificacao_preco_pendente` e `bloqueado_guardiao`.
- Se o lead respondeu a pergunta de objetivo depois de pedir preco, preserve `qualificacao_preco_pendente`/`preco_pedido` e mantenha com Jhon Snow. Nao encaminhar para Atendimento WhatsApp nem gerar resposta neutra.
- Use `--closer-agent-id` apenas em teste para sobrescrever o agente closer.

Demo ja aprovada pedida no WhatsApp nao deve cair em lead-cards. Se o lead pediu demo/exemplo/link e ha link seguro aprovado por QA, garanta `exemplo_aprovado_para_envio`, crie nova Outbox com `node scripts/freela-crm.mjs whatsapp outbox propose --name [nome] --body [mensagem] --source [fonte] --humanizer-pass true --used-last-inbound true --contextual-reply true`, passe pelo Guardiao e despache pelo Gateway com `dispatch-approved-outbox --provider waha --outbox-id [id]`. Manual so se o Guardiao bloquear, WAHA/Gateway falhar ou ficar `dispatch_ambiguous`, ou se a conversa envolver preco/fechamento real.

## Setup local

WAHA deve rodar localmente, preso em `127.0.0.1`, com sessao persistente e API key quando possivel. Nao exponha a API em rede publica.

Antes de recriar ou atualizar o container, preserve a sessao local:

```bash
mkdir -p .scratch/ops
tar -czf .scratch/ops/waha-sessions-snapshot-$(date +%Y%m%d-%H%M%S).tgz \
  -C .scratch/waha .sessions
```

Crie segredos locais se ainda nao existirem. Esse arquivo e privado e nao deve entrar no git:

```bash
touch .env
grep -q '^WAHA_API_KEY=' .env || printf "WAHA_API_KEY=%s\n" "$(openssl rand -hex 32)" >> .env
grep -q '^WAHA_DASHBOARD_USERNAME=' .env || printf "WAHA_DASHBOARD_USERNAME=admin\n" >> .env
grep -q '^WAHA_DASHBOARD_PASSWORD=' .env || printf "WAHA_DASHBOARD_PASSWORD=%s\n" "$(openssl rand -hex 24)" >> .env
grep -q '^WHATSAPP_SWAGGER_USERNAME=' .env || printf "WHATSAPP_SWAGGER_USERNAME=admin\n" >> .env
grep -q '^WHATSAPP_SWAGGER_PASSWORD=' .env || printf "WHATSAPP_SWAGGER_PASSWORD=%s\n" "$(openssl rand -hex 24)" >> .env
grep -q '^WHATSAPP_WAHA_WEBHOOK_SECRET=' .env || printf "WHATSAPP_WAHA_WEBHOOK_SECRET=%s\n" "$(openssl rand -hex 24)" >> .env
```

Suba o WAHA pelo Compose versionado:

```bash
docker compose -f docker-compose.waha.yml up -d
```

O Compose monta `./.scratch/waha/.sessions` em `/app/.sessions`, prende a API em `http://127.0.0.1:3000`, exige `WAHA_API_KEY`/`WAHA_DASHBOARD_PASSWORD` do `.env` local e aponta o webhook interno do container para `http://host.docker.internal:3105/waha/webhook`.

O Gateway deve ficar em loopback. O contrato local nao permite bind wildcard; se webhook vindo do container Docker Desktop precisar alcancar o host, use decisao separada para proxy/tunel local aprovado.

O Gateway carrega `.env` automaticamente a partir de `--root`, sem sobrescrever variaveis ja presentes no processo. O `set -a` abaixo continua aceitavel para operacao assistida, mas nao e requisito para `dispatch-approved-outbox`.

```bash
set -a
. ./.env
set +a
node scripts/whatsapp-local-gateway.mjs \
  --root /Users/luiz_fbm/Developer/freela \
  serve-waha-webhook \
  --host 127.0.0.1 \
  --port 3105 \
  --auto-wake
```

O endpoint local continua acessivel em `http://127.0.0.1:3105/waha/webhook`; requisicoes POST sem o header secreto recebem `401`.

Depois de subir, abra o dashboard local em `http://127.0.0.1:3000`, verifique a sessao `default` e pareie via QR Code se aparecer `SCAN_QR_CODE`. Para validar a API:

```bash
set -a
. ./.env
set +a
curl -H "X-Api-Key: $WAHA_API_KEY" http://127.0.0.1:3000/api/sessions
```

## Dispatch de laboratorio

O dispatch WAHA e explicito e passa sempre pelo Gateway.

No fluxo padrao, use a revisao do Guardiao com auto-dispatch:

```bash
node scripts/freela-crm.mjs \
  --root /Users/luiz_fbm/Developer/freela \
  whatsapp guardian review \
  --outbox-id 6 \
  --auto-wake true \
  --auto-dispatch true
```

Para diagnostico manual, consulte a Outbox pelo CLI oficial:

```bash
node scripts/freela-crm.mjs \
  --root /Users/luiz_fbm/Developer/freela \
  whatsapp outbox status \
  --outbox-id 6
```

O status deve mostrar `Pode despachar: sim`. Nao use SQL manual para decidir dispatch. O comando Gateway direto abaixo e fallback operacional/diagnostico; workers devem preferir `whatsapp guardian review --auto-dispatch true`.

```bash
node scripts/whatsapp-local-gateway.mjs \
  --root /Users/luiz_fbm/Developer/freela \
  dispatch-approved-outbox \
  --provider waha \
  --outbox-id 6 \
  --waha-api-base http://127.0.0.1:3000 \
  --waha-session default
```

Regra operacional: em fluxo de worker, sempre usar `--outbox-id`. O modo sem `--outbox-id` fica reservado para operacao assistida em lote, quando o operador explicitamente quiser despachar todos os aprovados elegiveis. Lote real exige `--confirm-batch true`; dry-run em lote continua permitido para auditoria.

O Gateway recebe telefone real da Outbox e usa `GET /api/contacts/check-exists` antes de enviar. `@lid` continua sendo identidade de leitura no CRM/Outbox, mas o WAHA pode resolver um telefone real para um `chatId` `@lid`; nesse caso o Gateway pode usar esse `chatId` resolvido pela propria WAHA para entregar a mensagem.

Se `check-exists` retornar `401 Unauthorized`, a leitura correta e falha de credencial/processo de dispatch. Valide o `.env` local e a API key pelo Gateway; nao transforme isso em bloqueio de conteudo e nao tente `/api/sendText` diretamente.

Regras:

- `@lid` nunca deve ser salvo como destino direto na Outbox.
- `@lid` retornado por `check-exists` da WAHA e destino resolvido valido para `/api/sendText`.
- `@s.whatsapp.net` e telefone cru viram `telefone@c.us`.
- `sendSeen`, `startTyping`, `stopTyping` e `sendText` passam pelo Gateway.
- Resposta de `sendText` sem ACK forte vira `delivery_pending`.
- `delivery_pending` nao conta como envio entregue e nao cria interacao outbound.

## ACK forte

O CRM so marca envio como entregue quando chega `message.ack` com:

- `DEVICE`
- `READ`
- `PLAYED`

Ou `ack >= 2`.

Importar evento WAHA:

```bash
node scripts/whatsapp-local-gateway.mjs \
  --root /Users/luiz_fbm/Developer/freela \
  import-waha-event \
  --file .scratch/waha-event.json
```

Eventos esperados:

- `message.ack`: atualiza `delivery_ack`, `delivery_ack_name`, `delivered_at` e `sent_at` quando o ACK e forte.
- `message.waiting`: marca `dispatch_ambiguous`, registra erro e move o lead para `handoff_luiz`.

## Criterio para sair do laboratorio

WAHA so pode ser usado em lead real depois de passar no teste de controle:

1. receber inbound de um telefone conhecido;
2. responder 5 mensagens automaticas seguidas;
3. confirmar que todas chegaram como texto normal no celular do destinatario;
4. confirmar ACK `DEVICE`, `READ` ou `PLAYED`;
5. testar uma mensagem com link de demo;
6. nao aparecer `message.waiting` nem placeholder "Aguardando mensagem".

Se qualquer mensagem virar placeholder, WAHA volta a leitura/laboratorio e o envio automatico real fica bloqueado.
