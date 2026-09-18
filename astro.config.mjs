// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
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
	markdown: {
		shikiConfig: {
			themes: { light: 'github-light', dark: 'github-dark' },
			defaultColor: false,
		},
	},
	integrations: [react(), sitemap()],
	vite: {
		plugins: [tailwindcss()],
	},
});
