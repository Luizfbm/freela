# Prompt para Local Client Prospector: Vitoria, Grande Vitoria

Use este documento como briefing operacional para uma execucao futura da skill `local-client-prospector`.

Nao rodar a prospeccao sem antes respeitar as regras de exclusao deste arquivo.

## Objetivo

Encontrar 20 leads novos, qualitativos, na regiao de Vitoria/ES e Grande Vitoria, com alta chance de precisar de organizacao de presenca local.

A prospeccao deve priorizar negocios onde seja possivel falar diretamente com o dono, profissional autonomo ou responsavel pela operacao, evitando ao maximo leads que dependem de secretaria, central de atendimento ou decisao corporativa lenta.

## Entrada da busca

- Localizacao base: Vitoria, ES.
- Raio: 20 km.
- Regiao preferida: Grande Vitoria.
- Maximo de leads novos: 20.
- Idioma: portugues do Brasil.
- Volume com qualidade: pesquisar ao menos 25 candidatos brutos e entregar no minimo 15 leads novos qualificados por rodada padrao. Nao parar em 5 leads; se nao houver 15 bons, registrar bloqueio e fonte/bairro que faltou explorar.
- Qualidade vs quantidade: nao completar com lead fraco so para bater numero. O Scout garante volume qualificado; Steve faz o gate qualitativo final.
- Canais aceitos: WhatsApp/telefone publico, Instagram, Google, Facebook ou Linktree.
- Saida final desejada: planilha `.xlsx` usando o plugin `Spreadsheets`.
- Bio Evidence Pack obrigatorio para leads com Instagram: antes de navegar Instagram/Linktree, rode `node scripts/paperclip-open-chrome-window.mjs --preflight`; analisar bio, link da bio, Linktree/bio.site/site/agenda/WhatsApp quando existir e registrar campos compativeis com `node scripts/freela-crm.mjs profile-evidence upsert --file .scratch/prospeccao-vitoria/YYYY-MM-DD/profile-evidence.json`. Se o preflight falhar, nao declarar bio OK; registre `bio_status: erro_tecnico` ou status real de bloqueio. O SQLite guarda isso em `lead_platform_profiles` e `lead_platform_links`.

## Tipo de lead prioritario

O lead ideal e o profissional-dono-operador.

Descricao:

- A pessoa que decide tambem trabalha no negocio.
- O contato tem chance de cair direto com o dono, profissional ou responsavel real.
- O negocio depende de agenda, WhatsApp, indicacao e reputacao local.
- A presenca digital existe, mas e improvisada: Instagram, Linktree, Facebook, diretorios ou site fraco.
- O negocio parece pequeno ou medio, com decisao rapida.
- A comunicacao tem rosto, nome proprio ou marca pessoal.

Exemplo do tipo de lead:

- Fisioterapeuta que tem uma clinica pequena ou consultorio proprio.
- Profissional que atende, gerencia agenda e tambem cuida do Instagram/WhatsApp.
- Estudio de pilates de uma proprietaria local.
- Consultorio de nutricao, psicologia, estetica, odontologia ou terapia com dono visivel.

Por que esse lead e melhor:

- Menos barreira de secretaria.
- Decisao mais rapida.
- Dor mais pessoal: o dono sente a perda de mensagens e a apresentacao fraca.
- Maior chance de aceitar uma solucao simples e pragmatica.
- Melhor encaixe para diagnostico gratuito e oferta de presenca local.

## Sinais positivos do profissional-dono-operador

Priorizar negocios com sinais como:

- Nome de pessoa na marca ou no perfil.
- Bio com "fundadora", "proprietaria", "fisioterapeuta", "dentista", "esteticista", "nutricionista", "psicologa", "atendimento comigo" ou parecido.
- Instagram com rosto do profissional.
- WhatsApp direto no perfil.
- Agenda pelo WhatsApp.
- Unidade unica.
- Pouca estrutura corporativa.
- Servicos claros, mas apresentacao fraca.
- Uso de Linktree, bio.site, WhatsApp direto, Facebook ou apenas Instagram.
- Google com horario, telefone ou servicos incompletos.

Depriorizar:

