# DSH TODO-NOTE

集成在 **DeepSeek Harness（DSH）Web 侧边栏**中的轻量待办 / 笔记插件：快速添加、完成勾选、截止日期、月历，以及从待办开启 agent 对话。

仓库：[ginkgonine/dsh-todo-note](https://github.com/ginkgonine/dsh-todo-note)

## 安装

### 从 GitHub 直接安装（推荐）

**不需要发布到 npm，也不需要先手动克隆或构建。** 本项目提交了可直接加载的 JavaScript，DSH 插件管理器会安装依赖并启用 bundle。`private: true` 只限制 npm 发布，不影响 GitHub 安装。

在 DSH Web 中打开 **插件 → 添加插件**，输入：

```text
github:ginkgonine/dsh-todo-note
```

点击安装，按界面提示确认启用。也可使用 Git 地址：

```text
git+https://github.com/ginkgonine/dsh-todo-note.git
```

命令行方式（`web` 是目标 profile；使用自定义 profile 时替换它）：

```sh
dsh plugin --profile web add "github:ginkgonine/dsh-todo-note"
```

安装后，按 DSH 的安装结果判断是否需要重启；若提示 `restart-required`，重启使用该 profile 的 DSH，再刷新 Web 页面。成功后，侧边栏底部会出现 **TODO**。依赖安装或启用失败时先查看插件管理器诊断，不要仅根据“下载成功”判断插件已生效。

需要固定版本时，可以指定实际存在的 tag 或 commit：

```text
github:ginkgonine/dsh-todo-note#<tag-or-commit>
```

把 `<tag-or-commit>` 替换为真实版本或提交，不要原样输入；目前不假定仓库已经发布 tag。

> 插件 Host 代码在 DSH 进程内运行，请只安装信任的仓库。安装依赖可能需要访问 npm；GitHub 可访问不代表依赖源也可访问。当前包没有安装脚本或构建步骤；如果管理器额外要求运行依赖脚本，请检查具体包名后再授权。

### 本地目录安装

适合开发或 GitHub 直连受限的环境：

```sh
git clone https://github.com/ginkgonine/dsh-todo-note.git
```

然后在 **插件 → 添加插件** 中填写克隆目录的**绝对路径**；或运行：

```sh
dsh plugin --profile web add /absolute/path/to/dsh-todo-note
```

Windows 用户也填写 Host 上实际存在的绝对目录。目录必须位于**运行 DSH Host 的机器**，不是另一台浏览器客户端的本地目录。

不要手动修改 DSH profile 的依赖或生成配置；由插件管理器 / `dsh plugin` 完成安装和 bundle 选择。普通用户安装无需执行本项目的 `npm install` 或 `npm test`。

### 环境与兼容性

- 需要包含插件管理器、Web UI、工作区、会话控制器和持久化存储服务的 DSH profile。
- 已在 DSH **0.2.0-rc.1 Web** 环境验证；其他版本的接口兼容性需要实际检查，不保证通用。
- 这是 DSH 插件，不是独立网站，也不提供 TUI 界面。
- GitHub 安装需要 Host 能访问 GitHub，并具备 DSH 所需的 Git / 包管理器环境；私有仓库另需配置认证。
- bundle 使用包名 `@local/dsh-todo-note` 加载，不依赖开发者机器上的安装路径。

## 使用

### 日常待办

- 点击侧边栏底部 **TODO**，打开左侧窄竖向浮动卡片，不切换聊天主工作区。
- 底部 **＋ 添加待办**：输入标题，回车创建；中文输入法确认候选词的回车不会误提交。更多笔记内容在事项的 **编辑** 中补充。
- 默认显示 **全部**：未完成在前、已完成在后。同组按创建时间排列，编辑不会使事项跳位。
- 勾选即时更新对应行，不刷新整张卡片；提交失败会还原状态并显示错误。
- 右上角搜索图标按需展开输入框；再次点击或在搜索框内按 Escape 清空并收起。
- 支持 **全部 / 待完成 / 已完成** 筛选。点击 **删除** 直接永久移除事项，无二次确认、回收站或撤销；失败时保留事项并显示错误。
- 再点 TODO、卡片的 × 或按 Escape 关闭卡片；卡片外仍可操作 DSH。
- 背景跟随 DSH 明暗主题；支持的浏览器使用轻磨砂，不支持时使用主题色实底。列表独立滚动，添加区固定在底部。

### 截止日期与日历

- 在 **编辑** 中设置或清除截止日期。当前按天管理，不包含具体时刻、自动提醒或后台调度。
- 未完成事项显示 **今天到期 / 已逾期**；完成后不再标红逾期。今天按浏览器本地日期判断，保存的日期不会经过 UTC 时间转换。
- 右上角日历图标打开月历（周一开始），可以切换月份、回到今天。有到期事项的日期显示圆点。
- 点击日期查看当天到期事项；**全部日期** 包含没有截止日期的事项。状态和搜索筛选仍然生效。
- 日历底部 **收起日历** 或右上角入口都可回到列表，并取消日期筛选；不会清除待办的截止日期。
- 选中某天后，底部快速添加自动使用该日期，输入框占位显示选定日期；普通列表或全部日期模式下不会自动设置日期。

### 从待办发起 agent 对话

1. 点击事项的 **发起 agent 对话**。
2. 从下拉列表选择侧边栏已有的工作区；工作目录由该工作区决定。
3. 点击 **创建并发送**：创建归属于该工作区的独立会话，并发送已保存的标题、笔记和截止日期。

未选择、工作区失效或加载失败时不会发送，也不会悄悄退回“未分组”。没有工作区时请先在侧边栏添加。

**打开对话** 返回该事项最近创建的会话。agent 对话完成不会自动勾选待办；启动对话可能产生模型调用费用，且仍遵守常规 DSH 权限与审批策略。

## 在对话中管理 TODO

插件注册 `todo_note`，agent 和前端共用同一份持久化数据。直接对 agent 说：

- “添加一个 TODO：整理项目文档。”
- “把刚才讨论的后续工作整理成 TODO。”
- “把整理文档那条的截止日期设为 2026-12-31。”
- “把那条待办标记为完成。”

卡片已打开时，点击右上角刷新查看 agent 修改。

| action | 参数 | 结果 |
| --- | --- | --- |
| `list` | 无 | `notes` |
| `list_workspaces` | 无 | `workspaces`（id / title / path） |
| `create` | `title` 必填；`body` / `completed` / `dueDate` 可选 | `note` |
| `update` | `id`，加 title / body / completed / dueDate 至少一项 | `note` |
| `delete` | `id` | `id`、`deleted` |
| `start_chat` | `id`、推荐 `workspaceId`；与兼容参数 `cwd` 互斥 | `sessionId` |

`dueDate` 是真实日期 `YYYY-MM-DD`（0001–9999 年）；传 `null` 清除，更新时省略则保留。旧待办默认无日期。

Agent 应先调用 `list_workspaces`，再用 `workspaceId` 发起对话。旧工具调用仍兼容绝对路径 `cwd`：匹配已注册工作区时自动归入，无匹配时创建未分组会话。仅在工具调用同时省略工作区和目录时，使用 `config.cwd`；默认是 DSH Host 进程启动时的工作目录，不再固定为开发者机器上的路径。

失败返回 `ok:false` 和 `error`。新会话创建后发送失败时，`error.sessionId` 可用于打开已经创建的会话，避免重复创建。

## 更新、禁用与卸载

### 更新

GitHub 安装不会自动跟随仓库每次提交。要更新到目标 commit / tag，使用 DSH 的插件管理功能重新安装对应地址；命令行示例：

```sh
dsh plugin --profile web add "github:ginkgonine/dsh-todo-note#<commit-or-tag>"
```

实际替换 Host 包代码后应**重启 DSH，再刷新 Web 页面**；仅刷新页面不会替换缓存中的 Host JavaScript 模块。

本地目录安装时，更新克隆目录的代码后同样重启 DSH。不要把 GitHub 安装与本地安装理解为两个独立数据副本：包名和存储域相同，应选择其中一种来源。

### 禁用 / 卸载

在 **插件** 页面找到 **TODO 笔记 / TODO Notes**，关闭开关即可禁用；在详情页使用卸载移除 bundle。命令行卸载：

```sh
dsh plugin --profile web remove @local/dsh-todo-note
```

安装和管理变更影响使用同一 profile 的会话。插件卸载不会主动删除待办数据；请不要把卸载作为清空待办的方法。

## 数据与备份

- 数据保存在 DSH Host 的持久化存储域 `todo_note`，不在浏览器 localStorage，也不在 GitHub 仓库。
- profile 切换、DSH 存储后端配置或不同 Host 可能使用不同数据范围；本插件不提供跨机器同步或导入导出。
- 数据范围最终由 DSH 存储配置决定。备份时根据该配置备份 Host 存储，不能只备份本项目源代码目录。
- 截止日期版使用存储版本 2，兼容读取版本 1；未修改的旧记录不自动重写。**不要直接降级到旧 Host 入口**：旧版不认识版本 2，可能看不到已修改或新建记录，尽管磁盘文件仍在。
- 已有未分组会话不会自动迁移；可在侧边栏归入对应工作区（目录须匹配）。

## 常见问题

**可以不发布 npm、直接 GitHub 安装吗？**

可以。本项目是带 `dsh.bundle.patch` 和 Client 入口的 npm 格式包，GitHub 只是安装来源。仓库根目录包含包清单和运行文件即可；请安装包含包名加载配置的新版提交，早期本机专用绝对路径版本不能用于跨机器安装。

**GitHub 下载失败，换 npm 镜像有用吗？**

npm 镜像可以解决 registry 依赖下载问题，不会替代 GitHub 仓库本身。检查 Host 的网络 / Git 配置，或先克隆到 Host，再用本地目录安装。

**安装成功但没有 TODO？**

确认安装到了当前 Web 使用的 profile、bundle 和插件行均已启用；查看安装结果是否要求重启，以及插件错误诊断。重启后刷新页面。不要在另一个 profile 安装后期待当前页面出现入口。

**安装后工作区列表为空？**

先在 DSH 侧边栏注册项目工作区。该下拉列表不是服务器上的所有目录，也不会自动创建工作区。

## 开发与验证

原生 JavaScript，无前端构建步骤；使用 DSH 提供的 React、slot、locale 和主题 token，不导入 Harness 私有 UI 组件。

```sh
npm install --ignore-scripts
node --check client.js
node --check host-calendar.js
npm test
```

测试不需要 GitHub 认证。部分集成测试使用当前开发环境的 DSH 安装目录，跨机器运行测试需先调整测试中的 DSH 路径；这不影响正常插件安装。测试文件不会进入运行包。

已覆盖 CRUD、截止日期校验与清除、旧存储升级、真实 JSON 落盘、闰年和时区日历、工作区选择与会话归属，以及 UI / agent 操作一致性。会话启动测试使用 mock 或对已安装控制器的定向验证；不等于完整浏览器端到端测试。当前没有截图或 light/dark 人工视觉验证，不将 slot 注册视为视觉验证。
