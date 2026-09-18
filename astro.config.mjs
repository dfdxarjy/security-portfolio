// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
// Preview-only wiring for the temporary shadcn preview route; remove with it.
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	site: 'https://taktak.hu',
	redirects: {
		'/case-studies/htb/machines/windows/monitorsfour/':
			'/case-studies/htb/machines/linux/monitorsfour/',
		'/training/': '/profiles/',
		'/training/dante/': '/prolabs/dante/',
		'/training/zephyr/': '/prolabs/zephyr/',
		'/training/offshore/': '/prolabs/offshore/',
		'/training/mythical/': '/prolabs/mythical/',
		'/training/puppet/': '/prolabs/puppet/',
	},
	integrations: [
		starlight({
			title: 'taktak.hu',
			customCss: ['./src/styles/portfolio.css'],
			lastUpdated: true,
			editLink: {
				baseUrl: 'https://github.com/taktak0x/security-portfolio/edit/main/',
			},
			head: [
				{
					tag: 'meta',
					attrs: {
						property: 'og:image',
						content: 'https://taktak.hu/og-default.png',
					},
				},
				{
					tag: 'meta',
					attrs: { property: 'og:image:width', content: '1200' },
				},
				{
					tag: 'meta',
					attrs: { property: 'og:image:height', content: '630' },
				},
				{
					tag: 'meta',
					attrs: { name: 'twitter:card', content: 'summary_large_image' },
				},
			],
			components: {
				// Supported Starlight override: swaps only the doc-page footer.
				// Header, search, and theme picker stay default.
				Footer: './src/components/SiteFooter.astro',
				PageTitle: './src/components/PageTitle.astro',
				// Appends JSON-LD (Article + BreadcrumbList) to Starlight's head.
				Head: './src/components/Head.astro',
				// Supported Starlight override for the header brand; the component
				// preserves Starlight's `site-title` contract.
				SiteTitle: './src/components/SiteTitle.astro',
				// Case-file shell: these four only change case-study pages, and
				// render Starlight's default component everywhere else.
				Sidebar: './src/components/Sidebar.astro',
				TableOfContents: './src/components/TableOfContents.astro',
				// Keeps the info/related rail reachable where the right column hides.
				MobileTableOfContents: './src/components/MobileTableOfContents.astro',
				Pagination: './src/components/Pagination.astro',
			},
			sidebar: [
				{ label: 'All Work', link: '/#explorer' },
				{ label: 'Pro Labs', link: '/prolabs/' },
				{ label: 'Profiles', link: '/profiles/' },
				{
					label: 'Offensive Security',
					collapsed: true,
					items: [
						{ label: 'Windows', link: '/case-studies/htb/machines/windows/' },
						{ label: 'Linux', link: '/case-studies/htb/machines/linux/' },
					],
				},
				{
					label: 'Investigations',
					collapsed: true,
					items: [{ label: 'DFIR', link: '/case-studies/htb/sherlocks/dfir/' }],
				},
			],
		}),
		react(),
		sitemap(),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
