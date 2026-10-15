# 私有服务器观测台

GitHub Pages 静态前端，面向 Ubuntu 124.156.165.21 及其网站。数据由 Ubuntu 上的独立 aki-monitor 采集与认证 API 提供；关闭网页或本地电脑不会中断监控。数据、刷新与导出接口均需登录。

- 服务器 CPU、内存、Swap、磁盘与 I/O、网络、进程、服务、连续运行时间和健康摘要。
- 12 个网站条目，包含按要求暂停的有点困 OOTD；暂停保留程序与数据库，不判为故障。
- 每站 CPU、内存、文件用量、HTTP 响应内容发送量、源站响应和服务运行时间；展开查看部署参考、文件更新、版本证据、证书与响应地址。
- 国内三网 HTTP/ICMP 探测、网站源站延迟、CPU/内存与小时流量趋势；桌面与手机使用同一套白灰底、克制粉色的中文界面。
- 资源每 30 秒、网站每 5 分钟、定时 Globalping 每 30 分钟采集；文件与部署元数据由固定目录的 root oneshot 每 5 分钟生成。
- 密码校验在服务器端；访问会话有效期 8 小时。
- 本仓库不包含密码、SSH 密钥、服务器配置、数据库或监控快照。
- GitHub Pages 只托管静态界面，不负责采集。

发布入口：[服务器观测台](https://akihowaito.github.io/server-health/)。此文档记录本次完成的扩展；生产激活与计量开始时间以发布后的实际验证为准。

## 指标口径

网站 CPU 来自 systemd cgroup 计数器差值，并按整机核心数归一化。采样缺口、首次采样与服务重启缺少有效基线时保持未知。静态网站共用 Caddy，CPU 与内存无法独立拆分。连续运行表示当前服务运行时长，不代表网站上线年限。

“部署时间参考 · 本机目录创建”来自文件系统目录创建时间，不是已确认的首次上线日期；“最近文件更新”来自文件 mtime。版本优先使用现有发布软链接的目标名称；没有发布名称时只显示公开 HTML 的 SHA-256 文件指纹，缺失时显示待读取。

网站 HTTP 响应字节、请求数、5xx 与直方图 P95 仅从生产 Caddy 脱敏日志实际启用后累计。响应字节不含全部网络与 TLS 开销，P95 为直方图分桶上界。保留已有 7 天服务器资源历史；新网站资源历史从本次采集开始，不补造过去的记录。源站请求耗时不是完整网页加载时间，节点样本成功率不是全国可用性。

## 实现与验证

前端使用 index.html、app.js、style.css、insights.css 与 runtime.js，无构建步骤或外部字体。runtime.js 设置当前服务器的 API 前缀。后端由 server.py、collector.py、analytics.py、site-catalog.json 与 usage_snapshot.py 提供；私有历史与凭据保存在服务器端并保持在 Git 外，原有访问密码不变。

发布采用独立监控组件与 Caddy reload，业务服务保持原状。隔离预发布验证中的两次真实测试请求共 22 响应字节，不属于生产客户流量；测试数据库不会复制回生产。

功能验证记录位于 `C:/Users/akiho/Documents/Codex/2026-10-15/new-chat/work/monitor-upgrade-qa.json`。本次画面证据位于 `.impeccable/review/` 的 desktop、desktop-top、desktop-site、mobile、mobile-top、mobile-site 与 mobile-chart-context PNG；视觉与产品约束记录在配套后端目录的 DESIGN.md 和 PRODUCT.md。
