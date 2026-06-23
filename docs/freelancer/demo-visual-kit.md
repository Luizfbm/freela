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
7. Use botoes sociais com texto e icones oficiais/aprovados.
8. Registre fallback quando a paleta, imagem ou dado comercial nao for confiavel.

## Uso por Johan

Bloqueie ou devolva para ajuste quando houver rosto, paciente, equipe, ambiente real simulado, promessa clinica/estetica, copia de Instagram, iconografia de fonte aleatoria, dado oficial nao confirmado ou mobile quebrado.

## Uso por Atendimento WhatsApp

Quando uma demo aprovada for mencionada no WhatsApp, use apenas o gancho aprovado pela demo e pelo QA. Para Luciene, o gancho seguro e que a pagina simplifica o caminho que hoje passa por cartao virtual/PDF, deixando tratamentos, regiao e primeiro contato mais claros.

Atendimento continua sem enviar WhatsApp diretamente. Toda mensagem passa por Outbox, Humanizer, Guardiao e Gateway.

## Fallbacks

- Sem paleta confiavel: usar paleta neutra do nicho.
- Sem icone oficial/aprovado: usar botao textual e registrar lacuna.
- Sem imagem do nicho: usar imagem conceitual neutra e registrar no manifest.
- Dado comercial duvidoso: remover ou marcar como "a confirmar".
