# PawPal Ubuntu 支持分析

这份文档面向把 PawPal 从当前的 macOS / Windows 桌面宠物扩展到 Ubuntu。它整理项目结构、运行时架构、平台相关代码点，以及后续实现 Ubuntu 支持时建议优先处理的事项。

## 当前结论

PawPal 的主体架构已经比较适合扩展到 Ubuntu：主进程统一管理窗口、托盘、定时器、状态机和持久化；渲染进程只负责 React UI；preload 暴露受控 IPC API；素材通过自定义协议加载。大多数核心提醒能力不依赖 macOS 或 Windows。

Ubuntu 适配的主要工作不在 React UI，而在下面几个平台边界：

- `package.json` 目前只配置了 macOS `dmg` 和 Windows `nsis` 打包目标，没有 Linux target 或 `dist:linux` 脚本。
- `.github/workflows/release.yml` 当前只在 `windows-latest` 构建 Windows 安装包，发布流程没有 Linux job。
- `src/main/distraction.ts` 的活动窗口读取硬编码 `/usr/bin/osascript`，只能在 macOS 使用。
- `src/main/main.ts` 的分心检测调度明确把非 macOS 标记为 `unsupported`。
- `src/main/loginItem.ts` 只允许打包后的 macOS / Windows 注册开机自启，Ubuntu 需要另行实现或明确保持不支持。
- 透明、置顶、托盘和点击穿透都使用 Electron API，理论上可在 Linux 运行，但在 Ubuntu 的 X11 / Wayland / GNOME 托盘环境下需要重点实测。

## 代码结构速览

```text
src/main/       Electron 主进程：窗口、托盘、状态机、定时器、持久化、更新、平台能力
src/preload/    contextBridge IPC 桥接层，向 renderer 暴露 window.pawpal
src/renderer/   React UI：宠物窗口、设置窗口、诊断信息、自定义素材编辑
src/shared/     共享类型、默认配置、i18n、宠物外观 manifest、版本比较
tests/          纯逻辑测试，通过 Vite SSR 加载 TypeScript 测试模块
pet_assets/     内置 GIF 素材，打包时作为 extraResources 复制
docs/           项目文档；素材契约见 docs/asset-guide.md
build/          打包图标、macOS entitlements
```

## 运行时架构

`src/main/main.ts` 是应用的运行时中枢。它负责创建两个窗口：

- 宠物窗口：透明、无边框、不可缩放、跳过任务栏、始终置顶，尺寸来自 `PET_WINDOW`。
- 设置窗口：普通设置 UI，开发环境启动时自动打开，生产环境从菜单或托盘打开。

主进程持有核心状态：

- `petState` / `petFacing`：当前宠物动画状态和朝向。
- `blockingMode`：当前是否有休息、喝水、分心警告或休息奔跑这类阻塞交互。
- `focusActive` / `focusStartedAt` / `focusEndsAt`：专注模式计时。
- `breakDueAt` / `hydrationDueAt`：提醒计时器状态。
- `distractionStatus`：分心检测状态、活动 app、窗口标题、命中规则和错误信息。
- `updateCheck`：GitHub Releases 检查结果。

渲染进程不直接读写 Node 或 Electron 主进程对象。`src/preload/index.ts` 通过 `contextBridge.exposeInMainWorld("pawpal", api)` 暴露 API，React 侧通过 `window.pawpal` 调用 IPC。`src/renderer/src/hooks.ts` 使用 `getSnapshot()` 获取初始快照，并订阅主进程广播的 `app:snapshot`、`settings:updated`、`stats:updated`、`pet:set-state` 等事件。

这个结构对 Ubuntu 适配很有利：平台能力应该优先封装在 `src/main/`，共享契约放在 `src/shared/`，React UI 只消费状态和文案。

## 核心模块说明

### 主进程模块

- `src/main/main.ts`
  - 应用状态机和 IPC 注册中心。
  - 创建宠物窗口、设置窗口、托盘和菜单。
  - 调度休息提醒、喝水提醒、专注计时、分心检测和更新检查。
  - 注册 `pawpal-asset://` 协议加载内置和自定义 GIF。

