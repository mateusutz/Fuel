# Fuel — Documento de Referência

Referência técnica viva do app. Atualizar a cada mudança estrutural (formato de
dado, nova chave de storage, nova dependência, mudança de deploy, novo recurso).

## Estado atual
- **Lote concluído:** 3 (Perfil + motor + Biblioteca de alimentos + Refeições-modelo).
- **CACHE_VERSION atual:** `fuel-v3` (em `sw.js`).
- **Hospedagem:** GitHub Pages em `mateusutz.github.io/Fuel/` (subcaminho → todos os caminhos são relativos).
- **Persistência:** localStorage, via `storeGet`/`storeSet`, namespace `fuel:`.

## Arquivos
- `index.html` — carrega React 18 UMD, Babel standalone (classic), `dados-taco.js` e `app.js`; registra o SW.
- `app.js` — app inteiro (dados, motor, componentes, telas). Único arquivo de código.
- `dados-taco.js` — semente de alimentos (dados, não código). Define `window.FUEL_TACO`, `window.FUEL_TACO_CATS`, `window.FUEL_PORCOES`. Carregado como script comum **antes** do `app.js`.
- `sw.js` — service worker; cacheia o app shell; **CACHE_VERSION** incrementável.
- `manifest.json` — PWA (nome, cores, ícones).
- `icons/` — `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.
- `.github/workflows/deploy.yml` — deploy automático no Pages a cada push na `main`.

## Dependências externas (CDN, sem build)
- react@18.3.1, react-dom@18.3.1 (UMD, unpkg)
- @babel/standalone@7.25.6
- Fontes Google: Nunito (números/títulos) e Inter (corpo); fallback de sistema offline.

## Modelo de dados (chaves de storage)
Prefixo `fuel:` em todas. Hoje:
- `perfil` — objeto cru do formulário (strings dos inputs):
  `{ _v, sexo:'M'|'F', idade, altura, peso, gorduraPct, atividade, objetivo, ritmo }`
  - `_v` = versão do schema (atual: 1). Migração silenciosa em `migrarPerfil()`.
  - Campos numéricos guardados como string; convertidos por `normalizarPerfil()`.
- `metasManuais` — `null` ou objeto de metas sobrescritas à mão (`manual: true`).
- `abaAtiva` — `'semana' | 'biblioteca' | 'perfil'`.
- **Alimentos (lote 2) — modelo delta/override.** A semente (`window.FUEL_TACO`) é read-only e vive em `dados-taco.js`; o storage guarda só o que o usuário cria ou altera:
  - `alimentosUsuario` — array de alimentos próprios: `{ id:'u-<ts>', nome, cat, kcal, prot, carbo, gord, criadoEm }` (valores por 100 g).
  - `alimentosOverride` — `{ '<id>': { campos editados…, oculto?:true } }`. Só para ids `taco-*`. Editar um item da TACO grava um override; "remover" grava `oculto:true` (reversível via backup).
  - `porcoes` — `{ '<alimentoId>': [ {id, rotulo, g} ] }`. Materializa só quando o usuário edita as porções daquele alimento; senão usa `FUEL_PORCOES` da semente.
- **Refeições-modelo (lote 3):**
  - `refeicoes` — array: `{ id:'r-<ts>', nome, etiqueta, itens:[…], criadoEm }`. `etiqueta` ∈ `''|cafe|lanche_manha|almoco|lanche|jantar|ceia`.
    - Item: `{ id:'i-<ts>', alimentoId, gramas, medida }`. `gramas` é a verdade; `medida` é o rótulo amigável ("2× concha média" ou "150 g"). Macros derivados do alimento atual (sempre em dia).
  - `bibliotecaSecao` — `'alimentos' | 'refeicoes'` (seção ativa da aba Biblioteca).

Backup (`exportarBackup`/`importarBackup`): exporta `{ app, schema, exportadoEm, dados:{...todas as chaves...} }`.

## Motor de cálculo (em `app.js`, exposto em `window.FuelEngine`)
1. **BMR** — Mifflin-St Jeor: `10·peso + 6,25·altura − 5·idade (+5 H / −161 M)`.
2. **TDEE** — `BMR × fator de atividade`:
   sedentário 1,2 · leve 1,375 · moderado 1,55 · intenso 1,725 · muito 1,9.
3. **Meta calórica por objetivo:**
   - `perder` — usa ritmo: conservador −10%, moderado −18%, agressivo −25%.
   - `manter` — 0%.
   - `ganhar` — +10%.
   - `recomp` — −5%.
   - **Piso de segurança:** H 1500 / M 1200 kcal (com aviso).
4. **Macros:**
   - Proteína (g/kg): perder 2,2 · manter 1,6 · ganhar 1,8 · recomp 2,2.
     Base = massa magra se `gorduraPct` informado (`peso·(1−%/100)`), senão peso total.
   - Gordura: % das calorias (perder 25% · manter 28% · ganhar 25% · recomp 28%),
     com piso de 0,6 g/kg.
   - Carboidrato: o que sobra. Salvaguarda reduz gordura (até o piso) e depois
     proteína (até 1,6 g/kg) se proteína+gordura excederem a meta.

## Componentes principais (`app.js`)
- `App` — navegação inferior (3 abas) + roteamento simples por estado.
- `TelaPerfil` — formulário, cálculo reativo, edição manual, backup.
- `TelaEmBreve` — placeholder da Semana (próximo lote).
- `CardMetas` + `AnelMacros` — exibição da meta; **anel de macros = assinatura visual** (reaproveitado no detalhe do alimento, "por 100 g").
- `EditorManual` — sobrescreve metas à mão.
- `CardBackup` — exportar/importar JSON.
- **Biblioteca (lote 2):** `TelaBiblioteca` (wrapper, alterna seção via `SeletorSecao`), `PainelAlimentos` (lista→detalhe→form), `ListaAlimentos`, `ItemAlimento`, `TelaDetalhe`, `FormAlimento`, `FormPorcao`.
- **Refeições (lote 3):** `PainelRefeicoes` (lista→refeição→escolher alimento→quantidade), `ListaRefeicoes` (agrupada por etiqueta), `ItemRefeicaoCard`, `TelaRefeicao` (editor com auto-save; anel do total), `SeletorAlimento`, `SeletorQuantidade` (porção × quantidade ou gramas).
- Reutilizáveis: `Campo`, `Select`, `Segmented`, `SeletorSecao`, `LinhaMacro`, `Icone`, `Cabecalho`.

## Refeições-modelo (lote 3)
- Refeição = nome + etiqueta (momento do dia) + itens. Etiquetas em `ETIQUETAS` (6, com ordem cronológica): café da manhã, lanche da manhã, almoço, lanche da tarde, jantar, ceia.
- **Funções (em `window.FuelEngine`):** `todasRefeicoes()`, `obterRefeicao(id)`, `criarRefeicao(dados)`, `editarRefeicao(id, campos)`, `excluirRefeicao(id)`, `duplicarRefeicao(id)`, `macrosItem(item)`, `macrosRefeicao(ref)`, `filtrarAlimentos(busca, cat)`.
- Item guarda `gramas` (fonte da verdade) + `medida` (rótulo). Macros recalculados sempre a partir de `obterAlimento`. Auto-save: refeição é persistida ao criar; se sair vazia (sem nome e sem itens), é descartada.

## Banco de alimentos (lote 2)
- **Semente:** Tabela TACO (NEPA/UNICAMP), 597 alimentos, 15 categorias, só os 4 macros por 100 g. 15 buracos da fonte foram preenchidos (óleos = gordura pura; leites e poucos itens com valores de referência; sal/álcool determinados). 111 alimentos comuns já vêm com porções caseiras (concha, colher, fatia, unidade, copo…).
- **Funções (em `window.FuelEngine`):** `todosAlimentos()`, `obterAlimento(id)`, `criarAlimento(dados)`, `editarAlimento(id, campos)`, `excluirAlimento(id)`, `porcoesDe(id)`, `salvarPorcoes(id, lista)`, `categorias()`, `norm(s)` (busca sem acento).
- **Unidade:** tudo em gramas; líquidos entram como porção ("1 copo (200 g)"). Base sempre 100 g.

## Identidade visual
- Fundo `#FAFAF7`, cartão `#FFFFFF`, texto `#1E2A24`, secundário `#6B7770`, linha `#ECEFEC`.
- Marca `#3FA968` / escuro `#2C6E49`.
- Macros (fixos): proteína `#E5645E`, carbo `#E0A23B`, gordura `#4C9BD6`.
- Cantos 12–16px, sombras suaves, sem emojis, ícones de linha (Feather).

## Fluxo de deploy
- Editar (geralmente só `app.js`) → validar no Babel **classic** → smoke test jsdom +
  unitários do motor → **incrementar CACHE_VERSION** → publicar via API do GitHub →
  aguardar o workflow concluir → reabrir o app (às vezes 2x) para o cache novo assumir.

## Próximos lotes (planejados)
4. Semana genérica (segunda–domingo que repete) + Dia com o anel de calorias e slots por momento; refeições-modelo entram nos dias; cópia editável por dia + "salvar no modelo".
5. Backup separado por tipo (alimentos+receitas vs. plano).
Futuro: nuvem (Firebase, offline-first), micronutrientes, USDA/API externa de tabela nutricional.
