# Paperclip local - operacao freelancer

Este setup roda o Paperclip localmente neste Mac como o sistema diario da operacao freelancer, usando o Codex local autenticado via ChatGPT. Nao usa `OPENAI_API_KEY` nem envio automatico de WhatsApp.

## Acesso

- UI local: http://127.0.0.1:3100
- API local: http://127.0.0.1:3100/api
- Empresa: `Freela Presenca Local`
- Company ID: `50a2756c-2942-40c1-90f8-b16807a62ef3`

## Interface

O Paperclip tem uma GUI local em http://127.0.0.1:3100. Ela funciona como painel de operacao com projetos, tarefas/issues, agentes, execucoes e status.

Pelo setup atual, trate isso como um painel operacional por projeto/status, nao como um Kanban classico estilo Trello. Para o fluxo freelancer, a organizacao principal fica em:

- projetos do Paperclip;
- status das issues: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`;
- arquivos de CRM em `.scratch/crm/`;
- fila diaria em `.scratch/crm/hoje-enviar.md`.

Para envio manual, o operador nao deve precisar abrir arquivo local. A superficie `acao_manual_hoje` na UI e o documento `lead-cards` dentro do `FRE-7`, gerado por `scripts/paperclip-sync-lead-cards.mjs`. Ele mostra somente acoes manuais prontas para hoje, com telefone/contato, Instagram, oferta, proximo comando e mensagem pronta em bloco copiavel.

Para status, gargalos e proximo melhor passo, use a superficie `status_executivo`: documento `ops-status` dentro do `FRE-7`, gerado por `scripts/paperclip-sync-operator-status.mjs` a partir de `.scratch/ops/paperclip-operator-status.md`. Nao copiar mensagem por este documento; ele nao deve conter telefone, mensagem pronta, QA report ou handoff completo.

Automacao operacional de alto retorno: depois de qualquer mudanca comercial que possa alterar fila, QA, status ou proximo passo, o comando padrao do COO Freelancer e `node scripts/paperclip-sync-operational-surfaces.mjs`. Ele publica `lead-cards` e `ops-status` em sequencia, mantendo as superficies separadas. Os scripts individuais continuam disponiveis para manutencao pontual.

O `lead-cards` deve ser atualizado automaticamente sempre que a operacao terminar busca, curadoria e criacao de mensagens. O COO Freelancer e o publicador autorizado do `FRE-7`; Follow-up CRM nao publica nem escreve no `FRE-7` diretamente. Depois que QA liberar mensagens ou Follow-up alterar fila/status, o worker responsavel cria handoff para o COO publicar as superficies.

Para primeira abordagem de lead `novo`, `queue set-message` apenas grava a mensagem pronta; ela ainda nao aparece em `lead-cards`. QA de Mensagens deve gerar `.scratch/crm/message-qa-report.json` como contrato estruturado e `.scratch/crm/message-qa-report.md` como espelho legivel, depois liberar os cards aprovados em lote com `node scripts/freela-crm.mjs queue approve-cards --file .scratch/crm/message-qa-report.json`; para ajuste pontual, usar `node scripts/freela-crm.mjs queue approve-card --name [nome] --qa-status aprovado_para_lead_cards` ou `--qa-status aprovado_com_observacao`. Follow-ups, respostas e demos podem aparecer em `lead-cards` quando tiverem mensagem pronta acionavel para hoje.

O sync de `lead-cards` usa a API HTTP direta do Paperclip (`GET/PUT /api/issues/:issueId/documents/:key`), nao wrapper CLI. Antes do `PUT`, ele le o documento atual e faz merge por nome do card: cards novos/atualizados do SQLite entram primeiro e cards ja publicados no `FRE-7` que nao aparecem no export local sao preservados ao final, evitando apagar a fila manual ainda acionavel quando uma rodada nova publica uma janela parcial. Se o export local vier sem nenhum card, o documento remoto tambem fica vazio. Em worker real, use as variaveis injetadas pelo Paperclip: `PAPERCLIP_API_URL`, `PAPERCLIP_API_KEY` e `PAPERCLIP_RUN_ID`. Em execucao manual, o padrao local e `http://127.0.0.1:3100`.

Separacao Fila do Dia vs CRM Historico:

