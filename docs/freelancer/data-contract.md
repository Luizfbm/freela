# Contrato de Dados Freelancer

Este contrato define onde a operacao freelancer guarda estado e como os workers devem ler e escrever dados. Ele existe para impedir duplicacao de leads, perda de historico e divergencia entre workers.

## Fonte de Verdade

A memoria operacional oficial e o SQLite privado acessado pela CLI.

Caminho de compatibilidade usado por scripts e workers:

```txt
.scratch/db/freela.sqlite
```

Na instancia local principal, esse caminho deve ser um symlink para o arquivo fisico local, fora de `Documents` e fora de storage sincronizado/offloadavel:

```txt
/Users/luiz_fbm/Library/Application Support/freela-paperclip/db/freela.sqlite
```

Workers devem tratar `.scratch/db/freela.sqlite` como ponto de acesso estavel, nao como garantia de diretorio fisico. Nao mover, copiar, restaurar ou recriar o SQLite manualmente. Toda escrita de estado deve passar pela CLI:

```bash
node scripts/freela-crm.mjs <comando>
```

Antes de operar em caso de duvida, rode:

```bash
node scripts/freela-crm.mjs healthcheck
```

## Ops Health e Confiabilidade

O estado de confiabilidade operacional e acompanhado pelo Ops Doctor:

```bash
node scripts/freela-ops-doctor.mjs check
node scripts/freela-ops-doctor.mjs snapshot
node scripts/freela-ops-doctor.mjs publish
```

O Ops Doctor grava evidencia tecnica privada em `.scratch/ops/reliability-status.json`, `.scratch/ops/reliability-status.md` e `.scratch/ops/backup-manifest.json`. Snapshots SQLite ficam em `/Users/luiz_fbm/Library/Application Support/freela-paperclip/backups`, fora de `Documents`.

Status operacional: `green`, `yellow`, `red`.

- `green`: operacao normal.
- `yellow`: operacao permitida com atencao.
- `red`: novas escritas criticas devem parar ate diagnostico/recuperacao.

O painel executivo fica no Paperclip, issue `Ops Health`, documento `reliability-status`. O Paperclip recebe resumo executivo sem dados brutos: nao publicar nomes de leads, telefones, mensagens, payloads brutos ou dumps de tabelas.

Arquivos em `.scratch/leads/`, `.scratch/crm/`, `.scratch/ops/` e `.scratch/qa-demos/` sao espelhos legiveis ou handoffs privados. Eles podem ser lidos pelos workers, mas nao devem ser editados manualmente como fonte oficial de status.

Arquivos em `docs/freelancer/` guardam regra, oferta, scripts e prompts. Eles nao devem conter dados privados de leads ou clientes.

Arquivos em `demos/` sao artefatos publicos/deployaveis. Eles nao devem conter historico privado de atendimento, prints, diagnosticos internos ou dados comerciais sensiveis.

## Handoff entre Workers

O contrato de passagem entre workers fica em `docs/freelancer/paperclip/worker-handoff-protocol.md`.

- Schema: `docs/freelancer/paperclip/worker-handoff.schema.json`.
- Script: `scripts/paperclip-create-handoff-issue.mjs`.
- Registro no SQLite: `node scripts/freela-crm.mjs handoff record --file [arquivo]`.
- Campos minimos: `target_agent_id`, `source_issue`, `workflow`, `artifacts` e `acceptance_criteria`.
- Nao copiar e colar handoff manualmente entre issues; workers devem criar child issue com `parentId`.
- Quando a issue de origem depender do worker alvo, usar `blockedByIssueIds` para destravar automaticamente depois que a child issue terminar.
- O script de handoff usa API direta do Paperclip, nao `npx`; cache npm nao deve bloquear auto-delegacao.
- Todo handoff entre workers deve ser registrado em `worker_handoffs`; o markdown/JSON de handoff pode apontar arquivos privados em `.scratch/`, mas nao vira fonte oficial de estado.

## Tabelas v1

