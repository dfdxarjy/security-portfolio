# Preview fonts

Self-hosted webfonts for the `/preview/*` visual-direction previews only.
They are not referenced by the live portfolio (`/` or any case-study page).

## Licence

All faces below are the **IBM Plex** and **Source Serif 4** families, licensed
under the **SIL Open Font License 1.1** (SIL OFL 1.1). The OFL permits
self-hosting, modification and redistribution provided the fonts (or
derivatives) keep the same licence and are not sold by themselves.

- Source Serif 4 — © Adobe, SIL OFL 1.1.
- IBM Plex — © IBM, SIL OFL 1.1.

## Source

Fetched from the Bunny Fonts CDN (a drop-in, privacy-friendly Google Fonts
mirror). The CSS was requested with a desktop User-Agent, then only the
`/* latin */` `@font-face` blocks were downloaded locally.

CSS request:

```
https://fonts.bunny.net/css?family=source-serif-4:400,600|ibm-plex-serif:600|ibm-plex-sans:400,600|ibm-plex-mono:400,500
```

Exact woff2 source URLs (all `latin` subset):

| Local file | Source URL | Bytes |
| --- | --- | ---: |
| `source-serif-4-latin-400-normal.woff2` | `https://fonts.bunny.net/source-serif-4/files/source-serif-4-latin-400-normal.woff2` | 20088 |
| `source-serif-4-latin-600-normal.woff2` | `https://fonts.bunny.net/source-serif-4/files/source-serif-4-latin-600-normal.woff2` | 21532 |
| `ibm-plex-serif-latin-600-normal.woff2` | `https://fonts.bunny.net/ibm-plex-serif/files/ibm-plex-serif-latin-600-normal.woff2` | 20516 |
| `ibm-plex-sans-latin-400-normal.woff2` | `https://fonts.bunny.net/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2` | 22588 |
| `ibm-plex-sans-latin-600-normal.woff2` | `https://fonts.bunny.net/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2` | 24252 |
| `ibm-plex-mono-latin-400-normal.woff2` | `https://fonts.bunny.net/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2` | 14708 |
| `ibm-plex-mono-latin-500-normal.woff2` | `https://fonts.bunny.net/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2` | 14888 |

Total: **138572 bytes** (7 files).
