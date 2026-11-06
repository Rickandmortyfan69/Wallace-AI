'use strict';
const $ = id => document.getElementById(id);
const log = $('log'), box = $('box'), main = $('main');

const SUGGEST = [
  { topic: 'exploit', text: 'Write a full fly script for Xeno with speed control and toggle' },
  { topic: 'esp', text: 'Build an ESP with player boxes, names, distance and health bars' },
  { topic: 'remote spy', text: 'Hook and log all RemoteEvent and RemoteFunction calls' },
  { topic: 'auto-farm', text: 'Make an auto-farm loop with anti-AFK and disconnect recovery' }
];

// ── state ──
let history = [], busy = false, signedIn = false, mode = 'signup', pending = '';
let rbx = '', claimed = false, imagesOn = false;
let currentId = null;
let pendingImages = []; // [{dataUrl, mime}]
let memories = [];

// ── local chat storage ──
const KEY = 'wallace_chats_v2';
let chats = [];
try { chats = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { chats = []; }

// ── settings ──
const SKEY = 'wallace_settings_v1';
let settings = {};
try { settings = JSON.parse(localStorage.getItem(SKEY) || '{}'); } catch (_) {}

function saveSetting(k, v) {
  settings[k] = v;
  try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (_) {}
  applySettings();
}

function applySettings() {
  document.body.classList.remove('dim', 'light');
  if (settings.theme === 'dim') document.body.classList.add('dim');
  if (settings.theme === 'light') document.body.classList.add('light');
  document.documentElement.style.setProperty('--code-size', (settings.codeFontSize || 13) + 'px');
  const foot = $('count')?.parentElement;
  if (foot) foot.style.visibility = settings.showCount === false ? 'hidden' : '';
}
applySettings();

// ── chat persistence ──
function persist() { try { localStorage.setItem(KEY, JSON.stringify(chats.slice(0, 50))); } catch (_) {} }

function renderList() {
  $('list').innerHTML = chats.length
    ? chats.map(c => `<div class="item${c.id === currentId ? ' active' : ''}" data-id="${esc(c.id)}" tabindex="0" role="button"><span class="t">${esc(c.title)}</span><button class="del" data-del type="button" aria-label="Delete">×</button></div>`).join('')
    : '<p class="empty">No chats yet.</p>';
}

function saveChat() {
  if (!history.length) return;
  let c = chats.find(x => x.id === currentId);
  if (!c) { c = { id: currentId, title: history[0].content.slice(0, 40) }; chats.unshift(c); }
  c.messages = history.slice(-100); c.updated = Date.now();
  chats.sort((a, b) => b.updated - a.updated);
  persist(); renderList();
}

function openChat(id) {
  const c = chats.find(x => x.id === id);
  if (!c || busy) return;
  currentId = id; history = c.messages.slice(); log.innerHTML = '';
  history.forEach(m => add(m.role === 'user' ? 'user' : 'ai',
    m.role === 'user' ? (m.imgHtml || '') + esc(m.content).replace(/\n/g, '<br>') : render(m.content)));
  main.scrollTop = main.scrollHeight; renderList(); $('side').classList.remove('open');
}

function newChat() {
  if (busy) return;
  currentId = null; history = []; pendingImages = []; renderImagePreviews(); hero(); renderList();
  $('side').classList.remove('open');
}

// ── escaping + markdown ──
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const inline = t => t
  .replace(/`([^`]+)`/g, '<code class="i">$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\*([^*]+)\*/g, '<em>$1</em>');

function blocks(text) {
  const out = []; let list = null, para = [];
  const flushP = () => { if (para.length) { out.push('<p>' + para.join('<br>') + '</p>'); para = []; } };
  const flushL = () => { if (list) { out.push('<' + list.t + '>' + list.items.map(i => '<li>' + i + '</li>').join('') + '</' + list.t + '>'); list = null; } };
  for (const raw of esc(text).split('\n')) {
    const line = raw.trimEnd(); let m;
    if (!line.trim()) { flushP(); flushL(); }
    else if (/^\s*-{3,}\s*$/.test(line)) { flushP(); flushL(); out.push('<hr>'); }
    else if ((m = line.match(/^\s*[-*]\s+(.*)/))) { flushP(); if (!list || list.t !== 'ul') { flushL(); list = { t:'ul', items:[] }; } list.items.push(inline(m[1])); }
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { flushP(); if (!list || list.t !== 'ol') { flushL(); list = { t:'ol', items:[] }; } list.items.push(inline(m[1])); }
    else if ((m = line.match(/^#{1,4}\s+(.*)/))) { flushP(); flushL(); out.push('<h4>' + inline(m[1]) + '</h4>'); }
    else { flushL(); para.push(inline(line)); }
  }
  flushP(); flushL(); return out.join('');
}

function render(text) {
  return text.split(/```/).map((p, i) => {
    if (i % 2 === 0) return blocks(p);
    const nl = p.indexOf('\n');
    const lang = nl > -1 ? p.slice(0, nl).trim() : '';
    const code = nl > -1 ? p.slice(nl + 1) : p;
    // artifact — render as live iframe preview
    if (lang === 'artifact') {
      const id = 'art-' + Math.random().toString(36).slice(2, 8);
      const encoded = encodeURIComponent(code);
      setTimeout(() => {
        const fr = document.getElementById(id);
        if (!fr) return;
        fr.srcdoc = code;
        fr.onload = () => {
          try { fr.style.height = Math.min(fr.contentDocument.body.scrollHeight + 24, 600) + 'px'; } catch (_) {}
        };
      }, 50);
      return `<div class="artifact-wrap">
        <div class="artifact-bar">
          <span>\u29BF artifact</span>
          <div class="abtns">
            <button class="abtn" onclick="openFullArtifact('${id}')">Open full</button>
            <button class="abtn" data-code="${encoded}" onclick="copyArtifactCode(this)">Copy HTML</button>
          </div>
        </div>
        <iframe id="${id}" class="artifact-frame" sandbox="allow-scripts allow-same-origin" data-code="${encoded}"></iframe>
      </div>`;
    }
    return `<div class="pre"><div class="bar"><span>${esc(lang || 'code')}</span><button type="button" data-copy>Copy</button></div><pre><code>${esc(code.replace(/\n$/, ''))}</code></pre></div>`;
  }).join('');
}

