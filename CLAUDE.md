# 项目说明

- 模块内所有代码（Shell、JavaScript、CSS、HTML）一律不写任何注释。
- 档位切换只由 service.sh 执行；WebUI 只写 /data/adb/Astra_MaxRefresh_Pro_data 下的配置文件，并写入 rev 通知后台服务。
- 打包：`node tools/build.mjs`，产物在 `dist/`（不入库）。发布新版本、修改 update.json 须经用户同意。
- 应用图标由 `bin/icons.dex` 读取，源码在 `tools/icons/astra/Icons.java`。修改后用 javac（`--release 8`，依赖 Android SDK 的 android.jar）编译，再用 build-tools 中的 d8 转换为 dex，覆盖 `bin/icons.dex`。
- 预览：`.preview/real/` 中的 mock.js 模拟 Root 管理器与配置文件，可在桌面浏览器中查看 WebUI。
