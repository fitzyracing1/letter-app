(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEY = 'letterStudio.draft.v1';
  const statusEl = $('status');
  const announce = (msg) => { statusEl.textContent = ''; setTimeout(() => { statusEl.textContent = msg; }, 30); };
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const els = { name: $('name'), subject: $('subject'), letter: $('letter') };

  /* ---------- Draft persistence ---------- */
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || '{}');
      for (const k of Object.keys(els)) if (typeof d[k] === 'string') els[k].value = d[k];
      if (d.rate) $('rate').value = d.rate;
      return d;
    } catch { return {}; }
  }
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const d = {};
      for (const k of Object.keys(els)) d[k] = els[k].value;
            d.rate = $('rate').value; d.voice = $('voice').value || saved.voice;
      d.currentId = saved.currentId || null; d.baseUrl = $('baseurl') ? $('baseurl').value : saved.baseUrl;
      try { localStorage.setItem(KEY, JSON.stringify(d)); $('saved').textContent = 'Saved ' + new Date().toLocaleTimeString(); }
      catch { $('saved').textContent = 'Could not save (storage unavailable)'; }
    }, 300);
  }
  const saved = load();

  function wordsOf(t) { return t.trim() ? t.trim().split(/\s+/).length : 0; }
  function updateCount() { const n = wordsOf(els.letter.value); $('wordcount').textContent = n + (n === 1 ? ' word' : ' words'); }

  /* ---------- Step navigation (tabs) ---------- */
  const tabs = [...document.querySelectorAll('[role=tab]')];
  function go(n, focusTab) {
    tabs.forEach((t, i) => {
      const on = i === n - 1;
      t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
      $('step-' + (i + 1)).hidden = !on;
    });
    if (n === 2) renderReadback();
    if (n === 3) renderDiff();
    if (n === 4) updateSubmission();
    if (focusTab) tabs[n - 1].focus(); else $('step-' + n).querySelector('h2').setAttribute('tabindex', '-1'), $('step-' + n).querySelector('h2').focus();
    if (n !== 2) stopSpeaking();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => go(i + 1, true));
    t.addEventListener('keydown', (e) => {
      let j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
      if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      if (e.key === 'Home') j = 0; if (e.key === 'End') j = tabs.length - 1;
      if (j !== null) { e.preventDefault(); go(j + 1, true); }
    });
  });
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(+b.dataset.go)));

  /* ---------- Step 1: write + dictate ---------- */
  for (const k of Object.keys(els)) els[k].addEventListener('input', () => { save(); if (k === 'letter') updateCount();  });
  updateCount();
  $('clear').addEventListener('click', () => {
    if (!confirm('Clear the subject, name and letter? This cannot be undone.')) return;
    els.letter.value = els.subject.value = els.name.value = ''; updateCount(); save(); announce('Draft cleared.');
  });

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let dictation = null;
  if (!SR) {
    $('dictate').disabled = true;
    $('dictate-msg').textContent = 'Voice dictation isn\u2019t available in this browser (try Chrome or Edge). You can still type.';
  } else if (!window.isSecureContext) {
    $('dictate').disabled = true;
    $('dictate-msg').textContent = 'Voice dictation needs a secure page (https or localhost).';
  }
  $('dictate').addEventListener('click', () => {
    if (dictation) { dictation.stop(); return; }
    const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = navigator.language || 'en-US';
    const base = els.letter.value; const sep = base && !/\s$/.test(base) ? ' ' : '';
    let finalText = '';
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
      }
      els.letter.value = base + sep + (finalText + interim).trim(); updateCount(); save();
    };
    r.onerror = (e) => { $('dictate-msg').textContent = 'Dictation error: ' + (e.error === 'not-allowed' ? 'microphone permission was denied.' : e.error); };
    r.onend = () => { dictation = null; $('dictate').textContent = '🎙 Dictate'; $('dictate').setAttribute('aria-pressed', 'false'); announce('Dictation stopped.'); };
    try { r.start(); dictation = r; $('dictate').textContent = '■ Stop dictating'; $('dictate').setAttribute('aria-pressed', 'true'); announce('Dictation started. Speak now.'); }
    catch (err) { $('dictate-msg').textContent = 'Could not start dictation: ' + err.message; }
  });

  /* ---------- Step 2: read back (speechSynthesis) ---------- */
  const synth = window.speechSynthesis;
  let voices = [], speaking = false, paused = false;
  function fillVoices() {
    voices = synth.getVoices();
    const sel = $('voice'); const prev = sel.value || saved.voice;
    sel.innerHTML = '';
    if (!voices.length) { sel.innerHTML = '<option value="">Default voice</option>'; return; }
    voices.forEach((v) => { const o = document.createElement('option'); o.value = v.name; o.textContent = `${v.name} (${v.lang})${v.default ? ' · default' : ''}`; sel.appendChild(o); });
    const pick = voices.find((v) => v.name === prev) || voices.find((v) => v.default) || voices.find((v) => v.lang.startsWith((navigator.language || 'en').slice(0, 2)));
    if (pick) sel.value = pick.name;
  }
  if (!synth || !window.SpeechSynthesisUtterance) {
    $('tts-unsupported').hidden = false; ['speak', 'voice', 'rate'].forEach((id) => { $(id).disabled = true; });
  } else { fillVoices(); synth.addEventListener?.('voiceschanged', fillVoices); }
  $('voice').addEventListener('change', save);
  $('rate').addEventListener('input', () => { $('rate-out').textContent = (+$('rate').value).toFixed(1) + '×'; save(); });
  $('rate-out').textContent = (+$('rate').value).toFixed(1) + '×';

  function renderReadback(charIndex, charLength) {
    const t = els.letter.value;
    const box = $('readback');
    if (!t.trim()) { box.innerHTML = '<span class="hint">Your letter is empty. Go back to Step 1 to write it.</span>'; return; }
    if (charIndex == null) { box.innerHTML = esc(t); return; }
    // highlight current sentence lightly and current word strongly
    const end = charIndex + (charLength || (t.slice(charIndex).match(/^\S+/) || [''])[0].length);
    box.innerHTML = esc(t.slice(0, charIndex)) + '<mark>' + esc(t.slice(charIndex, end)) + '</mark>' + esc(t.slice(end));
    const m = box.querySelector('mark'); if (m && m.scrollIntoView) m.scrollIntoView({ block: 'nearest' });
  }
  function setSpeakingUI(on) {
    speaking = on; $('pause').disabled = !on; $('stop').disabled = !on; $('speak').disabled = on;
    if (!on) { paused = false; $('pause').textContent = '⏸ Pause'; }
  }
  function stopSpeaking() { if (synth && (speaking || synth.speaking)) { synth.cancel(); setSpeakingUI(false); renderReadback(); } }
  $('speak').addEventListener('click', () => {
    const text = els.letter.value.trim() ? els.letter.value : '';
    if (!text) { announce('Nothing to read. Write your letter first.'); return; }
    synth.cancel();
    // Speak only the letter body so boundary char indexes line up with the textarea
    const u = new SpeechSynthesisUtterance(text);
    const v = voices.find((x) => x.name === $('voice').value); if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = +$('rate').value;
    u.onboundary = (e) => { if (e.name === 'word' || e.name === undefined) renderReadback(e.charIndex, e.charLength); };
    u.onend = () => { setSpeakingUI(false); renderReadback(); announce('Finished reading.'); };
    u.onerror = (e) => { setSpeakingUI(false); renderReadback(); if (e.error !== 'interrupted' && e.error !== 'canceled') announce('Speech error: ' + e.error); };
    setSpeakingUI(true); announce('Reading your letter aloud.');
    synth.speak(u);
  });
  $('pause').addEventListener('click', () => {
    if (!paused) { synth.pause(); paused = true; $('pause').textContent = '▶ Resume'; announce('Paused.'); }
    else { synth.resume(); paused = false; $('pause').textContent = '⏸ Pause'; announce('Resumed.'); }
  });
  $('stop').addEventListener('click', () => { stopSpeaking(); announce('Stopped.'); });

  /* ---------- Step 3: record + playback + transcript + diff ---------- */
  const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  if (!window.isSecureContext) { $('rec-unsupported').hidden = false; $('rec-unsupported').textContent = 'Recording needs a secure page (https or http://localhost).'; $('rec').disabled = true; }
  else if (!canRecord) { $('rec-unsupported').hidden = false; $('rec-unsupported').textContent = 'Audio recording isn\u2019t supported in this browser. Try a recent Chrome, Edge, Firefox or Safari.'; $('rec').disabled = true; }
  $('sr-msg').textContent = SR ? 'Live transcript appears here while you record.' : 'Live transcription isn\u2019t available in this browser (try Chrome), so the word comparison is unavailable. You can still record and listen back.';

  let lastAudioSeconds = null;
  let recorder = null, chunks = [], stream = null, audioURL = null, recRec = null, transcript = '', timerId = null, t0 = 0;
  function pickMime() {
    const c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    return c.find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
  }
  async function startRec() {
    stopSpeaking();
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (err) { announce(err.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it in the address bar and try again.' : 'Could not access the microphone: ' + err.message); return; }
    const mime = pickMime();
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      lastAudioSeconds = Math.round((Date.now() - t0) / 100) / 10;
      const type = recorder.mimeType || mime || 'audio/webm';
      const blob = new Blob(chunks, { type });
      if (audioURL) URL.revokeObjectURL(audioURL);
      audioURL = URL.createObjectURL(blob);
      $('audio').src = audioURL; $('download-audio').href = audioURL;
      $('download-audio').download = 'letter-recording.' + (type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm');
      $('playback').hidden = false;
      stream.getTracks().forEach((t) => t.stop());
      announce('Recording saved. Press play to listen back.');
    };
    recorder.start();
    transcript = ''; $('transcript').textContent = ''; $('diff').innerHTML = ''; $('match-score').textContent = '';
    if (SR) {
      recRec = new SR(); recRec.continuous = true; recRec.interimResults = true; recRec.lang = navigator.language || 'en-US';
      let fin = '';
      recRec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) fin += e.results[i][0].transcript + ' '; else interim += e.results[i][0].transcript; }
        transcript = (fin + interim).trim(); $('transcript').textContent = transcript;
      };
      recRec.onerror = (e) => { if (e.error !== 'no-speech' && e.error !== 'aborted') $('sr-msg').textContent = 'Transcription error: ' + e.error; };
      recRec.onend = () => { if (recorder && recorder.state === 'recording') { try { recRec.start(); } catch {} } else renderDiff(); };
      try { recRec.start(); } catch {}
    }
    $('rec').disabled = true; $('rec').classList.add('rec-on'); $('rec').textContent = '● Recording…'; $('rec-stop').disabled = false; $('rec-stop').focus();
    t0 = Date.now(); timerId = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); $('rec-timer').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 250);
    announce('Recording. Read your letter aloud, then press Stop.');
  }
  function stopRec() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    if (recRec) { try { recRec.stop(); } catch {} }
    clearInterval(timerId);
    $('rec').disabled = false; $('rec').classList.remove('rec-on'); $('rec').textContent = '● Record again'; $('rec-stop').disabled = true;
    setTimeout(renderDiff, 600);
  }
  $('rec').addEventListener('click', startRec);
  $('rec-stop').addEventListener('click', stopRec);
  $('rerecord').addEventListener('click', startRec);

  const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, '').replace(/^'+|'+$/g, '');
  // Word-level LCS diff
  function diffWords(aText, bText) {
    const a = aText.split(/\s+/).filter(Boolean), b = bText.split(/\s+/).filter(Boolean);
    const an = a.map(norm), bn = b.map(norm);
    const n = a.length, m = b.length;
    if (n * m > 4e6) return null;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = an[i] && an[i] === bn[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) {
      if (an[i] && an[i] === bn[j]) { out.push(['ok', a[i]]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(['miss', a[i++]]);
      else out.push(['extra', b[j++]]);
    }
    while (i < n) out.push(['miss', a[i++]]);
    while (j < m) out.push(['extra', b[j++]]);
    return { out, matched: dp[0][0], total: an.filter(Boolean).length };
  }
  function renderDiff() {
    const d = $('diff'), sc = $('match-score');
    if (!SR) { d.innerHTML = '<span class="hint">Comparison needs speech recognition.</span>'; sc.textContent = ''; return; }
    if (!els.letter.value.trim()) { d.innerHTML = '<span class="hint">Write your letter in Step 1 first.</span>'; sc.textContent = ''; return; }
    if (!transcript) { d.innerHTML = '<span class="hint">Record yourself reading the letter to see the comparison.</span>'; sc.textContent = ''; return; }
    const r = diffWords(els.letter.value, transcript);
    if (!r) { d.textContent = 'Letter is too long to compare.'; return; }
    d.innerHTML = r.out.map(([k, w]) => `<span class="${k}" title="${k === 'ok' ? 'matched' : k === 'miss' ? 'in letter, not said' : 'said, not in letter'}">${esc(w)}</span>`).join(' ');
    const pct = r.total ? Math.round((r.matched / r.total) * 100) : 0;
    sc.textContent = `${r.matched} of ${r.total} words matched (${pct}%).`;
  }
  window.__letterDiff = diffWords; // exposed for testing

  /* ---------- Step 4: log & publish ---------- */
  const LL = window.LetterLog;
  const LOGKEY = 'letterStudio.log.v1';
  let current = null; // the finished letter for the current draft
  let logLetters = [];
  try { logLetters = JSON.parse(localStorage.getItem(LOGKEY) || '[]'); } catch { logLetters = []; }
  const saveLog = () => { try { localStorage.setItem(LOGKEY, JSON.stringify(logLetters)); } catch {} };
  const defaultBase = () => (/\.github\.io$/.test(location.hostname) ? location.origin + location.pathname.replace(/[^/]*$/, '') : 'https://fitzyracing1.github.io/letter-app/');
  $('baseurl').value = saved.baseUrl || defaultBase();
  const site = () => ({ baseUrl: ($('baseurl').value.trim() || defaultBase()).replace(/\/?$/, '/'), title: 'Letters', lang: (document.documentElement.lang || 'en') });

  function draftLetter() {
    const id = saved.currentId && logLetters.some((x) => x.id === saved.currentId) ? saved.currentId : null;
    return {
      id: id || LL.makeId(els.subject.value, Date.now()),
      date: new Date().toISOString(),
      author: els.name.value.trim() || null,
      subject: els.subject.value.trim(),
      body: els.letter.value.replace(/\s+$/, ''),
      words: LL.countWords(els.letter.value),
      audioSeconds: lastAudioSeconds || null
    };
  }
  function updateSubmission() {
    const hasLetter = !!els.letter.value.trim();
    const preview = current || (hasLetter ? Object.assign(draftLetter(), { id: '(assigned-when-finished)' }) : null);
    $('entry').textContent = preview ? LL.entryLine(preview) : 'Write your letter in Step 1 first.';
    $('finish').disabled = !hasLetter;
    $('export').disabled = $('preview-page').disabled = !current;
    $('finish-msg').textContent = current ? 'In the log as ' + current.id : (hasLetter ? 'Not in the log yet.' : '');
    $('log').textContent = logLetters.length ? LL.serializeLog(logLetters) : '(empty: finish a letter to add it)';
    $('log-count').textContent = '(' + logLetters.length + (logLetters.length === 1 ? ' letter)' : ' letters)');
    $('remove-id').innerHTML = logLetters.map((x) => `<option value="${esc(x.id)}">${esc(x.subject || x.id)}</option>`).join('');
    $('remove').disabled = $('remove-id').disabled = !logLetters.length;
    $('dl-log').disabled = !logLetters.length;
  }
  // Editing the draft after finishing means the log entry is stale until "Finish" is pressed again.
  for (const k of ['name', 'subject', 'letter']) els[k].addEventListener('input', () => { current = null; });
  $('finish').addEventListener('click', () => {
    if (!els.letter.value.trim()) { announce('Write your letter first.'); return; }
    const L = draftLetter();
    logLetters = logLetters.filter((x) => x.id !== L.id).concat([L]);
    current = L; saved.currentId = L.id; saveLog(); save(); updateSubmission();
    announce('Letter added to the log as ' + L.id + '.');
  });
  $('remove').addEventListener('click', () => {
    const id = $('remove-id').value; if (!id || !confirm('Remove "' + id + '" from this browser\u2019s log?')) return;
    logLetters = logLetters.filter((x) => x.id !== id); if (current && current.id === id) current = null; saveLog(); updateSubmission(); announce('Removed from the log.');
  });
  $('baseurl').addEventListener('input', save);

  function download(name, data, type) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); announce('Downloaded ' + name + '.');
  }
  $('dl-log').addEventListener('click', () => download('letters.log', LL.serializeLog(logLetters), 'text/plain;charset=utf-8'));
  $('export').addEventListener('click', () => {
    if (!current) return;
    const s = site();
    const readme = 'Letter Studio export: ' + current.id + '\n\n' +
      'In your GitHub Pages repo (the letter-app folder):\n' +
      '  1. Copy ' + current.id + '.log into the repo root.\n' +
      '  2. Run: node scripts/build.js --add ' + current.id + '.log\n' +
      '     (adds the entry to letters.log and regenerates letters/*.html, letters/index.html, sitemap.xml, robots.txt)\n' +
      '  3. Commit and push. The Pages workflow rebuilds and deploys.\n\n' +
      'letters/' + current.id + '.html is included so you can preview the page. The build script regenerates it from the log.\n';
    const bytes = LL.zip([
      { name: 'letters/' + current.id + '.html', data: LL.renderLetterPage(current, s) },
      { name: current.id + '.log', data: LL.serializeLog([current]) },
      { name: 'README-EXPORT.txt', data: readme }
    ]);
    download(current.id + '.zip', bytes, 'application/zip');
  });
  $('preview-page').addEventListener('click', () => {
    if (!current) return;
    // Inline the stylesheet so the preview renders standalone.
    const html = LL.renderLetterPage(current, site()).replace('<link rel="stylesheet" href="letter.css">', '<style>' + LL.LETTER_CSS + '</style>');
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000);
  });

  function composeText() { const subj = els.subject.value.trim() || '(no subject)'; const name = els.name.value.trim(); return { subj, body: els.letter.value.trim(), name }; }
  const asTxt = () => { const { subj, body, name } = composeText(); return `Subject: ${subj}\n\n${body}\n${name && !body.includes(name) ? '\n' + name + '\n' : ''}`; };
  const asMd = () => { const { subj, body, name } = composeText(); return `# ${subj}\n\n${name ? `*From: ${name}*\n\n` : ''}${body}\n`; };
  const slug = () => LL.slugify(els.subject.value);
  $('dl-txt').addEventListener('click', () => download(slug() + '.txt', asTxt(), 'text/plain;charset=utf-8'));
  $('dl-md').addEventListener('click', () => download(slug() + '.md', asMd(), 'text/markdown;charset=utf-8'));
  $('copy').addEventListener('click', async () => {
    const t = asTxt();
    try { await navigator.clipboard.writeText(t); announce('Copied to clipboard.'); }
    catch {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand && document.execCommand('copy'); ta.remove();
      announce(ok ? 'Copied to clipboard.' : 'Couldn\u2019t copy automatically. Select the text and copy it by hand.');
    }
  });
  // If the saved draft matches its logged entry, treat it as finished.
  (() => {
    const L = logLetters.find((x) => x.id === saved.currentId);
    if (L && L.body === els.letter.value.replace(/\s+$/, '') && L.subject === els.subject.value.trim()) current = L;
  })();
  updateSubmission();
  window.addEventListener('beforeunload', () => { if (synth) synth.cancel(); });
})();
