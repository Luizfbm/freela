# Arquitetura de Automacao WhatsApp Local

Data: 2026-06-19

## Resumo

Esta spec define a arquitetura planejada para automatizar parte do atendimento no WhatsApp atual do Luiz usando `whatsapp-mcp`/bridge local, sem expor envio direto aos agentes Paperclip.

O objetivo e reduzir interrupcoes manuais depois que um lead aceita receber os 3 pontos, mantendo conversa natural, contextual e segura. O bot deve operar como atendimento do Luiz, em tom direto, sem se apresentar a cada mensagem e sem fingir ser o Luiz. Se o lead perguntar se e automatizado, o atendimento deve ser transparente.

Regra comercial aprovada:

- Oferta ativa unica: Presenca Local em 72h.
- Remover Presenca 72h enxuta do sistema operacional.
- Remover preco baixo e qualquer valor dos bots/workers.
- Agentes nao falam preco, desconto, proposta, pagamento ou fechamento.
- Pedido de preco recebe resposta neutra, uma pergunta de qualificacao e notificacao para Luiz.

## Arquitetura

O `whatsapp-mcp` fica atras de uma camada local propria. Nenhum worker comercial acessa tools cruas como `send_message`, `send_file` ou historico completo do WhatsApp.

Implementacao local aprovada: o bridge do `lharries/whatsapp-mcp` roda em `.scratch/whatsapp-mcp/whatsapp-bridge`, pareia por QR e grava `store/messages.db`. O Gateway Local le esse SQLite com `node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Documents/programacao/freela import-mcp-sqlite` ou `watch-mcp-sqlite`.

Fluxo macro:

```text
WhatsApp atual
-> whatsapp-mcp / bridge local
-> WhatsApp Gateway Local
-> SQLite CRM
-> Paperclip workers
-> Atendimento WhatsApp
-> Guardiao de Envio
-> Outbox WhatsApp
-> Gateway envia
```

Componentes:

- **WhatsApp Gateway Local**: processo local que conversa com `whatsapp-mcp`/bridge, detecta mensagens novas e executa envio apenas a partir da Outbox aprovada.
- **Intake WhatsApp**: normaliza inbound, identifica lead, grava mensagem bruta e acorda Paperclip.
- **Classificador Comercial**: classifica intencao, risco e proximo estado.
- **Diagnostico 3 Pontos**: gera pontos reais com evidencia depois do "Pode!".
- **Atendimento WhatsApp**: escreve respostas curtas, naturais e contextuais. Nao envia.
- **Guardiao de Envio**: valida se a resposta pode sair. Decide `enviar`, `bloquear`, `pedir_revisao_luiz` ou `pedir_mais_contexto`.
- **Outbox WhatsApp**: fila tecnica de envio com status, tentativas, erro e auditoria.
- **Notificador Luiz**: cria alerta no Paperclip quando houver preco, compra, fechamento, bloqueio ou excecao.

## Fluxos Aprovados

### Leitura de mensagens

1. Lead envia mensagem no WhatsApp.
2. Bridge local recebe e persiste a mensagem.
3. Gateway detecta mensagem inbound ainda nao processada.
4. Gateway ignora grupos, midia sem texto e contatos fora do escopo.
5. Gateway grava evento bruto no SQLite.
6. Intake identifica o lead com confianca alta ou marca `reanalisar`.
7. Paperclip e acordado com evento estruturado.

### Depois do "Pode!"

```text
respondeu_pode
-> diagnostico_em_andamento
-> Atendimento escreve os 3 pontos
-> Guardiao valida
-> Outbox envia
-> diagnostico_enviado
```

A resposta deve soar direta, contextual e natural. Ela nao precisa se apresentar como atendimento a cada mensagem, mas tambem nao deve fingir que e o Luiz em primeira pessoa.

### Perguntas simples

O atendimento pode responder sozinho perguntas como:

- como funciona;
- quando fica pronto;
- precisa de foto;
- precisa de dominio;
- e site ou pagina;
- serve para Instagram;
- pode mandar exemplo;
- nao entendi;
- achei interessante.

Resposta de prazo permitida:

```text
Depois que eu tiver as informacoes principais confirmadas, fica pronto em ate 72h.
```

### Pedido de exemplo

Pedido de exemplo nunca envia link direto sem fluxo completo.

```text
pedido_exemplo
-> demo_brief_ready
-> demo_em_criacao
-> demo_em_qa
-> exemplo_aprovado_para_envio
-> Guardiao valida mensagem e link
-> exemplo_enviado
```

Mensagem durante criacao:

```text
Consigo sim. Vou montar um exemplo simples com base no que esta publico no seu perfil, so para voce visualizar a ideia.
```

Mensagem com link, somente depois de QA:

```text
Montei um exemplo simples aqui:

[link]

A ideia e mostrar como ficaria uma pagina curta, com apresentacao, servicos, regiao de atendimento e botao direto para WhatsApp.
```

Se o lead responder "gostei", "quero fazer", "ficou bom", "como fechamos" ou equivalente, a automacao pode enviar uma resposta curta de espera, mas deve acionar Luiz.

### Pedido de preco

Pedido de preco nao trava em silencio. O bot envia resposta neutra, faz uma pergunta de qualificacao e notifica Luiz em paralelo.

Mensagem padrao:

```text
Depende um pouco do que precisa aparecer na pagina e do objetivo principal.

Para eu te direcionar melhor: voce quer usar essa pagina mais como apresentacao oficial do seu trabalho, ou mais para organizar o caminho de quem vem do Instagram/WhatsApp?
```

