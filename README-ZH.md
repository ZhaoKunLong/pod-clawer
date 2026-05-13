# pod-clawer 项目文档

> 面向同事的中文说明文档

## 项目简介

**pod-clawer** 是一个自动抓取 CCTV 新闻节目并提供在线播放的工具。每天定时从 CCTV 网站抓取《朝闻天下》和《新闻联播》的流媒体地址，保存为静态 JSON 文件，前端直接读取播放。

- **线上地址：** https://zhaokunlong.github.io/pod-clawer/
- **支持节目：** 朝闻天下、新闻联播
- **部署方式：** GitHub Actions 定时抓取 + GitHub Pages 静态托管
- **手机端：** 支持 PWA，可添加到手机桌面，体验接近原生 App

---

## 快速上手

### 环境要求

- Node.js >= 20
- 安装依赖：`npm install`
- 安装 Playwright 浏览器：`npx playwright install chromium`

### 常用命令

```bash
# 抓取今天的朝闻天下（会自动判断是否已过播出时间）
npm run crawl:zwtx

# 抓取今天的新闻联播
npm run crawl:xwlb

# 抓取指定日期
npx tsx src/crawler/run.ts zwtx 2026-05-13
npx tsx src/crawler/run.ts xwlb 2026-05-12

# 本地预览（完整模拟 GitHub Pages 效果）
npx http-server . -p 8080
# 然后访问 http://localhost:8080

# 启动 Express 开发服务器（端口 3000）
npm run serve

# TypeScript 类型检查
npm run lint
```

---

## 目录结构

```
pod-clawer/
├── src/
│   ├── programs/
│   │   └── registry.ts       # 节目注册表（添加新节目改这里）
│   ├── crawler/
│   │   ├── cctv.ts           # CCTV API 调用 + Playwright 页面抓取
│   │   └── run.ts            # 爬虫主流程编排
│   ├── parser/
│   │   └── media.ts          # 流媒体 URL 提取（监听网络请求）
│   ├── services/
│   │   ├── storage.ts        # 文件读写、索引维护、旧数据迁移
│   │   ├── date.ts           # 日期工具（含播出时间判断逻辑）
│   │   └── http.ts           # HTTP 请求封装
│   ├── media/
│   │   └── ffmpeg.ts         # ffmpeg MP3 降级提取
│   ├── api/
│   │   └── server.ts         # Express 本地开发服务器（生产不用）
│   ├── web/
│   │   ├── app.js            # 首页逻辑（节目列表 + 标签切换）
│   │   ├── episode.js        # 播放页逻辑（HLS 播放 + 历史列表）
│   │   ├── styles.css        # 样式
│   │   ├── index.html        # 首页模板（Express 用）
│   │   └── episode.html      # 播放页模板（Express 用）
│   ├── config.ts             # 环境变量配置
│   └── types.ts              # TypeScript 类型定义
├── data/
│   ├── zwtx/
│   │   ├── index.json        # 朝闻天下全量索引
│   │   └── 2026-05-13/
│   │       └── meta.json     # 单集元数据
│   └── xwlb/
│       ├── index.json        # 新闻联播全量索引
│       └── 2026-05-12/
│           └── meta.json
├── icons/
│   ├── icon-192.png          # PWA 图标
│   └── icon-512.png
├── .github/workflows/
│   ├── crawl-zwtx.yml        # 朝闻天下定时任务（08:15 北京时间）
│   └── crawl-xwlb.yml        # 新闻联播定时任务（21:15 北京时间）
├── index.html                # GitHub Pages 首页入口
├── episode.html              # GitHub Pages 播放页入口
├── manifest.json             # PWA 配置
└── sw.js                     # Service Worker
```

---

## 工作原理

### 抓取流程

1. **日期判断**：根据节目播出时间窗口自动决定抓哪天的内容
   - 朝闻天下：北京时间 08:10 后抓今天，之前抓昨天
   - 新闻联播：北京时间 21:10 后抓今天，之前抓昨天

