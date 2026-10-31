const $ = id => document.getElementById(id);
const log = $('log'), box = $('box'), send = $('send'), main = $('main');
const SUGGEST = [
  "Write a Lua script that makes a Roblox part spin",
  "Explain Python list comprehensions with examples",
  "Help me break a big project into clear steps",
  "Plan my week and prioritize my tasks"
];
let history = [], busy = false, signedIn = false, mode = 'signup', pending = '';
let rbx = '', claimed = false;
const KEY = 'wallace_chats_v1';
let chats = [], currentId = null;
try { chats = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { chats = []; }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(chats.slice(0, 50))); } catch (_) {} }
function renderList() {
  $('list').innerHTML = chats.length
    ? chats.map(c => `<div class="item${c.id === currentId ? ' active' : ''}" data-id="${c.id}"><span class="t">${esc(c.title)}</span><button class="del" data-del title="Delete chat">✕</button></div>`).join('')
    : '<p class="empty">Your chats will show up here.</p>';
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

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function render(text) {
  return text.split(/```/).map((p, i) => {
    if (i % 2 === 1) {
      const nl = p.indexOf('\n'), lang = nl > -1 ? p.slice(0, nl).trim() : '', code = nl > -1 ? p.slice(nl + 1) : p;
      return `<div class="pre"><div class="bar"><span>${esc(lang || 'code')}</span><button type="button" data-copy>Copy</button></div><pre><code>${esc(code.replace(/\n$/, ''))}</code></pre></div>`;
    }
    return esc(p).split(/\n{2,}/).filter(x => x.trim()).map(x =>
      '<p>' + x.replace(/`([^`]+)`/g, '<code class="i">$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>') + '</p>').join('');
  }).join('');
}
function hero() {
  log.innerHTML = `<div class="hero"><h1>What can I help you build today?</h1><p>Your friendly assistant for Lua, Python, problem solving, and getting organized.</p><div class="chips">${SUGGEST.map(s => `<button class="chip" type="button">${esc(s)}</button>`).join('')}</div></div>`;
}
function add(role, html) {
  const d = document.createElement('div'); d.className = 'msg ' + role;
  d.innerHTML = `<div class="av">${role === 'user' ? 'You' : 'W'}</div><div class="body">${html}</div>`;
  log.appendChild(d); main.scrollTop = main.scrollHeight;
  return { row: d, body: d.querySelector('.body') };
}
async function refresh() {
  try {
    const s = await (await fetch('/api/status')).json();
    signedIn = s.signed_in;
    $('count').textContent = signedIn ? `${s.remaining} left today` : `${s.remaining} free message${s.remaining === 1 ? '' : 's'} left`;
    $('acct').textContent = signedIn ? 'Log out' : 'Sign in';
    rbx = s.roblox_url || ''; claimed = !!s.bonus_claimed;
    ['rbx', 'rbx2'].forEach(id => { const a = $(id); if (rbx) { a.href = rbx; a.hidden = false; } else a.hidden = true; });
    $('rlink').href = rbx || '#';
  } catch (_) {}
}
function openModal(msg) {
  $('mmsg').textContent = msg || '';
  $('merr').textContent = '';
  setMode(mode);
  $('modal').hidden = false; $('email').focus();
}
function openLimit(signed) {
  $('lmsg').textContent = signed ? "You've reached today's message limit." : "You've used your 10 free messages.";
  $('bonus').hidden = !(rbx && !claimed);
  $('lsign').hidden = signed;
  $('cerr').textContent = '';
  $('limit').hidden = false;
}
function setMode(m) {
  mode = m;
  $('mtitle').textContent = m === 'signup' ? 'Create your free account' : 'Welcome back';
  $('msubmit').textContent = m === 'signup' ? 'Sign up' : 'Log in';
  $('mswitch').textContent = m === 'signup' ? 'Already have an account? Log in' : 'New here? Sign up';
}
async function ask(text) {
  if (busy || !text.trim()) return;
  if (!history.length) log.innerHTML = '';
  history.push({ role: 'user', content: text });
  if (!currentId) currentId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const u = add('user', esc(text).replace(/\n/g, '<br>'));
  const ai = add('ai', '<span class="dots"></span>');
  busy = true; send.disabled = true; box.value = ''; box.style.height = 'auto';
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history, convo: currentId }) });
    if (r.status === 402) {
      history.pop(); u.row.remove(); ai.row.remove(); pending = text;
      const j = await r.json();
      if (!history.length) hero();
      await refresh(); openLimit(j.signed_in);
      throw 'limit';
    }
    if (r.status === 503) { history.pop(); ai.body.textContent = 'WallaceAI has hit its free daily capacity. Please come back tomorrow!'; throw 'limit'; }
    if (!r.ok) throw new Error('bad');
    const rd = r.body.getReader(), dec = new TextDecoder(); let acc = '';
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      acc += dec.decode(value, { stream: true }); ai.body.innerHTML = render(acc); main.scrollTop = main.scrollHeight;
    }
    history.push({ role: 'assistant', content: acc });
    saveChat();
  } catch (e) {
    if (e !== 'limit') { history.pop(); ai.body.textContent = 'Something went wrong. Please try again.'; }
  }
  busy = false; send.disabled = false; refresh(); box.focus();
}
$('form').addEventListener('submit', e => { e.preventDefault(); ask(box.value); });
box.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(box.value); } });
box.addEventListener('input', () => { box.style.height = 'auto'; box.style.height = Math.min(box.scrollHeight, 180) + 'px'; });
log.addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (c) return ask(c.textContent);
  const b = e.target.closest('[data-copy]');
  if (b) { navigator.clipboard.writeText(b.closest('.pre').querySelector('code').textContent).then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1400); }); }
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
$('acct').addEventListener('click', async () => {
  if (signedIn) { await fetch('/api/logout', { method: 'POST' }); refresh(); } else openModal('');
});
$('claim').addEventListener('click', async () => {
  $('cerr').textContent = '';
  const r = await fetch('/api/claim_bonus', { method: 'POST' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { $('cerr').textContent = j.error || 'Could not add messages.'; return; }
  $('limit').hidden = true; await refresh();
  if (pending) { const t = pending; pending = ''; ask(t); }
});
$('lsign').addEventListener('click', () => { $('limit').hidden = true; openModal('Sign up with your email to keep chatting.'); });
$('lclose').addEventListener('click', () => { $('limit').hidden = true; });
$('mswitch').addEventListener('click', () => setMode(mode === 'signup' ? 'login' : 'signup'));
$('mclose').addEventListener('click', () => { $('modal').hidden = true; });
$('mform').addEventListener('submit', async e => {
  e.preventDefault(); $('merr').textContent = '';
  const r = await fetch('/api/' + mode, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('email').value, password: $('pw').value }) });
  const j = await r.json();
  if (!r.ok) { $('merr').textContent = j.error || 'Something went wrong.'; return; }
  $('modal').hidden = true; $('pw').value = ''; await refresh();
  if (pending) { const t = pending; pending = ''; ask(t); }
});
hero(); renderList(); refresh();
