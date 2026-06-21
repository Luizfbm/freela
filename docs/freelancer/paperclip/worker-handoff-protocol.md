# Protocolo de Handoff entre Workers

Este protocolo remove o usuario do papel de copiar e colar contexto entre workers. Quando um worker precisa acionar outro, ele deve gerar um handoff estruturado, registrar o contrato no SQLite comercial com `node scripts/freela-crm.mjs handoff record --file [arquivo]` e criar a proxima issue com `node scripts/paperclip-create-handoff-issue.mjs`.

Referencia:

- Protocolo: `docs/freelancer/paperclip/worker-handoff-protocol.md`
- Schema: `docs/freelancer/paperclip/worker-handoff.schema.json`
- Script: `scripts/paperclip-create-handoff-issue.mjs`
- Tabela oficial: `worker_handoffs` no SQLite comercial.

## Regra Operacional

- Nao copiar e colar handoff manualmente entre issues quando o proximo dono for outro worker.
- Use child issue com `parentId` para manter a cadeia de trabalho visivel.
- Use `blockedByIssueIds` quando a issue de origem nao puder continuar ate o worker acionado terminar.
- A issue criada deve ter dono claro em `target_agent_id` e `target_agent_name`.
- Antes de criar a issue, registre o JSON em `worker_handoffs` com status `pending_issue`.
- Depois que a child issue existir, atualize `worker_handoffs` para `issue_created` com `paperclip_issue_id` e, se existir, `paperclip_issue_identifier`.
- Use `workflow.batch_id` para identificar o lote operacional consolidado. Quando `workflow.dedupe_key` nao vier preenchido, a CLI deriva uma chave por `batch_id + target_agent_id`, evitando que pai e reposicao criem duas issues para o mesmo worker.
- Use `workflow.dedupe_key` quando uma delegacao precisa de uma chave ainda mais especifica. Para publicacao no `FRE-7`, use `publish_fre7:50a2756c-2942-40c1-90f8-b16807a62ef3:YYYY-MM-DD`.
- O handoff deve apontar artefatos privados em `.scratch/`, documentos da issue ou arquivos publicos permitidos. Nao mova dados privados para `docs/`, `demos/` ou `outputs/`.
- WhatsApp continua manual. Nenhum handoff pode pedir envio automatico.

## Campos Obrigatorios

Todo handoff deve conter:

- `handoff_version`: sempre `1`;
- `source_agent_id`: agente que esta delegando;
- `source_issue`: objeto com `id`, `identifier` e, quando possivel, `title`;
- `target_agent_id`: agente que deve assumir o proximo trabalho;
- `target_agent_name`: nome legivel do agente alvo;
- `title`: titulo da child issue;
- `required_action`: acao objetiva que o alvo deve executar;
- `workflow`: contrato de maquina com `run_id`, `round_date`, `stage`, `expected_count` e `next_owner`;
- `workflow.batch_id`: opcional, mas recomendado para backfill, rodada ou lote final; handoffs com o mesmo `batch_id` e o mesmo worker alvo reutilizam a issue ativa quando nao houver `dedupe_key` explicita;
- `workflow.dedupe_key`: opcional; chave estavel para reusar issue ativa em vez de duplicar handoff;
- `artifacts`: arquivos/documentos que o alvo deve ler;
- `acceptance_criteria`: criterios de aceite que permitem fechar a child issue.

Campos opcionais:

- `project_id`;
- `goal_id`;
- `context`;
- `blocked_by_issue_ids`;
- `block_source_issue`;
- `priority`;
- `status`;
- `comment`.

## Padrao de Bloqueio

Use `block_source_issue: true` quando a issue atual depende diretamente do resultado do worker alvo.

Exemplos:

- QA de Mensagens rejeitou uma mensagem: bloquear a issue de QA pela issue do Redator.
- QA de Demos rejeitou uma demo: bloquear a issue de QA pela issue do Criador.
- Validador encontrou menos de 15 leads aptos: bloquear a rodada pela issue do Scout.
- Deploy falhou: bloquear entrega pela issue de Ops/Engenharia.

Quando a child issue termina, Paperclip pode acordar automaticamente a issue bloqueada via `blockedByIssueIds`. Isso e o caminho correto para auto-delegacao entre workers.

## Comando

Registrar no SQLite comercial:

```bash
node scripts/freela-crm.mjs handoff record --file .scratch/ops/worker-handoff-exemplo.json
```

Dry-run antes de delegar:

