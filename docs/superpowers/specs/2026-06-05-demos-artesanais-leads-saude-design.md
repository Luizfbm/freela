# Demos artesanais para leads de saude

Data: 2026-06-05

## Objetivo

Criar dois sites demo artesanais para leads da aba `Hot High` da planilha de prospeccao de saude em Vitoria/ES. Cada demo deve parecer pensado para o negocio especifico, sem depender de template visual repetido.

Os demos serao usados em uma abordagem comercial por WhatsApp. A proposta e mostrar um conceito pronto, privado e nao oficial, feito com informacoes publicas.

## Leads do piloto

1. Clinica Equilibrio Fisioterapia
   - Segmento: fisioterapia e terapias
   - Area: Enseada do Sua
   - Telefone publico: (27) 3235-1857
   - Status: somente social
   - Fonte principal na planilha: Todos Negocios

2. COI Odontologia
   - Segmento: odontologia
   - Area: Praia do Sua
   - Telefone publico: (27) 99610-5491
   - Status: somente social
   - Fonte principal na planilha: Ajudes

## Abordagem aprovada

Os sites serao artesanais por lead. A escala fica para uma etapa posterior.

Mesmo com liberdade visual, alguns padroes sao obrigatorios:

- Cada lead tem uma pasta propria.
- Cada site e estatico e abre localmente sem build complexo.
- Cada site tem `noindex`.
- Cada site tem aviso discreto de que e um conceito visual nao oficial.
- Nenhum site usa fotos de pacientes, antes/depois, promessas medicas ou depoimentos inventados.
- O texto usa apenas fatos publicos, copy neutra ou inferencias claramente seguras.
- Cada lead recebe uma mensagem exclusiva de WhatsApp pronta para envio.
- Cada demo deve ser testado em mobile e desktop.

## Estrutura de arquivos

```text
demos/
  README.md
  shared/
    assets/
    snippets/
  clinica-equilibrio-fisioterapia/
    index.html
    styles.css
    script.js
    assets/
    copy-whatsapp.md
    screenshot-mobile.png
    screenshot-desktop.png
  coi-odontologia/
    index.html
    styles.css
    script.js
    assets/
    copy-whatsapp.md
    screenshot-mobile.png
    screenshot-desktop.png
```

`shared/` deve ser minimo. Ele pode guardar notas, icones seguros, helpers pequenos ou assets comuns. O CSS principal deve ficar em cada pasta para preservar a identidade visual de cada demo.

## Fluxo por lead

1. Ler a linha correspondente na aba `Hot High`.
2. Validar informacoes publicas atuais do lead.
3. Separar fatos publicos de inferencias.
4. Definir direcao visual propria com `ui-ux-pro-max`.
5. Escrever copy do site com `copywriting`.
6. Revisar a copy com `humanizer`.
7. Criar site estatico na pasta do lead.
8. Criar `copy-whatsapp.md` com mensagem personalizada para Luiz enviar.
9. Testar em desktop e mobile no browser local.
10. Salvar prints desktop e mobile na pasta do lead.

## Uso de skills

- `google-drive:google-sheets`: ler a aba `Hot High` e manter a planilha como fonte de verdade dos leads.
- `local-client-prospector`: validar dados publicos e ausencia de site proprio quando necessario.
- `ui-ux-pro-max`: definir direcao visual de cada site e checar boas praticas de UI.
- `copywriting`: criar a copy de conversao do site e da abordagem.
- `humanizer`: revisar textos para ficarem naturais, sem cara de IA.
- `browser:control-in-app-browser`: testar os demos locais e capturar prints.
- `verification-before-completion`: conferir os criterios antes de declarar o piloto pronto.

## Direcao do demo Clinica Equilibrio Fisioterapia

O site deve transmitir calma, cuidado e movimento. A comunicacao deve ajudar um visitante a entender rapidamente que a clinica pode ser procurada para fisioterapia, cuidado corporal e atendimento local.

