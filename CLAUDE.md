# WindScroll

> 风之卷轴 —— wind 的个人博客引擎。多源内容输入（Notion / Obsidian / Markdown 文件），统一中间表示，统一 Astro 渲染层。

---

## 项目目标

做一个**长期可维护、风格 100% 自主、内容源可迁移**的个人博客引擎。

核心信条：
- **简单优先**。整个核心代码量目标控制在 1000-1500 行以内。看到任何超出"做一个 blog"必要的复杂度，就要警惕。
- **解耦内容源和渲染层**。不同来源的内容统一收敛到一个 normalized model 后再交给渲染层，未来换源只换 adapter。
- **风格自主**。不引入第三方主题系统。Tailwind + 自己写的样式系统，每一个像素都能由 wind 自己说了算。
- **可迁移**。今天用 Notion，明天可能用 Obsidian vault，后天可能纯 Markdown 文件。同一套渲染层、同一套样式都要能服务这些场景。

## 为什么不用 NotionNext / 其他现成方案

曾经从 NotionNext 排查出一个连环 bug 链（Notion 在 2026-04 改了内部 API 响应格式 → 破坏了非官方 `notion-client` 库 → 又暴露了 NotionNext 自身 `getAllPageIds` 里的预存 bug），花了整整一个会话才修好。这次经历让 wind 决定彻底换路：

- NotionNext 用**非官方 Notion API**（`notion-client`），靠浏览器 cookie `token_v2` 认证，没有 SLA，Notion 任何一次内部改动都可能让博客挂掉
- NotionNext 体量过大（多主题系统 / 自定义限流器 / 文件锁 / 多站点 / i18n / dashboard / 十几种插件），对个人博客而言 99% 是用不上的负担
- 主题系统反而把样式锁死在它的抽象里，想自定义细节非常累
- 维护节奏跟不上 Notion 的变化

WindScroll 走完全相反的路线：**官方 API + 极简代码 + 完全自主的样式层**。

## 架构

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ Notion API  │───▶│              │    │             │
│ (官方 v5)   │    │  Normalized  │    │  Astro      │
├─────────────┤    │   Content    │───▶│  Renderer   │
│ Obsidian    │···▶│    Model     │    │  + 自主     │
│ (未实现)    │    │ (Entry / Site│    │  样式系统   │
├─────────────┤    │  Config)     │    │             │
│ Local *.md  │···▶│              │    │             │
│ (未实现)    │    │              │    │             │
└─────────────┘    └──────────────┘    └─────────────┘
   不同 adapter      统一中间表示          统一 UI
```

每个数据源写一个 adapter，输出统一的 `Entry[]`（TypeScript 对象数组）+ 一份 `SiteConfig`。Astro 的 Content Collection 从这个统一表示加载内容，渲染层完全不关心数据源。目前只有 Notion adapter 实现，Obsidian / 本地 Markdown 等留到真正需要时再加。

## 技术选型 & 理由

| 模块 | 选型 | 为什么 |
|------|------|--------|
| 框架 | **Astro 6** | 内容驱动静态站的最佳选择，默认零 JS、SEO 好、Content Collections 天然支持多源加载 |
| Notion 接入 | **`@notionhq/client@5` (官方 SDK) + `notion-to-md@3`** | 官方 API 有 SLA、有 changelog、Integration Token 不会过期；`notion-to-md` 把 block 树转 markdown，下游就和未来 Obsidian / Markdown 路径完全一致 |
| 样式 | **Tailwind 4 + `@tailwindcss/typography`** | 完全可控；typography 插件给 `prose` 正文一个体面的起点，再通过 `--tw-prose-*` CSS 变量映射到主题色 |
| 字体 | **Fraunces (variable serif) + Geist (UI sans) + LXGW 霞鹜文楷 / 思源宋体**（按 Notion CHINESE_FONT 切换） | 免费开源、有辨识度、不走 Inter / Arial 等通用感路线 |
| Markdown 渲染 | **`@astrojs/markdown-remark`** 的 `createMarkdownProcessor` | 免费拿到 Shiki 代码高亮 |
| 部署 | **Vercel** | 从 GitHub repo auto-deploy，Astro 静态输出零配置 |
| 包管理 | **pnpm 10** | 速度快、磁盘省 |

**明确不引入**：
- ❌ 任何主题系统 / 主题市场
- ❌ 任何插件系统
- ❌ Redis / 多层缓存抽象
- ❌ 国际化框架
- ❌ React / Vue 等 SPA 框架（除非局部 island 真的需要）
- ❌ "为未来可能的需求"做的任何抽象

## 当前状态

**MVP 已上线**（2026-04-14）—— **https://blog.wind.wiki** 在 Vercel windscroll 项目上运行，Git push 自动触发部署。

### 目录结构

```
src/
├── lib/notion-adapter.ts      # Notion SDK v5 + notion-to-md + 图片本地化
├── content.config.ts           # posts / pages / config 三个 Content Collection
├── layouts/Layout.astro        # 全站布局 + data-theme / data-zh 切换
├── pages/
│   ├── index.astro             # 首页，按年份分组的 editorial 版式
│   ├── about.astro             # About 页（渲染 Notion type=Page slug=about）
│   └── posts/[slug].astro      # 文章详情，右侧边栏 + cover banner + Copy link
└── styles/global.css           # Tailwind 4 + 主题系统（CSS vars 按 data-theme / data-zh 切）

