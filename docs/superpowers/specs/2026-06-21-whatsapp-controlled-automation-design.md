# Arquitetura de WhatsApp com envio controlado

Data: 2026-06-21

## Resumo

Esta spec define a proxima etapa da automacao local de WhatsApp da operacao freelancer. O objetivo e permitir envio automatico controlado depois que o lead responder "Pode!", sem expor `send_message` cru aos workers Paperclip e sem deixar agentes decidirem sozinhos sobre preco, proposta, pagamento ou fechamento.

A decisao aprovada e a opcao 2: automacao direta controlada. O envio pode acontecer automaticamente, mas somente quando uma resposta candidata passar por Atendimento WhatsApp, Humanizer, Guardiao de Envio e Outbox aprovada.

## Fronteira de seguranca aprovada

O `lharries/whatsapp-mcp` continua sendo a ponte tecnica local. Ele le e envia pelo WhatsApp atual do Luiz, mas fica atras do Gateway Local.

Workers Paperclip nao recebem acesso a `send_message`, `send_file`, `send_audio_message` ou historico completo do WhatsApp. Eles leem apenas CRM/Paperclip e escrevem decisoes estruturadas.

O unico componente autorizado a enviar WhatsApp e `scripts/whatsapp-local-gateway.mjs`, e apenas quando existir um registro em `whatsapp_outbox` com status `approved`, `guardian_decision = enviar`, `humanizer_pass = true` e `sent_at` vazio.

Todo envio precisa ter:

- lead identificado no CRM;
- mensagem inbound anterior;
- estado de conversa permitido;
- decisao registrada do Guardiao;
- auditoria no SQLite;
- trava anti-duplicidade antes do envio.

Se houver preco, valor, orcamento, proposta, pagamento, contrato, desconto, fechamento ou intencao clara de compra, a automacao nao vende sozinha. Ela pode mandar no maximo a resposta neutra de qualificacao e deve acionar Luiz.

## Arquitetura

Fluxo aprovado:

```text
WhatsApp atual
-> whatsapp-mcp / bridge local
-> Gateway Local
-> SQLite CRM
-> Atendimento WhatsApp
-> Humanizer obrigatorio
-> Outbox WhatsApp
-> Guardiao de Envio
-> Gateway envia
-> auditoria e estado da conversa
```

Responsabilidades:

- WhatsApp Gateway Local: importa inbound do `messages.db`, despacha Outbox aprovada e registra resultado tecnico.
- CRM SQLite: fonte oficial de verdade para inbound, outbox, estado, auditoria e interacoes.
- Atendimento WhatsApp: escreve resposta curta, unica, contextual e natural depois do "Pode!".
- Humanizer: remove marcas de texto de IA antes da resposta ir para Outbox.
- Guardiao de Envio: bloqueia risco comercial, texto generico, texto desconectado do contexto, falta de humanizacao ou estado invalido.
- Notificador Luiz: cria handoff quando houver preco, fechamento, lead quente, bloqueio ou falha repetida.

## Estados da conversa

Estados operacionais:

- `primeira_mensagem_enviada`: Luiz enviou a primeira abordagem manualmente.
- `respondeu_pode`: lead aceitou receber os 3 pontos.
- `diagnostico_em_andamento`: diagnostico esta sendo preparado.
- `diagnostico_enviado`: 3 pontos foram enviados.
- `atendimento_autonomo`: conversa esta dentro da zona segura.
- `pedido_exemplo`: lead pediu exemplo.
- `demo_brief_ready`: brief de demo foi criado.
- `demo_em_criacao`: Criador Presenca 72h esta trabalhando.
- `demo_em_qa`: QA de Demos esta revisando.
- `exemplo_aprovado_para_envio`: link aprovado e pronto para mensagem.
- `exemplo_enviado`: link enviado ao lead.
- `preco_pedido`: lead pediu valor, orcamento ou investimento.
- `qualificacao_preco_pendente`: bot fez pergunta neutra de qualificacao e Luiz foi acionado.
- `lead_quente`: lead gostou, quer fazer ou demonstrou intencao de compra.
- `handoff_luiz`: Luiz precisa assumir.
- `bloqueado_guardiao`: Guardiao bloqueou a resposta.
- `encerrado`: conversa sem proxima acao automatica.

## Zonas de autonomia

### Pode responder sozinho

Depois que o lead respondeu "Pode!", o atendimento pode responder perguntas simples sobre:

- como funciona;
- se e site ou pagina;
- prazo de entrega;
- fotos e materiais;
- dominio;
- objetivo da pagina;
- pedido simples de explicacao;
- interesse leve.

Essas respostas precisam ser curtas e conectadas ao ultimo texto do lead.

### Pode responder uma vez e acionar Luiz

Quando o lead pedir preco, valor, orcamento, proposta ou pagamento, a automacao pode enviar uma pergunta neutra de qualificacao e criar handoff para Luiz.

Resposta permitida:

```text
Depende um pouco do que precisa aparecer na pagina e do objetivo principal.

Para eu te direcionar melhor: voce quer usar essa pagina mais como apresentacao oficial do seu trabalho, ou mais para organizar o caminho de quem vem do Instagram/WhatsApp?
```

Depois disso, o estado vira `handoff_luiz` ou `qualificacao_preco_pendente`, e o bot nao continua vendendo sozinho.

### Nao pode responder sozinho

Bloqueia e aciona Luiz quando houver:

