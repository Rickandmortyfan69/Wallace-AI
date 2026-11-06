const $ = id => document.getElementById(id);
const log = $('log'), box = $('box'), send = $('send'), main = $('main');
const SUGGEST = [
  { topic: 'exploit', text: 'Write a full fly script for Xeno with speed control and toggle' },
  { topic: 'esp', text: 'Build an ESP with player boxes, names, distance and health bars' },
  { topic: 'remote spy', text: 'Hook and log all RemoteEvent and RemoteFunction calls to output' },
  { topic: 'auto-farm', text: 'Make an auto-farm loop with anti-AFK and disconnect recovery' }
];
let history = [], busy = false, signedIn = false, mode = 'signup', pending = '';
let rbx = '', claimed = false, imagesOn = false;
const KEY = 'wallace_chats_v2';
let chats = [], currentId = null;
try { chats = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { chats = []; }

// ── settings ──
const SETTINGS_KEY = 'wallace_settings_v1';
let settings = {};
try { settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (_) {}
function saveSetting(k, v) { settings[k] = v; localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); applySettings(); }
function applySettings() {
  document.body.classList.remove('dim','light');
  if (settings.theme === 'dim') document.body.classList.add('dim');
  if (settings.theme === 'light') document.body.classList.add('light');
  document.documentElement.style.setProperty('--code-size', (settings.codeFontSize || 13) + 'px');
  const countEl = $('count');
  if (countEl) countEl.parentElement.style.display = settings.showCount === false ? 'none' : '';
}
applySettings();

function persist() { try { localStorage.setItem(KEY, JSON.stringify(chats.slice(0, 50))); } catch (_) {} }
function renderList() {
  $('list').innerHTML = chats.length
    ? chats.map(c => `<div class="item${c.id === currentId ? ' active' : ''}" data-id="${c.id}" tabindex="0" role="button"><span class="t">${esc(c.title)}</span><button class="del" data-del type="button" aria-label="Delete">×</button></div>`).join('')
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
  const c = chats.find(x => x.id === id); if (!c || busy) return;
  currentId = id; history = c.messages.slice(); log.innerHTML = '';
  history.forEach(m => add(m.role === 'user' ? 'user' : 'ai', m.role === 'user' ? esc(m.content).replace(/\n/g, '<br>') : render(m.content)));
  main.scrollTop = main.scrollHeight; renderList(); $('side').classList.remove('open');
}
function newChat() { if (busy) return; currentId = null; history = []; hero(); renderList(); $('side').classList.remove('open'); }

const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const inline = t => t.replace(/`([^`]+)`/g,'<code class="i">$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
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
    if (i % 2 === 1) {
      const nl = p.indexOf('\n'), lang = nl > -1 ? p.slice(0, nl).trim() : '', code = nl > -1 ? p.slice(nl + 1) : p;
      return `<div class="pre"><div class="bar"><span>${esc(lang || 'code')}</span><button type="button" data-copy>Copy</button></div><pre><code>${esc(code.replace(/\n$/, ''))}</code></pre></div>`;
    }
    return blocks(p);
  }).join('');
}
function hero() {
  log.innerHTML = `<div class="hero"><h1>Hyper-intelligent.<br><em>No limits.</em></h1><p>Expert Lua executor scripting, debugging, remote analysis, and deep reasoning — WallaceAI delivers complete, production-ready code every time.</p><div class="starters">${SUGGEST.map(s => `<button class="starter" type="button"><span class="topic">${esc(s.topic)}</span><span class="ask">${esc(s.text)}</span></button>`).join('')}</div></div>`;
}
function add(role, html) {
  const d = document.createElement('div'); d.className = 'msg ' + role;
  d.innerHTML = `<div class="body">${html}</div>`;
  log.appendChild(d); main.scrollTop = main.scrollHeight;
  return { row: d, body: d.querySelector('.body') };
}
async function refresh() {
  try {
    const s = await (await fetch('/api/status')).json();
    signedIn = s.signed_in;
    $('count').textContent = signedIn ? `${s.remaining} left today` : `${s.remaining} free messages left`;
    $('acct').childNodes[1] ? null : null;
    $('acct').lastChild.textContent = ' ' + (signedIn ? 'Log out' : 'Sign in');
    rbx = s.roblox_url || ''; claimed = !!s.bonus_claimed;
    const rb = $('rbx'); if (rbx) { rb.href = rbx; rb.hidden = false; } else rb.hidden = true;
    $('rlink').href = rbx || '#';
    imagesOn = !!s.images; $('imgbtn').hidden = !imagesOn;
    if (signedIn && settings.memoryEnabled) loadMemories();
  } catch (_) {}
}
function openModal(msg) {
  $('mmsg').textContent = msg || ''; $('merr').textContent = '';
  setMode(mode); $('side').classList.remove('open'); $('modal').hidden = false; $('email').focus();
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
  $('mswitch').textContent = m === 'signup' ? 'Already have an account? Log in' : 'New here? Sign up';
}
async function genImage(prompt) {
  if (busy || !prompt.trim()) return;
  if (!signedIn) { pending = ''; openModal('Sign up to create images.'); return; }
  if (!history.length) log.innerHTML = '';
  history.push({ role:'user', content:'Generate an image: ' + prompt });
  if (!currentId) currentId = Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const u = add('user', '<span class="muted">Image:</span> ' + esc(prompt));
  const ai = add('ai', '<span class="dots"></span>');
  busy = true; send.disabled = true; box.value = ''; box.style.height = 'auto';
  try {
    const r = await fetch('/api/image', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ prompt, convo:currentId }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 402) { history.pop(); u.row.remove(); ai.row.remove(); if (!history.length) hero(); await refresh(); openLimit(true); throw 'handled'; }
    if (!r.ok) { history.pop(); ai.body.textContent = j.error || 'Image generation failed.'; throw 'handled'; }
    const src = 'data:image/jpeg;base64,' + j.image;
    ai.body.innerHTML = `<img class="gen" alt="${esc(prompt)}" src="${src}"><a class="ghost" download="wallaceai-image.jpg" href="${src}">Save image</a>`;
    history.push({ role:'assistant', content:'[Generated an image: ' + prompt + ']' });
    saveChat();
  } catch (e) { if (e !== 'handled') { history.pop(); ai.body.textContent = 'Something went wrong.'; } }
  busy = false; send.disabled = false; refresh(); box.focus();
}
async function ask(text) {
  if (busy || !text.trim()) return;
  if (/^\/image\s+/i.test(text)) return genImage(text.replace(/^\/image\s+/i,''));
  if (!history.length) log.innerHTML = '';
  // inject custom instructions if set
  let sendText = text;
  if (settings.customInstructions && history.length === 0) {
    sendText = `[User instructions: ${settings.customInstructions}]\n\n${text}`;
  }
  history.push({ role:'user', content:sendText });
  if (!currentId) currentId = Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const u = add('user', esc(text).replace(/\n/g,'<br>'));
  const ai = add('ai', '<span class="dots"></span>');
  busy = true; send.disabled = true; box.value = ''; box.style.height = 'auto';
  try {
    const r = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ messages:history, convo:currentId }) });
    if (r.status === 402) {
      history.pop(); u.row.remove(); ai.row.remove(); pending = text;
      const j = await r.json(); if (!history.length) hero(); await refresh(); openLimit(j.signed_in); throw 'limit';
    }
    if (r.status === 503) { history.pop(); ai.body.textContent = 'WallaceAI has hit its daily limit. Come back tomorrow!'; throw 'limit'; }
    if (!r.ok) throw new Error('bad');
    const rd = r.body.getReader(), dec = new TextDecoder(); let acc = '';
    for (;;) { const { done, value } = await rd.read(); if (done) break; acc += dec.decode(value, { stream:true }); ai.body.innerHTML = render(acc); main.scrollTop = main.scrollHeight; }
    history.push({ role:'assistant', content:acc });
    saveChat();
    // auto-save memory if enabled and signed in
    if (signedIn && settings.memoryEnabled) autoExtractMemory(text, acc);
  } catch (e) { if (e !== 'limit') { history.pop(); ai.body.textContent = 'Something went wrong. Please try again.'; } }
  busy = false; send.disabled = false; refresh(); box.focus();
}

// ── memory ──
let memories = [];
async function loadMemories() {
  try {
    const r = await fetch('/api/memories');
    if (r.ok) { memories = await r.json(); renderMemories(); }
  } catch (_) {}
}
function renderMemories() {
  const el = $('memList'); if (!el) return;
  el.innerHTML = memories.length
    ? memories.map(m => `<div class="mem-item"><span>${esc(m.content)}</span><button class="mem-del" data-mid="${esc(m.id)}" title="Delete">×</button></div>`).join('')
    : '<p class="mem-empty">No memories saved yet.</p>';
}
async function addMemory(content) {
  if (!content.trim() || !signedIn) return;
  const r = await fetch('/api/memories', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ content }) });
  if (r.ok) { const j = await r.json(); memories.unshift({ id:j.id, content }); renderMemories(); }
}
async function deleteMemory(mid) {
  await fetch(`/api/memories/${mid}`, { method:'DELETE' });
  memories = memories.filter(m => m.id !== mid); renderMemories();
}
async function clearAllMemories() {
  if (!confirm('Clear all memories?')) return;
  await fetch('/api/memories', { method:'DELETE' });
  memories = []; renderMemories();
}
async function autoExtractMemory(userMsg, aiReply) {
  // simple heuristic: if user mentions "I use", "I prefer", "my game", "I play" — save it
  const triggers = /\b(i use|i prefer|i play|my game|i always|i want|i need|my executor|my setup)\b/i;
  if (triggers.test(userMsg) && userMsg.length < 200) {
    await addMemory(userMsg.slice(0, 200));
  }
}

// ── settings panel ──
function openSettings() {
  // restore values from saved settings
  if ($('themeSelect')) $('themeSelect').value = settings.theme || 'dark';
  if ($('codeFontSize')) $('codeFontSize').value = settings.codeFontSize || 13;
  if ($('showCount')) $('showCount').checked = settings.showCount !== false;
  if ($('memoryEnabled')) $('memoryEnabled').checked = !!settings.memoryEnabled;
  if ($('customInstructions')) $('customInstructions').value = settings.customInstructions || '';
  if ($('responseStyle')) $('responseStyle').value = settings.responseStyle || 'balanced';
  $('memorySection').style.display = settings.memoryEnabled ? '' : '';
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
  if (e.target.checked && signedIn) loadMemories();
  if (!signedIn && e.target.checked) openModal('Sign up to enable memory.');
});
$('addMemory').addEventListener('click', () => {
  const v = $('memInput').value.trim(); if (!v) return;
  addMemory(v); $('memInput').value = '';
});
$('memInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('addMemory').click(); }});
$('clearMemories').addEventListener('click', clearAllMemories);
$('memList').addEventListener('click', e => {
  const btn = e.target.closest('[data-mid]'); if (btn) deleteMemory(btn.dataset.mid);
});
$('savePersonality').addEventListener('click', async () => {
  saveSetting('customInstructions', $('customInstructions').value);
  saveSetting('responseStyle', $('responseStyle').value);
  if (signedIn) {
    await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ settings }) });
  }
  $('settingsModal').hidden = true;
});

// ── main event wiring ──
$('form').addEventListener('submit', e => { e.preventDefault(); ask(box.value); });
const desktopKeys = matchMedia('(hover:hover) and (pointer:fine)');
box.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && desktopKeys.matches) { e.preventDefault(); ask(box.value); } });
box.addEventListener('input', () => { box.style.height = 'auto'; box.style.height = Math.min(box.scrollHeight, 180) + 'px'; });
log.addEventListener('click', e => {
  const c = e.target.closest('.starter'); if (c) return ask(c.querySelector('.ask').textContent);
  const b = e.target.closest('[data-copy]');
  if (b) { navigator.clipboard.writeText(b.closest('.pre').querySelector('code').textContent).then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1400); }); }
});
$('new').addEventListener('click', newChat);
$('newside').addEventListener('click', newChat);
$('menu').addEventListener('click', () => $('side').classList.toggle('open'));
$('list').addEventListener('click', e => {
  const it = e.target.closest('.item'); if (!it) return;
  if (e.target.closest('[data-del]')) { if (!confirm('Delete this chat?')) return; chats = chats.filter(c => c.id !== it.dataset.id); persist(); if (currentId === it.dataset.id) newChat(); else renderList(); }
  else openChat(it.dataset.id);
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
  const r = await fetch('/api/claim_bonus', { method:'POST' }); const j = await r.json().catch(() => ({}));
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
  const j = await r.json(); if (!r.ok) { $('merr').textContent = j.error || 'Something went wrong.'; return; }
  $('modal').hidden = true; $('pw').value = ''; await refresh(); if (pending) { const t = pending; pending = ''; ask(t); }
});
$('scrim').addEventListener('click', () => $('side').classList.remove('open'));
$('list').addEventListener('keydown', e => { const it = e.target.closest('.item'); if (it && e.target === it && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openChat(it.dataset.id); }});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  ['limit','modal','settingsModal'].forEach(id => { $(id).hidden = true; });
  $('side').classList.remove('open');
});

hero(); renderList(); refresh();