- Franquias.
- Redes grandes.
- Hospitais.
- Laboratorios grandes.
- Clinicas com varias unidades e central de atendimento.
- Negocios em que o contato claramente passa por secretaria/call center.
- Empresas com site bom, funil claro e equipe de marketing.

## Nichos permitidos

Nao ha limites rigidos de nicho, mas a busca deve priorizar negocios de atendimento/agendamento.

Prioridade alta:

- Fisioterapia.
- Pilates.
- Estetica.
- Odontologia independente.
- Nutricao.
- Psicologia.
- Podologia.
- Terapias integrativas.
- Massoterapia.
- Fonoaudiologia.
- Terapia ocupacional.
- Personal trainer/estudio pequeno.
- Saloes e barbearias com dono visivel.

Prioridade media:

- Assistencia tecnica local.
- Oficinas especializadas.
- Cursos pequenos.
- Pet shop/banho e tosa premium.
- Clinicas veterinarias pequenas.

## Regras rigidas de exclusao

Esta execucao nao pode repetir leads que ja existem no repositorio.

Antes de pesquisar qualquer candidato, verificar se ele parece corresponder a algum lead ja existente.

Fontes de exclusao:

- Pastas em `demos/`.
- Dados em `outputs/**`.
- Qualquer lead ja abordado anteriormente, se houver registro local.

Regra critica:

> Se o negocio ja possuir demo em `demos/`, nao pesquisar, nao abrir fontes, nao anotar, nao incluir em planilha e nao considerar como lead novo.

O nome deve ser tratado de forma flexivel. Excluir tambem nomes parecidos, mesmo com grafia diferente.

Exemplos de equivalencia:

- `VilaFisio Fisioterapia` = `vilafisio-fisioterapia`.
- `Clinica Viva Sem Dor` = `clinica-viva-sem-dor`.
- `MoviFisio Clinica de Fisioterapia` = `movifisio-clinica-fisioterapia`.
- `SR Pilates e Fisioterapia` = `sr-pilates-fisioterapia`.

## Como comparar duplicados

Normalizar nomes antes de comparar:

- Converter para minusculas.
- Remover acentos.
- Remover pontuacao.
- Remover espacos duplicados.
- Comparar versao slugificada.
- Comparar tokens principais.
- Ignorar termos genericos quando necessario: `clinica`, `studio`, `estudio`, `espaco`, `saude`, `fisioterapia`, `pilates`, `odontologia`, `vitoria`, `vila velha`, `es`.

Considerar duplicado se:

- O slug for igual.
- Um slug contem o outro de forma clara.
- Os tokens principais batem.
- A diferenca for apenas acento, abreviacao, plural, ordem das palavras ou termo generico.
- A similaridade visual do nome for alta.

Em caso de duvida, excluir. O objetivo e nao repetir.

## Leads antigos e privacidade

Leads antigos nao devem entrar na nova planilha de prospeccao.

Se for necessario guardar uma lista de leads antigos ou esquecidos, usar uma area privada:

```text
.scratch/leads-esquecidos/YYYY-MM-DD/
```

Nao salvar planilhas com telefone, WhatsApp ou dados de prospeccao em pasta publica do site, como `docs/`, `demos/` ou `outputs/`, sem confirmar que a hospedagem nao publica esses arquivos.

Este repositorio esta deployado como hospedagem simples, entao tratar arquivos de leads como dados privados.

## Critérios de oportunidade

Priorizar leads com um ou mais destes problemas:

- Sem site.
- Apenas Instagram.
- Apenas Linktree/bio.site.
- Apenas Facebook.
- Site ruim, antigo, fraco ou confuso.
- Google com informacoes incompletas.
- WhatsApp dificil de encontrar.
- Bio do Instagram confusa.
- Servicos sem explicacao clara.
- Localizacao ou horario pouco claros.
- Caminho ate o WhatsApp com atrito.

## Classificacao

Usar a classificacao da skill, com ajuste para o perfil profissional-dono-operador.

Hot:

- Sem site ou social only.
- Contato publico existe.
- Negocio ativo.
- Sinais fortes de dono/profissional respondendo diretamente.
- Dor clara de presenca local.

Warm:

