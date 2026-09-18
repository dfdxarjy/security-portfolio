// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	site: 'https://taktak.hu',
	security: {
		csp: {
			algorithm: "SHA-256",
			directives: [
				"default-src 'self'",
				"base-uri 'self'",
				"object-src 'none'",
				"form-action 'self'",
				"img-src 'self' data:",
				"font-src 'self'",
				"connect-src 'self'",
				"frame-src 'self'",
			],
			scriptDirective: {
				resources: ["'self'"],
				hashes: [
					"sha256-OT6rncc3q/HAZxFhU8Z7usSuSFUYlKM4kgPHZV03rBg=",
					"sha256-bvjZC3AnPb+ys9toP8kN5cg7sF3ndpwX9+AxzZ7FjZM=",
					"sha256-f7r6V3mx+Z02XnMBA7Hh9nCOJFLSu8Xe5MMZ+MV01IM=",
				],
			},
			styleDirective: {
				resources: ["'self'", "'unsafe-inline'"],
			},
		},
	},
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
