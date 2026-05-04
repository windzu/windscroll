import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface Entry {
  id: string;
  slug: string;
  title: string;
  date: string | null;
  summary: string;
  tags: string[];
  category: string | null;
  icon: string | null;
  coverUrl: string | null;
  readingMinutes: number;
  markdown: string;
}

export type ThemeName = 'anthropic' | 'minimal';
export type ChineseFont = 'wenkai' | 'songti';

export interface SiteConfig {
  author: string;
  bio: string;
  greeting: string;
  email: string;
  github: string;
  siteUrl: string;
  keywords: string[];
  lang: string;
  since: number;
  favicon: string | null;
  wechatQr: string | null;
  theme: ThemeName;
  chineseFont: ChineseFont;
}

const DEFAULT_CONFIG: SiteConfig = {
  author: 'wind',
  bio: '',
  greeting: '',
  email: '',
  github: '',
  siteUrl: '',
  keywords: [],
  lang: 'zh-CN',
  since: new Date().getFullYear(),
  favicon: null,
  wechatQr: null,
  theme: 'anthropic',
  chineseFont: 'wenkai',
};

const NOTION_TOKEN = import.meta.env.NOTION_TOKEN ?? process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = import.meta.env.NOTION_DATABASE_ID ?? process.env.NOTION_DATABASE_ID;

// ---------- image localization ----------

const ASSET_DIR = path.resolve('public/notion-assets');
const PUBLIC_PREFIX = '/notion-assets';
const SIGNED_HOST_RE = /(amazonaws\.com|secure\.notion-static\.com|prod-files-secure)/;
const IMG_MD_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;

let _assetDirReady = false;
async function ensureAssetDir() {
  if (_assetDirReady) return;
  await fs.mkdir(ASSET_DIR, { recursive: true });
  _assetDirReady = true;
}

function hashUrl(url: string): string {
  const bare = url.split('?')[0];
  return crypto.createHash('sha1').update(bare).digest('hex').slice(0, 16);
}

function guessExt(url: string, contentType: string | null): string {
  const bare = url.split('?')[0];
  const m = bare.match(/\.(png|jpe?g|gif|webp|svg|avif)(?:$|\?)/i);
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  if (contentType) {
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('jpeg')) return 'jpg';
    if (contentType.includes('webp')) return 'webp';
    if (contentType.includes('gif')) return 'gif';
    if (contentType.includes('svg')) return 'svg';
    if (contentType.includes('avif')) return 'avif';
  }
  return 'bin';
}

async function localizeImage(url: string): Promise<string> {
  if (!SIGNED_HOST_RE.test(url)) return url;
  await ensureAssetDir();
  const hash = hashUrl(url);
  const existing = (await fs.readdir(ASSET_DIR)).find((f) => f.startsWith(hash + '.'));
  if (existing) return `${PUBLIC_PREFIX}/${existing}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[notion-adapter] download ${res.status}: ${url.slice(0, 90)}`);
      return url;
    }
    const ext = guessExt(url, res.headers.get('content-type'));
    const fileName = `${hash}.${ext}`;
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(path.join(ASSET_DIR, fileName), buf);
    return `${PUBLIC_PREFIX}/${fileName}`;
  } catch (e: any) {
    console.warn(`[notion-adapter] download error: ${e?.message}`);
    return url;
  }
}

async function localizeMarkdownImages(md: string): Promise<string> {
  const seen = new Set<string>();
  const work: Promise<unknown>[] = [];
  const replacements = new Map<string, string>();
  for (const m of md.matchAll(IMG_MD_RE)) {
    const url = m[2];
    if (seen.has(url)) continue;
    seen.add(url);
    work.push(localizeImage(url).then((local) => replacements.set(url, local)));
  }
  await Promise.all(work);
  return md.replace(IMG_MD_RE, (_, alt, url, title) => {
    const local = replacements.get(url) || url;
    return title ? `![${alt}](${local} "${title}")` : `![${alt}](${local})`;
  });
}

