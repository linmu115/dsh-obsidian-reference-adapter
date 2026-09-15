# DSH Obsidian Reference Adapter

本补丁同步 **原生 Agent 上下文管理组合** 的兼容清单，接受 Annotation Core **0.3.12-rc2.11**；本插件原有职责保持不变，托管引擎不在本阶段范围内。见[组合兼容说明](docs/changes/2026-09-15-native-context-cohort.md)。

当前版本 **0.3.4-rc2.15**，面向 **DSH 0.1.5-rc.2**。它把 Obsidian 笔记选段接入 Annotation Core 的 `obsidian-note` 引用类型，负责领取、来源核对、提交回链和双向删除。通常随 [Obsidian Session Reference Suite](https://github.com/linmu115/dsh-obsidian-session-reference-suite/blob/codex/rc2-session-context-graph/README.md) 一起安装。

## 使用流程

### 从 Obsidian 引用到当前会话

1. 在 Obsidian 的内嵌 DSH Web Viewer 中打开目标会话。
2. 在笔记中选取文字，使用 **引用到 DSH**。
3. 选段先进入待接收队列；该 Vault 对应的内嵌页面领取后，在目标会话显示待发送引用气泡。原草稿保留，引用操作不自动发送问题。
4. 检查气泡和问题，再发送。Core 在实际用户消息提交后登记回链；Obsidian 的引用入口可返回对应会话和引用位置。

队列和领取操作校验稳定页面身份、实例及目标绑定。同一实例的独立浏览器窗口不会抢走 Obsidian 内嵌页的新引用。内嵌页尚未就绪时，引用继续保留为待处理；可以在 Obsidian 的 **DeepHarness Bridge** 设置中查看、重试或取消。

### 已关联的笔记：打开与引用是两个动作

会话输入区域的常驻关联笔记气泡提供：

- **在 Obsidian 打开**：定位对应笔记或块，只执行导航。
- **引用到本轮**：核对当前来源，并通过 Core 加入该会话的待发送引用集。

单纯建立关联、显示关联气泡、打开或切换会话，不会读取整篇笔记放进上下文，也不会调用模型。“引用到本轮”使用已经绑定实例、会话和引用集的直接路径，不经过自动领取队列，因此也不会被其它窗口抢走。界面入口及关联管理由配套 Sticker、Maintenance 与 Companion 提供，本 Adapter 负责笔记来源的引用生命周期。

## 来源、离线与删除

在线准备引用时，Adapter 向 Companion 核对来源。已捕获材料在 Bridge 离线时保留快照并标为离线；明确检测到笔记或块缺失、选段改变、协议不匹配时会阻止准备并显示错误，不能把错误误认为一次成功刷新。

删除分为不同的对象：

| 操作 | 结果 |
| --- | --- |
| 删除 DSH 未发送气泡 | 取消该引用，通知 Bridge 释放对应待处理记录。 |
| 删除 DSH 已提交引用 | 解除对应引用关系，通知 Obsidian 清理该引用的回链。 |
| 在 Obsidian 删除对应“DSH 引用” | 本地关系先解除；持久删除记录驱动 Core 删除对应注释/引用，断线后继续重试。 |
| 解除笔记与会话关联 | 删除该关联，不删除笔记正文或会话本身；其它引用仍独立存在。 |

一个笔记位置可能被多个引用、回链或会话关联共享。只有**最后一个有效使用方解除**后，Companion 才清理它自己创建并记录归属的 `dsh-note-*` 定位标记。用户已有块 ID 始终保留；来源移动、标记重复或清理失败时按稳定身份核对并保留重试记录，不猜测删除位置。

Maintenance 管理会话及新增关系结构的真源；Vault 管理笔记正文。Core、Adapter 与 Companion 保留各自完成投递、回执和重试所需的记录，不能把这些记录理解为另一套完整会话历史。

## 配置与组合

在 Suite 的单一父组内，顺序为 **Core → Lifecycle → Reference Adapter → Sticker**。不要把相同子插件再挂载为根插件。

本 Adapter 的 `config`：

```json
{
  "profileId": "web",
  "bridgeOrigin": ""
}
```

`profileId` 与当前实例的 Core、Lifecycle、Maintenance 一致。`bridgeOrigin` 留空时继承 Lifecycle；通常只在 Lifecycle 配置一次 Bridge 地址。实例身份也由 Lifecycle 传入。整套版本、Maintenance 前置条件和 Obsidian 设置见 [Suite README](https://github.com/linmu115/dsh-obsidian-session-reference-suite/blob/codex/rc2-session-context-graph/README.md)。

## 从源码构建

[package.json](package.json) 中部分开发依赖指向本地归档；先准备对应构件或按 Suite 的并列源码流程链接依赖，再执行：

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm pack --pack-destination .artifacts
```

`test` / `pack` 会先构建。公开源码与本地构件的可用性是两回事；此处不假定当前候选版已发布到 npm 或 GitHub Releases。

实现入口见 [Host 来源适配器](src/host/obsidian-source-adapter.ts)、[浏览器领取事务](src/client/annotation-consumer.ts)及[插件入口](src/index.ts)。版本变化见 [CHANGELOG](CHANGELOG.md)和[当前兼容说明](docs/changes/2026-09-15-graph-reference-lifecycle-cohort.md)。

本次配套更新支持 Maintenance 的轻量引用目录，详见[兼容变更说明](docs/changes/2026-09-15-maintenance-reference-directory.md)。
