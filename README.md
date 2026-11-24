# BetterGI Web UI

**BetterGI 的 React 组件库和应用预览。**

以 BetterGI 的 WPF 界面为参考。从按钮、设置卡和下拉框，到实时触发、独立任务和任务计划，都能在 Moduloom 里打开。

![BetterGI Web UI 的独立任务页](docs/preview.png)

## 打开预览

需要 Node.js 22.18+ 和 pnpm 11。

```sh
git clone --recurse-submodules https://github.com/Moduloom/bettergi-web-ui.git
cd bettergi-web-ui
pnpm install --frozen-lockfile
pnpm dev
```

打开 [「组合 → 全部」](http://127.0.0.1:4321/#bettergi-ui%3Aall) 看完整工作台，或从组件目录打开单项预览。

`pnpm build` 生成独立 Web 前端，输出到 `dist/bettergi-web`。界面预览在浏览器运行，游戏操作依赖 BetterGI 桌面端。

项目以 [原版 BetterGI 的 refactor/20260930 分支](https://github.com/babalae/better-genshin-impact/tree/refactor/20260930) 为界面参考。预览由 [Moduloom](https://github.com/Moduloom/moduloom) 提供。

## 许可证

源码使用 [GPL v3](LICENSE)。素材来源和授权见 [第三方说明](docs/third-party.md)。
