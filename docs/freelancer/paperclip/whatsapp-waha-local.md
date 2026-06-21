# WAHA Local Lab

WAHA e um motor alternativo de WhatsApp HTTP API para laboratorio de envio automatico. Ele nao substitui o contrato comercial atual ate passar em teste real com telefone de controle. Workers continuam proibidos de chamar WAHA diretamente.

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
node scripts/freela-crm.mjs whatsapp identity link --name "Nome do Lead" --identity "273478418722987@lid"
node scripts/freela-crm.mjs whatsapp unmatched reconcile
```

O dedupe de acordar workers fica em `whatsapp_worker_wakes`.

Roteamento com `--auto-wake`:

- Atendimento WhatsApp recebe conversa normal: `resposta_permissao`, `resposta_pediu_exemplo`, `resposta_recebida`.
- Jhon Snow / Atendimento e Fechamento recebe fechamento comercial: `preco_pedido`, `lead_quente`, `objecao_comercial`, `handoff_luiz`, `qualificacao_preco_pendente` e `bloqueado_guardiao`.
- Use `--closer-agent-id` apenas em teste para sobrescrever o agente closer.

## Setup local

WAHA deve rodar localmente, preso em `127.0.0.1`, com API key quando possivel. Nao exponha a API em rede publica.

Comando base de laboratorio:

```bash
docker run -it --rm \
  -p 127.0.0.1:3000:3000 \
  --name waha \
  devlikeapro/waha
```

Depois de subir, abrir o dashboard local, iniciar a sessao `default` e parear via QR Code. Se usar chave:

```bash
export WHATSAPP_WAHA_API_KEY="sua-chave-local"
```

## Dispatch de laboratorio

O dispatch WAHA e explicito e passa sempre pelo Gateway.

```bash
node scripts/whatsapp-local-gateway.mjs \
  --root /Users/luiz_fbm/Developer/freela \
  dispatch-approved-outbox \
  --provider waha \
  --waha-api-base http://127.0.0.1:3000 \
  --waha-session default
```

O Gateway recebe telefone real da Outbox e usa `GET /api/contacts/check-exists` antes de enviar. `@lid` continua sendo identidade de leitura no CRM/Outbox, mas o WAHA pode resolver um telefone real para um `chatId` `@lid`; nesse caso o Gateway pode usar esse `chatId` resolvido pela propria WAHA para entregar a mensagem.

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
