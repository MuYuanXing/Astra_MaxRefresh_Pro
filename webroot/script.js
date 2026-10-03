class AstraEngine {
    constructor() {
        this.defaultId = 'Astra_MaxRefresh_Pro';
        this.moduleId = this.defaultId;
        this.mod = `/data/adb/modules/${this.defaultId}`;
        this.pdir = `/data/adb/${this.defaultId}_data`;
        this.ltpoMode = '';
        this.rates = [];
        this.apps = [];
        this.appList = [];
        this.rowMap = new Map();
        this.appMap = new Map();
        this.showSys = false;
        this.keyword = '';
        this.sheetPkg = '';
        this.conf = { rateId: null, appSw: true, appIntv: 1 };
        this.curId = null;
        this.toastTimer = null;
        this.themeMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
        this.initTheme();
        this.initMotion();
        this.init();
    }

    /* ============ 主题管理（跟随系统默认 / 浅色 / 深色） ============ */

    initTheme() {
        const mode = this.themeMode();
        this.applyTheme(mode);
        if (this.themeMedia) {
            const onChange = () => { if (this.themeMode() === 'auto') this.applyTheme('auto'); };
            if (typeof this.themeMedia.addEventListener === 'function') this.themeMedia.addEventListener('change', onChange);
            else if (typeof this.themeMedia.addListener === 'function') this.themeMedia.addListener(onChange);
        }
    }

    themeMode() {
        const m = localStorage.getItem('stellar-theme');
        return (m === 'light' || m === 'dark' || m === 'auto') ? m : 'auto';
    }

    applyTheme(mode) {
        localStorage.setItem('stellar-theme', mode);
        const resolved = (mode === 'auto')
            ? (this.themeMedia && this.themeMedia.matches ? 'dark' : 'light')
            : mode;
        document.documentElement.dataset.theme = resolved;
        document.querySelectorAll('.theme-seg-btn[data-mode]').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === mode);
        });
    }

    /* ============ 动画等级（高 / 中 / 低） ============ */

    initMotion() { this.applyMotion(this.motionLevel()); }

    motionLevel() {
        const v = localStorage.getItem('stellar-motion');
        return (v === 'medium' || v === 'low') ? v : 'high';
    }

    applyMotion(level) {
        localStorage.setItem('stellar-motion', level);
        document.documentElement.dataset.motion = level;
        document.querySelectorAll('.motion-seg-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.level === level);
        });
    }

    /* ============ 工具方法 ============ */

    cleanStr(v) { return String(v ?? '').trim(); }

    safeModuleId(v) {
        const s = this.cleanStr(v);
        if (!s) return '';
        return /^[A-Za-z0-9._-]+$/.test(s) ? s : '';
    }

    safeModuleDir(v) {
        const s = this.cleanStr(v);
        if (!s) return '';
        return s.startsWith('/data/adb/modules/') ? s : '';
    }

    parseModuleInfo(v) {
        if (!v) return null;
        if (typeof v === 'object') return v;
        if (typeof v !== 'string') return null;
        const s = v.trim();
        if (!s) return null;
        if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
            try { return JSON.parse(s); } catch (e) { console.warn(e); }
        }
        return { id: s };
    }

    loadModuleInfo() {
        try {
            if (!window.ksu || typeof ksu.moduleInfo !== 'function') return;
            const raw = ksu.moduleInfo();
            const info = this.parseModuleInfo(raw);
            if (!info) return;

            const moduleDir = this.safeModuleDir(info.moduleDir || info.module_dir);
            const moduleId = this.safeModuleId(info.id || info.moduleId || info.module_id);

            if (moduleDir) this.mod = moduleDir;
            if (moduleId) {
                this.moduleId = moduleId;
                this.pdir = `/data/adb/${moduleId}_data`;
                if (!moduleDir) this.mod = `/data/adb/modules/${moduleId}`;
            }
        } catch (e) { console.warn(e); }
    }

    escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    shQuote(s) {
        const v = String(s);
        return `'${v.replace(/'/g, `'\"'\"'`)}'`;
    }

    normalizeOutput(v) {
        if (v === null || v === undefined) return '';
        if (typeof v === 'string') return v;
        if (typeof v === 'object') {
            if (typeof v.stdout === 'string') return v.stdout;
            if (typeof v.stderr === 'string') return v.stderr;
            try { return JSON.stringify(v); } catch (e) { return String(v); }
        }
        return String(v);
    }

    b64EncodeUtf8(s) {
        const v = String(s ?? '');
        try {
            if (typeof TextEncoder === 'function') {
                const bytes = new TextEncoder().encode(v);
                let binary = '';
                const chunk = 0x8000;
                for (let i = 0; i < bytes.length; i += chunk) {
                    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
                }
                return btoa(binary);
            }
        } catch (e) { console.warn(e); }
        try {
            return btoa(unescape(encodeURIComponent(v)));
        } catch (e) { console.warn(e); }
        return btoa(v);
    }

    firstLine(s) {
        const v = (s || '').toString().trim();
        if (!v) return '';
        const l = v.split('\n').map(x => x.trim()).find(x => x);
        return l || '';
    }

    cut(s, maxLen = 140) {
        const v = String(s ?? '');
        if (v.length <= maxLen) return v;
        return v.slice(0, maxLen - 1) + '…';
    }

    toastErr(prefix, res) {
        const e = this.firstLine(res?.stderr);
        const n = (res && typeof res.errno !== 'undefined') ? res.errno : '?';
        const msg = e ? `${prefix}失败(errno=${n}): ${e}` : `${prefix}失败(errno=${n})`;
        this.toast(this.cut(msg));
    }

    vibrate(ms = 10) {
        try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* ignore */ }
    }

    /* ============ KernelSU 执行层 ============ */

    async execFull(cmd, timeoutMs = 8000) {
        return new Promise(resolve => {
            const cb = `cb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            let done = false;
            const finish = (res) => {
                if (done) return;
                done = true;
                try { delete window[cb]; } catch (e) { /* ignore */ }
                resolve(res);
            };
            const tm = setTimeout(() => {
                finish({ errno: 124, stdout: '', stderr: 'timeout' });
            }, timeoutMs);
            window[cb] = (errno, stdout, stderr) => {
                clearTimeout(tm);
                finish({
                    errno: typeof errno === 'number' ? errno : parseInt(errno || 0),
                    stdout: this.normalizeOutput(stdout),
                    stderr: this.normalizeOutput(stderr),
                });
            };
            try {
                ksu.exec(cmd, "{}", cb);
            } catch (e) {
                clearTimeout(tm);
                finish({ errno: 127, stdout: '', stderr: String(e) });
            }
        });
    }

    async execOut(cmd, timeoutMs = 8000) {
        const { stdout } = await this.execFull(cmd, timeoutMs);
        return stdout ? stdout.trim() : '';
    }

    async readFile(path, timeoutMs = 8000) {
        const cmd = `/system/bin/cat ${this.shQuote(path)} 2>/dev/null`;
        const { stdout } = await this.execFull(cmd, timeoutMs);
        return stdout || '';
    }

    async writeFile(path, content, timeoutMs = 8000) {
        const b64 = this.b64EncodeUtf8(content);
        const script = 'umask 022; printf %s \"$1\" | /system/bin/base64 -d > \"$2\"';
        const cmd = `/system/bin/sh -c ${this.shQuote(script)} sh ${this.shQuote(b64)} ${this.shQuote(path)}`;
        return await this.execFull(cmd, timeoutMs);
    }

    ltpoText() {
        if (this.ltpoMode === 'disable') return '强制禁用';
        if (this.ltpoMode === 'keep') return '保留(全局不生效)';
        if (this.ltpoMode === 'compat') return '兼容模式';
        return this.ltpoMode || '未知';
    }

    /* ============ 初始化 ============ */

    async init() {
        this.loadModuleInfo();
        await this.loadLtpoMode();
        await this.loadRates();
        await this.loadConf();
        await this.loadApps();
        this.render();
        this.bindEv();
        this.applyModeUi();
    }

    bindEv() {
        document.querySelectorAll('.tab-item').forEach(t => {
            t.addEventListener('click', e => {
                this.vibrate(8);
                this.page(e.currentTarget.dataset.page);
            });
        });

        document.querySelectorAll('.theme-seg-btn[data-mode]').forEach(b => {
            b.addEventListener('click', e => {
                this.vibrate(8);
                this.applyTheme(e.currentTarget.dataset.mode);
            });
        });

        document.querySelectorAll('.motion-seg-btn').forEach(b => {
            b.addEventListener('click', e => {
                this.vibrate(8);
                this.applyMotion(e.currentTarget.dataset.level);
            });
        });

        document.getElementById('save-global-rate').addEventListener('click', () => this.saveRate());
        document.getElementById('scan-rates').addEventListener('click', () => {
            this.confirm('全量扫描', '此操作会读取系统当前支持的刷新率档位，不会持久修改系统。是否继续？', () => this.scan());
        });
        document.getElementById('save-rates').addEventListener('click', () => this.saveRates());
        document.getElementById('save-app-switch').addEventListener('click', () => this.saveAppSwitch());

        const intv = document.getElementById('app-switch-interval');
        const bump = (delta) => {
            if (!intv) return;
            const min = parseInt(intv.min || '1', 10);
            const max = parseInt(intv.max || '10', 10);
            const cur = parseInt(intv.value || String(min), 10);
            const base = Number.isFinite(cur) ? cur : min;
            intv.value = String(Math.max(min, Math.min(max, base + delta)));
            this.vibrate(6);
        };
        document.getElementById('app-switch-interval-dec')?.addEventListener('click', () => bump(-1));
        document.getElementById('app-switch-interval-inc')?.addEventListener('click', () => bump(1));

        const search = document.getElementById('app-search');
        if (search) {
            const wrap = search.closest('.app-search');
            search.addEventListener('input', e => {
                this.keyword = String(e.target.value || '').trim().toLowerCase();
                if (wrap) wrap.classList.toggle('has-text', !!this.keyword);
                this.applyFilter();
            });
            const clear = document.getElementById('app-search-clear');
            clear?.addEventListener('click', () => {
                search.value = '';
                this.keyword = '';
                if (wrap) wrap.classList.remove('has-text');
                this.applyFilter();
            });
        }
        const sys = document.getElementById('app-include-system');
        sys?.addEventListener('change', e => {
            this.showSys = !!e.target.checked;
            this.reloadAppList();
        });

        document.getElementById('app-sheet').addEventListener('click', e => {
            if (e.target.id === 'app-sheet') this.closeSheet();
        });
        document.getElementById('sheet-close').addEventListener('click', () => this.closeSheet());
        document.getElementById('sheet-remove').addEventListener('click', () => this.removeRule());

        document.getElementById('confirm-cancel').addEventListener('click', () => {
            document.getElementById('confirm-modal').classList.remove('show');
            this.lockScroll(false);
        });
    }

    /* ============ 数据加载 ============ */

    async loadLtpoMode() {
        try {
            const raw = await this.execOut(`/system/bin/cat ${this.shQuote(`${this.mod}/ltpo_mode`)} 2>/dev/null`);
            this.ltpoMode = raw ? raw.trim() : '';
        } catch (e) {
            this.ltpoMode = '';
        }
    }

    applyModeUi() {
        const saveBtn = document.getElementById('save-global-rate');
        const note = document.getElementById('global-disabled-note');
        if (this.ltpoMode === 'keep') {
            saveBtn?.classList.add('disabled');
            note && (note.style.display = 'block');
        } else {
            saveBtn?.classList.remove('disabled');
            note && (note.style.display = 'none');
        }
        const m = document.getElementById('current-ltpo-mode');
        if (m) m.textContent = this.ltpoText();

        const chip = document.getElementById('hero-ltpo');
        if (chip) {
            chip.classList.remove('on', 'warn');
            if (this.ltpoMode === 'disable') { chip.textContent = 'LTPO 强制禁用'; chip.classList.add('on'); }
            else if (this.ltpoMode === 'keep') { chip.textContent = 'LTPO 保留 · 全局不生效'; chip.classList.add('warn'); }
            else if (this.ltpoMode === 'compat') { chip.textContent = 'LTPO 兼容模式'; chip.classList.add('on'); }
            else chip.textContent = 'LTPO 状态未知';
        }
    }

    async loadConf() {
        try {
            const c = await this.readFile(`${this.mod}/config.json`);
            if (c) {
                const p = JSON.parse(c);
                if (p.globalRateId !== undefined) this.conf.rateId = p.globalRateId;
                if (p.appSwitchEnabled !== undefined) this.conf.appSw = p.appSwitchEnabled;
                if (p.appSwitchInterval !== undefined) this.conf.appIntv = p.appSwitchInterval;
            }
        } catch (e) { console.warn(e); }
    }

    async loadRates() {
        try {
            const c = await this.readFile(`${this.mod}/rates.conf`);
            this.rates = [];
            if (!c) return;
            c.split('\n').forEach(l => {
                if (!l.trim()) return;
                const p = l.split(':');
                if (p.length >= 6) {
                    this.rates.push({
                        id: parseInt(p[0]), w: p[1], h: p[2], fps: parseInt(p[3]),
                        type: p[4], base: p[5] === '1', ord: p[6] ? parseInt(p[6]) : 0
                    });
                }
            });
        } catch (e) { console.warn(e); }
    }

    /* ============ 扫描与保存 ============ */

    ratesConfText() {
        return this.rates.map(r => `${r.id}:${r.w}:${r.h}:${r.fps}:${r.type}:${r.base ? '1' : '0'}:${r.ord || 0}`).join('\n');
    }

    async scan() {
        this.toast('正在扫描档位...');
        const raw = await this.execOut(`/system/bin/dumpsys SurfaceFlinger 2>/dev/null | /system/bin/grep 'id=[0-9]*, hwcId='`, 15000);
        if (!raw) {
            this.toast('扫描失败：未读取到档位信息');
            return;
        }
        const map = new Map();
        raw.split('\n').filter(l => l.trim()).forEach(l => {
            const id = l.match(/id=(\d+),/)?.[1];
            const res = l.match(/resolution=(\d+)x(\d+)/);
            const rate = l.match(/(?:vsyncRate|refreshRate)=([0-9.]+)/)?.[1];
            if (id && res && rate && !map.has(id)) {
                map.set(id, { id: parseInt(id), w: res[1], h: res[2], fps: Math.round(parseFloat(rate)) });
            }
        });
        const arr = Array.from(map.values());
        if (!arr.length) { this.toast('扫描失败：未识别到任何档位'); return; }
        arr.sort((a, b) => a.fps !== b.fps ? a.fps - b.fps : parseInt(a.w) - parseInt(b.w));

        // 保留已配置过的属性，新档位按原生处理
        const old = new Map(this.rates.map(r => [r.id, r]));
        this.rates = arr.map(r => {
            const p = old.get(r.id);
            return { ...r, type: p ? p.type : 'native', base: !!(p && p.base), ord: p ? (p.ord || 0) : 0 };
        });

        const res = await this.writeFile(`${this.mod}/rates.conf`, this.ratesConfText());
        if (res.errno !== 0) { this.toastErr('保存档位', res); return; }
        await this.sync();

        this.drawSettings();
        this.drawSelector();
        this.updInfo();
        this.vibrate(15);
        this.toast(`扫描完成，共 ${this.rates.length} 个档位，已保存`);
    }

    async saveRates() {
        if (this.rates.some(r => r.type === 'overclock' && (!r.ord || r.ord < 1))) {
            this.toast('请为所有超频档位填写切换顺序(从1开始)');
            return;
        }
        if (!this.rates.some(r => r.base)) {
            this.toast('请至少设置一个原生基准');
            return;
        }
        const res = await this.writeFile(`${this.mod}/rates.conf`, this.ratesConfText());
        if (res.errno !== 0) { this.toastErr('保存', res); return; }
        await this.sync();
        this.updInfo();
        this.drawSelector();
        this.vibrate(15);
        this.toast('档位配置已保存');
    }

    async saveRate() {
        if (this.ltpoMode === 'keep') { this.toast('保留LTPO模式：全局档位不生效'); return; }
        const el = document.querySelector('#rate-selector .rate-item.active');
        if (!el) { this.toast('请选择刷新率'); return; }
        const id = parseInt(el.dataset.id);
        this.conf.rateId = id;
        const obj = { globalRateId: id, appSwitchEnabled: this.conf.appSw, appSwitchInterval: this.conf.appIntv };
        const res = await this.writeFile(`${this.mod}/config.json`, JSON.stringify(obj));
        if (res.errno !== 0) { this.toastErr('保存', res); return; }
        await this.sync();
        const r = this.rates.find(x => x.id === id);
        await this.apply(id);
        this.updInfo();
        this.vibrate(15);
        this.toast(`已保存: ${r?.fps || id}Hz (ID:${id})`);
    }

    /* ============ 刷率切换链（核心逻辑，勿动） ============ */

    rateOf(id) { return this.rates.find(r => r.id === id) || null; }

    nativeFor(res) {
        const n = this.rates.find(r => `${r.w}x${r.h}` === res && r.base);
        return n ? n.id : 1;
    }

    ocUp(res, to) { return this.ocRange(res, 0, to); }

    ocDown(res, from) { return this.ocRange(res, from, 0); }

    ocRange(res, from, to) {
        if (from < to) {
            return this.rates.filter(r => `${r.w}x${r.h}` === res && r.type === 'overclock' && r.ord > from && r.ord <= to)
                .sort((a, b) => a.ord - b.ord).map(r => r.id);
        }
        return this.rates.filter(r => `${r.w}x${r.h}` === res && r.type === 'overclock' && r.ord < from && r.ord >= to)
            .sort((a, b) => b.ord - a.ord).map(r => r.id);
    }

    async apply(tid) {
        if (tid === this.curId) return;
        const t = this.rateOf(tid);
        if (!t) {
            await this.execOut(`/system/bin/service call SurfaceFlinger 1035 i32 ${tid}`, 8000);
            this.curId = tid;
            return;
        }
        await this.execOut('/system/bin/settings put system peak_refresh_rate 240.0', 8000);
        await this.execOut('/system/bin/settings put system min_refresh_rate 10.0', 8000);

        const tt = t.type, tr = `${t.w}x${t.h}`, to = t.ord || 0;
        const c = this.rateOf(this.curId);
        const ct = c?.type, cr = c ? `${c.w}x${c.h}` : null, co = c?.ord || 0;

        if (!tt || tt === 'native') {
            if (ct === 'overclock' && this.curId) {
                for (const i of this.ocDown(cr, co)) await this.execOut(`/system/bin/service call SurfaceFlinger 1035 i32 ${i}`, 8000);
                await this.execOut(`/system/bin/service call SurfaceFlinger 1035 i32 ${this.nativeFor(cr)}`, 8000);
            }
            await this.execOut(`/system/bin/service call SurfaceFlinger 1035 i32 ${tid}`, 8000);
            this.curId = tid;
            return;
        }

        if (tt === 'overclock') {
            const tn = this.nativeFor(tr);
            if (ct === 'overclock' && cr === tr && this.curId) {
                for (const i of this.ocRange(tr, co, to)) await this.execOut(`/system/bin/service call SurfaceFlinger 1035 i32 ${i}`, 8000);
            } else {
                if (ct === 'overclock' && this.curId) {
                    for (const i of this.ocDown(cr, co)) await this.execOut(`/system/bin/service call SurfaceFlinger 1035 i32 ${i}`, 8000);
                    await this.execOut(`/system/bin/service call SurfaceFlinger 1035 i32 ${this.nativeFor(cr)}`, 8000);
                }
                await this.execOut(`/system/bin/service call SurfaceFlinger 1035 i32 ${tn}`, 8000);
                for (const i of this.ocUp(tr, to)) await this.execOut(`/system/bin/service call SurfaceFlinger 1035 i32 ${i}`, 8000);
            }
        }
        this.curId = tid;
    }

    /* ============ 应用列表（含名称 / 图标解析） ============ */

    ksuList(type) {
        try {
            if (!window.ksu || typeof window.ksu.listPackages !== 'function') return [];
            const r = window.ksu.listPackages(type);
            const a = Array.isArray(r) ? r : JSON.parse(r);
            return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x) : [];
        } catch (e) { return []; }
    }

    ksuInfo(packages) {
        if (!packages.length) return new Map();
        try {
            if (!window.ksu || typeof window.ksu.getPackagesInfo !== 'function') return new Map();
            const raw = window.ksu.getPackagesInfo(JSON.stringify(packages));
            const arr = Array.isArray(raw) ? raw : JSON.parse(raw);
            const m = new Map();
            if (Array.isArray(arr)) {
                arr.forEach(x => {
                    if (x && x.packageName && !x.error) m.set(x.packageName, x);
                });
            }
            return m;
        } catch (e) { return new Map(); }
    }

    loadInstalled() {
        const user = this.ksuList('user');
        const sys = this.showSys ? this.ksuList('system') : [];
        const pkgs = sys.concat(user);
        if (!pkgs.length) return [];
        const info = this.ksuInfo(pkgs);
        const sysSet = new Set(sys);
        return pkgs.map(pkg => ({
            pkg,
            sys: sysSet.has(pkg),
            name: (info.get(pkg) || {}).appLabel || ''
        }));
    }

    async loadRules() {
        try {
            const c = await this.readFile(`${this.mod}/apps.conf`);
            return (c || '').split('\n').filter(l => l.includes('=')).map(l => {
                const i = l.indexOf('=');
                const pkg = l.slice(0, i).trim();
                const rest = l.slice(i + 1).replace(/[\s\r]+/g, '');
                const p = rest.split(':');
                const id = parseInt(p[0], 10);
                return { pkg, id: Number.isFinite(id) ? id : null, on: p.length < 2 || p[1] === '1' };
            }).filter(x => x.pkg && x.id != null);
        } catch (e) { console.warn(e); return []; }
    }

    async loadApps() {
        this.apps = await this.loadRules();
        let installed = [];
        try { installed = await this.loadInstalled(); } catch (e) { console.warn(e); }
        const rules = new Map(this.apps.map(r => [r.pkg, r]));
        this.appList = installed.map(x => {
            const r = rules.get(x.pkg);
            return {
                pkg: x.pkg, sys: !!x.sys,
                id: r ? r.id : null, on: r ? !!r.on : false,
                name: x.name || ''
            };
        });
        this.sortAppList();
        this.appMap = new Map(this.appList.map(a => [a.pkg, a]));
    }

    sortAppList() {
        const rank = a => a.on ? 0 : (a.id != null ? 1 : (a.sys ? 3 : 2));
        this.appList.sort((x, y) => rank(x) - rank(y) || String(x.pkg).localeCompare(String(y.pkg)));
    }

    findApp(pkg) { return this.appMap.get(pkg) || null; }

    pkgLabel(pkg) {
        const parts = String(pkg || '').split('.').filter(x => x && !/^(com|org|net|cn|io|gov|co)$/i.test(x));
        while (parts.length > 1 && /^(watch|wear|wearable|app|client|phone|mobile)$/i.test(parts[parts.length - 1])) parts.pop();
        const t = parts.pop() || String(pkg || '');
        return t.replace(/[_\-]+/g, ' ').replace(/^./, c => c.toUpperCase());
    }

    commitRules() {
        const out = [];
        const seen = new Set();
        this.appList.forEach(a => { if (a.id != null) { out.push({ pkg: a.pkg, id: a.id, on: !!a.on }); seen.add(a.pkg); } });
        this.apps.forEach(r => { if (!seen.has(r.pkg) && r.id != null) out.push(r); });   // 保留已卸载应用的旧配置
        this.apps = out;
    }

    async saveApps() {
        const c = this.apps.map(x => `${x.pkg}=${x.id}:${x.on === false ? 0 : 1}`).join('\n');
        const res = await this.writeFile(`${this.mod}/apps.conf`, c);
        if (res.errno !== 0) { this.toastErr('保存', res); return false; }
        await this.sync();
        return true;
    }

    async sync() {
        const p = this.shQuote(this.pdir);
        const m = this.shQuote(this.mod);
        await this.execOut(`/system/bin/mkdir -p ${p} && /system/bin/cp -af ${m}/config.json ${m}/apps.conf ${m}/rates.conf ${p}/ 2>/dev/null`, 8000);
    }

    defaultRateId() {
        if (!this.rates.length) return null;
        const g = this.conf.rateId;
        if (g != null && this.rateOf(g)) return g;
        const nativeTop = this.rates.filter(r => r.type !== 'overclock').sort((a, b) => b.fps - a.fps)[0];
        return (nativeTop || this.rates[0]).id;
    }

    /* ============ 渲染层 ============ */

    render() {
        this.drawSelector();
        this.drawSettings();
        this.drawApps();
        this.drawAppSwitch();
        this.updInfo();
    }

    stagger(container) {
        container.querySelectorAll('.pop-in').forEach((el, i) => {
            el.style.animationDelay = `${Math.min(i * 45, 400)}ms`;
        });
    }

    drawSelector() {
        const el = document.getElementById('rate-selector');
        const note = document.getElementById('rate-note');
        if (!this.rates.length) { el.innerHTML = ''; note.style.display = 'block'; return; }
        note.style.display = 'none';

        // 按分辨率分组
        const groups = [];
        const seen = new Map();
        this.rates.forEach(r => {
            const key = `${r.w}x${r.h}`;
            if (!seen.has(key)) { seen.set(key, []); groups.push(key); }
            seen.get(key).push(r);
        });

        el.innerHTML = groups.map(key => {
            const items = seen.get(key).map(r => {
                const typeClass = r.type === 'overclock' ? 'overclock' : '';
                const typeText = r.type === 'overclock' ? '超频' : '原生';
                const active = this.conf.rateId === r.id ? 'active' : '';
                return `
                <div class="rate-item pop-in ${active}" data-id="${r.id}">
                    <div class="rate-item-left">
                        <span class="rate-label">${this.escapeHtml(r.fps)}Hz</span>
                        <span class="rate-type-tag ${typeClass}">${typeText}</span>
                    </div>
                    <span class="rate-id">ID ${this.escapeHtml(r.id)}</span>
                </div>`;
            }).join('');
            return `<div class="rate-group-label">${this.escapeHtml(key)} 分辨率</div>${items}`;
        }).join('');
        this.stagger(el);

        if (this.ltpoMode === 'keep') return;
        el.querySelectorAll('.rate-item').forEach(x => {
            x.addEventListener('click', e => {
                this.vibrate(8);
                el.querySelectorAll('.rate-item').forEach(y => y.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
        });
    }

    drawSettings() {
        const el = document.getElementById('rate-settings-list');
        if (!this.rates.length) {
            el.innerHTML = '<div class="empty-state">请先执行「全量扫描」<br>扫描你设备支持的刷新率档位</div>';
            return;
        }
        el.innerHTML = this.rates.map((r, i) => `
            <div class="rate-setting-item pop-in ${r.base ? 'is-base' : ''}" data-idx="${i}">
                <div class="rate-setting-header">
                    <div class="rate-setting-info">
                        <span class="rate-setting-fps">${r.fps}Hz</span>
                        ${r.base ? '<span class="rate-setting-badge">基准</span>' : ''}
                    </div>
                    <div class="rate-setting-types">
                        <span class="type-btn native ${r.type === 'native' ? 'active' : ''}" data-idx="${i}" data-type="native">原生</span>
                        <span class="type-btn overclock ${r.type === 'overclock' ? 'active' : ''}" data-idx="${i}" data-type="overclock">超频</span>
                    </div>
                </div>
                <div class="rate-setting-meta">${r.w}x${r.h} · ID ${r.id}</div>
                <div class="rate-setting-action">
                    <div class="base-btn ${r.base ? 'is-base' : ''}" data-idx="${i}">
                        ${r.base ? '✓ 已设为该分辨率的原生基准' : '设为该分辨率的原生基准'}
                    </div>
                </div>
                ${r.type === 'overclock' ? `
                    <div class="order-input-row">
                        <span class="order-label">切换顺序 <span class="required">*必填</span></span>
                        <input type="number" class="order-input" data-idx="${i}" value="${r.ord || ''}" placeholder="必填" inputmode="numeric">
                    </div>
                ` : ''}
            </div>
        `).join('');
        this.stagger(el);

        el.querySelectorAll('.type-btn').forEach(b => {
            b.addEventListener('click', e => {
                this.vibrate(6);
                const i = parseInt(e.target.dataset.idx), t = e.target.dataset.type;
                this.rates[i].type = t;
                if (t === 'native') this.rates[i].ord = 0;
                this.drawSettings();
            });
        });
        el.querySelectorAll('.base-btn').forEach(b => {
            b.addEventListener('click', e => {
                this.vibrate(10);
                const i = parseInt(e.target.dataset.idx), r = this.rates[i], res = `${r.w}x${r.h}`;
                this.rates.forEach(x => { if (`${x.w}x${x.h}` === res) x.base = false; });
                this.rates[i].base = true;
                this.rates[i].type = 'native';
                this.rates[i].ord = 0;
                this.drawSettings();
            });
        });
        el.querySelectorAll('.order-input').forEach(inp => {
            inp.addEventListener('change', e => {
                this.rates[parseInt(e.target.dataset.idx)].ord = parseInt(e.target.value) || 0;
            });
        });
    }

    matchKeyword(a) {
        const k = this.keyword;
        if (!k) return true;
        if (a.name.toLowerCase().indexOf(k) >= 0) return true;
        if (a.pkg.toLowerCase().indexOf(k) >= 0) return true;
        if (!a.name) return this.pkgLabel(a.pkg).toLowerCase().indexOf(k) >= 0;
        return false;
    }

    appAvatar(a) {
        const url = `ksu://icon/${this.escapeHtml(a.pkg)}`;
        return `<img src="${url}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`;
    }

    appSub(a) {
        if (a.id == null) return this.escapeHtml(a.pkg);
        const r = this.rateOf(a.id);
        const rate = r ? `${r.fps}Hz` : `ID ${a.id}`;
        return `${this.escapeHtml(a.pkg)} · ${this.escapeHtml(rate)}`;
    }

    rowHtml(a) {
        return `
            <div class="app-row${a.on ? ' is-on' : ''}" data-pkg="${this.escapeHtml(a.pkg)}">
                <div class="app-icon" data-role="icon">${this.appAvatar(a)}</div>
                <div class="app-main">
                    <div class="app-name">${this.escapeHtml(a.name || this.pkgLabel(a.pkg))}</div>
                    <div class="app-sub" data-role="sub" data-h="${this.appSub(a)}">${this.appSub(a)}</div>
                </div>
                <label class="ui-switch">
                    <input type="checkbox" data-role="switch" ${a.on ? 'checked' : ''} aria-label="启用 ${this.escapeHtml(a.pkg)}">
                    <span class="slider"></span>
                </label>
            </div>`;
    }

    drawApps() {
        const el = document.getElementById('app-list');
        if (!el) return;
        if (!this.appList.length) {
            el.innerHTML = '<div class="empty-state">未读取到已安装应用<br>请确认 Root 管理器已授予本模块权限，且 WebUI 宿主支持应用列表接口</div>';
            this.rowMap = new Map();
            return;
        }
        el.innerHTML = this.appList.map(a => this.rowHtml(a)).join('');
        this.bindRows(el);
        this.applyFilter();
    }

    /* 关键字过滤只切显隐，不重建 DOM */
    applyFilter() {
        const el = document.getElementById('app-list');
        if (!el || !this.appList.length) return;
        let visible = 0;
        for (let i = 0; i < this.appList.length; i++) {
            const a = this.appList[i];
            const row = this.rowMap.get(a.pkg);
            if (!row) continue;
            const show = this.matchKeyword(a);
            const want = show ? '' : 'none';
            if (row.style.display !== want) row.style.display = want;
            if (show) visible++;
        }
        let note = el.querySelector('.empty-state');
        if (!visible) {
            if (!note) {
                note = document.createElement('div');
                note.className = 'empty-state';
                note.textContent = '没有匹配的应用';
                el.appendChild(note);
            }
        } else if (note) {
            note.remove();
        }
    }

    /* 列表顺序变化后把单个行挪到新位置（保留节点与事件监听） */
    placeRow(a) {
        const el = document.getElementById('app-list');
        if (!el) return;
        const row = this.rowMap.get(a.pkg);
        if (!row) return;
        const idx = this.appList.indexOf(a);
        let anchor = null;
        for (let i = idx + 1; i < this.appList.length && !anchor; i++) {
            anchor = this.rowMap.get(this.appList[i].pkg) || null;
        }
        el.insertBefore(row, anchor);
        this.applyFilter();
    }

    bindRows(el) {
        this.rowMap = new Map();
        el.querySelectorAll('.app-row').forEach(row => {
            const pkg = row.dataset.pkg;
            this.rowMap.set(pkg, row);
            row.addEventListener('click', e => {
                if (e.target.closest && e.target.closest('.ui-switch')) return;
                this.vibrate(8);
                this.openSheet(pkg);
            });
            const sw = row.querySelector('[data-role=switch]');
            sw?.addEventListener('change', e => {
                e.stopPropagation();
                this.setAppOn(pkg, !!e.target.checked);
            });
        });
    }


    patchRow(a) {
        const row = this.rowMap && this.rowMap.get(a.pkg);
        if (!row) return false;
        if (row.classList.contains('is-on') !== !!a.on) row.classList.toggle('is-on', !!a.on);
        const nm = row.querySelector('.app-name');
        if (nm) {
            const t = a.name || this.pkgLabel(a.pkg);
            if (nm.textContent !== t) nm.textContent = t;
        }
        const sub = row.querySelector('[data-role=sub]');
        if (sub) {
            const t = this.appSub(a);
            if (sub.dataset.h !== t) { sub.dataset.h = t; sub.innerHTML = t; }
        }
        const sw = row.querySelector('[data-role=switch]');
        if (sw && sw.checked !== !!a.on) sw.checked = !!a.on;
        return true;
    }

    async setAppOn(pkg, on) {
        const a = this.findApp(pkg);
        if (!a) return;
        if (on && a.id == null) {
            const d = this.defaultRateId();
            if (d == null) {
                this.toast('请先在「设置」页全量扫描档位');
                this.patchRow(a);
                return;
            }
            a.id = d;
        }
        a.on = on;
        this.commitRules();
        await this.saveApps();
        this.vibrate(10);
        this.toast(on ? `已启用 ${a.name || pkg}` : `已停用 ${a.name || pkg}`);
        this.sortAppList();
        this.placeRow(a);
        this.patchRow(a);
    }

    async reloadAppList() {
        await this.loadApps();
        this.drawApps();
    }

    updInfo() {
        const gid = document.getElementById('current-global-id');
        const nbase = document.getElementById('current-native-base');
        gid.textContent = (this.ltpoMode === 'keep') ? '不生效(保留LTPO)' : (this.conf.rateId || '未设置');
        const bs = this.rates.filter(r => r.base);
        nbase.textContent = bs.length ? bs.map(b => `${b.w}x${b.h}→ID:${b.id}`).join(', ') : '未设置';

        // Hero 状态卡
        const valueEl = document.getElementById('hero-value');
        const fpsEl = document.getElementById('hero-fps');
        const unitEl = document.getElementById('hero-unit');
        const metaEl = document.getElementById('hero-meta');
        if (fpsEl) {
            const r = this.conf.rateId != null ? this.rateOf(this.conf.rateId) : null;
            if (this.ltpoMode === 'keep') {
                fpsEl.textContent = 'LTPO';
                unitEl.textContent = '';
                metaEl.textContent = '保留系统 LTPO，由应用配置驱动';
            } else if (r) {
                fpsEl.textContent = r.fps;
                unitEl.textContent = 'Hz';
                metaEl.textContent = `${r.w}x${r.h} · ID ${r.id}${r.type === 'overclock' ? ' · 超频' : ' · 原生'}`;
            } else if (this.conf.rateId != null) {
                fpsEl.textContent = this.conf.rateId;
                unitEl.textContent = '';
                metaEl.textContent = `档位 ID ${this.conf.rateId}（未在已扫描列表中）`;
            } else {
                fpsEl.textContent = '--';
                unitEl.textContent = '';
                metaEl.textContent = '尚未设置全局档位';
            }
            if (valueEl) {
                valueEl.classList.remove('pop');
                void valueEl.offsetWidth;
                valueEl.classList.add('pop');
            }
        }
    }

    drawAppSwitch() {
        const sw = document.getElementById('app-switch-enabled');
        const it = document.getElementById('app-switch-interval');
        if (sw) sw.checked = !!this.conf.appSw;
        if (it) it.value = String(this.conf.appIntv || 1);
    }

    async saveAppSwitch() {
        const sw = document.getElementById('app-switch-enabled');
        const it = document.getElementById('app-switch-interval');
        const enabled = !!sw?.checked;
        const interval = parseInt(it?.value || '1', 10);
        if (!Number.isFinite(interval) || interval < 1) { this.toast('轮询间隔至少为1秒'); return; }
        this.conf.appSw = enabled;
        this.conf.appIntv = interval;
        const obj = { globalRateId: this.conf.rateId, appSwitchEnabled: this.conf.appSw, appSwitchInterval: this.conf.appIntv };
        const res = await this.writeFile(`${this.mod}/config.json`, JSON.stringify(obj));
        if (res.errno !== 0) { this.toastErr('保存', res); return; }
        await this.sync();
        this.vibrate(15);
        this.toast('应用切换设置已保存');
    }

    /* ============ 页面切换 ============ */

    page(p) {
        document.querySelectorAll('.ui-content').forEach(x => x.classList.add('hidden'));
        const t = document.getElementById(`page-${p}`);
        if (!t) return;
        t.classList.remove('hidden', 'entering');
        void t.offsetWidth; // 重启动画
        t.classList.add('entering');
        document.querySelectorAll('.tab-item').forEach(x => x.classList.remove('active'));
        document.querySelector(`.tab-item[data-page="${p}"]`)?.classList.add('active');
    }

    /* ============ 弹层 ============ */

    /* ============ 应用档位配置弹层 ============ */

    openSheet(pkg) {
        if (!this.rates.length) {
            this.toast('请先在「设置」页全量扫描档位');
            this.page('settings');
            return;
        }
        const a = this.findApp(pkg);
        if (!a) return;
        this.sheetPkg = pkg;
        const name = document.getElementById('sheet-app-name');
        const sub = document.getElementById('sheet-app-sub');
        const icon = document.getElementById('sheet-app-icon');
        const rm = document.getElementById('sheet-remove');
        if (name) name.textContent = a.name || this.pkgLabel(a.pkg);
        if (sub) sub.textContent = a.pkg;
        if (icon) icon.innerHTML = this.appAvatar(a);
        if (rm) rm.style.display = a.id == null ? 'none' : '';
        this.renderSheetOptions();
        document.getElementById('app-sheet').classList.add('show');
        this.lockScroll(true);
    }

    closeSheet() {
        document.getElementById('app-sheet').classList.remove('show');
        this.lockScroll(false);
        this.sheetPkg = '';
    }

    renderSheetOptions() {
        const el = document.getElementById('sheet-rate-list');
        if (!el) return;
        const a = this.findApp(this.sheetPkg);
        const sel = a ? a.id : null;
        const groups = [];
        const byRes = new Map();
        // 按 this.rates 原始顺序分组，保证与首页档位列表顺序一致
        this.rates.forEach(r => {
            const key = `${r.w}x${r.h}`;
            if (!byRes.has(key)) { byRes.set(key, []); groups.push(key); }
            byRes.get(key).push(r);
        });
        const multi = groups.length > 1;
        el.innerHTML = groups.map(key => `
            ${multi ? `<div class="rate-group-label">${this.escapeHtml(key.replace('x', ' × '))}</div>` : ''}
            ${byRes.get(key).map(r => `
                <div class="rate-opt${sel === r.id ? ' active' : ''}" data-id="${r.id}">
                    <div class="rate-opt-left">
                        <span class="rate-opt-fps">${r.fps}Hz</span>
                        <span class="rate-type-tag${r.type === 'overclock' ? ' overclock' : ''}">${r.type === 'overclock' ? '超频' : '原生'}</span>
                    </div>
                    <span class="rate-opt-meta">${multi ? this.escapeHtml(r.w + ' × ' + r.h) : 'ID ' + r.id}</span>
                </div>`).join('')}
        `).join('');
        el.querySelectorAll('.rate-opt').forEach(o => {
            o.addEventListener('click', e => this.pickRate(parseInt(e.currentTarget.dataset.id, 10)));
        });
    }

    async pickRate(id) {
        const a = this.findApp(this.sheetPkg);
        if (!a) return;
        a.id = id;
        a.on = true;
        this.commitRules();
        if (await this.saveApps()) {
            const r = this.rateOf(id);
            this.toast(`已设置 ${a.name || a.pkg} → ${r ? r.fps + 'Hz' : 'ID ' + id}`);
        }
        this.closeSheet();
        this.vibrate(15);
        this.sortAppList();
        this.placeRow(a);
        this.patchRow(a);
    }

    async removeRule() {
        const a = this.findApp(this.sheetPkg);
        if (!a) return;
        a.id = null;
        a.on = false;
        this.apps = this.apps.filter(x => x.pkg !== a.pkg);
        this.commitRules();
        await this.saveApps();
        this.closeSheet();
        this.vibrate(10);
        this.toast('已移除该应用的配置');
        this.sortAppList();
        this.placeRow(a);
        this.patchRow(a);
    }

    /* 弹层打开时锁住背景滚动。overscroll-behavior 只能断连锁滚动，
       背景自身的滚动位置仍会被惯性带动，所以这里直接固定 overflow。 */
    lockScroll(on) {
        document.documentElement.classList.toggle('no-scroll', !!on);
    }

    confirm(title, msg, cb) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = msg;
        document.getElementById('confirm-modal').classList.add('show');
        this.lockScroll(true);
        const ok = document.getElementById('confirm-ok');
        const nok = ok.cloneNode(true);
        ok.parentNode.replaceChild(nok, ok);
        nok.addEventListener('click', () => {
            document.getElementById('confirm-modal').classList.remove('show');
            this.lockScroll(false);
            cb();
        });
    }

    toast(msg) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.classList.add('show');
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
    }
}

document.addEventListener('DOMContentLoaded', () => new AstraEngine());
