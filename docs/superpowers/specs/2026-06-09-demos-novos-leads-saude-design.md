# Demos artesanais para novos leads de saude em Vitoria

Data: 2026-06-09

## Objetivo

Criar cinco demos estaticos e personalizados para leads de saude em Vitoria/ES:

1. Fisiohealth Clinica de Fisioterapia e Pilates
2. Espaco Vitta Saude
3. EssenceSaude
4. Viva Odontologia
5. CEO Clinica de Especialidades Odontologicas

Cada demo deve seguir a estrutura dos demos ja criados em `demos/clinica-equilibrio-fisioterapia/` e `demos/coi-odontologia/`, mas com identidade visual, mensagem e abordagem proprias para cada lead.

Os demos serao usados em abordagem comercial por WhatsApp. Eles devem ser honestos: conceitos visuais nao oficiais feitos com informacoes publicas, sem copiar fotos privadas, sem prometer resultado clinico e sem fingir que o negocio aprovou o material.

## Fontes e limites da pesquisa

Fontes usadas como base:

- Planilha `outputs/vitoria_saude_leads_20260605/leads_saude_vitoria_es_2026-06-05.xlsx`.
- Instagram publico do Espaco Vitta Saude: `https://www.instagram.com/vittasaudee/`.
- Instagram publico da EssenceSaude: `https://www.instagram.com/essencesaude/`.
- Ajudes, SindjudES, Setmore, TodosNegocios, BuscaFisio, Cylex, DentMap e AppLocal quando aplicavel.

Limites:

- O Instagram da Fisiohealth nao ficou identificavel com handle confiavel. A direcao deve usar dados de diretorios e uma identidade visual segura para fisioterapia/pilates.
- A listagem da Viva Odontologia aponta para `@viva.odontologia`, mas esse perfil aparenta ser de Maceio, nao de Vitoria. Nao usar esse perfil como identidade visual da Viva Odontologia de Vitoria.
- O CEO aparece com Facebook/diretorios, sem Instagram publico claro. A direcao deve ser institucional e baseada em dados publicos confirmados.
- Nao usar fotos de pacientes, equipe, instalacoes ou artes dos perfis sem autorizacao.
- Nao usar depoimentos, notas, avaliacoes ou claims fortes sem fonte e sem aprovacao do negocio.

## Estrutura de arquivos

Cada novo lead deve ter:

```text
demos/<slug>/
  assets/
  index.html
  styles.css
  script.js
  copy-whatsapp.md
  screenshot-desktop.png
  screenshot-mobile.png
```

Tambem deve existir uma nota de pesquisa:

```text
demos/research/<slug>.md
```

Slugs aprovados:

- `fisiohealth-clinica-fisioterapia-pilates`
- `espaco-vitta-saude`
- `essencesaude`
- `viva-odontologia`
- `ceo-clinica-especialidades-odontologicas`

## Padroes obrigatorios

- `meta name="robots" content="noindex, nofollow"` em todos os HTMLs.
- Rodape explicando que o demo e conceito visual nao oficial criado por Luiz FBM com informacoes publicas.
- CTA com telefone/WhatsApp publico quando houver canal confiavel.
- `copy-whatsapp.md` com mensagem pronta para Luiz enviar, usando `{{DEMO_URL}}` ate o link publico final existir.
- Imagem de hero generica, sem pessoas identificaveis e sem copiar material do lead.
- Layout responsivo sem overflow horizontal em mobile.
- Tipografia consistente com os demos atuais: Figtree para titulos e Noto Sans para texto.
- Uso de icons SVG simples, sem emoji como UI principal.
- Foco em CTA e leitura rapida. Evitar navegacao complexa e contato escondido.

## Direcao por lead

### Fisiohealth

Fatos publicos:

- Segmento: fisioterapia e pilates.
- Area: Jardim Camburi, Vitoria/ES.
- Telefone publico principal da planilha/diretorios: `(27) 3014-9801`.
- BuscaFisio lista servicos como Fisioterapia, Pilates, RPG e Terapia Manual.
- Diretorios apontam presenca social, mas sem handle de Instagram confirmado.

Direcao visual:

- Clinica tecnica, limpa e acolhedora.
- Cores: azul petroleo, verde saude e fundo frio claro.
- Hero com foco em movimento, avaliacao e rotina.
- Blocos: fisioterapia, pilates, RPG/terapia manual, contato e horarios.

Tom de copy:

- Direto, profissional e sem promessas de cura.
- Falar de organizar informacoes para quem pesquisa no celular e quer marcar atendimento.

### Espaco Vitta Saude

Fatos publicos:

- Instagram: `@vittasaudee`.
- Bio: "Mais saude, mais longevidade" e pilates para forca, equilibrio e bem-estar.
- Ajudes lista fisioterapia, pilates e outras terapias.
- Endereco publico citado: Rua Maria Eleonora Pereira, 555, loja 01, Jardim da Penha, Vitoria/ES.
- Telefone publico: `(27) 2142-1173`.

