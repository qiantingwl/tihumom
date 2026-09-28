# 鹈鹕妈妈 · TihuMom

独立部署的模型观察站。接入自己的模型接口，查看生成的动画、推理答案、耗时及判定依据，并将结果发布到作品墙。

正式站点：[www.tihu.mom](https://www.tihu.mom) · 当前版本：**v0.2.1**

## 功能

- 鹈鹕骑行 SVG 动画、糖果推理与自定义提示词检测。
- 流式任务进度、取消任务、刷新后恢复任务状态。
- 作品墙筛选、排序、内容去重、预览、源码、分享和二维码。
- 同题对比、统计、可疑样本、图像战报与 API 页面。
- 管理后台：站点文案、模型设置、作品导入、回收站、重新判定、任务记录。
- Vue 3 + TypeScript + Vite 前端，Fastify 服务端，Playwright / Chromium 本地渲染。

判定只针对本次输出与采样规则，不代表模型身份或整体能力。自定义题保留回答，不套用鹈鹕判定。

## 快速启动

需要 Node.js 22+。

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

本机访问 `http://127.0.0.1:8988`，管理入口 `/admin`。`setup` 会生成随机管理员口令并写入 `.env` 的 `ADMIN_TOKEN`；不会覆盖已有配置，也不会将口令打印到日志。

开发模式：`npm run dev`。Linux 缺少浏览器依赖时执行 `npx playwright install --with-deps chromium`。

## 部署与维护

| 文档 | 内容 |
| --- | --- |
| [部署教程](docs/DEPLOYMENT.md) | Docker Compose、宝塔、Nginx、HTTPS、Node / systemd |
| [升级与回滚](docs/OPERATIONS.md) | 数据迁移、备份、版本更新、回滚、常见故障 |
| [更新记录](docs/CHANGELOG.md) | 当前公开版本的修复与变化 |
| [素材说明](CREDITS.md) | 品牌素材来源和第三方声明 |

默认分享、二维码及 API 示例使用 `https://www.tihu.mom`。部署到自己的域名时，在 `.env` 设置 `VITE_PUBLIC_ORIGIN=https://你的域名`，**重新构建**前端或 Docker 镜像；仅重启服务不会修改前端中的域名。

## 数据与配置

- `data/` 保存作品、任务、站点配置、弹幕、对拍与访客会话签名；它不在 Git 仓库里。
- `.env` 保存管理员口令等部署配置，同样不提交。
- 新安装的作品库为空。迁移已有站点时，复制原 `.env` 与完整 `data/`，不要用其他机器的数据覆盖线上。
- 采用单进程文件持久化，不能让多个实例同时写同一个数据目录。
- 管理后台的本地放单会复用历史作品或生成本地示例，不会产生真实上游请求；默认定时放单关闭。

## 验证

```sh
npm test
npm run build
npm run smoke -- https://www.tihu.mom
```

自动测试使用临时数据，不调用付费模型接口。冒烟检查只读取健康状态、页面、品牌素材及 API，不会生成作品。首次测试前需安装 Chromium。

公开仓库不包含生产作品和检测记录，也未为项目代码另行指定开源许可证。依赖许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
