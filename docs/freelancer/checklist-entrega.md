# Checklist de Entrega

Este checklist comeca depois que o cliente aceitou a proposta e pagou a entrada.

## Contrato de dados

- Leia `docs/freelancer/data-contract.md` antes de registrar estado operacional.
- SQLite em `.scratch/db/freela.sqlite` e a fonte de verdade operacional.
- Use `node scripts/freela-crm.mjs lead status --name [nome]` para consultar o cliente/lead antes de iniciar entrega.
- Se precisar registrar fechamento, demo, entrega ou proxima acao comercial, acione o Follow-up CRM ou use `node scripts/freela-crm.mjs` conforme o contrato.
- Use `node scripts/freela-crm.mjs export all` para regenerar espelhos quando houver mudanca de estado.
- Nao edite arquivos em `.scratch` manualmente como fonte oficial de estado.
- Dados privados de cliente ficam somente em `.scratch/` e no SQLite privado.

## Antes de iniciar

Confirmar:

- Valor fechado.
- Escopo fechado.
- Prazo combinado.
- Forma de pagamento.
- Data de entrega.
- Quem aprova do lado do cliente.

Mensagem:

```text
Perfeito. Vou considerar como combinado:

- Escopo: [escopo]
- Valor: R$ [valor]
- Entrada: R$ [entrada]
- Restante na entrega: R$ [restante]
- Prazo: ate [data]
- Uma rodada de ajustes incluida
```

## Coleta de informacoes

Pedir ao cliente:

- Nome correto do negocio.
- WhatsApp principal.
- Instagram.
- Endereco ou regiao atendida.
- Horario de atendimento.
- Lista de servicos.
- Diferenciais.
- Fotos autorizadas.
- Logo, se tiver.
- Cores ou preferencias, se tiver.

Se o cliente nao tiver tudo:

- Usar informacoes publicas apenas como rascunho.
- Validar antes de publicar.
- Evitar afirmar dados sensiveis sem confirmacao.

## Copy

Criar textos simples:

- Chamada principal.
- Subtitulo explicando o que o negocio faz.
- Lista de servicos.
- Texto curto sobre o negocio.
- CTA para WhatsApp.
- Mensagem pronta do WhatsApp.

Evitar:

- Promessas de resultado.
- Termos clinicos arriscados sem validacao.
- Antes/depois.
- Depoimentos sem autorizacao.
- Copiar texto do Instagram sem ajustar.

## Pagina/site

Checklist minimo:

- Titulo claro.
- Servicos visiveis.
- Botao de WhatsApp na primeira dobra.
- Localizacao/regiao atendida.
- Horarios ou orientacao de atendimento.
- Link para Instagram.
- Boa leitura no celular.
- Imagens leves.
- SEO basico: title e description.
- Noindex se for demo.
- Sem informacao falsa ou nao validada.

## Deploy automatico

Agentes podem acionar deploy automatico para publicar site, demo aprovada ou correcao publica.

Fluxo correto:

1. confirmar que o conteudo publico esta seguro;
2. para demo ou exemplo de lead, garantir QA antes de liberar o link para envio;
3. commitar e fazer push para `main`, ou pedir esse push quando a autorizacao humana for necessaria;
4. acompanhar `Actions > Deploy cPanel` no GitHub Actions;
5. verificar a URL publicada antes de considerar a publicacao pronta.

Nao usar cPanel manual, nao usar FTP e nao fazer SSH manual para publicar arquivos. O deploy oficial passa por `.github/workflows/deploy-cpanel.yml`, `.cpanel.yml` e `docs/deploy-cpanel.md`.

## WhatsApp

Preparar:

- Link com mensagem pronta.
- 3 a 5 respostas rapidas sugeridas.
- Mensagem de saudacao sugerida.
- Mensagem de ausencia sugerida, se fizer sentido.

Respostas rapidas sugeridas:

```text
/horario
Ola! Nosso horario de atendimento e [horario]. Para agendar, me envie seu nome e o melhor periodo para atendimento.

/endereco
Estamos em [endereco/regiao]. Posso te enviar a localizacao pelo mapa.

/servicos
Atendemos com [servicos principais]. Me diga o que voce procura para eu te orientar melhor.

/agendar
Para agendar, me envie nome, telefone e melhor dia/horario. Vamos verificar a disponibilidade.

/retorno
Obrigado pelo contato. Assim que possivel retornamos com as informacoes.
```

## Google/Instagram

Entregar sugestoes para:

- Link principal.
- Bio do Instagram.
- Lista de servicos.
- Descricao curta.
- CTA para WhatsApp.
- Fotos recomendadas.

Importante:

- Se precisar acessar a conta do cliente, pedir que ele faca as alteracoes junto ou envie acesso de forma segura.
- Nao prometer aprovacao imediata de mudancas no Google.

## Revisao antes de enviar

Antes de usar navegador:

- Seguir `docs/freelancer/paperclip/browser-automation.md`.
- Nao usar Playwright WebKit (`org.webkit.Playwright`), Playwright Firefox/Nightly (`org.mozilla.nightly`) nem in-app browser; ha crash conhecido no macOS.
- Preferir validacao estatica com `curl`, parser HTML, leitura de CSS/JS e checagem de links/assets.
- Se navegador visual for indispensavel, usar somente Chrome pessoal via `node scripts/paperclip-open-chrome-window.mjs`.

Testar:

- Link abre no celular.
- Botao de WhatsApp funciona.
- Mensagem pronta aparece.
- Textos nao tem erro obvio.
- Servicos estao corretos.
- Endereco/telefone estao corretos.
- Pagina carrega bem.
- Visual esta bom no mobile.

## Envio para aprovacao

Mensagem:

```text
Oi, [nome]. Primeira versao pronta:

[link]

Confere principalmente:

- nome do negocio
- servicos
- WhatsApp
- endereco/regiao
- textos principais

Esta incluso uma rodada de ajustes. Pode me mandar tudo em uma mensagem so para eu fechar a versao final.
```

## Ajustes

Regra:

- Uma rodada de ajustes incluida.
- Ajustes devem vir agrupados.
- Mudanca grande de escopo vira novo orcamento.

Mensagem:

```text
Perfeito, vou ajustar esses pontos.

Como combinamos, essa e a rodada de ajustes incluida. Se aparecer alguma mudanca maior depois, eu te aviso antes de fazer qualquer cobranca extra.
```

## Entrega final

Antes de finalizar:

- Receber pagamento restante.
- Publicar versao final.
- Enviar links finais.
- Enviar orientacoes simples.
- Oferecer mensalidade.

Mensagem:

```text
Tudo pronto e publicado:

[link final]

Tambem deixei o WhatsApp direcionado com mensagem pronta.

Se quiser, posso manter pequenas alteracoes, suporte e ajustes futuros por R$ [valor]/mes.
```
