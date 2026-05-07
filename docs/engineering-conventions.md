# Lumi 工程约定

本文记录 Lumi 的启动期工程约定。约定优先服务于长期可维护的桌面媒体客户端，而不是最快搭出 demo。

## 工具链基线

执行日期：2026-05-07。

本机已验证：

- Node.js `v24.12.0`
- pnpm `11.0.3`
- Rust `1.95.0`
- Cargo `1.95.0`

当前 npm 查询到的最新基线：

- `@tauri-apps/cli` `2.11.1`
- `@tauri-apps/api` `2.11.0`
- `react` `19.2.6`
- `vite` `8.0.11`
- `typescript` `6.0.3`
- `tailwindcss` `4.2.4`
- `@tanstack/react-query` `5.100.9`
- `vidstack` `0.6.15`，仅作为未来 Web playback fallback 候选，不是 V1 默认播放器依赖。

创建项目或升级依赖前要重新查询版本。文档中的版本是启动快照，不是永久固定值。

## 包管理和脚本

- 默认包管理器是 pnpm。
- 不混用 npm、yarn、bun lockfile。
- Node 包和 Rust crate 都优先使用稳定版。
- 只在明确需要预发布能力时使用 alpha、beta、rc，并写入 `docs/architecture.md` 的技术 spike 或 ADR。
- Tauri plugins 优先使用官方插件；第三方插件必须检查维护状态、license、平台覆盖和 Tauri 2 兼容性。

建议脚本命名：

- `pnpm dev`：启动 Tauri 开发环境。
- `pnpm build`：构建前端和 Tauri 应用。
- `pnpm typecheck`：TypeScript 类型检查。
- `pnpm lint`：前端 lint。
- `pnpm test`：前端测试。
- `cargo test`：Rust 测试。
- `cargo clippy --all-targets --all-features`：Rust lint。

## TypeScript 约定

- 使用 TypeScript strict 模式。
- React 组件使用函数组件和明确 props 类型。
- Tauri command 只通过 typed client 调用，不在组件里直接散落 `invoke`。
- 服务端返回的 DTO 进入 UI 前做轻量 schema validation。
- UI 本地状态和远程数据状态分开：React Query 管理 provider/server 数据，组件状态管理焦点、弹层、选择和临时输入。
- 不在 React 层拼接 Emby 私有 URL、认证头或播放流地址。
- 复杂组件按 feature 拆分，避免单个 `App.tsx` 或页面文件承载完整应用逻辑。

## Rust 约定

- Rust 是业务和系统能力核心。
- Provider、persistence、player、platform material 分模块维护。
- 所有 Tauri command 返回 `Result<T, AppError>` 等价结构，并映射为前端稳定错误码。
- Token 和 secret 只能通过 keyring/service 读取，不进入日志。
- 网络请求、SQLite、mpv IPC 都要有明确超时和可取消路径。
- 日志使用结构化字段，至少包含 `server_id`、`provider_kind`、`session_id` 等非敏感上下文。

建议模块边界：

```text
src-tauri/src/
  app/
  providers/
    mod.rs
    emby/
  player/
  persistence/
  platform/
  commands/
  errors.rs
```

## 依赖选择原则

- 媒体播放优先验证 libmpv，而不是自写解码或媒体管线。
- UI 基础交互优先使用 Radix、Ariakit 或同类 headless primitives。
- 数据获取优先使用 React Query。
- 本地数据库优先 SQLite。
- 凭据优先系统钥匙串。
- 图标优先 lucide 或与系统风格一致的成熟图标库。
- 不引入大型 all-in-one UI 主题库作为视觉基础。

引入依赖前至少检查：

- license 是否兼容 permissive 开源和 GitHub Releases 分发。
- 是否维护活跃。
- 是否支持 Windows 和 macOS。
- 是否与 Tauri 2、React 19、当前 Rust toolchain 兼容。

## License 和分发

- Lumi 项目本身按 permissive 开源方向规划。
- V1 分发优先 GitHub Releases。
- libmpv 优先 LGPL 动态链接路线。
- 如果某个 mpv 构建或依赖引入 GPL 约束，必须先形成明确记录，不得静默进入默认分发。
- release artifact 必须包含第三方 license notice。

## 测试策略

文档阶段验收：

- 四份文档互相不矛盾。
- V1 和非 V1 范围清楚。
- 没有未完成标记或空章节。
- 技术不确定性列为明确 spike。

实现阶段测试：

- Rust provider 单元测试覆盖 Emby URL 标准化、登录错误、媒体项映射、播放源选择。
- SQLite migration 测试覆盖空库创建和版本升级。
- Tauri command contract 测试覆盖成功返回与错误码。
- React 测试覆盖焦点导航、弹层 focus trap、媒体 card 状态和设置表单。
- E2E 覆盖手动登录、进入媒体库、打开详情、启动播放、退出后同步进度。
- 平台手测覆盖 Windows 11 与当前 macOS 的材质降级、播放器窗口、全屏和多显示器行为。

## Git 和文档维护

- 功能分支使用 `codex/` 前缀，除非明确要求其他命名。
- 提交信息使用简洁 conventional commits，例如 `docs: add startup conventions`。
- 文档与实现一起维护。任何改变 V1 范围、provider contract、播放器策略、材质策略或依赖基线的代码变更，都要同步更新相关文档。
- 新技术决策如果影响长期架构，优先新增 ADR 或在现有文档增加“Decision”段落。
- 临时调研记录可以保存在 `docs/spikes/`，结论沉淀后再合并进核心文档。

## 参考资料

- [Tauri v2 configuration](https://v2.tauri.app/reference/config/)
- [Emby REST API](https://dev.emby.media/doc/restapi/index.html)
- [mpv manual: embedding into other programs](https://mpv.io/manual/master/#embedding-into-other-programs-libmpv)
- [Microsoft: Mica material](https://learn.microsoft.com/en-us/windows/apps/design/style/mica)
- [Microsoft: Acrylic material](https://learn.microsoft.com/en-us/windows/apps/design/style/acrylic)