- `leads`: cadastro mestre do lead.
- `lead_sources`: fontes observadas por lead.
- `lead_analysis`: diagnosticos e evidencias analisadas.
- `lead_platform_profiles`: Bio Evidence Pack por lead e plataforma, incluindo Instagram, bio, link da bio, gancho comercial e confianca.
- `lead_platform_links`: links analisados dentro de uma plataforma, como Linktree, bio.site, WhatsApp, agenda, site ou mapa.
- `interactions`: mensagens, respostas e eventos de atendimento.
- `outreach_queue`: fila de envio manual.
- `message_reviews`: decisoes estruturadas do QA de Mensagens.
- `worker_handoffs`: passagem estruturada de trabalho entre workers, com `pending_issue`, `issue_created`, `blocked`, `completed` ou `cancelled`; handoffs de um mesmo lote operacional devem preencher `workflow.batch_id`, e handoffs que nao podem duplicar issue podem usar `workflow.dedupe_key`, como `publish_fre7:50a2756c-2942-40c1-90f8-b16807a62ef3:YYYY-MM-DD`.
- `whatsapp_inbound_events`, `whatsapp_outbox`, `whatsapp_guardian_decisions` e `lead_conversation_state`: automacao local de WhatsApp atras do Guardiao. `whatsapp_outbox` diferencia aceite de transporte e entrega real com `dispatch_provider`, `provider_message_id`, `delivery_ack`, `delivery_ack_name`, `delivered_at`, `delivery_checked_at` e status `delivery_pending`.
- `whatsapp_identity_aliases`: vinculos entre leads e identidades WhatsApp/JID, incluindo contatos `@lid` que nao expõem telefone publico.
- `whatsapp_unmatched_inbound_events`: mensagens inbound sem lead identificado; devem ser reconciliadas com `whatsapp identity link` e `whatsapp unmatched reconcile`, nao descartadas. Quando a auditoria comprovar que o evento nao pertence a um lead comercial (ex.: status broadcast, atendimento de fornecedor ou conversa pessoal), registre via `whatsapp unmatched mark-no-match --id [id] --reason [motivo]` ou `--chat-id [jid]`; isso preserva o bruto com status `no_match` e tira o item do alerta de pendencia.
- `whatsapp_worker_wakes`: dedupe de issues criadas automaticamente para workers por inbound WhatsApp, agente alvo e tipo de wake.
- `demos`: exemplos/demos associados ao lead.
- `audit_log`: trilha de escrita aplicada pela CLI.

## Campos Obrigatorios de Lead

- `canonical_name`
- `slug`
- `city`
- `first_seen`
- `last_seen`
- `status`
- pelo menos um identificador quando disponivel: `phone_or_contact`, `instagram`, `website_url` ou `business`

Campos comerciais importantes:

- `recommended_offer`
- `contacted_at`
- `response_status`
- `demo_path`
- `analysis_status`
- `handoff_status`
- `notes`

## Status Permitidos

- `novo`
- `abordado`
- `respondeu`
- `interessado`
- `fechado`
- `perdido`
- `descartado`
- `reanalisar`
- `duplicado`
- `tem_demo`

Nenhum worker deve inventar status novo sem alterar este contrato, os testes e a CLI.

## Regras de Dedupe

A CLI deve tentar identificar lead existente nesta ordem:

1. telefone normalizado;
2. Instagram normalizado;
3. site normalizado;
4. `slug + cidade`;
5. nome parecido apenas para consulta humana ou comando especifico.

Quando mais de um lead puder ser o mesmo match, a CLI deve bloquear a escrita automatica e marcar o caso como ambiguo/reanalisar. O worker deve pedir confirmacao curta ao usuario ou acionar o COO.

## Regras de Escrita

- Nao sobrescrever dado preenchido com campo vazio.
- Nao sobrescrever dado confiavel com inferencia fraca.
- Preservar sempre `first_seen`, `contacted_at`, `response_status`, `demo_path`, `notes` e historico antigo quando o novo dado vier vazio.
- Se o lead ja estiver em `abordado`, `respondeu`, `interessado`, `fechado`, `perdido`, `descartado` ou `tem_demo`, nao voltar para `novo` automaticamente.
- Toda escrita relevante deve gerar entrada em `audit_log`.
- Toda resposta real de lead deve gerar entrada em `interactions`.

