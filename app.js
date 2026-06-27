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
    var us = _usuario(); var id = 'u-' + Date.now();
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

  /* ============================================================
     PERFIL (lote 1)
     ============================================================ */
  var SCHEMA = 1;
  var PERFIL_PADRAO = { _v: SCHEMA, sexo: 'M', idade: '', altura: '', peso: '', gorduraPct: '', atividade: 'moderado', objetivo: 'manter', ritmo: 'moderado' };
  function migrarPerfil(p) { if (!p || typeof p !== 'object') return Object.assign({}, PERFIL_PADRAO); var o = Object.assign({}, PERFIL_PADRAO, p); o._v = SCHEMA; return o; }
  function carregarPerfil() { return migrarPerfil(storeGet('perfil', null)); }
  function normalizarPerfil(raw) {
    var g = parseNum(raw.gorduraPct);
    return { sexo: raw.sexo === 'F' ? 'F' : 'M', idade: parseNum(raw.idade), altura: parseNum(raw.altura), peso: parseNum(raw.peso), gorduraPct: isNaN(g) ? null : g, atividade: raw.atividade, objetivo: raw.objetivo, ritmo: raw.ritmo };
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
      lapis: <g><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></g>
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
          <div style={S.row2}>
            <div><label style={S.label}>Idade</label><input style={S.input} type="text" inputMode="numeric" placeholder="anos" value={perfil.idade} onChange={function (e) { set('idade', e.target.value); }} /></div>
            <div><label style={S.label}>Altura</label><input style={S.input} type="text" inputMode="decimal" placeholder="cm" value={perfil.altura} onChange={function (e) { set('altura', e.target.value); }} /></div>
          </div>
          <div style={S.row2}>
            <div><label style={S.label}>Peso</label><input style={S.input} type="text" inputMode="decimal" placeholder="kg" value={perfil.peso} onChange={function (e) { set('peso', e.target.value); }} /></div>
            <div><label style={S.label}>Gordura <span style={{ color: C.ink2, fontWeight: 400 }}>· opcional</span></label><input style={S.input} type="text" inputMode="decimal" placeholder="% do peso" value={perfil.gorduraPct} onChange={function (e) { set('gorduraPct', e.target.value); }} /></div>
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

  function ListaAlimentos(props) {
    var st = useState(''); var busca = st[0], setBusca = st[1];
    var cst = useState('todas'); var cat = cst[0], setCat = cst[1];
    var todos = props.versao, _ = todos; // versao força recomputo após mudanças
    var lista = useMemo(function () {
      var nb = norm(busca.trim());
      var arr = todosAlimentos();
      arr = arr.filter(function (a) {
        if (cat !== 'todas' && a.cat !== cat) return false;
        if (nb && norm(a.nome).indexOf(nb) < 0) return false;
        return true;
      });
      arr.sort(function (x, y) { return norm(x.nome) < norm(y.nome) ? -1 : 1; });
      return arr;
    }, [busca, cat, props.versao]);
    var LIM = 80, visiveis = lista.slice(0, LIM);
    return (
      <div style={S.screen}>
        <Cabecalho titulo="Biblioteca" acao={<button onClick={props.onNovo} style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.brand, color: '#fff', border: 'none', borderRadius: 10, padding: '8px 12px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}><Icone nome="mais" size={16} color="#fff" /> Novo</button>} />
        <p style={Object.assign({}, S.sub, { marginTop: -8 })}>Seus alimentos e os da tabela TACO. Toque para ver e ajustar.</p>
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
      props.onSalvar({ id: (props.porcao && props.porcao.id) || ('p-' + Date.now()), rotulo: v.rotulo.trim(), g: Math.round(g * 10) / 10 });
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

  function TelaBiblioteca() {
    var nst = useState({ t: 'lista' }); var nav = nst[0], setNav = nst[1];
    var vst = useState(0); var versao = vst[0], setVersao = vst[1]; // força recomputo da lista
    function bump() { setVersao(function (n) { return n + 1; }); }
    if (nav.t === 'detalhe') {
      return <TelaDetalhe id={nav.id} onVoltar={function () { bump(); setNav({ t: 'lista' }); }} onEditar={function (id) { setNav({ t: 'form', id: id }); }} onExcluido={function () { bump(); setNav({ t: 'lista' }); }} />;
    }
    if (nav.t === 'form') {
      return <FormAlimento id={nav.id} onVoltar={function () { setNav(nav.id ? { t: 'detalhe', id: nav.id } : { t: 'lista' }); }} onPronto={function (id) { bump(); setNav({ t: 'detalhe', id: id }); }} />;
    }
    return <ListaAlimentos versao={versao} onNovo={function () { setNav({ t: 'form' }); }} onAbrir={function (id) { setNav({ t: 'detalhe', id: id }); }} />;
  }

  /* ============================================================
     SEMANA — placeholder (lote 4)
     ============================================================ */
  function TelaEmBreve(props) {
    return (
      <div style={S.screen}>
        <h1 style={S.h1}>{props.titulo}</h1>
        <p style={S.sub}>{props.sub}</p>
        <div style={Object.assign({}, S.card, { textAlign: 'center', padding: '40px 18px' })}>
          <div style={{ width: 48, height: 48, margin: '0 auto 14px', borderRadius: 14, background: '#EAF5EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{props.icone}</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, color: C.ink, marginBottom: 6 }}>Em construção</div>
          <div style={S.note}>{props.descricao}</div>
        </div>
      </div>
    );
  }

  /* ============================================================
     APP + navegação inferior
     ============================================================ */
  var ABAS = [{ id: 'semana', rotulo: 'Semana' }, { id: 'biblioteca', rotulo: 'Biblioteca' }, { id: 'perfil', rotulo: 'Perfil' }];
  function App() {
    var ast = useState(function () { return storeGet('abaAtiva', 'perfil'); });
    var aba = ast[0], setAba = ast[1];
    useEffect(function () { storeSet('abaAtiva', aba); }, [aba]);
    var conteudo;
    if (aba === 'perfil') conteudo = <TelaPerfil />;
    else if (aba === 'biblioteca') conteudo = <TelaBiblioteca />;
    else conteudo = <TelaEmBreve titulo="Semana" sub="Seu plano da semana, dia a dia." icone={<Icone nome="semana" size={24} color={C.brand} />} descricao="Aqui você vai montar os 7 dias com suas refeições e ver as calorias de cada dia. Chega num próximo lote." />;
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
    categorias: categorias, storeGet: storeGet, storeSet: storeSet
  };
  if (typeof window !== 'undefined') { window.FuelEngine = Engine; window.FuelApp = App; }
  if (typeof document !== 'undefined' && document.getElementById('root')) {
    var mount = document.getElementById('root'); mount.innerHTML = '';
    ReactDOM.createRoot(mount).render(<App />);
  }
})();
