import { defineCollection, z } from 'astro:content';
import { createMarkdownProcessor, type MarkdownProcessor } from '@astrojs/markdown-remark';
import { fetchAllPosts, fetchAllPages, fetchSiteConfig, type Entry } from './lib/notion-adapter';

const entrySchema = z.object({
  title: z.string(),
  date: z.string().nullable(),
  summary: z.string(),
  tags: z.array(z.string()),
  category: z.string().nullable(),
  icon: z.string().nullable(),
  coverUrl: z.string().nullable(),
  readingMinutes: z.number(),
});

async function writeEntries(
  items: Entry[],
  store: any,
  parseData: any,
  generateDigest: any,
  processor: MarkdownProcessor
) {
  store.clear();
  for (const item of items) {
    const result = await processor.render(item.markdown);
    const data = await parseData({
      id: item.slug,
      data: {
        title: item.title,
        date: item.date,
        summary: item.summary,
        tags: item.tags,
        category: item.category,
        icon: item.icon,
        coverUrl: item.coverUrl,
        readingMinutes: item.readingMinutes,
      },
    });
    store.set({
      id: item.slug,
      data,
      body: item.markdown,
      digest: generateDigest(item.markdown + JSON.stringify(data)),
      rendered: {
        html: result.code,
        metadata: {
          headings: result.metadata.headings,
          frontmatter: {},
        },
      },
    });
  }
}

const posts = defineCollection({
  loader: {
    name: 'notion-posts',
    load: async ({ store, parseData, generateDigest, logger }) => {
      logger.info('Fetching posts from Notion...');
      const items = await fetchAllPosts();
      logger.info(`Fetched ${items.length} published posts`);
      const processor = await createMarkdownProcessor();
      await writeEntries(items, store, parseData, generateDigest, processor);
    },
  },
  schema: entrySchema,
});

const pages = defineCollection({
  loader: {
    name: 'notion-pages',
    load: async ({ store, parseData, generateDigest, logger }) => {
      logger.info('Fetching pages from Notion...');
      const items = await fetchAllPages();
      logger.info(`Fetched ${items.length} published pages`);
      const processor = await createMarkdownProcessor();
      await writeEntries(items, store, parseData, generateDigest, processor);
    },
  },
  schema: entrySchema,
});

const config = defineCollection({
  loader: {
    name: 'notion-config',
    load: async ({ store, parseData, generateDigest, logger }) => {
      logger.info('Fetching site config from Notion...');
      const cfg = await fetchSiteConfig();
      logger.info(`Site config loaded: theme=${cfg.theme}, author=${cfg.author}`);
      const data = await parseData({ id: 'site', data: cfg });
      store.clear();
      store.set({
        id: 'site',
        data,
        digest: generateDigest(JSON.stringify(data)),
      });
    },
  },
  schema: z.object({
    author: z.string(),
    bio: z.string(),
    greeting: z.string(),
    email: z.string(),
    github: z.string(),
    siteUrl: z.string(),
    keywords: z.array(z.string()),
    lang: z.string(),
    since: z.number(),
    favicon: z.string().nullable(),
    theme: z.enum(['anthropic', 'minimal']),
    chineseFont: z.enum(['wenkai', 'songti']),
  }),
});

export const collections = { posts, pages, config };
