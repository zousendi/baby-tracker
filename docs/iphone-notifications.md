# こもれび：iPhone 与通知更新接入说明

本次变更仅在本地完成，未部署。用户已允许新增独立通知表；现有表结构、业务记录、账号、家庭和公开网址必须保持。正式数据库备份由用户交给 GPT Work 处理，本次没有执行备份，也没有将任何迁移应用到现有数据库。

## 已完成

- 悬浮式移动导航：左右 12px + 安全区，底部 12px + Home Indicator 安全区；触摸设备横屏使用现有移动布局，电脑继续用侧栏。
- 刘海/横向安全区；编辑弹窗跟随 visualViewport 的键盘高度/偏移，保持滚动与缩放。真实 iOS 行为仍需实机验证。
- 沿用现有绿色叶芽标识，新增 180/192/512px PNG；Apple Touch Icon、名称、standalone Manifest 和兼容元数据。没有安装弹窗。已安装图标的更新受 iOS 管理，不会在代码中强制要求重装或清空网站数据。
- 设置页提供逐设备开启、关闭以及家人记录/喂奶提醒两个独立选项。仅点击开启才请求通知权限和注册推送 Worker。默认不发送通知。
- 家人通知只在新增记录确实成功时排队，支持喂奶、尿布、睡眠和体重，排除作者、其他家庭、停用或会话失效的账号。重试同一新增 ID 不再排队。
- 定时提醒按最后一条 milk/breast 记录时间计算；可选 1～6 小时。新喂奶、时间修改、退订或会话失效都会在发送前重新校验。超过到期时间 30 分钟的提醒不补发，避免长时间中断后发送过时提醒。
- 推送只显示通用文字，不含姓名、奶量或备注；点击打开原站点，数据仍须现有登录授权。退出、重设密码或账号停用后服务器不会继续发送。
- 推送专用 Service Worker 没有 fetch 拦截或缓存，不影响网站更新和业务同步。没有 skipWaiting、强制刷新或缓存清理。
- 出站 URL 限定已知浏览器推送服务；标准 web-push 库负责 VAPID 和负载加密，使用 Workers fetch。关闭重定向跟随；队列租约、稳定事件 ID、通知 tag、指数退避和失效订阅清理降低重复风险。推送网关已接收并不保证设备即时显示，网络不确定时也不能承诺严格只显示一次。
- 推送失败不使育儿记录保存失败。不新增自动离线保存或草稿同步。

## GPT Work 接入现有 Sites 的顺序

1. 打开原站点 `https://baby-tracker.zousendi.chatgpt.site`，核实 Site 身份/数据库绑定，保留原 URL 与 audience。不要新建或迁移项目。
2. 先完成正式 D1 备份，提供备份版本/文件和恢复方式，并核对导出有效。备份包含敏感记录与会话，不加入源码包或公开文件。
3. 核对当前线上源码与更新包的基线，合并这些变更，不覆盖线上已有的新功能。包内不含 `.openai/hosting.json`，不得替换项目身份或绑定。
4. 在测试/预览数据库验证 `drizzle/0003_notifications.sql`。文件只 CREATE 两张表及索引，不含 ALTER、DROP 或清理原数据。确认旧迁移 0000～0002 已应用，不重复执行。只有正式备份已确认后，再对正式 DB 应用 0003 一次。不要启动时自动建表。
5. 按新 package-lock 安装依赖并构建。新增运行依赖只有 `web-push`；`@types/web-push` 是开发类型声明。
6. 在 Sites 服务器的秘密配置中生成并保存以下值。不要写入源码、前端、manifest、聊天输出或定时任务提示词；本地的 `.env.example` 只说明变量名。
   - `PUSH_PUBLIC_KEY` / `PUSH_PRIVATE_KEY`：一对长期稳定的 VAPID 密钥，用 web-push 的 generateVAPIDKeys 生成。公钥会按标准提供给已登录的客户端，私钥仅保留服务端。不要在每次发布时重生成。
   - `PUSH_SUBJECT`：真实运营联系信息，使用 `mailto:` 或符合标准的 HTTPS URL；不要使用 localhost。
   - `PUSH_JOB_KEY`：至少 32 字符的高熵随机秘密，用于保护下面的调度入口。它不能与管理员密钥复用。
   - `PUSH_REMINDERS_ENABLED`：初始为 `false`，后台调度验证成功后才设为字符串 `true`。
