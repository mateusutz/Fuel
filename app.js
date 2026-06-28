/* Fuel — app.js
   App de nutrição (PWA, sem etapa de build). React 18 UMD + Babel classic.
   Lote 1: navegação, dados (storeGet/storeSet), motor de cálculo, Perfil.
   Lote 2: Biblioteca de alimentos (semente TACO + cadastro próprio + porções).
   Todo o app vive neste arquivo; os dados da TACO ficam em dados-taco.js. */
(function () {
  'use strict';

  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;

  /* ============================================================
     CAMADA DE DADOS — todo acesso a storage passa por aqui.
     ============================================================ */
  var NS = 'fuel:';
  function storeGet(key, fallback) {
    try { var raw = localStorage.getItem(NS + key); if (raw == null) return fallback; return JSON.parse(raw); }
    catch (e) { return fallback; }
  }
  function storeSet(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function storeColetarTudo() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(NS) === 0) out[k.slice(NS.length)] = JSON.parse(localStorage.getItem(k));
      }
    } catch (e) {}
    return out;
  }

  /* ============================================================
     UTILIDADES
     ============================================================ */
  function parseNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (v == null) return NaN;
    var s = String(v).trim().replace(/\s/g, '').replace(',', '.');
    if (s === '') return NaN;
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }
  function norm(s) { return (s == null ? '' : String(s)).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function fmt(n) { // número curto, vírgula decimal, sem zeros à toa
    if (n == null || isNaN(n)) return '0';
    var r = Math.round(n * 10) / 10;
    return (Number.isInteger(r) ? r.toString() : r.toFixed(1)).replace('.', ',');
  }
  var _uidSeq = 0;
  function uid(p) { _uidSeq++; return p + Date.now().toString(36) + _uidSeq.toString(36); }

  /* ============================================================
     MOTOR DE CÁLCULO (lote 1)
     ============================================================ */
  var ATIVIDADE = {
    sedentario: { fator: 1.2,   rotulo: 'Sedentário',    desc: 'Pouco ou nenhum exercício' },
    leve:       { fator: 1.375, rotulo: 'Leve',          desc: 'Exercício leve 1–3x/semana' },
    moderado:   { fator: 1.55,  rotulo: 'Moderado',      desc: 'Exercício moderado 3–5x/semana' },
    intenso:    { fator: 1.725, rotulo: 'Intenso',       desc: 'Exercício intenso 6–7x/semana' },
    muito:      { fator: 1.9,   rotulo: 'Muito intenso', desc: 'Atleta ou trabalho físico pesado' }
  };
  var OBJETIVOS = {
    perder: { rotulo: 'Perder gordura', usaRitmo: true,                 protGkg: 2.2, fatPct: 0.25 },
    manter: { rotulo: 'Manter',         usaRitmo: false, fatorCal: 0,    protGkg: 1.6, fatPct: 0.28 },
    ganhar: { rotulo: 'Ganhar massa',   usaRitmo: false, fatorCal: 0.10, protGkg: 1.8, fatPct: 0.25 },
    recomp: { rotulo: 'Recomposição',   usaRitmo: false, fatorCal: -0.05, protGkg: 2.2, fatPct: 0.28 }
  };
  var RITMOS = {
    conservador: { rotulo: 'Conservador', fatorCal: -0.10 },
    moderado:    { rotulo: 'Moderado',    fatorCal: -0.18 },
    agressivo:   { rotulo: 'Agressivo',   fatorCal: -0.25 }
  };
  var PISO_KCAL = { M: 1500, F: 1200 };
  var PROT_MIN_GKG = 1.6, FAT_MIN_GKG = 0.6;

  function calcularBMR(p) { var b = 10 * p.peso + 6.25 * p.altura - 5 * p.idade; return p.sexo === 'F' ? b - 161 : b + 5; }
  function calcularIdade(iso, ref) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return NaN;
    var by = +m[1], bm = +m[2], bd = +m[3], hy, hm, hd;
    var r = ref ? String(ref).match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
    if (r) { hy = +r[1]; hm = +r[2]; hd = +r[3]; } else { var n = new Date(); hy = n.getFullYear(); hm = n.getMonth() + 1; hd = n.getDate(); }
    var idade = hy - by;
    if (hm < bm || (hm === bm && hd < bd)) idade--;
    return idade;
  }
  function hojeISO() { var n = new Date(), p = function (x) { return String(x).padStart(2, '0'); }; return n.getFullYear() + '-' + p(n.getMonth() + 1) + '-' + p(n.getDate()); }
  function fatorAtividade(c) { return (ATIVIDADE[c] || ATIVIDADE.moderado).fator; }
  function calcularTDEE(p) { return calcularBMR(p) * fatorAtividade(p.atividade); }
  function massaMagra(p) {
    if (p.gorduraPct == null || isNaN(p.gorduraPct)) return null;
    if (p.gorduraPct <= 0 || p.gorduraPct >= 70) return null;
    return p.peso * (1 - p.gorduraPct / 100);
  }
  function calcularMetas(p) {
    var avisos = [], bmr = calcularBMR(p), tdee = calcularTDEE(p);
    var obj = OBJETIVOS[p.objetivo] || OBJETIVOS.manter;
    var fatorCal = obj.usaRitmo ? (RITMOS[p.ritmo] || RITMOS.moderado).fatorCal : obj.fatorCal;
    var kcal = tdee * (1 + fatorCal);
    var piso = PISO_KCAL[p.sexo] || 1300;
    if (kcal < piso) { kcal = piso; avisos.push('Meta ajustada para o piso seguro de ' + piso + ' kcal. Para algo mais agressivo, procure um nutricionista.'); }
    kcal = Math.round(kcal);
    var mm = massaMagra(p), baseProt = mm != null ? mm : p.peso, baseLabel = mm != null ? 'massa magra' : 'peso total';
    var proteinaG = obj.protGkg * baseProt, gorduraG = (obj.fatPct * kcal) / 9;
    var fatFloor = FAT_MIN_GKG * p.peso; if (gorduraG < fatFloor) gorduraG = fatFloor;
    var protKcal = proteinaG * 4, fatKcal = gorduraG * 9, carboKcal = kcal - protKcal - fatKcal;
    if (carboKcal < 0) { var mf = fatFloor * 9; fatKcal = Math.max(mf, fatKcal + carboKcal); gorduraG = fatKcal / 9; carboKcal = kcal - protKcal - fatKcal; }
    if (carboKcal < 0) { var mp = PROT_MIN_GKG * baseProt * 4; protKcal = Math.max(mp, protKcal + carboKcal); proteinaG = protKcal / 4; carboKcal = kcal - protKcal - fatKcal; avisos.push('Proteína e gordura quase esgotam as calorias desta meta. Ajuste manualmente se quiser.'); }
    if (carboKcal < 0) carboKcal = 0;
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal: kcal, proteinaG: Math.round(proteinaG), carboG: Math.round(carboKcal / 4), gorduraG: Math.round(gorduraG), protKcal: Math.round(protKcal), carboKcal: Math.round(carboKcal), fatKcal: Math.round(fatKcal), baseProteina: baseLabel, avisos: avisos, manual: false };
  }

  /* ============================================================
     CAMADA DE DADOS — ALIMENTOS (lote 2)
     A semente (window.FUEL_TACO / FUEL_PORCOES) é read-only e vive no arquivo
     de dados. O storage guarda só o que o usuário cria ou altera (deltas).
     ============================================================ */
  function _seed() { return (typeof window !== 'undefined' && window.FUEL_TACO) ? window.FUEL_TACO : []; }
  function _seedPorc() { return (typeof window !== 'undefined' && window.FUEL_PORCOES) ? window.FUEL_PORCOES : {}; }
  function categorias() { return (typeof window !== 'undefined' && window.FUEL_TACO_CATS) ? window.FUEL_TACO_CATS : []; }
  function _overrides() { return storeGet('alimentosOverride', {}); }
  function _usuario() { return storeGet('alimentosUsuario', []); }

  function todosAlimentos() {
    var ov = _overrides();
    var base = _seed().filter(function (a) { var o = ov[a.id]; return !(o && o.oculto); })
      .map(function (a) { var o = ov[a.id]; return o ? Object.assign({}, a, o, { origem: 'taco' }) : Object.assign({}, a, { origem: 'taco' }); });
    var us = _usuario().map(function (a) { return Object.assign({}, a, { origem: 'usuario' }); });
    return base.concat(us);
  }
  function obterAlimento(id) {
    if (!id) return null;
    if (id.indexOf('u-') === 0) { var u = _usuario().filter(function (a) { return a.id === id; })[0]; return u ? Object.assign({}, u, { origem: 'usuario' }) : null; }
    var a = _seed().filter(function (x) { return x.id === id; })[0]; if (!a) return null;
    var o = _overrides()[id]; if (o && o.oculto) return null;
    return o ? Object.assign({}, a, o, { origem: 'taco' }) : Object.assign({}, a, { origem: 'taco' });
  }
  function criarAlimento(dados) {
    var us = _usuario(); var id = uid('u-');
    us.push(Object.assign({ id: id, criadoEm: Date.now() }, dados)); storeSet('alimentosUsuario', us); return id;
  }
  function editarAlimento(id, campos) {
    if (id.indexOf('u-') === 0) {
      var us = _usuario(); for (var i = 0; i < us.length; i++) if (us[i].id === id) { us[i] = Object.assign({}, us[i], campos); break; }
      storeSet('alimentosUsuario', us);
    } else { var ov = _overrides(); ov[id] = Object.assign({}, ov[id], campos); storeSet('alimentosOverride', ov); }
  }
  function excluirAlimento(id) {
    if (id.indexOf('u-') === 0) { storeSet('alimentosUsuario', _usuario().filter(function (a) { return a.id !== id; })); }
    else { var ov = _overrides(); ov[id] = Object.assign({}, ov[id], { oculto: true }); storeSet('alimentosOverride', ov); }
  }
  function porcoesDe(id) {
    var p = storeGet('porcoes', {});
    if (p[id]) return p[id];
    var sem = _seedPorc()[id] || [];
    return sem.map(function (x, i) { return { id: 's' + i, rotulo: x.rotulo, g: x.g }; });
  }
  function salvarPorcoes(id, lista) { var p = storeGet('porcoes', {}); p[id] = lista; storeSet('porcoes', p); }

  function filtrarAlimentos(busca, cat) {
    var nb = norm((busca || '').trim());
    var arr = todosAlimentos().filter(function (a) {
      if (cat && cat !== 'todas' && a.cat !== cat) return false;
      if (nb && norm(a.nome).indexOf(nb) < 0) return false;
      return true;
    });
    arr.sort(function (x, y) { return norm(x.nome) < norm(y.nome) ? -1 : 1; });
    return arr;
  }

  /* ============================================================
     CAMADA DE DADOS — REFEIÇÕES-MODELO (lote 3)
     Uma refeição = nome + etiquetas (momentos do dia) + itens.
     Item = { id, alimentoId, gramas, medida }. gramas é a verdade;
     os macros são derivados do alimento atual (ficam sempre em dia).
     ============================================================ */
  var ETIQUETAS = [
    { id: 'cafe', rotulo: 'Café da manhã', ordem: 1 },
    { id: 'lanche_manha', rotulo: 'Lanche da manhã', ordem: 2 },
    { id: 'almoco', rotulo: 'Almoço', ordem: 3 },
    { id: 'lanche', rotulo: 'Lanche da tarde', ordem: 4 },
    { id: 'jantar', rotulo: 'Jantar', ordem: 5 },
    { id: 'ceia', rotulo: 'Ceia', ordem: 6 }
  ];
  function etiquetaRotulo(id) { for (var i = 0; i < ETIQUETAS.length; i++) if (ETIQUETAS[i].id === id) return ETIQUETAS[i].rotulo; return ''; }
  function etiquetaOrdem(id) { for (var i = 0; i < ETIQUETAS.length; i++) if (ETIQUETAS[i].id === id) return ETIQUETAS[i].ordem; return 99; }

  function todasRefeicoes() {
    var rs = storeGet('refeicoes', []);
    return rs.map(function (r) {
      if (Array.isArray(r.etiquetas)) return r;
      var n = Object.assign({}, r, { etiquetas: r.etiqueta ? [r.etiqueta] : [] }); delete n.etiqueta; return n; // migração etiqueta→etiquetas
    });
  }
  function obterRefeicao(id) { var r = todasRefeicoes().filter(function (x) { return x.id === id; })[0]; return r || null; }
  function criarRefeicao(dados) {
    dados = dados || {};
    var rs = todasRefeicoes(); var id = uid('r-');
    var etiquetas = Array.isArray(dados.etiquetas) ? dados.etiquetas : (dados.etiqueta ? [dados.etiqueta] : []);
    var base = Object.assign({ id: id, nome: '', itens: [], criadoEm: Date.now() }, dados, { etiquetas: etiquetas });
    delete base.etiqueta;
    rs.push(base); storeSet('refeicoes', rs); return id;
  }
  function editarRefeicao(id, campos) {
    var rs = todasRefeicoes(); for (var i = 0; i < rs.length; i++) if (rs[i].id === id) { rs[i] = Object.assign({}, rs[i], campos); break; }
    storeSet('refeicoes', rs);
  }
  function excluirRefeicao(id) { storeSet('refeicoes', todasRefeicoes().filter(function (r) { return r.id !== id; })); }
  function duplicarRefeicao(id) {
    var r = obterRefeicao(id); if (!r) return null;
    var copia = JSON.parse(JSON.stringify(r));
    copia.id = uid('r-'); copia.criadoEm = Date.now();
    copia.nome = (r.nome || 'Refeição') + ' (cópia)';
    copia.itens = (copia.itens || []).map(function (it, i) { return Object.assign({}, it, { id: uid('i-') + '-' + i }); });
    var rs = todasRefeicoes(); rs.push(copia); storeSet('refeicoes', rs); return copia.id;
  }
  function macrosItem(item) {
    var a = obterAlimento(item.alimentoId); if (!a) return { kcal: 0, prot: 0, carbo: 0, gord: 0, faltando: true };
    var f = (item.gramas || 0) / 100;
    return { kcal: a.kcal * f, prot: (a.prot || 0) * f, carbo: (a.carbo || 0) * f, gord: (a.gord || 0) * f, faltando: false };
  }
  function macrosRefeicao(ref) {
    var t = { kcal: 0, prot: 0, carbo: 0, gord: 0 };
    ((ref && ref.itens) || []).forEach(function (it) { var m = macrosItem(it); t.kcal += m.kcal; t.prot += m.prot; t.carbo += m.carbo; t.gord += m.gord; });
    return { kcal: Math.round(t.kcal), prot: Math.round(t.prot * 10) / 10, carbo: Math.round(t.carbo * 10) / 10, gord: Math.round(t.gord * 10) / 10 };
  }
  function refeicoesModelo() { return todasRefeicoes().filter(function (r) { return !r.efemera; }); }

  /* ============================================================
     CAMADA DE DADOS — SEMANA E DIA (lote 4)
     Semana genérica: 7 dias que se repetem. Cada dia guarda uma lista de
     IDs de refeições. Ao puxar um modelo para o dia, criamos uma CÓPIA
     (efemera:true, modeloId) — editável só naquele dia. "Salvar no modelo"
     propaga de volta. Cópias órfãs são limpas na carga.
     ============================================================ */
  var DIAS = [
    { id: 'seg', rotulo: 'Segunda', curto: 'Seg' }, { id: 'ter', rotulo: 'Terça', curto: 'Ter' },
    { id: 'qua', rotulo: 'Quarta', curto: 'Qua' }, { id: 'qui', rotulo: 'Quinta', curto: 'Qui' },
    { id: 'sex', rotulo: 'Sexta', curto: 'Sex' }, { id: 'sab', rotulo: 'Sábado', curto: 'Sáb' },
    { id: 'dom', rotulo: 'Domingo', curto: 'Dom' }
  ];
  var MOMENTOS_PRINCIPAIS = ['cafe', 'almoco', 'lanche', 'jantar'];

  function semanaDados() { var s = storeGet('semana', null); if (!s || typeof s !== 'object') s = { dias: {} }; if (!s.dias) s.dias = {}; return s; }
  function idsDoDia(diaId) { return semanaDados().dias[diaId] || []; }
  function setIdsDoDia(diaId, ids) { var s = semanaDados(); s.dias[diaId] = ids; storeSet('semana', s); }
  function refeicoesDoDia(diaId) { return idsDoDia(diaId).map(obterRefeicao).filter(Boolean); }

  function duplicarComoCopia(modeloId, etiqueta) {
    var m = obterRefeicao(modeloId); if (!m) return null;
    var c = JSON.parse(JSON.stringify(m));
    c.id = uid('r-'); c.criadoEm = Date.now(); c.efemera = true; c.modeloId = modeloId;
    c.etiquetas = etiqueta ? [etiqueta] : (Array.isArray(m.etiquetas) ? m.etiquetas.slice() : []);
    delete c.etiqueta;
    c.itens = (c.itens || []).map(function (it, i) { return Object.assign({}, it, { id: uid('i-') + '-' + i }); });
    var rs = todasRefeicoes(); rs.push(c); storeSet('refeicoes', rs); return c.id;
  }
  function adicionarRefeicaoAoDia(diaId, etiqueta, modeloId) {
    var novo = modeloId ? duplicarComoCopia(modeloId, etiqueta) : criarRefeicao({ etiquetas: etiqueta ? [etiqueta] : [], efemera: true });
    var ids = idsDoDia(diaId).slice(); ids.push(novo); setIdsDoDia(diaId, ids); return novo;
  }
  function removerRefeicaoDoDia(diaId, refId) {
    setIdsDoDia(diaId, idsDoDia(diaId).filter(function (x) { return x !== refId; }));
    excluirRefeicao(refId);
  }
  function clonarRefeicaoComoCopia(refId) {
    var r = obterRefeicao(refId); if (!r) return null;
    var c = JSON.parse(JSON.stringify(r));
    c.id = uid('r-'); c.criadoEm = Date.now(); c.efemera = true; // modeloId preservado se existir
    c.itens = (c.itens || []).map(function (it) { return Object.assign({}, it, { id: uid('i-') }); });
    var rs = todasRefeicoes(); rs.push(c); storeSet('refeicoes', rs); return c.id;
  }
  function copiarDiaPara(origemId, destinos) {
    var origem = idsDoDia(origemId);
    (destinos || []).forEach(function (dest) {
      if (dest === origemId) return;
      idsDoDia(dest).forEach(function (rid) { excluirRefeicao(rid); }); // limpa o destino (substitui)
      setIdsDoDia(dest, origem.map(function (rid) { return clonarRefeicaoComoCopia(rid); }).filter(Boolean));
    });
  }
  function salvarCopiaNoModelo(copiaId) {
    var c = obterRefeicao(copiaId); if (!c) return null;
    var conteudo = { nome: c.nome, etiquetas: (c.etiquetas || []).slice(), itens: JSON.parse(JSON.stringify(c.itens || [])) };
    if (c.modeloId && obterRefeicao(c.modeloId)) { editarRefeicao(c.modeloId, conteudo); return c.modeloId; }
    var novoId = criarRefeicao({ nome: c.nome || 'Nova refeição', etiquetas: conteudo.etiquetas, itens: conteudo.itens });
    editarRefeicao(copiaId, { modeloId: novoId }); return novoId;
  }
  function macrosDoDia(diaId) {
    var t = { kcal: 0, prot: 0, carbo: 0, gord: 0 };
    refeicoesDoDia(diaId).forEach(function (r) { var m = macrosRefeicao(r); t.kcal += m.kcal; t.prot += m.prot; t.carbo += m.carbo; t.gord += m.gord; });
    return { kcal: Math.round(t.kcal), prot: Math.round(t.prot * 10) / 10, carbo: Math.round(t.carbo * 10) / 10, gord: Math.round(t.gord * 10) / 10 };
  }
  function limparCopiasOrfas() {
    var s = semanaDados(), usados = {};
    Object.keys(s.dias).forEach(function (d) { (s.dias[d] || []).forEach(function (id) { usados[id] = true; }); });
    var rs = todasRefeicoes(), limpo = rs.filter(function (r) { return !r.efemera || usados[r.id]; });
    if (limpo.length !== rs.length) storeSet('refeicoes', limpo);
  }
  function metasAtuais() {
    var manuais = storeGet('metasManuais', null);
    if (manuais) return Object.assign({}, manuais, { manual: true });
    var p = normalizarPerfil(carregarPerfil());
    if (!perfilValido(p)) return null;
    return calcularMetas(p);
  }

  /* ============================================================
     LISTA DE COMPRAS (lote 6)
     Agrega os alimentos da semana e mostra na medida mais natural quando dá:
     unidades/fatias (porção contável), litros/ml (líquidos), kg/g (resto).
     ============================================================ */
  function fmtMil(n) { try { return Math.round(n).toLocaleString('pt-BR'); } catch (e) { return String(Math.round(n)); } }
  function qtdCompra(alimento, G) {
    var ps = porcoesDe(alimento.id) || [];
    for (var i = 0; i < ps.length; i++) {
      var r = norm(ps[i].rotulo);
      if (ps[i].g > 0 && (/unidade/.test(r) || /fatia/.test(r))) {
        var n = Math.round(G / ps[i].g);
        if (n >= 1) { var fatia = /fatia/.test(r); return { principal: fatia ? (n + (n === 1 ? ' fatia' : ' fatias')) : (n + ' un'), sub: fmtMil(G) + ' g' }; }
      }
    }
    var cat = norm(alimento.cat || ''), rotulos = norm(ps.map(function (p) { return p.rotulo; }).join(' ')), nome = norm(alimento.nome);
    var liquido = /bebidas/.test(cat) || /\bcopo\b|\bml\b|xicara/.test(rotulos) || /leite|suco|agua|oleo|azeite|vinagre|cafe|refrigerante|cerveja|vinho|bebida|caldo/.test(nome);
    if (liquido) { if (G >= 1000) return { principal: fmt(G / 1000) + ' L', sub: null }; return { principal: fmtMil(Math.round(G)) + ' ml', sub: null }; }
    if (G >= 1000) return { principal: fmt(G / 1000) + ' kg', sub: null };
    return { principal: fmtMil(Math.round(G)) + ' g', sub: null };
  }
  function listaDeCompras(diasSel) {
    var dias = (diasSel && diasSel.length) ? diasSel : DIAS.map(function (d) { return d.id; });
    var tot = {};
    dias.forEach(function (dia) {
      refeicoesDoDia(dia).forEach(function (rf) {
        (rf.itens || []).forEach(function (it) { tot[it.alimentoId] = (tot[it.alimentoId] || 0) + (parseFloat(it.gramas) || 0); });
      });
    });
    var itens = Object.keys(tot).map(function (aid) {
      var a = obterAlimento(aid);
      return { id: aid, nome: a ? a.nome : 'Alimento removido', cat: a ? (a.cat || 'Outros') : 'Outros', gramas: Math.round(tot[aid] * 10) / 10, q: a ? qtdCompra(a, tot[aid]) : { principal: fmtMil(tot[aid]) + ' g', sub: null } };
    });
    var ordem = categorias(), grupos = {};
    itens.forEach(function (it) { (grupos[it.cat] = grupos[it.cat] || []).push(it); });
    Object.keys(grupos).forEach(function (k) { grupos[k].sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }); });
    var cats = Object.keys(grupos).sort(function (a, b) { var ia = ordem.indexOf(a), ib = ordem.indexOf(b); if (ia < 0) ia = 999; if (ib < 0) ib = 999; return ia - ib || a.localeCompare(b, 'pt-BR'); });
    return { grupos: grupos, cats: cats, total: itens.length };
  }
  function listaComprasTexto(diasSel) {
    var L = listaDeCompras(diasSel), linhas = ['Lista de compras — Fuel', ''];
    L.cats.forEach(function (cat) {
      linhas.push(cat.toUpperCase());
      L.grupos[cat].forEach(function (it) { linhas.push('- ' + it.nome + ': ' + it.q.principal + (it.q.sub ? ' (' + it.q.sub + ')' : '')); });
      linhas.push('');
    });
    return linhas.join('\n').trim();
  }

  /* ============================================================
     PERFIL (lote 1)
     ============================================================ */
  var SCHEMA = 1;
  var PERFIL_PADRAO = { _v: SCHEMA, sexo: 'M', nascimento: '', idade: '', altura: '', peso: '', gorduraPct: '', atividade: 'moderado', objetivo: 'manter', ritmo: 'moderado' };
  function migrarPerfil(p) {
    if (!p || typeof p !== 'object') return Object.assign({}, PERFIL_PADRAO);
    var o = Object.assign({}, PERFIL_PADRAO, p); o._v = SCHEMA;
    // migração: quem só tinha idade ganha uma data de nascimento estimada (1º de janeiro do ano), ajustável depois
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.nascimento || '') && parseNum(o.idade) > 0) {
      o.nascimento = (new Date().getFullYear() - Math.round(parseNum(o.idade))) + '-01-01';
    }
    return o;
  }
  function carregarPerfil() { return migrarPerfil(storeGet('perfil', null)); }
  function normalizarPerfil(raw) {
    var g = parseNum(raw.gorduraPct);
    var idadeNasc = raw.nascimento ? calcularIdade(raw.nascimento) : NaN;
    var idade = !isNaN(idadeNasc) ? idadeNasc : parseNum(raw.idade);
    return { sexo: raw.sexo === 'F' ? 'F' : 'M', nascimento: raw.nascimento || '', idade: idade, altura: parseNum(raw.altura), peso: parseNum(raw.peso), gorduraPct: isNaN(g) ? null : g, atividade: raw.atividade, objetivo: raw.objetivo, ritmo: raw.ritmo };
  }
  function perfilValido(n) { return n.idade > 0 && n.idade < 120 && n.altura > 0 && n.altura < 260 && n.peso > 0 && n.peso < 400; }

  /* ============================================================
     BACKUP
     ============================================================ */
  function exportarBackup() {
    var payload = { app: 'fuel', schema: SCHEMA, exportadoEm: new Date().toISOString(), dados: storeColetarTudo() };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'fuel-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }
  function importarBackup(file, cb) {
    var reader = new FileReader();
    reader.onload = function () { try { var parsed = JSON.parse(reader.result); var dados = parsed && parsed.dados ? parsed.dados : parsed; if (!dados || typeof dados !== 'object') throw new Error('inv'); Object.keys(dados).forEach(function (k) { storeSet(k, dados[k]); }); cb(null); } catch (e) { cb(e); } };
    reader.onerror = function () { cb(reader.error || new Error('Falha ao ler.')); };
    reader.readAsText(file);
  }

  /* ============================================================
     ESTILO
     ============================================================ */
  var C = { bg: '#FAFAF7', card: '#FFFFFF', ink: '#1E2A24', ink2: '#6B7770', line: '#ECEFEC', brand: '#3FA968', brandDark: '#2C6E49', prot: '#E5645E', carb: '#E0A23B', fat: '#4C9BD6' };
  var DISPLAY = "'Nunito', system-ui, sans-serif";
  var S = {
    screen: { maxWidth: 520, margin: '0 auto', padding: '20px 16px 96px' },
    h1: { fontFamily: DISPLAY, fontWeight: 800, fontSize: 26, margin: '4px 0 2px', color: C.ink },
    sub: { color: C.ink2, fontSize: 14, margin: '0 0 18px' },
    card: { background: C.card, borderRadius: 16, padding: 18, marginBottom: 14, boxShadow: '0 1px 3px rgba(30,42,36,0.05), 0 6px 18px rgba(30,42,36,0.04)' },
    cardTitle: { fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, color: C.ink, margin: '0 0 14px' },
    label: { display: 'block', fontSize: 13, color: C.ink2, marginBottom: 6, fontWeight: 500 },
    input: { width: '100%', padding: '12px 14px', fontSize: 16, color: C.ink, background: '#fff', border: '1.5px solid ' + C.line, borderRadius: 12, outline: 'none' },
    row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 },
    field: { marginBottom: 14 },
    btn: { width: '100%', padding: '13px 16px', fontSize: 15, fontWeight: 600, color: '#fff', background: C.brand, border: 'none', borderRadius: 12, cursor: 'pointer' },
    btnGhost: { width: '100%', padding: '12px 16px', fontSize: 14, fontWeight: 600, color: C.brandDark, background: 'transparent', border: '1.5px solid ' + C.line, borderRadius: 12, cursor: 'pointer' },
    note: { fontSize: 12.5, color: C.ink2, lineHeight: 1.5 }
  };

  /* ---------- Reutilizáveis ---------- */
  function Campo(props) {
    return (
      <div style={S.field}>
        <label style={S.label}>{props.label}{props.opcional ? <span style={{ color: C.ink2, fontWeight: 400 }}> · opcional</span> : null}</label>
        <input style={S.input} type="text" inputMode={props.inputMode || 'decimal'} placeholder={props.placeholder || ''} value={props.value} onChange={function (e) { props.onChange(e.target.value); }} />
        {props.hint ? <div style={{ fontSize: 12, color: C.ink2, marginTop: 5 }}>{props.hint}</div> : null}
      </div>
    );
  }
  function Select(props) {
    return (
      <div style={S.field}>
        <label style={S.label}>{props.label}</label>
        <select style={S.input} value={props.value} onChange={function (e) { props.onChange(e.target.value); }}>
          {props.options.map(function (o) { return <option key={o.value} value={o.value}>{o.label}</option>; })}
        </select>
        {props.hint ? <div style={{ fontSize: 12, color: C.ink2, marginTop: 5 }}>{props.hint}</div> : null}
      </div>
    );
  }
  function Segmented(props) {
    return (
      <div style={S.field}>
        <label style={S.label}>{props.label}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {props.options.map(function (o) {
            var on = props.value === o.value;
            return <button key={o.value} onClick={function () { props.onChange(o.value); }} style={{ flex: 1, padding: '11px 8px', fontSize: 14, fontWeight: 600, color: on ? '#fff' : C.ink, background: on ? C.brand : '#fff', border: '1.5px solid ' + (on ? C.brand : C.line), borderRadius: 12, cursor: 'pointer' }}>{o.label}</button>;
          })}
        </div>
      </div>
    );
  }
  function AnelMacros(props) {
    var total = props.protKcal + props.carboKcal + props.fatKcal; if (total <= 0) total = 1;
    var r = 52, cx = 66, cy = 66, sw = 16, circ = 2 * Math.PI * r;
    var segs = [{ kcal: props.protKcal, color: C.prot }, { kcal: props.carboKcal, color: C.carb }, { kcal: props.fatKcal, color: C.fat }];
    var offset = 0;
    var arcs = segs.map(function (s, i) {
      var len = (s.kcal / total) * circ, dash = Math.max(0, len - 1.5);
      var el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={sw} strokeDasharray={dash + ' ' + (circ - dash)} strokeDashoffset={-offset} strokeLinecap="round" />;
      offset += len; return el;
    });
    return (
      <div style={{ position: 'relative', width: 132, height: 132, flex: '0 0 auto' }}>
        <svg width="132" height="132" viewBox="0 0 132 132">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.line} strokeWidth={sw} />
          <g transform={'rotate(-90 ' + cx + ' ' + cy + ')'}>{arcs}</g>
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 28, color: C.ink, lineHeight: 1 }}>{props.kcal}</div>
          <div style={{ fontSize: 11, color: C.ink2, marginTop: 2 }}>{props.unidade || 'kcal / dia'}</div>
        </div>
      </div>
    );
  }
  function LinhaMacro(props) {
    var pct = props.totalKcal > 0 ? Math.round((props.kcal / props.totalKcal) * 100) : 0;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: props.color, flex: '0 0 auto' }} />
        <span style={{ fontSize: 14, color: C.ink, flex: 1 }}>{props.nome}</span>
        <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, color: C.ink }}>{props.gramas} g</span>
        <span style={{ fontSize: 12.5, color: C.ink2, width: 38, textAlign: 'right' }}>{pct}%</span>
      </div>
    );
  }
  function Icone(props) {
    var paths = {
      semana: <g><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></g>,
      biblioteca: <g><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></g>,
      perfil: <g><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></g>,
      voltar: <polyline points="15 18 9 12 15 6" />,
      busca: <g><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></g>,
      mais: <g><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></g>,
      lixo: <g><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></g>,
      lapis: <g><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></g>,
      check: <polyline points="20 6 9 17 4 12" />,
      carrinho: <g><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></g>
    };
    var sz = props.size || 24;
    return <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={props.color || 'currentColor'} strokeWidth={props.strokeWidth || 2} strokeLinecap="round" strokeLinejoin="round">{paths[props.nome]}</svg>;
  }
  function Cabecalho(props) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        {props.onVoltar ? <button onClick={props.onVoltar} style={{ background: 'none', border: 'none', padding: 4, marginLeft: -4, cursor: 'pointer', color: C.ink }}><Icone nome="voltar" size={26} /></button> : null}
        <h1 style={Object.assign({}, S.h1, { margin: 0, flex: 1 })}>{props.titulo}</h1>
        {props.acao || null}
      </div>
    );
  }

  /* ============================================================
     PERFIL — telas (lote 1)
     ============================================================ */
  function CardMetas(props) {
    var m = props.metas, totalKcal = m.protKcal + m.carboKcal + m.fatKcal;
    return (
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={S.cardTitle}>Suas metas diárias</div>
          {m.manual ? <span style={{ fontSize: 11, fontWeight: 700, color: C.brandDark, background: '#EAF5EE', padding: '3px 8px', borderRadius: 999 }}>MANUAL</span> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <AnelMacros kcal={m.kcal} protKcal={m.protKcal} carboKcal={m.carboKcal} fatKcal={m.fatKcal} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <LinhaMacro nome="Proteína" gramas={m.proteinaG} kcal={m.protKcal} totalKcal={totalKcal} color={C.prot} />
            <LinhaMacro nome="Carboidrato" gramas={m.carboG} kcal={m.carboKcal} totalKcal={totalKcal} color={C.carb} />
            <LinhaMacro nome="Gordura" gramas={m.gorduraG} kcal={m.fatKcal} totalKcal={totalKcal} color={C.fat} />
          </div>
        </div>
        {!m.manual ? <div style={{ marginTop: 6, paddingTop: 14, borderTop: '1px solid ' + C.line }}><div style={{ fontSize: 12.5, color: C.ink2 }}>Gasto estimado: <b style={{ color: C.ink }}>{m.tdee} kcal</b> (TDEE) · basal {m.bmr} kcal · proteína sobre {m.baseProteina}.</div></div> : null}
        {m.avisos && m.avisos.length ? <div style={{ marginTop: 12 }}>{m.avisos.map(function (a, i) { return <div key={i} style={{ fontSize: 12.5, color: '#9A6B12', background: '#FBF3E2', borderRadius: 10, padding: '9px 11px', marginTop: 6 }}>{a}</div>; })}</div> : null}
      </div>
    );
  }
  function EditorManual(props) {
    var base = props.metas;
    var st = useState({ kcal: String(base.kcal), proteinaG: String(base.proteinaG), carboG: String(base.carboG), gorduraG: String(base.gorduraG) });
    var vals = st[0], setVals = st[1];
    function salvar() {
      var kcal = parseNum(vals.kcal), pr = parseNum(vals.proteinaG), cb = parseNum(vals.carboG), gd = parseNum(vals.gorduraG);
      if ([kcal, pr, cb, gd].some(function (x) { return isNaN(x) || x < 0; })) return;
      props.onSalvar({ kcal: Math.round(kcal), proteinaG: Math.round(pr), carboG: Math.round(cb), gorduraG: Math.round(gd), protKcal: Math.round(pr * 4), carboKcal: Math.round(cb * 4), fatKcal: Math.round(gd * 9), tdee: base.tdee, bmr: base.bmr, baseProteina: base.baseProteina, avisos: [], manual: true });
    }
    return (
      <div style={S.card}>
        <div style={S.cardTitle}>Editar metas manualmente</div>
        <Campo label="Calorias (kcal)" value={vals.kcal} onChange={function (v) { setVals(Object.assign({}, vals, { kcal: v })); }} />
        <div style={S.row2}>
          <div><label style={S.label}>Proteína (g)</label><input style={S.input} type="text" inputMode="decimal" value={vals.proteinaG} onChange={function (e) { setVals(Object.assign({}, vals, { proteinaG: e.target.value })); }} /></div>
          <div><label style={S.label}>Carboidrato (g)</label><input style={S.input} type="text" inputMode="decimal" value={vals.carboG} onChange={function (e) { setVals(Object.assign({}, vals, { carboG: e.target.value })); }} /></div>
        </div>
        <Campo label="Gordura (g)" value={vals.gorduraG} onChange={function (v) { setVals(Object.assign({}, vals, { gorduraG: v })); }} />
        <button style={S.btn} onClick={salvar}>Salvar metas manuais</button>
        <div style={{ height: 10 }} />
        <button style={S.btnGhost} onClick={props.onCancelar}>Cancelar</button>
      </div>
    );
  }
  function CardBackup() {
    var st = useState(null); var msg = st[0], setMsg = st[1];
    var fileRef = React.useRef(null);
    function aoSelecionar(e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      importarBackup(f, function (err) { setMsg(err ? { ok: false, txt: 'Não consegui importar: arquivo inválido.' } : { ok: true, txt: 'Backup importado. Recarregue o app para ver.' }); });
      e.target.value = '';
    }
    return (
      <div style={S.card}>
        <div style={S.cardTitle}>Backup dos seus dados</div>
        <div style={Object.assign({}, S.note, { marginBottom: 14 })}>Exporte um arquivo com seus dados ou restaure a partir de um backup. Tudo fica só no seu aparelho.</div>
        <button style={S.btn} onClick={exportarBackup}>Exportar backup (.json)</button>
        <div style={{ height: 10 }} />
        <button style={S.btnGhost} onClick={function () { if (fileRef.current) fileRef.current.click(); }}>Importar backup</button>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={aoSelecionar} />
        {msg ? <div style={{ marginTop: 12, fontSize: 13, color: msg.ok ? C.brandDark : '#B0413B' }}>{msg.txt}</div> : null}
      </div>
    );
  }
  function TelaPerfil() {
    var pst = useState(carregarPerfil); var perfil = pst[0], setPerfil = pst[1];
    var mst = useState(function () { return storeGet('metasManuais', null); }); var manuais = mst[0], setManuais = mst[1];
    var est = useState(false); var editando = est[0], setEditando = est[1];
    useEffect(function () { storeSet('perfil', perfil); }, [perfil]);
    useEffect(function () { storeSet('metasManuais', manuais); }, [manuais]);
    function set(campo, valor) { setPerfil(function (p) { return Object.assign({}, p, { [campo]: valor }); }); }
    var norm2 = normalizarPerfil(perfil), valido = perfilValido(norm2);
    var metasAuto = valido ? calcularMetas(norm2) : null;
    var metas = manuais ? Object.assign({}, manuais, { manual: true }) : metasAuto;
    return (
      <div style={S.screen}>
        <h1 style={S.h1}>Perfil</h1>
        <p style={S.sub}>Seus dados definem as metas de calorias e macros.</p>
        <div style={S.card}>
          <div style={S.cardTitle}>Seus dados</div>
          <Segmented label="Sexo" value={perfil.sexo} onChange={function (v) { set('sexo', v); }} options={[{ value: 'M', label: 'Masculino' }, { value: 'F', label: 'Feminino' }]} />
          <div style={S.field}>
            <label style={S.label}>Data de nascimento</label>
            <input style={S.input} type="date" max={hojeISO()} min="1900-01-01" value={perfil.nascimento || ''} onChange={function (e) { set('nascimento', e.target.value); }} />
            {(function () { var id = calcularIdade(perfil.nascimento); return !isNaN(id) && id >= 0 && id < 120 ? <div style={{ fontSize: 12, color: C.ink2, marginTop: 5 }}>{id} anos</div> : null; })()}
          </div>
          <div style={S.row2}>
            <div><label style={S.label}>Altura</label><input style={S.input} type="text" inputMode="decimal" placeholder="cm" value={perfil.altura} onChange={function (e) { set('altura', e.target.value); }} /></div>
            <div><label style={S.label}>Peso</label><input style={S.input} type="text" inputMode="decimal" placeholder="kg" value={perfil.peso} onChange={function (e) { set('peso', e.target.value); }} /></div>
          </div>
          <div style={S.field}>
            <label style={S.label}>Gordura <span style={{ color: C.ink2, fontWeight: 400 }}>· opcional</span></label>
            <input style={S.input} type="text" inputMode="decimal" placeholder="% do peso" value={perfil.gorduraPct} onChange={function (e) { set('gorduraPct', e.target.value); }} />
          </div>
          <div style={{ fontSize: 12, color: C.ink2 }}>Informar a % de gordura deixa o cálculo de proteína mais preciso (usa a massa magra).</div>
        </div>
        <div style={S.card}>
          <div style={S.cardTitle}>Atividade e objetivo</div>
          <Select label="Nível de atividade" value={perfil.atividade} onChange={function (v) { set('atividade', v); }} hint={(ATIVIDADE[perfil.atividade] || {}).desc} options={Object.keys(ATIVIDADE).map(function (k) { return { value: k, label: ATIVIDADE[k].rotulo }; })} />
          <Select label="Objetivo" value={perfil.objetivo} onChange={function (v) { set('objetivo', v); }} options={Object.keys(OBJETIVOS).map(function (k) { return { value: k, label: OBJETIVOS[k].rotulo }; })} />
          {perfil.objetivo === 'perder' ? <Select label="Ritmo da perda" value={perfil.ritmo} onChange={function (v) { set('ritmo', v); }} hint="Quanto mais magro você for, mais devagar é recomendado, para preservar músculo." options={Object.keys(RITMOS).map(function (k) { return { value: k, label: RITMOS[k].rotulo }; })} /> : null}
        </div>
        {!valido ? <div style={S.card}><div style={S.note}>Preencha idade, altura e peso para ver suas metas.</div></div>
          : editando ? <EditorManual metas={metas} onSalvar={function (m) { setManuais(m); setEditando(false); }} onCancelar={function () { setEditando(false); }} />
            : <div><CardMetas metas={metas} />{manuais ? <button style={S.btnGhost} onClick={function () { setManuais(null); }}>Voltar às metas automáticas</button> : <button style={S.btnGhost} onClick={function () { setEditando(true); }}>Editar metas manualmente</button>}<div style={{ height: 14 }} /></div>}
        <CardBackup />
        <div style={Object.assign({}, S.note, { textAlign: 'center', padding: '4px 10px 0' })}>As metas são estimativas informativas, não orientação médica. Para um plano individual, consulte um nutricionista.</div>
      </div>
    );
  }

  /* ============================================================
     BIBLIOTECA — alimentos (lote 2)
     ============================================================ */
  function macrosKcal(a) { return { p: (a.prot || 0) * 4, c: (a.carbo || 0) * 4, g: (a.gord || 0) * 9 }; }

  function ItemAlimento(props) {
    var a = props.alimento, m = macrosKcal(a);
    return (
      <button onClick={props.onClick} style={{ width: '100%', textAlign: 'left', background: C.card, border: '1px solid ' + C.line, borderRadius: 12, padding: '12px 14px', marginBottom: 8, cursor: 'pointer', display: 'block' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, flex: 1 }}>{a.nome}</span>
          <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 14, color: C.ink }}>{a.kcal}<span style={{ fontSize: 11, color: C.ink2, fontWeight: 400 }}> kcal</span></span>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 5, fontSize: 12, color: C.ink2 }}>
          <span><span style={{ color: C.prot }}>●</span> P {fmt(a.prot)}</span>
          <span><span style={{ color: C.carb }}>●</span> C {fmt(a.carbo)}</span>
          <span><span style={{ color: C.fat }}>●</span> G {fmt(a.gord)}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11 }}>por 100 g{a.origem === 'usuario' ? ' · meu' : ''}</span>
        </div>
      </button>
    );
  }

  function SeletorSecao(props) {
    var abas = [{ id: 'alimentos', rotulo: 'Alimentos' }, { id: 'refeicoes', rotulo: 'Refeições' }];
    return (
      <div style={{ display: 'flex', gap: 6, background: '#EEF2EE', padding: 4, borderRadius: 12, marginBottom: 16 }}>
        {abas.map(function (a) {
          var on = props.secao === a.id;
          return <button key={a.id} onClick={function () { props.onSecao(a.id); }} style={{ flex: 1, padding: '9px 8px', fontSize: 13.5, fontWeight: 700, border: 'none', borderRadius: 9, cursor: 'pointer', color: on ? C.brandDark : C.ink2, background: on ? '#fff' : 'transparent', boxShadow: on ? '0 1px 2px rgba(30,42,36,0.08)' : 'none' }}>{a.rotulo}</button>;
        })}
      </div>
    );
  }

  function ListaAlimentos(props) {
    var st = useState(''); var busca = st[0], setBusca = st[1];
    var cst = useState('todas'); var cat = cst[0], setCat = cst[1];
    var lista = useMemo(function () { return filtrarAlimentos(busca, cat); }, [busca, cat, props.versao]);
    var LIM = 80, visiveis = lista.slice(0, LIM);
    return (
      <div style={S.screen}>
        <h1 style={S.h1}>Biblioteca</h1>
        <SeletorSecao secao="alimentos" onSecao={props.onSecao} />
        <p style={Object.assign({}, S.sub, { marginTop: -8 })}>Seus alimentos e os da tabela TACO. Toque para ver e ajustar.</p>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <span style={{ position: 'absolute', left: 13, top: 13, color: C.ink2 }}><Icone nome="busca" size={18} /></span>
          <input style={Object.assign({}, S.input, { paddingLeft: 40 })} type="text" placeholder="Buscar alimento…" value={busca} onChange={function (e) { setBusca(e.target.value); }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <select style={Object.assign({}, S.input, { padding: '10px 14px' })} value={cat} onChange={function (e) { setCat(e.target.value); }}>
            <option value="todas">Todas as categorias</option>
            {categorias().map(function (c) { return <option key={c} value={c}>{c}</option>; })}
          </select>
        </div>
        <button style={Object.assign({}, S.btnGhost, { marginBottom: 14 })} onClick={props.onNovo}>+ Novo alimento</button>
        {lista.length === 0 ? <div style={S.card}><div style={S.note}>Nenhum alimento encontrado. Tente outra busca ou crie um alimento novo.</div></div>
          : visiveis.map(function (a) { return <ItemAlimento key={a.id} alimento={a} onClick={function () { props.onAbrir(a.id); }} />; })}
        {lista.length > LIM ? <div style={Object.assign({}, S.note, { textAlign: 'center', padding: '8px 0' })}>Mostrando {LIM} de {lista.length}. Refine a busca para ver outros.</div> : null}
      </div>
    );
  }

  function FormPorcao(props) {
    var p = props.porcao || { rotulo: '', g: '' };
    var st = useState({ rotulo: p.rotulo || '', g: p.g != null ? String(p.g) : '' });
    var v = st[0], setV = st[1];
    function salvar() {
      var g = parseNum(v.g);
      if (!v.rotulo.trim() || isNaN(g) || g <= 0) return;
      props.onSalvar({ id: (props.porcao && props.porcao.id) || (uid('p-')), rotulo: v.rotulo.trim(), g: Math.round(g * 10) / 10 });
    }
    return (
      <div style={{ background: '#F4F7F4', border: '1px solid ' + C.line, borderRadius: 12, padding: 14, marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10, color: C.ink, fontFamily: DISPLAY }}>{props.porcao ? 'Editar porção' : 'Nova porção'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 10, marginBottom: 10 }}>
          <div><label style={S.label}>Nome</label><input style={S.input} type="text" placeholder="ex.: 1 fatia" value={v.rotulo} onChange={function (e) { setV(Object.assign({}, v, { rotulo: e.target.value })); }} /></div>
          <div><label style={S.label}>Gramas</label><input style={S.input} type="text" inputMode="decimal" placeholder="g" value={v.g} onChange={function (e) { setV(Object.assign({}, v, { g: e.target.value })); }} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={Object.assign({}, S.btn, { padding: '10px' })} onClick={salvar}>Salvar</button>
          <button style={Object.assign({}, S.btnGhost, { padding: '10px' })} onClick={props.onCancelar}>Cancelar</button>
        </div>
      </div>
    );
  }

  function TelaDetalhe(props) {
    var id = props.id, a = obterAlimento(id);
    var pst = useState(function () { return porcoesDe(id); }); var porcoes = pst[0], setPorcoes = pst[1];
    var fst = useState(null); var form = fst[0], setForm = fst[1]; // null | {} (nova) | porcao (editar)
    var cst = useState(false); var confirmar = cst[0], setConfirmar = cst[1];
    if (!a) { return <div style={S.screen}><Cabecalho titulo="Alimento" onVoltar={props.onVoltar} /><div style={S.card}><div style={S.note}>Este alimento não está mais disponível.</div></div></div>; }
    var m = macrosKcal(a), totalK = m.p + m.c + m.g;
    function commit(novas) { setPorcoes(novas); salvarPorcoes(id, novas); }
    function salvarPorcao(p) {
      var idx = porcoes.map(function (x) { return x.id; }).indexOf(p.id);
      var novas = porcoes.slice(); if (idx >= 0) novas[idx] = p; else novas.push(p);
      commit(novas); setForm(null);
    }
    function excluirPorcao(pid) { commit(porcoes.filter(function (x) { return x.id !== pid; })); }
    return (
      <div style={S.screen}>
        <Cabecalho titulo={a.origem === 'usuario' ? 'Meu alimento' : 'Alimento'} onVoltar={props.onVoltar}
          acao={<button onClick={function () { props.onEditar(id); }} style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: C.brandDark }}><Icone nome="lapis" size={20} /></button>} />
        <div style={S.card}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 19, color: C.ink, marginBottom: 2 }}>{a.nome}</div>
          <div style={{ fontSize: 12.5, color: C.ink2, marginBottom: 16 }}>{a.cat}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <AnelMacros kcal={a.kcal} unidade="kcal / 100 g" protKcal={m.p} carboKcal={m.c} fatKcal={m.g} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <LinhaMacro nome="Proteína" gramas={fmt(a.prot)} kcal={m.p} totalKcal={totalK} color={C.prot} />
              <LinhaMacro nome="Carboidrato" gramas={fmt(a.carbo)} kcal={m.c} totalKcal={totalK} color={C.carb} />
              <LinhaMacro nome="Gordura" gramas={fmt(a.gord)} kcal={m.g} totalKcal={totalK} color={C.fat} />
            </div>
          </div>
        </div>

        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={Object.assign({}, S.cardTitle, { margin: 0 })}>Porções</div>
            {!form ? <button onClick={function () { setForm({}); }} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: C.brandDark, fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}><Icone nome="mais" size={16} color={C.brandDark} /> Adicionar</button> : null}
          </div>
          {form ? <FormPorcao porcao={form.id ? form : null} onSalvar={salvarPorcao} onCancelar={function () { setForm(null); }} /> : null}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: porcoes.length ? '1px solid ' + C.line : 'none' }}>
            <span style={{ fontSize: 14, color: C.ink, flex: 1 }}>100 g <span style={{ color: C.ink2, fontSize: 12 }}>· base</span></span>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 14, color: C.ink }}>{a.kcal} kcal</span>
          </div>
          {porcoes.length === 0 && !form ? <div style={Object.assign({}, S.note, { paddingTop: 10 })}>Nenhuma porção extra. Toque em “Adicionar” para criar atalhos como “1 fatia (25 g)”.</div> : null}
          {porcoes.map(function (p, i) {
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: i < porcoes.length - 1 ? '1px solid ' + C.line : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: C.ink }}>{p.rotulo}</div>
                  <div style={{ fontSize: 12, color: C.ink2 }}>{fmt(p.g)} g · {Math.round(a.kcal * p.g / 100)} kcal</div>
                </div>
                <button onClick={function () { setForm(p); }} style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: C.ink2 }}><Icone nome="lapis" size={17} /></button>
                <button onClick={function () { excluirPorcao(p.id); }} style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: C.ink2 }}><Icone nome="lixo" size={17} /></button>
              </div>
            );
          })}
        </div>

        {!confirmar ? <button style={Object.assign({}, S.btnGhost, { color: '#B0413B', borderColor: '#F0DAD8' })} onClick={function () { setConfirmar(true); }}>{a.origem === 'usuario' ? 'Excluir alimento' : 'Remover da lista'}</button>
          : <div style={S.card}><div style={Object.assign({}, S.note, { marginBottom: 12 })}>{a.origem === 'usuario' ? 'Excluir este alimento de vez?' : 'Remover este alimento da TACO da sua lista? Você pode trazer de volta restaurando um backup.'}</div><div style={{ display: 'flex', gap: 8 }}><button style={Object.assign({}, S.btn, { background: '#C0473F' })} onClick={function () { excluirAlimento(id); props.onExcluido(); }}>Sim, remover</button><button style={S.btnGhost} onClick={function () { setConfirmar(false); }}>Cancelar</button></div></div>}
        <div style={{ height: 8 }} />
      </div>
    );
  }

  function FormAlimento(props) {
    var orig = props.id ? obterAlimento(props.id) : null;
    var st = useState({
      nome: orig ? orig.nome : '', cat: orig ? orig.cat : (categorias()[0] || 'Miscelâneas'),
      kcal: orig ? String(orig.kcal) : '', prot: orig ? fmt(orig.prot) : '', carbo: orig ? fmt(orig.carbo) : '', gord: orig ? fmt(orig.gord) : ''
    });
    var v = st[0], setV = st[1];
    var est = useState(false); var erro = est[0], setErro = est[1];
    function set(k, val) { setV(Object.assign({}, v, { [k]: val })); }
    var kcalMacros = useMemo(function () {
      var p = parseNum(v.prot), c = parseNum(v.carbo), g = parseNum(v.gord);
      if ([p, c, g].some(isNaN)) return null;
      return Math.round(p * 4 + c * 4 + g * 9);
    }, [v.prot, v.carbo, v.gord]);
    function salvar() {
      var nome = v.nome.trim(), kcal = parseNum(v.kcal), p = parseNum(v.prot), c = parseNum(v.carbo), g = parseNum(v.gord);
      if (!nome || [kcal, p, c, g].some(function (x) { return isNaN(x) || x < 0; })) { setErro(true); return; }
      var dados = { nome: nome, cat: v.cat, kcal: Math.round(kcal), prot: Math.round(p * 10) / 10, carbo: Math.round(c * 10) / 10, gord: Math.round(g * 10) / 10 };
      if (props.id) { editarAlimento(props.id, dados); props.onPronto(props.id); }
      else { var novoId = criarAlimento(dados); props.onPronto(novoId); }
    }
    return (
      <div style={S.screen}>
        <Cabecalho titulo={props.id ? 'Editar alimento' : 'Novo alimento'} onVoltar={props.onVoltar} />
        <div style={S.card}>
          <Campo label="Nome" inputMode="text" placeholder="ex.: Pão integral caseiro" value={v.nome} onChange={function (x) { set('nome', x); }} />
          <Select label="Categoria" value={v.cat} onChange={function (x) { set('cat', x); }} options={categorias().map(function (c) { return { value: c, label: c }; })} />
          <div style={Object.assign({}, S.note, { marginTop: -4, marginBottom: 14 })}>Os valores são por <b>100 g</b> do alimento.</div>
          <Campo label="Calorias (kcal)" value={v.kcal} onChange={function (x) { set('kcal', x); }} />
          <div style={S.row2}>
            <div><label style={S.label}>Proteína (g)</label><input style={S.input} type="text" inputMode="decimal" value={v.prot} onChange={function (e) { set('prot', e.target.value); }} /></div>
            <div><label style={S.label}>Carboidrato (g)</label><input style={S.input} type="text" inputMode="decimal" value={v.carbo} onChange={function (e) { set('carbo', e.target.value); }} /></div>
          </div>
          <Campo label="Gordura (g)" value={v.gord} onChange={function (x) { set('gord', x); }} />
          {kcalMacros != null ? <div style={Object.assign({}, S.note, { marginTop: -4 })}>Conferência: pelos macros dá ~<b>{kcalMacros} kcal</b>.</div> : null}
          {erro ? <div style={{ fontSize: 13, color: '#B0413B', marginTop: 10 }}>Preencha o nome e valores numéricos válidos (zero ou mais).</div> : null}
        </div>
        <button style={S.btn} onClick={salvar}>{props.id ? 'Salvar alterações' : 'Criar alimento'}</button>
        <div style={{ height: 10 }} />
        <button style={S.btnGhost} onClick={props.onVoltar}>Cancelar</button>
      </div>
    );
  }

  function PainelAlimentos(props) {
    var nst = useState({ t: 'lista' }); var nav = nst[0], setNav = nst[1];
    var vst = useState(0); var versao = vst[0], setVersao = vst[1];
    function bump() { setVersao(function (n) { return n + 1; }); }
    if (nav.t === 'detalhe') {
      return <TelaDetalhe id={nav.id} onVoltar={function () { bump(); setNav({ t: 'lista' }); }} onEditar={function (id) { setNav({ t: 'form', id: id }); }} onExcluido={function () { bump(); setNav({ t: 'lista' }); }} />;
    }
    if (nav.t === 'form') {
      return <FormAlimento id={nav.id} onVoltar={function () { setNav(nav.id ? { t: 'detalhe', id: nav.id } : { t: 'lista' }); }} onPronto={function (id) { bump(); setNav({ t: 'detalhe', id: id }); }} />;
    }
    return <ListaAlimentos versao={versao} onSecao={props.onSecao} onNovo={function () { setNav({ t: 'form' }); }} onAbrir={function (id) { setNav({ t: 'detalhe', id: id }); }} />;
  }

  /* ---------- Refeições-modelo (lote 3) ---------- */
  function ItemRefeicaoCard(props) {
    var r = props.refeicao, m = macrosRefeicao(r), n = (r.itens || []).length;
    return (
      <button onClick={props.onClick} style={{ width: '100%', textAlign: 'left', background: C.card, border: '1px solid ' + C.line, borderRadius: 12, padding: '13px 14px', marginBottom: 8, cursor: 'pointer', display: 'block' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.ink, flex: 1, fontFamily: DISPLAY }}>{r.nome || 'Sem nome'}</span>
          <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, color: C.ink }}>{m.kcal}<span style={{ fontSize: 11, color: C.ink2, fontWeight: 400 }}> kcal</span></span>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 5, fontSize: 12, color: C.ink2 }}>
          <span><span style={{ color: C.prot }}>●</span> P {fmt(m.prot)}</span>
          <span><span style={{ color: C.carb }}>●</span> C {fmt(m.carbo)}</span>
          <span><span style={{ color: C.fat }}>●</span> G {fmt(m.gord)}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11 }}>{n} {n === 1 ? 'item' : 'itens'}</span>
        </div>
      </button>
    );
  }

  function ListaRefeicoes(props) {
    var _ = props.versao;
    var refs = refeicoesModelo();
    var grupos = {};
    refs.forEach(function (r) { var es = (r.etiquetas && r.etiquetas.length) ? r.etiquetas : ['']; es.forEach(function (k) { (grupos[k] = grupos[k] || []).push(r); }); });
    var chaves = Object.keys(grupos).sort(function (a, b) { return (a ? etiquetaOrdem(a) : 99) - (b ? etiquetaOrdem(b) : 99); });
    return (
      <div style={S.screen}>
        <h1 style={S.h1}>Biblioteca</h1>
        <SeletorSecao secao="refeicoes" onSecao={props.onSecao} />
        <p style={Object.assign({}, S.sub, { marginTop: -8 })}>Refeições reutilizáveis combinando alimentos. No próximo lote elas entram nos dias.</p>
        <button style={Object.assign({}, S.btn, { marginBottom: 16 })} onClick={props.onNova}>+ Nova refeição</button>
        {refs.length === 0 ? <div style={S.card}><div style={S.note}>Você ainda não criou refeições. Toque em “Nova refeição” para montar a primeira — por exemplo, o seu café da manhã.</div></div> : null}
        {chaves.map(function (k) {
          return (
            <div key={k || 'sem'} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 2px 8px' }}>{k ? etiquetaRotulo(k) : 'Sem etiqueta'}</div>
              {grupos[k].map(function (r) { return <ItemRefeicaoCard key={r.id} refeicao={r} onClick={function () { props.onAbrir(r.id); }} />; })}
            </div>
          );
        })}
      </div>
    );
  }

  function SeletorAlimento(props) {
    var st = useState(''); var busca = st[0], setBusca = st[1];
    var cst = useState('todas'); var cat = cst[0], setCat = cst[1];
    var lista = useMemo(function () { return filtrarAlimentos(busca, cat); }, [busca, cat]);
    var LIM = 80, visiveis = lista.slice(0, LIM);
    return (
      <div style={S.screen}>
        <Cabecalho titulo="Escolher alimento" onVoltar={props.onVoltar} />
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <span style={{ position: 'absolute', left: 13, top: 13, color: C.ink2 }}><Icone nome="busca" size={18} /></span>
          <input style={Object.assign({}, S.input, { paddingLeft: 40 })} type="text" placeholder="Buscar alimento…" value={busca} onChange={function (e) { setBusca(e.target.value); }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <select style={Object.assign({}, S.input, { padding: '10px 14px' })} value={cat} onChange={function (e) { setCat(e.target.value); }}>
            <option value="todas">Todas as categorias</option>
            {categorias().map(function (c) { return <option key={c} value={c}>{c}</option>; })}
          </select>
        </div>
        {lista.length === 0 ? <div style={S.card}><div style={S.note}>Nenhum alimento encontrado.</div></div>
          : visiveis.map(function (a) { return <ItemAlimento key={a.id} alimento={a} onClick={function () { props.onEscolher(a); }} />; })}
        {lista.length > LIM ? <div style={Object.assign({}, S.note, { textAlign: 'center', padding: '8px 0' })}>Mostrando {LIM} de {lista.length}. Refine a busca.</div> : null}
      </div>
    );
  }

  function SeletorQuantidade(props) {
    var a = props.alimento;
    var porcoes = useMemo(function () { return porcoesDe(a.id); }, [a.id]);
    var temPorcoes = porcoes.length > 0;
    var init = props.item;
    var st = useState(function () {
      var ehGramas = init ? /\bg$/.test(init.medida || '') : !temPorcoes;
      return { modo: ehGramas ? 'gramas' : 'porcao', porcaoId: temPorcoes ? porcoes[0].id : '', qtd: '1', gramas: init ? String(init.gramas) : '100' };
    });
    var v = st[0], setV = st[1];
    var opcoes = porcoes.concat([{ id: '__g', ehGramas: true }]);
    function porcaoAtual() { for (var i = 0; i < porcoes.length; i++) if (porcoes[i].id === v.porcaoId) return porcoes[i]; return porcoes[0]; }
    function calc() {
      if (v.modo === 'gramas') { var g = parseNum(v.gramas); g = isNaN(g) ? 0 : g; return { g: Math.round(g * 10) / 10, medida: fmt(g) + ' g' }; }
      var p = porcaoAtual(); var q = parseNum(v.qtd); if (isNaN(q)) q = 0;
      var miolo = (p ? p.rotulo : '').replace(/^1\s+/, '');
      return { g: Math.round((p ? p.g * q : 0) * 10) / 10, medida: fmt(q) + '× ' + miolo };
    }
    var r = calc();
    var al = obterAlimento(a.id); var kcal = Math.round((al ? al.kcal : 0) * r.g / 100);
    return (
      <div style={S.screen}>
        <Cabecalho titulo={props.item ? 'Editar quantidade' : 'Quantidade'} onVoltar={props.onVoltar} />
        <div style={S.card}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 17, color: C.ink, marginBottom: 2 }}>{a.nome}</div>
          <div style={{ fontSize: 12.5, color: C.ink2, marginBottom: 16 }}>{al ? al.kcal : 0} kcal / 100 g</div>
          <label style={S.label}>Medida</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {opcoes.map(function (p) {
              var on = p.ehGramas ? v.modo === 'gramas' : (v.modo === 'porcao' && v.porcaoId === p.id);
              return <button key={p.id} onClick={function () { p.ehGramas ? setV(Object.assign({}, v, { modo: 'gramas' })) : setV(Object.assign({}, v, { modo: 'porcao', porcaoId: p.id })); }} style={{ padding: '9px 12px', fontSize: 13.5, fontWeight: 600, border: '1.5px solid ' + (on ? C.brand : C.line), background: on ? C.brand : '#fff', color: on ? '#fff' : C.ink, borderRadius: 10, cursor: 'pointer' }}>{p.ehGramas ? 'Gramas' : (p.rotulo + ' (' + fmt(p.g) + 'g)')}</button>;
            })}
          </div>
          {v.modo === 'porcao'
            ? <Campo label="Quantas" inputMode="decimal" value={v.qtd} onChange={function (x) { setV(Object.assign({}, v, { qtd: x })); }} />
            : <Campo label="Gramas" inputMode="decimal" value={v.gramas} onChange={function (x) { setV(Object.assign({}, v, { gramas: x })); }} />}
          <div style={{ background: '#F4F7F4', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13.5, color: C.ink2 }}>Total</span>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, color: C.ink }}>{fmt(r.g)} g · {kcal} kcal</span>
          </div>
        </div>
        <button style={S.btn} onClick={function () { if (r.g > 0) props.onConfirmar({ gramas: r.g, medida: r.medida }); }}>{props.item ? 'Salvar' : 'Adicionar à refeição'}</button>
        <div style={{ height: 10 }} />
        <button style={S.btnGhost} onClick={props.onVoltar}>Cancelar</button>
      </div>
    );
  }

  function TelaRefeicao(props) {
    var id = props.id;
    var tst = useState(0); var tick = tst[0], setTick = tst[1]; var _ = tick;
    function rerender() { setTick(function (n) { return n + 1; }); }
    var ref = obterRefeicao(id);
    var cst = useState(-1); var confirmIdx = cst[0], setConfirmIdx = cst[1];
    if (!ref) { return <div style={S.screen}><Cabecalho titulo={props.titulo || 'Refeição'} onVoltar={props.onVoltar} /><div style={S.card}><div style={S.note}>Refeição não encontrada.</div></div></div>; }
    function setCampo(campo, val) { editarRefeicao(id, { [campo]: val }); rerender(); }
    function removerItem(itemId) { editarRefeicao(id, { itens: (ref.itens || []).filter(function (it) { return it.id !== itemId; }) }); rerender(); }
    var m = macrosRefeicao(ref), totalK = m.prot * 4 + m.carbo * 4 + m.gord * 9;
    var itens = ref.itens || [], acoes = props.acoes || [];
    return (
      <div style={S.screen}>
        <Cabecalho titulo={props.titulo || 'Refeição'} onVoltar={props.onVoltar} />
        <div style={S.card}>
          <Campo label="Nome" inputMode="text" placeholder="ex.: Café da manhã forte" value={ref.nome} onChange={function (x) { setCampo('nome', x); }} />
          <div style={S.field}>
            <label style={S.label}>Momentos do dia</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ETIQUETAS.map(function (e) {
                var on = (ref.etiquetas || []).indexOf(e.id) >= 0;
                return <button key={e.id} onClick={function () { var arr = (ref.etiquetas || []).slice(); var ix = arr.indexOf(e.id); if (ix >= 0) arr.splice(ix, 1); else arr.push(e.id); setCampo('etiquetas', arr); }}
                  style={{ padding: '7px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1.5px solid ' + (on ? C.brand : C.line), background: on ? '#EAF5EE' : '#fff', color: on ? C.brandDark : C.ink2 }}>{e.rotulo}</button>;
              })}
            </div>
            <div style={{ fontSize: 12, color: C.ink2, marginTop: 6 }}>Em quais momentos esta refeição costuma entrar. Pode marcar mais de um.</div>
          </div>
        </div>

        <div style={S.card}>
          <div style={S.cardTitle}>Total da refeição</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <AnelMacros kcal={m.kcal} unidade="kcal" protKcal={m.prot * 4} carboKcal={m.carbo * 4} fatKcal={m.gord * 9} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <LinhaMacro nome="Proteína" gramas={fmt(m.prot)} kcal={m.prot * 4} totalKcal={totalK} color={C.prot} />
              <LinhaMacro nome="Carboidrato" gramas={fmt(m.carbo)} kcal={m.carbo * 4} totalKcal={totalK} color={C.carb} />
              <LinhaMacro nome="Gordura" gramas={fmt(m.gord)} kcal={m.gord * 9} totalKcal={totalK} color={C.fat} />
            </div>
          </div>
        </div>

        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={Object.assign({}, S.cardTitle, { margin: 0 })}>Alimentos</div>
            <button onClick={props.onAdicionar} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: C.brandDark, fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}><Icone nome="mais" size={16} color={C.brandDark} /> Adicionar</button>
          </div>
          {itens.length === 0 ? <div style={S.note}>Nenhum alimento ainda. Toque em “Adicionar” para incluir o primeiro.</div> : null}
          {itens.map(function (it, i) {
            var a = obterAlimento(it.alimentoId), im = macrosItem(it);
            return (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 0', borderBottom: i < itens.length - 1 ? '1px solid ' + C.line : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: C.ink }}>{a ? a.nome : 'Alimento removido'}</div>
                  <div style={{ fontSize: 12, color: C.ink2 }}>{it.medida} · {fmt(it.gramas)} g · {Math.round(im.kcal)} kcal</div>
                </div>
                <button onClick={function () { props.onEditarItem(it); }} style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: C.ink2 }}><Icone nome="lapis" size={17} /></button>
                <button onClick={function () { removerItem(it.id); }} style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: C.ink2 }}><Icone nome="lixo" size={17} /></button>
              </div>
            );
          })}
        </div>

        {acoes.map(function (ac, i) {
          if (confirmIdx === i) {
            return <div key={i} style={S.card}><div style={Object.assign({}, S.note, { marginBottom: 12 })}>{ac.confirmar}</div><div style={{ display: 'flex', gap: 8 }}><button style={Object.assign({}, S.btn, ac.danger ? { background: '#C0473F' } : {})} onClick={function () { setConfirmIdx(-1); ac.onClick(); }}>Confirmar</button><button style={S.btnGhost} onClick={function () { setConfirmIdx(-1); }}>Cancelar</button></div></div>;
          }
          return <div key={i}><button style={Object.assign({}, S.btnGhost, ac.danger ? { color: '#B0413B', borderColor: '#F0DAD8' } : {})} onClick={function () { if (ac.confirmar) setConfirmIdx(i); else ac.onClick(); }}>{ac.label}</button><div style={{ height: 10 }} /></div>;
        })}
        <div style={{ height: 8 }} />
      </div>
    );
  }

  function RefeicaoEditor(props) {
    var nst = useState({ t: 'refeicao' }); var nav = nst[0], setNav = nst[1];
    if (nav.t === 'addAlim') {
      return <SeletorAlimento onVoltar={function () { setNav({ t: 'refeicao' }); }} onEscolher={function (a) { setNav({ t: 'qtd', alimento: a }); }} />;
    }
    if (nav.t === 'qtd') {
      return <SeletorQuantidade alimento={nav.alimento} item={nav.item}
        onVoltar={function () { setNav(nav.item ? { t: 'refeicao' } : { t: 'addAlim' }); }}
        onConfirmar={function (q) {
          var r = obterRefeicao(props.id); var itens = (r.itens || []).slice();
          if (nav.item) { for (var i = 0; i < itens.length; i++) if (itens[i].id === nav.item.id) { itens[i] = Object.assign({}, itens[i], { gramas: q.gramas, medida: q.medida }); break; } }
          else { itens.push({ id: uid('i-'), alimentoId: nav.alimento.id, gramas: q.gramas, medida: q.medida }); }
          editarRefeicao(props.id, { itens: itens }); setNav({ t: 'refeicao' });
        }} />;
    }
    return <TelaRefeicao id={props.id} titulo={props.titulo} onVoltar={props.onSair}
      onAdicionar={function () { setNav({ t: 'addAlim' }); }}
      onEditarItem={function (it) { setNav({ t: 'qtd', alimento: obterAlimento(it.alimentoId) || { id: it.alimentoId, nome: 'Alimento', kcal: 0 }, item: it }); }}
      acoes={props.acoes} />;
  }

  function PainelRefeicoes(props) {
    var nst = useState({ t: 'lista' }); var nav = nst[0], setNav = nst[1];
    var vst = useState(0); var versao = vst[0], setVersao = vst[1];
    function bump() { setVersao(function (n) { return n + 1; }); }
    function voltarLista(refId) {
      if (refId) { var r = obterRefeicao(refId); if (r && !(r.nome || '').trim() && (!r.itens || r.itens.length === 0)) excluirRefeicao(refId); }
      bump(); setNav({ t: 'lista' });
    }
    if (nav.t === 'refeicao') {
      var acoes = [
        { label: 'Duplicar refeição', onClick: function () { var novo = duplicarRefeicao(nav.id); setNav({ t: 'refeicao', id: novo }); } },
        { label: 'Excluir refeição', danger: true, confirmar: 'Excluir esta refeição de vez?', onClick: function () { excluirRefeicao(nav.id); bump(); setNav({ t: 'lista' }); } }
      ];
      return <RefeicaoEditor id={nav.id} titulo="Refeição" onSair={function () { voltarLista(nav.id); }} acoes={acoes} />;
    }
    return <ListaRefeicoes versao={versao} onSecao={props.onSecao} onNova={function () { setNav({ t: 'refeicao', id: criarRefeicao({}) }); }} onAbrir={function (id) { setNav({ t: 'refeicao', id: id }); }} />;
  }

  function TelaBiblioteca() {
    var sst = useState(function () { return storeGet('bibliotecaSecao', 'alimentos'); });
    var secao = sst[0], setSecao = sst[1];
    useEffect(function () { storeSet('bibliotecaSecao', secao); }, [secao]);
    if (secao === 'refeicoes') return <PainelRefeicoes onSecao={setSecao} />;
    return <PainelAlimentos onSecao={setSecao} />;
  }

  /* ============================================================
     SEMANA E DIA (lote 4)
     ============================================================ */
  function LinhaMacroMeta(props) {
    var pct = props.meta > 0 ? Math.min(100, Math.round((props.atual / props.meta) * 100)) : 0;
    return (
      <div style={{ marginBottom: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: props.color, flex: '0 0 auto' }} />
          <span style={{ fontSize: 13.5, color: C.ink, flex: 1 }}>{props.nome}</span>
          <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 13.5, color: C.ink }}>{fmt(props.atual)}<span style={{ color: C.ink2, fontWeight: 400 }}> / {props.meta} g</span></span>
        </div>
        <div style={{ height: 6, background: C.line, borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: pct + '%', height: '100%', background: props.color, borderRadius: 999 }} />
        </div>
      </div>
    );
  }

  function CardResumoDia(props) {
    var m = props.macros, metas = props.metas, totalK = m.prot * 4 + m.carbo * 4 + m.gord * 9;
    return (
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <AnelMacros kcal={m.kcal} unidade={metas ? ('de ' + metas.kcal + ' kcal') : 'kcal'} protKcal={m.prot * 4} carboKcal={m.carbo * 4} fatKcal={m.gord * 9} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {metas
              ? [<LinhaMacroMeta key="p" nome="Proteína" atual={m.prot} meta={metas.proteinaG} color={C.prot} />, <LinhaMacroMeta key="c" nome="Carboidrato" atual={m.carbo} meta={metas.carboG} color={C.carb} />, <LinhaMacroMeta key="g" nome="Gordura" atual={m.gord} meta={metas.gorduraG} color={C.fat} />]
              : [<LinhaMacro key="p" nome="Proteína" gramas={fmt(m.prot)} kcal={m.prot * 4} totalKcal={totalK} color={C.prot} />, <LinhaMacro key="c" nome="Carboidrato" gramas={fmt(m.carbo)} kcal={m.carbo * 4} totalKcal={totalK} color={C.carb} />, <LinhaMacro key="g" nome="Gordura" gramas={fmt(m.gord)} kcal={m.gord * 9} totalKcal={totalK} color={C.fat} />]}
          </div>
        </div>
        {metas ? <div style={{ marginTop: 4, paddingTop: 12, borderTop: '1px solid ' + C.line, fontSize: 13, color: C.ink2 }}>
          {(function () {
            var d = m.kcal - metas.kcal, abs = Math.abs(d);
            if (abs <= 50) return <span><b style={{ color: C.brandDark }}>No alvo</b> — {m.kcal} de {metas.kcal} kcal planejadas.</span>;
            if (d < 0) return <span><b style={{ color: C.ink }}>Faltam {abs} kcal</b> para a meta de {metas.kcal}.</span>;
            return <span><b style={{ color: '#B0413B' }}>{abs} kcal acima</b> da meta de {metas.kcal}.</span>;
          })()}
        </div> : <div style={Object.assign({}, S.note, { marginTop: 10 })}>Defina seu perfil para comparar o dia com uma meta.</div>}
      </div>
    );
  }

  function TelaSemana(props) {
    var _ = props.versao, metas = metasAtuais();
    return (
      <div style={S.screen}>
        <h1 style={S.h1}>Semana</h1>
        <p style={S.sub}>Seu molde de semana típica. Toque num dia para montá-lo.</p>
        <button style={Object.assign({}, S.btnGhost, { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 })} onClick={props.onCompras}><Icone nome="carrinho" size={18} color={C.brandDark} /> Lista de compras</button>
        {DIAS.map(function (d) {
          var m = macrosDoDia(d.id), n = idsDoDia(d.id).length;
          var pct = metas && metas.kcal > 0 ? Math.min(100, Math.round(m.kcal / metas.kcal * 100)) : 0;
          return (
            <button key={d.id} onClick={function () { props.onAbrir(d.id); }} style={{ width: '100%', textAlign: 'left', background: C.card, border: '1px solid ' + C.line, borderRadius: 14, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: metas ? 8 : 0 }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, color: C.ink, flex: 1 }}>{d.rotulo}</span>
                <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, color: C.ink }}>{m.kcal}<span style={{ fontSize: 11, color: C.ink2, fontWeight: 400 }}> kcal</span></span>
              </div>
              {metas ? <div style={{ height: 6, background: C.line, borderRadius: 999, overflow: 'hidden' }}><div style={{ width: pct + '%', height: '100%', background: m.kcal > metas.kcal * 1.05 ? C.carb : C.brand, borderRadius: 999 }} /></div> : null}
              <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 6 }}>{n === 0 ? 'Vazio' : (n + ' ' + (n === 1 ? 'refeição' : 'refeições'))}{metas ? ' · meta ' + metas.kcal + ' kcal' : ''}</div>
            </button>
          );
        })}
      </div>
    );
  }

  function TelaEscolherModelo(props) {
    var modelos = refeicoesModelo();
    var doMomento = modelos.filter(function (r) { return (r.etiquetas || []).indexOf(props.etiqueta) >= 0; });
    var outros = modelos.filter(function (r) { return (r.etiquetas || []).indexOf(props.etiqueta) < 0; });
    function card(r) { return <ItemRefeicaoCard key={r.id} refeicao={r} onClick={function () { props.onModelo(r.id); }} />; }
    return (
      <div style={S.screen}>
        <Cabecalho titulo={'Adicionar — ' + etiquetaRotulo(props.etiqueta)} onVoltar={props.onVoltar} />
        <button style={Object.assign({}, S.btn, { marginBottom: 16 })} onClick={props.onZero}>Montar uma refeição na hora</button>
        {modelos.length === 0 ? <div style={S.card}><div style={S.note}>Você ainda não salvou refeições-modelo. Monte uma na hora, ou crie modelos em Biblioteca › Refeições.</div></div> : null}
        {doMomento.length ? <div style={{ marginBottom: 14 }}><div style={{ fontSize: 12, fontWeight: 700, color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 2px 8px' }}>Deste momento</div>{doMomento.map(card)}</div> : null}
        {outros.length ? <div><div style={{ fontSize: 12, fontWeight: 700, color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 2px 8px' }}>Outras refeições</div>{outros.map(card)}</div> : null}
      </div>
    );
  }

  function TelaDia(props) {
    var _ = props.versao;
    var dia = DIAS.filter(function (d) { return d.id === props.diaId; })[0] || { rotulo: 'Dia' };
    var metas = metasAtuais(), m = macrosDoDia(props.diaId), refs = refeicoesDoDia(props.diaId);
    function momentoDe(r) { return (r.etiquetas && r.etiquetas[0]) || ''; }
    var usados = {}; refs.forEach(function (r) { var mo = momentoDe(r); if (mo) usados[mo] = true; });
    var semEtiqueta = refs.filter(function (r) { return !momentoDe(r); });
    var momentos = ETIQUETAS.filter(function (e) { return MOMENTOS_PRINCIPAIS.indexOf(e.id) >= 0 || usados[e.id]; });
    var faltantes = ETIQUETAS.filter(function (e) { return momentos.indexOf(e) < 0; });
    var ast = useState(false); var addOutro = ast[0], setAddOutro = ast[1];
    function refsDe(etq) { return refs.filter(function (r) { return momentoDe(r) === etq; }); }
    return (
      <div style={S.screen}>
        <Cabecalho titulo={dia.rotulo} onVoltar={props.onVoltar} />
        <CardResumoDia macros={m} metas={metas} />
        {momentos.map(function (e) {
          var lista = refsDe(e.id);
          return (
            <div key={e.id} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 8px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{e.rotulo}</div>
                <button onClick={function () { props.onAdicionar(e.id); }} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: C.brandDark, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}><Icone nome="mais" size={15} color={C.brandDark} /> Adicionar</button>
              </div>
              {lista.length === 0 ? <div style={{ fontSize: 12.5, color: C.ink2, padding: '0 2px 6px' }}>—</div>
                : lista.map(function (r) { return <ItemRefeicaoCard key={r.id} refeicao={r} onClick={function () { props.onEditar(r.id); }} />; })}
            </div>
          );
        })}
        {semEtiqueta.length ? <div style={{ marginBottom: 16 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 2px 8px' }}>Sem etiqueta</div>{semEtiqueta.map(function (r) { return <ItemRefeicaoCard key={r.id} refeicao={r} onClick={function () { props.onEditar(r.id); }} />; })}</div> : null}
        {faltantes.length ? (addOutro
          ? <div style={S.card}><div style={Object.assign({}, S.cardTitle, { margin: '0 0 10px' })}>Adicionar em outro momento</div>{faltantes.map(function (e) { return <button key={e.id} style={Object.assign({}, S.btnGhost, { marginBottom: 8 })} onClick={function () { setAddOutro(false); props.onAdicionar(e.id); }}>{e.rotulo}</button>; })}<button style={Object.assign({}, S.btnGhost, { borderColor: 'transparent', color: C.ink2 })} onClick={function () { setAddOutro(false); }}>Cancelar</button></div>
          : <button style={S.btnGhost} onClick={function () { setAddOutro(true); }}>+ Adicionar em outro momento</button>) : null}
        {refs.length ? <button style={Object.assign({}, S.btnGhost, { marginTop: 4 })} onClick={props.onCopiar}>Copiar este dia para outros dias</button> : null}
        <div style={{ height: 8 }} />
      </div>
    );
  }

  function TelaCopiarDia(props) {
    var origem = DIAS.filter(function (d) { return d.id === props.origemId; })[0] || { rotulo: 'Dia' };
    var outros = DIAS.filter(function (d) { return d.id !== props.origemId; });
    var sst = useState({}); var sel = sst[0], setSel = sst[1];
    var cst = useState(false); var confirmando = cst[0], setConfirmando = cst[1];
    function toggle(id) { var n = Object.assign({}, sel); if (n[id]) delete n[id]; else n[id] = true; setSel(n); setConfirmando(false); }
    function selTodos() { var n = {}; outros.forEach(function (d) { n[d.id] = true; }); setSel(n); setConfirmando(false); }
    var escolhidos = outros.filter(function (d) { return sel[d.id]; }).map(function (d) { return d.id; });
    var comConteudo = outros.filter(function (d) { return sel[d.id] && idsDoDia(d.id).length > 0; });
    function tentarCopiar() {
      if (escolhidos.length === 0) return;
      if (comConteudo.length && !confirmando) { setConfirmando(true); return; }
      props.onConfirmar(escolhidos);
    }
    return (
      <div style={S.screen}>
        <Cabecalho titulo={'Copiar ' + origem.rotulo} onVoltar={props.onVoltar} />
        <p style={S.sub}>Os dias escolhidos passam a ter uma cópia de {origem.rotulo} (substituindo o que houver neles). Depois você pode ajustar cada um sem afetar os outros.</p>
        <div style={S.card}>
          {outros.map(function (d, i) {
            var on = !!sel[d.id], n = idsDoDia(d.id).length;
            return (
              <button key={d.id} onClick={function () { toggle(d.id); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 2px', background: 'none', border: 'none', borderBottom: i < outros.length - 1 ? '1px solid ' + C.line : 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, border: '2px solid ' + (on ? C.brand : C.line), background: on ? C.brand : 'transparent', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on ? <Icone nome="check" size={14} color="#fff" /> : null}</span>
                <span style={{ flex: 1, fontSize: 15, color: C.ink }}>{d.rotulo}</span>
                <span style={{ fontSize: 12, color: C.ink2 }}>{n === 0 ? 'vazio' : (n + (n === 1 ? ' refeição' : ' refeições'))}</span>
              </button>
            );
          })}
        </div>
        <button style={Object.assign({}, S.btnGhost, { marginBottom: 16 })} onClick={selTodos}>Selecionar todos</button>
        {confirmando ? <div style={Object.assign({}, S.card, { background: '#FBF4E8', border: '1px solid #F0E0C0' })}><div style={Object.assign({}, S.note, { color: C.ink })}>Isto vai substituir o que já existe em: {comConteudo.map(function (d) { return d.rotulo; }).join(', ')}.</div></div> : null}
        <button style={Object.assign({}, S.btn, escolhidos.length === 0 ? { opacity: 0.5 } : {})} disabled={escolhidos.length === 0} onClick={tentarCopiar}>{confirmando ? 'Confirmar e substituir' : ('Copiar para ' + escolhidos.length + ' ' + (escolhidos.length === 1 ? 'dia' : 'dias'))}</button>
      </div>
    );
  }

  function PainelDia(props) {
    var nst = useState({ t: 'dia' }); var nav = nst[0], setNav = nst[1];
    var vst = useState(0); var versao = vst[0], setVersao = vst[1];
    function bump() { setVersao(function (n) { return n + 1; }); }
    if (nav.t === 'escolher') {
      return <TelaEscolherModelo etiqueta={nav.etiqueta}
        onVoltar={function () { setNav({ t: 'dia' }); }}
        onModelo={function (modeloId) { adicionarRefeicaoAoDia(props.diaId, nav.etiqueta, modeloId); bump(); setNav({ t: 'dia' }); }}
        onZero={function () { setNav({ t: 'editar', refId: adicionarRefeicaoAoDia(props.diaId, nav.etiqueta, null) }); }} />;
    }
    if (nav.t === 'editar') {
      var c = obterRefeicao(nav.refId);
      var temModelo = c && c.modeloId && obterRefeicao(c.modeloId);
      var acoes = [
        { label: temModelo ? 'Salvar no modelo' : 'Salvar como modelo', onClick: function () { salvarCopiaNoModelo(nav.refId); bump(); setNav({ t: 'dia' }); } },
        { label: 'Remover do dia', danger: true, confirmar: 'Remover esta refeição deste dia?', onClick: function () { removerRefeicaoDoDia(props.diaId, nav.refId); bump(); setNav({ t: 'dia' }); } }
      ];
      return <RefeicaoEditor id={nav.refId} titulo="Refeição do dia"
        onSair={function () { var r = obterRefeicao(nav.refId); if (r && !(r.nome || '').trim() && (!r.itens || r.itens.length === 0)) removerRefeicaoDoDia(props.diaId, nav.refId); bump(); setNav({ t: 'dia' }); }}
        acoes={acoes} />;
    }
    if (nav.t === 'copiar') {
      return <TelaCopiarDia origemId={props.diaId}
        onVoltar={function () { setNav({ t: 'dia' }); }}
        onConfirmar={function (destinos) { copiarDiaPara(props.diaId, destinos); bump(); setNav({ t: 'dia' }); }} />;
    }
    return <TelaDia diaId={props.diaId} versao={versao} onVoltar={props.onVoltar}
      onAdicionar={function (etq) { setNav({ t: 'escolher', etiqueta: etq }); }}
      onEditar={function (refId) { setNav({ t: 'editar', refId: refId }); }}
      onCopiar={function () { setNav({ t: 'copiar' }); }} />;
  }

  function TelaCompras(props) {
    var L = listaDeCompras(null);
    var mst = useState({}); var marcados = mst[0], setMarcados = mst[1];
    var cst = useState(''); var copiado = cst[0], setCopiado = cst[1];
    function toggle(id) { var n = Object.assign({}, marcados); if (n[id]) delete n[id]; else n[id] = true; setMarcados(n); }
    function copiar() {
      var txt = listaComprasTexto(null);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(function () { setCopiado('ok'); setTimeout(function () { setCopiado(''); }, 2000); }, function () { setCopiado('falha'); setTimeout(function () { setCopiado(''); }, 2500); });
        } else { setCopiado('falha'); setTimeout(function () { setCopiado(''); }, 2500); }
      } catch (e) { setCopiado('falha'); setTimeout(function () { setCopiado(''); }, 2500); }
    }
    return (
      <div style={S.screen}>
        <Cabecalho titulo="Lista de compras" onVoltar={props.onVoltar} />
        {L.total === 0
          ? <div style={S.card}><div style={S.note}>Sua semana ainda não tem alimentos. Monte os dias na aba Semana e a lista aparece aqui.</div></div>
          : <div>
            <p style={S.sub}>Tudo que sua semana inteira pede, somado e agrupado por tipo. Toque num item para marcar como pego.</p>
            {L.cats.map(function (cat) {
              return (
                <div key={cat} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 2px 8px' }}>{cat}</div>
                  <div style={S.card}>
                    {L.grupos[cat].map(function (it, i) {
                      var on = !!marcados[it.id];
                      return (
                        <button key={it.id} onClick={function () { toggle(it.id); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 2px', background: 'none', border: 'none', borderBottom: i < L.grupos[cat].length - 1 ? '1px solid ' + C.line : 'none', cursor: 'pointer', textAlign: 'left' }}>
                          <span style={{ width: 22, height: 22, borderRadius: 6, border: '2px solid ' + (on ? C.brand : C.line), background: on ? C.brand : 'transparent', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on ? <Icone nome="check" size={14} color="#fff" /> : null}</span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, color: on ? C.ink2 : C.ink, textDecoration: on ? 'line-through' : 'none' }}>{it.nome}</span>
                          <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 14, color: on ? C.ink2 : C.ink, whiteSpace: 'nowrap' }}>{it.q.principal}{it.q.sub ? <span style={{ fontWeight: 400, fontSize: 11.5, color: C.ink2 }}> · {it.q.sub}</span> : null}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <button style={S.btn} onClick={copiar}>{copiado === 'ok' ? 'Copiado!' : (copiado === 'falha' ? 'Não consegui copiar' : 'Copiar lista')}</button>
            <div style={{ height: 8 }} />
          </div>}
      </div>
    );
  }

  function PainelSemana() {
    var nst = useState({ t: 'lista' }); var nav = nst[0], setNav = nst[1];
    var vst = useState(0); var versao = vst[0], setVersao = vst[1];
    if (nav.t === 'dia') {
      return <PainelDia diaId={nav.diaId} onVoltar={function () { setVersao(function (n) { return n + 1; }); setNav({ t: 'lista' }); }} />;
    }
    if (nav.t === 'compras') {
      return <TelaCompras onVoltar={function () { setVersao(function (n) { return n + 1; }); setNav({ t: 'lista' }); }} />;
    }
    return <TelaSemana versao={versao} onAbrir={function (diaId) { setNav({ t: 'dia', diaId: diaId }); }} onCompras={function () { setNav({ t: 'compras' }); }} />;
  }

  /* ============================================================
     APP + navegação inferior
     ============================================================ */
  var ABAS = [{ id: 'semana', rotulo: 'Semana' }, { id: 'biblioteca', rotulo: 'Biblioteca' }, { id: 'perfil', rotulo: 'Perfil' }];
  function App() {
    var ast = useState(function () { return storeGet('abaAtiva', 'perfil'); });
    var aba = ast[0], setAba = ast[1];
    useEffect(function () { storeSet('abaAtiva', aba); }, [aba]);
    useEffect(function () { limparCopiasOrfas(); }, []);
    var conteudo;
    if (aba === 'perfil') conteudo = <TelaPerfil />;
    else if (aba === 'biblioteca') conteudo = <TelaBiblioteca />;
    else conteudo = <PainelSemana />;
    return (
      <div style={{ minHeight: '100dvh', background: C.bg }}>
        {conteudo}
        <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 0, display: 'flex', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderTop: '1px solid ' + C.line, paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {ABAS.map(function (a) {
            var on = aba === a.id;
            return <button key={a.id} onClick={function () { setAba(a.id); }} style={{ flex: 1, padding: '10px 6px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: on ? C.brandDark : C.ink2 }}><Icone nome={a.id} size={22} color={on ? C.brandDark : C.ink2} strokeWidth={on ? 2.3 : 1.9} /><span style={{ fontSize: 11, fontWeight: on ? 700 : 500 }}>{a.rotulo}</span></button>;
          })}
        </nav>
      </div>
    );
  }

  /* ============================================================
     EXPOSIÇÃO PARA TESTES + MONTAGEM
     ============================================================ */
  var Engine = {
    calcularBMR: calcularBMR, calcularTDEE: calcularTDEE, calcularMetas: calcularMetas, massaMagra: massaMagra,
    normalizarPerfil: normalizarPerfil, perfilValido: perfilValido, parseNum: parseNum, norm: norm,
    ATIVIDADE: ATIVIDADE, OBJETIVOS: OBJETIVOS, RITMOS: RITMOS, PISO_KCAL: PISO_KCAL,
    todosAlimentos: todosAlimentos, obterAlimento: obterAlimento, criarAlimento: criarAlimento,
    editarAlimento: editarAlimento, excluirAlimento: excluirAlimento, porcoesDe: porcoesDe, salvarPorcoes: salvarPorcoes,
    categorias: categorias, filtrarAlimentos: filtrarAlimentos,
    todasRefeicoes: todasRefeicoes, refeicoesModelo: refeicoesModelo, obterRefeicao: obterRefeicao, criarRefeicao: criarRefeicao,
    editarRefeicao: editarRefeicao, excluirRefeicao: excluirRefeicao, duplicarRefeicao: duplicarRefeicao,
    macrosItem: macrosItem, macrosRefeicao: macrosRefeicao, ETIQUETAS: ETIQUETAS,
    DIAS: DIAS, idsDoDia: idsDoDia, refeicoesDoDia: refeicoesDoDia, adicionarRefeicaoAoDia: adicionarRefeicaoAoDia,
    removerRefeicaoDoDia: removerRefeicaoDoDia, salvarCopiaNoModelo: salvarCopiaNoModelo, macrosDoDia: macrosDoDia,
    copiarDiaPara: copiarDiaPara, clonarRefeicaoComoCopia: clonarRefeicaoComoCopia,
    listaDeCompras: listaDeCompras, listaComprasTexto: listaComprasTexto, qtdCompra: qtdCompra,
    limparCopiasOrfas: limparCopiasOrfas, metasAtuais: metasAtuais, calcularIdade: calcularIdade,
    storeGet: storeGet, storeSet: storeSet
  };
  if (typeof window !== 'undefined') { window.FuelEngine = Engine; window.FuelApp = App; }
  if (typeof document !== 'undefined' && document.getElementById('root')) {
    var mount = document.getElementById('root'); mount.innerHTML = '';
    ReactDOM.createRoot(mount).render(<App />);
  }
})();
