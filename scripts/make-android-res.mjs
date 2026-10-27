/* scripts/make-android-res.mjs — 用现有 icons/ 生成 Android 启动图标与纯色启动屏
 *
 * - 自适应图标前景：icon-maskable-512.png（图案在中心 80% 安全区）→ 各 mipmap 目录 ic_launcher_foreground.png
 * - 传统图标与圆形图标：icon-512.png（满幅深绿底）→ 各 mipmap 目录 ic_launcher.png / ic_launcher_round.png
 * - 自适应图标底色：深绿 #1E3A2F（与图案底色一致，掩膜边缘无缝）
 * - 启动屏：全部 splash.png 替换为奶白 #F5F3EC 纯色（尺寸沿用原文件，零依赖手写 PNG 编码）
 * - Android 12+ 系统启动屏底色：values-v31 覆盖 windowSplashScreenBackground
 *
 * 依赖：macOS 自带 sips（缩放）。运行：node scripts/make-android-res.mjs
 */
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ICONS = join(ROOT, 'icons');
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');

/* ---------- 最小 PNG 编码（与 scripts/make-icons.mjs 同一套实现） ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function solidPng(width, height, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  /* bit depth */
  ihdr[9] = 6;  /* color type: RGBA */
  const stride = width * 4;
  const row = Buffer.alloc(1 + stride);   /* filter 0 + 一行同色像素 */
  for (let x = 0; x < width; x++) {
    row[1 + x * 4] = r; row[2 + x * 4] = g; row[3 + x * 4] = b; row[4 + x * 4] = 255;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 1. 启动图标 ---------- */
const DENSITIES = { 'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4 };
const ICON_SRC = join(ICONS, 'icon-512.png');
const FG_SRC = join(ICONS, 'icon-maskable-512.png');

function resize(src, px, out) {
  mkdirSync(dirname(out), { recursive: true });
  execFileSync('sips', ['-z', String(px), String(px), src, '--out', out], { stdio: 'pipe' });
}

for (const [dpi, scale] of Object.entries(DENSITIES)) {
  const dir = join(RES, `mipmap-${dpi}`);
  resize(ICON_SRC, 48 * scale, join(dir, 'ic_launcher.png'));
  resize(ICON_SRC, 48 * scale, join(dir, 'ic_launcher_round.png'));
  resize(FG_SRC, 108 * scale, join(dir, 'ic_launcher_foreground.png'));  /* 108dp 自适应视口 */
}

writeFileSync(join(RES, 'values', 'ic_launcher_background.xml'),
  '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1E3A2F</color>\n</resources>\n');

/* ---------- 2. 启动屏（纯色奶白，尺寸沿用原 splash.png） ---------- */
const CREAM = [245, 243, 236];  /* #F5F3EC */
for (const d of readdirSync(RES)) {
  if (!d.startsWith('drawable')) continue;
  const splash = join(RES, d, 'splash.png');
  if (!existsSync(splash)) continue;
  const buf = readFileSync(splash);
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);  /* IHDR 固定偏移 */
  writeFileSync(splash, solidPng(w, h, CREAM));
}

/* ---------- 3. Android 12+ 系统启动屏底色 ---------- */
mkdirSync(join(RES, 'values-v31'), { recursive: true });
writeFileSync(join(RES, 'values-v31', 'styles.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:windowSplashScreenBackground">@color/launch_background</item>
        <item name="android:background">@drawable/splash</item>
    </style>
</resources>
`);
const colorsPath = join(RES, 'values', 'colors.xml');
const colorsXml = existsSync(colorsPath) ? readFileSync(colorsPath, 'utf8') : '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';
if (!colorsXml.includes('launch_background')) {
  writeFileSync(colorsPath, colorsXml.replace('</resources>', '    <color name="launch_background">#F5F3EC</color>\n</resources>'));
}

console.log('✓ Android 启动图标与启动屏已生成（mipmap-* / drawable-* / values-v31）');