function openFullArtifact(id) {
  const fr = document.getElementById(id);
  if (!fr) return;
  const code = decodeURIComponent(fr.dataset.code);
  const w = window.open('', '_blank');
  w.document.write(code); w.document.close();
}

function copyArtifactCode(btn) {
  const code = decodeURIComponent(btn.dataset.code);
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = 'Copied'; setTimeout(() => btn.textContent = 'Copy HTML', 1400);
  });
}

function hero() {
  log.innerHTML = `<div class="hero">
    <h1>Hyper-intelligent.<br><em>No limits.</em></h1>
    <p>Expert Lua executor scripting, debugging, remote analysis, and deep reasoning — WallaceAI delivers complete, production-ready code every time.</p>
    <div class="starters">${SUGGEST.map(s => `<button class="starter" type="button"><span class="topic">${esc(s.topic)}</span><span class="ask">${esc(s.text)}</span></button>`).join('')}</div>
  </div>`;
}

function add(role, html) {
  const d = document.createElement('div');
  d.className = 'msg ' + role;
  d.innerHTML = `<div class="body">${html}</div>`;
  log.appendChild(d);
  main.scrollTop = main.scrollHeight;
  return { row: d, body: d.querySelector('.body') };
}

// ── image upload ──
function renderImagePreviews() {
  $('imgPreviews').innerHTML = pendingImages.map((img, i) =>
    `<div class="img-preview-item"><img src="${img.dataUrl}" alt="upload"><button class="rm" data-idx="${i}" title="Remove">×</button></div>`
  ).join('');
}

$('attachBtn').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', async e => {
  for (const file of Array.from(e.target.files || [])) {
    if (!file.type.startsWith('image/')) continue;
    const dataUrl = await new Promise(res => {
      const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file);
    });
    pendingImages.push({ dataUrl, mime: file.type });
    if (pendingImages.length >= 4) break; // cap at 4 images
  }
  renderImagePreviews();
  e.target.value = '';
});

