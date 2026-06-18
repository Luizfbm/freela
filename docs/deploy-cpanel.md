# Deploy automatico no cPanel

Este repositorio ja tem duas pecas da automacao:

- `.cpanel.yml`: define o que o cPanel publica em `public_html`.
- `.github/workflows/deploy-cpanel.yml`: entra no cPanel por SSH, roda `git pull --ff-only` e aciona `VersionControlDeployment`.

## Regra operacional para agentes

Agentes podem acionar deploy automatico quando isso fizer parte da tarefa, mas o caminho certo e sempre o pipeline controlado:

1. garantir que a mudanca publica passou por QA quando for demo ou pagina de cliente;
2. commitar e fazer push para `main`, ou pedir esse push quando a autorizacao humana for necessaria;
3. acompanhar `Actions > Deploy cPanel` no GitHub Actions;
4. verificar o link publicado com `curl`, navegador ou QA antes de liberar para envio ao cliente.

Nao usar cPanel manual, nao usar FTP e nao fazer SSH manual para publicar arquivos. SSH no workflow existe apenas como detalhe interno da automacao.

Se o GitHub Actions falhar com `Shell access is not enabled`, o deploy automatico nao rodou de verdade. Nesse caso, a correcao operacional e habilitar shell no cPanel ou migrar o workflow para um caminho com token/API do cPanel.

## O que voce precisa configurar uma vez

### 1. Acesso do GitHub Actions ao cPanel

Crie uma chave SSH dedicada para deploy. A chave publica deve ser autorizada no cPanel em `SSH Access > Authorized Keys`.

No GitHub, em `Settings > Secrets and variables > Actions > Secrets`, crie:

- `CPANEL_SSH_HOST`: host SSH do cPanel.
- `CPANEL_SSH_USER`: usuario SSH do cPanel.
- `CPANEL_SSH_PORT`: porta SSH, normalmente `22`.
- `CPANEL_SSH_KEY`: chave privada de deploy.
- `CPANEL_SSH_KNOWN_HOSTS`: opcional, conteudo fixo do `known_hosts`. Se nao preencher, o workflow usa `ssh-keyscan`.

Nao commite chave privada, senha, token ou host sensivel no repositorio.

### 2. Acesso do cPanel ao GitHub

Se o repositorio do GitHub for privado, o proprio servidor cPanel precisa conseguir fazer `git pull`.

No terminal do cPanel:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/freela_github_deploy -C "cpanel-freela-deploy"
cat ~/.ssh/freela_github_deploy.pub
```

Adicione a chave publica no GitHub em `Settings > Deploy keys > Add deploy key` como **Deploy Key read-only**.

Configure o SSH do cPanel para usar essa chave com o GitHub:

```sshconfig
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/freela_github_deploy
  IdentitiesOnly yes
```

Depois teste no cPanel:

```bash
cd /home/SEU_USUARIO/caminho/do/repositorio
git pull --ff-only origin main
```

### 3. Variaveis do GitHub Actions

No GitHub, em `Settings > Secrets and variables > Actions > Variables`, crie:

- `CPANEL_REPO_PATH`: caminho absoluto do repositorio no cPanel. Exemplo: `/home/SEU_USUARIO/repos/freela`.
- `CPANEL_BRANCH`: `main`.
- `CPANEL_UAPI_BIN`: normalmente `/usr/bin/uapi`. Se o servidor usar CloudLinux, pode ser `/usr/local/cpanel/bin/uapi`.

### 4. Conferir destino publico

O `.cpanel.yml` publica em:

```bash
${HOME}/public_html/
```

Se o site estiver em subdominio ou outro diretoria, ajuste a linha `DEPLOYPATH` no `.cpanel.yml`.

## Como o deploy roda

Ao fazer push na branch `main`, o GitHub Actions:

1. valida secrets e variables;
2. conecta no cPanel por SSH;
3. entra em `CPANEL_REPO_PATH`;
4. roda `git pull --ff-only origin main`;
5. executa `uapi VersionControlDeployment create repository_root=...`;
6. o cPanel le o `.cpanel.yml` e sincroniza os arquivos publicos.

Tambem da para rodar manualmente pelo botao `Run workflow` em `Actions > Deploy cPanel`.

## Primeiro teste controlado

Depois de preencher secrets e variables:

```bash
git push origin main
```

No GitHub, acompanhe `Actions > Deploy cPanel`. Se falhar, os erros mais comuns sao:

- SSH nao autorizado no cPanel.
- `CPANEL_REPO_PATH` aponta para o diretorio errado.
- cPanel nao consegue fazer `git pull` do GitHub.
- caminho do `uapi` diferente do configurado.

Quando passar, o deploy automatico fica ativo para todo push em `main`.
