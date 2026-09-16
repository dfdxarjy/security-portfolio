// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
	site: 'https://taktak.hu',
	redirects: {
		'/case-studies/htb/machines/windows/monitorsfour/':
			'/case-studies/htb/machines/linux/monitorsfour/',
	},
	integrations: [
		starlight({
			title: 'taktak.hu',
			customCss: ['./src/styles/portfolio.css'],
			lastUpdated: true,
			editLink: {
				baseUrl: 'https://github.com/dfdxarjy/security-portfolio/edit/main/',
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
				{ label: 'Training & Profiles', link: '/training/' },
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
		sitemap(),
	],
});
