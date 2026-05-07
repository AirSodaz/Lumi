# Lumi UI Design System

Lumi 的 UI 参考最新 Apple TV 的媒体浏览体验：大图像、清晰焦点、深层空间、克制文字和沉浸式播放入口。视觉目标不是复刻 tvOS，也不是十尺电视 UI，而是在桌面上建立一套可用、可访问、可跨输入设备操作的媒体客户端设计系统。

## 设计原则

- **内容是背景和主角**：海报、剧照、背景图和播放状态优先于装饰。
- **系统材质优先**：窗口、标题栏、侧栏、浮层等与操作系统关联强的区域优先使用原生材质。
- **系统尺度优先**：窗口化桌面场景优先遵循 Windows/macOS 字体、标题栏、菜单和表单控件的常见密度。
- **焦点即导航**：键盘、控制器和遥控器操作时，焦点态要比 hover 更明确。
- **桌面不降级**：鼠标、触控板和窗口化使用场景必须高效，不能只做十尺 UI。
- **少文字、多语境**：媒体项用图像、标题、进度和元数据表达，避免说明性 UI 文案堆叠。
- **动态有目的**：动效用于表达焦点、层级、转场和播放状态，不做无意义漂浮装饰。

## 材质层级

Lumi 区分三类材质：

1. `NativeMaterial`：操作系统提供或平台桥接得到的真实窗口/视图材质。
2. `ContentGlass`：WebView 内容层为了视觉连续性使用的 CSS 背景、模糊和透明。
3. `FallbackSurface`：旧系统、禁用透明度、性能受限或远程桌面场景下的非透明表面。

产品文案和开发文档只能把 `NativeMaterial` 称为系统原生材质。`ContentGlass` 是视觉补齐，不替代 Windows Mica/Acrylic 或 macOS Liquid Glass/vibrancy。

## 平台规则

### Windows

- Windows 11 优先启用 Mica 作为主窗口背景或长期存在的外壳材质。
- Acrylic 用于短时浮层、命令面板、上下文菜单、HUD 和需要透出背景运动的区域。
- Windows 10 或禁用透明效果时降级到 `FallbackSurface`。
- 窗口材质由 Rust/platform 层统一启用和探测，React 不直接调用平台 API。

### macOS

- 当前 macOS 优先使用公开 API 可用的 Liquid Glass/vibrancy 风格材质。
- 侧栏、标题栏、播放器控制层、浮动详情面板优先使用系统材质。
- 涉及 private API 的实现必须先形成单独风险记录，默认只允许 GitHub 直发版本使用。
- 如果 WebView 内容无法获得真实 Liquid Glass，内容区域使用 `ContentGlass` 视觉补齐，并在能力面板中标明降级。

## 圆角和空间

- 主窗口和平台外壳遵循系统默认圆角。
- 媒体海报使用稳定圆角，推荐 10-16px，避免过度胶囊化。
- 大型详情背景和播放器 overlay 可以使用更大的连续圆角，但不得影响内容可读性。
- 卡片只用于媒体项、列表项、浮层和工具面板；页面 section 不做卡片套卡片。
- 媒体 rails 使用固定 aspect ratio，避免图片加载、标题换行或焦点态造成布局跳动。

## 桌面密度和排版

- 默认正文使用系统字体栈，Windows 优先 `Segoe UI Variable` / `Segoe UI`，基准字号约 14px。
- 常规按钮、菜单、侧栏导航和设置行优先使用 13-14px 文本，控件高度接近 32-40px。
- 页面 section 标题约 18px；沉浸式 hero 标题可以更大，但窗口化桌面默认控制在约 38-40px。
- Home hero 默认高度约 340-360px；详情页 hero 可以略高，但首屏必须露出后续内容或主要操作上下文。
- Apple TV 风格主要体现在媒体图像、焦点态和空间层级，不允许把整套 UI 放大成电视端操作密度。

## 焦点与输入

同一套组件必须支持五类输入：

- 鼠标：hover、点击、右键/更多菜单、滚轮。
- 触控板：惯性滚动、横向媒体 rails、缩放不作为核心能力。
- 键盘：方向键、Enter、Escape、Space、Tab、快捷键。
- 控制器：方向键/摇杆、确认、返回、播放暂停。
- 遥控器：方向键、确认、返回、播放暂停。

焦点系统约定：

- 可聚焦元素必须有稳定尺寸，不因焦点态改变布局。
- 焦点态可以使用 scale、发光、边框或材质提升，但文字不能抖动。
- 焦点移动遵循视觉邻近和当前 rail 方向，不允许意外跳到隐藏区域。
- 弹层打开后焦点被约束在弹层内，关闭后回到触发元素。
- 播放器全屏时，方向键和媒体键优先交给播放器控制层。

## 信息架构

V1 主导航保持克制：

- Home：继续观看、最新添加、推荐 rails。
- Libraries：按 Emby 媒体库浏览。
- Search：本地/服务器搜索入口，V1 可以先做服务器搜索。
- Settings：服务器、播放器、外观、日志。

媒体详情页包含：

- 背景图与海报。
- 标题、年份、时长、评分、简介。
- 播放按钮与继续观看状态。
- 媒体版本、音轨、字幕轨道。
- 剧集的季/集列表。

## 视觉 Tokens

第一版实现前必须从视觉稿提取 tokens：

- `color.background`
- `color.surface.nativeFallback`
- `color.surface.contentGlass`
- `color.text.primary`
- `color.text.secondary`
- `color.text.tertiary`
- `color.accent`
- `radius.poster`
- `radius.panel`
- `shadow.focus`
- `motion.focusEnter`
- `motion.panelTransition`

Tokens 由 CSS variables 暴露给 React，平台材质状态由 Rust 提供。主题不以单一紫/蓝渐变为主，不使用装饰性光球或大面积 bokeh 背景。

## 组件策略

- 使用 Radix、Ariakit 或同类 headless primitives 处理菜单、对话框、tooltip、focus trap 等基础交互。
- 图标优先使用 lucide 或平台风格一致的图标库；播放器专用图标可以单独封装。
- 媒体 rails、poster card、detail hero、player HUD、settings rows 是 Lumi 自己的核心组件。
- 不引入重视觉组件库作为默认外观，避免应用看起来像 Web admin 模板。

## 无障碍与动效

- 支持 `prefers-reduced-motion`，降低 scale、blur 和转场距离。
- 支持系统高对比度或透明度关闭场景，自动使用 `FallbackSurface`。
- 所有图标按钮需要可读 label 或 tooltip。
- 播放控制必须能通过键盘完成。
- 文字不随 viewport 宽度线性缩放，移动/窄窗口通过布局重排解决。

## 参考资料

- [Apple: Liquid Glass software design](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/)
- [Microsoft: Mica material](https://learn.microsoft.com/en-us/windows/apps/design/style/mica)
- [Microsoft: Acrylic material](https://learn.microsoft.com/en-us/windows/apps/design/style/acrylic)
- [Tauri v2 configuration](https://v2.tauri.app/reference/config/)
