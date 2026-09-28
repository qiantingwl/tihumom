# 升级、迁移与故障处理

## 持久数据

| 路径 | 作用 |
| --- | --- |
| `.env` | 管理员口令、Cookie 和环境设置 |
| `data/gallery.json` | 作品及回收站记录 |
| `data/tasks.json` | 近期任务与结果 |
| `data/settings.json` | 检测和品牌设置 |
| `data/home-config.json` | 首页文案 |
| `data/bot-config.json` | 本地放单计划 |
| `data/showcase-pairs.json` | 对拍内容 |
| `data/danmaku.json` | 弹幕 |
| `data/session-secret.json` | 访客 Cookie 签名，必须保留 |
| `data/previews/` | 可重建的缩略图缓存 |

部分文件在首次使用时创建。备份完整 `data/`，不要只备份作品。不能让多个实例同时写同一数据目录。

## Docker 升级

以下针对仓库自带 `compose.yaml`。自定义编排需按实际服务名、镜像名和路径调整。先在后台关闭新检测，等待已有任务结束；重启会中断未完成任务，不会自动重放收费请求。

在项目目录执行，`TARGET` 换为目标发布标签：

```sh
TARGET=v0.2.1
STAMP=$(date -u +%Y%m%d-%H%M%S)
BACKUP="$(dirname "$PWD")/pelican-backups/$STAMP"
mkdir -p "$BACKUP"
chmod 700 "$BACKUP"
git rev-parse HEAD > "$BACKUP/old-commit.txt"
cp compose.yaml "$BACKUP/compose.yaml"
CONTAINER=$(docker compose ps -q pelican)
OLD_IMAGE=$(docker inspect --format '{{.Image}}' "$CONTAINER")
docker tag "$OLD_IMAGE" "pelican-mama:backup-$STAMP"
printf '%s\n' "pelican-mama:backup-$STAMP" > "$BACKUP/old-image.txt"
git fetch origin --tags
git checkout --detach "$TARGET"
docker compose build
docker compose stop pelican
tar -czf "$BACKUP/persistent.tar.gz" .env data
chmod 600 "$BACKUP/persistent.tar.gz"
docker compose up -d --no-build --wait
docker compose exec pelican node scripts/check-renderer.mjs
node scripts/smoke.mjs https://www.tihu.mom
```

宿主机没有 Node 时，可从装有 Node 的本机运行冒烟检查，或先执行 `curl --fail https://你的域名/api/health`。恢复后台检测开关，检查历史作品和管理员登录。

不要执行 `git clean -fdx`，它会删除被忽略的配置和数据。构建在停服务前进行，构建失败不需要停掉旧容器；停服务后的步骤失败则立即回滚。

## 回滚代码

选择实际备份目录，保留当前数据，恢复旧代码、编排及镜像：

```sh
BACKUP=/实际路径/pelican-backups/实际时间
git checkout --detach "$(cat "$BACKUP/old-commit.txt")"
cp "$BACKUP/compose.yaml" compose.yaml
docker tag "$(cat "$BACKUP/old-image.txt")" pelican-mama:local
docker compose up -d --no-build --wait
curl --fail http://127.0.0.1:8988/api/health
```

仅回滚代码时不要覆盖数据。只有数据损坏或版本迁移明确要求时，才停止应用、另外备份当前数据，再人工恢复 `persistent.tar.gz`；这会丢失备份之后的新内容。

## 迁移站点

1. 源站关闭新任务，等待任务完成并停止应用。
2. 通过 SSH / SFTP 复制完整 `.env` 与 `data/`，不要经过公开 Git。
3. 目标主机检出对应版本，配置域名、构建镜像并调整数据目录所有权。
4. 启动后验证作品、历史记录与会话签名，再切换 DNS。
5. 保留源站备份，避免两端同时接收新写入。

已有 `shared/data` 与 `current` 发布目录结构的站点，应保留共享目录挂载，不要换成新的空 `./data`。默认 Compose 用于首次安装，不应直接覆盖现有编排。

## 常见故障

| 现象 | 排查 |
| --- | --- |
| 502 | `docker compose ps`、`docker compose logs --tail=100 pelican`、本机 `/api/health` |
| data 权限错误 | 检查挂载和容器 UID/GID，只调整实际数据目录 |
| Chromium 不可用 | 用运行服务的账户安装浏览器；Docker 镜像与 Playwright 锁定版本保持一致 |
| 进度不更新 | 反代关闭缓冲与缓存，检查 SSE 连接和代理超时 |
| 域名修改无效 | `VITE_PUBLIC_ORIGIN` 需要重新构建 |
| 图片或 Logo 404 | 检查 Dockerfile / .dockerignore，确认 `/logo.png` 为图片 |
| 新机器没有作品 | 源码不含数据，需单独迁移 |
| 旧任务无法认领 | 检查会话签名、HTTPS 和 Cookie 设置 |
| 渲染等待 | 首次启动浏览器或生成缩略图需要时间，查看任务状态及日志 |

日志、导出数据、截图与备份可能包含敏感信息，不要直接放进公开 issue。
