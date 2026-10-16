# 咖啡实验台 CoffeeLab

个人咖啡冲煮记录 PWA：意式浓缩与手冲的参数记录、风味评价、豆子库、并排对比与数据导出。零依赖、无构建、完全离线，数据保存在浏览器本地。

## 使用

- 本地：`python3 -m http.server 8123`，手机/电脑访问 `http://localhost:8123`（手机需用电脑局域网 IP）
- 发布：已部署在 GitHub Pages → **https://up-converter.github.io/coffee-lab/**（推送到 `main` 自动更新；仓库根的 `.nojekyll` 使构建跳过 Jekyll，勿删）

## 数据安全

数据仅存于当前浏览器（localStorage，key `coffeeLab.data`）。请定期到「设置 → 数据」导出 JSON 备份；换设备用「导入 JSON」迁移（合并或覆盖）。清空浏览器站点数据会丢失记录，导出的 JSON 可随时恢复。

## 开发

- 结构：`js/core.js` 纯逻辑（UMD，Node 可测）→ `js/store.js` 状态树 → `js/ui/*` 页面
- 测试：`node --test test/core.test.cjs`（或直接 `node --test`）
- 端到端：`node test/e2e.stub.cjs`（端到端数据层冒烟，99 项断言，含设置页持久 toast / 搜索零匹配空态回归）
- 图标：`node scripts/make-icons.mjs`（零依赖 PNG 生成器，改动图案后重跑并同步更新 manifest）
- 发版：需更新 `sw.js` 顶部 `CACHE` 版本号（如 `coffeelab-v2` → `v3`）以使离线缓存失效
- 字段与设计决策见 `docs/design.md`
