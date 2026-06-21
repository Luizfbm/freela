# Arquitetura de Consistencia Operacional Freela

Data: 2026-06-21

## Resumo

Esta spec define a proxima camada de confiabilidade operacional da empresa freelancer/Paperclip.

A decisao aprovada e a opcao 2: confiabilidade operacional seria, sem transformar o projeto em uma plataforma SRE completa. O sistema deve reduzir risco de perda silenciosa, detectar degradacao cedo, manter trilha privada de evidencia e publicar um status executivo no Paperclip.

O SQLite continua sendo a fonte oficial. Arquivos em `.scratch/*.md` e `.scratch/*.csv` continuam sendo espelhos privados ou relatorios, nunca fonte oficial.

O backup remoto/cloud fica fora do escopo desta etapa. Primeiro sera fechada consistencia local forte, com snapshots verificados, guardrails de escrita e plano de recuperacao auditavel.

## Contexto

O incidente recorrente nao indicou corrupcao interna tradicional do SQLite. A causa raiz provavel foi offload/sincronizacao do macOS/File Provider em caminho dentro de `Documents`, evidenciado por arquivo com tamanho logico, `blocks=0`, ausencia de header SQLite e erro `file is not a database`.

Mitigacao ja aplicada:

- banco oficial movido para `~/Library/Application Support/freela-paperclip/db/freela.sqlite`;
- `.scratch/db` mantido como symlink de compatibilidade;
- CLI `scripts/freela-crm.mjs` com healthcheck, validacao de header, snapshots forenses e backups rotativos antes de caminhos criticos;
- docs/prompts do Paperclip ajustados para tratar `.scratch/db/freela.sqlite` como caminho de compatibilidade.

Esta spec adiciona uma camada operacional para impedir recorrencia silenciosa e aumentar autonomia com limites claros.

## Objetivos

- Detectar DB invalido, backup ausente, backup velho ou snapshot corrompido antes de dano operacional.
- Garantir snapshots locais verificados em cadencia horaria e diaria.
- Registrar evidencia tecnica completa em `.scratch/ops`.
- Publicar resumo executivo em uma issue/documento fixo do Paperclip chamado `Ops Health`.
- Calcular plano de restauracao antes de qualquer restore real.
- Permitir que agentes saibam quando podem operar, quando devem avisar e quando devem parar.
- Manter dados privados fora de `docs/`, `demos/` e `outputs/`.

## Fora de escopo

- Backup remoto, cloud, S3, Drive, iCloud ou servico externo.
- Restauracao automatica sem confirmacao explicita.
- Migracao para Postgres ou outro banco.
- Reescrever o CRM.
- Dar acesso a dados brutos privados para documentos executivos no Paperclip.
- Alterar o fluxo WhatsApp, salvo para provar que o CRM voltou a abrir.

## Arquitetura

Novo script operacional:

```bash
node scripts/freela-ops-doctor.mjs
```

Ele e read-mostly. Escritas permitidas:

- relatorios privados em `.scratch/ops`;
- snapshots SQLite verificados;
- manifesto privado de backups;
- documento executivo `Ops Health` no Paperclip quando chamado em modo `publish`.

Saidas oficiais:

1. Evidencia tecnica privada:
   - `.scratch/ops/reliability-status.json`
   - `.scratch/ops/reliability-status.md`
   - `.scratch/ops/backup-manifest.json`
   - planos de restauracao em `.scratch/ops/restore-plans/`

2. Painel executivo Paperclip:
   - issue fixa `Ops Health`
   - documento `reliability-status`
   - resumo sem nomes, telefones, mensagens, dados comerciais sensiveis ou payloads brutos.

O Paperclip e a visao operacional da empresa. `.scratch/ops` e a trilha tecnica auditavel.

## Comandos

Comandos planejados:

```bash
node scripts/freela-ops-doctor.mjs check
node scripts/freela-ops-doctor.mjs publish
node scripts/freela-ops-doctor.mjs snapshot
node scripts/freela-ops-doctor.mjs restore-plan <snapshot>
node scripts/freela-ops-doctor.mjs restore --from <snapshot> --confirm
```

Sem subcomando, o script deve mostrar ajuda curta e sair sem alterar estado.

## Fluxo de checks

`check` valida o estado local e escreve relatorios em `.scratch/ops`.

Checks SQLite:

- `.scratch/db` deve ser symlink para `~/Library/Application Support/freela-paperclip/db`;
- o arquivo oficial deve existir;
- o arquivo deve ter header SQLite valido;
- o arquivo nao pode estar dataless/offloaded;
- abertura read-only deve funcionar;
- `pragma integrity_check` deve retornar `ok`;
- tabelas minimas esperadas devem existir.

Checks de backup:

- deve existir snapshot recente;
- snapshot mais recente deve passar em `pragma integrity_check`;
- idade do backup horario e diario deve estar dentro da politica aprovada;
- snapshots invalidos nao entram no manifesto.

Checks operacionais:

- contagens basicas de tabelas criticas;
- crescimento anormal ou acumulado de outbox WhatsApp `pending`/`failed`;
- eventos inbound nao conciliados acumulando;
- handoffs pendentes ou stale;
- frescor das superficies operacionais sincronizadas para o Paperclip;
- disponibilidade basica da API Paperclip quando `publish` for usado.

## Status operacional

O resultado consolidado deve ser um status unico:

- `green`: DB integro, backup recente integro e nenhum risco critico pendente.
- `yellow`: operacao possivel, mas risco acumulando ou acao operacional recomendada.
- `red`: novas escritas criticas devem ser bloqueadas ate diagnostico/recuperacao.

Exemplos:

