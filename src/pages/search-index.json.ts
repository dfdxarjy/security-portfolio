import { getCollection } from 'astro:content';

// Lightweight client-side search index for the site search dialog. Plain JSON,
// no dependency on any framework component. `category` mirrors the case-page
// derivation (machines/windows → windows, machines/linux → linux,
// sherlocks/dfir → dfir); everything else is empty.
export async function GET() {
	const docs = await getCollection('docs');
	const items = docs.map((entry) => {
		const categoryKey = entry.id.split('/').slice(0, -1).join('/');
		const category = categoryKey.endsWith('machines/windows')
			? 'windows'
			: categoryKey.endsWith('machines/linux')
				? 'linux'
				: categoryKey.endsWith('sherlocks/dfir')
					? 'dfir'
					: '';
		return {
			id: entry.id,
			href: '/' + entry.id.replace(/\/index$/, '') + '/',
			title: entry.data.title,
			description: entry.data.description,
			tags: entry.data.tags ?? [],
			tools: entry.data.tools ?? [],
			category,
		};
	});
	return new Response(JSON.stringify(items), {
		headers: { 'content-type': 'application/json' },
	});
}