- Fila do Dia = `.scratch/crm/hoje-enviar.md` + documento `lead-cards`; e a superficie acionavel para o que o usuario deve enviar hoje.
- Status executivo = `.scratch/ops/paperclip-operator-status.md` + documento `ops-status`; e a superficie de placar, gargalos e proximo melhor passo.
- CRM Historico = `.scratch/crm/pipeline.md`, `.scratch/crm/historico-atendimento.md` e `.scratch/crm/status-commands-log.md`; e memoria operacional.
- Nao misturar Fila do Dia com CRM Historico. `lead-cards` deve mostrar somente hoje, nao o historico completo.

## Consistencia de dados

- Contrato oficial: `docs/freelancer/data-contract.md`.
- Fonte de verdade local: SQLite em `.scratch/db/freela.sqlite`.
- CLI obrigatoria de escrita: `node scripts/freela-crm.mjs`.
- Espelhos como `.scratch/leads/master-leads.csv` e `.scratch/crm/pipeline.md` sao gerados pela CLI.
- Workers nao devem editar arquivos em `.scratch` manualmente como fonte oficial de estado.
- Issues do Paperclip coordenam trabalho; elas nao substituem o SQLite como memoria operacional.

## SQLite comercial

O SQLite comercial e a camada oficial para consultar o funil que gera caixa. Workers devem ler as views antes de decidir proximo dono:

- `commercial_pending_validation`: lacunas para Validador/Scout.
- `commercial_ready_for_writer`: leads aprovados por Steve com `handoff_status='writer_pending'`, prontos para Redator.
- `commercial_pending_qa`: mensagens prontas aguardando QA.
- `commercial_ready_lead_cards`: mensagens aprovadas para `lead-cards`.
- `commercial_followups_today`: follow-ups e respostas que precisam de proxima acao.
- `commercial_stale_leads`: leads abertos parados.

Comandos padrao:

```bash
node scripts/freela-crm.mjs commercial status --date YYYY-MM-DD
node scripts/freela-crm.mjs commercial export --date YYYY-MM-DD
```

`commercial export` gera `.scratch/crm/commercial-funnel.md` e `.scratch/ops/commercial-status.md`. Esses arquivos sao espelhos privados; a fonte oficial continua sendo as views do SQLite em `.scratch/db/freela.sqlite`.

## Handoff e auto-delegacao

O contrato unico para passagem de trabalho entre workers esta em `docs/freelancer/paperclip/worker-handoff-protocol.md`. O schema fica em `docs/freelancer/paperclip/worker-handoff.schema.json` e o script operacional e `scripts/paperclip-create-handoff-issue.mjs`.

Quando um worker precisa acionar outro, ele deve criar um JSON de handoff com `target_agent_id`, `source_issue`, `workflow`, `artifacts` e `acceptance_criteria`, depois rodar:

```bash
node scripts/freela-crm.mjs handoff record --file [arquivo]
node scripts/paperclip-create-handoff-issue.mjs --handoff-file [arquivo]
```

Nao copiar e colar contexto manualmente entre workers. `handoff record` grava o contrato em `worker_handoffs` com status `pending_issue`; depois o script cria child issue com `parentId`. Quando `block_source_issue` estiver ativo, a issue de origem deve usar `blockedByIssueIds` para acordar automaticamente quando o worker alvo terminar. Se a child issue ja existir, rode novamente `handoff record` com `--status issue_created --paperclip-issue-id [id] --paperclip-issue-identifier [FRE-N]`. Handoffs de uma mesma rodada/backfill devem preencher `workflow.batch_id`; sem `workflow.dedupe_key`, a CLI usa `batch_id + target_agent_id` para evitar duplicidade de issue do mesmo worker. Handoffs que nao podem duplicar issues, como publicacao no `FRE-7`, devem preencher `workflow.dedupe_key`, por exemplo `publish_fre7:50a2756c-2942-40c1-90f8-b16807a62ef3:YYYY-MM-DD`.

Depois de uma rodada ou backfill, rode `node scripts/freela-crm.mjs handoff reconcile` para fechar no SQLite os handoffs cujas issues Paperclip ja estejam `done` ou `cancelled`.

Esse script usa API direta do Paperclip, nao `npx`/`paperclipai`, para nao depender de cache npm durante heartbeats. Em worker real, use as variaveis injetadas pelo Paperclip; em execucao manual, passe `--company-id` e credenciais quando necessario.

## Regras de seguranca

