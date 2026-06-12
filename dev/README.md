# Luiz Filipe Miranda - Portfolio

Portfolio estatico em estilo terminal/CMD, construido com HTML, CSS e JavaScript puro.

O projeto apresenta experiencia, stack, formacao, contato e tres case studies tecnicos:

- IAeJovem: plataforma de apoio emocional para estudantes com IA empatica.
- Case Flow: sistema de chamados com chatbot, Kanban e controle por roles.
- Dev-roast: plataforma de code review com IA, arquitetura server-first e resultados compartilhaveis.

## Estrutura

```text
.
├── index.html
├── styles.css
├── script.js
├── assets/
│   ├── case-flow-architecture.png
│   ├── dev-roast-architecture.svg
│   └── iaejovem-architecture.svg
└── projects/
    ├── case-flow.html
    ├── dev-roast.html
    └── iaejovem.html
```

## Rodando localmente

Como o projeto e totalmente estatico, basta servir a pasta:

```bash
python3 -m http.server 4173
```

Depois acesse:

```text
http://localhost:4173/
```

## Funcionalidades

- Layout inspirado em terminal com controles de janela estilo macOS.
- Navegacao por comandos clicaveis.
- Cards de projetos com paginas separadas.
- Case studies com historia, pontos vendaveis, arquitetura e viewer de codigo com abas.
- SVGs de marca para GitHub e LinkedIn.
- Layout responsivo sem dependencias externas.

## Tecnologias

- HTML5
- CSS3
- JavaScript

## Links

- GitHub: <https://github.com/Luizfbm>
- LinkedIn: <https://www.linkedin.com/in/luizfilipedev/>
