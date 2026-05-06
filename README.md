# WindScroll · 风之卷轴

> 一个为长期可维护而生的个人博客引擎。Notion 当 CMS，Astro 出静态站，样式 100% 自主。

🔗 Live demo：**[blog.wind.wiki](https://blog.wind.wiki)**

![WindScroll 首页](docs/screenshots/home.png)

---

## 这是什么

WindScroll 是 wind 的个人博客引擎。整个核心代码 ~875 行，没有主题系统、没有插件系统、没有"为未来可能的需求"做的抽象。

**设计信条**

- **简单优先**：核心代码量预算 1000–1500 行，看到任何超出"做一个 blog"必要的复杂度就要警惕。
- **解耦内容源和渲染层**：所有数据源统一收敛到一个 normalized model（`Entry[]` + `SiteConfig`）后再交给渲染层。今天用 Notion，明天换 Obsidian、纯 Markdown 都只换 adapter。
- **风格自主**：Tailwind + 自己写的样式系统，每一个像素都能由作者说了算。
- **官方 API 优先**：Notion 接入用官方 SDK + Integration Token，不用任何依赖浏览器 cookie 的非官方接口。

## 为什么不用 NotionNext / 其他现成方案

作者从 NotionNext 上排查过一个连环 bug 链：Notion 改了内部 API → 破坏了非官方 `notion-client` 库 → 又暴露了 NotionNext 自身的预存 bug。修了整整一个会话。

NotionNext 的根本问题：

- 用**非官方 Notion API**，靠浏览器 cookie 认证，没有 SLA，Notion 一改就挂
- 体量过大（多主题 / 多站点 / i18n / dashboard / 限流器 / 文件锁 / 十几种插件），个人博客 99% 用不上
- 主题系统反而把样式锁在它的抽象里，自定义细节非常累

WindScroll 走完全相反的路线：**官方 API + 极简代码 + 完全自主的样式层**。

![文章详情页](docs/screenshots/post.png)

## 技术栈

| 模块 | 选型 |
|------|------|
| 框架 | Astro 6（Content Collections） |
| Notion | `@notionhq/client@5`（官方 SDK）+ `notion-to-md@3` |
| 样式 | Tailwind 4 + `@tailwindcss/typography` |
| 字体 | Fraunces（serif）+ Geist（sans）+ LXGW 霞鹜文楷 / 思源宋体 |
| 部署 | Vercel（Git push 自动部署） |
| 包管理 | pnpm 10 |

明确**不引入**：主题系统、插件系统、Redis / 多层缓存、i18n、React/Vue。

---

## 架构

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ Notion API  │───▶│              │    │             │
│ (官方 v5)   │    │  Normalized  │    │  Astro      │
├─────────────┤    │   Content    │───▶│  Renderer   │
│ Obsidian    │···▶│    Model     │    │  + 自主     │
│ (未实现)    │    │ (Entry /     │    │  样式系统   │
├─────────────┤    │  SiteConfig) │    │             │
│ Local *.md  │···▶│              │    │             │
│ (未实现)    │    │              │    │             │
└─────────────┘    └──────────────┘    └─────────────┘
   不同 adapter      统一中间表示          统一 UI
```

## 目录结构

```
src/
├── lib/notion-adapter.ts      # Notion SDK + notion-to-md + 图片本地化
├── content.config.ts           # posts / pages / config 三个 Content Collection
├── layouts/Layout.astro        # 全站布局 + data-theme / data-zh 切换
├── pages/
│   ├── index.astro             # 首页，按年份分组的 editorial 版式
│   ├── about.astro             # About 页（渲染 Notion type=Page slug=about）
│   └── posts/[slug].astro      # 文章详情，右侧边栏 + cover banner
└── styles/global.css           # Tailwind 4 + 主题系统（CSS vars）

public/
└── notion-assets/              # Notion signed URL 图片 build 时本地化产物（gitignored）
```

---

## 部署教程

下面这套教程从零开始：拿到 Notion Token → 建数据库 → 本地跑通 → 上 Vercel。

### 1. 准备 Notion

#### 1.1 一键 duplicate 模板

打开下面这个公开模板链接，点页面**右上角的 duplicate 图标**（两个方块叠在一起的那个），把整个模板复制到你自己的 Notion workspace：

> 📋 **[WindScroll Notion 模板](https://sincere-pleasure-1f8.notion.site/356e48591fc180119e67cd3606b23b74)**

模板里已经有：

- 一个名为 `WindScroll模板` 的数据库（schema 完整对齐）
- 3 行示例数据：`Hello WindScroll`（Post）/ `关于`（Page）/ `配置中心`（Config）
- 配置中心里嵌入的 `CONFIG-TABLE` 子数据库（13 行配置占位符，含图片型配置 `BLOG_FAVICON` / `CONTACT_WECHAT_QR` 的位置）

duplicate 之后你就有了一份完整骨架，只需替换占位内容即可。

复制完，从浏览器地址栏抓你这份新数据库的 ID（URL 形如 `https://www.notion.so/<workspace>/<DATABASE_ID>?v=...`，中间那段 32 位 hex 就是 `DATABASE_ID`），后面要填到 `.env`。

#### 1.2 建一个 Notion Integration 并授权给数据库

1. 打开 https://www.notion.so/my-integrations
2. 点 **+ New integration**，类型选 **Internal**，所属 workspace 选你 duplicate 模板那个
3. 创建后复制 **Internal Integration Token**（`ntn_` 开头）—— 后面要填到 `.env`
4. 回到 Notion 里你刚 duplicate 出来的数据库 → 右上角 `...` → **Connections** → 选刚才建的 Integration。**这一步必须做**，否则 API 读不到任何内容。

#### 1.3 改配置中心

进 `配置中心` 那行 page → 看到内嵌的 `CONFIG-TABLE` → 把每行的"配置值"换成你自己的（作者名、邮箱、GitHub 链接 …）。

| key | 用途 | 默认 |
|-----|------|------|
| `AUTHOR` | 作者名 | `wind` |
| `BIO` | 一句话简介 | （空） |
| `GREETING_WORDS` | 首页问候（取逗号分隔的第一个） | （空） |
| `LINK` | 站点 URL | （空） |
| `KEYWORDS` | SEO keywords（逗号分隔） | （空） |
| `LANG` | HTML lang | `zh-CN` |
| `SINCE` | footer © 起始年份 | 当前年份 |
| `CONTACT_EMAIL` | 联系邮箱 | （空） |
| `CONTACT_GITHUB` | GitHub URL | （空） |
| `THEME` | 主题 | `anthropic` (可选 `minimal`) |
| `CHINESE_FONT` | 中文字体 | `wenkai` (可选 `songti`) |
| `BLOG_FAVICON` | favicon 图标 | （空，把图片拖到"配置图片"列） |
| `CONTACT_WECHAT_QR` | 微信公众号二维码 | （空，把图片拖到"配置图片"列） |

**图片型配置**（favicon / 公众号二维码）填在 `配置图片` 这一列（Files & media 类型），把图片**直接拖进单元格**，Notion 托管，build 时 adapter 自动下载到 `public/notion-assets/` 本地化（规避 Notion signed URL 1h 过期问题）。

不想用配置中心也行，关掉某行的"启用"checkbox 即可，缺失的会走 `DEFAULT_CONFIG`（在 `src/lib/notion-adapter.ts`）。

<details>
<summary>没用模板，想自己手动建？</summary>

新建一个 Full page database，加以下 properties：

| 属性名 | 类型 | 说明 |
|--------|------|------|
| `title` | Title | 文章标题（必填，**名称必须是英文 `title`**） |
| `slug` | Rich text | URL 段，留空会用 page id |
| `type` | Select | options: `Post` / `Page` / `Config` |
| `status` | Select | options: `Published` / `Draft`（adapter 只收 `Published`） |
| `date` | Date | 发布日期 |
| `summary` | Rich text | 摘要 |
| `tags` | Multi-select | 标签 |
| `category` | Select | 分类 |

然后建配置中心：在数据库里加一行，`type=Config`、`status=Published`、标题"配置中心"。进入这行 page，正文输入 `/database` → 选 `Database - Inline`，名字**必须叫 `CONFIG-TABLE`**（adapter 写死了），schema 是：

- `配置名`（Title）
- `配置值`（Rich text）
- `配置图片`（Files & media）
- `启用`（Checkbox）

参考上面的 key 表填占位行。

</details>

### 2. 本地跑通

```bash
git clone https://github.com/<your-username>/windscroll.git
cd windscroll
pnpm install

# 配置环境变量
cat > .env <<EOF
NOTION_TOKEN=ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DATABASE_ID=<你 duplicate 出的数据库 ID，32 位 hex>
EOF

pnpm dev    # 冷启动约 90s（首次拉 Notion）
```

打开 http://localhost:4321 看到内容就 OK。

### 3. 部署到 Vercel

#### 3.1 推到 GitHub

```bash
git remote add origin git@github.com:<your-username>/windscroll.git
git push -u origin main
```

#### 3.2 在 Vercel import

1. https://vercel.com/new → import 你的 repo
2. Framework Preset 自动识别为 **Astro**，无需改任何 build 设置
3. **Environment Variables** 里加：
   - `NOTION_TOKEN` = 你的 Integration Token
   - `NOTION_DATABASE_ID` = 你的数据库 ID
4. Deploy

之后 `git push origin main` 会自动触发部署。

#### 3.3 自定义域名（可选）

Vercel 项目 → Settings → Domains 加域名，按提示在 DNS 配 CNAME 即可（Let's Encrypt 自动签发证书）。

### 4. Notion Token 轮换

```bash
# 1) Notion 后台 issue 新 token
# 2) 改本地 .env
# 3) 改 Vercel：
vercel env rm NOTION_TOKEN production
printf "%s" "$NEW_TOKEN" | vercel env add NOTION_TOKEN production
# 4) 触发重建
git commit --allow-empty -m "bump: rotate notion token" && git push
```

---

## 常用命令

```bash
pnpm dev         # 起 dev server (HMR)
pnpm build       # 拉 Notion + 生成 dist/
pnpm preview     # 本地预览 build 产物
vercel --prod    # 手动触发 Vercel 生产构建（平常 git push 就够了）
```

## Roadmap

P1（小增量，明确用途）：

- [ ] RSS feed
- [ ] Sitemap
- [ ] `/tags/<tag>/` 标签页
- [ ] `/links/` 友链页
- [ ] 404 页
- [ ] OG 卡片 meta
- [ ] 深色模式
- [ ] 归档页 `/archive/`

P2（先想清楚再做）：

- [ ] Obsidian vault adapter
- [ ] 本地 Markdown adapter
- [ ] 增量构建 / 缓存

## 已知坑 & 注意事项

- `@notionhq/client@5.x` 删除了 `databases.query`，改用 `dataSources.query`（两步：先 retrieve 拿 `data_sources[0].id`，再 query）。
- Notion 图片是 signed S3 URL，1 小时过期。WindScroll 在 build 时把它们下载到 `public/notion-assets/` 本地化（gitignored）。
- 中国大陆用户本地访问 Notion API 可能需要代理；Vercel build 在境外，无此问题。

## 贡献 & License

这是个人博客引擎，欢迎 fork 改成你自己的，但**不接受 PR 加主题系统 / 插件系统 / 通用化抽象** —— 这违反项目设计信条。Bug 修复和文档改进的 PR 欢迎。

License：[MIT](./LICENSE)

> 注：本仓库的代码以 MIT 协议开源，但 [blog.wind.wiki](https://blog.wind.wiki) 上的文章内容版权归 wind 所有，未经授权请勿转载。
