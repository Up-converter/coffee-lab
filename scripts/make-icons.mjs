/* scripts/make-icons.mjs — 零依赖 PNG 图标生成器（仅用 Node 内置模块，无构建链）
 *
 * 手写最小 PNG 编码器（签名 + IHDR/IDAT/IEND + CRC32 表 + zlib.deflateSync，RGBA 8bit），
 * 按像素程序化绘制与 icons/icon.svg 同一构图的图标：
 *   深绿底 #1E3A2F + 奶白色 #F5F3EC 漏斗（梯形收窄成柄）+ 琥珀色 #C89B3C 圆形液滴。
 *
 * 输出（写入 icons/）：
 *   icon-192.png / icon-512.png        — purpose:any（满幅，图案留有安全边距）
 *   apple-touch-icon.png               — iOS 主屏幕图标 180×180
 *   icon-maskable-512.png              — purpose:maskable（图案收缩到中心 80% 安全区）
 *
 * 运行：node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ---------- 最小 PNG 编码 ---------- */
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

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  /* bit depth */
  ihdr[9] = 6;  /* color type: RGBA */
  /* 压缩 0 / 滤波 0 / 隔行 0 —— 缓冲区默认已为零 */
  const stride = width * 4;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + stride);
    raw[row] = 0; /* filter: None */
    rgba.copy(raw, row + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 图案几何（归一化坐标，0..1；与 icons/icon.svg 构图一致） ---------- */
const BG = [30, 58, 47];      /* #1E3A2F 深绿 */
const FUNNEL = [245, 243, 236]; /* #F5F3EC 奶白 */
const DROP = [200, 155, 60]; /* #C89B3C 琥珀 */

const BOWL_TOP_Y = 0.20, BOWL_TOP_HW = 0.155;   /* 漏斗口：宽 0.31 */
const BOWL_BOT_Y = 0.50, BOWL_BOT_HW = 0.062;   /* 收窄至 0.124 */
const STEM_BOT_Y = 0.615, STEM_HW = 0.042;      /* 柄 */
const DROP_CY = 0.755, DROP_R = 0.098;          /* 液滴圆 */

function inFunnel(x, y) {
  if (y >= BOWL_TOP_Y && y <= BOWL_BOT_Y) {
    const t = (y - BOWL_TOP_Y) / (BOWL_BOT_Y - BOWL_TOP_Y);
    const hw = BOWL_TOP_HW + (BOWL_BOT_HW - BOWL_TOP_HW) * t; /* 梯形边线性插值 */
    return Math.abs(x - 0.5) <= hw;
  }
  if (y > BOWL_BOT_Y && y <= STEM_BOT_Y) return Math.abs(x - 0.5) <= STEM_HW;
  return false;
}

function inDrop(x, y) {
  const dx = x - 0.5, dy = y - DROP_CY;
  return dx * dx + dy * dy <= DROP_R * DROP_R;
}

/* scale：图案整体缩放（绕中心），maskable 用 0.8 让图案落在 80% 安全区内 */
function makeIcon(size, scale) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3; /* 3×3 超采样抗锯齿 */
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let fun = 0, drop = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = ((px + (sx + 0.5) / SS) / size - 0.5) / scale + 0.5;
          const ny = ((py + (sy + 0.5) / SS) / size - 0.5) / scale + 0.5;
          if (inDrop(nx, ny)) drop++;
          else if (inFunnel(nx, ny)) fun++;
        }
      }
      const o = (py * size + px) * 4;
      const aFun = fun / (SS * SS), aDrop = drop / (SS * SS);
      /* 底色 → 漏斗 → 液滴 分层叠加 */
      let r = BG[0], g = BG[1], b = BG[2];
      r += (FUNNEL[0] - r) * aFun; g += (FUNNEL[1] - g) * aFun; b += (FUNNEL[2] - b) * aFun;
      r += (DROP[0] - r) * aDrop; g += (DROP[1] - g) * aDrop; b += (DROP[2] - b) * aDrop;
      rgba[o] = Math.round(r); rgba[o + 1] = Math.round(g); rgba[o + 2] = Math.round(b); rgba[o + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(outDir, { recursive: true });

const TARGETS = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['apple-touch-icon.png', 180, 1],
  ['icon-maskable-512.png', 512, 0.8] /* maskable：图案在中心 80% 安全区 */
];

for (const [name, size, scale] of TARGETS) {
  const png = makeIcon(size, scale);
  writeFileSync(join(outDir, name), png);
  console.log('wrote icons/' + name + '  ' + size + 'x' + size + '  ' + png.length + ' bytes');
}
