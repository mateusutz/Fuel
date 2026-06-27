# Fuel — Documento de Referência

Referência técnica viva do app. Atualizar a cada mudança estrutural (formato de
dado, nova chave de storage, nova dependência, mudança de deploy, novo recurso).

## Estado atual
- **Lote concluído:** 1 (esqueleto + Perfil + motor de cálculo).
- **CACHE_VERSION atual:** `fuel-v1` (em `sw.js`).
- **Hospedagem:** GitHub Pages em `mateusutz.github.io/Fuel/` (subcaminho → todos os caminhos são relativos).
- **Persistência:** localStorage, via `storeGet`/`storeSet`, namespace `fuel:`.

## Arquivos
- `index.html` — carrega React 18 UMD, Babel standalone (classic) e `app.js`; registra o SW.
- `app.js` — app inteiro (dados, motor, componentes, telas). Único arquivo.
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
- `TelaEmBreve` — placeholder de Semana e Biblioteca (próximos lotes).
- `CardMetas` + `AnelMacros` — exibição da meta; **anel de macros = assinatura visual**.
- `EditorManual` — sobrescreve metas à mão.
- `CardBackup` — exportar/importar JSON.
- Reutilizáveis: `Campo`, `Select`, `Segmented`, `LinhaMacro`, `Icone`.

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
2. Banco de alimentos (semente TACO/USDA + cadastro próprio, porções customizadas).
3. Refeições-modelo (biblioteca reutilizável).
4. Semana genérica + Dia com o anel de calorias; cópia editável + "salvar no modelo".
5. Backup separado por tipo (alimentos+receitas vs. plano).
Futuro: nuvem (Firebase, offline-first), micronutrientes, API externa de tabela nutricional.