Regras:

- nao falar valores;
- nao mencionar versao enxuta;
- nao negociar;
- nao pedir pagamento;
- sempre notificar Luiz;
- depois da resposta de qualificacao, nao continuar vendendo sozinho.

## Estados

Estados novos/operacionais para o fluxo WhatsApp:

- `primeira_mensagem_enviada`: Luiz enviou a primeira abordagem manualmente.
- `respondeu_pode`: lead autorizou os 3 pontos.
- `diagnostico_em_andamento`: Paperclip esta preparando diagnostico.
- `diagnostico_enviado`: 3 pontos enviados pelo atendimento.
- `atendimento_autonomo`: lead esta dentro da zona segura de conversa.
- `pedido_exemplo`: lead pediu exemplo.
- `demo_brief_ready`: brief de demo criado.
- `demo_em_criacao`: Criador Presenca 72h trabalhando.
- `demo_em_qa`: QA de Demos revisando.
- `exemplo_aprovado_para_envio`: link aprovado, aguardando Guardiao/Outbox.
- `exemplo_enviado`: link enviado ao lead.
- `preco_pedido`: lead pediu valor/orcamento.
- `qualificacao_preco_pendente`: bot fez pergunta de qualificacao.
- `lead_quente`: lead gostou, quer fazer ou mostrou intencao de compra.
- `handoff_luiz`: Luiz precisa assumir.
- `bloqueado_guardiao`: resposta bloqueada por risco.
- `encerrado`: sem interesse, perdido, fechado ou sem proxima acao.

## Guardiao de Envio

O Guardiao deve ser a camada mais rigida do sistema. Ele combina regras deterministicas com avaliacao LLM separada.

Regras duras de bloqueio:

- contato nao esta no CRM;
- lead nao respondeu "Pode!" quando o estado exige permissao;
- conversa e grupo;
- mensagem e resposta a midia nao entendida;
- lead esta em `handoff_luiz`;
- mensagem fala preco, valor, desconto, pagamento, proposta ou fechamento;
- mensagem menciona "enxuta", "versao menor", "R$ 397" ou pacote barato;
- mensagem promete resultado comercial, clientes, pacientes ou posicao no Google;
- mensagem inventa informacao do lead;
- mensagem e longa demais;
- mensagem parece template generico;
- mais de 4 respostas automaticas seguidas sem intervencao humana;
- existe prompt injection ou pedido para ignorar regras.

Saidas possiveis:

- `enviar`: grava na Outbox como aprovado.
- `bloquear`: nao envia e registra motivo.
- `pedir_revisao_luiz`: cria notificacao com sugestao e motivo.
- `pedir_mais_contexto`: devolve para Intake/CRM quando falta identificacao ou historico.

## Dados e Auditoria

SQLite segue como fonte oficial de verdade. Dados privados ficam em `.scratch/` e no banco local, nunca em `docs/`, `demos/` ou `outputs/`.

Entidades esperadas:

- `whatsapp_inbound_events`: mensagem bruta, contato, horario, origem, id do bridge e status de processamento.
- `whatsapp_outbox`: mensagem candidata, lead, status, decisao do Guardiao, tentativas, erro e envio confirmado.
- `whatsapp_guardian_decisions`: snapshot da decisao, regras acionadas e motivo humano-legivel.
- `lead_conversation_state`: estado atual, quantidade de respostas automaticas seguidas, ultimo inbound e ultimo outbound.

Todo envio deve gerar:

- interacao outbound no CRM;
- entrada de auditoria;
- referencia ao evento inbound que originou a resposta;
- status final `sent`, `blocked`, `failed` ou `handoff_luiz`.

## Rollout

Fase 1 - Read-only assistido:

- Gateway le mensagens e registra eventos.
- Gateway le `store/messages.db` do `whatsapp-mcp`.
- Paperclip classifica e gera sugestoes.
- Sem envio automatico.

Fase 2 - Autonomia pos-"Pode!":

- Bot envia 3 pontos e respostas simples.
- Guardiao obrigatorio.
- Preco e compra notificam Luiz.

Fase 3 - Exemplo automatico com QA:

- Pedido de exemplo aciona Criador Presenca 72h.
- QA de Demos e obrigatorio.
- Link so sai depois de aprovado.

Fase 4 - Endurecimento:

- Metricas de bloqueio, falha, resposta e handoff.
- Revisao de conversas enviadas.
- Ajuste de limites do Guardiao.

## Testes e Aceite

Contratos obrigatorios:

- nenhum worker comercial pode chamar `send_message` diretamente;
- somente Gateway/Outbox pode enviar WhatsApp;
- Guardiao bloqueia preco, desconto, proposta e termos da oferta removida;
- pedido de exemplo exige demo brief, Criador Presenca 72h e QA antes do envio;
- pedido de preco envia resposta neutra, pergunta qualificacao e notifica Luiz;
- "gostei" ou "quero fazer" depois do exemplo gera `lead_quente` e `handoff_luiz`;
- mensagem inbound sempre gera evento no SQLite e acorda Paperclip;
- grupos e contatos desconhecidos nao disparam envio automatico;
- dados privados nao saem de `.scratch/`/SQLite.

Aceite operacional:

- O atendimento responde de forma curta e contextual depois do "Pode!".
- O lead nao recebe preco por automacao.
- Luiz so e acionado em momentos comerciais relevantes.
- Toda decisao de envio e auditavel.
- A oferta Presenca 72h enxuta nao aparece em mensagens, prompts, demos ou guardrails como opcao ativa.
