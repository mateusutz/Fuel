# Fuel — Documento de Referência

Referência técnica viva do app. Atualizar a cada mudança estrutural (formato de
dado, nova chave de storage, nova dependência, mudança de deploy, novo recurso).

## Estado atual
- **Lote concluído:** 13 (Forge Design System oficial: superfícies grafite-azulado + acento verde; BrandMark folha; LoginScreen com vínculo Google-senha; + proteção de privacidade na troca de conta).
- **CACHE_VERSION atual:** `fuel-v13` (em `sw.js`).
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
- Fontes Google: Barlow Condensed (números/títulos) e Inter (corpo); fallback de sistema offline.

## Modelo de dados (chaves de storage)
Prefixo `fuel:` em todas. Hoje:
- `perfil` — objeto cru do formulário (strings dos inputs):
  `{ _v, sexo:'M'|'F', nascimento:'YYYY-MM-DD', idade(legado), altura, peso, gorduraPct, atividade, objetivo, ritmo }` — a idade usada no cálculo é derivada de `nascimento` (via `calcularIdade`); `idade` é só legado. Migração: quem só tinha `idade` recebe um `nascimento` estimado (1º de janeiro do ano).
  - `_v` = versão do schema (atual: 1). Migração silenciosa em `migrarPerfil()`.
  - Campos numéricos guardados como string; convertidos por `normalizarPerfil()`.
- `metasManuais` — `null` ou objeto de metas sobrescritas à mão (`manual: true`).
- `abaAtiva` — `'semana' | 'biblioteca' | 'perfil'`.
- **Alimentos (lote 2) — modelo delta/override.** A semente (`window.FUEL_TACO`) é read-only e vive em `dados-taco.js`; o storage guarda só o que o usuário cria ou altera:
  - `alimentosUsuario` — array de alimentos próprios: `{ id:'u-<ts>', nome, cat, kcal, prot, carbo, gord, criadoEm }` (valores por 100 g).
  - `alimentosOverride` — `{ '<id>': { campos editados…, oculto?:true } }`. Só para ids `taco-*`. Editar um item da TACO grava um override; "remover" grava `oculto:true` (reversível via backup).
  - `porcoes` — `{ '<alimentoId>': [ {id, rotulo, g} ] }`. Materializa só quando o usuário edita as porções daquele alimento; senão usa `FUEL_PORCOES` da semente.
- **Refeições-modelo (lote 3):**
  - `refeicoes` — array: `{ id:'r-<uid>', nome, etiquetas:[…], itens:[…], criadoEm }`. `etiquetas` é um array de momentos (lote 8: múltipla escolha); cada momento ∈ `cafe|lanche_manha|almoco|lanche|jantar|ceia`. Migração silenciosa na leitura (`todasRefeicoes`): `etiqueta` (string, legado) → `etiquetas` (array). Na biblioteca a refeição aparece em todos os seus momentos; no dia, a cópia ocupa só `etiquetas[0]` (o momento do slot onde foi adicionada).
    - Item: `{ id:'i-<uid>', alimentoId, gramas, medida }`. `gramas` é a verdade; `medida` é o rótulo amigável ("2× concha média" ou "150 g"). Macros derivados do alimento atual (sempre em dia).
    - **Cópias de dia (lote 4):** uma refeição em `refeicoes` pode ter `efemera:true` e `modeloId`. É a cópia que vive dentro de um dia — não aparece na biblioteca (filtrada por `refeicoesModelo()`) e é coletada como lixo se nenhum dia a referencia.
  - `bibliotecaSecao` — `'alimentos' | 'refeicoes'` (seção ativa da aba Biblioteca).
- **Semana e Dia (lote 4):**
  - `semana` — `{ dias: { seg:[refId…], ter:[…], qua, qui, sex, sab, dom } }`. Semana genérica que se repete; cada dia guarda **ids** de refeições (as cópias). 7 dias em `DIAS`; momentos sempre visíveis em `MOMENTOS_PRINCIPAIS` (café, almoço, lanche, jantar).
  - **Ids únicos:** todos os ids (`u-/r-/i-/p-`) são gerados por `uid(prefixo)` = `Date.now()` em base36 + contador, evitando colisões em ações rápidas (bug do `Date.now()` puro corrigido no lote 4).

Backup (`exportarBackup`/`importarBackup`): exporta `{ app, schema, exportadoEm, dados:{...todas as chaves...} }`.