public/
├── favicon.*                   # 原始静态资源
└── notion-assets/              # Notion signed URL 图片 build 时本地化产物（gitignored）
```

代码规模约 875 行，距 1000–1500 行预算还有余量。

### 数据源

单个 Notion 数据库 `2fe69852a1518195a9f1f992cc90f4e8`，包含：
- ~24 篇 `Published / Post`
- 2 个 `Published / Page`（`关于` slug=`about`、`友链` slug=`links`，后者还没路由）
- 1 个 `Config` 页（"配置中心"）内嵌 `CONFIG-TABLE` child database，12 行活配置

具体 ID 和活配置键清单在 `memory/reference_windscroll_notion_ids.md`。

### 站点配置来源

所有可调参数通过 Notion 配置中心驱动（改值 → 触发重建 → 全站生效），见 `src/lib/notion-adapter.ts` 的 `fetchSiteConfig()`。当前 12 个启用的键：

- **身份类**：`AUTHOR` / `BIO` / `GREETING_WORDS` / `LINK` / `KEYWORDS` / `LANG` / `SINCE` / `BLOG_FAVICON`
- **联系类**：`CONTACT_EMAIL` / `CONTACT_GITHUB`
- **视觉类**：`THEME`（`anthropic` / `minimal`）/ `CHINESE_FONT`（`wenkai` / `songti`）

**新增配置项的流程**：
1. Notion CONFIG-TABLE 加一行，`启用=true`，填配置名 + 配置值
2. `src/lib/notion-adapter.ts` 的 `SiteConfig` interface 加字段 + `DEFAULT_CONFIG` 加默认值 + 必要时写 normalize 函数
3. `src/content.config.ts` 的 Zod schema 加字段
4. 在 Layout / page 里消费

不要添加"从 Notion 读任意 URL / CSS / JS 塞进页面"这类间接层（NotionNext 的 `FONT_URL` / `GLOBAL_CSS` / `GLOBAL_JS` 都是反面例子）。

### 凭据位置

- **本地**：`.env` 文件（gitignored），`NOTION_TOKEN` + `NOTION_DATABASE_ID`
- **生产**：Vercel Production env vars（encrypted at rest）
- **换 token 流程**：
  ```bash
  # 1) Notion 后台 issue 新 token
  # 2) 本地改 .env
  # 3) Vercel：
  vercel env rm NOTION_TOKEN production
  printf "%s" "$NEW_TOKEN" | vercel env add NOTION_TOKEN production
  # 4) 触发重建
  git commit --allow-empty -m "bump: rotate notion token" && git push
  ```

### 部署流水线

- GitHub: `github.com/windzu/windscroll`
- Vercel: scope `windzus-projects`, project `windscroll`
- 流水线：`git push origin main` → GitHub webhook → Vercel build → 静态文件部署
- 域名：`https://blog.wind.wiki`（主）+ `https://windscroll.vercel.app`（备）
- SSL：Let's Encrypt，Vercel 自动签发和续期

## 第一里程碑（MVP）—— ✅ 已完成

2026-04-14 全部落地：

- ✅ Astro 6 minimal 骨架
- ✅ Tailwind 4 + `@tailwindcss/typography`
- ✅ Notion Integration + token（本地 `.env` + Vercel Production）
- ✅ Integration 加入数据库
- ✅ `src/lib/notion-adapter.ts` 官方 SDK v5
- ✅ Astro Content Collection 自定义 loader
- ✅ 首页 / 文章详情 / About 页
- ✅ 独立 Vercel 项目 `windscroll`
- ✅ 自定义域名 `blog.wind.wiki` 从 CF Tunnel 迁到 Vercel

### 超额完成（原本列在"后续演进"里的）

- Anthropic editorial 风格主题 + Fraunces + LXGW 霞鹜文楷中文字体
- 双主题系统（`minimal` / `anthropic`）通过 Notion `THEME` 切换
- 双中文字体系统（`wenkai` / `songti`）通过 Notion `CHINESE_FONT` 切换
- Notion signed S3 URL 图片 build 时本地化（规避 1h 过期）
- 文章详情页右侧边栏（Category / Date / Reading time / Tags / Copy link）+ cover banner
- Notion 后台瘦身（CONFIG-TABLE 32 行 → 12 行，非 Post 页 18 → 3）
- GitHub push → Vercel 自动部署

## 后续演进方向（按优先级）

### P1 —— 有明确用途的小增量