async function extractIcon(page: any): Promise<string | null> {
  const icon = page.icon;
  if (!icon) return null;
  if (icon.type === 'emoji') return `emoji:${icon.emoji}`;
  if (icon.type === 'external') return icon.external?.url ?? null;
  if (icon.type === 'file') return await localizeImage(icon.file?.url ?? '');
  return null;
}

async function extractCover(page: any): Promise<string | null> {
  const cover = page.cover;
  if (!cover) return null;
  if (cover.type === 'external') return cover.external?.url ?? null;
  if (cover.type === 'file') return await localizeImage(cover.file?.url ?? '');
  return null;
}

// ---------- reading time ----------

function calcReadingMinutes(markdown: string): number {
  const text = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/[#*`>!\-_~\[\]()]/g, ' ');
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latinWords = (text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/\S+/g) || []).length;
  return Math.max(1, Math.round(cjk / 450 + latinWords / 220));
}

// ---------- notion ----------

type RichText = { plain_text: string }[] | undefined;

function plainText(rt: RichText): string {
  return (rt ?? []).map((t) => t.plain_text).join('');
}

function slugFor(page: any): string {
  const explicit = plainText(page.properties.slug?.rich_text).trim();
  if (explicit) return explicit;
  return String(page.id).replace(/-/g, '');
}

function normalizeTheme(v: string | undefined): ThemeName {
  if (v === 'anthropic' || v === 'minimal') return v;
  if (v) console.warn(`[notion-adapter] Unknown THEME value "${v}", falling back to "anthropic"`);
  return 'anthropic';
}

function normalizeChineseFont(v: string | undefined): ChineseFont {
  if (v === 'wenkai' || v === 'songti') return v;
  if (v) console.warn(`[notion-adapter] Unknown CHINESE_FONT value "${v}", falling back to "wenkai"`);
  return 'wenkai';
}

let _client: { notion: Client; dataSourceId: string } | null = null;

async function getClient() {
  if (_client) return _client;
  if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
    throw new Error('NOTION_TOKEN / NOTION_DATABASE_ID not set in environment');
  }
  const notion = new Client({ auth: NOTION_TOKEN });
  const db: any = await notion.databases.retrieve({ database_id: NOTION_DATABASE_ID });
  const dataSourceId: string | undefined = db.data_sources?.[0]?.id;
  if (!dataSourceId) throw new Error(`Database ${NOTION_DATABASE_ID} has no data sources`);
  _client = { notion, dataSourceId };
  return _client;
}

async function queryByType(type: 'Post' | 'Page' | 'Config'): Promise<any[]> {
  const { notion, dataSourceId } = await getClient();
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await notion.dataSources.query({
      data_source_id: dataSourceId,
      filter: {
        and: [
          { property: 'status', select: { equals: 'Published' } },
          { property: 'type', select: { equals: type } },
        ],
      },
      sorts: type === 'Post' ? [{ property: 'date', direction: 'descending' }] : undefined,
      start_cursor: cursor,
      page_size: 100,
    });
    out.push(...res.results);
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);
  return out;
}

async function normalizeEntries(pages: any[]): Promise<Entry[]> {
  const { notion } = await getClient();
  const n2m = new NotionToMarkdown({ notionClient: notion });
  const results: Entry[] = [];
  for (const page of pages) {
    const props = page.properties;
    const title = plainText(props.title?.title).trim() || '(untitled)';
    const slug = slugFor(page);
    const date: string | null = props.date?.date?.start ?? null;
    const summary = plainText(props.summary?.rich_text);
    const tags: string[] = (props.tags?.multi_select ?? []).map((t: any) => t.name);
    const category: string | null = props.category?.select?.name ?? null;

    const blocks = await n2m.pageToMarkdown(page.id);
    const rendered = n2m.toMarkdownString(blocks);
    const rawMarkdown: string = typeof rendered === 'string' ? rendered : (rendered.parent ?? '');
    const markdown = await localizeMarkdownImages(rawMarkdown);

    const icon = await extractIcon(page);
    const coverUrl = await extractCover(page);
    const readingMinutes = calcReadingMinutes(markdown);

    results.push({
      id: page.id,
      slug,
      title,
      date,
      summary,
      tags,
      category,
      icon,
      coverUrl,
      readingMinutes,
      markdown,
    });
  }
  return results;
}