## Motor de cálculo (em `app.js`, exposto em `window.FuelEngine`)
1. **BMR** — Mifflin-St Jeor: `10·peso + 6,25·altura − 5·idade (+5 H / −161 M)` (idade derivada da data de nascimento).
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
- `App` — navegação inferior (4 abas: Hoje, Semana, Biblioteca, Perfil; padrão **Hoje**) + roteamento simples por estado; limpa cópias órfãs ao iniciar.
- `TelaPerfil` — formulário, cálculo reativo, edição manual, backup.
- `CardMetas` + `AnelMacros` — exibição da meta; **anel de macros = assinatura visual** (reaproveitado no detalhe do alimento, no total da refeição e no resumo do dia).
- `EditorManual` — sobrescreve metas à mão.
- `CardBackup` — exportar/importar JSON.
- **Biblioteca (lote 2):** `TelaBiblioteca` (wrapper, alterna seção via `SeletorSecao`), `PainelAlimentos` (lista→detalhe→form), `ListaAlimentos`, `ItemAlimento`, `TelaDetalhe`, `FormAlimento`, `FormPorcao`.
- **Refeições (lote 3 + 4):** `PainelRefeicoes` (biblioteca), `ListaRefeicoes` (só modelos, agrupada por etiqueta), `ItemRefeicaoCard`, `SeletorAlimento`, `SeletorQuantidade` (porção × quantidade ou gramas). O `SeletorAlimento` permite **cadastrar um alimento novo na hora** (lote 9): abre o `FormAlimento` com o nome já preenchido pela busca e, ao salvar, o novo alimento entra direto no fluxo de quantidade. O editor foi refatorado: `TelaRefeicao` agora recebe `acoes` (lista de botões `{label,onClick,danger,confirmar}`) e `titulo`; `RefeicaoEditor` encapsula a navegação editar→escolher alimento→quantidade e opera por id — **reutilizado pela biblioteca e pelo dia**.
- **Semana e Dia (lote 4):** `PainelSemana` (lista↔dia↔compras), `TelaSemana` (7 cards com kcal e barra vs. meta), `PainelDia` (dia↔escolher modelo↔editar cópia↔copiar), `TelaDia` (resumo + momentos com "+ adicionar"; aceita `titulo`/`subtitulo` e `onVoltar` opcional), `CardResumoDia` (anel do dia + barras vs. meta + texto No alvo/Faltam/acima), `TelaEscolherModelo` (modelos do momento + montar na hora), `LinhaMacroMeta` (barra consumido/meta).
- **Aba Hoje (lote 10):** `PainelHoje` reutiliza o `PainelDia` apontando para o dia da semana atual (sem botão voltar, título "Hoje" + data por extenso). `diaDeHojeId()` mapeia `new Date().getDay()` → id de `DIAS`; `dataHojeRotulo()` monta "Domingo, 28 de junho". É a aba de entrada (padrão), pensada para virar a landing pós-login.
- Reutilizáveis: `Campo`, `Select`, `Segmented`, `SeletorSecao`, `LinhaMacro`, `Icone`, `Cabecalho`.

## Refeições-modelo (lote 3)
- Refeição = nome + etiqueta (momento do dia) + itens. Etiquetas em `ETIQUETAS` (6, com ordem cronológica): café da manhã, lanche da manhã, almoço, lanche da tarde, jantar, ceia.
- **Funções (em `window.FuelEngine`):** `todasRefeicoes()`, `obterRefeicao(id)`, `criarRefeicao(dados)`, `editarRefeicao(id, campos)`, `excluirRefeicao(id)`, `duplicarRefeicao(id)`, `macrosItem(item)`, `macrosRefeicao(ref)`, `filtrarAlimentos(busca, cat)`.
- Item guarda `gramas` (fonte da verdade) + `medida` (rótulo). Macros recalculados sempre a partir de `obterAlimento`. Auto-save: refeição é persistida ao criar; se sair vazia (sem nome e sem itens), é descartada.

## Banco de alimentos (lote 2)
- **Semente:** Tabela TACO (NEPA/UNICAMP), 597 alimentos, 15 categorias, só os 4 macros por 100 g. 15 buracos da fonte foram preenchidos (óleos = gordura pura; leites e poucos itens com valores de referência; sal/álcool determinados). 111 alimentos comuns já vêm com porções caseiras (concha, colher, fatia, unidade, copo…).
- **Funções (em `window.FuelEngine`):** `todosAlimentos()`, `obterAlimento(id)`, `criarAlimento(dados)`, `editarAlimento(id, campos)`, `excluirAlimento(id)`, `porcoesDe(id)`, `salvarPorcoes(id, lista)`, `categorias()`, `norm(s)` (busca sem acento).
- **Unidade:** tudo em gramas; líquidos entram como porção ("1 copo (200 g)"). Base sempre 100 g.