- `src/main/displayPosition.ts`
  - 平台无关的窗口位置计算。
  - 使用 display id 和相对坐标保存宠物位置。
  - 显示器移除、分辨率变化后把宠物窗口夹回可见工作区。

- `src/main/distraction.ts`
  - `classifyDistraction()` 是平台无关逻辑，按 app 名和窗口标题命中用户规则。
  - `readActiveWindow()` 当前是 macOS 专用实现，调用 `/usr/bin/osascript`。
  - Ubuntu 支持需要把活动窗口读取拆成平台实现，保留现有分类逻辑和测试。

- `src/main/loginItem.ts`
  - 当前只在 `process.platform === "darwin" || "win32"` 且 `app.isPackaged` 时调用 `app.setLoginItemSettings()`。
  - Ubuntu 开机自启应单独实现 XDG autostart，或在 UI 文案里明确 Linux 暂不注册系统启动项。

- `src/main/trayIcon.ts`
  - 程序化生成托盘图标。
  - macOS 使用 template image；非 macOS 根据 `nativeTheme.shouldUseDarkColors` 生成黑/白图标。
  - Ubuntu 上需要实测 GNOME / AppIndicator 环境中的显示效果和右键菜单行为。

- `src/main/updates.ts`
  - 手动或启动时请求 GitHub Releases latest API，只比较版本号，不自动下载和安装。
  - Linux 发布包加入 release 后，当前更新逻辑仍可提示新版本，但不会选择平台资产。

- `src/main/settingsStore.ts` 与 `src/main/statsStore.ts`
  - 基于 `electron-store` 的设置和统计持久化。
  - 逻辑平台无关，应继续通过纯逻辑测试保护。

### 渲染层模块

- `src/renderer/src/components/PetView.tsx`
  - 宠物窗口 UI、气泡、专注倒计时、点击/拖拽/右键菜单。
  - 通过 `setIgnoreMouseEvents()` 的 IPC 切换点击穿透，Ubuntu 上需要重点验证。

- `src/renderer/src/components/SettingsView.tsx`
  - 设置页、统计卡片、分心检测诊断、自定义宠物素材编辑、更新检查。
  - 分心检测是否支持由主进程快照决定，UI 本身没有平台分支。

- `src/renderer/src/assets.ts`
  - 把共享 manifest 中的素材路径转换成 `pawpal-asset://` URL。
  - 支持 GIF 重放参数，处理有限循环 GIF。

- `src/shared/petAppearances.ts`
  - 内置宠物 manifest 和自定义宠物素材 resolver。
  - 素材状态契约详见 `docs/asset-guide.md`，Ubuntu 适配不应改变 `PetState` 数量或语义。

## 数据和资源路径

内置素材通过 `package.json` 的 `build.extraResources` 从 `pet_assets` 复制到打包资源目录。运行时 `pawpal-asset://` 协议会按环境选择根目录：

- 开发环境：`process.cwd()`
- 打包环境：`process.resourcesPath`
- 自定义素材：`app.getPath("userData")/custom_pet_assets`

协议处理器会校验最终路径必须位于内置素材根目录或自定义素材根目录内，然后用 `net.fetch(pathToFileURL(assetPath).href)` 返回文件。当前内置素材路径包含中文和空格，Ubuntu 打包后需要特别确认 AppImage / deb 中这些路径能正常加载。

## 平台相关点清单

