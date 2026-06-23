# Kit visual reutilizavel para demos de Presenca Local

Data: 2026-06-23

## Objetivo

Melhorar a qualidade visual das demos de Presenca Local usando a demo do Espaco Luciene Christo como piloto, sem transformar a operacao em um gerador grande demais.

O resultado esperado e um kit pequeno e reutilizavel para proximas demos, com:

- paleta inspirada no Instagram publico do cliente;
- botoes sociais com icones oficiais de Instagram e WhatsApp, quando os assets oficiais estiverem disponiveis;
- biblioteca inicial de imagens neutras por nicho;
- checklist operacional para OZZY criar demos e Johan revisar antes de liberar envio.

## Escopo aprovado

A abordagem aprovada e "kit pequeno + piloto":

- Ajustar primeiro a demo do Espaco Luciene Christo.
- Extrair do piloto um padrao reaproveitavel para proximas demos.
- Usar fidelidade visual nivel 2: a demo deve parecer feita para o cliente, com paleta e clima inspirados no perfil publico, mas sem copiar fotos, posts, artes, logos ou assets autorais.
- Usar imagens seguras: ambientes, objetos, equipamentos e detalhes de maos, sem rostos ou pessoas identificaveis.
- Comecar com quatro nichos: estetica/beleza, pilates/fisioterapia, odontologia e laboratorio/saude diagnostica.

## Fora de escopo

- Gerador automatico completo de demos.
- Extracao automatica de paleta por imagem/feed.
- CSS compartilhado obrigatorio para todas as demos.
- Copia de fotos, posts, artes, logos ou capturas do Instagram do cliente.
- Uso de imagens com rosto, paciente, equipe, antes/depois ou ambiente real simulado.
- Uso de telefone, endereco completo ou WhatsApp como dado oficial quando ainda nao estiver confirmado.
- Envio automatico de WhatsApp.

## Estrutura proposta

Arquivos versionados:

```text
assets/demo-kit/
  social/
    instagram-glyph.svg
    whatsapp-glyph.svg
    README.md
  niches/
    estetica-beleza/
    pilates-fisioterapia/
    odontologia/
    laboratorio-saude/
  manifest.json

docs/freelancer/demo-visual-kit.md
demos/espaco-luciene-christo/
```

O kit deve ficar em `assets/demo-kit/` porque e material publico/deployavel, reutilizavel entre demos e nao deve conter dados privados. A documentacao operacional deve ficar em `docs/freelancer/demo-visual-kit.md`, com instrucoes para OZZY, Johan e atendimento.

Na primeira versao, cada demo continua estatica e autonoma. A demo pode apontar para assets do kit ou copiar um asset seguro para sua propria pasta quando isso facilitar deploy. CSS compartilhado fica fora da primeira versao; depois de 3 a 5 pilotos, a equipe decide se vale extrair componentes comuns.

## Fluxo operacional

1. OZZY le o brief, Bio Evidence Pack e contexto do lead.
2. OZZY separa fatos publicos de inferencias e dados a confirmar.
3. OZZY define paleta com 3 a 5 tokens: fundo, superficie, texto, primario e acento.
4. OZZY escolhe uma imagem segura do nicho correto no `manifest.json`.
5. OZZY aplica botoes sociais padronizados com texto acessivel e icone oficial, se disponivel.
6. OZZY entrega a demo com `noindex, nofollow` e aviso de conceito visual nao oficial.
7. Johan revisa privacidade, seguranca comercial, responsividade, assets sociais e qualidade visual.
8. Atendimento usa apenas o gancho aprovado na conversa, sem mandar link de PDF/cartao virtual e sem enviar WhatsApp direto fora do fluxo seguro.

## Regras visuais

### Paleta

A paleta deve ser inspirada no Instagram publico do cliente, sem copiar uma arte especifica.

Para o Espaco Luciene Christo, a direcao deve sair do bege generico atual e aproximar o visual de uma estetica especializada: tons femininos/profissionais, contraste bom, botoes claros e leitura mobile forte.

Fallback: se nao houver paleta confiavel, usar uma paleta neutra do nicho e registrar isso na nota da demo. Nao inventar identidade especifica quando a evidencia for fraca.

### Imagens por nicho

As imagens do kit devem seguir este limite:

- ambientes, equipamentos, objetos e detalhes;
- sem rosto claro;
- sem paciente, equipe ou profissional identificavel;
- sem antes/depois;
- sem simular o ambiente real do lead;
- sem prometer resultado clinico, estetico ou terapeutico.

Primeira leva de nichos:

- `estetica-beleza`: textura de clinica estetica, bancada, equipamento, detalhe de atendimento sem rosto.
- `pilates-fisioterapia`: studio claro, aparelho de pilates, faixa/elastico, maca, movimento sem pessoa identificavel.
- `odontologia`: consultorio limpo, cadeira/equipamento, detalhe de instrumental, sem paciente.
- `laboratorio-saude`: bancada limpa, tubos/equipamentos genericos, ambiente tecnico sem pessoa identificavel.

