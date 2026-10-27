# 咖啡实验台 CoffeeLab

个人咖啡冲煮记录 PWA：意式浓缩与手冲的参数记录、风味评价、豆子库、并排对比与数据导出。零依赖、无构建、完全离线，数据保存在浏览器本地。另有 Capacitor 打包的 Android App（与 Web 版共用同一份代码）。

## 使用

- 本地：`python3 -m http.server 8123`，手机/电脑访问 `http://localhost:8123`（手机需用电脑局域网 IP）
- 发布：已部署在 GitHub Pages → **https://up-converter.github.io/coffee-lab/**
- （推送到 `main` 自动更新；仓库根的 `.nojekyll` 使构建跳过 Jekyll，勿删）

## Android App（Capacitor）

Web 代码零改动共用：`capacitor.config.json` 指向 `www/`，由根目录文件同步而来；`window.Capacitor` 存在时自动走原生分支（导出走系统分享面板、跳过 Service Worker、隐藏 PWA 安装区块），浏览器版行为不变。

- 环境要求：Node、JDK 21（`brew install openjdk@21`）、Android SDK 36（`brew install --cask android-commandlinetools` + sdkmanager 装 `platforms;android-36` `build-tools;36.0.0` `platform-tools`）
- 构建：
  ```bash
  npm install                  # 首次
  npm run cap-sync             # 同步 web 资源到 www/ 与 android/
  node scripts/make-android-res.mjs   # 启动图标/启动屏（android/ 模板更新后需重跑）
  cd android && JAVA_HOME=$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home ./gradlew assembleRelease
  ```
- 产物：`android/app/build/outputs/apk/release/app-release.apk`（自签名，直接安装）
- 签名：密钥在 `android/app/keystore/`（已 gitignore），配置在 `android/keystore.properties`。**换机器构建前备份这两处，丢失后无法对已装设备做覆盖升级**；重签名的 APK 需先卸载旧版再装。
- Web 资源改动后：`npm run cap-sync` 再重跑 gradlew 即可；Web 版（GitHub Pages）不受影响，照常推送 `main`。

### 数据迁移（浏览器 → App）

手机浏览器上打开 GitHub Pages 版 → 设置 → 导出 JSON 备份 → 安装 App 后在 设置 → 导入 JSON（照片包含在备份里）。

## 数据安全

数据仅存于当前浏览器（localStorage，key `coffeeLab.data`）。请定期到「设置 → 数据」导出 JSON 备份；换设备用「导入 JSON」迁移（合并或覆盖）。清空浏览器站点数据会丢失记录，导出的 JSON 可随时恢复。

## 开发

- 结构：`js/core.js` 纯逻辑（UMD，Node 可测）→ `js/store.js` 状态树 → `js/ui/*` 页面
- 测试：`node --test test/core.test.cjs`（或直接 `node --test`）
- 端到端：`node test/e2e.stub.cjs`（端到端数据层冒烟，99 项断言，含设置页持久 toast / 搜索零匹配空态回归）
- 图标：`node scripts/make-icons.mjs`（零依赖 PNG 生成器，改动图案后重跑并同步更新 manifest）
- 发版：需更新 `sw.js` 顶部 `CACHE` 版本号（如 `coffeelab-v2` → `v3`）以使离线缓存失效
- 字段与设计决策见 `docs/design.md`