## Bio Evidence Pack

O Bio Evidence Pack e o contrato minimo para transformar Instagram e links da bio em inteligencia comercial, nao apenas em contato. A fonte oficial e o SQLite:

- `lead_platform_profiles`: um registro por lead e `platform`, com `bio_status`, `bio_text`, `bio_link_url`, `bio_link_type`, `bio_link_status`, `link_page_summary`, `services_seen`, `location_seen`, `owner_operator_signal`, `contact_path`, `whatsapp_visible`, `positioning_signal`, `friction_points`, `commercial_hook`, `evidence_confidence`, `browser_evidence_status`, `browser_evidence_method`, `instagram_session_status`, `observed_at` e `run_id`.
- `lead_platform_links`: links encontrados dentro do perfil/plataforma, com URL, tipo, resumo, posicao e se e caminho de contato.

Comandos:

```bash
node scripts/paperclip-chrome-scout-smoke.mjs --instagram
node scripts/freela-crm.mjs profile-evidence upsert --file .scratch/prospeccao-vitoria/YYYY-MM-DD/profile-evidence.json
node scripts/freela-crm.mjs profile-evidence export --date YYYY-MM-DD
```

O export gera `.scratch/prospeccao-vitoria/YYYY-MM-DD/profile-evidence.md` apenas sob demanda para revisao humana. Ele e espelho privado; o SQLite continua sendo a fonte oficial.

Quando `profile-evidence upsert` encontra um link de WhatsApp analisado como caminho de contato da bio/Linktree, esse WhatsApp vira o contato primario do lead em `leads.phone_or_contact` e `phone_normalized`. O contato anterior, por exemplo telefone de diretorio, e preservado em `leads.notes` com `Contato anterior preservado: ...`. Essa regra vale apenas quando a evidencia navegada esta consistente: `bio_status: ok`, `bio_link_status: analisado`, `browser_evidence_status: ok` e `instagram_session_status: logged_in`.

Valores aceitos:

- `bio_status`: `ok`, `sem_bio`, `privado`, `bloqueado`, `nao_encontrado`, `erro_tecnico`.
- `bio_link_type`: `whatsapp`, `linktree`, `bio_site`, `site`, `agenda`, `maps`, `outro`, `nenhum`.
- `bio_link_status`: `analisado`, `nao_aplicavel`, `bloqueado`, `pendente`, `erro_tecnico`.
- `evidence_confidence`: `alta`, `media`, `baixa`.
- `browser_evidence_status`: `ok`, `dom_blocked`, `session_blocked`, `login_required`, `challenge`, `profile_private`, `not_found`, `page_loading`, `technical_error`, `not_checked`.
- `browser_evidence_method`: `chrome_operational_profile`, `chrome_personal_apple_events`, `public_indexed`, `manual_review`, `none`.
- `instagram_session_status`: `logged_in`, `logged_out`, `challenge`, `unknown`, `not_checked`.

Lead com Instagram e sem Bio Evidence Pack navegada nao passa limpo para Steve. Antes de uma rodada com Instagram, o Scout deve rodar `node scripts/paperclip-chrome-scout-smoke.mjs --instagram` no perfil operacional `Paperclip Scout`. Para declarar `bio_status: ok`, o registro precisa indicar `browser_evidence_status: ok`, `browser_evidence_method: chrome_operational_profile` e `instagram_session_status: logged_in`. Fonte publica ou snippet pode apoiar o dossie, mas nao substitui evidencia navegada. O Validador deve marcar `reanalisar` quando a bio ou o link da bio eram necessarios e nao foram analisados; pode marcar `apto_com_observacao` quando Google, site, WhatsApp ou outra fonte sustentarem a oportunidade apesar da lacuna.

## SQLite comercial

SQLite comercial e a camada operacional oficial para enxergar o funil que gera caixa. Ela nao substitui `lead-cards`; ela alimenta as superficies certas e impede que cada worker invente sua propria lista.

Views oficiais:

