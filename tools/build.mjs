import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const prop = fs.readFileSync(path.join(root, 'module.prop'), 'utf8');
const ver = /^version=(.+)$/m.exec(prop)[1].trim();
const files = [
  'META-INF', 'module.prop', 'customize.sh', 'service.sh', 'post-fs-data.sh', 'uninstall.sh', 'common.sh', 'astra.sh',
  'bin/icons.dex', 'webroot/index.html', 'webroot/style.css', 'webroot/script.js', 'webroot/fonts', 'LICENSE',
];
for (const f of files) if (!fs.existsSync(path.join(root, f))) throw new Error(`缺少文件：${f}`);
for (const f of ['customize.sh', 'service.sh', 'post-fs-data.sh', 'uninstall.sh', 'common.sh', 'astra.sh', 'META-INF/com/google/android/update-binary']) {
  if (fs.readFileSync(path.join(root, f), 'utf8').includes('\r')) throw new Error(`${f} 含有 CRLF 换行`);
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', `Astra_MaxRefresh_Pro_${ver}.zip`);
fs.rmSync(out, { force: true });
execFileSync('C:/Windows/System32/tar.exe', ['-a', '-c', '-f', out, ...files], { cwd: root, stdio: 'inherit' });
console.log(`${out} ${fs.statSync(out).size} 字节`);
