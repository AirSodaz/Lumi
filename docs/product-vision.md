# Lumi 产品愿景

Lumi 是一个面向桌面的通用媒体聚合客户端。长期目标是把 Emby、Jellyfin、Plex、NAS、本地媒体目录等来源组织到同一套观影体验里；V1 只实现 Emby-first 观影闭环，先把连接、浏览、详情、播放、进度同步和基础设置做扎实。

本文按 P8 收尾口径同步当前实现。没有真实 Emby server、libmpv 和跨平台机器参与的项目，只能记录为待人工验收，不能写成已通过。

## 产品定位

- **产品形态**：Tauri 2 桌面客户端，不是网页管理后台，也不是服务端控制台。
- **核心体验**：打开应用后能快速连接个人媒体服务器，继续观看、浏览片库、查看详情，并用原生播放器稳定播放。
- **交互目标**：同一套 UI/UX 同时适配鼠标、触控板、键盘、控制器和遥控器。桌面输入不能像电视端一样低效，键盘/遥控器焦点流也不能只是附属能力。
- **视觉目标**：参考最新 Apple TV 的沉浸式媒体浏览、聚焦态和大圆角语言，同时尽量使用系统原生材质。Windows 优先 Mica/Acrylic，macOS 优先 Liquid Glass/vibrancy 能力。
- **工程目标**：能使用成熟库解决的领域不自造轮子；自研部分集中在产品体验、provider 抽象、播放控制编排和系统材质适配。

## V1 范围

V1 的成功标准是完成一条真实可用的 Emby 观影路径：

1. 手动输入 Emby Server URL。
2. 使用用户名和密码登录。
3. 保存服务器配置与安全凭据。
4. 拉取用户可访问的媒体库。
5. 浏览电影、剧集、季、集、合集等核心媒体项。
6. 打开媒体详情，展示海报、背景图、元数据、简介、媒体版本和可播放状态。
7. 使用原生 mpv 播放器打开媒体。
8. 支持播放、暂停、seek、音量、字幕/音轨选择和退出播放。
9. 同步播放进度到 Emby。
10. 提供基础设置：服务器管理、播放器偏好、外观/材质降级说明、日志导出。

V1 默认只支持手动 URL 连接。局域网发现、Emby Connect、远程穿透引导可以在后续版本进入规划。

## V1 当前实现状态

当前实现已经具备：

- 手动 Emby URL 登录，服务器 profile 存 SQLite，token 存系统钥匙串。
- Home 作为主要入口，包含 Continue Watching、Media Libraries、latest rails 和 featured carousel。
- 媒体库从 Home 的 `Media Libraries` rail 进入，支持库、剧集、季、集和常见视频容器浏览。
- 媒体详情展示海报、背景图、标题、年份、时长、简介、播放状态和播放入口。
- Favorites 顶层页展示当前服务器的 Emby 收藏，V1 为只读列表并支持懒加载。
- 播放通过 Rust `PlayerService` 打开独立播放器窗口，并由 runtime-loaded libmpv 承载。
- 播放命令支持 play、pause、seek、volume、close。
- 播放进度由 Rust 上报 Emby，播放中走 progress，退出走 stopped。
- Settings 包含 Servers、Player、Appearance、Logs；日志导出不包含 token 或密码。
- 轻量本地化已支持系统语言、英文和中文偏好。

仍需人工验收：

- 使用真实 Emby server 从登录、浏览、播放到退出后进度同步的完整 E2E。
- Windows 11 的 Mica/Acrylic 真实窗口效果、播放器窗口、全屏和安装包。
- 当前 macOS 的 Liquid Glass/vibrancy 可用范围、播放器窗口和打包限制。
- 已 staged 或系统安装 libmpv 后的真实播放稳定性。

## 非 V1 范围

以下能力不进入 V1 实现，但文档和代码边界要避免阻断后续扩展：

- Jellyfin、Plex、NAS、本地目录的完整实现。
- Live TV、DVR、服务端管理、用户管理、转码策略管理。
- 离线下载、后台同步、移动端或电视端原生应用。
- 多服务器聚合搜索、跨 provider 去重和统一播放历史。
- 商店渠道分发。V1 优先 GitHub Releases 直发。
- 对收藏的写操作、跨服务器收藏聚合和跨 provider 去重。
- 完整跨库搜索和智能推荐。

## Provider 策略

Lumi 的产品愿景是通用媒体聚合，但 V1 只写一个生产级 `EmbyProvider`。Provider 边界从第一天保留：

- `MediaProvider` 负责认证、媒体库、媒体项、播放源、进度上报。
- `EmbyProvider` 是第一实现，不能把 Emby 专有字段泄漏到 React UI。
- UI 面向 `LibraryItem`、`PlaybackProgress`、`MediaSource` 等 view-ready DTO。
- Emby 专有能力可以在详情页以 capability 方式暴露，但不能成为全局模型的必选字段。

## 体验原则

- **媒体优先**：海报、背景图、标题和继续观看状态是第一层级；技术状态和设置入口退后。
- **焦点可见**：控制器、遥控器、键盘导航时，当前焦点必须清晰、稳定、可预测。
- **桌面高效**：鼠标 hover、右键/更多菜单、搜索和快捷键要符合桌面使用习惯。
- **播放可信**：播放器状态以 mpv 为准，UI 不伪造播放进度。
- **降级诚实**：系统材质、HDR、字幕、硬解等能力不能承诺跨平台一致；必须按平台能力说明可用状态。

## 成功指标

- 新用户可以在 3 分钟内手动连接一个 Emby Server 并开始播放。
- 已登录用户打开应用后能直接继续上次观看。
- 键盘方向键和控制器能完成主要浏览与播放流程。
- 播放退出后，Emby 上的播放进度与本地 UI 一致。
- Windows 11 和当前 macOS 上能看到真实系统材质；旧系统有明确降级。

P8 验收时，以上指标以 `docs/validation/v1-acceptance.md` 的状态为准。自动化命令只能证明 contract、类型、构建和单元覆盖，不能替代真实 Emby 与平台材质手测。

## 参考资料

- [Emby REST API](https://dev.emby.media/doc/restapi/index.html)
- [Apple: Liquid Glass software design](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/)
- [Tauri v2 configuration](https://v2.tauri.app/reference/config/)
