/* scripts/make-xhs-app.mjs — 生成小红书小工具版单文件应用
 *
 * 小红书「小工具」沙箱约束：禁止一切网络请求、资源全部打包、无独立域名。
 * 本脚本把仓库根的 index.html 构建成单文件 xhs-app/index.html：
 *   - CSS/JS 全部内联（按 index.html 中的引用顺序）
 *   - 移除 manifest / 图标 / 样式表外链（沙箱内无意义且可能触发资源请求）
 *   - 注入 window.CoffeeXHS = true，启用沙箱分支：
 *     跳过 Service Worker、隐藏 PWA 安装区块、导出/导入走复制粘贴面板
 * 运行：node scripts/make-xhs-app.mjs  →  xhs-app/index.html（直接压缩成 zip 上传）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
let html = readFileSync(join(ROOT, 'index.html'), 'utf8');

/* 1. 移除沙箱内无意义的外链（相对路径资源虽可用，但少一个是一个） */
html = html.replace(/[ \t]*<link rel="manifest"[^>]*>\n/, '');
html = html.replace(/[ \t]*<link rel="icon"[^>]*>\n/, '');
html = html.replace(/[ \t]*<link rel="apple-touch-icon"[^>]*>\n/, '');

/* 2. 内联样式表（用替换函数避免内容里的 $ 序列被当作替换模式） */
html = html.replace('<link rel="stylesheet" href="css/style.css">', function () {
  return '<style>\n' + readFileSync(join(ROOT, 'css', 'style.css'), 'utf8') + '\n</style>';
});

/* 3. 注入沙箱标记 + 按原顺序内联全部脚本 */
html = html.replace('<script src="js/core.js"></script>', function () {
  return '<script>window.CoffeeXHS = true;</script>\n<script src="js/core.js"></script>';
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, function (m, src) {
  return '<script>\n' + readFileSync(join(ROOT, src), 'utf8') + '\n</script>';
});

/* 4. 标题适配站内展示 */
html = html.replace('<title>咖啡实验台 CoffeeLab</title>', '<title>CoffeeLab 冲煮记录</title>');

/* 5. 校验：不允许残留任何外链资源与脚本引用 */
const leftovers = html.match(/<link rel="(?:stylesheet|manifest|icon|apple-touch-icon)"|<script src=|url\(https?:|\bfetch\(|XMLHttpRequest/g);
if (leftovers) {
  console.error('✗ 构建产物仍包含外链/网络调用：', leftovers);
  process.exit(1);
}

mkdirSync(join(ROOT, 'xhs-app'), { recursive: true });
writeFileSync(join(ROOT, 'xhs-app', 'index.html'), html);
console.log('✓ 已生成 xhs-app/index.html（' + Math.round(html.length / 1024) + ' KB，压缩为 zip 即可上传 Builder Hub）');