| 位置 | 当前行为 | Ubuntu 适配影响 |
| --- | --- | --- |
| `package.json` `scripts.dist` | `electron-builder --mac --win` | 需要增加 Linux target 和脚本，例如 `dist:linux`。 |
| `package.json` `build.mac` / `build.win` | 只配置 macOS / Windows 打包 | 需要新增 `build.linux`，选择 AppImage、deb 或其他目标。 |
| `.github/workflows/release.yml` | 只构建 Windows exe | 需要新增 `ubuntu-latest` job，并把 Linux 产物上传到 Release。 |
| `src/main/distraction.ts` | `/usr/bin/osascript` 读取活动窗口 | Ubuntu 不可用；应拆出 Linux 实现或保持 unsupported。 |
| `src/main/main.ts` `scheduleDistractionDetection()` | 非 macOS 直接 `unsupported` | 如果实现 Linux 活动窗口检测，需要放宽平台判断。 |
| `src/main/loginItem.ts` | 只支持打包后的 macOS / Windows | Ubuntu 需要 XDG autostart `.desktop` 文件或保持不支持。 |
| `src/main/main.ts` `createPetWindow()` | 透明、无边框、置顶、点击穿透 | Linux 可用性受窗口管理器和 Wayland 影响，需要实测。 |
| `src/main/main.ts` `setVisibleOnAllWorkspaces()` | 只在 macOS 调用 | Linux 没有对应逻辑；多工作区是否可见需要按桌面环境测试。 |
| `src/main/trayIcon.ts` | 非 macOS 生成普通黑/白图标 | Ubuntu 托盘区域和主题适配需要验证，GNOME 可能依赖 AppIndicator 扩展。 |
| `src/shared/i18n.ts` | 文案写明分心检测 macOS-only | 如果 Linux 只做核心支持，文案要改成更准确的平台说明。 |

## 建议的 Ubuntu 支持路线

### 1. 先支持运行和打包

优先目标是让 Ubuntu 用户可以安装、打开应用，并使用核心桌宠、休息提醒、喝水提醒、专注计时、设置、统计、自定义素材和更新提示。

建议改动：

- 在 `package.json` 增加 `dist:linux` 脚本。
- 在 `build` 配置中增加 `linux` 段，常见选择是 AppImage + deb：
  - `target: [{ target: "AppImage", arch: ["x64"] }, { target: "deb", arch: ["x64"] }]`
  - `category: "Utility"` 或 `"Office"` / `"Productivity"`，按 electron-builder 支持值确认。
  - 复用 `build/icon.png`。
- 视目标用户决定是否加入 `arm64`，Ubuntu x64 应先作为最低可交付目标。
- 更新 README 的安装表格和构建命令。
- 新增 GitHub Actions Linux 构建 job，上传 `dist/*.AppImage`、`dist/*.deb` 等文件。

### 2. 保持分心检测默认不支持，或拆出 Linux 实现

当前核心提醒功能不依赖活动窗口检测。为了降低首版 Ubuntu 支持风险，可以先保持分心检测在 Ubuntu 上显示不支持，同时保证用户可以关闭该开关并正常使用其他功能。

如果要实现 Linux 分心检测，建议拆成平台适配层：

```text
src/main/distraction.ts              分类逻辑和公共类型
src/main/distraction.macos.ts        osascript 实现
src/main/distraction.linux.ts        Linux 活动窗口读取
```

Linux 可选方案：

- X11：可调用 `xdotool`、`wmctrl` 或读取窗口 PID 后查询 `/proc/<pid>`。优点是实现直接，缺点是依赖外部命令且 Wayland 不适用。
- GNOME Wayland：没有稳定通用的任意活动窗口读取 API。可能需要 DBus、桌面扩展或 portal 方案，可靠性和权限模型都需要单独评估。
- 保守策略：检测 `XDG_SESSION_TYPE`。X11 下尝试实现，Wayland 下明确显示 unsupported。

无论采用哪种方案，都应该继续复用 `classifyDistraction()`，并补充 Linux 读取结果解析的单元测试。

### 3. 处理 Ubuntu 开机自启

当前 `launchAtLoginEnabled` 是跨平台设置项，但系统注册只覆盖 macOS / Windows。Ubuntu 有两个选择：

- 首版保持不注册系统自启：设置仍保存偏好，但文案需要说明 Linux 暂不支持系统登录项。
- 实现 XDG autostart：在打包环境下写入或删除 `~/.config/autostart/PawPal.desktop`，Exec 指向当前应用可执行文件。

如果实现 XDG autostart，需要注意：