$('imgPreviews').addEventListener('click', e => {
  const btn = e.target.closest('[data-idx]');
  if (btn) { pendingImages.splice(Number(btn.dataset.idx), 1); renderImagePreviews(); }
});

// ── status ──
async function refresh() {
  try {
    const s = await (await fetch('/api/status')).json();
    signedIn = s.signed_in;
    $('count').textContent = signedIn ? `${s.remaining} left today` : `${s.remaining} free messages left`;
    $('acct').lastChild.textContent = ' ' + (signedIn ? 'Log out' : 'Sign in');
    rbx = s.roblox_url || ''; claimed = !!s.bonus_claimed;
    const rb = $('rbx'); if (rbx) { rb.href = rbx; rb.hidden = false; } else rb.hidden = true;
    $('rlink').href = rbx || '#';
    imagesOn = !!s.images; $('imgbtn').hidden = !imagesOn;
  } catch (_) {}
}

// ── auth modals ──
function openModal(msg) {
  $('mmsg').textContent = msg || ''; $('merr').textContent = ''; setMode(mode);
  $('side').classList.remove('open'); $('modal').hidden = false; $('email').focus();
}

function openLimit(signed) {
  $('lmsg').textContent = signed ? "You've reached today's message limit." : "You've used your free messages.";
  $('bonus').hidden = !(rbx && !claimed); $('lsign').hidden = signed; $('cerr').textContent = '';
  $('side').classList.remove('open'); $('limit').hidden = false;
}

function setMode(m) {
  mode = m;
  $('mtitle').textContent = m === 'signup' ? 'Create account' : 'Welcome back';
  $('msubmit').textContent = m === 'signup' ? 'Sign up' : 'Log in';
  $('mswitch').textContent = m === 'signup' ? 'Already have an account? Log in' : "New here? Sign up";
}

// ── main ask() ──
async function ask(text) {
  if (busy || !text.trim()) return;

  if (!history.length) log.innerHTML = '';

  // build message — include image if pending
  const imgs = pendingImages.splice(0);
  renderImagePreviews();

  const msg = { role: 'user', content: text };
  let imgHtml = '';
  if (imgs.length > 0) {
    msg.image = imgs[0].dataUrl; // send first image for vision
    imgHtml = imgs.map(img => `<img class="msg-img" src="${img.dataUrl}" alt="uploaded image">`).join('');
  }

  // inject custom instructions on first message
  if (history.length === 0 && settings.customInstructions) {
    msg.content = `[User preferences: ${settings.customInstructions}]\n\n${text}`;
  }
  msg.imgHtml = imgHtml; // store for chat replay

  history.push(msg);
  if (!currentId) currentId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const u = add('user', imgHtml + esc(text).replace(/\n/g, '<br>'));
  const ai = add('ai', '<span class="dots"></span>');
  busy = true; $('send').disabled = true; box.value = ''; box.style.height = 'auto';

  try {
    const payload = { messages: history, convo: currentId };
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (r.status === 402) {
      history.pop(); u.row.remove(); ai.row.remove(); pending = text;
      const j = await r.json().catch(() => ({}));
      if (!history.length) hero();
      await refresh(); openLimit(j.signed_in); throw 'limit';
    }
    if (r.status === 503) {
      history.pop(); ai.body.textContent = 'WallaceAI hit its daily limit. Come back tomorrow!'; throw 'limit';
    }
    if (!r.ok) throw new Error('http ' + r.status);

    const rd = r.body.getReader(), dec = new TextDecoder(); let acc = '';
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      acc += dec.decode(value, { stream: true });
      ai.body.innerHTML = render(acc);
      main.scrollTop = main.scrollHeight;
    }
    history.push({ role: 'assistant', content: acc });
    saveChat();

    // auto-save memory heuristic
    if (signedIn && settings.memoryEnabled) autoSaveMemory(text);

  } catch (e) {
    if (e !== 'limit') {
      history.pop();
      ai.body.textContent = 'Something went wrong. Please try again.';
    }
  }

  busy = false; $('send').disabled = false; refresh(); box.focus();
}