```bash
node scripts/paperclip-create-handoff-issue.mjs --handoff-file .scratch/ops/worker-handoff-exemplo.json --dry-run
```

Criar a child issue:

```bash
node scripts/paperclip-create-handoff-issue.mjs --handoff-file .scratch/ops/worker-handoff-exemplo.json
```

O script cria a child issue com `parentId` apontando para `source_issue.id`. Se `block_source_issue` estiver ativo, ele tenta atualizar a issue de origem com `blockedByIssueIds` apontando para a child issue criada.

Depois de criar a child issue, registre o ID vivo:

```bash
node scripts/freela-crm.mjs handoff record --file .scratch/ops/worker-handoff-exemplo.json --status issue_created --paperclip-issue-id [issue-id] --paperclip-issue-identifier [FRE-N]
```

Reconciliar status de issues Paperclip ja encerradas:

```bash
node scripts/freela-crm.mjs handoff reconcile
```

`handoff reconcile` consulta as issues Paperclip registradas em `worker_handoffs` e transforma issue `done` em handoff `completed`, e issue `cancelled` em handoff `cancelled`.

Status aceitos em `worker_handoffs`: `pending_issue`, `issue_created`, `blocked`, `completed` e `cancelled`.

O script usa a API HTTP direta do Paperclip (`/api/companies/{companyId}/issues` e `/api/issues/{issueId}`), nao `npx` nem `paperclipai`. Isso evita falhas de cache npm dentro dos heartbeats. Em execucao normal de worker, Paperclip injeta `PAPERCLIP_COMPANY_ID`, `PAPERCLIP_API_URL`, `PAPERCLIP_API_KEY` e `PAPERCLIP_RUN_ID`. Fora de heartbeat, informe `--company-id` e, se necessario, `--api-key`.

## Exemplo

```json
{
  "handoff_version": 1,
  "source_agent_id": "f14e47e4-82d2-4236-87ce-1475aa28e1b5",
  "source_agent_name": "Redator de Primeira Mensagem",
  "source_issue": {
    "id": "issue-uuid",
    "identifier": "FRE-31",
    "title": "Escrever mensagens da rodada"
  },
  "target_agent_id": "7753b5f4-5e01-4271-986b-9dd11716e57c",
  "target_agent_name": "QA de Mensagens",
  "title": "Revisar mensagens da rodada YYYY-MM-DD",
  "required_action": "Revisar tom, especificidade e risco antes de liberar lead-cards.",
  "context": "Mensagens prontas geradas pelo Redator para a rodada de prospeccao.",
  "workflow": {
    "batch_id": "prospeccao-vitoria-YYYY-MM-DD-final-15",
    "run_id": "prospeccao-vitoria-YYYY-MM-DD",
    "round_date": "YYYY-MM-DD",
    "stage": "redator_to_qa",
    "expected_count": 15,
    "actual_count": 15,
    "gate_status": "pending",
    "next_owner": "QA de Mensagens"
  },
  "artifacts": [
    {
      "path": ".scratch/crm/mensagens-prontas-YYYY-MM-DD.md",
      "description": "Mensagens finais de primeira abordagem",
      "required": true
    }
  ],
  "acceptance_criteria": [
    "Criar .scratch/crm/message-qa-report.json e .scratch/crm/message-qa-report.md",
    "Classificar cada mensagem como aprovado_para_lead_cards, aprovado_com_observacao, requer_ajuste ou bloqueado",
    "Criar handoff para COO Freelancer publicar lead-cards no FRE-7 somente se aprovado"
  ],
  "block_source_issue": false,
  "priority": "medium"
}
```

## Cadeias Obrigatorias

- Scout -> Validador de Dados.
- Validador de Dados -> Steve.
- Steve -> Redator de Primeira Mensagem.
- Redator de Primeira Mensagem -> QA de Mensagens.
- QA de Mensagens -> Follow-up CRM quando aprovado.
- QA de Mensagens -> Redator de Primeira Mensagem quando `requer_ajuste`.
- Follow-up CRM -> Diagnostico 3 Pontos quando lead respondeu "pode".
- Diagnostico 3 Pontos -> Atendimento e Fechamento.
- Follow-up CRM ou Atendimento -> Criador Presenca 72h depois de `demo-brief.md` para Presenca Local em 72h com `nivel: Presenca Local em 72h`.
- Criador Presenca 72h -> QA de Demos.
- QA de Demos -> Criador correspondente quando `requer_ajuste`.
- Ops de Entrega -> Engenharia/COO quando deploy automatico falhar fora do escopo dele.