Direcao visual:

- Energia controlada, com personalidade de estudio de pilates.
- Cores da presenca publica: laranja como primario, roxo como apoio, branco e grafite.
- Hero mais dinamico, com chamadas para pilates, movimento e agendamento.
- Blocos: pilates, servicos, localizacao, primeira aula/contato e FAQ.

Tom de copy:

- Mais proximo e ativo, mas sem exagero.
- Usar linguagem de forca, equilibrio, rotina e bem-estar.

### EssenceSaude

Fatos publicos:

- Instagram: `@essencesaude`.
- Bio: terapias integrativas e pos-operatorio plastica.
- Setmore lista servicos como massagem, fisioterapia, acupuntura + reflexoterapia, drenagem linfatica, tratamento integrativo da dor e procedimento dermatofuncional.
- Endereco publico: Av. Joao Batista Parra, 633, Praia do Sua, Ed. Enseada Office, sala 1101, Vitoria/ES.
- Telefone/WhatsApp publico: `(27) 99779-6437`.

Direcao visual:

- Mais premium, calmo e especializado.
- Cores da marca observada: terrosos, laranja queimado, verde escuro e fundo quente claro.
- Hero com foco em cuidado integrativo, pos-operatorio e agendamento.
- Blocos: pos-operatorio, drenagem/fisioterapia dermatofuncional, terapias integrativas, reserva e contato.

Tom de copy:

- Cuidadoso e tecnico, sem prometer resultado cirurgico.
- Usar "acompanhamento", "avaliacao", "protocolo individual" e "seguranca" com sobriedade.

### Viva Odontologia

Fatos publicos:

- Segmento: odontologia.
- Area: Santa Lucia, Vitoria/ES.
- Telefone publico: `(27) 3026-1235`.
- TodosNegocios informa que nao ha site listado e aponta Instagram, mas o handle visivel levou a perfil de outra cidade.
- Endereco publico: Av. Nossa Sra. da Penha, 549, sala 105, Santa Lucia, Vitoria/ES.

Direcao visual:

- Odontologia leve e confiavel.
- Cores: azul claro, verde agua e branco, sem usar identidade de perfil incerto.
- Hero com foco em informacao reunida e contato simples.
- Blocos: atendimento odontologico, localizacao, horario, contato e FAQ.

Tom de copy:

- Simples e seguro, sem prometer estetica, clareamento, implante ou outro servico nao confirmado.
- Mensagem comercial deve mencionar que o Instagram encontrado ficou ambiguo e que a proposta organiza o contato publico.

### CEO Clinica de Especialidades Odontologicas

Fatos publicos:

- Segmento: odontologia.
- Area: Jardim da Penha, Vitoria/ES.
- Telefone/WhatsApp publico: `(27) 3227-8122`.
- TodosNegocios informa Facebook e ausencia de site listado.
- Endereco publico: Pc Philogomiro Lannes, 200, Jardim da Penha, Vitoria/ES.
- DentMap lista procedimentos de forma generica no diretorio, mas o demo deve evitar tratar isso como lista oficial da clinica.

Direcao visual:

- Institucional, organizado e objetivo.
- Cores: azul profundo, ciano discreto e branco.
- Hero com foco em especialidades odontologicas e contato direto.
- Blocos: informacoes reunidas, agendamento, localizacao, contato e FAQ.

Tom de copy:

- Mais formal que Viva Odontologia.
- Usar "especialidades odontologicas" sem detalhar tratamentos nao confirmados.

## Mensagens de WhatsApp

Cada `copy-whatsapp.md` deve:

- Abrir com "Oi, pessoal da <nome>. Tudo bem?"
- Apresentar Luiz como pessoa local.
- Explicar onde o lead foi encontrado e qual lacuna foi percebida.
- Dizer que o link e conceito visual nao oficial.
- Incluir `{{DEMO_URL}}`.
- Dizer que nao foram usadas fotos privadas nem promessas de resultado.
- Oferecer ajuste com dados corretos ou remocao sem pressao.

## Verificacao

Antes de declarar conclusao:

- Rodar parser HTML nos novos `index.html`.
- Rodar `git diff --check`.
- Rodar servidor local e testar com Playwright/Browser em desktop e mobile.
- Capturar `screenshot-desktop.png` e `screenshot-mobile.png` em cada pasta.
- Verificar ausencia de overflow horizontal.
- Verificar imagens carregando.
- Verificar console sem erros relevantes.
- Verificar `noindex, nofollow` nos cinco HTMLs.
- Verificar que os textos nao possuem travessoes longos, promessa clinica forte, depoimento inventado ou sinais obvios de IA.

## Fora de escopo

- Enviar WhatsApp automaticamente.
- Publicar em dominio real sem nova instrucao.
- Copiar assets privados do Instagram.
- Criar automacao em lote para futuros leads.
- Fazer commit/push de deploy sem pedido explicito.
