import { defineCollection } from 'astro:content';
import type { LoaderContext } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { z } from 'astro/zod';

const baseDocsLoader = docsLoader();

// Starlight validates frontmatter only, so its schema never sees the source
// path. Surface the entry path (attached before validation) to the schema below
// so it can check that a machine's OS directory agrees with its `tags`.
const docsLoaderWithPath = {
	...baseDocsLoader,
	load: (context: LoaderContext) =>
		baseDocsLoader.load({
			...context,
			parseData: ({ id, data, filePath }) =>
				context.parseData({ id, data: { ...data, _filePath: filePath }, filePath }),
		}),
};

export const collections = {
	docs: defineCollection({
		loader: docsLoaderWithPath,
		schema: docsSchema({
			extend: z.object({
				type: z.string().optional(),
				platform: z.string().optional(),
				status: z.string().optional(),
				content_type: z.string().optional(),
				tags: z.array(z.string()).optional(),
				objective: z.string().optional(),
				tools: z.array(z.string()).optional(),
				skill: z.string().optional(),
				outcome: z.string().optional(),
				// Injected by `docsLoaderWithPath`; not authored in frontmatter.
				_filePath: z.string().optional(),
				// Immutable portfolio-addition date (not completion or last-edit).
				addedAt: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/, 'addedAt must be ISO YYYY-MM-DD')
					.refine((value) => {
						const [year, month, day] = value.split('-').map(Number);
						const date = new Date(Date.UTC(year, month - 1, day));
						return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
					}, 'addedAt must be a valid calendar date')
					.refine((value) => value <= new Date().toISOString().slice(0, 10), 'addedAt cannot be in the future')
					.optional(),
			}).superRefine((data, ctx) => {
				if (data.type === undefined && data.content_type === undefined) return;

				if (data.type !== 'case-study') {
					ctx.addIssue({ code: 'custom', path: ['type'], message: 'Must be case-study' });
				}
				if (!data.platform?.trim()) {
					ctx.addIssue({ code: 'custom', path: ['platform'], message: 'Required' });
				}
				if (data.content_type !== 'machine' && data.content_type !== 'sherlock') {
					ctx.addIssue({ code: 'custom', path: ['content_type'], message: 'Invalid case-study content type' });
				}
				if (data.status !== 'published-ready') {
					ctx.addIssue({ code: 'custom', path: ['status'], message: 'Must be published-ready' });
				}
				if (!data.tags?.length || data.tags.some((tag) => !tag.trim())) {
					ctx.addIssue({ code: 'custom', path: ['tags'], message: 'Must contain nonempty tags' });
				}
				if (!data.description?.trim()) {
					ctx.addIssue({ code: 'custom', path: ['description'], message: 'Required' });
				}

				const filePath = (data._filePath ?? '').split('\\').join('/');
				const windowsDir = filePath.includes('/machines/windows/');
				const linuxDir = filePath.includes('/machines/linux/');
				const relativePath = filePath.includes('/src/') ? filePath.slice(filePath.indexOf('/src/') + 1) : filePath || 'unknown file';
				if (windowsDir && data.tags?.includes('linux')) {
					ctx.addIssue({
						code: 'custom',
						path: ['tags'],
						message: `Machine under machines/windows/ cannot be tagged linux: move ${relativePath} to machines/linux/ or fix its tags`,
					});
				}
				if (linuxDir && data.tags?.includes('windows')) {
					ctx.addIssue({
						code: 'custom',
						path: ['tags'],
						message: `Machine under machines/linux/ cannot be tagged windows: move ${relativePath} to machines/windows/ or fix its tags`,
					});
				}
			}),
		}),
	}),
};