export async function fetchAllPosts(): Promise<Entry[]> {
  return normalizeEntries(await queryByType('Post'));
}

export async function fetchAllPages(): Promise<Entry[]> {
  return normalizeEntries(await queryByType('Page'));
}

export async function fetchSiteConfig(): Promise<SiteConfig> {
  const { notion } = await getClient();
  const configPages = await queryByType('Config');
  if (configPages.length === 0) {
    console.warn('[notion-adapter] No Config page found, using defaults');
    return { ...DEFAULT_CONFIG };
  }

  const blocks: any = await notion.blocks.children.list({
    block_id: configPages[0].id,
    page_size: 100,
  });
  const tableBlock = blocks.results.find(
    (b: any) => b.type === 'child_database' && b.child_database?.title === 'CONFIG-TABLE'
  );
  if (!tableBlock) {
    console.warn('[notion-adapter] No CONFIG-TABLE child_database in Config page, using defaults');
    return { ...DEFAULT_CONFIG };
  }

  const innerDb: any = await notion.databases.retrieve({ database_id: tableBlock.id });
  const innerDsId: string | undefined = innerDb.data_sources?.[0]?.id;
  if (!innerDsId) {
    console.warn('[notion-adapter] CONFIG-TABLE has no data source, using defaults');
    return { ...DEFAULT_CONFIG };
  }

  const rows: any[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await notion.dataSources.query({
      data_source_id: innerDsId,
      start_cursor: cursor,
      page_size: 100,
    });
    rows.push(...res.results);
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);

  const kv: Record<string, string> = {};
  const kvImage: Record<string, string> = {};
  for (const row of rows) {
    if (!row.properties['启用']?.checkbox) continue;
    const key = plainText(row.properties['配置名']?.title).trim();
    if (!key) continue;
    const value = plainText(row.properties['配置值']?.rich_text).trim();
    if (value) kv[key] = value;
    const file = row.properties['配置图片']?.files?.[0];
    const fileUrl = file?.type === 'external' ? file.external?.url : file?.file?.url;
    if (fileUrl) kvImage[key] = await localizeImage(fileUrl);
  }

  const pickImage = (key: string): string | null =>
    kvImage[key] || kv[key] || null;

  return {
    author: kv.AUTHOR || DEFAULT_CONFIG.author,
    bio: kv.BIO || DEFAULT_CONFIG.bio,
    greeting: (kv.GREETING_WORDS || '').split(',')[0]?.trim() || DEFAULT_CONFIG.greeting,
    email: kv.CONTACT_EMAIL || DEFAULT_CONFIG.email,
    github: kv.CONTACT_GITHUB || DEFAULT_CONFIG.github,
    siteUrl: kv.LINK || DEFAULT_CONFIG.siteUrl,
    keywords: (kv.KEYWORDS || '').split(',').map((s) => s.trim()).filter(Boolean),
    lang: kv.LANG || DEFAULT_CONFIG.lang,
    since: kv.SINCE ? parseInt(kv.SINCE, 10) : DEFAULT_CONFIG.since,
    favicon: pickImage('BLOG_FAVICON'),
    wechatQr: pickImage('CONTACT_WECHAT_QR'),
    theme: normalizeTheme(kv.THEME),
    chineseFont: normalizeChineseFont(kv.CHINESE_FONT),
  };
}