## Identidade visual (lote 11 — tema escuro, design system do app Forge)
- **Tema ESCURO** com alma verde do Fuel. Tokens centrais em `C` (app.js):
  - Fundo `#0E1411` (verde-carvão), cartão `#18211C`, superfície `#1E2823`, campo `#121A16`.
  - Texto `#ECEFEA`, secundário `#8B968D`, linha `#273330`, trilho `#222C27`.
  - Marca `#5BC487` / texto-marca `#6FD198` / sobre-marca `#08130C`.
  - Macros (fixos, clareados p/ o dark): proteína `#EC7A74`, carbo `#E8B45A`, gordura `#6BB0E0`.
  - Semânticos: `toggleOn`, `chipBg`, `danger`/`dangerBtn`/`dangerBorder`, `warnBg`/`warnBorder`/`warnText`, `navBg`.
- **Tipografia:** Barlow Condensed (700/800, CAIXA ALTA, `tabular-nums`) em títulos/números via `DISPLAY`; Inter no corpo. Carregadas no `index.html`.
- **Linguagem do Forge:** elevação por **borda** (não sombra) — cards são `card` + `1px solid line`; cantos mais retos (9–12px); labels/seções em CAIXA ALTA com `letter-spacing`; header com borda inferior; números grandes em destaque. Anel de macros (assinatura) mantido. Ícones de linha (Feather).
- `index.html`/`manifest.json`: `theme-color`/background `#0E1411`, status bar translúcida.
- **Toda a lógica e o modelo de dados são os mesmos** — o lote 11 mexeu só na "pele" (tokens `C`, estilos `S`, fontes, e cores antes hardcoded migradas para `C`).

## Identidade visual (lote 13 — Forge Design System oficial)
- Segue o **Forge Design System** (arquivos `FORGE_DESIGN_SYSTEM.md` + `forge-design-system.js`). Variação de tema irmão: **superfícies grafite-azulado do Forge + acento VERDE do Fuel** (decisão do Mateus). Macros preservados.
- Tokens em `C` (espelham `T` do DS): fundo `#0B0F19`, card `#161E2E`, elevado/`surface` `#1B2536`, painel `#121215`, borda `#2A3344`, borda de input `#2E3A4D`. Texto `#f0f0f2` / muted `#9a9aa2` / dim `#7a7a82` (`ink3`) / faint `#6a6a72` / dimmer `#5a5a62`.
- Acento `ACCENT = #2FBF6E` (verde-folha); `onBrand` via helper **`onColor(hex)`** (contraste automático por luminância). Semânticas: success `#10B981`, warning `#F59E0B`, danger `#e36a5a`. Macros (fixos): proteína `#EC7A74`, carbo `#E8B45A`, gordura `#6BB0E0`.
- **Tipografia:** Barlow Condensed (700, uppercase, `letterSpacing 0.5`) em títulos/logo/números; Inter (400–800) no corpo.
- **Raios:** card 14, painel 18, input 10, botão 11, chips 7–8, pills 999. Largura máx **480**. Elevação por borda (sem sombra).
- **Componentes de assinatura:** `BrandMark` (símbolo do Fuel = folha SVG verde), `Ring` (anel), `TelaCarregando` (marca pulsando no anel girando), `LoginScreen` oficial (Google + e-mail/senha + **vínculo guiado Google↔senha** + reset). Nav inferior `navBtn` (aba ativa com borda superior no acento).
- **Animações** no `index.html`: `fds-spin`, `fds-pulse`, `fds-dots`, foco verde, e `prefers-reduced-motion`. `index.html`/`manifest`: tema/fundo `#0B0F19`.
- Para trocar o símbolo: editar o componente `BrandMark`. Para trocar o acento: a constante `ACCENT`.