### Icones sociais

Usar apenas assets oficiais ou aprovados internamente para Instagram e WhatsApp. Nao baixar icones de sites aleatorios.

Regras:

- manter forma e proporcao do icone;
- nao redesenhar o logo manualmente quando houver asset oficial;
- manter texto no botao, por exemplo "Ver Instagram" e "Chamar no WhatsApp";
- se o asset oficial nao estiver disponivel no repo, usar botao textual e registrar lacuna para obtencao do asset correto;
- nao usar o logo de WhatsApp ou Instagram para sugerir patrocinio, parceria ou afiliacao.

Referencias oficiais consultadas no planejamento:

- Instagram Brand Refresh: `https://about.instagram.com/brand`
- WhatsApp Legal Resources, que lista WhatsApp Brand Guidelines e assets/downloads: `https://www.whatsapp.com/legal`

## Piloto: Espaco Luciene Christo

Contexto operacional aprovado:

- Lead: Espaco Luciene Christo.
- Instagram publico observado: `https://www.instagram.com/lucienechristo/`.
- Bio operacional observada: estetica/beleza em Cariacica, com servicos especializados.
- Friccao comercial aprovada: o link da bio abre um cartao virtual/PDF no Drive, criando caminho menos direto ate a informacao e o atendimento.

Direcao da demo:

- Trocar a imagem conceitual generica por imagem segura do nicho estetica/beleza.
- Usar paleta mais proxima do clima visual do Instagram dela, sem copiar posts, artes ou fotos.
- Reforcar a ideia de que a pagina simplifica o caminho que hoje passa por cartao/PDF.
- Manter linguagem prudente: sem prometer resultado, sem antes/depois, sem depoimentos e sem lista oficial de servicos nao confirmada.
- Manter WhatsApp e endereco completo como dados a confirmar, salvo se forem confirmados por fonte publica autorizada no fluxo operacional.
- Manter `noindex, nofollow` e aviso de conceito visual nao oficial.

## Checklist de QA

Johan deve bloquear ou devolver para ajuste se algum item abaixo falhar:

- HTML contem `meta name="robots" content="noindex, nofollow"`.
- A demo deixa claro que e conceito visual nao oficial.
- A imagem de hero e segura para o nicho e nao mostra rosto, paciente, equipe ou ambiente real simulado.
- A paleta parece intencional e nao generica, mas nao copia arte do cliente.
- Botoes de Instagram e WhatsApp tem texto acessivel e, se usarem icone, usam asset oficial/aprovado.
- Nao ha telefone, endereco completo, preco, oferta fechada ou promessa comercial nao confirmada.
- Nao ha promessa clinica, estetica ou terapeutica.
- Mobile nao tem overflow, texto sobreposto ou botoes quebrados.
- O gancho do cartao/PDF aparece como simplificacao do caminho de contato, sem expor link direto do PDF.

## Worker updates necessarios

OZZY - Criador Presenca 72h:

- Passar a consultar `docs/freelancer/demo-visual-kit.md` antes de criar demos.
- Escolher nicho e imagem segura pelo `assets/demo-kit/manifest.json`.
- Registrar quando usou fallback de paleta ou imagem.

Johan - QA de Demos/Exemplos:

- Adicionar os criterios do kit ao QA de demo.
- Bloquear uso de imagem com rosto/paciente/equipe, copia de asset autoral, iconografia baixada de fonte aleatoria ou dado oficial nao confirmado.

Atendimento WhatsApp:

- Para Luciene, quando a demo for mencionada, usar o gancho aprovado: a pagina reduz a dependencia do cartao virtual/PDF e deixa tratamentos, regiao e primeiro contato mais claros.
- Nao enviar WhatsApp diretamente; manter fluxo Outbox -> Humanizer -> Guardiao -> Gateway.

## Verificacao de implementacao

Antes de declarar a implementacao pronta:

- Validar que `assets/demo-kit/manifest.json` e parseavel como JSON.
- Validar que os assets referenciados no manifest existem.
- Validar que a demo da Luciene carrega sem erro localmente.
- Validar HTML da demo com parser ou smoke test.
- Rodar `git diff --check`.
- Fazer QA visual em desktop e mobile.
- Rodar `node --check` apenas se scripts JS forem alterados.
- Rodar testes de contrato se algum prompt, script ou agente Paperclip for alterado.

## Notas para o plano

A implementacao deve ser planejada em tarefas pequenas:

1. criar manifest e docs do kit;
2. adicionar assets sociais oficiais/aprovados ou fallback textual documentado;
3. adicionar imagens seguras iniciais por nicho;
4. aplicar piloto na demo Luciene;
5. atualizar prompts/contratos de OZZY e Johan para incluir a nova regra visual;
6. verificar, commitar e pushar.
