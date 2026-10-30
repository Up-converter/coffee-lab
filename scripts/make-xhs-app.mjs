/* scripts/make-xhs-app.mjs — 生成小红书小工具版应用包（xhs-app/）
 *
 * 小红书小工具容器约束（.skill/minitool-zip-builder 规范 + 在线文档）：
 *   - CSP 禁止内联 <script> / 行内事件 / javascript: URI → 脚本必须外置 <script src>
 *   - 禁止 Service Worker → 构建时移除注册代码
 *   - 禁止一切网络请求 → 资源全部本地
 *   - 入口 index.html 必须在 zip 根目录；脚本相对路径引用
 *
 * 产物结构：
 *   xhs-app/index.html      入口（样式仍可内联，容器允许）
 *   xhs-app/js/*.js         源码脚本 + env-xhs.js（沙箱标记，首个加载）+ xhs-storage.js（存储镜像，最后加载）
 *
 * 运行：node scripts/make-xhs-app.mjs && cd xhs-app && zip -r ../out.zip .
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'xhs-app');
let html = readFileSync(join(ROOT, 'index.html'), 'utf8');

/* 1. 移除沙箱内无意义的外链 */
html = html.replace(/[ \t]*<link rel="manifest"[^>]*>\n/, '');
html = html.replace(/[ \t]*<link rel="icon"[^>]*>\n/, '');
html = html.replace(/[ \t]*<link rel="apple-touch-icon"[^>]*>\n/, '');

/* 2. 样式内联（容器允许 <style>，少一个文件） */
html = html.replace('<link rel="stylesheet" href="css/style.css">', function () {
  return '<style>\n' + readFileSync(join(ROOT, 'css', 'style.css'), 'utf8') + '\n</style>';
});

/* 3. 脚本保持外置（CSP 禁止内联）：
 *    - env-xhs.js 插到最前（沙箱标记须先于一切 UI 脚本）
 *    - xhs-storage.js 已在源 index.html 末尾，无需处理
 *    - 路径统一为 ./js/... */
html = html.replace('<script src="js/core.js"></script>', function () {
  return '<script src="./js/env-xhs.js"></script>\n<script src="./js/core.js"></script>';
});
html = html.replace(/<script src="js\//g, '<script src="./js/');

/* 4. 从 app.js 副本中移除 SW 注册代码（容器禁用 Service Worker，源码分支在包内属被禁残留） */
const APP_SW_BLOCK = /[ \t]*\/\* Capacitor 原生壳\s*\/\s*小红书沙箱内资源已随包内置[^]*?navigator\.serviceWorker\.register\('\.\/sw\.js'\)[^]*?\}\);\n[ \t]*\}\n/;

/* 6. 输出目录：index.html + js/ 树（源码脚本本就是 ES5/经典脚本，原样打包；app.js 副本剥离 SW 残留） */
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'js', 'ui'), { recursive: true });
writeFileSync(join(OUT, 'index.html'), html);
copyFileSync(join(ROOT, 'js', 'env-xhs.js'), join(OUT, 'js', 'env-xhs.js'));
for (const name of ['core.js', 'store.js', 'photos.js', 'xhs-storage.js']) {
  copyFileSync(join(ROOT, 'js', name), join(OUT, 'js', name));
}
for (const name of readdirSync(join(ROOT, 'js', 'ui'))) {
  let code = readFileSync(join(ROOT, 'js', 'ui', name), 'utf8');
  if (name === 'app.js') code = code.replace(APP_SW_BLOCK, '');
  writeFileSync(join(OUT, 'js', 'ui', name), code);
}
if (/navigator\.serviceWorker\.register/.test(readFileSync(join(OUT, 'js', 'ui', 'app.js'), 'utf8'))) {
  console.error('✗ app.js 副本仍残留 SW 注册代码（剥离正则需更新）');
  process.exit(1);
}

/* 7. 产物自检：不允许内联脚本与任何外链/网络调用 */
const jsFiles = readdirSync(join(OUT, 'js'), { recursive: true }).filter(function (p) { return p.endsWith('.js'); });
const allCode = html + jsFiles.map(function (p) { return readFileSync(join(OUT, 'js', p), 'utf8'); }).join('\n');
const problems = [];
if (/<script>(?!\s*<\/script>)/.test(html)) problems.push('存在内联 <script>');
if (/<script src="https?:/.test(html) || /<link[^>]+href="https?:/.test(html)) problems.push('存在外部资源引用');
if (/javascript:/.test(allCode)) problems.push('存在 javascript: URI');
if (/onclick=|onchange=|onsubmit=/.test(html)) problems.push('存在行内事件');
if (/navigator\.serviceWorker\.register|document\.execCommand|window\.open\(|window\.prompt\(|\beval\(|new Function\(|new WebSocket\(|\bfetch\(|XMLHttpRequest/.test(allCode)) problems.push('存在被禁 API 调用');
if (html.indexOf('<script src="./js/env-xhs.js">') < 0) problems.push('env-xhs.js 未注入');
if (html.indexOf('<script src="./js/xhs-storage.js">') < 0) problems.push('xhs-storage.js 未随包');
if (problems.length) {
  console.error('✗ 构建自检失败：\n  - ' + problems.join('\n  - '));
  process.exit(1);
}

console.log('✓ 已生成 xhs-app/（脚本外置，CSP 合规）：');
console.log('  index.html ' + Math.round(html.length / 1024) + ' KB + js/ ' +
  readdirSync(join(OUT, 'js')).join(', '));
console.log('  打包：cd xhs-app && zip -r ../coffeelab-xhs-app.zip . -x "*.DS_Store"');