async function genImage(prompt) {
  if (busy || !prompt.trim()) return;
  if (!signedIn) { pending = ''; openModal('Sign up to create images.'); return; }
  if (!history.length) log.innerHTML = '';
  history.push({ role: 'user', content: 'Generate an image: ' + prompt });
  if (!currentId) currentId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const u = add('user', '<span class="muted">Image: </span>' + esc(prompt));
  const ai = add('ai', '<span class="dots"></span>');
  busy = true; $('send').disabled = true; box.value = ''; box.style.height = 'auto';
  try {
    const r = await fetch('/api/image', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ prompt, convo:currentId }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 402) { history.pop(); u.row.remove(); ai.row.remove(); if (!history.length) hero(); await refresh(); openLimit(true); throw 'handled'; }
    if (!r.ok) { history.pop(); ai.body.textContent = j.error || 'Image generation failed.'; throw 'handled'; }
    const src = 'data:image/jpeg;base64,' + j.image;
    ai.body.innerHTML = `<img class="gen" alt="${esc(prompt)}" src="${src}"><a class="ghost" download="wallaceai.jpg" href="${src}">Save image</a>`;
    history.push({ role:'assistant', content:'[Generated image: ' + prompt + ']' });
    saveChat();
  } catch (e) { if (e !== 'handled') { history.pop(); ai.body.textContent = 'Something went wrong.'; } }
  busy = false; $('send').disabled = false; refresh(); box.focus();
}

// ── memory ──
async function loadMemories() {
  if (!signedIn) return;
  try {
    const r = await fetch('/api/memories');
    if (r.ok) { memories = await r.json(); renderMemories(); }
  } catch (_) {}
}

function renderMemories() {
  const el = $('memList'); if (!el) return;
  el.innerHTML = memories.length
    ? memories.map(m => `<div class="mem-item"><span>${esc(m.content)}</span><button class="mem-del" data-mid="${esc(m.id)}">×</button></div>`).join('')
    : '<p class="mem-empty">No memories saved yet.</p>';
}

async function addMemory(content) {
  if (!content.trim() || !signedIn) return;
  try {
    const r = await fetch('/api/memories', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ content: content.trim().slice(0, 500) }) });
    if (r.ok) { const j = await r.json(); memories.unshift({ id: j.id, content: content.trim().slice(0, 500) }); renderMemories(); }
  } catch (_) {}
}

async function deleteMemory(mid) {
  try {
    await fetch(`/api/memories/${mid}`, { method:'DELETE' });
    memories = memories.filter(m => m.id !== mid); renderMemories();
  } catch (_) {}
}

function autoSaveMemory(text) {
  if (text.length > 200) return;
  const triggers = /\b(i use|i prefer|i play|my game is|my executor is|i always use|i want you to|my name is)\b/i;
  if (triggers.test(text)) addMemory(text.slice(0, 200));
}

// ── settings panel ──
function openSettings() {
  if ($('themeSelect')) $('themeSelect').value = settings.theme || 'dark';
  if ($('codeFontSize')) $('codeFontSize').value = settings.codeFontSize || 13;
  if ($('showCount')) $('showCount').checked = settings.showCount !== false;
  if ($('memoryEnabled')) $('memoryEnabled').checked = !!settings.memoryEnabled;
  if ($('customInstructions')) $('customInstructions').value = settings.customInstructions || '';
  if ($('responseStyle')) $('responseStyle').value = settings.responseStyle || 'balanced';
  if (signedIn && settings.memoryEnabled) loadMemories();
  $('settingsModal').hidden = false;
}

document.querySelectorAll('.stab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.stab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.remove('hidden');
  });
});

$('settingsBtn').addEventListener('click', openSettings);
$('settingsClose').addEventListener('click', () => { $('settingsModal').hidden = true; });
$('themeSelect').addEventListener('change', e => saveSetting('theme', e.target.value));
$('codeFontSize').addEventListener('change', e => saveSetting('codeFontSize', Number(e.target.value)));
$('showCount').addEventListener('change', e => saveSetting('showCount', e.target.checked));

$('memoryEnabled').addEventListener('change', e => {
  saveSetting('memoryEnabled', e.target.checked);
  if (e.target.checked && !signedIn) { openModal('Sign in to enable memory.'); $('memoryEnabled').checked = false; settings.memoryEnabled = false; return; }
  if (e.target.checked) loadMemories();
});

