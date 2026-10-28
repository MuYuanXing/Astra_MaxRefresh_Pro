const DATA = '/data/adb/Astra_MaxRefresh_Pro_data';
let MOD = '/data/adb/modules/Astra_MaxRefresh_Pro';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const q = s => `'${String(s).replace(/'/g, `'"'"'`)}'`;
const resOf = r => `${r.w}x${r.h}`;
const resText = k => k.replace('x', ' × ');

const S = {
  ltpo: '', ver: '', rates: [], rules: [],
  conf: { rateId: null, appSw: true, appIntv: 1, homeRes: '' },
  pending: null, pendingAt: 0, iconMode: '',
  state: { has: false, cur: null, target: null, app: '', error: false },
  apps: null, appsLoading: null, iconV: 0,
  dispId: null, animating: false, dirty: false,
  lo: 60, hi: 180, baseFps: 120,
};

function exec(cmd, ms = 10000) {
  return new Promise(resolve => {
    if (!window.ksu || typeof ksu.exec !== 'function') {
      resolve({ errno: 127, stdout: '', stderr: '请在 Root 管理器中打开' });
      return;
    }
    const cb = `astra_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let done = false;
    const finish = r => {
      if (done) return;
      done = true;
      window[cb] = () => {};
      resolve(r);
    };
    const tm = setTimeout(() => finish({ errno: 124, stdout: '', stderr: '命令超时' }), ms);
    window[cb] = (errno, stdout, stderr) => {
      clearTimeout(tm);
      finish({ errno: Number(errno) || 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    };
    try {
      ksu.exec(cmd, '{}', cb);
    } catch (e) {
      clearTimeout(tm);
      finish({ errno: 127, stdout: '', stderr: String(e) });
    }
  });
}

async function readFile(p) {
  const r = await exec(`cat ${q(p)} 2>/dev/null`);
  return r.stdout || '';
}

function b64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function writeFile(p, content) {
  const script = 'umask 022; mkdir -p "${2%/*}" && printf %s "$1" | base64 -d > "$2.tmp" && mv -f "$2.tmp" "$2"';
  const r = await exec(`sh -c ${q(script)} sh ${q(b64(content))} ${q(p)}`);
  if (r.errno !== 0) toast(`保存失败：${r.stderr.trim() || r.errno}`);
  return r.errno === 0;
}

const bump = () => writeFile(`${DATA}/rev`, String(Date.now()));

function parseKv(t) {
  const o = {};
  t.split('\n').forEach(l => {
    const i = l.indexOf('=');
    if (i > 0) o[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  });
  return o;
}

function parseRates(t) {
  return t.split('\n').map(l => l.trim().split(':')).filter(p => p.length >= 6 && /^\d+$/.test(p[0]) && /^\d+$/.test(p[3])).map(p => ({
    id: +p[0], w: p[1], h: p[2], fps: +p[3],
    type: p[4] === 'overclock' ? 'overclock' : 'native',
    base: p[5] === '1', ord: parseInt(p[6]) || 0,
  }));
}

function parseRules(t) {
  return t.split('\n').map(l => l.split('=')).filter(p => p.length === 2).map(([p, i]) => ({ pkg: p.trim(), id: +i.trim() })).filter(x => x.pkg && x.id >= 0 && /^\d+$/.test(String(x.id)));
}

function parseState(t) {
  const o = parseKv(t);
  return {
    has: !!t.trim(),
    cur: /^\d+$/.test(o.cur_id || '') ? +o.cur_id : null,
    target: /^\d+$/.test(o.target || '') ? +o.target : null,
    app: o.app || '',
    error: o.error === '1',
  };
}

function loadModuleInfo() {
  try {
    if (!window.ksu || typeof ksu.moduleInfo !== 'function') return;
    const raw = ksu.moduleInfo();
    const info = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const dir = info && (info.moduleDir || info.module_dir);
    if (typeof dir === 'string' && dir.startsWith('/data/adb/modules/')) MOD = dir;
  } catch (e) { }
}

async function loadAll() {
  const files = [`${MOD}/ltpo_mode`, `${MOD}/module.prop`, `${DATA}/settings.conf`, `${DATA}/rates.conf`, `${DATA}/apps.conf`, `${DATA}/state.conf`];
  const r = await exec(`for f in ${files.map(q).join(' ')}; do echo "@@@@"; cat "$f" 2>/dev/null; done`);
  if (r.errno === 127) { toast(r.stderr); return false; }
  const parts = r.stdout.split('@@@@\n').slice(1);
  while (parts.length < files.length) parts.push('');
  const [ltpo, prop, settings, rates, apps, state] = parts;
  S.ltpo = ltpo.trim() || 'compat';
  S.ver = parseKv(prop).version || '';
  const c = parseKv(settings);
  S.conf.rateId = /^\d+$/.test(c.global_id || '') ? +c.global_id : null;
  S.conf.appSw = c.app_switch !== '0';
  S.conf.appIntv = Math.max(1, parseInt(c.app_interval) || 1);
  S.conf.homeRes = /^\d+x\d+$/.test(c.home_res || '') ? c.home_res : '';
  S.rates = parseRates(rates);
  S.rules = parseRules(apps);
  S.state = parseState(state);
  S.dirty = false;
  return true;
}

const saveSettings = async () => {
  const c = `global_id=${S.conf.rateId ?? ''}\napp_switch=${S.conf.appSw ? 1 : 0}\napp_interval=${S.conf.appIntv}\nhome_res=${S.conf.homeRes}\n`;
  return (await writeFile(`${DATA}/settings.conf`, c)) && bump();
};

const saveRules = async () => {
  const c = S.rules.map(x => `${x.pkg}=${x.id}`).join('\n');
  return (await writeFile(`${DATA}/apps.conf`, c ? `${c}\n` : '')) && bump();
};

const byId = id => S.rates.find(r => r.id === id) || null;
const ltpoText = () => ({ disable: '强制禁用', keep: '保留（全局不生效）', compat: '兼容模式' })[S.ltpo] || S.ltpo;
const ruleFor = pkg => S.rules.find(r => r.pkg === pkg) || null;
const KNOWN = {
  'com.tencent.tmgp.sgame': '王者荣耀', 'com.miHoYo.Yuanshen': '原神', 'com.miHoYo.ys.bilibili': '原神', 'com.tencent.tmgp.pubgmhd': '和平精英',
  'com.miHoYo.hkrpg': '崩坏：星穹铁道', 'com.miHoYo.Nap': '绝区零', 'com.kurogame.mingchao': '鸣潮', 'com.tencent.lolm': '英雄联盟手游',
  'com.tencent.jkchess': '金铲铲之战', 'com.tencent.tmgp.cf': '穿越火线：枪战王者', 'com.netease.party': '蛋仔派对', 'com.tencent.tmgp.speedmobile': 'QQ飞车',
  'com.tencent.mm': '微信', 'com.tencent.mobileqq': 'QQ', 'tv.danmaku.bili': '哔哩哔哩', 'com.ss.android.ugc.aweme': '抖音',
  'com.taobao.taobao': '淘宝', 'com.sina.weibo': '微博', 'com.xingin.xhs': '小红书', 'com.coolapk.market': '酷安',
};
const GAMES = Object.keys(KNOWN).slice(0, 12);
const appLabel = pkg => (S.apps && S.apps.get(pkg)?.label) || KNOWN[pkg] || pkg;
const homeRes = () => {
  const ks = [...new Set(S.rates.map(resOf))];
  if (ks.includes(S.conf.homeRes)) return S.conf.homeRes;
  const r = byId(S.state.cur) || byId(S.conf.rateId);
  if (r) return resOf(r);
  const n = k => S.rates.filter(x => resOf(x) === k).length;
  return ks.sort((a, b) => n(b) - n(a))[0];
};

function baseOf(k) {
  const n = S.rates.filter(r => resOf(r) === k && r.type === 'native');
  return n.find(r => r.base) || n.find(r => r.fps === 120) || null;
}

function ocSeq(k, f, t) {
  return S.rates.filter(r => resOf(r) === k && r.type === 'overclock' && r.ord > 0 && (f < t ? r.ord > f && r.ord <= t : r.ord < f && r.ord >= t))
    .sort((a, b) => f < t ? a.ord - b.ord : b.ord - a.ord);
}

function seq(c, t) {
  if (!t) return [];
  if (c && c.type === 'overclock' && t.type === 'overclock' && resOf(c) === resOf(t)) return ocSeq(resOf(t), c.ord, t.ord);
  const out = [];
  if (c && c.type === 'overclock') {
    out.push(...ocSeq(resOf(c), c.ord, 0));
    const b = baseOf(resOf(c));
    if (b) out.push(b);
  }
  if (t.type === 'overclock') {
    const b = baseOf(resOf(t));
    if (b) out.push(b);
    out.push(...ocSeq(resOf(t), 0, t.ord));
  } else out.push(t);
  return out.filter((r, i, a) => i === 0 ? r !== c : r !== a[i - 1]);
}

const ang = f => -130 + Math.max(0, Math.min(1, (f - S.lo) / (S.hi - S.lo))) * 260;

function buildDial() {
  const fps = S.rates.map(r => r.fps);
  let lo = fps.length ? Math.min(...fps) : 60;
  let hi = fps.length ? Math.max(...fps) : 180;
  lo = Math.floor(lo / 10) * 10;
  hi = Math.ceil(hi / 10) * 10;
  if (hi - lo < 60) lo = Math.max(0, hi - 60);
  S.lo = lo;
  S.hi = hi;
  const bases = S.rates.filter(r => r.type === 'native' && r.base).map(r => r.fps);
  S.baseFps = bases.length ? Math.max(...bases) : 120;
  const hasOc = S.rates.some(r => r.type === 'overclock');
  const step = hi - lo <= 140 ? 2 : 5;
  let h = '';
  for (let f = lo; f <= hi; f += step) {
    const mj = f % 30 === 0, md = f % 10 === 0;
    const hot = hasOc && f > S.baseFps;
    h += `<i data-f="${f}" class="tk${mj ? ' mj' : md ? ' md' : ''}${hot ? ' hot' : ''}" style="transform:rotate(${ang(f)}deg)"></i>`;
    if (mj) h += `<span class="lb${hot ? ' hot' : ''}" style="transform:rotate(${ang(f)}deg) translate3d(0,-104px,0) rotate(${-ang(f)}deg)">${f}</span>`;
  }
  $('#ticks').innerHTML = h;
  const zone = $('#zone');
  zone.style.display = hasOc && hi > S.baseFps ? '' : 'none';
  zone.style.setProperty('--z0', `${ang(S.baseFps)}deg`);
  zone.style.setProperty('--z1', `${ang(hi) - ang(S.baseFps)}deg`);
}

function initRoll() {
  $('#roll').innerHTML = [0, 1, 2].map(() => `<span class="col"><span class="strip">${[...'0123456789'].map(d => `<b>${d}</b>`).join('')}</span></span>`).join('');
}

function setNum(n) {
  const ds = String(Math.max(0, Math.min(999, n))).padStart(3, '0').split('');
  $$('#roll .col').forEach((c, i) => {
    c.classList.toggle('lead0', i === 0 && ds[0] === '0');
    c.firstChild.style.transform = `translate3d(0, ${-ds[i] * 10}%, 0)`;
  });
}

function setGauge(f, oc) {
  $('#rotor').style.transform = `rotate(${ang(f)}deg)`;
  $$('.tk').forEach(t => t.classList.toggle('lit', +t.dataset.f <= f));
  $('#ft').textContent = f > 0 ? (1000 / f).toFixed(2) : '--';
  $('#pr').textContent = f > 0 ? `${f} 次 / 秒` : '--';
  const train = $('#train');
  const sp = 1500 / Math.max(f, 1);
  train.style.setProperty('--sp', `${sp}px`);
  train.style.animationDuration = `${sp * 8 / (S.animating ? 200 : 60)}s`;
  train.classList.toggle('oc', !!oc);
  $('#dial').classList.toggle('oc', !!oc);
}

function replay(el, c) {
  el.classList.remove(c);
  void el.offsetWidth;
  el.classList.add(c);
}

async function animateTo(t) {
  if (!t || S.animating) return;
  const c = byId(S.dispId);
  const steps = seq(c, t);
  const dial = $('#dial');
  if (!steps.length) {
    S.dispId = t.id;
    setNum(t.fps);
    setGauge(t.fps, t.type === 'overclock');
    return;
  }
  S.animating = true;
  document.body.classList.add('busy');
  const rp = $('#rp');
  rp.innerHTML = (c ? `<span class="done num">${c.fps}</span>` : '') + steps.map(r => `<i></i><span class="${r.type === 'overclock' ? 'oc' : ''}">${r.fps}</span>`).join('');
  const spans = rp.querySelectorAll('span');
  const off = c ? 1 : 0;
  for (const [i, r] of steps.entries()) {
    await sleep(i ? 260 : 60);
    if (i + off - 1 >= 0) spans[i + off - 1].classList.replace('now', 'done') || spans[i + off - 1].classList.add('done');
    spans[i + off].classList.add('now');
    const oc = r.type === 'overclock';
    if (oc && !dial.classList.contains('oc')) replay($('#flash'), 'go');
    setNum(r.fps);
    setGauge(r.fps, oc);
    replay(dial, 'tick');
  }
  await sleep(320);
  spans[spans.length - 1].classList.replace('now', 'done');
  replay(dial, 'wv');
  S.dispId = t.id;
  S.animating = false;
  document.body.classList.remove('busy');
  setGauge(t.fps, t.type === 'overclock');
}

function groups(list, desc) {
  const m = new Map();
  list.forEach(r => {
    const k = resOf(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  });
  m.forEach(v => v.sort((a, b) => desc ? b.fps - a.fps : a.fps - b.fps));
  return [...m.entries()];
}

function keyHtml(r, on, cur) {
  const oc = r.type === 'overclock';
  const t = oc ? `超频 ${r.ord} 级` : r.base ? '原生基准' : '原生';
  return `<button class="key${oc ? ' oc' : ''}${on ? ' on' : ''}${cur ? ' cur' : ''}" data-id="${r.id}"><i class="led"></i><span class="f num">${r.fps}</span><span class="t">${t}</span></button>`;
}

function renderKeys() {
  const el = $('#keys');
  const keep = S.ltpo === 'keep';
  $('#keys-hint').textContent = keep ? '保留 LTPO 模式下不生效' : '按下即生效';
  if (!S.rates.length) {
    el.innerHTML = '<div class="panel"><div class="empty">尚未读取到档位，请在「档位」页重新扫描</div></div>';
    return;
  }
  const k = homeRes();
  const rs = S.rates.filter(r => resOf(r) === k).sort((a, b) => a.fps - b.fps);
  el.innerHTML = `<div class="keys${keep ? ' off' : ''}">${rs.map(r => keyHtml(r, r.id === S.conf.rateId, r.id === S.state.cur)).join('')}</div>`;
}

function renderResSeg() {
  const ks = [...new Set(S.rates.map(resOf))];
  $('#res-row').style.display = ks.length > 1 ? '' : 'none';
  const cur = homeRes();
  $('#seg-res').innerHTML = ks.map(k => `<b data-v="${esc(k)}" class="${k === cur ? 'on' : ''}">${esc(resText(k))}</b>`).join('');
}

function renderStatus() {
  const st = S.state;
  const box = $('#status');
  let cls = 'idle', txt = '系统控制';
  if (!st.has) { cls = ''; txt = '等待后台服务'; }
  else if (st.error) { cls = 'err'; txt = '切换失败'; }
  else if (st.target != null && st.target !== st.cur) { cls = 'run'; txt = '切换中'; }
  else if (st.cur != null) { cls = 'ok'; txt = '已锁定'; }
  box.className = `status ${cls}`;
  $('#status-text').textContent = txt;
  const rule = S.conf.appSw ? ruleFor(st.app) : null;
  $('#st-src').textContent = st.target == null ? '系统控制' : rule && rule.id === st.target ? '应用规则' : '全局档位';
  const cur = byId(st.cur);
  $('#st-res').textContent = cur ? resText(resOf(cur)) : '—';
  $('#st-ltpo').textContent = ltpoText();
  $$('#keys .key').forEach(k => k.classList.toggle('cur', +k.dataset.id === st.cur));
}

function syncDial() {
  if (S.animating) return;
  if (S.pending != null) {
    if (S.state.cur === S.pending || Date.now() - S.pendingAt > 20000) S.pending = null;
    else return;
  }
  const r = byId(S.state.cur);
  if (r && r.id !== S.dispId) animateTo(r);
}

async function pollState() {
  if (document.hidden || S.animating) return;
  S.state = parseState(await readFile(`${DATA}/state.conf`));
  renderStatus();
  syncDial();
}

async function pickGlobal(id) {
  if (S.ltpo === 'keep' || S.animating) return;
  const t = byId(id);
  if (!t) return;
  if (S.conf.rateId === id) { toast(`${t.fps} Hz 已是全局档位`); return; }
  const prev = S.conf.rateId;
  S.conf.rateId = id;
  renderKeys();
  if (!(await saveSettings())) {
    S.conf.rateId = prev;
    renderKeys();
    return;
  }
  const rule = S.conf.appSw ? ruleFor(S.state.app) : null;
  if (rule) {
    toast('当前应用有专属档位，全局档位将在离开该应用后生效');
    return;
  }
  toast(`全局档位已设为 ${t.fps} Hz`);
  S.pending = id;
  S.pendingAt = Date.now();
  animateTo(t);
}

function rateTag(r) {
  if (r.type === 'overclock') return '超频';
  return r.base ? '原生基准' : '原生';
}

function renderLadders() {
  const el = $('#ladders');
  if (!S.rates.length) {
    el.innerHTML = '<div class="panel"><div class="empty">没有档位数据，请点击下方「重新扫描」</div></div>';
  } else {
    el.innerHTML = groups(S.rates, true).map(([k, rs]) => `<h2 class="sec">${esc(resText(k))}<small>${rs.length} 个档位</small></h2><div class="panel">${rs.map(r => {
      const oc = r.type === 'overclock';
      return `<div class="row step${oc ? ' oc' : ' native'}${r.base && !oc ? ' base' : ''}" data-id="${r.id}">
        <span class="node"></span><b class="num f">${r.fps}</b>
        <button class="tag" data-act="base">${rateTag(r)}</button>
        ${oc ? `<div class="stepper"><button data-act="ord" data-d="-1">−</button><b class="num">${r.ord || '-'}</b><button data-act="ord" data-d="1">+</button></div>` : ''}
        <div class="seg mini"><b data-act="type" data-v="native" class="${oc ? '' : 'on'}">原生</b><b data-act="type" data-v="overclock" class="${oc ? 'on' : ''}">超频</b></div>
      </div>`;
    }).join('')}</div>`).join('');
  }
  $('#save-rates').disabled = !S.dirty;
  $('#save-rates').textContent = S.dirty ? '保存档位配置' : '档位配置已保存';
}

function onLadder(e) {
  const a = e.target.closest('[data-act]');
  const row = e.target.closest('.step');
  if (!a || !row) return;
  const r = byId(+row.dataset.id);
  if (!r) return;
  const k = resOf(r);
  const act = a.dataset.act;
  if (act === 'type') {
    const v = a.dataset.v;
    if (v === r.type) return;
    r.type = v;
    if (v === 'overclock') {
      r.base = false;
      r.ord = Math.max(0, ...S.rates.filter(x => resOf(x) === k && x.type === 'overclock' && x !== r).map(x => x.ord)) + 1;
    } else r.ord = 0;
  } else if (act === 'base') {
    if (r.type !== 'native' || r.base) return;
    S.rates.forEach(x => { if (resOf(x) === k) x.base = false; });
    r.base = true;
  } else if (act === 'ord') {
    r.ord = Math.max(1, (r.ord || 0) + +a.dataset.d);
  }
  S.dirty = true;
  renderLadders();
}

async function saveRates() {
  const ocRes = [...new Set(S.rates.filter(r => r.type === 'overclock').map(resOf))];
  const miss = ocRes.filter(k => !S.rates.some(r => resOf(r) === k && r.type === 'native' && r.base));
  if (miss.length) { toast(`请为 ${miss.map(resText).join('、')} 设置原生基准`); return; }
  const dup = S.rates.some(r => r.type === 'overclock' && S.rates.some(x => x !== r && x.type === 'overclock' && resOf(x) === resOf(r) && x.ord === r.ord));
  if (dup) { toast('同一分辨率下超频档位的顺序不能重复'); return; }
  const lines = S.rates.map(r => `${r.id}:${r.w}:${r.h}:${r.fps}:${r.type}:${r.base ? 1 : 0}:${r.type === 'overclock' ? r.ord : 0}`);
  if (!(await writeFile(`${DATA}/rates.conf`, `${lines.join('\n')}\n`)) || !(await bump())) return;
  S.dirty = false;
  renderAllRates();
  toast('档位配置已保存');
}

async function rescan() {
  if (!(await confirmSheet('重新扫描档位', '将重新读取系统支持的全部档位，并按 120Hz 原生基准自动标注。当前的标注会被替换，确认后请检查并保存。', '扫描'))) return;
  toast('正在扫描…');
  const r = await exec(`sh ${q(`${MOD}/astra.sh`)} scan`, 20000);
  const list = parseRates(r.stdout);
  if (!list.length) { toast('扫描失败：没有读取到档位'); return; }
  S.rates = list;
  S.dirty = true;
  renderAllRates();
  toast(`扫描完成，共 ${list.length} 个档位，请确认后保存`);
}

function renderAllRates() {
  buildDial();
  renderResSeg();
  renderKeys();
  renderLadders();
  renderRules();
  renderStatus();
  const r = byId(S.dispId);
  if (r) {
    setNum(r.fps);
    setGauge(r.fps, r.type === 'overclock');
  }
}

function iconHtml(pkg) {
  const label = appLabel(pkg);
  return `<span class="icon">${esc([...label][0] || '?')}${S.iconMode === 'ksu' ? `<img src="ksu://icon/${esc(pkg)}" alt="">` : ''}</span>`;
}

function renderRules() {
  $('#app-sw').checked = S.conf.appSw;
  $('#app-iv').textContent = `${S.conf.appIntv} 秒`;
  $('#rule-count').textContent = S.rules.length ? `${S.rules.length} 条` : '';
  const el = $('#rules');
  if (!S.rules.length) {
    el.innerHTML = '<div class="empty">还没有规则，点击下方「添加规则」为应用指定档位</div>';
    return;
  }
  el.innerHTML = S.rules.map(x => {
    const r = byId(x.id);
    const oc = r && r.type === 'overclock';
    return `<button class="row app" data-pkg="${esc(x.pkg)}">${iconHtml(x.pkg)}<span class="nm"><b>${esc(appLabel(x.pkg))}</b><small>${esc(x.pkg)}</small></span><b class="num hz${oc ? ' oc' : ''}">${r ? r.fps : `ID ${x.id}`}</b></button>`;
  }).join('');
}

function loadApps() {
  if (S.appsLoading) return S.appsLoading;
  S.appsLoading = (async () => {
    const m = new Map();
    try {
      if (window.ksu && typeof ksu.listPackages === 'function' && typeof ksu.getPackagesInfo === 'function') {
        const names = [...JSON.parse(ksu.listPackages('user')), ...JSON.parse(ksu.listPackages('system'))];
        JSON.parse(ksu.getPackagesInfo(JSON.stringify(names))).forEach(i => {
          if (i && i.packageName) m.set(i.packageName, { label: i.appLabel || KNOWN[i.packageName] || i.packageName, sys: !!i.isSystem });
        });
        if (m.size) S.iconMode = 'ksu';
      }
    } catch (e) { }
    if (!m.size) {
      const r = await exec(`sh ${q(`${MOD}/astra.sh`)} apps`, 30000);
      r.stdout.split('\n').forEach(l => {
        const [pkg, sys] = l.trim().split(/\s+/);
        if (pkg && /^[\w.]+$/.test(pkg)) m.set(pkg, { label: KNOWN[pkg] || pkg, sys: sys === '1' });
      });
    }
    if (m.size) {
      S.apps = m;
      S.iconV = Date.now();
      renderRules();
      renderStatus();
    }
    S.appsLoading = null;
    return S.apps;
  })();
  return S.appsLoading;
}

function rateKeysHtml(sel) {
  const gs = groups(S.rates, false);
  return gs.map(([k, rs]) => `${gs.length > 1 ? `<div class="res">${esc(resText(k))}</div>` : ''}<div class="keys">${rs.map(r => keyHtml(r, r.id === sel, false)).join('')}</div>`).join('');
}

function editRule(pkg) {
  const rule = ruleFor(pkg);
  openSheet(`<h3>${esc(appLabel(pkg))}</h3><p class="msg">${esc(pkg)}</p>${rateKeysHtml(rule?.id)}<div class="acts"><button class="btn danger" data-act="del">删除规则</button><button class="btn solid" data-act="close">完成</button></div>`, async e => {
    const k = e.target.closest('.key');
    const a = e.target.closest('[data-act]');
    if (k) {
      const id = +k.dataset.id;
      const x = ruleFor(pkg);
      if (x) x.id = id; else S.rules.push({ pkg, id });
      $$('#sheet .key').forEach(b => b.classList.toggle('on', b === k));
      if (await saveRules()) { renderRules(); toast(`${appLabel(pkg)} 已设为 ${byId(id)?.fps ?? id} Hz`); }
    } else if (a?.dataset.act === 'del') {
      S.rules = S.rules.filter(x => x.pkg !== pkg);
      if (await saveRules()) { renderRules(); toast('规则已删除'); }
      closeSheet();
    } else if (a?.dataset.act === 'close') closeSheet();
  });
}

async function addRule() {
  if (!S.rates.length) { toast('请先在「档位」页扫描档位'); return; }
  let filter = '';
  const draw = () => {
    const box = $('#pick-list');
    if (!box) return;
    if (!S.apps) { box.innerHTML = '<div class="empty">正在读取应用列表…<br>首次读取需要几秒钟</div>'; return; }
    const f = filter.toLowerCase();
    const list = [...S.apps.entries()].filter(([p, v]) => !f || p.toLowerCase().includes(f) || v.label.toLowerCase().includes(f))
      .sort((a, b) => (GAMES.includes(b[0]) - GAMES.includes(a[0])) || (a[1].sys - b[1].sys) || a[1].label.localeCompare(b[1].label, 'zh'))
      .slice(0, 150);
    box.innerHTML = list.length ? list.map(([p, v]) => `<button class="row app" data-pkg="${esc(p)}">${iconHtml(p)}<span class="nm"><b>${esc(v.label)}</b><small>${esc(p)}</small></span>${ruleFor(p) ? `<b class="num hz">${byId(ruleFor(p).id)?.fps ?? ''}</b>` : ''}</button>`).join('') : '<div class="empty">没有找到匹配的应用</div>';
  };
  openSheet(`<h3>选择应用</h3><label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg><input id="pick-q" placeholder="搜索应用名称或包名" autocomplete="off"></label><div class="pick-list" id="pick-list"></div>`, e => {
    const b = e.target.closest('.app');
    if (b) editRule(b.dataset.pkg);
  });
  $('#pick-q').addEventListener('input', e => { filter = e.target.value.trim(); draw(); });
  draw();
  if (!S.apps) {
    await loadApps();
    if (!S.apps) { const box = $('#pick-list'); if (box) box.innerHTML = '<div class="empty">读取应用列表失败</div>'; return; }
    draw();
  }
}

const openUrl = u => exec(`am start -a android.intent.action.VIEW -d ${q(u)} >/dev/null 2>&1`);

let ivTimer;
function stepInterval(d) {
  S.conf.appIntv = Math.max(1, Math.min(10, S.conf.appIntv + d));
  $('#app-iv').textContent = `${S.conf.appIntv} 秒`;
  clearTimeout(ivTimer);
  ivTimer = setTimeout(saveSettings, 500);
}

async function loadRecent() {
  const t = await readFile(`${DATA}/run.log`);
  const hits = t.split('\n').map(l => l.match(/^(\S+ \S+) 已切换到档位 (\d+)/)).filter(Boolean).slice(-5).reverse();
  $('#recent').innerHTML = hits.length ? hits.map(m => {
    const r = byId(+m[2]);
    return `<li class="row"><span class="num ts">${esc(m[1])}</span><span class="num tr${r && r.type === 'overclock' ? ' oc' : ''}">${r ? `${r.fps} Hz` : `档位 ${esc(m[2])}`}</span></li>`;
  }).join('') : '<li class="empty">暂无记录</li>';
  return t;
}

async function openLog() {
  const t = await readFile(`${DATA}/run.log`);
  const lines = t.trim().split('\n').slice(-200).reverse().join('\n');
  openSheet(`<h3>运行记录</h3><div class="logbox">${esc(lines || '暂无记录')}</div><div class="acts"><button class="btn" data-act="clear">清空记录</button><button class="btn solid" data-act="close">关闭</button></div>`, async e => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'clear') {
      const r = await exec(`: > ${q(`${DATA}/run.log`)}`);
      toast(r.errno === 0 ? '运行记录已清空' : '清空失败');
      loadRecent();
    }
    closeSheet();
  });
}

async function resetAll() {
  if (!(await confirmSheet('清除全部配置', '将删除全局档位、档位标注和全部应用规则。后台服务会重新扫描并自动标注档位，此操作无法撤销。', '清除', true))) return;
  const r = await exec(`sh ${q(`${MOD}/astra.sh`)} reset`);
  if (r.errno !== 0) { toast('清除失败'); return; }
  toast('已清除，正在重新读取…');
  await sleep(3000);
  await loadAll();
  renderAllRates();
  loadRecent();
}

let sheetHandler = null;
function openSheet(html, handler) {
  $('#sheet-body').innerHTML = html;
  sheetHandler = handler;
  $('#scrim').classList.add('on');
  $('#sheet').classList.add('on');
}

function closeSheet() {
  $('#scrim').classList.remove('on');
  $('#sheet').classList.remove('on');
  const done = sheetHandler?.onClose;
  sheetHandler = null;
  if (done) done();
}

function confirmSheet(title, msg, ok, danger) {
  return new Promise(resolve => {
    const h = e => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      h.onClose = null;
      closeSheet();
      resolve(a.dataset.act === 'ok');
    };
    h.onClose = () => resolve(false);
    openSheet(`<h3>${esc(title)}</h3><p class="msg">${esc(msg)}</p><div class="acts"><button class="btn" data-act="no">取消</button><button class="btn ${danger ? 'danger' : 'solid'}" data-act="ok">${esc(ok)}</button></div>`, h);
  });
}

let toastTimer;
function toast(m) {
  const t = $('#toast');
  t.textContent = m;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

const store = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } },
};
const media = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;

function applyTheme(m) {
  m = ['auto', 'light', 'dark'].includes(m) ? m : 'auto';
  store.set('astra-theme', m);
  document.documentElement.dataset.theme = m === 'auto' ? (media && !media.matches ? 'light' : 'dark') : m;
  $$('#seg-theme b').forEach(b => b.classList.toggle('on', b.dataset.v === m));
}

function applyMotion(m) {
  m = ['full', 'lite', 'off'].includes(m) ? m : 'full';
  store.set('astra-motion', m);
  document.documentElement.dataset.motion = m;
  $$('#seg-motion b').forEach(b => b.classList.toggle('on', b.dataset.v === m));
}

let page = 'home';
function go(p) {
  if (p === page) return;
  page = p;
  const tabs = $$('.tab');
  const i = tabs.findIndex(t => t.dataset.go === p);
  tabs.forEach(t => t.classList.toggle('on', t.dataset.go === p));
  $('#tab-ind').style.transform = `translate3d(${i * 100}%, 0, 0)`;
  $$('.page').forEach(s => s.classList.toggle('on', s.dataset.page === p));
  $$('.dock').forEach(d => d.classList.toggle('on', d.dataset.for === p));
  if (p === 'set') loadRecent();
}

function bind() {
  $$('.tab').forEach(t => t.addEventListener('click', () => go(t.dataset.go)));
  $('#keys').addEventListener('click', e => { const k = e.target.closest('.key'); if (k) pickGlobal(+k.dataset.id); });
  $('#ladders').addEventListener('click', onLadder);
  $('#save-rates').addEventListener('click', saveRates);
  $('#rescan').addEventListener('click', rescan);
  $('#app-sw').addEventListener('change', e => { S.conf.appSw = e.target.checked; saveSettings(); renderStatus(); });
  $$('[data-step]').forEach(b => b.addEventListener('click', () => stepInterval(+b.dataset.step)));
  $('#rules').addEventListener('click', e => { const b = e.target.closest('.app'); if (b) editRule(b.dataset.pkg); });
  $('#add-rule').addEventListener('click', addRule);
  $('#seg-theme').addEventListener('click', e => { const b = e.target.closest('b'); if (b) applyTheme(b.dataset.v); });
  $('#seg-motion').addEventListener('click', e => { const b = e.target.closest('b'); if (b) applyMotion(b.dataset.v); });
  $('#open-log').addEventListener('click', openLog);
  $('#seg-res').addEventListener('click', e => {
    const b = e.target.closest('b');
    if (!b) return;
    S.conf.homeRes = b.dataset.v;
    renderResSeg();
    renderKeys();
    renderStatus();
    saveSettings();
  });
  $('#about').addEventListener('click', async e => {
    const b = e.target.closest('[data-url], [data-qq]');
    if (!b) return;
    if (b.dataset.url) { openUrl(b.dataset.url); return; }
    const n = b.dataset.qq;
    try { await navigator.clipboard.writeText(n); toast(`群号 ${n} 已复制`); } catch (err) { toast(`群号 ${n}`); }
    openUrl(`mqqapi://card/show_pslcard?src_type=internal&version=1&uin=${n}&card_type=group&source=qrcode`);
  });
  $('#reset-all').addEventListener('click', resetAll);
  $('#scrim').addEventListener('click', closeSheet);
  $('#sheet').addEventListener('click', e => sheetHandler && sheetHandler(e));
  if (media) {
    const f = () => { if ((store.get('astra-theme') || 'auto') === 'auto') applyTheme('auto'); };
    media.addEventListener ? media.addEventListener('change', f) : media.addListener(f);
  }
  document.addEventListener('load', e => { if (e.target.tagName === 'IMG') e.target.classList.add('ok'); }, true);
  document.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
  const sel = '.btn, .key, .row.link, .row.app, .tab, .stepper button';
  document.addEventListener('pointerdown', e => { const t = e.target.closest(sel); if (t) t.classList.add('press'); });
  const clear = () => $$('.press').forEach(x => x.classList.remove('press'));
  ['pointerup', 'pointercancel', 'scroll'].forEach(v => document.addEventListener(v, clear, true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollState(); });
}

async function init() {
  applyTheme(store.get('astra-theme'));
  applyMotion(store.get('astra-motion'));
  loadModuleInfo();
  initRoll();
  bind();
  await loadAll();
  buildDial();
  renderResSeg();
  renderKeys();
  renderLadders();
  renderRules();
  renderStatus();
  $('#set-ltpo').textContent = ltpoText();
  $('#foot').textContent = `极速高刷 Astra_MaxRefresh_Pro${S.ver ? ` · ${S.ver}` : ''} · 穆远星`;
  setNum(0);
  setGauge(S.lo, false);
  requestAnimationFrame(() => document.body.classList.add('ready'));
  await sleep(650);
  const r = byId(S.state.cur) || byId(S.conf.rateId);
  if (r) {
    S.dispId = r.id;
    setNum(r.fps);
    setGauge(r.fps, r.type === 'overclock');
    if (r.type === 'overclock') replay($('#flash'), 'go');
    await sleep(500);
    replay($('#dial'), 'wv');
  }
  setInterval(pollState, 1500);
  loadApps();
  loadRecent();
}

document.addEventListener('DOMContentLoaded', init);