- DB invalido: `red`.
- Header ausente: `red`.
- `integrity_check` falhou: `red`.
- Nenhum snapshot integro: `red`.
- Backup horario velho, mas backup diario integro recente: `yellow`.
- Handoff stale ou outbox falhando: `yellow`, salvo se houver risco direto de duplicidade ou dano.

## Publicacao no Paperclip

`publish` deve:

1. executar `check`;
2. criar ou localizar a issue fixa `Ops Health`;
3. atualizar documento `reliability-status`;
4. manter a publicacao executiva, sem payload privado.

Conteudo permitido no Paperclip:

- status `green`, `yellow` ou `red`;
- data/hora do ultimo check;
- data/hora do ultimo snapshot integro;
- resumo de riscos por categoria;
- acao recomendada;
- caminho local privado do relatorio tecnico, sem conteudo sensivel.

Conteudo proibido no Paperclip:

- nomes de leads;
- telefones;
- mensagens WhatsApp;
- payloads brutos;
- valores comerciais sensiveis;
- dumps de tabelas.

## Politica de snapshots

Backups existentes no CRM continuam sendo feitos antes de escritas criticas via `VACUUM INTO`.

Snapshots operacionais adicionais:

- antes de escrita critica: backup rotativo imediato no CRM;
- horario: 1 snapshot por hora, manter as ultimas 24 horas;
- diario: 1 snapshot por dia, manter os ultimos 14 dias;
- todos os snapshots precisam passar em `pragma integrity_check`;
- manifesto privado registra caminho, tipo, timestamp, tamanho, hash e resultado do check.

Retencao deve remover apenas snapshots conhecidos no manifesto e nunca apagar snapshots forenses.

## Recuperacao

Recuperacao nao e automatica.

`restore-plan <snapshot>` deve produzir um plano privado em `.scratch/ops/restore-plans/` com:

- snapshot candidato;
- idade do snapshot;
- `integrity_check` do snapshot;
- ultimo audit log do DB atual, se legivel;
- ultimo audit log do snapshot;
- diferenca de contagens por tabela critica;
- janela estimada de perda;
- recomendacao: restaurar, investigar ou reconstruir manualmente.

`restore --from <snapshot> --confirm` so pode executar restauracao real quando:

- snapshot candidato passou em `integrity_check`;
- snapshot forense do estado atual foi criado antes;
- o caminho oficial foi validado;
- o comando recebeu confirmacao explicita.

## Guardrails de autonomia

Camadas:

1. Prevencao:
   - `freela-crm.mjs` segue bloqueando DB invalido antes de init, migracoes e escritas criticas;
   - snapshots sao verificados antes de entrar no manifesto.

2. Deteccao:
   - `freela-ops-doctor.mjs check` atualiza `.scratch/ops`;
   - `publish` atualiza o `Ops Health`.

3. Contencao:
   - `red`: CLI deve recusar escritas criticas, agentes devem parar e escalar;
   - `yellow`: operacao permitida com alerta e acao recomendada;
   - `green`: operacao normal.

Agentes Paperclip nao precisam entender SQLite profundamente. Eles precisam consultar o status operacional e respeitar a regra de parada.

## Scheduler local

Automacao local recomendada via `launchd` no macOS:

- horario: `node scripts/freela-ops-doctor.mjs snapshot`;
- diario: `node scripts/freela-ops-doctor.mjs publish`;
- opcional depois: `check` a cada 15 ou 30 minutos sem publicar toda vez.

O Paperclip nao deve ser o unico mecanismo de seguranca. Se a API Paperclip estiver fora, snapshots e checks locais ainda devem rodar.

## Testes

Implementacao deve seguir TDD.

Casos minimos:

- DB invalido gera status `red`;
- header SQLite ausente gera status `red`;
- `integrity_check` falhando gera status `red`;
- ausencia de snapshot integro gera status `red`;
- backup horario velho gera `yellow` quando ainda ha backup diario integro;
- snapshot valido atualiza manifesto;
- snapshot invalido nao entra no manifesto;
- `publish` nao vaza dados privados;
- `restore-plan` calcula janela de perda sem restaurar;
- `restore` exige `--confirm`;
- restauracao cria snapshot forense antes de trocar o DB;
- comandos de escrita critica respeitam estado `red`.

Validacoes esperadas depois da implementacao:

```bash
node --test tests/freela-crm-cli.test.mjs tests/whatsapp-local-gateway.test.mjs
node --test tests/freela-ops-doctor.test.mjs
node --check scripts/freela-crm.mjs scripts/freela-ops-doctor.mjs scripts/whatsapp-local-gateway.mjs
jq empty docs/freelancer/paperclip/*.json
git -c core.fsmonitor=false diff --check
sqlite3 ".scratch/db/freela.sqlite" "pragma integrity_check;"
```

## Decisoes aprovadas

- Opcao 2: confiabilidade operacional seria, sem SRE completo.
- Publicar status nos dois lugares: `.scratch/ops` e Paperclip `Ops Health`.
- Manter backups apenas locais nesta etapa.
- Usar `VACUUM INTO` para backups consistentes.
- Restauracao real exige plano previo e confirmacao explicita.
- Paperclip recebe resumo executivo, nao dados brutos privados.
- `launchd` pode ser usado como scheduler local porque independe da saude do Paperclip.

## Criterio de sucesso

O trabalho esta pronto quando:

- o estado operacional atual pode ser avaliado por um comando unico;
- existe snapshot local recente e verificado;
- o Paperclip mostra status executivo atualizado;
- DB invalido ou backup ausente bloqueia escritas criticas;
- qualquer restauracao potencial passa por plano de perda estimada;
- testes cobrem os modos `green`, `yellow` e `red`;
- dados privados continuam restritos a `.scratch` e SQLite.
