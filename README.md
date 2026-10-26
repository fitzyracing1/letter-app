# Letter Studio

Write a letter, hear it read back, record yourself saying it, then log it in the
[W3C Extended Log File Format](https://www.w3.org/TR/WD-logfile.html) and publish it as an
indexable page on GitHub Pages. It's a static site with no build tools or dependencies.

## Flow

1. **Write**: name, subject and letter. **Dictate** fills the letter by voice (Web Speech API
   `SpeechRecognition`, available in Chrome and Edge). Drafts save to `localStorage` automatically.
2. **Read it back**: `speechSynthesis` reads the letter aloud and highlights each word as it's spoken.
   You can pick the voice and speed, and pause, resume or stop.
3. **Record & play back** (optional, with a *Skip this step* button): `MediaRecorder` records you reading the letter. You can play it back,
   re-record, or download it (`.webm` in Chrome). Where speech recognition is available, a live
   transcript appears and a word-by-word comparison shows matched, missed and extra words, with a match percentage.
4. **Log & publish**: no recording is needed (`x-audio` is `-` without one). **Finish letter & add to log** turns the letter into one entry in `letters.log`.
   **Export for GitHub Pages** downloads a zip with `letters/<id>.html` and `<id>.log`. You can also
   download the whole `letters.log` (kept in this browser), preview the letter page, or download/copy the letter as .txt or .md.
   Nothing is uploaded automatically.

Without speech recognition, recording or speech synthesis (or outside a secure context), the app
explains what's missing and the rest of it still works.

## Run locally

```sh
cd letter-app
python3 -m http.server 8765
# open http://localhost:8765  (localhost counts as a secure context, so the mic and speech APIs work)
```

## The log format

`letters.log` follows the W3C Working Draft *Extended Log File Format* (WD-logfile-960323):

```
#Version: 1.0
#Software: LetterStudio/1.0
#Start-Date: 2026-10-07 14:12:05
#Date: 2026-10-09 18:00:00
#Fields: date time x-letter-id x-author x-subject x-words x-audio x-body
2026-10-09 18:33:20 "2026-10-09-hello-4g1o" "Jane Doe" "Hello ""world""" 4 - "Dear readers,\n\nHello."
```

- `date` and `time` are in GMT, as the spec requires. Application-specific fields use the spec's `x-` prefix.
- Strings are quoted, and a `"` inside a string is doubled (`""`), as the spec says. `-` means the field was left out (for example no author, or no recording). An empty string is `""`.
- `x-words` is an integer. `x-audio` is the length of the recording in seconds (`<fixed>`). The audio file itself is never published.
- The spec doesn't allow control characters in entries and gives no way to escape them. So, as an
  app convention, line breaks in `x-body` are written as `\n`, tabs as `\t`, and backslashes as `\\`.
- Later entries with the same `x-letter-id` replace earlier ones, so appending an edited letter updates it.

## Repository / GitHub Pages layout

```
index.html, app.js, style.css    the app
lib/letterlog.js                 shared log + page rendering (used by the app AND the build script)
letters.log                      the source of truth: every letter, W3C extended log format
letters/<id>.html                one page per letter (title, meta description, canonical, Open Graph, JSON-LD Article)
letters/index.html               list of all letters (JSON-LD CollectionPage)
letters/letter.css
sitemap.xml, robots.txt
site.config.json                 baseUrl (public Pages URL), site title, language
scripts/build.js                 regenerates letters/, sitemap.xml and robots.txt from letters.log
.github/workflows/pages.yml      builds from letters.log and deploys to Pages
.nojekyll
```

## Publishing a letter

```sh
# after "Export for GitHub Pages", unzip and copy <id>.log into the repo root, then:
node scripts/build.js --add <id>.log    # merges into letters.log and regenerates the site
node scripts/build.js --check           # validate letters.log
git add -A && git commit -m "Add letter" && git push
```

In the GitHub repo settings, set **Pages → Source** to **GitHub Actions**. Canonical links and the
sitemap use `baseUrl` from `site.config.json`. The `SITE_BASE_URL` environment variable overrides it.

**Indexing note:** on a project site (`user.github.io/letter-app/`), crawlers only read `robots.txt`
at the domain root, so the generated one only applies to a user site or custom domain. To get
indexed, submit `sitemap.xml` in Google Search Console or Bing Webmaster Tools.

`letters.log` starts empty (header directives only).

## Documentation

- In-repo docs: [docs/](docs/index.md)
- Wiki: [https://github.com/fitzyracing1/letter-app/wiki](https://github.com/fitzyracing1/letter-app/wiki)

## Plans

This project is free, and its license stays as is. Support it through [GitHub Sponsors](https://github.com/sponsors/fitzyracing1):

- **Free**: use the code, community support.
- **Pro ($49/month)**: priority issues and support.
- **Team ($199/month)**: priority support for your team plus early access.