7. 核实 Sites 能正确提供 `/notifications-sw.js`（JavaScript MIME，允许根 scope）、`/manifest.webmanifest` 和三张 PNG，HTTPS 下 Push API 正常，CSP 不阻止 Worker，服务器能访问浏览器推送服务。优先采用平台已支持的配置，不移到外部平台。
8. 配置真正的服务器后台调度，建议每分钟一次；可用任一种经过实际核验的现有 Sites 能力：
   - 若 Sites 支持 Worker Cron Trigger，将已实现的 `scheduled` handler 接到后台触发器。
   - 或使用支持安全注入服务器秘密的后台任务调用现有站点 `POST /api/notifications/dispatch`，使用 `Authorization: Bearer <PUSH_JOB_KEY>`。认证秘密必须从受保护配置读取，不能明文存入任务提示词，也不能用用户 Cookie 或管理员密钥绕过鉴权。
   - 当前源码没有虚构 `.openai/hosting.json` 的 cron 字段，也没有配置任何外部调度器。`scheduled` 函数存在并不代表后台触发器已创建。
   - 如果当前 Sites 不支持上述安全的定期执行，保持提醒开关不可用并明确告知；不要用网页 setInterval 冒充 App 关闭后的提醒，也不要为了启用而设置假状态。家人通知的首次发送由保存请求的 `ctx.waitUntil` 执行，后续重试同样可由定期调度处理。
9. 先在本人测试设备主动订阅并验证两类通知、退出后停发、另一家庭不能接收、重试不重复、无浏览器窗口时提醒仍发送，再开启提醒配置标志。通过新的设置页为每个实际设备分别订阅。
10. 取得用户发布指令后，使用原 Site 的正常保存/发布流程。发布后检查原 iPhone 图标启动的版本与业务，不能将本地测试结果当成已上线。

## 已执行验证

- `npm run check`：通过。
- `npm test`：21/21。新增通知测试使用内存 SQLite，核对迁移前所有原表 SQL 完全不变，覆盖授权范围、会话失效、重复调度、租约、退避、提醒过期与新记录取消。
- `npm run build`：通过。
- `npm run test:notifications-api`：隔离的实际 Workers + 临时 D1 通过。覆盖 Cookie/CSRF、订阅校验、用户隔离、调度秘密、家人通知与到时提醒的加密发送、重复记录/重复调度、退订及原业务数据正确性。所有出站请求均由测试拦截器接收；没有发送真实推送，没有打开现有本地或线上数据库。
- Edge 的 `test:preview-ui`、WebKit 的 `test:uiux` 通过。
- Edge / WebKit 的 `test:web-app-ui` 通过。验证实际生成的安装元数据和图片 MIME、320/390px 竖屏、844/932px 触摸横屏、电脑侧栏、浮动边距、模拟键盘视口、用户主动授权、设置保存失败重试与退订。
- 已查看本轮 WebKit 截图。没有真实 iPhone、APNs 送达或生产后台调度的实机验证。

## iPhone 实机检查

在经授权发布的版本上，用原有主屏幕图标检查：独立启动、名称/图标、刘海与 Dynamic Island、Home Indicator、横屏四个角、键盘弹出后的日期/数字/备注输入和保存按钮、关闭键盘后恢复。Safari 直接访问和 Windows/Mac 网页也应正常。

从主屏幕设置页主动开启通知：一台设备操作记录，另一位家人设备收到通用通知；关闭所有应用页面后，到所选喂奶时间仍能提醒；新增喂奶取消旧提醒；关闭通知、退出或停用账号后不再发送。记录保存与通知是否显示分别核验，不以通知代替服务器保存确认。

参考：Apple WebKit https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ ，web-push https://github.com/web-push-libs/web-push ，Cloudflare Cron https://developers.cloudflare.com/workers/configuration/cron-triggers/ 。Sites 实际调度能力需在原项目中核验。
