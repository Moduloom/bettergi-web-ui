<div align="center">
  <img src="src/assets/images/logo.png" width="88" alt="BetterGI Web UI 标志">
  <h1>BetterGI Web UI</h1>
  <p>BetterGI 的 React 组件库和应用界面预览。</p>
  <p><a href="#启动预览">启动预览</a> &nbsp;&nbsp; <a href="https://github.com/babalae/better-genshin-impact">原版 BetterGI</a></p>
</div>

## 能预览什么

- 按钮、设置卡、下拉框、列表和弹窗。
- 实时触发、独立任务、任务计划等整套工作台页面。
- 深浅模式共用 `--bgi-accent` 主题色 Token，Windows 下可跟随系统主题色。

## 界面展示

![BetterGI Web UI 的独立任务页](docs/preview.png)

## 启动预览

需要 Node.js 22.18+ 和 pnpm 11。

```sh
git clone --recurse-submodules https://github.com/Moduloom/bettergi-web-ui.git
cd bettergi-web-ui
pnpm install --frozen-lockfile
pnpm dev
```

打开 [「组合 → 全部」](http://127.0.0.1:4321/#bettergi-ui%3Aall) 查看工作台，也可以从目录单独打开组件。

运行 `pnpm build` 可在 `dist/bettergi-web` 中生成独立 Web 前端。界面预览在浏览器运行，游戏操作依赖 BetterGI 桌面端。

## 项目来源

界面参考 [BetterGI 的 refactor/20260930 分支](https://github.com/babalae/better-genshin-impact/tree/refactor/20260930)。组件和页面预览由 [Moduloom](https://github.com/Moduloom/moduloom) 提供。

## 许可证

源码采用 [GPL v3](LICENSE)。素材见 [第三方说明](docs/third-party.md)。