## Nuvem e login (lote 12 — Firebase, modelo do app Forge)
- **Firebase exclusivo do Fuel** (projeto `fuel-14edd`), compat 10.12.2 via CDN no `index.html` (app+auth+firestore), com `enablePersistence({synchronizeTabs:true})`. Expõe `window.fbAuth` e `window.fbDb`. Config é pública (protegida pelas Security Rules).
- **Login obrigatório** (Google + e-mail/senha + recuperar senha). O app abre no `LoginScreen` (identidade Fuel: dark, Barlow, verde). `traduzErroAuth()` traduz os códigos do Firebase.
- **Gate** no `App`: `authReady`/`authUser`(undefined=verificando)/`dadosCarregados`. `onAuthStateChanged` → `setCurrentUid`. Ao logar, `await carregarTudoDaNuvem()` baixa o estado da nuvem **antes** de liberar o app (tela "Sincronizando…"). Sem `window.fbAuth` (raro), roda local para não travar.
- **Camada de storage:** `storeGet` permanece **síncrono** (lê o cache local — leitura rápida, offline). `storeSet` grava local **e** espelha na nuvem (`nuvemSet`, assíncrono) para as `CHAVES_SYNC` (`perfil, metasManuais, refeicoes, semana, alimentosUsuario, alimentosOverride, porcoes`); prefs de navegação ficam locais. Dados na nuvem em `users/{uid}/state/{chave}` (doc `{value, atualizadoEm}`).
- **Migração sem perda:** no 1º login, se a nuvem está vazia, `carregarTudoDaNuvem` **sobe** os dados locais existentes. Se a nuvem tem dados, ela é a fonte (sobrescreve o local). `limparLocalSync()` (no logout) remove as chaves de conteúdo do cache local, preservando navegação.
- **Security Rules** (colar no console do Firestore): acesso a `users/{uid}/**` só quando `request.auth.uid == uid`.
- **Teste:** a camada de sync tem teste com Firestore simulado (bloco [16]); o fluxo real de auth só é validável no app publicado (jsdom não roda o Firebase real — o gate degrada para local).

## Fluxo de deploy
- Editar (geralmente só `app.js`) → validar no Babel **classic** → smoke test jsdom +
  unitários do motor → **incrementar CACHE_VERSION** → publicar via API do GitHub →
  aguardar o workflow concluir → reabrir o app (às vezes 2x) para o cache novo assumir.

## Semana e Dia (lote 4)
- Semana genérica de 7 dias (`DIAS`: seg…dom) que se repete — sem datas reais; é o molde semanal.
- Cada dia mostra os momentos sempre à mostra (`MOMENTOS_PRINCIPAIS`) + os usados, cada um com "+ adicionar". Adicionar = puxar um modelo (vira **cópia** editável só naquele dia) ou montar na hora. Editar a cópia não afeta o modelo; "salvar no/como modelo" propaga.
- O resumo do dia (`CardResumoDia`) traz o anel de calorias do dia vs. meta do Perfil + barras de macro vs. metas.
- **Funções (em `window.FuelEngine`):** `refeicoesModelo()`, `idsDoDia(diaId)`, `refeicoesDoDia(diaId)`, `adicionarRefeicaoAoDia(diaId, etiqueta, modeloId?)`, `removerRefeicaoDoDia(diaId, refId)`, `salvarCopiaNoModelo(copiaId)`, `macrosDoDia(diaId)`, `limparCopiasOrfas()`, `metasAtuais()` (metas manuais, ou do perfil, ou `null`).
- **Copiar dia (lote 5):** `copiarDiaPara(origemId, [destinos])` substitui o conteúdo de cada dia destino por cópias **independentes** do dia origem (ids novos, `modeloId` preservado; o destino é limpo antes). `clonarRefeicaoComoCopia(refId)` duplica uma cópia em outra cópia efêmera independente. UI: botão "Copiar este dia para outros dias" na `TelaDia` → `TelaCopiarDia` (multi-seleção dos outros 6 dias, "Selecionar todos", confirmação quando há destinos não-vazios).
- **Lista de compras (lote 6):** `listaDeCompras(diasSel?)` agrega as gramas por alimento em todos os dias (ou nos `diasSel`) e agrupa por categoria, na ordem de `FUEL_TACO_CATS`. `qtdCompra(alimento, gramas)` escolhe a medida natural: unidades/fatias (porção contável com "unidade"/"fatia"), litros/ml (líquidos: categoria Bebidas, porção em copo/ml, ou nome de líquido comum), senão kg/g; devolve `{ principal, sub }` (sub = peso exato em g, só para itens contáveis). `listaComprasTexto(diasSel?)` gera o texto para copiar. `fmtMil(n)` formata com separador de milhar pt-BR. UI: botão "Lista de compras" no topo da `TelaSemana` → `TelaCompras` (agrupada por categoria, itens marcáveis como "pego", botão "Copiar lista" via `navigator.clipboard`). Marcação é só de sessão (não persiste).

## Próximos lotes (planejados)
11. Backup separado por tipo (alimentos+receitas vs. plano).
Futuro: nuvem (Firebase, offline-first), micronutrientes, USDA/API externa de tabela nutricional, registro do consumo real.
