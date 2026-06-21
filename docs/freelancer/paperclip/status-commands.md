# Comandos simples de status

Use estes comandos para atualizar o CRM sem escrever uma explicacao longa. O comando pode ser enviado em uma issue do Paperclip ou usado como anotacao para o worker `Follow-up CRM`.

Issue recomendada no Paperclip: `FRE-6` - `Console CRM - comandos de status`.

Essa issue fica em `backlog` de proposito. Ela nao roda sozinha, mas comentarios com comandos podem acordar o Follow-up CRM.

## Comandos

- `status`
- `status [nome]`
- `enviado [nome]`
- `followup enviado [nome]`
- `respondeu [nome]: [mensagem recebida]`
- `pode [nome]`
- `sem resposta [nome]`
- `pediu exemplo [nome]`
- `pediu preco [nome]`
- `fechado [nome]`
- `perdido [nome]`
- `descartar [nome]`

## Como usar

Depois que o CRM gerar `.scratch/crm/hoje-enviar.md`, envie manualmente as mensagens no WhatsApp. Em seguida, registre o status com um comando curto.

Exemplos:

```text
enviado Luana Vicente
```

```text
respondeu Hellen: Oie Luiz, bom dia! Tudo sim. Claro, pode sim!
```

```text
pediu exemplo Francismara
```

## O que cada comando faz

- `status`: mostra um resumo da fila comercial.
- `status [nome]`: mostra o status daquele lead.
- `enviado [nome]`: marca a primeira mensagem como enviada manualmente e agenda follow-up.
- `followup enviado [nome]`: marca que o follow-up foi enviado manualmente.
- `respondeu [nome]: ...`: registra a resposta e encaminha para Atendimento quando houver chance real de conversa.
- `pode [nome]`: pede ao Atendimento os 3 pontos reais de melhoria daquele lead.
- `sem resposta [nome]`: mantem ou agenda proximo follow-up, conforme cadencia.
- `pediu exemplo [nome]`: abre caminho para criacao de exemplo.
- `pediu preco [nome]`: encaminha para Atendimento responder com proposta ou faixa.
- `fechado [nome]`: encaminha para Ops de Entrega.
- `perdido [nome]`: tira da fila ativa como perdido.
- `descartar [nome]`: tira da fila ativa como descartado.

## Regra de seguranca

O Paperclip nunca envia mensagens automaticamente. Ele apenas organiza fila, status, follow-ups e proximas tarefas. O envio no WhatsApp continua manual.
