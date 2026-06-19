# LD小铺价格比价台

一个本地运行的链动小铺商品聚合与比价工具。输入店铺链接后，系统会抓取商品名称、价格、库存、原始分类和商品链接，并支持自定义分组、后台管理和定时刷新。

## 功能

- 多店铺商品聚合
- 商品价格、库存、分类统一查看
- 默认隐藏 0 库存商品
- 自动分组：GPT Free、GPT Team、GPT Plus、GPT Pro、Claude、Grok、Gemini / Google、邮箱、接码、其他
- 后台手动修改商品分类并持久保存
- 后台手动删除商品；定时刷新不会恢复，手动刷新会重新拉回
- 定时刷新，默认 15 分钟
- 后台支持切换中文 / English 界面语言
- 后台显示当前版本，并支持从 GitHub 自更新和重启
- `/admin` 管理后台密码保护

## 启动

```bash
npm install
npm run dev
```

访问：

- 主页面：http://127.0.0.1:5173
- 管理后台：http://127.0.0.1:5173/admin

默认管理密码是 `admin123`。

## 配置

推荐使用环境变量设置管理密码：

```bash
ADMIN_PASSWORD=your-password npm run dev
```

Windows PowerShell 可使用：

```powershell
$env:ADMIN_PASSWORD="your-password"; npm run dev
```

如果没有设置 `ADMIN_PASSWORD`，系统会读取本地 `data/shops.json` 中的 `settings.adminPassword`。该文件包含本地店铺数据和密码，不应提交到公开仓库。

在管理后台修改密码时，系统会同步更新本地 `.env` 文件中的 `ADMIN_PASSWORD`，并强制退出后台，需要使用新密码重新登录。

界面语言在 `/admin` 的“定时刷新”配置区切换，当前支持 `zh-CN` 和 `en-US`。前端可见文案集中在 `src/i18n.js`，默认语言会保存到本地 `data/shops.json` 的 `settings.language`。

## 编码

项目源码、文档和本地 JSON 数据都按 UTF-8 读写，并通过 `.gitattributes` 统一为 LF 换行，方便在 Windows 和 Linux 间部署。如果 Windows 终端直接查看中文出现乱码，优先检查终端代码页或字体；应用运行和文件内容仍以 UTF-8 为准。

## 生产构建

```bash
npm run build
npm start
```

生产环境建议直接让 Node 服务同时托管 API 和前端静态文件：

```bash
npm run build
npm start
```

如果你把前端部署到 Nginx、宝塔、Vercel 等静态站点环境，需要把 `/api/*` 反向代理到 Node 后端。否则前端请求 `/api/shops`、`/api/shops` 添加店铺等接口时，会拿到前端 `index.html`，出现类似下面的错误：

```text
Unexpected token '<', "<html><scr"... is not valid JSON
```

## 后台自更新

登录 `/admin` 后可以在“版本更新”卡片中检查 GitHub 是否有新提交，并执行自更新。更新流程会依次执行：

```bash
git fetch origin main
git pull --ff-only origin main
npm ci   # 如果没有 package-lock.json，则使用 npm install
npm run build
```

为了保护部署现场，若当前服务器存在未提交的本地源码改动，后台会拒绝自更新。

重启策略：

- 如果使用 PM2 启动，系统会自动执行 `pm2 restart <pm_id>`。
- 如果配置了 `LDXP_RESTART_COMMAND`，系统会执行该命令，例如 `LDXP_RESTART_COMMAND="pm2 restart ldxpPrice"`。
- 如果两者都没有，系统会在更新完成后退出当前 Node 进程，需要 systemd、Docker、宝塔等外部守护进程自动拉起。

## 上游反爬

部分服务器出口 IP 请求 `https://pay.ldxp.cn/shopApi/*` 时，链动小铺上游可能返回 `text/html` 的 JS 验证页，内容类似 `<html><script>var arg1=...`，而不是 JSON。本项目后端会识别该响应，自动计算并携带 `acw_sc__v2` cookie 后重试一次。

如果自动验证仍失败，后台会显示“链动小铺上游返回了反爬验证页”。可尝试：

- 稍后重试，或更换服务器出口 IP。
- 在服务器环境变量中配置浏览器访问链动小铺后得到的 cookie 值：`LDXP_ACW_SC_V2=你的acw_sc__v2值`。
- 使用更稳定的代理出口，并确保 Node 进程能访问上游 `pay.ldxp.cn`。

也可以用管理密码调用诊断接口查看服务器实际拿到的上游响应：

```bash
curl -X POST https://你的域名/api/upstream-diagnostics \
  -H "content-type: application/json" \
  -H "x-admin-password: 你的管理密码" \
  -d '{"url":"https://pay.ldxp.cn/shop/VK6TGVU1"}'
```

诊断结果里的 `contentType`、`challenge.detected`、`challenge.cookieGenerated` 和 `bodyPreview` 可以判断是正常 JSON、JS 验证页、上游超时，还是出口 IP 被拦截。

## 注意

- 本项目只保存本地快照，不记录价格历史曲线。
- `data/`、`dist/`、`node_modules/`、日志和 `.env` 文件已被 `.gitignore` 排除。
