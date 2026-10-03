class AstraEngine {
    constructor() {
        this.defaultId = 'Astra_MaxRefresh_Pro';
        this.moduleId = this.defaultId;
        this.mod = `/data/adb/modules/${this.defaultId}`;
        this.pdir = `/data/adb/${this.defaultId}_data`;
        this.ltpoMode = '';
        this.rates = [];
        this.apps = [];
        this.conf = { rateId: null, appSw: true, appIntv: 1 };
        this.curId = null;
        this.toastTimer = null;
        this.themeMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
        this.initTheme();
        this.initMotion();
        this.init();
    }

    /* ============ Theme management (follow system default / light / dark) ============ */

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

    /* ============ Motion level (high / medium / low) ============ */

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

    /* ============ Utilities ============ */

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
        const msg = e ? `${prefix} failed (errno=${n}): ${e}` : `${prefix} failed (errno=${n})`;
        this.toast(this.cut(msg));
    }

    vibrate(ms = 10) {
        try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* ignore */ }
    }

    /* ============ KernelSU execution layer ============ */

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
        if (this.ltpoMode === 'disable') return 'Force disabled';
        if (this.ltpoMode === 'keep') return 'Kept (global inactive)';
        if (this.ltpoMode === 'compat') return 'Compatible mode';
        return this.ltpoMode || 'Unknown';
    }

    /* ============ Initialization ============ */

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
            this.confirm('Full Scan', 'This will read the refresh rate tiers currently supported by your system. It will not persistently modify the system. Continue?', () => this.scan());
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

        document.getElementById('add-app-config').addEventListener('click', () => this.showInput());
        document.getElementById('input-cancel').addEventListener('click', () => this.hideInput());
        document.getElementById('input-done').addEventListener('click', () => this.addApp());
        document.getElementById('app-input-modal').addEventListener('click', e => {
            if (e.target.id === 'app-input-modal') this.hideInput();
        });

        document.getElementById('confirm-cancel').addEventListener('click', () => {
            document.getElementById('confirm-modal').classList.remove('show');
        });
    }

    /* ============ Data loading ============ */

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
            if (this.ltpoMode === 'disable') { chip.textContent = 'LTPO force disabled'; chip.classList.add('on'); }
            else if (this.ltpoMode === 'keep') { chip.textContent = 'LTPO kept · global inactive'; chip.classList.add('warn'); }
            else if (this.ltpoMode === 'compat') { chip.textContent = 'LTPO compatible mode'; chip.classList.add('on'); }
            else chip.textContent = 'LTPO status unknown';
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

    /* ============ Scan and save ============ */

    async scan() {
        this.toast('Scanning tiers...');
        const raw = await this.execOut(`/system/bin/dumpsys SurfaceFlinger 2>/dev/null | /system/bin/grep 'id=[0-9]*, hwcId='`, 15000);
        if (!raw) {
            this.toast('Scan failed: no tier information was read');
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
        arr.sort((a, b) => a.fps !== b.fps ? a.fps - b.fps : parseInt(a.w) - parseInt(b.w));
        this.rates = arr.map(r => ({ ...r, type: 'native', base: false, ord: 0 }));
        this.drawSettings();
        this.drawSelector();
        this.vibrate(15);
        this.toast(`Scan complete, ${this.rates.length} tiers found`);
    }

    async saveRates() {
        if (this.rates.some(r => r.type === 'overclock' && (!r.ord || r.ord < 1))) {
            this.toast('Please fill in a switch order (starting at 1) for all overclock tiers');
            return;
        }
        if (!this.rates.some(r => r.base)) {
            this.toast('Please set at least one native baseline');
            return;
        }
        const lines = this.rates.map(r => `${r.id}:${r.w}:${r.h}:${r.fps}:${r.type}:${r.base ? '1' : '0'}:${r.ord || 0}`);
        const res = await this.writeFile(`${this.mod}/rates.conf`, `${lines.join('\n')}`);
        if (res.errno !== 0) { this.toastErr('Save', res); return; }
        await this.sync();
        this.updInfo();
        this.drawSelector();
        this.vibrate(15);
        this.toast('Tier configuration saved');
    }

    async saveRate() {
        if (this.ltpoMode === 'keep') { this.toast('Keep-LTPO mode: global tier has no effect'); return; }
        const el = document.querySelector('#rate-selector .rate-item.active');
        if (!el) { this.toast('Please select a refresh rate'); return; }
        const id = parseInt(el.dataset.id);
        this.conf.rateId = id;
        const obj = { globalRateId: id, appSwitchEnabled: this.conf.appSw, appSwitchInterval: this.conf.appIntv };
        const res = await this.writeFile(`${this.mod}/config.json`, JSON.stringify(obj));
        if (res.errno !== 0) { this.toastErr('Save', res); return; }
        await this.sync();
        const r = this.rates.find(x => x.id === id);
        await this.apply(id);
        this.updInfo();
        this.vibrate(15);
        this.toast(`Saved: ${r?.fps || id}Hz (ID:${id})`);
    }

    /* ============ Refresh switch chain (core logic, do not touch) ============ */

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

    /* ============ App configuration ============ */

    async loadApps() {
        try {
            const c = await this.readFile(`${this.mod}/apps.conf`);
            this.apps = (c || '').split('\n').filter(l => l.includes('=')).map(l => {
                const [p, i] = l.split('=');
                return { pkg: p.trim(), id: i.trim() };
            }).filter(x => x.pkg && x.id);
        } catch (e) { console.warn(e); }
    }

    async saveApps() {
        const c = this.apps.map(x => `${x.pkg}=${x.id}`).join('\n');
        const res = await this.writeFile(`${this.mod}/apps.conf`, c);
        if (res.errno !== 0) { this.toastErr('Save', res); return; }
        await this.sync();
    }

    async sync() {
        const p = this.shQuote(this.pdir);
        const m = this.shQuote(this.mod);
        await this.execOut(`/system/bin/mkdir -p ${p} && /system/bin/cp -af ${m}/config.json ${m}/apps.conf ${m}/rates.conf ${p}/ 2>/dev/null`, 8000);
    }

    /* ============ Rendering layer ============ */

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

        // Group by resolution
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
                const typeText = r.type === 'overclock' ? 'Overclock' : 'Native';
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
            return `<div class="rate-group-label">${this.escapeHtml(key)} resolution</div>${items}`;
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
            el.innerHTML = '<div class="empty-state">Please run "Full Scan" first<br>Scans the refresh rate tiers supported by your device</div>';
            return;
        }
        el.innerHTML = this.rates.map((r, i) => `
            <div class="rate-setting-item pop-in ${r.base ? 'is-base' : ''}" data-idx="${i}">
                <div class="rate-setting-header">
                    <div class="rate-setting-info">
                        <span class="rate-setting-fps">${r.fps}Hz</span>
                        ${r.base ? '<span class="rate-setting-badge">Baseline</span>' : ''}
                    </div>
                    <div class="rate-setting-types">
                        <span class="type-btn native ${r.type === 'native' ? 'active' : ''}" data-idx="${i}" data-type="native">Native</span>
                        <span class="type-btn overclock ${r.type === 'overclock' ? 'active' : ''}" data-idx="${i}" data-type="overclock">Overclock</span>
                    </div>
                </div>
                <div class="rate-setting-meta">${r.w}x${r.h} · ID ${r.id}</div>
                <div class="rate-setting-action">
                    <div class="base-btn ${r.base ? 'is-base' : ''}" data-idx="${i}">
                        ${r.base ? '✓ Set as native baseline for this resolution' : 'Set as native baseline for this resolution'}
                    </div>
                </div>
                ${r.type === 'overclock' ? `
                    <div class="order-input-row">
                        <span class="order-label">Switch order <span class="required">*required</span></span>
                        <input type="number" class="order-input" data-idx="${i}" value="${r.ord || ''}" placeholder="Required" inputmode="numeric">
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

    drawApps() {
        const el = document.getElementById('app-config-list');
        if (!this.apps.length) {
            el.innerHTML = '<div class="empty-state">No config yet<br>Tap "Add" in the top-right to create your first rule</div>';
            return;
        }
        el.innerHTML = this.apps.map((a, i) => `
            <div class="config-item pop-in">
                <span class="config-pkg">${this.escapeHtml(a.pkg)}</span>
                <span class="config-id">ID ${this.escapeHtml(a.id)}</span>
                <span class="config-delete" data-idx="${i}">Delete</span>
            </div>
        `).join('');
        this.stagger(el);
        el.querySelectorAll('.config-delete').forEach(x => {
            x.addEventListener('click', async e => {
                this.vibrate(10);
                this.apps.splice(parseInt(e.target.dataset.idx), 1);
                await this.saveApps();
                this.drawApps();
                this.toast('Deleted');
            });
        });
    }

    updInfo() {
        const gid = document.getElementById('current-global-id');
        const nbase = document.getElementById('current-native-base');
        gid.textContent = (this.ltpoMode === 'keep') ? 'Inactive (Keep-LTPO)' : (this.conf.rateId || 'Not set');
        const bs = this.rates.filter(r => r.base);
        nbase.textContent = bs.length ? bs.map(b => `${b.w}x${b.h}→ID:${b.id}`).join(', ') : 'Not set';

        // Hero status card
        const valueEl = document.getElementById('hero-value');
        const fpsEl = document.getElementById('hero-fps');
        const unitEl = document.getElementById('hero-unit');
        const metaEl = document.getElementById('hero-meta');
        if (fpsEl) {
            const r = this.conf.rateId != null ? this.rateOf(this.conf.rateId) : null;
            if (this.ltpoMode === 'keep') {
                fpsEl.textContent = 'LTPO';
                unitEl.textContent = '';
                metaEl.textContent = 'System LTPO kept, driven by per-app rules';
            } else if (r) {
                fpsEl.textContent = r.fps;
                unitEl.textContent = 'Hz';
                metaEl.textContent = `${r.w}x${r.h} · ID ${r.id}${r.type === 'overclock' ? ' · Overclock' : ' · Native'}`;
            } else if (this.conf.rateId != null) {
                fpsEl.textContent = this.conf.rateId;
                unitEl.textContent = '';
                metaEl.textContent = `Tier ID ${this.conf.rateId} (not in the scanned list)`;
            } else {
                fpsEl.textContent = '--';
                unitEl.textContent = '';
                metaEl.textContent = 'No global tier set yet';
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
        if (!Number.isFinite(interval) || interval < 1) { this.toast('Polling interval must be at least 1 second'); return; }
        this.conf.appSw = enabled;
        this.conf.appIntv = interval;
        const obj = { globalRateId: this.conf.rateId, appSwitchEnabled: this.conf.appSw, appSwitchInterval: this.conf.appIntv };
        const res = await this.writeFile(`${this.mod}/config.json`, JSON.stringify(obj));
        if (res.errno !== 0) { this.toastErr('Save', res); return; }
        await this.sync();
        this.vibrate(15);
        this.toast('Per-app switch settings saved');
    }

    /* ============ Page switching ============ */

    page(p) {
        document.querySelectorAll('.ui-content').forEach(x => x.classList.add('hidden'));
        const t = document.getElementById(`page-${p}`);
        if (!t) return;
        t.classList.remove('hidden', 'entering');
        void t.offsetWidth; // Restart animation
        t.classList.add('entering');
        document.querySelectorAll('.tab-item').forEach(x => x.classList.remove('active'));
        document.querySelector(`.tab-item[data-page="${p}"]`)?.classList.add('active');
    }

    /* ============ Overlay ============ */

    showInput() {
        document.getElementById('app-input-modal').classList.add('show');
        document.getElementById('app-package').value = '';
        document.getElementById('app-rate-id').value = '';
        setTimeout(() => document.getElementById('app-package').focus(), 350);
    }

    hideInput() { document.getElementById('app-input-modal').classList.remove('show'); }

    async addApp() {
        const pkg = document.getElementById('app-package').value.trim();
        const id = document.getElementById('app-rate-id').value.trim();
        if (!pkg || !id) { this.toast('Please fill in all fields'); return; }
        if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(pkg)) { this.toast('Invalid package name format'); return; }
        if (!/^[0-9]+$/.test(id)) { this.toast('Refresh rate ID must be a number'); return; }
        const idx = this.apps.findIndex(x => x.pkg === pkg);
        if (idx >= 0) this.apps[idx].id = id;
        else this.apps.push({ pkg, id });
        await this.saveApps();
        this.drawApps();
        this.hideInput();
        this.vibrate(15);
        this.toast('Configuration added');
    }

    confirm(title, msg, cb) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = msg;
        document.getElementById('confirm-modal').classList.add('show');
        const ok = document.getElementById('confirm-ok');
        const nok = ok.cloneNode(true);
        ok.parentNode.replaceChild(nok, ok);
        nok.addEventListener('click', () => {
            document.getElementById('confirm-modal').classList.remove('show');
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