$('addMemory').addEventListener('click', () => {
  const v = $('memInput').value.trim(); if (!v) return;
  addMemory(v); $('memInput').value = '';
});
$('memInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('addMemory').click(); } });

$('clearMemories').addEventListener('click', async () => {
  if (!confirm('Clear all memories?')) return;
  try { await fetch('/api/memories', { method:'DELETE' }); memories = []; renderMemories(); } catch (_) {}
});

$('memList').addEventListener('click', e => {
  const btn = e.target.closest('[data-mid]'); if (btn) deleteMemory(btn.dataset.mid);
});

$('savePersonality').addEventListener('click', async () => {
  saveSetting('customInstructions', $('customInstructions').value);
  saveSetting('responseStyle', $('responseStyle').value);
  if (signedIn) {
    try { await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ settings }) }); } catch (_) {}
  }
  $('settingsModal').hidden = true;
});

// ── form + wiring ──
$('form').addEventListener('submit', e => { e.preventDefault(); ask(box.value); });
const desktopKeys = matchMedia('(hover:hover) and (pointer:fine)');
box.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && desktopKeys.matches) { e.preventDefault(); ask(box.value); } });
box.addEventListener('input', () => { box.style.height = 'auto'; box.style.height = Math.min(box.scrollHeight, 180) + 'px'; });

log.addEventListener('click', e => {
  const c = e.target.closest('.starter');
  if (c) return ask(c.querySelector('.ask').textContent);
  const b = e.target.closest('[data-copy]');
  if (b) {
    navigator.clipboard.writeText(b.closest('.pre').querySelector('code').textContent)
      .then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1400); });
  }
});

$('new').addEventListener('click', newChat);
$('newside').addEventListener('click', newChat);
$('menu').addEventListener('click', () => $('side').classList.toggle('open'));

$('list').addEventListener('click', e => {
  const it = e.target.closest('.item'); if (!it) return;
  if (e.target.closest('[data-del]')) {
    if (!confirm('Delete this chat?')) return;
    chats = chats.filter(c => c.id !== it.dataset.id); persist();
    if (currentId === it.dataset.id) newChat(); else renderList();
  } else openChat(it.dataset.id);
});

$('list').addEventListener('keydown', e => {
  const it = e.target.closest('.item');
  if (it && e.target === it && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openChat(it.dataset.id); }
});

$('acct').addEventListener('click', async () => {
  if (signedIn) { await fetch('/api/logout', { method:'POST' }); refresh(); } else openModal('');
});

$('imgbtn').addEventListener('click', () => {
  const t = box.value.trim();
  if (!t) { box.placeholder = 'Describe the image, then press the image button again'; box.focus(); return; }
  genImage(t);
});

$('claim').addEventListener('click', async () => {
  $('cerr').textContent = '';
  const r = await fetch('/api/claim_bonus', { method:'POST' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { $('cerr').textContent = j.error || 'Could not add messages.'; return; }
  $('limit').hidden = true; await refresh(); if (pending) { const t = pending; pending = ''; ask(t); }
});

$('lsign').addEventListener('click', () => { $('limit').hidden = true; openModal('Sign up to keep chatting.'); });
$('lclose').addEventListener('click', () => { $('limit').hidden = true; });
$('mswitch').addEventListener('click', () => setMode(mode === 'signup' ? 'login' : 'signup'));
$('mclose').addEventListener('click', () => { $('modal').hidden = true; });

$('mform').addEventListener('submit', async e => {
  e.preventDefault(); $('merr').textContent = '';
  const r = await fetch('/api/' + mode, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email:$('email').value, password:$('pw').value }) });
  const j = await r.json();
  if (!r.ok) { $('merr').textContent = j.error || 'Something went wrong.'; return; }
  $('modal').hidden = true; $('pw').value = ''; await refresh();
  if (pending) { const t = pending; pending = ''; ask(t); }
});

$('scrim').addEventListener('click', () => $('side').classList.remove('open'));

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  ['limit','modal','settingsModal'].forEach(id => { $(id).hidden = true; });
  $('side').classList.remove('open');
});

hero(); renderList(); refresh();