- Site fraco ou muito simples.
- Social/WhatsApp existem, mas apresentacao ruim.
- Sinais medios de contato com dono.
- Pode valer abordagem, mas nao e prioridade maxima.

Low:

- Site bom.
- Presenca organizada.
- Baixa chance de falar com decisor.
- Evidencia incompleta.

Skip:

- Duplicado.
- Ja tem demo.
- Fora do raio/regiao.
- Rede grande/franquia.
- Sem contato publico util.
- Nao parece negocio local com agenda/atendimento.

## Oferta recomendada por tipo de lead

Presenca Local em 72h:

- Usa Instagram/Linktree/Facebook como principal presenca.
- Nao tem site.
- Tem WhatsApp, mas apresentacao antes do contato e fraca.
- Tem mais estrutura.
- Tem varios servicos.
- Tem fotos, endereco e atendimento recorrente.
- Site atual e fraco ou inexistente.
- Melhor abordagem: diagnostico gratuito + pagina de apresentacao local em 72h.

WhatsApp Business Organizado:

- Dor principal parece ser atendimento.
- Muitos comentarios/perguntas repetidas.
- WhatsApp e o canal central.
- Bio ou posts incentivam contato, mas sem organizacao clara.
- Melhor abordagem: diagnostico gratuito + organizacao de atendimento.

Recepcao Digital WhatsApp:

- Nao oferecer para lead frio.
- Marcar apenas como oportunidade futura se o negocio tiver volume de mensagens e agenda.

## Abordagem comercial

Tom: consultivo, leve e focado em diagnostico gratuito.

Nao vender no primeiro contato.

Primeira mensagem base:

```text
Oi, [nome], tudo bem? Sou Luiz, trabalho com presenca digital para negocios locais aqui em Vitoria.

Vi o perfil de voces no Google/Instagram e notei alguns pontos simples que podem facilitar mais pessoas chamarem no WhatsApp.

Posso te mandar 3 sugestoes rapidas sem compromisso?
```

A planilha deve gerar uma mensagem personalizada por lead, mencionando o problema principal de forma cuidadosa.

Exemplo:

```text
Oi, [nome], tudo bem? Sou Luiz, trabalho com presenca digital para negocios locais aqui em Vitoria.

Vi que voces usam bastante o Instagram como canal principal, mas o caminho ate o WhatsApp pode ficar mais claro para quem chega pela primeira vez.

Posso te mandar 3 sugestoes rapidas sem compromisso?
```

## Workflow de pesquisa

1. Montar lista de exclusao a partir de `demos/` e `outputs/**`.
2. Buscar candidatos em Vitoria e Grande Vitoria dentro de 20 km.
3. Antes de abrir fontes do candidato, comparar o nome com a lista de exclusao.
4. Se houver match com demo ou lead antigo, pular.
5. Para candidatos novos, verificar fontes publicas.
6. Checar se existe site standalone.
7. Checar Instagram/Facebook/Linktree/Google.
8. Para Instagram, sempre ler `bio_status`, `bio_text`, `bio_link_url`, `bio_link_status`, abrir link da bio quando existir, analisar Linktree ou bio.site e extrair `commercial_hook`.
9. Procurar sinais de profissional-dono-operador.
10. Classificar score, website status e confianca.
11. Gerar recomendacao de oferta e mensagem personalizada.
12. Entregar no maximo 20 leads novos.

## Fontes a usar

Usar o navegador apenas como pesquisa assistida, sem scraping em escala, e seguindo `docs/freelancer/paperclip/browser-automation.md`.

Para analise de leads com Instagram, usar obrigatoriamente o perfil operacional `Paperclip Scout` no Chrome local. Antes da rodada, rodar `node scripts/paperclip-chrome-scout-smoke.mjs --instagram`; se nao retornar `ready: true`, a rodada com Instagram nao inicia e deve registrar bloqueio. O perfil operacional `Paperclip Scout` pode reutilizar a janela existente do proprio perfil e abrir/mirar aba de trabalho; nao deve reutilizar, navegar, recarregar ou alterar abas do Chrome pessoal/perfil pessoal diario. O preflight `node scripts/paperclip-open-chrome-window.mjs --preflight` continua sendo diagnostico de abertura; se o preflight falhar, nao declarar bio OK. O Bio Evidence Pack deve trazer `browser_evidence_status`, `browser_evidence_method: chrome_operational_profile` e `instagram_session_status`. Nao chamar `open -a "Google Chrome"` direto. Nao usar Playwright WebKit (`org.webkit.Playwright`), Playwright Firefox/Nightly (`org.mozilla.nightly`) nem in-app browser; fonte publica/snippet e apenas apoio, nao substitui bio navegada.

