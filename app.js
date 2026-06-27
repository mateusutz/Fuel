/* Fuel — app.js
   App de nutrição (PWA, sem etapa de build). React 18 UMD + Babel classic.
   Lote 1: esqueleto de navegação, camada de dados (storeGet/storeSet),
   motor de cálculo (BMR -> TDEE -> objetivo -> macros) e tela de Perfil.
   Todo o app vive neste único arquivo. */
(function () {
  'use strict';

  var useState = React.useState;
  var useEffect = React.useEffect;

  /* ============================================================
     CAMADA DE DADOS — todo acesso a storage passa por aqui.
     Modelo chave-valor com prefixo de namespace. Hoje localStorage;
     no futuro, o mesmo ponto de abstração aponta para a nuvem.
     ============================================================ */
  var NS = 'fuel:';

  function storeGet(key, fallback) {
    try {
      var raw = localStorage.getItem(NS + key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function storeSet(key, value) {
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
  function storeColetarTudo() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(NS) === 0) {
          out[k.slice(NS.length)] = JSON.parse(localStorage.getItem(k));
        }
      }
    } catch (e) {}
    return out;
  }

  /* ============================================================
     UTILIDADES NUMÉRICAS — aceitam vírgula decimal (ex.: "17,5").
     ============================================================ */
  function parseNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (v == null) return NaN;
    var s = String(v).trim().replace(/\s/g, '').replace(',', '.');
    if (s === '') return NaN;
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }
  function arred(n, casas) {
    var f = Math.pow(10, casas || 0);
    return Math.round(n * f) / f;
  }

  /* ============================================================
     MOTOR DE CÁLCULO
     ============================================================ */
  var ATIVIDADE = {
    sedentario: { fator: 1.2,   rotulo: 'Sedentário',    desc: 'Pouco ou nenhum exercício' },
    leve:       { fator: 1.375, rotulo: 'Leve',          desc: 'Exercício leve 1–3x/semana' },
    moderado:   { fator: 1.55,  rotulo: 'Moderado',      desc: 'Exercício moderado 3–5x/semana' },
    intenso:    { fator: 1.725, rotulo: 'Intenso',       desc: 'Exercício intenso 6–7x/semana' },
    muito:      { fator: 1.9,   rotulo: 'Muito intenso', desc: 'Atleta ou trabalho físico pesado' }
  };

  // Cada objetivo é uma regra: como a meta se afasta do TDEE + prioridade de macros.
  var OBJETIVOS = {
    perder: { rotulo: 'Perder gordura',  usaRitmo: true,                protGkg: 2.2, fatPct: 0.25 },
    manter: { rotulo: 'Manter',          usaRitmo: false, fatorCal: 0,  protGkg: 1.6, fatPct: 0.28 },
    ganhar: { rotulo: 'Ganhar massa',    usaRitmo: false, fatorCal: 0.10, protGkg: 1.8, fatPct: 0.25 },
    recomp: { rotulo: 'Recomposição',    usaRitmo: false, fatorCal: -0.05, protGkg: 2.2, fatPct: 0.28 }
  };

  var RITMOS = {
    conservador: { rotulo: 'Conservador', fatorCal: -0.10 },
    moderado:    { rotulo: 'Moderado',    fatorCal: -0.18 },
    agressivo:   { rotulo: 'Agressivo',   fatorCal: -0.25 }
  };

  var PISO_KCAL = { M: 1500, F: 1200 };
  var PROT_MIN_GKG = 1.6;
  var FAT_MIN_GKG = 0.6;

  // BMR pela equação Mifflin-St Jeor (padrão recomendado para adultos saudáveis).
  function calcularBMR(p) {
    var base = 10 * p.peso + 6.25 * p.altura - 5 * p.idade;
    return p.sexo === 'F' ? base - 161 : base + 5;
  }
  function fatorAtividade(chave) {
    return (ATIVIDADE[chave] || ATIVIDADE.moderado).fator;
  }
  function calcularTDEE(p) {
    return calcularBMR(p) * fatorAtividade(p.atividade);
  }
  function massaMagra(p) {
    if (p.gorduraPct == null || isNaN(p.gorduraPct)) return null;
    if (p.gorduraPct <= 0 || p.gorduraPct >= 70) return null;
    return p.peso * (1 - p.gorduraPct / 100);
  }

  // p (normalizado): { sexo:'M'|'F', idade, altura, peso, gorduraPct|null, atividade, objetivo, ritmo }
  function calcularMetas(p) {
    var avisos = [];
    var bmr = calcularBMR(p);
    var tdee = calcularTDEE(p);
    var obj = OBJETIVOS[p.objetivo] || OBJETIVOS.manter;

    var fatorCal;
    if (obj.usaRitmo) {
      fatorCal = (RITMOS[p.ritmo] || RITMOS.moderado).fatorCal;
    } else {
      fatorCal = obj.fatorCal;
    }

    var kcal = tdee * (1 + fatorCal);

    var piso = PISO_KCAL[p.sexo] || 1300;
    if (kcal < piso) {
      kcal = piso;
      avisos.push('Meta ajustada para o piso seguro de ' + piso + ' kcal. Para algo mais agressivo, procure um nutricionista.');
    }
    kcal = Math.round(kcal);

    // Base da proteína: massa magra se houver % de gordura; senão, peso total.
    var mm = massaMagra(p);
    var baseProt = mm != null ? mm : p.peso;
    var baseLabel = mm != null ? 'massa magra' : 'peso total';

    var proteinaG = obj.protGkg * baseProt;
    var gorduraG = (obj.fatPct * kcal) / 9;

    var fatFloor = FAT_MIN_GKG * p.peso;
    if (gorduraG < fatFloor) gorduraG = fatFloor;

    var protKcal = proteinaG * 4;
    var fatKcal = gorduraG * 9;
    var carboKcal = kcal - protKcal - fatKcal;

    // Salvaguarda: se proteína + gordura excederem a meta, reduz na ordem certa.
    if (carboKcal < 0) {
      var minFatKcal = fatFloor * 9;
      fatKcal = Math.max(minFatKcal, fatKcal + carboKcal);
      gorduraG = fatKcal / 9;
      carboKcal = kcal - protKcal - fatKcal;
    }
    if (carboKcal < 0) {
      var minProtKcal = PROT_MIN_GKG * baseProt * 4;
      protKcal = Math.max(minProtKcal, protKcal + carboKcal);
      proteinaG = protKcal / 4;
      carboKcal = kcal - protKcal - fatKcal;
      avisos.push('Proteína e gordura quase esgotam as calorias desta meta. Ajuste manualmente se quiser.');
    }
    if (carboKcal < 0) carboKcal = 0;

    return {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      kcal: kcal,
      proteinaG: Math.round(proteinaG),
      carboG: Math.round(carboKcal / 4),
      gorduraG: Math.round(gorduraG),
      protKcal: Math.round(protKcal),
      carboKcal: Math.round(carboKcal),
      fatKcal: Math.round(fatKcal),
      baseProteina: baseLabel,
      avisos: avisos,
      manual: false
    };
  }

  /* ============================================================
     PERFIL — formato cru (strings dos inputs) e normalização.
     ============================================================ */
  var SCHEMA = 1;
  var PERFIL_PADRAO = {
    _v: SCHEMA,
    sexo: 'M',
    idade: '',
    altura: '',
    peso: '',
    gorduraPct: '',
    atividade: 'moderado',
    objetivo: 'manter',
    ritmo: 'moderado'
  };

  // Migração silenciosa: ajusta dados antigos ao formato atual.
  function migrarPerfil(p) {
    if (!p || typeof p !== 'object') return Object.assign({}, PERFIL_PADRAO);
    var out = Object.assign({}, PERFIL_PADRAO, p);
    out._v = SCHEMA;
    return out;
  }
  function carregarPerfil() {
    return migrarPerfil(storeGet('perfil', null));
  }

  function normalizarPerfil(raw) {
    var g = parseNum(raw.gorduraPct);
    return {
      sexo: raw.sexo === 'F' ? 'F' : 'M',
      idade: parseNum(raw.idade),
      altura: parseNum(raw.altura),
      peso: parseNum(raw.peso),
      gorduraPct: isNaN(g) ? null : g,
      atividade: raw.atividade,
      objetivo: raw.objetivo,
      ritmo: raw.ritmo
    };
  }
  function perfilValido(n) {
    return (
      n.idade > 0 && n.idade < 120 &&
      n.altura > 0 && n.altura < 260 &&
      n.peso > 0 && n.peso < 400
    );
  }

  /* ============================================================
     BACKUP — exportar / importar JSON.
     ============================================================ */
  function exportarBackup() {
    var payload = { app: 'fuel', schema: SCHEMA, exportadoEm: new Date().toISOString(), dados: storeColetarTudo() };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'fuel-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }
  function importarBackup(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        var dados = parsed && parsed.dados ? parsed.dados : parsed;
        if (!dados || typeof dados !== 'object') throw new Error('Arquivo inválido.');
        Object.keys(dados).forEach(function (k) { storeSet(k, dados[k]); });
        cb(null);
      } catch (e) {
        cb(e);
      }
    };
    reader.onerror = function () { cb(reader.error || new Error('Falha ao ler o arquivo.')); };
    reader.readAsText(file);
  }

  /* ============================================================
     ESTILO — tokens e helpers (estilos inline em JS).
     ============================================================ */
  var C = {
    bg: '#FAFAF7', card: '#FFFFFF', ink: '#1E2A24', ink2: '#6B7770',
    line: '#ECEFEC', brand: '#3FA968', brandDark: '#2C6E49',
    prot: '#E5645E', carb: '#E0A23B', fat: '#4C9BD6'
  };
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

  /* ---------- Campos reutilizáveis ---------- */
  function Campo(props) {
    return (
      <div style={S.field}>
        <label style={S.label}>{props.label}{props.opcional ? <span style={{ color: C.ink2, fontWeight: 400 }}> · opcional</span> : null}</label>
        <input
          style={S.input}
          type="text"
          inputMode={props.inputMode || 'decimal'}
          placeholder={props.placeholder || ''}
          value={props.value}
          onChange={function (e) { props.onChange(e.target.value); }}
        />
        {props.hint ? <div style={{ fontSize: 12, color: C.ink2, marginTop: 5 }}>{props.hint}</div> : null}
      </div>
    );
  }

  function Select(props) {
    return (
      <div style={S.field}>
        <label style={S.label}>{props.label}</label>
        <select style={S.input} value={props.value} onChange={function (e) { props.onChange(e.target.value); }}>
          {props.options.map(function (o) {
            return <option key={o.value} value={o.value}>{o.label}</option>;
          })}
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
            return (
              <button
                key={o.value}
                onClick={function () { props.onChange(o.value); }}
                style={{
                  flex: 1, padding: '11px 8px', fontSize: 14, fontWeight: 600,
                  color: on ? '#fff' : C.ink, background: on ? C.brand : '#fff',
                  border: '1.5px solid ' + (on ? C.brand : C.line), borderRadius: 12, cursor: 'pointer'
                }}
              >{o.label}</button>
            );
          })}
        </div>
      </div>
    );
  }

  /* ---------- Anel de macros (elemento de assinatura) ---------- */
  function AnelMacros(props) {
    var total = props.protKcal + props.carboKcal + props.fatKcal;
    if (total <= 0) total = 1;
    var r = 52, cx = 66, cy = 66, sw = 16;
    var circ = 2 * Math.PI * r;
    var segs = [
      { kcal: props.protKcal, color: C.prot },
      { kcal: props.carboKcal, color: C.carb },
      { kcal: props.fatKcal, color: C.fat }
    ];
    var offset = 0;
    var arcs = segs.map(function (s, i) {
      var len = (s.kcal / total) * circ;
      var dash = Math.max(0, len - 1.5); // pequeno espaço entre segmentos
      var el = (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color}
          strokeWidth={sw} strokeDasharray={dash + ' ' + (circ - dash)}
          strokeDashoffset={-offset} strokeLinecap="round" />
      );
      offset += len;
      return el;
    });
    return (
      <div style={{ position: 'relative', width: 132, height: 132, flex: '0 0 auto' }}>
        <svg width="132" height="132" viewBox="0 0 132 132">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.line} strokeWidth={sw} />
          <g transform={'rotate(-90 ' + cx + ' ' + cy + ')'}>{arcs}</g>
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 28, color: C.ink, lineHeight: 1 }}>{props.kcal}</div>
          <div style={{ fontSize: 11, color: C.ink2, marginTop: 2, letterSpacing: 0.3 }}>kcal / dia</div>
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

  /* ---------- Card de metas ---------- */
  function CardMetas(props) {
    var m = props.metas;
    var totalKcal = m.protKcal + m.carboKcal + m.fatKcal;
    return (
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={S.cardTitle}>Suas metas diárias</div>
          {m.manual
            ? <span style={{ fontSize: 11, fontWeight: 700, color: C.brandDark, background: '#EAF5EE', padding: '3px 8px', borderRadius: 999 }}>MANUAL</span>
            : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <AnelMacros kcal={m.kcal} protKcal={m.protKcal} carboKcal={m.carboKcal} fatKcal={m.fatKcal} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <LinhaMacro nome="Proteína" gramas={m.proteinaG} kcal={m.protKcal} totalKcal={totalKcal} color={C.prot} />
            <LinhaMacro nome="Carboidrato" gramas={m.carboG} kcal={m.carboKcal} totalKcal={totalKcal} color={C.carb} />
            <LinhaMacro nome="Gordura" gramas={m.gorduraG} kcal={m.fatKcal} totalKcal={totalKcal} color={C.fat} />
          </div>
        </div>

        {!m.manual ? (
          <div style={{ marginTop: 6, paddingTop: 14, borderTop: '1px solid ' + C.line }}>
            <div style={{ fontSize: 12.5, color: C.ink2 }}>
              Gasto estimado: <b style={{ color: C.ink }}>{m.tdee} kcal</b> (TDEE) · basal {m.bmr} kcal · proteína sobre {m.baseProteina}.
            </div>
          </div>
        ) : null}

        {m.avisos && m.avisos.length ? (
          <div style={{ marginTop: 12 }}>
            {m.avisos.map(function (a, i) {
              return <div key={i} style={{ fontSize: 12.5, color: '#9A6B12', background: '#FBF3E2', borderRadius: 10, padding: '9px 11px', marginTop: 6 }}>{a}</div>;
            })}
          </div>
        ) : null}
      </div>
    );
  }

  /* ---------- Edição manual das metas ---------- */
  function EditorManual(props) {
    var base = props.metas;
    var ini = {
      kcal: String(base.kcal),
      proteinaG: String(base.proteinaG),
      carboG: String(base.carboG),
      gorduraG: String(base.gorduraG)
    };
    var st = useState(ini);
    var vals = st[0], setVals = st[1];

    function salvar() {
      var kcal = parseNum(vals.kcal), pr = parseNum(vals.proteinaG), cb = parseNum(vals.carboG), gd = parseNum(vals.gorduraG);
      if ([kcal, pr, cb, gd].some(function (x) { return isNaN(x) || x < 0; })) return;
      var metas = {
        kcal: Math.round(kcal),
        proteinaG: Math.round(pr), carboG: Math.round(cb), gorduraG: Math.round(gd),
        protKcal: Math.round(pr * 4), carboKcal: Math.round(cb * 4), fatKcal: Math.round(gd * 9),
        tdee: base.tdee, bmr: base.bmr, baseProteina: base.baseProteina,
        avisos: [], manual: true
      };
      props.onSalvar(metas);
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

  /* ---------- Backup ---------- */
  function CardBackup() {
    var st = useState(null);
    var msg = st[0], setMsg = st[1];
    var fileRef = React.useRef ? React.useRef(null) : { current: null };

    function escolherArquivo() {
      if (fileRef.current) fileRef.current.click();
    }
    function aoSelecionar(e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      importarBackup(f, function (err) {
        if (err) { setMsg({ ok: false, txt: 'Não consegui importar: arquivo inválido.' }); }
        else { setMsg({ ok: true, txt: 'Backup importado. Recarregue o app para ver.' }); }
      });
      e.target.value = '';
    }

    return (
      <div style={S.card}>
        <div style={S.cardTitle}>Backup dos seus dados</div>
        <div style={{ ...S.note, marginBottom: 14 }}>Exporte um arquivo com seus dados ou restaure a partir de um backup. Tudo fica só no seu aparelho.</div>
        <button style={S.btn} onClick={exportarBackup}>Exportar backup (.json)</button>
        <div style={{ height: 10 }} />
        <button style={S.btnGhost} onClick={escolherArquivo}>Importar backup</button>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={aoSelecionar} />
        {msg ? <div style={{ marginTop: 12, fontSize: 13, color: msg.ok ? C.brandDark : '#B0413B' }}>{msg.txt}</div> : null}
      </div>
    );
  }

  /* ============================================================
     TELA: PERFIL
     ============================================================ */
  function TelaPerfil() {
    var pst = useState(carregarPerfil);
    var perfil = pst[0], setPerfil = pst[1];
    var mst = useState(function () { return storeGet('metasManuais', null); });
    var manuais = mst[0], setManuais = mst[1];
    var est = useState(false);
    var editando = est[0], setEditando = est[1];

    useEffect(function () { storeSet('perfil', perfil); }, [perfil]);
    useEffect(function () { storeSet('metasManuais', manuais); }, [manuais]);

    function set(campo, valor) {
      setPerfil(function (p) { return Object.assign({}, p, { [campo]: valor }); });
    }

    var norm = normalizarPerfil(perfil);
    var valido = perfilValido(norm);
    var metasAuto = valido ? calcularMetas(norm) : null;
    var metas = manuais ? Object.assign({}, manuais, { manual: true }) : metasAuto;

    return (
      <div style={S.screen}>
        <h1 style={S.h1}>Perfil</h1>
        <p style={S.sub}>Seus dados definem as metas de calorias e macros.</p>

        <div style={S.card}>
          <div style={S.cardTitle}>Seus dados</div>
          <Segmented label="Sexo" value={perfil.sexo}
            onChange={function (v) { set('sexo', v); }}
            options={[{ value: 'M', label: 'Masculino' }, { value: 'F', label: 'Feminino' }]} />
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
          <Select label="Nível de atividade" value={perfil.atividade}
            onChange={function (v) { set('atividade', v); }}
            hint={(ATIVIDADE[perfil.atividade] || {}).desc}
            options={Object.keys(ATIVIDADE).map(function (k) { return { value: k, label: ATIVIDADE[k].rotulo }; })} />
          <Select label="Objetivo" value={perfil.objetivo}
            onChange={function (v) { set('objetivo', v); }}
            options={Object.keys(OBJETIVOS).map(function (k) { return { value: k, label: OBJETIVOS[k].rotulo }; })} />
          {perfil.objetivo === 'perder' ? (
            <Select label="Ritmo da perda" value={perfil.ritmo}
              onChange={function (v) { set('ritmo', v); }}
              hint="Quanto mais magro você for, mais devagar é recomendado, para preservar músculo."
              options={Object.keys(RITMOS).map(function (k) { return { value: k, label: RITMOS[k].rotulo }; })} />
          ) : null}
        </div>

        {!valido ? (
          <div style={S.card}>
            <div style={{ ...S.note }}>Preencha idade, altura e peso para ver suas metas.</div>
          </div>
        ) : editando ? (
          <EditorManual metas={metas}
            onSalvar={function (m) { setManuais(m); setEditando(false); }}
            onCancelar={function () { setEditando(false); }} />
        ) : (
          <div>
            <CardMetas metas={metas} />
            {manuais ? (
              <button style={S.btnGhost} onClick={function () { setManuais(null); }}>Voltar às metas automáticas</button>
            ) : (
              <button style={S.btnGhost} onClick={function () { setEditando(true); }}>Editar metas manualmente</button>
            )}
            <div style={{ height: 14 }} />
          </div>
        )}

        <CardBackup />

        <div style={{ ...S.note, textAlign: 'center', padding: '4px 10px 0' }}>
          As metas são estimativas informativas, não orientação médica. Para um plano individual, consulte um nutricionista.
        </div>
      </div>
    );
  }

  /* ============================================================
     TELAS PLACEHOLDER (chegam nos próximos lotes)
     ============================================================ */
  function TelaEmBreve(props) {
    return (
      <div style={S.screen}>
        <h1 style={S.h1}>{props.titulo}</h1>
        <p style={S.sub}>{props.sub}</p>
        <div style={{ ...S.card, textAlign: 'center', padding: '40px 18px' }}>
          <div style={{ width: 48, height: 48, margin: '0 auto 14px', borderRadius: 14, background: '#EAF5EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {props.icone}
          </div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, color: C.ink, marginBottom: 6 }}>Em construção</div>
          <div style={S.note}>{props.descricao}</div>
        </div>
      </div>
    );
  }

  /* ============================================================
     ÍCONES (linha, estilo Feather)
     ============================================================ */
  function Icone(props) {
    var paths = {
      semana: <g><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></g>,
      biblioteca: <g><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></g>,
      perfil: <g><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></g>
    };
    var sz = props.size || 24;
    return (
      <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={props.color || 'currentColor'} strokeWidth={props.strokeWidth || 2} strokeLinecap="round" strokeLinejoin="round">
        {paths[props.nome]}
      </svg>
    );
  }

  /* ============================================================
     APP + navegação inferior
     ============================================================ */
  var ABAS = [
    { id: 'semana', rotulo: 'Semana' },
    { id: 'biblioteca', rotulo: 'Biblioteca' },
    { id: 'perfil', rotulo: 'Perfil' }
  ];

  function App() {
    var ast = useState(function () { return storeGet('abaAtiva', 'perfil'); });
    var aba = ast[0], setAba = ast[1];
    useEffect(function () { storeSet('abaAtiva', aba); }, [aba]);

    var conteudo;
    if (aba === 'perfil') {
      conteudo = <TelaPerfil />;
    } else if (aba === 'semana') {
      conteudo = <TelaEmBreve titulo="Semana" sub="Seu plano da semana, dia a dia."
        icone={<Icone nome="semana" size={24} color={C.brand} />}
        descricao="Aqui você vai montar os 7 dias com suas refeições e ver as calorias de cada dia. Chega no próximo lote." />;
    } else {
      conteudo = <TelaEmBreve titulo="Biblioteca" sub="Seus alimentos e refeições reutilizáveis."
        icone={<Icone nome="biblioteca" size={24} color={C.brand} />}
        descricao="Aqui vai morar o banco de alimentos e as refeições-modelo que você monta uma vez e reaproveita. Chega nos próximos lotes." />;
    }

    return (
      <div style={{ minHeight: '100dvh', background: C.bg }}>
        {conteudo}
        <nav style={{
          position: 'fixed', left: 0, right: 0, bottom: 0,
          display: 'flex', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
          borderTop: '1px solid ' + C.line, paddingBottom: 'env(safe-area-inset-bottom)'
        }}>
          {ABAS.map(function (a) {
            var on = aba === a.id;
            return (
              <button key={a.id} onClick={function () { setAba(a.id); }}
                style={{ flex: 1, padding: '10px 6px 12px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: on ? C.brandDark : C.ink2 }}>
                <Icone nome={a.id} size={22} color={on ? C.brandDark : C.ink2} strokeWidth={on ? 2.3 : 1.9} />
                <span style={{ fontSize: 11, fontWeight: on ? 700 : 500 }}>{a.rotulo}</span>
              </button>
            );
          })}
        </nav>
      </div>
    );
  }

  /* ============================================================
     EXPOSIÇÃO PARA TESTES + MONTAGEM
     ============================================================ */
  var Engine = {
    calcularBMR: calcularBMR, calcularTDEE: calcularTDEE, calcularMetas: calcularMetas,
    massaMagra: massaMagra, normalizarPerfil: normalizarPerfil, perfilValido: perfilValido,
    parseNum: parseNum, ATIVIDADE: ATIVIDADE, OBJETIVOS: OBJETIVOS, RITMOS: RITMOS,
    PISO_KCAL: PISO_KCAL, storeGet: storeGet, storeSet: storeSet
  };
  if (typeof window !== 'undefined') { window.FuelEngine = Engine; window.FuelApp = App; }

  if (typeof document !== 'undefined' && document.getElementById('root')) {
    var mount = document.getElementById('root');
    mount.innerHTML = '';
    ReactDOM.createRoot(mount).render(<App />);
  }
})();
