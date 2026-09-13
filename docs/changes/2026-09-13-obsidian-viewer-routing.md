# Obsidian 接收页面隔离与 RC2 配套发布

独立 DSH 页面收到 reference-capture 时，在解析会话或写入 Annotation Core 之前忽略操作。Obsidian 页面继续使用其当前打开的会话；页面尚无会话时保留重试。Companion 服务端按配置的页面身份执行第二次校验。

验证：Adapter 全部 30 项测试通过；类型检查、构建及实际 Core + Adapter + Bridge HTTP 组合测试通过。
