# 更新说明与 iPhone／iPad 入口

本次仅修改前端，无新依赖、数据库字段、API 或通知配置。保持原 Site、URL 和用户数据，按原 GitHub → Work 流程发布。

## 更新说明

文案集中在 `lib/release-notes.mjs`，包含中日文。这次汇总完整更新内容，不按一天内的修改顺序拆分，不显示内部版本号或开发过程。

- 进入应用后（包括未登录页面）首次显示；示例模式不自动弹出。
- 点击“知道了”或按 Escape 关闭后，只把该版本已读标记保存到当前浏览器的 localStorage：`komorebi-update-seen:<id>`。不记录账号、育儿内容或设备指纹。
- 同一浏览器的其他标签页会同步已读状态；同一台物理设备的 Safari 和主屏幕实例若由系统分开存储，则各显示一次。
- 设置页“更新记录”可手动查看当前版本说明。不是逐次弹出的历史列表。
- 清除网站数据、换浏览器/设备后可能再次显示。存储被限制时仍能关闭并正常使用应用，当前页面不会反复弹出，但无法保证重启后仍记住。

以后需要展示新的更新说明时：修改 `currentRelease.id` 为一个从未使用过的新标识，并更新 `ja` / `zh` 文案，然后正常发布。只改代码或部署而不改此 ID，不会让已确认用户再次看到弹窗。旧 ID 的已读标记保留，回滚时不会重复提示。

## iPhone／iPad 入口

按用户新增要求，普通 iOS 浏览器只展示“添加到主屏幕”说明，暂不挂载应用，不读取 `/api/state`，也不自动注册 Service Worker 或申请通知权限。引导使用系统“分享 → 添加到主屏幕”，如系统提供“作为 Web App 打开”，保持开启。

`navigator.standalone` 或 `display-mode: standalone` 确认从主屏幕启动后，正常进入原有应用。iPadOS 的 MacIntel + 多点触摸也显示引导。电脑及其他非 iOS 浏览器继续以普通网页使用。没有提供忽略引导直接进入的按钮，也没有删除会话或数据。这是前端使用方式引导，不改变服务端身份验证。

普通 iOS 浏览器即使已有主屏幕安装，也无法可靠查询系统安装清单，仍会显示“从主屏幕图标打开”的说明；真正从图标启动时不会显示安装引导。

Apple 参考：
- https://support.apple.com/guide/iphone/iphea86e5236/ios
- https://support.apple.com/guide/ipad/open-as-web-app-ipad8f1f7a29/ipados

## 验证

`npm run check`、`npm run build`；`TEST_BROWSER=webkit npm run test:entry-ui`、Edge 的同一测试；现有 `test:preview-ui` 和 WebKit `test:uiux`。

新入口测试覆盖：首次显示、旧说明已读仍显示新说明、确认后刷新不再显示、跨标签页同步、独立设备分别显示、中日文手动查看、320px 和横屏布局、存储受限可关闭、iPhone 普通浏览器不请求业务 API、桌面 UA 的 iPad 引导、主屏幕模式正常进入。

自动测试模拟 iOS 环境，不能替代真实 iPhone/iPad 的系统添加操作和已安装应用验证。发布后请各验证一次普通 Safari 引导、原主屏幕图标启动、确认更新说明后重启不再弹出、电脑浏览器正常使用。
