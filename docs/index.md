# Letter Studio (repo: letter-app)

Letter Studio is a static web app with no build tools or runtime dependencies. You write a letter (or dictate it with the Web Speech API), hear it read back (`speechSynthesis`), optionally record yourself (`MediaRecorder`) with a word-by-word comparison, and then log it in the W3C Extended Log File Format and export it as an indexable GitHub Pages page. Nothing is uploaded automatically.

## Getting started

```sh
python3 -m http.server 8765      # from the repo root; localhost counts as a secure context, so the mic APIs work
# open http://localhost:8765
```

## Publishing letters

```sh
node scripts/build.js --add <id>.log   # merge an exported entry into letters.log and regenerate letters/, sitemap.xml, robots.txt
node scripts/build.js --check          # validate letters.log
```

`.github/workflows/pages.yml` deploys the site.

## Files

| Path | Role |
|---|---|
| `index.html`, `app.js`, `style.css` | the app |
| `lib/letterlog.js` | Extended Log File Format read/write |
| `scripts/build.js` | site generator and validator |
| `letters.log`, `letters/` | published letters |
| `site.config.json` | site settings |

The repo has no LICENSE file. Copyright (c) 2026 Joshua Almeida
