# security-portfolio

Static portfolio of security case studies and training write-ups, built with Astro and Starlight.

## Stack

- [Astro](https://astro.build) 7
- [@astrojs/starlight](https://starlight.astro.build) for the documentation shell
- [@astrojs/sitemap](https://docs.astro.build/en/guides/integrations-guide/sitemap/) for the sitemap
- pnpm

## Development

```bash
pnpm install
pnpm dev       # local dev server
pnpm build     # static output in dist/
pnpm preview   # serve the build locally
```

## Content

Case studies live under `src/content/docs/case-studies/`, grouped by platform and target type:

```
case-studies/htb/machines/windows/<slug>.md
case-studies/htb/machines/linux/<slug>.md
case-studies/htb/sherlocks/dfir/<slug>.md
```

Training profiles live under `src/content/docs/training/`. Every page's frontmatter is validated against the schema in `src/content.config.ts`; the homepage explorer and the sidebar pick up new entries automatically.

## Production

The canonical site URL is configured as `site` in `astro.config.mjs`. The build emits a static site to `dist/`, including `sitemap-index.xml`.

## Branches and deployment

Two long-lived branches:

| Branch | Purpose | Deployment |
|---|---|---|
| `dev` | All work, experiments, and local verification. | None — pushing `dev` publishes nothing. |
| `main` | Permanent, confirmed changes only. | `.github/workflows/deploy.yml` builds and deploys to GitHub Pages at https://taktak.hu/. |

Work and test on `dev` (`pnpm dev` for the local server, `pnpm build` to verify the static output). Move a change to `main` only once it is final and confirmed, since pushing `main` publishes the live site. Do not force-push or rewrite published history on `main`; undo a published change with a new corrective commit on `dev`.
