import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { z } from 'astro/zod';

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
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
			}),
		}),
	}),
};