- `commercial_lead_context`: uma linha por lead com status, contato, Bio Evidence Pack, fila atual, QA, ultima interacao e `commercial_stage`.
- `commercial_pending_validation`: leads que ainda precisam de Validador, normalmente por falta de Bio Evidence Pack, `browser_evidence_status` diferente de `ok`, `instagram_session_status` diferente de `logged_in`, link da bio pendente, gancho comercial ausente ou contato fraco.
- `commercial_ready_for_writer`: leads novos aprovados por Steve com `handoff_status='writer_pending'`, evidencia suficiente e sem mensagem pronta.
- `commercial_pending_qa`: mensagens prontas de primeira abordagem aguardando QA.
- `commercial_ready_lead_cards`: mensagens aprovadas e copiaveis para envio manual.
- `commercial_followups_today`: leads abordados, respondidos, interessados ou com demo que exigem proxima acao comercial.
- `commercial_stale_leads`: leads abertos parados ha mais de 7 dias.

Comandos:

```bash
node scripts/freela-crm.mjs commercial status --date YYYY-MM-DD
node scripts/freela-crm.mjs commercial export --date YYYY-MM-DD
node scripts/freela-crm.mjs commercial enrichment-plan --date YYYY-MM-DD --limit 25
node scripts/freela-crm.mjs commercial enrichment-plan --date YYYY-MM-DD-lote-2 --limit 25 --exclude-run-id fre-116-backfill-2026-06-20
node scripts/freela-crm.mjs commercial duplicate-audit --date YYYY-MM-DD
node scripts/freela-crm.mjs handoff record --file .scratch/ops/worker-handoff.json
node scripts/freela-crm.mjs handoff reconcile
```

`workflow.batch_id` identifica o lote consolidado que esta andando entre workers. Para backfill/rodada, use uma chave estavel como `backfill:YYYY-MM-DD:lote-2:final-15`; se `workflow.dedupe_key` nao existir, a CLI deriva o dedupe por `batch_id + target_agent_id`.
`handoff reconcile` consulta as issues Paperclip registradas e fecha no SQLite handoffs cujas issues ja estejam `done` ou `cancelled`.

`commercial status` gera `.scratch/ops/commercial-status.md`. `commercial export` gera `.scratch/crm/commercial-funnel.md` e `.scratch/ops/commercial-status.md`. Esses arquivos sao espelhos privados; a fonte oficial continua sendo as views do SQLite.

Backfill de base existente nao e prospeccao nova. Para reprocessar leads existentes, rode `commercial enrichment-plan` e `commercial duplicate-audit`; os artefatos ficam em `.scratch/crm/enrichment-backfill-YYYY-MM-DD/`. `enrichment-plan` prioriza leads atuais para Scout/Validador enriquecerem Bio Evidence Pack, Instagram, contato e gancho sem mudar status automaticamente. Em lotes seguintes, use `--exclude-run-id` para nao repetir leads ja processados por um backfill anterior. `duplicate-audit` separa `safe_merge_candidate` por identificador forte de `manual_review_only` por nome parecido; nao fazer merge automatico por nome parecido.

## Publicacao no FRE-7

O COO Freelancer e o publicador autorizado do `FRE-7`. QA de Mensagens, Follow-up CRM, Redator e Steve nao escrevem `lead-cards` ou `ops-status` diretamente no console; eles preparam o SQLite e criam handoff para o COO quando a superficie precisa ser publicada ou republicada.

- QA aprovado cria handoff para COO com `workflow.stage = "qa_to_coo_publish_fre7"`.
- Handoffs de publicacao usam `workflow.dedupe_key = "publish_fre7:50a2756c-2942-40c1-90f8-b16807a62ef3:YYYY-MM-DD"`.
- Follow-up CRM nao publica no `FRE-7`; quando alterar fila/status e precisar republicar, cria handoff para COO.

## Escrita por Worker

