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

## Docker 部署

项目已提供 `Dockerfile`、`.dockerignore` 和 `docker-compose.yml`。首次部署可以直接执行：

```bash
docker compose up -d --build
```

默认访问地址：

- 主页面：http://服务器IP:4177
- 管理后台：http://服务器IP:4177/admin

建议先复制 `.env.example` 为 `.env`，再按需修改端口、上游节流等配置：

```bash
cp .env.example .env
docker compose up -d --build
```

默认管理密码是 `admin123`。登录 `/admin` 后建议立即在后台修改密码；compose 默认不注入 `ADMIN_PASSWORD`，这样后台修改后的密码会保存在挂载的 `./data/shops.json` 中，容器重启后仍然有效。

compose 会把宿主机的 `./data` 挂载到容器 `/app/data`，把 `./diagnostics` 挂载到容器 `/app/diagnostics`。店铺数据、管理密码和诊断文件都会保留在宿主机上，重建容器不会丢失。

如果你一定要用环境变量强制指定管理密码，可以在 `docker-compose.yml` 的 `environment` 中手动加入 `ADMIN_PASSWORD`。这种方式会覆盖后台保存的密码；后台改密码只会影响当前进程，容器重启后仍以 compose 中的环境变量为准。

如果希望后台版本信息能准确显示当前镜像对应的 Git 提交，可以在构建前注入版本变量：

```bash
export LDXP_COMMIT_SHA="$(git rev-parse HEAD)"
export LDXP_VERSION="$(git describe --tags --always 2>/dev/null || git rev-parse --short HEAD)"
export LDXP_IMAGE="ldxp-price-board:latest"
docker compose up -d --build
```

也可以直接使用 `docker build`：

```bash
docker build \
  --build-arg LDXP_COMMIT_SHA="$(git rev-parse HEAD)" \
  --build-arg LDXP_VERSION="$(git describe --tags --always 2>/dev/null || git rev-parse --short HEAD)" \
  --build-arg LDXP_IMAGE="ldxp-price-board:latest" \
  -t ldxp-price-board:latest .
```

容器内默认监听 `0.0.0.0:4177`。如需修改宿主机暴露端口，可在 `.env` 中设置 `PORT=你的端口`。

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

容器部署：

- 使用本仓库的 `docker-compose.yml` 时，已默认设置 `LDXP_DEPLOY_MODE=container`、`LDXP_DATA_DIR=/app/data` 和必要的版本变量入口。
- 容器里通常没有 `.git` 目录，建议在构建镜像时注入环境变量，例如 `LDXP_COMMIT_SHA`、`LDXP_VERSION`、`LDXP_IMAGE`。
- 后台会通过 GitHub API 检查 `Yiyoki/liandongxiaopu-collection` 的 `main` 最新提交。可用 `LDXP_GITHUB_REPO` 和 `LDXP_GITHUB_BRANCH` 覆盖。
- 容器无法可靠地在内部替换自己，后台自更新需要配置 `LDXP_CONTAINER_UPDATE_COMMAND` 或 `LDXP_UPDATE_COMMAND`，例如触发宿主机 webhook、调用 Portainer API、或执行你自己封装的 compose 更新脚本。

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

Linux 无界面服务器上也可以直接 SSH 进入项目目录运行：

```bash
npm run diagnose:upstream -- https://pay.ldxp.cn/shop/VK6TGVU1
```

命令会把诊断报告和上游原始响应保存到 `diagnostics/`。如果上游返回 HTML 验证页，把生成的 `*-report.json` 和 `*-attempt-1.html` 内容用于分析即可；里面会包含状态码、响应头摘要、`arg1` 是否存在、是否生成 `acw_sc__v2`、以及重试后的结果。

为了降低触发风控的概率，后端会对所有链动小铺上游请求做串行节流，默认每次请求至少间隔 `800ms`。可以通过 `LDXP_UPSTREAM_MIN_INTERVAL_MS` 调整，例如：

```bash
LDXP_UPSTREAM_MIN_INTERVAL_MS=1500 npm start
```

## 注意

- 本项目只保存本地快照，不记录价格历史曲线。
- `data/`、`dist/`、`node_modules/`、日志和 `.env` 文件已被 `.gitignore` 排除。