- O Paperclip pode pesquisar, organizar informacoes e criar arquivos locais.
- O Paperclip nao envia mensagem para cliente.
- WhatsApp continua manual.
- Dados privados de leads ficam em `.scratch/`, nao em `docs/`, `demos/` ou `outputs/`.
- Leads com demo existente em `demos/` nao devem ser pesquisados nem incluidos em novas listas.
- Navegador assistido segue `docs/freelancer/paperclip/browser-automation.md`.
- Para analise de leads, o Scout deve usar o perfil operacional `Paperclip Scout` no Chrome local. Antes de Instagram/Linktree/bio.site/agenda/site logado, deve rodar `node scripts/paperclip-chrome-scout-smoke.mjs --instagram`; se o smoke nao retornar `ready`, a rodada com Instagram nao inicia. O perfil operacional `Paperclip Scout` pode reutilizar a janela existente do proprio perfil e abrir/mirar aba de trabalho; nao deve mexer no Chrome pessoal/perfil pessoal diario. O Bio Evidence Pack deve registrar `browser_evidence_status`, `browser_evidence_method: chrome_operational_profile` e `instagram_session_status`. O preflight generico `node scripts/paperclip-open-chrome-window.mjs --preflight` continua valido para diagnostico de abertura do Chrome.
- Nao usar Playwright WebKit (`org.webkit.Playwright`), Playwright Firefox/Nightly (`org.mozilla.nightly`) nem in-app browser para pesquisa, prospeccao ou QA visual. Se a UI mostrar `Playwright quit unexpectedly`, `Playwright cannot be opened because of a problem` ou `firefox quit unexpectedly`, clicar `Ignore`, registrar bloqueio e seguir com Chrome pessoal, `curl`, parser HTML ou validacao estatica.

## Deploy automatico

Agentes podem acionar deploy automatico quando a tarefa exigir publicacao de site, demo ou correcao publica. O caminho correto e:

1. garantir QA quando for demo, exemplo ou pagina de cliente;
2. commitar e fazer push para `main`, ou pedir esse push quando a autorizacao humana for necessaria;
3. acompanhar `Actions > Deploy cPanel` no GitHub Actions;
4. verificar a URL publicada antes de liberar o link para envio ao cliente.

Nao usar cPanel manual, nao usar FTP e nao fazer SSH manual para publicar arquivos. O deploy operacional passa por `.github/workflows/deploy-cpanel.yml` e `.cpanel.yml`; veja `docs/deploy-cpanel.md`.

## Agentes

| Agente | ID | Projeto | Uso |
| --- | --- | --- | --- |
| COO Freelancer | `75be697f-26c9-4d4d-a40e-a9ad675dcba7` | Atendimento e Fechamento | ponto unico de entrada operacional; orquestra workers, prioriza proximas acoes e mantem o funil em movimento |
| Scout - Lead Searcher GV | `d846f1b7-f6ae-4005-9ef4-53a32b13635e` | Prospeccao | Volume qualificado: buscar candidatos, deduplicar e entregar no minimo 15 leads novos qualificados por rodada padrao |
| Validador de Dados de Leads | `341f8c00-401a-44a6-aced-7773e16278ef` | Prospeccao | Confere dados minimos, duplicidade, contato, fonte e evidencia da dor antes de Steve gastar curadoria |
| Steve - CEO de Prospecção | `d42e7e0c-e23f-4c41-a703-2e65d26ddc1d` | Prospeccao | Qualidade: fazer gate qualitativo, cortar fracos, priorizar e liberar fila de abordagem |
| Redator de Primeira Mensagem | `f14e47e4-82d2-4236-87ce-1475aa28e1b5` | Atendimento e Fechamento | Escrever primeira abordagem em lote, registrar mensagens no CRM e acionar QA de Mensagens |
| QA de Mensagens | `7753b5f4-5e01-4271-986b-9dd11716e57c` | Atendimento e Fechamento | Revisar primeira abordagem, gerar `message-qa-report.json` e `message-qa-report.md`, e liberar `lead-cards` apenas quando aprovado |
| Intake de Conversas | `270b3c10-d196-4396-b0f3-38532189fab7` | Atendimento e Fechamento | normalizar prints ou textos de conversas, identificar o lead e entregar comando estruturado para o CRM |
| Diagnóstico 3 Pontos | `53f856fd-5c17-45cc-bb5d-e45efed92bfb` | Atendimento e Fechamento | Gerar 3 pontos reais com evidencias quando o lead permite receber sugestoes |
| Atendimento e Fechamento | `4d334072-4966-4c9d-a16a-f3e48faf05d9` | Atendimento e Fechamento | Sugerir respostas e qualificar oferta |
| Atendimento WhatsApp | `a criar` | Atendimento e Fechamento | Escrever respostas candidatas curtas e contextuais para a Outbox WhatsApp, sem enviar direto |
| Guardiao de Envio WhatsApp | `a criar` | Atendimento e Fechamento | Validar Outbox WhatsApp e bloquear preco, proposta, risco ou oferta removida antes de qualquer saida |
| Follow-up CRM | `27b8359c-0059-4952-8da1-71f775d7530a` | Atendimento e Fechamento | Controlar pipeline, follow-ups e fila de envio manual |
| QA de Demos/Exemplos | `deb3a93b-c868-4b98-83bc-62df734b30e9` | Atendimento e Fechamento | revisar exemplos antes do envio, checando escopo, dados inventados, links, mobile/desktop e arquivos públicos |
| Criador Presenca 72h | `b69b7667-0e3d-4b07-b1ad-e0c788224300` | Presenca Local em 72h | Criar demos one-page com `nivel: Presenca Local em 72h` |
| Ops de Entrega | `55d286d6-55ce-4942-b9d5-2e1f3e0c89f2` | Entregas | Checklist, entrega e pos-venda |

