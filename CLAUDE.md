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

我们刚刚从 NotionNext 排查出一个连环 bug 链（Notion 在 2026-04 改了内部 API 响应格式 → 破坏了非官方 `notion-client` 库 → 又暴露了 NotionNext 自身 `getAllPageIds` 里的预存 bug），花了整整一个会话才修好。这次经历让 wind 决定彻底换路：

- NotionNext 用**非官方 Notion API**（`notion-client`），靠浏览器 cookie `token_v2` 认证，没有 SLA，Notion 任何一次内部改动都可能让博客挂掉
- NotionNext 体量过大（多主题系统 / 自定义限流器 / 文件锁 / 多站点 / i18n / dashboard / 十几种插件），对个人博客而言 99% 是用不上的负担
- 主题系统反而把样式锁死在它的抽象里，想自定义细节非常累
- 维护节奏跟不上 Notion 的变化

WindScroll 走完全相反的路线：**官方 API + 极简代码 + 完全自主的样式层**。

## 架构

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ Notion API  │───▶│              │    │             │
│ (官方)      │    │  Normalized  │    │  Astro      │
├─────────────┤    │   Content    │───▶│  Renderer   │
│ Obsidian    │───▶│    Model     │    │  + 自定义   │
│ Vault       │    │ (frontmatter │    │  样式系统   │
├─────────────┤    │  + markdown) │    │             │
│ Local *.md  │───▶│              │    │             │
└─────────────┘    └──────────────┘    └─────────────┘
   不同 adapter      统一中间表示          统一 UI
```

每个数据源写一个 adapter，输出统一的 Normalized Content（一个简单的 TypeScript 对象数组）。Astro 的 Content Collection 从这个统一表示加载内容，渲染层完全不关心数据源。

## 技术选型 & 理由

| 模块 | 选型 | 为什么 |
|------|------|--------|
| 框架 | **Astro** | 内容驱动静态站的最佳选择，默认零 JS、SEO 好、Content Collections 天然支持多源加载 |
| Notion 接入 | **`@notionhq/client` (官方 SDK) + `notion-to-md`** | 官方 API 有 SLA、有 changelog、Integration Token 不会过期；`notion-to-md` 把 block 树转 markdown，下游就和 Obsidian/Markdown 路径完全一致 |
| 样式 | **Tailwind CSS + `@tailwindcss/typography` 起步** | 完全可控；typography 插件给一个体面的默认排版起点，后面慢慢按 wind 的审美调 |
| 部署 | **Vercel** | 现有 blog 已经在 Vercel；Astro 部署 Vercel 一行命令 |
| 包管理 | **pnpm** | 速度快、磁盘省 |

**明确不引入：**
- ❌ 任何主题系统 / 主题市场
- ❌ 任何插件系统
- ❌ Redis / 多层缓存抽象
- ❌ 国际化框架
- ❌ React / Vue 等 SPA 框架（除非局部 island 真的需要）
- ❌ "为未来可能的需求"做的任何抽象

## 当前状态

**项目刚初始化，还什么都没有。** 只有这个 CLAUDE.md 和一个空的 git 仓库。

接下来 wind 会在新的 Claude Code session 里从零开始搭。

## 第一里程碑（MVP）

目标：把一个能跑的最小闭环做出来，不追求完美。

- [ ] `pnpm create astro@latest` 起骨架，选 minimal 模板
- [ ] 装 Tailwind + `@tailwindcss/typography`
- [ ] 在 Notion 创建一个新的 Integration（https://www.notion.so/my-integrations），拿到 `secret_xxx` token
- [ ] 把 Integration 加到现有的 Notion 数据库（Share → Add connections）
  - 现有数据库 ID：`2fe69852a1518195a9f1f992cc90f4e8`（这是 wind 现在 blog.wind.wiki 在用的那个，标题叫 "Wind Blog"）
- [ ] 写最小的 `src/lib/notion-adapter.ts`：用官方 SDK `databases.query` 拿文章列表 → 对每篇用 `notion-to-md` 转 markdown → 输出 normalized content 数组
- [ ] 用 Astro Content Collection 的 [Custom Loader API](https://docs.astro.build/en/reference/content-loader-reference/) 把 adapter 的输出接进来
- [ ] 写两个最基础的页面：`/`（文章列表） + `/posts/[slug]`（文章详情）
- [ ] 部署到 Vercel 一个**新的项目**（不要影响现有的 `notion-next` 项目和 `blog.wind.wiki` 域名）
- [ ] 拿一个 `windscroll-xxx.vercel.app` 这种自动域名先用着，后面满意了再切 `blog.wind.wiki`

这一步做完，wind 就有了一个能用、能演进的基础。后面的事情都是在这上面慢慢长。

## 之后的演进方向（不是当前目标）

- 调样式（typography、列表页布局、详情页布局、深色模式、字体）
- 加必要的功能：tag 页、归档页、RSS、sitemap、OG 图
- 写 Obsidian vault adapter
- 写本地 markdown adapter
- 增量构建 / 缓存（只有真的觉得慢了再加）

## 现有 blog 迁移上下文

wind 现在的博客是 `blog.wind.wiki`，跑在 Vercel 项目 `notion-next`（GitHub `windzu/NotionNext`，分支 `release/4.9.2`）上，刚刚被打了两个补丁勉强跑通：
1. `lib/notion/getNotionAPI.js` 加了 `normalizeResponse` 兼容 Notion 2026-04 API 变更
2. `lib/notion/getAllPageIds.js` 修了 catch 块未定义引用 + optional chaining

**WindScroll 项目跟那个 NotionNext 项目完全独立，互不影响。** 在 WindScroll 满意之前，老 blog 继续跑着，等切域名的时候再下线。

Notion 数据库 ID 是同一个：`2fe69852a1518195a9f1f992cc90f4e8`。但**两个项目用的认证方式不一样**：
- 老 blog：非官方 API + `NOTION_TOKEN_V2` (浏览器 cookie) + `NOTION_ACTIVE_USER`
- WindScroll：官方 API + `NOTION_TOKEN` (Integration Token，`secret_xxx`)

WindScroll 需要 wind 自己去 https://www.notion.so/my-integrations 新建一个 Integration、把数据库分享给它。

## 工作风格约定

这是 wind 的个人项目，按以下原则协作：

- **不要过度工程化**。看到自己想加 "未来可能用到" 的抽象时停下来。三行差不多的代码比一个抽象更好。
- **不要主动加文档/注释**。代码本身要清晰。注释只在逻辑确实不显然的地方加。
- **不要主动加错误处理**。除非是用户输入或外部 API 边界。内部代码相信框架和类型。
- **不要复制 NotionNext 的任何模式**——它是反面教材。
- **风格自主优先于功能丰富**。宁可少一个 feature，也要保证每一处样式 wind 都满意。
- **变更要有据可查**。如果加一个依赖，要在 commit message 或聊天里说为什么；如果做了非显然的设计选择，写在代码注释或 commit 里。

## 给下一个 Claude Code session 的提示

你打开这个项目的时候，仓库基本是空的，只有 git 历史 + 这个 CLAUDE.md。

请先：
1. 读完这个 CLAUDE.md
2. 跟 wind 确认他想从哪一步开始（多半是从"起 Astro 骨架"开始，但也可能他已经手动做了一些）
3. 按上面的"第一里程碑"列表推进
4. **不要试图一步到位**——一步一步来，每一步都让 wind 看到效果
5. **不要去碰** `~/Projects/` 之外的任何东西。特别是不要去碰 `windzu/NotionNext` 的代码