Fontes permitidas:

- Busca web.
- Google Maps como descoberta manual.
- Instagram publico.
- Facebook publico.
- Sites oficiais.
- Diretorios publicos.
- Conselhos/listagens publicas quando aplicavel.

Nao fazer:

- Bypassar login, CAPTCHA ou bloqueio.
- Raspar Google Maps em massa.
- Coletar dados pessoais privados.
- Incluir e-mails pessoais sem necessidade.
- Afirmar que nao existe site sem busca exata por nome + cidade.

## Consultas sugeridas

Comecar por buscas que aumentem a chance de encontrar profissional-dono-operador:

```text
fisioterapeuta Vitoria ES Instagram WhatsApp
fisioterapeuta autonoma Vitoria ES
pilates Vitoria ES Instagram WhatsApp
studio pilates Vitoria proprietaria
estetica Vitoria ES Instagram WhatsApp
esteticista Vitoria atendimento WhatsApp
nutricionista Vitoria ES Instagram WhatsApp
psicologa Vitoria ES agendamento WhatsApp
podologia Vitoria ES Instagram WhatsApp
massoterapia Vitoria ES Instagram WhatsApp
dentista Vitoria ES Instagram WhatsApp consultorio
```

Expandir para Vila Velha, Serra e Cariacica apenas dentro da logica de Grande Vitoria e raio de 20 km.

## Campos obrigatorios da planilha

Criar uma planilha `.xlsx` usando o plugin `Spreadsheets`.

Nome sugerido:

```text
.scratch/prospeccao-vitoria/YYYY-MM-DD/leads-vitoria-20km-owner-operators.xlsx
```

A planilha deve conter uma aba `leads_novos` com estas colunas:

```text
score
business
category
area
city
distance_km
website_status
website_url
social_urls
phone_or_contact
source_urls
bio_status
bio_text
bio_link_url
bio_link_status
commercial_hook
owner_operator_signal
main_problem
recommended_offer
suggested_approach
personalized_message
confidence
notes
```

Campos extras obrigatorios:

- `owner_operator_signal`: por que parece possivel falar com dono/profissional.
- `main_problem`: problema principal observado.
- `recommended_offer`: Presenca Local em 72h, WhatsApp Business Organizado ou Futuro/Recepcao Digital. Use `notes` ou `suggested_approach` para indicar o objetivo principal da Presenca Local em 72h.
- `suggested_approach`: angulo de abordagem.
- `personalized_message`: primeira mensagem personalizada para WhatsApp/Instagram.

Nao incluir coluna "possui demo" nos leads novos, porque leads com demo devem ser excluidos antes.

## Regras da mensagem personalizada

Cada mensagem deve:

- Ser curta.
- Pedir permissao.
- Nao vender site diretamente.
- Mencionar no maximo um problema observado.
- Nao parecer critica agressiva.
- Nao afirmar algo incerto.

Modelo:

```text
Oi, [nome], tudo bem? Sou Luiz, trabalho com presenca digital para negocios locais aqui em Vitoria.

Vi [observacao especifica e cuidadosa].

Posso te mandar 3 sugestoes rapidas sem compromisso?
```

## Resposta final esperada

Ao finalizar, responder no chat com:

- Local pesquisado.
- Raio.
- Data da pesquisa.
- Quantidade de leads novos encontrados.
- Caminho da planilha criada.
- Top 3 melhores alvos e motivo pratico.
- Observacoes sobre incertezas.
- Confirmacao de que leads com demo foram excluidos.

## Regra final

Se a execucao comecar a encontrar muitos leads fracos, diminuir quantidade e aumentar verificacao.

O objetivo nao e encher planilha. O objetivo e encontrar pessoas com maior chance de responder porque elas mesmas sentem a dor da presenca digital baguncada.