Estrutura inicial. Ela pode mudar depois da pesquisa publica, mas o demo final deve manter uma linha clara de leitura:

1. Hero com promessa clara e CTA para WhatsApp.
2. Bloco curto sobre movimento, recuperacao e atendimento proximo.
3. Servicos organizados em cards simples.
4. Secao de localizacao e contato.
5. Perguntas frequentes sem promessas clinicas.
6. CTA final.

Evitar linguagem de cura garantida, dor resolvida em prazo especifico ou qualquer alegacao medica nao comprovada.

## Direcao do demo COI Odontologia

O site deve transmitir confianca, clareza e atendimento odontologico organizado. A comunicacao pode ser mais comercial do que a fisioterapia, mas sem exagero.

Estrutura inicial. Ela pode mudar depois da pesquisa publica, mas o demo final deve manter uma linha clara de leitura:

1. Hero com foco em avaliacao/agendamento.
2. Bloco de especialidades ou frentes de atendimento citadas em fonte publica.
3. Secao explicando o caminho para marcar contato.
4. Localizacao e WhatsApp.
5. Perguntas frequentes sobre primeira conversa, horario e contato.
6. CTA final.

Evitar fotos de pacientes, antes/depois, promessas esteticas, numero de casos, avaliacoes ou autoridade que nao estejam em fonte publica.

## Mensagens de WhatsApp

Cada `copy-whatsapp.md` deve conter uma mensagem curta em primeira pessoa, enviada pelo Luiz.

Regras:

- Comecar com contexto honesto.
- Dizer que foi criado um conceito visual, nao um site oficial.
- Evitar pressao comercial.
- Incluir o link real do demo quando ele estiver publicado. Enquanto o link publico nao existir, usar `{{DEMO_URL}}` como marcador temporario dentro do arquivo.
- Oferecer ajuste ou retirada se a pessoa preferir.
- Usar tom humano e direto.

Modelo base. O arquivo final de cada lead deve substituir `{{NOME}}`, `{{SERVICO_OU_CLINICA}}` e `{{DEMO_URL}}` antes do envio:

```text
Oi, {{NOME}}. Tudo bem?

Sou Luiz, aqui de Vitoria. Vi que voces aparecem em diretorios/Instagram, mas nao encontrei um site proprio claro.

Montei um conceito rapido de como poderia ficar uma pagina simples para apresentar melhor {{SERVICO_OU_CLINICA}} e levar a pessoa direto para o WhatsApp:
{{DEMO_URL}}

Nao e um site oficial de voces, so uma ideia visual. Se fizer sentido, posso ajustar com as informacoes corretas e publicar no dominio de voces. Se preferirem que eu remova, sem problema.
```

## Criterios de aceite

Para cada lead:

- A pasta do lead existe em `demos/`.
- `index.html`, `styles.css`, `script.js` e `copy-whatsapp.md` existem.
- O HTML contem `meta name="robots" content="noindex, nofollow"`.
- O rodape deixa claro que e conceito visual nao oficial.
- O CTA de WhatsApp usa o telefone publico quando disponivel.
- Nao ha fotos sensiveis, antes/depois ou claims medicos fortes.
- A copy nao tem sinais obvios de IA: sem exagero, sem promessas vagas, sem travessoes longos, sem frases artificiais.
- O site nao tem overflow horizontal em 390px, 768px e desktop.
- Os prints mobile e desktop estao salvos na pasta do lead.

Para o projeto:

- `demos/README.md` explica como abrir e publicar os demos.
- O servidor local consegue servir as paginas.
- O piloto pode ser enviado ao cliente com link privado.

## Fora de escopo nesta fase

- Automatizar geracao em lote.
- Criar sistema de CMS.
- Criar deploy remoto.
- Comprar dominio, configurar DNS ou subdominios.
- Usar imagens privadas ou autorais dos leads sem autorizacao.
- Enviar mensagens automaticamente pelo WhatsApp.
