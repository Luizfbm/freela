# Deploy automatico no cPanel

Este repositorio ja tem duas pecas da automacao:

- `.cpanel.yml`: define o que o cPanel publica em `public_html`.
- `.github/workflows/deploy-cpanel.yml`: aciona o deploy pelo GitHub Actions. O caminho preferido usa UAPI com token do cPanel; o caminho SSH fica como fallback legado.

## Regra operacional para agentes

Agentes podem acionar deploy automatico quando isso fizer parte da tarefa, mas o caminho certo e sempre o pipeline controlado:

1. garantir que a mudanca publica passou por QA quando for demo ou pagina de cliente;
2. commitar e fazer push para `main`, ou pedir esse push quando a autorizacao humana for necessaria;
3. acompanhar `Actions > Deploy cPanel` no GitHub Actions;
4. verificar o link publicado com `curl`, navegador ou QA antes de liberar para envio ao cliente.

Nao usar cPanel manual, nao usar FTP e nao fazer SSH manual para publicar arquivos. SSH no workflow existe apenas como fallback interno da automacao.

Se o GitHub Actions falhar com `Shell access is not enabled`, o deploy automatico por SSH nao rodou. Nesse caso, configure o caminho preferido por token/API do cPanel ou habilite shell no cPanel.

## O que voce precisa configurar uma vez

### 1. Acesso do GitHub Actions ao cPanel por API

Este e o caminho preferido, porque nao depende de shell interativo no hosting.

No cPanel, crie um API Token com permissao para Git Version Control. No GitHub, em `Settings > Secrets and variables > Actions > Secrets`, crie:

- `CPANEL_API_TOKEN`: token de API do cPanel.
- `CPANEL_API_HOST`: host do cPanel. Opcional se `CPANEL_SSH_HOST` ja existir e apontar para o mesmo host.
- `CPANEL_API_USER`: usuario do cPanel. Opcional se `CPANEL_SSH_USER` ja existir e apontar para o mesmo usuario.

No GitHub, em `Settings > Secrets and variables > Actions > Variables`, crie se precisar:

- `CPANEL_API_PORT`: porta da API do cPanel. Padrao: `2083`.

O workflow usa UAPI conforme a documentacao oficial do cPanel:

- `VersionControl/update` com `repository_root` e `branch` para puxar a branch remota.
- `VersionControl/retrieve` para esperar o checkout remoto chegar no `GITHUB_SHA`.
- `VersionControlDeployment/create` para acionar o deploy.
- `VersionControlDeployment/retrieve` para esperar o deploy terminar com sucesso.

Se o repo do cPanel ja e a raiz publicada do site, o cPanel pode responder `deployable=0` e `tasks=[]`. Nesse caso o workflow usa o modo `update-only`: depois que `VersionControl/update` confirma que o checkout remoto chegou no `GITHUB_SHA`, o push ja esta publicado e a Action termina com sucesso. Mesmo assim, o agente deve verificar a URL publicada antes de liberar qualquer link.

### 2. Acesso SSH legado do GitHub Actions ao cPanel

Use este caminho somente se a conta tiver shell habilitado. Crie uma chave SSH dedicada para deploy. A chave publica deve ser autorizada no cPanel em `SSH Access > Authorized Keys`.

No GitHub, em `Settings > Secrets and variables > Actions > Secrets`, crie:

- `CPANEL_SSH_HOST`: host SSH do cPanel.
- `CPANEL_SSH_USER`: usuario SSH do cPanel.
- `CPANEL_SSH_PORT`: porta SSH, normalmente `22`.
- `CPANEL_SSH_KEY`: chave privada de deploy.
- `CPANEL_SSH_KNOWN_HOSTS`: opcional, conteudo fixo do `known_hosts`. Se nao preencher, o workflow usa `ssh-keyscan`.

Nao commite chave privada, senha, token ou host sensivel no repositorio.

### 3. Acesso do cPanel ao GitHub

Se o repositorio do GitHub for privado, o proprio servidor cPanel precisa conseguir fazer pull pelo recurso de Git Version Control.

Com shell habilitado, isso pode ser configurado no terminal do cPanel:

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

Sem shell habilitado, configure o acesso do repositorio remoto pela interface de Git Version Control do cPanel.

### 4. Variaveis do GitHub Actions

No GitHub, em `Settings > Secrets and variables > Actions > Variables`, crie:

- `CPANEL_REPO_PATH`: caminho absoluto do repositorio no cPanel. Exemplo: `/home/SEU_USUARIO/repos/freela`.
- `CPANEL_BRANCH`: `main`.
- `CPANEL_UAPI_BIN`: somente para o fallback SSH. Normalmente `/usr/bin/uapi`. Se o servidor usar CloudLinux, pode ser `/usr/local/cpanel/bin/uapi`.

### 5. Conferir destino publico

O `.cpanel.yml` publica em:

```bash
${HOME}/public_html/
```

Se o site estiver em subdominio ou outro diretoria, ajuste a linha `DEPLOYPATH` no `.cpanel.yml`.

## Como o deploy roda

Ao fazer push na branch `main`, o GitHub Actions:

1. valida secrets e variables;
2. se `CPANEL_API_TOKEN` existir, chama UAPI para atualizar o repositorio e confirma que o checkout remoto chegou no `GITHUB_SHA`;
3. se o cPanel reportar o repo como deployable, cria o deploy e espera o status `succeeded`;
4. se o repo do cPanel ja e a raiz publicada e o cPanel reportar `deployable=0`, usa o modo `update-only` e considera o deploy concluido apos o SHA remoto bater;
5. se `CPANEL_API_TOKEN` nao existir, usa o fallback SSH para rodar `git pull --ff-only origin main` e `uapi VersionControlDeployment create repository_root=...`;
6. quando o modo deployable estiver ativo, o cPanel le o `.cpanel.yml` e sincroniza os arquivos publicos.

Tambem da para rodar manualmente pelo botao `Run workflow` em `Actions > Deploy cPanel`.

## Primeiro teste controlado

Depois de preencher secrets e variables:

```bash
git push origin main
```

No GitHub, acompanhe `Actions > Deploy cPanel`. Se falhar, os erros mais comuns sao:

- SSH nao autorizado no cPanel.
- `CPANEL_API_TOKEN` ausente ou sem permissao para Git Version Control.
- `CPANEL_REPO_PATH` aponta para o diretorio errado.
- cPanel nao consegue fazer `git pull` do GitHub.
- caminho do `uapi` diferente do configurado.
- shell desabilitado quando o workflow estiver usando o fallback SSH.

Quando passar, o deploy automatico fica ativo para todo push em `main`.