- 只在 `app.isPackaged` 时注册，保持开发环境只保存偏好。
- `.desktop` 文件需要包含 `Type=Application`、`Name=PawPal`、`Exec=...`、`X-GNOME-Autostart-enabled=true` 等字段。
- AppImage 的可执行路径可能位于用户下载目录，用户移动文件后自启会失效；deb 安装路径更稳定。
- `getLaunchAtLoginState()` 应能读取 `.desktop` 是否存在和启用，避免 UI 与系统状态不一致。

### 4. 实测 Linux 桌面行为

Electron 的透明窗口、置顶、托盘和点击穿透在 Linux 上受桌面环境影响明显。Ubuntu 首版至少应覆盖：

- Ubuntu 24.04 或 26.04 GNOME，分别在 X11 和 Wayland 会话测试。
- 宠物窗口透明背景是否仍透明。
- `alwaysOnTop` 是否足够稳定。
- `setIgnoreMouseEvents(false/true, { forward: true })` 是否能让鼠标穿透和重新交互。
- 右键菜单是否能从宠物窗口弹出。
- 托盘图标是否显示，点击或右键是否弹出菜单。
- 多显示器、显示器插拔、缩放比例变化后位置恢复是否正确。

如果 Wayland 下核心行为不稳定，发布说明应明确建议使用 X11 会话，或者把 Ubuntu 支持范围定义为 X11 优先。

## 验证清单

开发验证：

- `pnpm install`
- `pnpm test`
- `pnpm build`
- `pnpm dev`
- `pnpm dist:linux`

功能验证：

- 启动后宠物窗口可见，背景透明，无任务栏窗口。
- 点击宠物触发 `happy`，随后回到 `idle` 或 `focusGuard`。
- 拖拽宠物后位置保存，重启后位置恢复。
- 休息提醒、确认休息、休息奔跑、完成返回流程正常。
- 喝水提醒和确认喝水流程正常。
- 专注开始、倒计时、手动停止、完成统计正常。
- 设置保存后主进程定时器重新调度。
- 自定义 GIF 上传、拖放、预览和打包后加载正常。
- 托盘菜单和宠物右键菜单均可打开设置、隐藏/显示宠物、退出应用。
- 手动检查更新能访问 GitHub Releases，并能打开 release notes。
- 如果未实现 Linux 分心检测，开启分心检测后诊断区应明确显示 unsupported，其他功能不受影响。
- 如果实现 Linux 分心检测，分别测试命中 app 名、命中窗口标题关键词、忽略 PawPal 自身、权限或依赖缺失时的错误状态。

打包验证：

- AppImage 可执行并能找到 `pet_assets`。
- deb 安装后菜单项、图标、启动命令正常。
- 安装包产物命名能和 GitHub Release 下载表格对应。
- GitHub Release 中 Linux 产物上传后，现有更新检查可以识别新 tag。

## 推荐改动顺序

1. 增加 Linux 打包配置、`dist:linux` 脚本和 README / release workflow 更新。
2. 在 Ubuntu 上跑 `pnpm dev` 与 Linux 打包产物，记录透明窗口、置顶、托盘、点击穿透的实际表现。
3. 调整 UI 文案，让分心检测和开机自启在 Linux 上的支持状态说清楚。
4. 决定首版是否实现 XDG autostart；若实现，优先支持 deb 安装场景。
5. 决定首版是否实现 Linux 分心检测；若实现，先支持 X11，再单独评估 Wayland。
6. 为新增平台逻辑补测试，保持 `displayPosition`、`classifyDistraction`、设置规范化和版本比较这些纯逻辑测试继续通过。

## 后续实现时应避免的改动

- 不要为了 Ubuntu 改动 `PetState` 类型或减少素材状态；素材契约已有独立文档。
- 不要把平台命令调用散落到 React 组件里；平台能力应保留在主进程。
- 不要让 renderer 直接访问文件系统；继续通过 preload IPC 和 `pawpal-asset://` 协议。
- 不要默认假设 Wayland 可以提供活动窗口标题；应把 Wayland 不可用视为正常状态处理。
- 不要把开机自启和设置偏好混为一谈；UI 中的设置值应尽量反映系统注册结果。