- "quero fechar";
- "como pago?";
- "manda contrato";
- "faz por menos?";
- objecao forte de preco;
- lead irritado;
- suspeita de golpe ou automacao;
- pedido fora do escopo;
- decisao comercial.

## Limite de respostas automaticas

O limite aprovado e 5 respostas automaticas seguidas por lead.

Cada resposta precisa ser unica, contextualizada e baseada no ultimo inbound, no estado atual e no historico resumido do lead. Se a resposta servir para qualquer lead, ela deve ser bloqueada ou revisada.

Depois de 5 respostas automaticas seguidas sem intervencao humana, o estado vira `handoff_luiz`.

## Humanizer obrigatorio

Toda resposta candidata do Atendimento WhatsApp passa por `humanizer` antes de entrar na Outbox.

Contrato:

- Atendimento gera rascunho contextual.
- Atendimento aplica Humanizer.
- A Outbox recebe apenas a versao final humanizada.
- A Outbox registra `humanizer_pass = true`.
- A Outbox registra sinais como `used_last_inbound = true` e `contextual_reply = true`.
- Guardiao bloqueia resposta sem `humanizer_pass = true`.

O Guardiao tambem bloqueia resposta que tenha sinais de IA:

- frase generica sem relacao clara com o ultimo inbound;
- tom promocional;
- lista artificial;
- ritmo de template;
- travessao;
- "otima pergunta";
- "com certeza";
- "fico a disposicao";
- "entendi perfeitamente";
- texto longo demais;
- promessa de resultado.

## Pedido de exemplo

Pedido de exemplo nunca envia link direto.

Fluxo aprovado:

```text
pedido_exemplo
-> Atendimento responde confirmacao curta
-> demo-brief.md
-> Criador Presenca 72h
-> QA de Demos
-> exemplo_aprovado_para_envio
-> Outbox com link
-> Guardiao valida
-> Gateway envia
```

Mensagem imediata permitida:

```text
Consigo sim. Vou montar um exemplo simples com base no que esta publico no seu perfil, so para voce visualizar a ideia.
```

Mensagem com link, somente depois de QA:

```text
Montei um exemplo simples aqui:

[link]

A ideia e mostrar como ficaria uma pagina curta, com apresentacao, servicos, regiao de atendimento e botao direto para WhatsApp.
```

Se o lead responder "gostei", "quero fazer", "ficou bom", "como fechamos" ou equivalente, a automacao envia no maximo uma transicao curta e aciona Luiz.

## Executor de envio

O executor fica no Gateway Local e despacha somente Outbox aprovada.

Comandos planejados:

```bash
node scripts/whatsapp-local-gateway.mjs dispatch-approved-outbox --dry-run
node scripts/whatsapp-local-gateway.mjs dispatch-approved-outbox
node scripts/whatsapp-local-gateway.mjs watch-mcp-sqlite --dispatch-approved --interval-ms 10000
```

Regras do executor:

- selecionar somente `whatsapp_outbox.status = approved`;
- exigir `guardian_decision = enviar`;
- exigir `humanizer_pass = true`;
- exigir `sent_at is null`;
- bloquear se o lead estiver em `handoff_luiz`, `bloqueado_guardiao` ou `encerrado`;
- antes de chamar o bridge, mudar status para `sending`;
- se enviar com sucesso, mudar status para `sent`;
- se falhar, mudar status para `failed`, incrementar `attempts` e registrar erro;
- depois de 2 falhas, parar retentativas e criar handoff para Luiz;
- nunca enviar item ja marcado com `sent_at`.

## Auditoria

Todo outbound enviado precisa registrar:

- `outbox_id`;
- `lead_id`;
- `inbound_event_id`;
- `target_chat_id`;
- `body`;
- `sent_at`;
- `bridge_message_id` quando disponivel;
- interacao outbound no CRM;
- entrada de auditoria.

Falhas ficam no SQLite. Arquivos temporarios em `.scratch/` podem existir apenas para diagnostico local.

## Contratos de teste

Contratos obrigatorios:

- gateway continua sem expor `send_message`, `send_file` ou `send_audio_message` aos workers;
- so o Gateway despacha Outbox aprovada;
- Outbox sem `humanizer_pass = true` nao sai;
- Outbox sem decisao `enviar` do Guardiao nao sai;
- mensagem com preco, proposta, pagamento, desconto ou fechamento bloqueia;
- resposta generica ou desconectada do ultimo inbound bloqueia;
- mais de 5 respostas automaticas seguidas gera `handoff_luiz`;
- pedido de exemplo exige demo, QA e `exemplo_aprovado_para_envio`;
- dispatch usa trava `sending` antes do envio;
- dispatch nao reenvia item com `sent_at`;
- falha repetida cria handoff para Luiz;
- grupos, midia sem texto e contatos desconhecidos nao disparam envio automatico.

## Rollout

Fase 1: completar contratos do CRM e Outbox.

Fase 2: criar dispatch `--dry-run` e testes de anti-duplicidade.

Fase 3: ligar envio real somente para Outbox aprovada e humanizada.

Fase 4: ativar watcher com `--dispatch-approved`.

Fase 5: revisar conversas reais e ajustar Guardiao.

## Fora de escopo

- primeira abordagem automatica;
- envio em grupos;
- envio de midia;
- envio de preco;
- negociacao;
- fechamento;
- exposicao direta do MCP aos workers;
- automacao de Instagram, DM, curtida, comentario ou follow.
