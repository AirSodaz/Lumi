# Lumi 架构约定

Lumi 采用 Tauri 2 + Rust 核心服务 + React UI。Rust 负责系统能力、provider、持久化、凭据和播放器控制；React 负责界面、焦点状态、局部交互和 view-ready 数据展示。

## 分层边界

```text
React UI
  -> typed TypeScript client
  -> Tauri commands/events
  -> Rust application services
  -> provider adapters / player service / persistence / platform material
```

- **React UI**：只消费稳定 DTO，不直接拼 Emby REST URL，不保存 token，不控制 mpv IPC 细节。
- **TypeScript client**：提供 `auth.loginManual`、`providers.listLibraries`、`media.getItem`、`playback.open` 等命名空间 API。底层 Tauri command id 可以使用 Rust 友好的 snake_case。
- **Rust services**：聚合业务流程，处理错误归一化、缓存、凭据读取、播放会话和平台能力探测。
- **Provider adapters**：封装 Emby/Jellyfin/Plex/NAS 等来源差异。V1 只实现 `EmbyProvider`。
- **Persistence**：SQLite 存服务器、库、媒体缓存、播放映射和设置；系统钥匙串存 token 与敏感凭据。
- **Player service**：以原生 mpv 为优先路线，V1 可使用独立播放器窗口承载 mpv。

## 核心模型

Rust 和 TypeScript 之间传递的是稳定、序列化友好的 DTO：

```ts
type ProviderKind = "emby";

type ServerProfile = {
  id: string;
  providerKind: ProviderKind;
  name: string;
  baseUrl: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

type LibraryItem = {
  id: string;
  providerKind: ProviderKind;
  serverId: string;
  itemType: "movie" | "series" | "season" | "episode" | "collection" | "folder";
  title: string;
  sortTitle?: string;
  posterUrl?: string;
  backdropUrl?: string;
  year?: number;
  runtimeSeconds?: number;
  overview?: string;
  progress?: PlaybackProgress;
};

type PlaybackProgress = {
  positionSeconds: number;
  durationSeconds?: number;
  played: boolean;
  updatedAt: string;
};

type PlayerSession = {
  id: string;
  serverId: string;
  itemId: string;
  state: "opening" | "playing" | "paused" | "buffering" | "ended" | "error" | "closed";
  positionSeconds: number;
};
```

Provider 内部可以保留 Emby 原始响应用于调试和缓存，但不得让 React 依赖 Emby 原始字段。

## Tauri Command Contract

初始公开 API 以 TypeScript client 为准：

- `auth.loginManual({ baseUrl, username, password }) -> ServerProfile`
- `auth.logout({ serverId }) -> void`
- `providers.listServers() -> ServerProfile[]`
- `providers.listLibraries({ serverId }) -> LibraryItem[]`
- `media.listChildren({ serverId, parentId, cursor }) -> PagedResult<LibraryItem>`
- `media.getItem({ serverId, itemId }) -> LibraryItemDetail`
- `playback.open({ serverId, itemId, mediaSourceId? }) -> PlayerSession`
- `playback.command({ sessionId, command }) -> PlayerSession`
- `settings.get() -> AppSettings`
- `settings.update({ patch }) -> AppSettings`

Tauri events 使用同一命名风格：

- `playback:state-changed`
- `playback:position`
- `playback:error`
- `provider:sync-progress`
- `platform:material-changed`

错误返回统一为：

```ts
type AppError = {
  code: string;
  message: string;
  recoverable: boolean;
  detail?: unknown;
};
```

用户可读文案在 React 层完成，Rust 只返回稳定错误码和必要上下文。

## Emby Provider

V1 的 `EmbyProvider` 负责：

- 标准化 `baseUrl`，拒绝空 URL 和明显无效协议。
- 使用 Emby 用户名密码登录，令牌写入系统钥匙串。
- 使用 Emby API 拉取库、媒体项、图片 URL、播放源和播放进度。
- 为 mpv 提供可播放 URL、请求头、字幕轨道和音轨信息。
- 在播放中按节流策略上报进度，退出时强制上报最终状态。

认证头和 URL 规则集中在 provider 内部，禁止 React 直接构造 `X-Emby-Authorization` 或媒体流地址。

## Persistence

- SQLite 是结构化状态的唯一默认本地数据库。
- 系统钥匙串保存 token、密码派生凭据和未来 provider secret。Windows 使用 Credential Manager，macOS 使用 Keychain。
- SQLite 表不保存明文 token。
- 所有 migration 必须可重复执行，并在测试中覆盖空库升级。
- 媒体缓存以 provider + server + item id 作为复合身份，避免未来跨 provider 冲突。

## 原生播放器

V1 采用原生 mpv 优先：

- Rust `PlayerService` 管理 `PlayerSession` 生命周期。
- 播放器窗口可以是独立原生窗口，不强制与 React 主窗口同窗嵌入。
- mpv 状态是播放真相来源，React 只订阅状态事件并发送命令。
- libmpv 优先走 LGPL 动态链接和可替换分发；如果某个平台短期无法捆绑，必须在 release notes 标记为限制。
- 外部 mpv 进程只作为开发或诊断兜底，不作为默认产品体验。

## Platform Material Service

系统材质归 Rust/platform 层管理：

- Windows 优先使用 Tauri `windowEffects` 的 Mica/Acrylic 能力；不足时通过 Rust 平台桥接补齐。
- macOS 优先公开 AppKit/SwiftUI/Liquid Glass/vibrancy 能力；涉及 private API 的实现必须单独记录风险，且默认只用于 GitHub 直发版本。
- React 只读取 `PlatformMaterialState`，不要自行判断平台材质能力。
- CSS glass 只能用于内容层视觉补齐，不能在文档或 UI 中声称是系统原生材质。

## 技术 Spike

这些结论必须在编码早期验证，并把结果写入 docs 或 ADR：

- Tauri `windowEffects` 在 Windows 11 与当前 macOS 的实际覆盖区域和边界限制。
- macOS Liquid Glass/vibrancy 可通过公开 API 实现的范围。
- LGPL libmpv 的 Windows/macOS 动态加载、打包、署名和 license notice。
- 独立 mpv 播放器窗口的窗口管理、全屏、置顶、关闭和多显示器行为。
- Emby 登录、媒体详情、播放 URL、字幕/音轨和进度上报的最小链路。

## 参考资料

- [Tauri v2 configuration](https://v2.tauri.app/reference/config/)
- [Emby REST API](https://dev.emby.media/doc/restapi/index.html)
- [mpv manual: embedding into other programs](https://mpv.io/manual/master/#embedding-into-other-programs-libmpv)