- **RSS feed**（`@astrojs/rss`）—— 技术圈读者普遍在用，~30 行
- **Sitemap**（`@astrojs/sitemap`）—— 一行集成
- **标签页 `/tags/<tag>/`** —— 数据已在 `post.data.tags`，getStaticPaths 一个事
- **`/links/` 路由** —— Notion 里的"友链"页已就绪，就差一个 `src/pages/links.astro`
- **404 页** —— `src/pages/404.astro`
- **OG 卡片 meta** —— 分享到微信 / Twitter 不至于光秃秃
- **深色模式** —— CSS 变量层已分离好，加一组 `[data-mode="dark"]` 变量 + toggle
- **归档页 `/archive/`** —— 按年月

### P2 —— 需要先想清楚再做

- **Obsidian vault adapter** —— 真想把内容源多样化时再写
- **本地 Markdown adapter** —— 同上
- **增量构建 / 缓存** —— 现在 build ~1 分钟，够用；觉得慢了再加
- **图片预下载进 git** —— trade-off：+30MB repo 换更快的远程 build

## 历史迁移上下文（已完成）

wind 原来的博客在 NotionNext 上，迁移历史：
1. 最早跑在 Vercel 项目 `notion-next`（GitHub `windzu/NotionNext`，`release/4.9.2` 分支）
2. 中间某个时段迁到了 `cloudflared tunnel` + 自建服务器
3. 2026-04-13 到 2026-04-14 这次 session 里从零搭了 WindScroll
4. 2026-04-14 把 `blog.wind.wiki` 从 CF Tunnel 切到 Vercel windscroll

**遗留清理项**：原 notion-next Vercel 项目已被删除。原 `cloudflared tunnel` 进程可能还在某台服务器上空转（DNS 不再指向它）。有空可以 `cloudflared tunnel list` 检查清理。

Notion 数据库 ID 自始至终没变：`2fe69852a1518195a9f1f992cc90f4e8`。认证从非官方 `NOTION_TOKEN_V2` cookie 换成了官方 Integration Token（`ntn_` 前缀的新格式）。

## 工作风格约定

这是 wind 的个人项目，按以下原则协作：

- **不要过度工程化**。看到自己想加 "未来可能用到" 的抽象时停下来。三行差不多的代码比一个抽象更好。
- **不要主动加文档/注释**。代码本身要清晰。注释只在逻辑确实不显然的地方加。
- **不要主动加错误处理**。除非是用户输入或外部 API 边界。内部代码相信框架和类型。
- **不要复制 NotionNext 的任何模式**——它是反面教材。
- **风格自主优先于功能丰富**。宁可少一个 feature，也要保证每一处样式 wind 都满意。
- **美学要有承诺**。不要生成式 AI 的 "safe / neutral / ui-serif" 泛化感，每一次设计决策都要有明确审美身份。参考 `memory/feedback_aesthetic_commitment.md`。
- **变更要有据可查**。加依赖要在 commit message 或聊天里说清为什么；非显然的设计选择写在代码注释或 commit 里。

## 给下一个 Claude Code session 的提示

你打开这个项目的时候，WindScroll 已经是 MVP 闭环且在生产跑着。

请先：

1. 读完这个 CLAUDE.md + `memory/MEMORY.md` 索引的记忆
2. 跟 wind 确认这次想推进哪个 P1 项，或者是新需求
3. **每一步都让 wind 看到效果**，不要批量做一大堆再一起展示
4. **不要去碰** `~/Projects/` 之外的任何东西

**改 UI / 样式** 时，保持 Anthropic editorial 的审美温度（warm cream / terracotta / Fraunces / LXGW）。拿 https://blog.wind.wiki 和 https://www.anthropic.com/news 做参考坐标。不确定时调用 `frontend-design` skill。

**改 Notion 配置** 时，记住站点可调参数从 Notion 配置中心驱动。新增就加 Notion 行 + 代码 enum，不要加"配置从 URL 注入"这类间接层。

**Notion API 关键坑**：`@notionhq/client@5.x` 删除了 `databases.query`，改用 `dataSources.query`。标准两步：
```ts
const db = await notion.databases.retrieve({ database_id });
const dsId = db.data_sources[0].id;
const res = await notion.dataSources.query({ data_source_id: dsId, filter: {...} });
```

**关于 wind 的网络环境**：他在中国，本地有 fake-ip 代理（Clash/Mihomo 系），DNS 诊断返回 `198.18.0.0/15` 这段 IP 是本地假象、不代表真实公网 DNS 状态。验证公网 DNS 用 dnschecker.org / 云端 VPS / Vercel & CF dashboard。详见 `memory/reference_fake_ip_dns_gotcha.md`。

---

**常用命令速查**

```bash
# 本地开发
pnpm dev                # 起 dev server (HMR)，冷启动约 90s (Notion 首次拉取)

# 本地构建
pnpm build              # 远程 Notion 拉完整内容并生成 dist/

# 手动触发 Vercel 生产构建（平常用 git push 就够了）
vercel --prod

# Notion token 轮换
vercel env rm NOTION_TOKEN production
printf "%s" "$NEW" | vercel env add NOTION_TOKEN production
git commit --allow-empty -m "bump" && git push
```
