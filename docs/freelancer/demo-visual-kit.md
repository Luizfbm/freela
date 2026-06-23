# Kit visual para demos Presenca Local

## Objetivo

Usar um padrao pequeno para demos parecerem feitas para o cliente, sem copiar fotos, posts, artes, logos ou dados privados.

## Uso por OZZY

1. Leia o brief e o Bio Evidence Pack.
2. Separe fatos publicos de dados a confirmar.
3. Escolha o nicho em `assets/demo-kit/manifest.json`.
4. Defina paleta inspirada no Instagram publico, sem copiar arte.
5. Nao copiar Instagram: nao reaproveite post, foto, arte, logo, captura de tela ou composicao autoral do perfil.
6. Use imagem segura do kit: sem rostos, sem pessoas identificaveis, sem paciente e sem simular ambiente real.
7. A hero visual deve usar `<img>` com asset real registrado no `assets/demo-kit/manifest.json`.
8. E proibido usar placeholder, ilustracao ou composicao montada em CSS no hero no lugar da imagem real do kit.
9. Use botoes sociais com texto e icones oficiais/aprovados.
10. Registre fallback quando a paleta, imagem ou dado comercial nao for confiavel.

## Uso por Johan

Bloqueie ou devolva para ajuste quando houver rosto, paciente, equipe, ambiente real simulado, promessa clinica/estetica, copia de Instagram, iconografia de fonte aleatoria, dado oficial nao confirmado, mobile quebrado ou hero/placeholder em CSS no lugar de imagem real registrada no manifest.

## Uso por Atendimento WhatsApp

Quando uma demo aprovada for mencionada no WhatsApp, use apenas o gancho aprovado pela demo e pelo QA. Para Luciene, o gancho seguro e que a pagina simplifica o caminho que hoje passa por cartao virtual/PDF, deixando tratamentos, regiao e primeiro contato mais claros.

Atendimento continua sem enviar WhatsApp diretamente. Toda mensagem passa por Outbox, Humanizer, Guardiao e Gateway.

## Fallbacks

- Sem paleta confiavel: usar paleta neutra do nicho.
- Sem icone oficial/aprovado: usar botao textual e registrar lacuna.
- Sem imagem do nicho: gerar ou escolher imagem conceitual neutra, salvar em `assets/demo-kit/niches/`, registrar no manifest e so entao apontar a demo para esse asset.
- Dado comercial duvidoso: remover ou marcar como "a confirmar".