- Lead Scout: usa `lead upsert --file .scratch/prospeccao-vitoria/YYYY-MM-DD/crm-upsert-leads.json`, antes de Instagram roda `node scripts/paperclip-chrome-scout-smoke.mjs --instagram` no perfil operacional `Paperclip Scout`, depois grava Bio Evidence Pack com `profile-evidence upsert`, roda `queue generate`, `commercial export` e `export all`; entrega `lead-scout-decision-package.md`, `lead-dossiers.md` e `atendimento-handoff.md`. Antes de acionar Validador, registra o JSON com `handoff record` e cria a child issue. Rodada padrao deve pesquisar ao menos 25 candidatos brutos e entregar no minimo 15 leads novos qualificados.
- Validador de Dados de Leads: fica entre Scout e Steve; confere dados minimos, duplicidade, contato, fonte, evidencia da dor e Bio Evidence Pack em `lead_platform_profiles` e `commercial_pending_validation`; nao aceita `bio_status: ok` sem `browser_evidence_status: ok`, `browser_evidence_method: chrome_operational_profile` e `instagram_session_status: logged_in`; entrega `.scratch/prospeccao-vitoria/YYYY-MM-DD/data-quality-report.md` com `data_quality_status` e `confidence_score`.
- Steve - CEO de Prospeccao: faz o gate qualitativo da rodada usando `commercial_ready_for_writer`, `commercial_hook`, `friction_points`, `browser_evidence_status` e evidencias de `lead_platform_profiles`. Scout = volume com qualidade minima; Steve = qualidade, corte e prioridade. Se menos de 15 leads passarem, Steve devolve lacunas para Lead Scout em vez de completar com lead fraco.
- CEO de Prospeccao: le o pacote de decisao, dossies, handoff e espelhos do CRM; se precisar alterar status, pede ao CRM/COO.
- Redator de Primeira Mensagem: usa `commercial_ready_for_writer`, `fila-abordagem.md`, `atendimento-handoff.md`, `ceo-curadoria.md` e o gancho do Bio Evidence Pack; gera `.scratch/crm/mensagens-prontas-YYYY-MM-DD.md`; registra cada primeira abordagem com `queue set-message`; aciona QA de Mensagens antes de liberar `lead-cards`.
- QA de Mensagens: revisa `commercial_pending_qa` antes da UI; entrega `.scratch/crm/message-qa-report.json` como contrato estruturado e `.scratch/crm/message-qa-report.md` como espelho legivel; somente mensagens `aprovado_para_lead_cards` ou `aprovado_com_observacao` podem entrar em `commercial_ready_lead_cards`; depois da aprovacao, cria handoff `qa_to_coo_publish_fre7` para o COO Freelancer publicar no `FRE-7`.
- Intake de Conversas: usa `conversation ingest --file` para normalizar resposta recebida.
- Follow-up CRM: usa `commercial_followups_today`, `commercial_ready_lead_cards`, `lead mark-contacted`, `lead mark-response`, `lead update`, `queue generate`, `queue set-message`, `commercial export`, `export all` e `export paperclip-cards`; nao publica no `FRE-7` diretamente e cria handoff para COO quando a superficie precisar ser republicada.
- Diagnostico 3 Pontos: quando o lead respondeu "pode", gera `.scratch/crm/diagnostico-3-pontos-YYYY-MM-DD.md` com `evidencia_observada` e `fonte_ou_arquivo`; nao escreve resposta final.
- Atendimento e Fechamento: le diagnosticos e handoffs; se gerar mensagem/fila, registra pelo CRM ou CLI com `queue set-message`.
- Demo Brief: antes de Criador Presenca 72h iniciar, Follow-up CRM ou Atendimento gera `.scratch/crm/demo-brief.md` com objetivo da demo, lead, oferta `Presenca Local em 72h`, tom, dados permitidos, dados proibidos, CTA, WhatsApp correto, `nivel: Presenca Local em 72h` e criterios de QA; QA de Demos usa esse brief para `qa-demos-YYYY-MM-DD.md`.
- COO Freelancer: nao edita `.scratch` manualmente; aciona workers ou pede comando estruturado.

## Espelhos Gerados

`node scripts/freela-crm.mjs export all` deve gerar:

- `.scratch/leads/master-leads.csv`
- `.scratch/crm/pipeline.md`
- `.scratch/crm/hoje-enviar.md`
- `.scratch/crm/paperclip-lead-cards.md`
- `.scratch/crm/commercial-funnel.md`
- `.scratch/ops/commercial-status.md`
- `.scratch/crm/demo-brief.md`

Separacao Fila do Dia vs CRM Historico:

- Fila do Dia = `.scratch/crm/hoje-enviar.md` + documento `lead-cards`; superficie `acao_manual_hoje`, deve conter somente itens acionaveis hoje.
- Status executivo = `.scratch/ops/paperclip-operator-status.md` + documento `ops-status`; superficie `status_executivo`, deve conter placar, gargalos e proximo melhor passo. Nao copiar mensagem por este documento.
- CRM Historico = `.scratch/crm/pipeline.md`, `.scratch/crm/historico-atendimento.md` e `.scratch/crm/status-commands-log.md`; deve preservar memoria operacional.
- Nao misturar Fila do Dia com CRM Historico. `lead-cards` deve ser a UI acionavel do dia, nao o historico completo.
- `.scratch/crm/followups-do-dia.md`
- `.scratch/crm/historico-atendimento.md`

Esses arquivos existem para leitura, revisao e handoff. Se houver divergencia entre espelho e SQLite, o SQLite vence.

## Cards no Paperclip

Para evitar que o operador precise abrir arquivos em `.scratch/`, a fila manual tambem deve ser exposta na UI do Paperclip:

- `node scripts/freela-crm.mjs export paperclip-cards` gera `.scratch/crm/paperclip-lead-cards.md` com telefone/contato, Instagram, oferta, comando de status e mensagem em bloco copiavel.
- `node scripts/paperclip-sync-lead-cards.mjs` publica esse markdown como documento `lead-cards` no `FRE-7` usando API HTTP direta do Paperclip, sem wrapper CLI ou cache npm. Ao publicar uma lista nao vazia, o sync faz merge por nome do card: cards novos/atualizados do SQLite entram primeiro e cards ja publicados no `FRE-7` que nao aparecem no export local sao preservados ao final, para nao apagar a fila manual ainda acionavel por causa de uma rodada parcial. Se o export local vier sem nenhum card, o documento remoto tambem fica vazio.
- `node scripts/freela-crm.mjs export operator-status` gera `.scratch/ops/paperclip-operator-status.md` com superficie `status_executivo`, sem telefone nem mensagem copiavel.
- `node scripts/paperclip-sync-operator-status.mjs` publica esse markdown como documento `ops-status` no `FRE-7`.
- `node scripts/paperclip-sync-operational-surfaces.mjs` e o comando padrao depois de mudancas comerciais relevantes: ele publica `lead-cards` e `ops-status` em sequencia, mantendo `acao_manual_hoje` separada de `status_executivo`.
- Primeira abordagem para lead `novo` fica fora de `lead-cards` ate o QA liberar com `node scripts/freela-crm.mjs queue approve-cards --file .scratch/crm/message-qa-report.json`; `.scratch/crm/message-qa-report.md` e apenas espelho legivel. Para ajuste pontual, usar `node scripts/freela-crm.mjs queue approve-card --name [nome] --qa-status aprovado_para_lead_cards` ou `--qa-status aprovado_com_observacao`.
- Depois de buscar, tratar, criar e aprovar mensagem pronta no QA de Mensagens, os agentes devem liberar os cards aprovados com `queue approve-cards` ou `queue approve-card` e criar handoff para o COO Freelancer sincronizar `lead-cards` e `ops-status` com `node scripts/paperclip-sync-operational-surfaces.mjs`; a UI do Paperclip e a superficie principal para o usuario copiar telefone, Instagram e mensagem.
- Quando Atendimento gerar mensagem pronta para envio, deve registrar a mensagem na fila oficial com `node scripts/freela-crm.mjs queue set-message --name [nome] --message [mensagem]`; arquivos `mensagens-prontas-YYYY-MM-DD.md` sao handoff privado, nao a superficie principal para copiar/enviar.

## WhatsApp Local Automation

