# 部署教程

本项目是独立 Vue + Fastify 服务，不依赖 Sub2API。推荐 Linux + Docker Compose + HTTPS 反向代理。构建需要访问 npm 和 Microsoft 容器镜像仓库。

## Docker Compose 首次安装

先安装 Git、Docker Engine 和 Compose 插件，确认 `docker version` 与 `docker compose version` 可用。

```sh
git clone https://github.com/qiantingwl/tihumom.git
cd tihumom
git checkout --detach v0.2.1
```

宿主机已有 Node.js 22+ 时执行 `node scripts/setup.mjs`。否则用临时容器生成配置：

```sh
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/app" -w /app node:22-bookworm-slim node scripts/setup.mjs
```

`setup` 只在 `.env` 不存在时生成随机管理员口令。保留生成的 `ADMIN_TOKEN`，编辑 `.env` 添加或修改以下设置：

```dotenv
HOST=127.0.0.1
PORT=8988
COOKIE_SECURE=true
VITE_PUBLIC_ORIGIN=https://www.tihu.mom
```

`www.tihu.mom` 是原项目域名，独立部署时替换为自己的 HTTPS 域名。不要将 `.env.example` 的占位口令用作正式口令。

```sh
chmod 600 .env
docker compose build
mkdir -p data
APP_UID=$(docker run --rm --entrypoint id pelican-mama:local -u)
APP_GID=$(docker run --rm --entrypoint id pelican-mama:local -g)
sudo chown -R "$APP_UID:$APP_GID" ./data
docker compose up -d --wait
docker compose exec pelican node scripts/check-renderer.mjs
curl --fail http://127.0.0.1:8988/api/health
```

Compose 只将端口绑定到宿主机回环地址，外部访问由 HTTPS 反代负责。无需在防火墙开放 8988。容器使用非 root 用户 `pwuser`，必须能写入挂载的数据目录。

本机临时 HTTP 验证可设 `COOKIE_SECURE=false`；正式启用 HTTPS 后改回 `true`，执行 `docker compose up -d --force-recreate`。

## 宝塔面板

1. 域名解析到服务器，在宝塔安装 Docker / Compose 和 Nginx。
2. 按上文部署，确认服务器本机 `/api/health` 返回 `ok: true`。
3. 网站 → 添加站点，填入域名，使用纯静态站点，无需 PHP。
4. 在站点 SSL 中申请并启用证书，开启强制 HTTPS。
5. 设置反向代理到 `http://127.0.0.1:8988`，请求域名使用当前站点域名。
6. 按根目录 `nginx.example.conf` 设置转发头、禁用缓冲并延长超时。
7. 用模板替换对应的 `location /`，不要重复添加同名块；配置检查通过后重载 Nginx。

流式进度需要关闭代理缓冲与缓存。所有页面和静态资源都转发给应用，不能只反代 `/api`；`/gallery?item=...` 也应交给应用。

站点根目录不要指向包含 `.env`、`data/` 的源码目录。仓库不附带生产服务器地址和登录密码。

## 已有 Nginx / Caddy

将 `nginx.example.conf` 中的 location 块放进自己的 HTTPS `server` 块。证书、域名和 HTTP 跳转由现有站点负责。`nginx -t` 通过后再重载。

Caddy 示例：

```caddyfile
www.tihu.mom {
    reverse_proxy 127.0.0.1:8988 {
        flush_interval -1
    }
}
```

修改公开域名后，更新 `.env` 的 `VITE_PUBLIC_ORIGIN` 并执行 `docker compose up -d --build --wait`。这是构建变量，只修改容器运行环境不会改变前端分享地址。

## 不使用 Docker：Node + systemd

使用非 root 账户运行。下面假定专用账户为 `pelican`，程序目录为 `/opt/pelican-mama`；先创建账户并给它该目录的管理权限。

以应用账户在项目目录执行：

```sh
npm ci
npm run setup
npx playwright install --with-deps chromium
npm run check:renderer
npm run build
```

安装系统依赖可能需要 sudo；Chromium 文件应安装在运行服务的账户下。在 `.env` 中设置 `HOST=127.0.0.1`、`COOKIE_SECURE=true` 和正确的 `VITE_PUBLIC_ORIGIN`。修改构建变量后重新构建。

创建 `/etc/systemd/system/pelican-mama.service`：

```ini
[Unit]
Description=Pelican Mama
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pelican
Group=pelican
WorkingDirectory=/opt/pelican-mama
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --env-file-if-exists=.env --import tsx server/index.ts
Restart=on-failure
RestartSec=5
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

Node 路径需与 `command -v node` 一致，版本为 22+。不要使用仅在另一个账户登录 shell 中存在的 nvm 路径。

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now pelican-mama
sudo systemctl status pelican-mama
```

随后配置 HTTPS 反代。反代与服务同机、且后端只能由可信反代访问时，可设 `TRUST_PROXY=loopback`；不要信任任意来源的代理头。

## 上线验证

```sh
node scripts/smoke.mjs https://www.tihu.mom
```

换成自己的域名。此检查不会调用模型接口。再用浏览器确认首页、作品库、检测页和管理入口，检查 Logo、作品预览及指定作品的分享链接。

实际模型调用需在检测页填写可用兼容接口、API Key 与模型，可能产生上游费用。新部署的作品库为空，需要单独迁移原数据；凭据与生产数据不能上传到公开仓库。
