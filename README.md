# 鹈鹕妈妈 · TihuMom

![鹈鹕妈妈](public/assets/hero-pelican-cycling.jpg)

> 自部署的模型检测站——**带着你自己的模型接口来，现场跑一次可复现的检测。**

填入任意 OpenAI 兼容接口，鹈鹕妈妈用固定提示词让模型现场画出「鹈鹕骑自行车」SVG 动画或回答推理题，在本地 Chromium 里渲染评判、比对标准答案，给出**「正常 / 降智」**的量化判定，结果自动进入公共作品墙。

不预置模型、不需要平台 Key、不爬外部数据——作品墙里的每一条样本都来自现场实测、本地示例或管理员手动导入。

正式站点：[www.tihu.mom](https://www.tihu.mom) · 当前版本 **v0.2.1**

## 它能做什么

- **现场检测**：支持 `/v1/chat/completions` 与 `/v1/responses` 两种接口格式；流式进度、实时 Token 与耗时统计、任务取消、刷新后恢复。
- **三类题目**：鹈鹕骑行 SVG 动画（本地渲染判定）、糖果推理题（标准答案比对）、自定义题目（保留回答，不套用判定）。
- **作品墙**：检测完成自动入库，支持筛选排序、内容去重、预览缩略图、源码查看、点赞弹幕、分享链接与二维码。
- **同题对比**：同一道题、不同模型或不同配置的产出并排对拍，配「标准 vs 失败」示例组。
- **排行榜与风控**：模型表现综合排行、现场动态流水、可疑样本证据记录。
- **管理后台**：站点文案与品牌、并发限速超时参数、任务监控、样本导入、回收站、重新判定、人工判定、数据导出。
- **开发者 API**：内置 API 指南页（`/api-docs`），可把检测能力接进自己的工具链。

**工作原理**：提交接口与模型 → 发送固定提示词 → Playwright 在本地 Chromium 渲染输出或比对标准答案 → 依据采样规则给出判定与统计 → 自动发布到作品墙。

> 判定只针对本次输出与采样规则，不代表模型身份或整体能力。

## 页面一览

`/` 首页 · `/test` 现场检测 · `/gallery` 作品墙 · `/compare` 同题对比 · `/stats` 检测统计 · `/suspicious` 可疑样本 · `/api-docs` 开发者 API · `/admin` 管理后台

## 快速开始（Docker Compose）

要求 Docker Engine 24+ 和 Compose v2，构建需要访问 npm 与 Microsoft 容器镜像仓库。

```sh
git clone https://github.com/qiantingwl/tihumom.git
cd tihumom
git checkout --detach v0.2.1

# 生成 .env 与随机 ADMIN_TOKEN（宿主机无 Node 22+ 时可用临时容器执行 setup，见部署文档）
node scripts/setup.mjs

# 编辑 .env：设置 VITE_PUBLIC_ORIGIN 为你的 HTTPS 域名，HTTPS 部署时 COOKIE_SECURE=true
docker compose build
docker compose up -d --wait
curl --fail http://127.0.0.1:8988/api/health
```

打开 `http://127.0.0.1:8988`，管理入口在 `/admin`（口令是 `.env` 里的 `ADMIN_TOKEN`，不会打印到日志）。

几点说明：

- Compose 只把端口绑定到 `127.0.0.1`，外部访问由 HTTPS 反向代理负责，宝塔 / Nginx / Caddy 配置见部署文档与 `nginx.example.conf`
- `VITE_PUBLIC_ORIGIN` 是**构建期**变量，决定分享链接、二维码与 API 示例域名——修改后必须重新构建，只重启服务不生效
- 数据（作品、任务、配置、弹幕）保存在 `data/` 目录，升级镜像不丢；单进程文件持久化，不要让多个实例写同一个目录

完整流程（含宝塔、已有 Nginx/Caddy、Node+systemd 四条路线）见 [部署教程](docs/DEPLOYMENT.md)。

## 源码运行

要求 Node.js 22+。

```sh
git clone https://github.com/qiantingwl/tihumom.git
cd tihumom
npm ci
npm run setup
npx playwright install chromium
npm run check:renderer
npm run build
npm start
```

开发模式 `npm run dev`；Linux 缺少浏览器依赖时执行 `npx playwright install --with-deps chromium`。

## 验证

```sh
npm test
npm run build
npm run smoke -- https://你的域名
```

自动测试使用临时数据，不调用付费模型接口；冒烟检查只读健康状态、页面与素材，不会生成作品。

## 技术栈

Vue 3.5 + TypeScript + Vite 6（手写样式，无 UI 组件库）· Fastify 5 + zod · Playwright 1.63 本地渲染判定 · Node ≥ 22 · JSON 文件持久化 · node:test 与 CI

## 部署与维护

| 文档 | 内容 |
| --- | --- |
| [部署教程](docs/DEPLOYMENT.md) | Docker Compose、宝塔、Nginx、HTTPS、Node / systemd |
| [升级与回滚](docs/OPERATIONS.md) | 数据迁移、备份、版本更新、回滚、常见故障 |
| [更新记录](docs/CHANGELOG.md) | 当前公开版本的修复与变化 |
| [素材说明](CREDITS.md) | 品牌素材来源和第三方声明 |

## 数据与配置

- `data/` 保存作品、任务、站点配置、弹幕、对拍与访客会话签名；`.env` 保存管理员口令等部署配置。两者都不提交到 Git
- 新安装的作品库为空；迁移已有站点时复制完整 `.env` 与 `data/`
- 管理后台的定时放单默认关闭，且只复用历史作品或本地示例，不产生真实上游请求
- 公开仓库不包含生产作品和检测记录

## 许可说明

本仓库未为项目代码指定开源许可证，保留所有权利；如需转载或二次部署授权请先联系作者。依赖许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，品牌素材归属见 [CREDITS.md](CREDITS.md)。