SQLite e a fonte oficial tambem para automacao WhatsApp. Mensagens recebidas de leads identificados entram em `whatsapp_inbound_events`; respostas candidatas entram em `whatsapp_outbox`; decisoes do Guardiao entram em `whatsapp_guardian_decisions`; estado resumido por lead fica em `lead_conversation_state`.

Identidade WhatsApp:

- A WAHA pode entregar conversa individual como `@lid` em vez de telefone publico. Esse identificador deve ser salvo em `whatsapp_identity_aliases`.
- `@lid` e identidade de leitura/match, nao destinatario direto salvo na Outbox. Quando uma Outbox nasce de inbound `@lid`, a CLI deve usar o telefone real do lead como `target_chat_id` enviavel, por exemplo `5527999990000`; se nao houver telefone real, a proposta deve falhar cedo em vez de tentar enviar para `@lid`.
- O Gateway bloqueia qualquer Outbox legada cujo `target_chat_id` termine em `@lid`, nao chama endpoint de envio e move a conversa para `handoff_luiz` com motivo explicito para vincular telefone real.
- No provider WAHA, o Gateway consulta `check-exists` com telefone real. Se a WAHA devolver `chatId` `@lid`, esse `@lid` resolvido pela propria WAHA pode ser usado em `/api/sendText`; isso nao autoriza salvar `@lid` direto na Outbox.
- Quando o Gateway nao encontra lead confiavel, ele grava o evento em `whatsapp_unmatched_inbound_events` e mostra `Sem identidade: N`.
- Texto normal recebido pela WAHA pode chegar como `type: "chat"`; o Gateway/CRM normalizam para `message_type: "text"`.
- O monitor WAHA grava auditoria privada de cada POST em `.scratch/whatsapp/waha-webhook-events.jsonl`. Se a WAHA mostrar HTTP 200 e o CRM nao refletir a mensagem, esse JSONL e a primeira evidencia a consultar.
- Para reconciliar, use `node scripts/freela-crm.mjs whatsapp identity link --name "Nome do Lead" --identity "999000111222333@lid"` e depois `node scripts/freela-crm.mjs whatsapp unmatched reconcile`.
- Para preservar um inbound comprovadamente sem lead comercial, use `node scripts/freela-crm.mjs whatsapp unmatched mark-no-match --id [id] --reason [motivo]` ou `--chat-id [jid] --reason [motivo]`.
- O webhook/import WAHA com `--auto-wake` cria issue no Paperclip por roteamento seletivo; o dedupe fica em `whatsapp_worker_wakes`. Auto-wake nao envia WhatsApp, nao chama endpoint de envio e nao cria Outbox.
- Atendimento WhatsApp recebe conversa normal: `resposta_permissao`, `resposta_pediu_exemplo`, `resposta_recebida`.
- Jhon Snow / Atendimento e Fechamento recebe fechamento comercial: `resposta_pediu_preco`/`preco_pedido`, `resposta_lead_quente`/`lead_quente`, `resposta_objecao`/`objecao_comercial`, `handoff_luiz`, `qualificacao_preco_pendente` e `bloqueado_guardiao`.
- Depois de uma qualificacao de preco, respostas de baixo sinal do lead como objetivo, permissao ou pedido de exemplo preservam `qualificacao_preco_pendente`/`preco_pedido` e continuam com Jhon Snow. Nao voltar para Atendimento WhatsApp com resposta neutra.
- Em teste ou ambiente alternativo, `--closer-agent-id` sobrescreve o agente closer padrao.
- O Guardiao deve revisar Outbox com `node scripts/freela-crm.mjs whatsapp guardian review --outbox-id [id] --auto-wake true --auto-dispatch true`. Se aprovar e a Outbox estiver despachavel, o CRM chama somente o Gateway com o mesmo `--outbox-id`. Se bloquear, `--auto-wake` cria o proximo trabalho: bloqueio reparavel cria `whatsapp_guardian_repair` para Jhon reparar uma vez e criar nova Outbox; segundo bloqueio reparavel do mesmo inbound cria `whatsapp_guardian_reanalysis` para Scout reanalisar bio, link da bio, cartao virtual/PDF e caminho ate WhatsApp. Esses wakes nao enviam WhatsApp e nao chamam Gateway.