Todos usam:

- Adapter: `codex_local`
- Modelo: `gpt-5.5`
- Reasoning effort: `xhigh`
- `CODEX_HOME=/Users/luiz_fbm/.codex`
- Sandbox do Codex: `workspace-write` por padrao.
- Excecao de navegador assistido: COO Freelancer e Scout - Lead Searcher GV usam `danger-full-access`, porque `workspace-write` quebra LaunchServices/Spotlight no macOS e impede `node scripts/paperclip-open-chrome-window.mjs --preflight` de abrir Chrome pessoal. Essa excecao nao autoriza envio automatico nem acao social; continua valendo `dangerouslyBypassApprovalsAndSandbox=false`, `approval_policy="never"` e as regras de somente leitura de `docs/freelancer/paperclip/browser-automation.md`.
- Raiz de trabalho explicita: `-C /Users/luiz_fbm/Documents/programacao/freela`
- Raiz gravavel explicita: `--add-dir /Users/luiz_fbm/Documents/programacao/freela`
- Approval policy: `never`
- Network no sandbox: `sandbox_workspace_write.network_access=true`
- Sem bypass perigoso de sandbox: `dangerouslyBypassApprovalsAndSandbox=false`

### Sincronizacao segura de agentes

As configs em `docs/freelancer/paperclip/agent-*.json` sao o espelho versionado dos agentes. Para comparar esse espelho com o Paperclip vivo, rode primeiro:

```bash
node scripts/paperclip-sync-agents.mjs --dry-run
```

O `--dry-run` e o modo padrao. Ele consulta `GET /api/companies/:companyId/agents`, calcula diferencas e grava relatorio auditavel em `.scratch/ops/`, sem fazer `PATCH`.

Para aplicar depois de revisar o diff:

```bash
node scripts/paperclip-sync-agents.mjs --apply
```

O sync usa uma allowlist curta: `name`, `role`, `title`, `icon`, `reportsTo`, `capabilities` e `metadata`. `adapterConfig.instructionsFilePath` nao passa pelo patch generico; ele usa a rota dedicada `PATCH /api/agents/:id/instructions-path`. O script nao sincroniza modelo, env, comando, sandbox, budget, permissoes, runtime, skills ou bundle de instrucoes.

## Projetos

| Projeto | ID |
| --- | --- |
| Prospeccao | `4be33cbc-89b5-4678-9054-e073b3392936` |
| Atendimento e Fechamento | `9082cb60-ff80-47de-a502-555c876a52a6` |
| Presenca Local em 72h | `2b4b0708-5750-466e-bc3f-684027f7ed8c` |
| Entregas | `d8e8a76a-f8ce-4098-a86b-cce1847593f3` |

## Rotina automatica

Rotina criada:

- Nome: `Rotina diaria - leads dono-operador na Grande Vitoria`
- Routine ID: `280c6c06-7823-453e-9f0c-1ebf0fb794dd`
- Trigger ID: `e24f6afc-2c83-4942-b23a-8e047071f97c`
- Agenda: dias uteis as 09:30
- Cron: `30 9 * * 1-5`
- Timezone: `America/Sao_Paulo`
- Proximo disparo registrado: `2026-06-18T12:30:00.000Z`

A rotina deve gerar trabalho revisavel. Ela nao aborda leads.

Divisao de responsabilidade:

- Scout = volume: pesquisar ao menos 25 candidatos brutos e entregar no minimo 15 leads novos qualificados no CRM por rodada padrao.
- Validador de Dados = qualidade de dados: conferir dados minimos, duplicidade, fonte, contato, Bio Evidence Pack em `lead_platform_profiles`, evidencia da dor e gerar `data-quality-report.md`.
- Steve = qualidade: revisar a rodada, cortar fracos e aprovar no minimo 15 leads para abordagem quando houver qualidade suficiente.
- Se Steve aprovar menos de 15 leads, ele nao completa com lead fraco; devolve lacunas para Scout buscar mais ou reanalisar.

Saida esperada do Lead Scout:

- CRM alimentado via `node scripts/freela-crm.mjs lead upsert --file .scratch/prospeccao-vitoria/YYYY-MM-DD/crm-upsert-leads.json`;
- Bio Evidence Pack gravado via `node scripts/freela-crm.mjs profile-evidence upsert --file .scratch/prospeccao-vitoria/YYYY-MM-DD/profile-evidence.json`; se precisar revisar, `node scripts/freela-crm.mjs profile-evidence export --date YYYY-MM-DD` gera espelho privado sob demanda.
- fila operacional atualizada via `node scripts/freela-crm.mjs queue generate`;
- SQLite comercial atualizado via `node scripts/freela-crm.mjs commercial export --date YYYY-MM-DD`;
- espelhos atualizados via `node scripts/freela-crm.mjs export all`;
- `lead-scout-decision-package.md` com pacote de decisao, ranking, riscos e proximas acoes;
- `lead-dossiers.md` com analise profunda dos leads Hot/Warm;
- `atendimento-handoff.md` com evidencias, mensagem inicial rascunhada e 3 pontos reais para o atendimento;
- `crm-upsert-leads.json` como arquivo de entrada da CLI;
- planilha apenas como espelho/exportacao opcional para leitura humana;
- resumo dos melhores alvos.
- minimo de 15 leads novos qualificados por rodada padrao; nao parar em 5 salvo bloqueio explicito registrado.

Lead Scout nao entrega uma planilha como produto principal. Lead Scout alimenta o CRM e entrega um pacote de decisao. Planilha e apenas espelho/exportacao opcional.

Lead frio nao vira issue individual por padrao. Ele entra na rodada. So vira issue individual quando responde, pede exemplo, pergunta preco ou quando o usuario pedir.

Contrato de demo brief:

- Antes de qualquer Criador Presenca 72h iniciar, Follow-up CRM ou Atendimento deve gerar `.scratch/crm/demo-brief.md`.
- `demo-brief.md` deve conter objetivo da demo, lead, oferta `Presenca Local em 72h`, tom, dados permitidos, dados proibidos, CTA, WhatsApp correto, `nivel: Presenca Local em 72h` e criterios de QA.
- Criadores nao iniciam sem esse brief.
- QA de Demos usa `demo-brief.md` como base de `qa-demos-YYYY-MM-DD.md`.

Pesquisa em Instagram/redes sociais pode ser assistida com navegador logado seguindo `docs/freelancer/paperclip/browser-automation.md`. Para o Scout, o navegador obrigatorio e o perfil operacional `Paperclip Scout`; antes de depender de Instagram/Linktree, o agente deve rodar `node scripts/paperclip-chrome-scout-smoke.mjs --instagram` e bloquear a rodada se `ready=false`. O registro navegavel no SQLite precisa trazer `browser_evidence_status: ok`, `browser_evidence_method: chrome_operational_profile` e `instagram_session_status: logged_in`; fonte publica/snippet e apenas apoio. Nao usar Playwright WebKit (`org.webkit.Playwright`), Playwright Firefox/Nightly (`org.mozilla.nightly`) nem in-app browser; se houver crash, seguir com Chrome operacional, `curl`, parser HTML ou validacao estatica como evidencia incompleta. Mesmo com navegador, o agente nao deve enviar mensagem, curtir, seguir, comentar, automatizar coleta em massa ou salvar dados privados fora de `.scratch/`.

Backfill de enriquecimento da base existente:

- Backfill de leads existentes nao e prospeccao nova e nao deve criar lote frio novo.
- Antes de pedir ao Scout para reprocessar leads atuais, rode `node scripts/freela-crm.mjs commercial enrichment-plan --date YYYY-MM-DD --limit 25`.
- Para lote 2 ou posteriores, use `--exclude-run-id RUN_ID_ANTERIOR` para nao selecionar novamente leads ja processados.
- Para diminuir duplicidade, rode `node scripts/freela-crm.mjs commercial duplicate-audit --date YYYY-MM-DD`.
- Os artefatos ficam em `.scratch/crm/enrichment-backfill-YYYY-MM-DD/` com `enrichment-plan.json`, `enrichment-plan.md`, `duplicate-audit.json` e `duplicate-audit.md`.
- O Scout usa o plano para enriquecer Bio Evidence Pack, Instagram, link da bio, WhatsApp real e gancho comercial de leads existentes.
- O Validador usa a auditoria para separar `safe_merge_candidate` de `manual_review_only`; nao fazer merge automatico por nome parecido.

Fluxo automatizado depois da prospeccao:

0. COO Freelancer acompanha o estado geral e decide o proximo melhor passo.
1. Scout alimenta o CRM e entrega pacote de decisao, dossies e handoff com pelo menos 15 leads novos qualificados.
2. Scout registra o handoff com `node scripts/freela-crm.mjs handoff record --file [arquivo]` e cria uma issue para Validador de Dados de Leads.
3. Validador gera `data-quality-report.md`; se houver menos de 15 leads aptos, devolve lacunas para Scout.
4. Validador usa `commercial_pending_validation` e cria issue para Steve - CEO de Prospecção quando os dados estiverem aptos.
5. Steve le `commercial_ready_for_writer`, `lead-scout-decision-package.md`, `lead-dossiers.md`, `atendimento-handoff.md`, `data-quality-report.md` e espelhos do CRM, depois gera `ceo-curadoria.md` e `fila-abordagem.md`.
6. Steve registra handoff em `worker_handoffs` e cria somente issue para Redator de Primeira Mensagem preparar as mensagens finais de primeira abordagem; Steve nao aciona Follow-up CRM em paralelo no gate inicial.
7. Redator salva `.scratch/crm/mensagens-prontas-YYYY-MM-DD.md` e registra cada mensagem com `queue set-message`.
8. Redator aciona QA de Mensagens antes de liberar a fila para o usuario; a fila entra em `commercial_pending_qa`.
9. Atendimento ou Follow-up CRM grava ajustes aprovados na fila oficial com `node scripts/freela-crm.mjs queue set-message --name [lead] --message [mensagem]`.
10. QA de Mensagens gera `.scratch/crm/message-qa-report.json` e `.scratch/crm/message-qa-report.md`; apenas mensagens `aprovado_para_lead_cards` ou `aprovado_com_observacao` entram em `commercial_ready_lead_cards` e podem ir para `lead-cards`.
11. QA de Mensagens cria handoff `qa_to_coo_publish_fre7` para o COO Freelancer publicar as superficies operacionais no `FRE-7`, com `workflow.dedupe_key` no formato `publish_fre7:50a2756c-2942-40c1-90f8-b16807a62ef3:YYYY-MM-DD`.
12. Follow-up CRM nao atua sobre `commercial_pending_qa`; enquanto houver mensagens aguardando QA, ele deve aguardar QA de Mensagens. Depois que `commercial_ready_lead_cards` existir e/ou houver resposta, comando do usuario ou follow-up vencido, Follow-up CRM volta a atuar no CRM comercial.
13. Use os scripts individuais apenas quando precisar republicar uma superficie especifica sem mexer na outra.
14. Follow-up CRM acompanha o que esta aguardando envio manual, follow-ups vencidos e respostas que precisam de proxima acao.
15. Quando o lead respondeu "pode", Follow-up CRM aciona Diagnóstico 3 Pontos para gerar `.scratch/crm/diagnostico-3-pontos-YYYY-MM-DD.md`.
16. Atendimento e Fechamento usa o Diagnostico 3 Pontos para escrever a resposta comercial, contornar objeção, falar preco ou fechar.
17. COO Freelancer consolida gargalos, acoes manuais e proximas decisoes.

## Rotina de CRM

Rotina criada:

- Nome: `Rotina diaria - follow-up CRM`
- Routine ID: `a5ecff28-f4c1-4e7e-a13f-48059b6cc44f`
- Trigger ID: `c3aaec54-f8a1-48eb-81aa-c798f80b6b1d`
- Agenda: dias uteis as 09:45
- Cron: `45 9 * * 1-5`
- Timezone: `America/Sao_Paulo`

A rotina nao envia mensagens. Ela gera fila revisavel em `.scratch/crm/followups-do-dia.md`.

Issue fixa de comandos:

- Nome: `Console CRM - comandos de status`
- Issue: `FRE-6`
- Issue ID: `7dc1d5b5-9a0d-4da3-b59e-314958ec4c3b`
- Uso: comentar comandos curtos como `status`, `enviado [nome]` ou `respondeu [nome]: [mensagem]`.
- Postura esperada: manter em `backlog` como console permanente estacionado. Comentarios do usuario ainda podem acordar o assignee para triagem.

Issue fixa do COO:

- Nome: `Console COO - operação freelancer`
- Issue: `FRE-7`
- Issue ID: `3e174d9b-0858-4b4e-9a83-a3bcb7543bdd`
- Uso: comentar comandos naturais como `status de hoje`, `o que eu tenho que enviar agora?`, `rode nova prospecção`, `essa cliente pediu exemplo`, `o que está travado?` ou `qual o próximo melhor passo?`.
- Postura esperada: manter em `backlog` como console permanente estacionado. Comentarios do usuario acordam o COO para orquestrar workers e devolver proximas acoes.

Saidas principais:

- `.scratch/crm/hoje-enviar.md`: fila diaria com mensagens prontas para envio manual.
- `.scratch/crm/paperclip-lead-cards.md`: espelho privado usado para publicar o documento `lead-cards` no `FRE-7`.
- `.scratch/ops/paperclip-operator-status.md`: espelho privado usado para publicar o documento `ops-status` no `FRE-7`; superficie `status_executivo`, nao contem mensagem copiavel.
- `.scratch/crm/followups-do-dia.md`: follow-ups vencidos e proximas acoes.
- `.scratch/crm/followup_inteligente-YYYY-MM-DD.md`: follow-up escolhido por etapa do lead.
- `.scratch/crm/triagem-respostas-YYYY-MM-DD.md`: classificacao de respostas recebidas e proximo dono.
- `.scratch/crm/pedido-exemplo-handoff-YYYY-MM-DD.md`: handoff privado quando um lead pede exemplo.
- `.scratch/crm/resumo-executivo-YYYY-MM-DD.md`: placar diario com acoes do usuario e dos workers.
- `.scratch/crm/status-commands-log.md`: historico dos comandos simples aplicados.
- `.scratch/qa-demos/qa-request-YYYY-MM-DD.md`: pedido privado de revisao de demo.
- `.scratch/qa-demos/qa-demos-YYYY-MM-DD.md`: resultado do QA antes do envio do link.
- `.scratch/ops/coo-status-YYYY-MM-DD.md`: visao operacional do dia.
- `.scratch/ops/coo-decisions-YYYY-MM-DD.md`: decisoes e roteamentos do COO.
- `.scratch/ops/orchestration-log.md`: historico de orquestracao.

Comandos simples:

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

Referencia completa: `docs/freelancer/paperclip/status-commands.md`.

## Automacoes comerciais

Fluxos implementados:

- Triagem automatica de respostas: classifica permissao, pedido de exemplo, pedido de preco, objecao, sem interesse, qualificacao, fechamento ou resposta ambigua.
- COO operacional: ponto unico de entrada no Paperclip para decidir proximas acoes, criar issues para workers e manter foco em fechamento sem executar trabalho dos especialistas.
- Intake de conversas: normaliza prints ou textos recebidos, preserva a resposta bruta, identifica o lead e comenta no `FRE-6` com comando estruturado para o CRM.
- 3 pontos reais: Atendimento usa `lead-dossiers.md`, `atendimento-handoff.md` e historico para gerar `diagnostico-3-pontos-YYYY-MM-DD.md` com evidencias.
- Pedido de exemplo: CRM cria `pedido-exemplo-handoff-YYYY-MM-DD.md`, define `nivel: Presenca Local em 72h` e aciona Criador Presenca 72h.
- QA de demos: criadores geram `qa-request-YYYY-MM-DD.md`; QA revisa escopo, dados inventados, links quebrados, desktop/mobile, README.md publico, ausencia de `copy-whatsapp.md` e ausencia de atualizacao indevida de galeria; resultado em `qa-demos-YYYY-MM-DD.md`.
- Follow-up inteligente: CRM escolhe follow-up conforme status atual, sem repetir a mesma mensagem.
- Resumo diario executivo: CRM gera placar de acoes manuais, workers acionados, riscos e proximo melhor passo.
- Master de leads: Lead Scout grava no SQLite via `node scripts/freela-crm.mjs lead upsert --file .scratch/prospeccao-vitoria/YYYY-MM-DD/crm-upsert-leads.json`, roda `node scripts/freela-crm.mjs queue generate` e `node scripts/freela-crm.mjs export all`; `.scratch/leads/master-leads.csv` e eventual planilha sao espelhos.
- Cards de envio na UI: `node scripts/freela-crm.mjs export paperclip-cards` gera `.scratch/crm/paperclip-lead-cards.md`; `node scripts/paperclip-sync-lead-cards.mjs` publica esse conteudo como documento `lead-cards` no `FRE-7` via API direta, sem depender de cache npm.
- Superficies operacionais na UI: `node scripts/paperclip-sync-operational-surfaces.mjs` publica `lead-cards` e `ops-status` juntos depois de mudancas de CRM, QA ou fila, sem envio automatico de WhatsApp.

