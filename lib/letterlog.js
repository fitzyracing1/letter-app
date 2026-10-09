/*
 * letterlog.js: shared by the browser app (window.LetterLog) and scripts/build.js (require).
 * Serializes letters as entries in the W3C Extended Log File Format
 * (W3C Working Draft WD-logfile-960323, https://www.w3.org/TR/WD-logfile.html)
 * and renders the static GitHub Pages site (letter pages, index, sitemap, robots).
 * No dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LetterLog = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SOFTWARE = 'LetterStudio/1.0';
  // Spec: "date" and "time" are standard identifiers (GMT); application-specific fields use the "x-" prefix.
  var FIELDS = ['date', 'time', 'x-letter-id', 'x-author', 'x-subject', 'x-words', 'x-audio', 'x-body'];

  /* ---------- Extended Log File Format encoding ---------- */
  // <string> = '"' *<schar> '"' ; <schar> = xchar | '""'   (a quote inside a string is doubled)
  // Spec: entries must not contain ASCII control characters and "no mechanism for incorporating
  // control characters is defined". So, as an application convention for x-body, line breaks are
  // written as the two characters \n, tabs as \t, and a literal backslash as \\ .
  function encodeString(s) {
    if (s === null || s === undefined) return '-'; // '-' = field omitted
    s = String(s)
      .replace(/\\/g, '\\\\')
      .replace(/\r\n|\r|\n/g, '\\n')
      .replace(/\t/g, '\\t')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/"/g, '""');
    return '"' + s + '"'; // an empty string is "" (spec: dash must not abbreviate an empty string)
  }
  function decodeString(tok) {
    if (tok === '-') return null;
    if (tok[0] !== '"') return tok;
    var inner = tok.slice(1, -1).replace(/""/g, '"');
    return inner.replace(/\\(\\|n|t)/g, function (_, c) { return c === 'n' ? '\n' : c === 't' ? '\t' : '\\'; });
  }
  // Split an entry line into raw field tokens (whitespace separated, quoted strings may contain spaces).
  function tokenize(line) {
    var out = [], i = 0, n = line.length;
    while (i < n) {
      while (i < n && (line[i] === ' ' || line[i] === '\t')) i++;
      if (i >= n) break;
      if (line[i] === '"') {
        var j = i + 1;
        for (;;) {
          if (j >= n) break; // unterminated: take rest of line (spec: parsers should be tolerant)
          if (line[j] === '"') { if (line[j + 1] === '"') { j += 2; continue; } break; }
          j++;
        }
        out.push(line.slice(i, Math.min(j + 1, n)));
        i = j + 1;
      } else {
        var k = i; while (k < n && line[k] !== ' ' && line[k] !== '\t') k++;
        out.push(line.slice(i, k)); i = k;
      }
    }
    return out;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function gmtDate(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function gmtTime(d) { return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()); }

  function countWords(t) { t = (t || '').trim(); return t ? t.split(/\s+/).length : 0; }

  function entryLine(L) {
    var d = new Date(L.date);
    var vals = {
      'date': gmtDate(d),
      'time': gmtTime(d),
      'x-letter-id': encodeString(L.id),
      'x-author': L.author ? encodeString(L.author) : '-',
      'x-subject': encodeString(L.subject || ''),
      'x-words': String(L.words != null ? L.words : countWords(L.body)),
      'x-audio': L.audioSeconds ? Number(L.audioSeconds).toFixed(1) : '-', // <fixed>: seconds of recorded audio
      'x-body': encodeString(L.body || '')
    };
    return FIELDS.map(function (f) { return vals[f]; }).join(' ');
  }

  // Serialize a whole log. Required directives Version and Fields precede all entries.
  function serializeLog(letters, opts) {
    opts = opts || {};
    var sorted = letters.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var lines = ['#Version: 1.0', '#Software: ' + (opts.software || SOFTWARE)];
    var now = opts.now ? new Date(opts.now) : new Date();
    if (sorted.length) { var s = new Date(sorted[0].date); lines.push('#Start-Date: ' + gmtDate(s) + ' ' + gmtTime(s)); }
    lines.push('#Date: ' + gmtDate(now) + ' ' + gmtTime(now));
    if (opts.remark) lines.push('#Remark: ' + opts.remark.replace(/[\r\n]+/g, ' '));
    lines.push('#Fields: ' + FIELDS.join(' '));
    sorted.forEach(function (L) { lines.push(entryLine(L)); });
    return lines.join('\n') + '\n';
  }

  // Parse a log (tolerant: honours each #Fields directive, skips corrupt lines). Later entries with the
  // same x-letter-id replace earlier ones, so appending an edited letter updates it.
  function parseLog(text) {
    var fields = null, byId = {}, order = [], errors = [];
    String(text).split(/\r\n|\n|\r/).forEach(function (line, idx) {
      if (!line.trim()) return;
      if (line[0] === '#') {
        var m = /^#Fields:\s*(.*)$/.exec(line);
        if (m) fields = m[1].trim().split(/\s+/);
        return;
      }
      if (!fields) { errors.push('line ' + (idx + 1) + ': entry before #Fields'); return; }
      var toks = tokenize(line);
      if (toks.length !== fields.length) { errors.push('line ' + (idx + 1) + ': expected ' + fields.length + ' fields, got ' + toks.length); return; }
      var r = {}; fields.forEach(function (f, i) { r[f] = toks[i]; });
      var id = decodeString(r['x-letter-id'] || '-');
      if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) { errors.push('line ' + (idx + 1) + ': bad x-letter-id'); return; }
      var L = {
        id: id,
        date: (r.date || '1970-01-01') + 'T' + (r.time && r.time !== '-' ? r.time : '00:00:00') + 'Z',
        author: decodeString(r['x-author'] || '-'),
        subject: decodeString(r['x-subject'] || '""') || '',
        body: decodeString(r['x-body'] || '""') || '',
        words: r['x-words'] && r['x-words'] !== '-' ? parseInt(r['x-words'], 10) : null,
        audioSeconds: r['x-audio'] && r['x-audio'] !== '-' ? parseFloat(r['x-audio']) : null
      };
      if (L.words == null) L.words = countWords(L.body);
      if (!(id in byId)) order.push(id);
      byId[id] = L;
    });
    return { letters: order.map(function (id) { return byId[id]; }), errors: errors };
  }

  function slugify(s) {
    return (s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '') || 'letter';
  }
  function makeId(subject, date) {
    var d = new Date(date || Date.now());
    var rnd = Math.random().toString(36).slice(2, 6);
    return gmtDate(d) + '-' + slugify(subject) + '-' + rnd;
  }

  /* ---------- Site rendering ---------- */
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function base(site) { var b = (site && site.baseUrl) || '/'; return b.replace(/\/?$/, '/'); }
  function letterUrl(L, site) { return base(site) + 'letters/' + L.id + '.html'; }
  function describe(L) {
    var t = (L.body || '').replace(/\s+/g, ' ').trim();
    return t.length > 155 ? t.slice(0, 152).replace(/\s+\S*$/, '') + '…' : t;
  }
  function humanDate(L) {
    var d = new Date(L.date);
    try { return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); }
    catch (e) { return gmtDate(d); }
  }
  function jsonLd(obj) { return JSON.stringify(obj, null, 2).replace(/</g, '\\u003c'); }
  var GEN = '<meta name="generator" content="' + SOFTWARE + '">\n<link rel="icon" href="data:,">';

  function renderLetterPage(L, site) {
    var title = (L.subject || 'Untitled letter') + ' | ' + ((site && site.title) || 'Letters');
    var url = letterUrl(L, site);
    var author = L.author || 'Anonymous';
    var paras = (L.body || '').trim().split(/\n\s*\n/).map(function (p) {
      return '<p>' + escHtml(p.trim()).replace(/\n/g, '<br>\n') + '</p>';
    }).join('\n');
    var ld = {
      '@context': 'https://schema.org', '@type': 'Article',
      headline: (L.subject || 'Untitled letter').slice(0, 110),
      description: describe(L),
      author: { '@type': 'Person', name: author },
      datePublished: new Date(L.date).toISOString(),
      dateModified: new Date(L.date).toISOString(),
      wordCount: L.words != null ? L.words : countWords(L.body),
      inLanguage: (site && site.lang) || 'en',
      url: url, mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      isPartOf: { '@type': 'WebSite', name: (site && site.title) || 'Letters', url: base(site) }
    };
    return '<!doctype html>\n<html lang="' + escHtml((site && site.lang) || 'en') + '">\n<head>\n' +
      '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' + GEN + '\n' +
      '<title>' + escHtml(title) + '</title>\n' +
      '<meta name="description" content="' + escHtml(describe(L)) + '">\n' +
      '<meta name="author" content="' + escHtml(author) + '">\n' +
      '<link rel="canonical" href="' + escHtml(url) + '">\n' +
      '<meta property="og:type" content="article">\n<meta property="og:title" content="' + escHtml(L.subject || 'Untitled letter') + '">\n' +
      '<meta property="og:description" content="' + escHtml(describe(L)) + '">\n<meta property="og:url" content="' + escHtml(url) + '">\n' +
      '<link rel="stylesheet" href="letter.css">\n' +
      '<script type="application/ld+json">\n' + jsonLd(ld) + '\n</script>\n</head>\n<body>\n' +
      '<nav><a href="index.html">← All letters</a> · <a href="../index.html">Write a letter</a></nav>\n' +
      '<main>\n<article>\n<h1>' + escHtml(L.subject || 'Untitled letter') + '</h1>\n' +
      '<p class="meta">By <span>' + escHtml(author) + '</span> · <time datetime="' + new Date(L.date).toISOString() + '">' + escHtml(humanDate(L)) + '</time> · ' + (L.words != null ? L.words : countWords(L.body)) + ' words</p>\n' +
      '<div class="body">\n' + paras + '\n</div>\n</article>\n</main>\n' +
      '<footer><p>Letter ID <code>' + escHtml(L.id) + '</code>, recorded in <a href="../letters.log">letters.log</a> (W3C Extended Log File Format).</p></footer>\n' +
      '</body>\n</html>\n';
  }

  function renderIndex(letters, site) {
    var sorted = letters.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var t = (site && site.title) || 'Letters';
    var url = base(site) + 'letters/';
    var ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: t, url: url,
      hasPart: sorted.map(function (L) { return { '@type': 'Article', headline: L.subject || 'Untitled letter', url: letterUrl(L, site) }; }) };
    var items = sorted.map(function (L) {
      return '<li><a href="' + escHtml(L.id) + '.html">' + escHtml(L.subject || 'Untitled letter') + '</a>' +
        '<span class="meta"> by ' + escHtml(L.author || 'Anonymous') + ' · <time datetime="' + new Date(L.date).toISOString() + '">' + escHtml(humanDate(L)) + '</time></span>' +
        '<p>' + escHtml(describe(L)) + '</p></li>';
    }).join('\n');
    return '<!doctype html>\n<html lang="' + escHtml((site && site.lang) || 'en') + '">\n<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' + GEN + '\n<title>' + escHtml(t) + '</title>\n' +
      '<meta name="description" content="' + escHtml((site && site.description) || 'Published letters') + '">\n' +
      '<link rel="canonical" href="' + escHtml(url) + '">\n<link rel="stylesheet" href="letter.css">\n' +
      '<script type="application/ld+json">\n' + jsonLd(ld) + '\n</script>\n</head>\n<body>\n' +
      '<nav><a href="../index.html">Write a letter</a> · <a href="../letters.log">letters.log</a></nav>\n<main>\n<h1>' + escHtml(t) + '</h1>\n' +
      (sorted.length ? '<ol class="list" reversed>\n' + items + '\n</ol>' : '<p class="empty">No letters yet — <a href="../index.html">write the first one</a>.</p>') + '\n</main>\n</body>\n</html>\n';
  }

  function renderSitemap(letters, site) {
    var b = base(site);
    var urls = [{ loc: b, lastmod: null }, { loc: b + 'letters/', lastmod: null }].concat(letters.map(function (L) {
      return { loc: letterUrl(L, site), lastmod: gmtDate(new Date(L.date)) };
    }));
    var newest = letters.reduce(function (m, L) { return !m || new Date(L.date) > new Date(m) ? L.date : m; }, null);
    if (newest) { urls[1].lastmod = gmtDate(new Date(newest)); }
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map(function (u) { return '  <url><loc>' + escHtml(u.loc) + '</loc>' + (u.lastmod ? '<lastmod>' + u.lastmod + '</lastmod>' : '') + '</url>'; }).join('\n') +
      '\n</urlset>\n';
  }
  function renderRobots(site) { return 'User-agent: *\nAllow: /\n\nSitemap: ' + base(site) + 'sitemap.xml\n'; }

  var LETTER_CSS = [
    'body{margin:0;font:18px/1.7 Georgia,"Times New Roman",serif;color:#1d2433;background:#fbfaf7}',
    'nav,main,footer{max-width:720px;margin:0 auto;padding:16px 20px}',
    'nav{font:15px system-ui,sans-serif}a{color:#2453d6}',
    'h1{font-size:2rem;line-height:1.25;margin:.5em 0 .2em}',
    '.meta{color:#5b6475;font:15px system-ui,sans-serif;margin-top:0}',
    '.list{padding-left:1.2em}.list li{margin:0 0 1.2em}.list p{margin:.2em 0;color:#3a4256}',
    'footer{color:#5b6475;font:14px system-ui,sans-serif;border-top:1px solid #e3e1da;margin-top:24px}'
  ].join('\n') + '\n';

  /* ---------- Minimal ZIP writer (STORE, no compression) ---------- */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function utf8(s) { return new TextEncoder().encode(s); }
  function zip(files, when) {
    var d = when ? new Date(when) : new Date();
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var chunks = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = utf8(f.name), data = typeof f.data === 'string' ? utf8(f.data) : f.data, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      chunks.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var cdSize = central.reduce(function (s, a) { return s + a.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
    var all = chunks.concat(central, [new Uint8Array(e.buffer)]);
    var out = new Uint8Array(all.reduce(function (s, a) { return s + a.length; }, 0)), p = 0;
    all.forEach(function (a) { out.set(a, p); p += a.length; });
    return out;
  }

  return {
    SOFTWARE: SOFTWARE, FIELDS: FIELDS, encodeString: encodeString, decodeString: decodeString, tokenize: tokenize,
    entryLine: entryLine, serializeLog: serializeLog, parseLog: parseLog, countWords: countWords, slugify: slugify, makeId: makeId,
    renderLetterPage: renderLetterPage, renderIndex: renderIndex, renderSitemap: renderSitemap, renderRobots: renderRobots,
    LETTER_CSS: LETTER_CSS, letterUrl: letterUrl, zip: zip, escHtml: escHtml
  };
});
