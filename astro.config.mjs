// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
	site: 'https://taktak.hu',
	integrations: [
		starlight({
			title: 'Takács Bence',
			customCss: ['./src/styles/portfolio.css'],
			components: {
				// Supported Starlight override: swaps only the doc-page footer.
				// Header, sidebar, search, and theme picker stay default.
				Footer: './src/components/SiteFooter.astro',
			},
			sidebar: [
				{ label: 'All Work', link: '/#explorer' },
				{ label: 'Training & Profiles', link: '/training/' },
				{
					label: 'Offensive Security',
					collapsed: true,
					items: [
						{
							label: 'Windows',
							items: [{ autogenerate: { directory: 'case-studies/htb/machines/windows' } }],
						},
						{
							label: 'Linux',
							items: [{ autogenerate: { directory: 'case-studies/htb/machines/linux' } }],
						},
					],
				},
				{
					label: 'Investigations',
					collapsed: true,
					items: [
						{
							label: 'DFIR',
							items: [{ autogenerate: { directory: 'case-studies/htb/sherlocks/dfir' } }],
						},
					],
				},
			],
		}),
		sitemap(),
	],
});