## WhatsApp Local Automation

O setup local do `lharries/whatsapp-mcp` esta em `docs/freelancer/paperclip/whatsapp-mcp-local.md`. Ele deve ficar em `.scratch/whatsapp-mcp`, parear por QR e ser lido pelo Gateway Local via `store/messages.db`.

Modo alvo: automacao controlada depois do "Pode!". O Gateway importa inbound, workers escrevem resposta candidata, Humanizer limpa o texto, Guardiao aprova, e somente `scripts/whatsapp-local-gateway.mjs dispatch-approved-outbox` chama o bridge `/api/send`.

Workers nao acessam `send_message`, `send_file` ou `send_audio_message`. Eles leem somente CRM/Paperclip; o Gateway importa inbound com `node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Documents/programacao/freela import-mcp-sqlite`.

Notificador Luiz cria issue no Paperclip quando a conversa chega em `preco_pedido`, `lead_quente`, `handoff_luiz` ou `bloqueado_guardiao`. Ele nao envia WhatsApp; apenas entrega contexto e proxima acao para o operador.

## Comandos uteis

Checar saude:

```bash
npx paperclipai health --json
```

Listar rotinas:

```bash
npx paperclipai routine list --json
```

Listar agentes:

```bash
npx paperclipai agent list -C 50a2756c-2942-40c1-90f8-b16807a62ef3 --json
```

Rodar um heartbeat manual de um agente:

```bash
npx paperclipai heartbeat run --agent-id AGENT_ID --source on_demand --trigger manual --timeout-ms 600000
```

Criar issue manual:

```bash
npx paperclipai issue create -C 50a2756c-2942-40c1-90f8-b16807a62ef3 --title "Titulo" --description "Descricao" --assignee-agent-id AGENT_ID --project-id PROJECT_ID --priority medium --json
```

Sincronizar superficies operacionais na UI:

```bash
node scripts/paperclip-sync-operational-surfaces.mjs
```

Sincronizar apenas cards de leads na UI:

```bash
node scripts/paperclip-sync-lead-cards.mjs
```

Flags uteis para execucao fora do heartbeat:

```bash
node scripts/paperclip-sync-operational-surfaces.mjs --api-base http://127.0.0.1:3100 --timeout-ms 15000
node scripts/paperclip-sync-operational-surfaces.mjs --lead-key lead-cards --status-key ops-status
node scripts/paperclip-sync-lead-cards.mjs --api-base http://127.0.0.1:3100 --timeout-ms 15000
```

## Start e stop

Servico local do macOS:

- Label: `com.luiz-fbm.paperclip-freela`
- Plist: `/Users/luiz_fbm/Library/LaunchAgents/com.luiz-fbm.paperclip-freela.plist`

Start/reload:

```bash
launchctl bootstrap gui/$(id -u) /Users/luiz_fbm/Library/LaunchAgents/com.luiz-fbm.paperclip-freela.plist
```

Stop:

```bash
launchctl bootout gui/$(id -u) /Users/luiz_fbm/Library/LaunchAgents/com.luiz-fbm.paperclip-freela.plist
```

Status:

```bash
launchctl print gui/$(id -u)/com.luiz-fbm.paperclip-freela
```

Ver log:

```bash
tail -f /Users/luiz_fbm/.paperclip/instances/default/paperclip-launchd.out.log
tail -f /Users/luiz_fbm/.paperclip/instances/default/paperclip-launchd.err.log
```

## Verificacoes feitas

- `codex login status`: autenticado via ChatGPT.
- `codex exec`: respondeu sem API key.
- `gpt-5.5` com `model_reasoning_effort="xhigh"`: respondeu no Codex local.
- `paperclipai adapter test-environment codex_local`: passou.
- Heartbeat manual `35dddce1-4b6a-44e7-9ad0-8744756f7970`: Paperclip executou `codex_local` com sucesso.