2. **发现节目**：调用 CCTV 栏目 API 获取最新 20 条，按标题和日期匹配目标集数。API 失败时降级为 Playwright 渲染页面抓取。

3. **提取流地址**：用 Playwright 打开节目页面，监听所有网络请求，收集 `.m3u8` / `.mp4` 候选 URL，按优先级评分（HLS 音频流 > HLS 视频流 > MP4），验证可播放后选最优。

4. **保存数据**：写入 `data/{节目ID}/{日期}/meta.json`，更新 `data/{节目ID}/index.json`，清理 31 天前的旧数据。

5. **降级方案**：如果流提取失败，用 ffmpeg 直接下载 MP3 音频文件保存到本地。

### 前端播放

- 首页读取 `data/{节目ID}/index.json` 展示节目列表
- 播放页读取 `data/{节目ID}/{日期}/meta.json` 获取流地址
- HLS 流用 hls.js 播放，iOS Safari 原生支持直接播放
- 所有数据都是静态 JSON，无需后端，完全兼容 GitHub Pages

---

## 添加新节目

只需两步：

**第一步**：在 `src/programs/registry.ts` 的 `PROGRAMS` 对象里添加配置：

```typescript
xwbd: {
  id: 'xwbd',
  name: '新闻播报',
  columnId: 'TOPC...',           // 从 CCTV 网站 URL 提取
  columnUrl: 'https://tv.cctv.com/lm/xwbd/',
  titlePattern: /新闻播报/,
  fullEpisodePattern: /《新闻播报》/,
  broadcastTimeWindow: { startHour: 18, endHour: 18, endMinute: 30 },
  retentionDays: 31,
},
```

**第二步**：在 `src/web/app.js` 顶部的 `PROGRAMS` 数组里加一行：

```javascript
const PROGRAMS = [
  { id: 'zwtx', name: '朝闻天下' },
  { id: 'xwlb', name: '新闻联播' },
  { id: 'xwbd', name: '新闻播报' },  // 新增
];
```

然后参考 `.github/workflows/crawl-xwlb.yml` 创建对应的定时任务即可。

---

## 自动化部署

### GitHub Actions 定时任务

| 工作流 | 触发时间 | 执行命令 | 提交文件 |
|--------|----------|----------|----------|
| `crawl-zwtx.yml` | 每天 08:15 北京时间 | `npm run crawl:zwtx` | `data/zwtx/**/*.json` |
| `crawl-xwlb.yml` | 每天 21:15 北京时间 | `npm run crawl:xwlb` | `data/xwlb/**/*.json` |

两个工作流都需要仓库的 `contents: write` 权限（已配置）。

### 分支策略

- `master`：生产分支，GitHub Pages 从这里部署，Actions 也在这里运行
- `develop`：开发分支，功能开发完成后合并到 master

---

## PWA 安装方法

### 安卓（Chrome）

1. 用 Chrome 打开 https://zhaokunlong.github.io/pod-clawer/
2. 点击右上角菜单（三个点）
3. 选择「添加到主屏幕」或「安装应用」
4. 确认后桌面出现图标，点击即可全屏打开

### iPhone（Safari）

1. 用 Safari 打开 https://zhaokunlong.github.io/pod-clawer/
2. 点击底部分享按钮（方块加箭头图标）
3. 向下滑动找到「添加到主屏幕」
4. 点击「添加」，桌面出现图标

安装后打开是全屏无地址栏的独立窗口，体验接近原生 App。

---

## 环境变量

本地开发时复制 `.env.example` 为 `.env`：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATA_DIR` | `./data` | 数据存储根目录 |
| `CRAWLER_HEADLESS` | `true` | Playwright 无头模式，调试时设为 `false` |
| `CRAWLER_TIMEZONE` | `Asia/Shanghai` | 日期计算时区 |
| `FFMPEG_BIN` | `ffmpeg` | ffmpeg 可执行文件路径 |
| `FORCE_DOWNLOAD_FALLBACK` | 未设置 | 设为 `true` 强制走 ffmpeg 降级路径 |