WAHA e a entrada local autorizada. O Gateway Local recebe eventos pelo webhook com `set -a; . ./.env; set +a; node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Developer/freela serve-waha-webhook --host 127.0.0.1 --port 3105 --auto-wake` ou reprocessa um evento salvo com `node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Developer/freela import-waha-event --file .scratch/waha-event.json --auto-wake`. A WAHA local sobe por `docker compose -f docker-compose.waha.yml up -d`, com API em `http://127.0.0.1:3000`, sessao persistida em `.scratch/waha/.sessions`, credenciais fixas vindas do `.env` local privado (`WAHA_API_KEY`, `WAHA_DASHBOARD_PASSWORD`, `WHATSAPP_SWAGGER_PASSWORD`, `WHATSAPP_WAHA_WEBHOOK_SECRET`) e webhook do container para `http://host.docker.internal:3105/waha/webhook` com `X-Webhook-Secret`; isso nao autoriza bind wildcard no Gateway. O Gateway carrega `.env` automaticamente a partir de `--root` e nao sobrescreve variaveis ja existentes.

Nenhum worker comercial envia WhatsApp diretamente. Somente o Gateway Local pode enviar itens `approved` da Outbox. O caminho padrao e o Guardiao revisar com `--auto-dispatch true`, que primeiro confere `Pode despachar: sim` e entao chama `node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Developer/freela dispatch-approved-outbox --provider waha --outbox-id [id]`. O modo sem `--outbox-id` fica reservado para operacao assistida em lote, nao para workers. `delivery_pending` nao e entrega: o CRM so conta como enviado quando `message.ack` forte (`DEVICE`, `READ`, `PLAYED` ou `ack >= 2`) atualizar a Outbox.

## Outbox-first WAHA mode

Quando WAHA estiver saudavel, respostas seguras pos-consentimento deixam de ir para lead-cards por padrao. O caminho alvo e:

1. Atendimento WhatsApp ou Jhon cria nova Outbox com `whatsapp outbox propose`.
2. Guardiao revisa com `whatsapp guardian review --outbox-id [id] --auto-wake true --auto-dispatch true`.
3. Se aprovada e despachavel, o Gateway despacha somente com `dispatch-approved-outbox --provider waha --outbox-id [id]`.
4. Follow-up so considera enviado apos ACK forte: `DEVICE`, `READ`, `PLAYED` ou `ack >= 2`.

Continuam manuais: primeira abordagem fria, preco, desconto, proposta, pagamento, fechamento, objecao sensivel, Guardiao bloqueado, WAHA/Gateway falho, `delivery_pending` prolongado e `dispatch_ambiguous`.

Workers nunca chamam `/api/sendText` diretamente.

Demo ja aprovada pedida no WhatsApp nao volta para lead-cards manual. Se o lead pediu demo/exemplo/link, o link seguro ja foi aprovado por QA e o estado esta em `exemplo_aprovado_para_envio`, o worker deve criar nova Outbox com `node scripts/freela-crm.mjs whatsapp outbox propose --name [nome] --body [mensagem] --source [fonte] --humanizer-pass true --used-last-inbound true --contextual-reply true`, passar pelo Guardiao e despachar somente pelo Gateway com `dispatch-approved-outbox --provider waha --outbox-id [id]`. So cair em manual se o Guardiao bloquear, se WAHA/Gateway falhar ou ficar `dispatch_ambiguous`, ou se a resposta envolver preco/fechamento real.

`Unauthorized` em `check-exists` da WAHA e falha de credencial/transporte do processo de dispatch. Nao e bloqueio de conteudo da mensagem. O Gateway deve registrar `dispatch_ambiguous`/`handoff_luiz`, e a mesma Outbox nao deve ser reutilizada automaticamente. Para novo teste, crie nova Outbox ou faca liberacao explicita auditada.

## Privacidade

Dados privados ficam somente em `.scratch/` e no SQLite privado. Nao mover leads reais, conversas, prints, telefones, diagnosticos internos ou historico de atendimento para `docs/`, `demos/`, `outputs/` ou arquivos publicos.
