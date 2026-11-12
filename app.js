(() => {
  const LS = { pass: 'kid-pass', checks: 'kid-checks', manual: 'kid-manual', seen: 'kid-seen', notified: 'kid-notified', hidden: 'kid-hidden' };
  const CAT = { school: '학교·학원' };
  const SRCNAME = { band: '밴드', ealimi: 'e알리미', classdojo: 'ClassDojo', 'gcal-family': '가족캘린더', isosik: '아이소식', hakwon: '학원친구', isharing: '아이쉐어링', gcal: '구글캘린더', kakao: '카톡', teams: 'Teams', mail: '메일', tasktalk: 'tasktalk', 'gcal-work': '팀캘린더', manual: '직접' };
  const $ = (s) => document.querySelector(s);
  const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let data = { asOf: '', sources: [], items: [] };
  let tab = 'today';
  let newIds = new Set();

  // ---------- crypto ----------
  const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function decrypt(pass) {
    const enc = await (await fetch('data.enc.json', { cache: 'no-store' })).json();
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(enc.salt), iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(enc.iv) }, key, b64d(enc.data));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  // ---------- dates ----------
  const today0 = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const diff = (due) => (due ? Math.round((new Date(due + 'T00:00:00') - today0()) / 86400000) : null);
  function ddLabel(due) {
    const d = diff(due); if (d === null) return '';
    const md = due.slice(5).replace('-', '/');
    const w = '일월화수목금토'[new Date(due + 'T00:00:00').getDay()];
    if (d === 0) return ['today', '오늘'];
    if (d === 1) return ['soon', '내일'];
    if (d < 0) return ['over', md + ' 지남'];
    if (d <= 7) return ['soon', `${md}(${w}) D-${d}`];
    return ['', `${md}(${w}) D-${d}`];
  }

  // ---------- 준비물·제출물·시험: 오늘 챙겨서 다음 등교일에 가져가는 항목 ----------
  const WD = '일월화수목금토';
  function nextSchoolOffset() { const w = new Date().getDay(); return w === 5 ? 3 : w === 6 ? 2 : 1; }
  function isPrep(i) { return i.kind === 'task' && (i.prep === true || (i.src === 'band' && /일과표/.test(i.note || ''))); }
  function prepNow(i) { if (!isPrep(i)) return false; const d = diff(i.due); return d !== null && d > 0 && d <= nextSchoolOffset(); }
  function ddLabelFor(i) {
    if (prepNow(i)) { const d = diff(i.due); const w = WD[new Date(i.due + 'T00:00:00').getDay()]; return ['today', '오늘 챙기기 → ' + (d === 1 ? '내일' : w + '요일') + ' 가져가요']; }
    return ddLabel(i.due);
  }
  function prepTitle() { const pd = nextSchoolOffset(); return pd === 1 ? '🎒 오늘 챙겨요 → 내일 가져가요' : '🎒 챙겨 두기 → ' + WD[(new Date().getDay() + pd) % 7] + '요일에 가져가요'; }

  // ---------- model ----------
  const allItems = () => [...data.items, ...get(LS.manual, [])].filter((i) => !get(LS.hidden, []).includes(i.id));
  const isDone = (id) => !!get(LS.checks, {})[id];
  function toggle(id) { const c = get(LS.checks, {}); if (c[id]) delete c[id]; else c[id] = new Date().toISOString(); set(LS.checks, c); recordChange(sk(id), !!c[id]); render(); }

  function sortItems(a, b) {
    const da = diff(a.due), db = diff(b.due);
    const ka = da === null ? 9999 : da, kb = db === null ? 9999 : db;
    if (ka !== kb) return ka - kb;
    const p = { high: 0, mid: 1, low: 2 };
    return (p[a.pri] ?? 1) - (p[b.pri] ?? 1);
  }

  function itemHTML(i) {
    const done = isDone(i.id);
    const [cls, lbl] = ddLabelFor(i) || [];
    return `<div class="item ${i.cat} ${i.kind === 'info' ? 'info' : ''} ${done ? 'done' : ''} pri-${i.pri || 'mid'}" data-id="${esc(i.id)}">
      <button class="box" data-act="toggle" aria-label="완료">${done ? '✓' : ''}</button>
      <div class="body">
        <div class="title">${esc(i.title)}</div>
        <div class="sub">
          ${lbl ? `<span class="dd ${cls}">${lbl}</span>` : ''}
          ${newIds.has(i.id) ? '<span class="dd today">NEW</span>' : ''}
          <span class="tag">${esc(SRCNAME[i.src] || i.src)}</span>${whoTag(i.id)}
          ${i.kind === 'info' ? '<span class="tag">일정</span>' : ''}
          ${i.note ? `<span>${esc(i.note)}</span>` : ''}
          ${i.detail || i.link ? '<span class="more">자세히 ›</span>' : ''}
        </div>
      </div>
      ${i.src === 'manual' || i.manual ? '<button class="del" data-act="del" title="삭제">✕</button>' : ''}
    </div>`;
  }

  function groupHTML(title, items, showCount = true) {
    if (!items.length) return '';
    if (title === '완료') return '<details class="group donegrp"><summary>✓ 완료 ' + items.length + '개 (눌러서 펼치기)</summary>' + items.map(itemHTML).join('') + '</details>';
    const left = items.filter((i) => !isDone(i.id) && i.kind !== 'info').length;
    return `<div class="group"><h3><span>${title}</span>${showCount ? `<span>${left}개 남음</span>` : ''}</h3>${items.map(itemHTML).join('')}</div>`;
  }

  function renderSummary() {
    renderWho();
    if (data.links && data.links.length) {
      const dk = ymd(today0()); const doneMap = get('kid-linkdone', {}); const ds = doneMap[dk] || [];
      const tiles = data.links.filter((l) => !l.notile).map((l) => `<a class="qtile" href="${esc(l.url)}" target="_blank" rel="noopener" style="--tc:${esc(l.color || '#2f5d8a')}"><span class="qic${(l.icon || '').length > 2 ? ' txt' : ''}">${esc(l.icon || '🔗')}</span><span class="qname">${esc(l.short || l.title)}</span></a>`).join('');
      const rowF = (l) => `<button class="qrow ${ds.includes(l.id) ? 'done' : ''}" data-qcheck="${esc(l.id)}"><span class="qbox">${ds.includes(l.id) ? '✓' : ''}</span><span class="qtxt">${esc(l.title)}</span>${linkWho(dk, l.id) ? '<span class="qwho">✓ ' + esc(linkWho(dk, l.id)) + '</span>' : ''}</button>`;
      const cl = data.links.filter((l) => !l.nocheck), isD = (l) => ds.includes(l.id);
      const rows = cl.filter((l) => !isD(l)).map(rowF).join('') + (cl.some(isD) ? '<details class="donegrp"><summary>✓ 완료 ' + cl.filter(isD).length + '개 (눌러서 펼치기)</summary>' + cl.filter(isD).map(rowF).join('') + '</details>' : '');
      let vh = ''; const V = data.vocab;
      if (V && V.words && V.words.length) {
        const n = Math.floor((today0() - new Date(V.start + 'T00:00:00')) / 86400000), di = ((n % 7) + 7) % 7, pick = (k) => V.words.slice(k * 3, k * 3 + 3);
        const wrow = (w) => `<div class="vw"><button class="vsay" data-say="${esc(w.en)}" aria-label="듣기">🔊</button><div class="vtxt"><b>${esc(w.en)}</b><span class="vko">${esc(w.ko)}</span><span class="vmean">${esc(w.mean)}</span></div></div>`;
        vh = '<div class="qtitle">🔤 오늘의 단어 3개 · ' + (di + 1) + '/7일째 (영어 · 발음 · 뜻)</div><div class="vcard">' + pick(di).map(wrow).join('') + '</div>' + (di > 0 ? '<details class="vprev"><summary>어제 단어 다시 보기</summary>' + pick(di - 1).map(wrow).join('') + '</details>' : '');
      }
      $('#summary').innerHTML = '<div class="qtitle">바로가기</div><div class="qtiles">' + tiles + '</div>' + vh + '<div class="qtitle">오늘 했어요? 눌러서 체크</div><div class="qchecks">' + rows + '</div>';
      return;
    }
    const items = allItems();
    $('#summary').innerHTML = Object.entries(CAT).map(([k, v]) => {
      const left = items.filter((i) => i.cat === k && i.kind !== 'info' && !isDone(i.id));
      const urgent = left.filter((i) => { const d = diff(i.due); return d !== null && d <= 1; }).length;
      return `<div class="sum ${k}" data-go="${k}"><b>${left.length}</b><span>${v} 남은 일${urgent ? ` · 급한 일 ${urgent}` : ''}</span></div>`;
    }).join('');
  }

  $('#summary').addEventListener('click', (e) => {
    const b = e.target.closest('[data-qcheck]'); if (!b) return;
    const id = b.dataset.qcheck, dk = ymd(today0()), doneMap = get('kid-linkdone', {});
    const ds = new Set(doneMap[dk] || []); if (ds.has(id)) ds.delete(id); else ds.add(id);
    doneMap[dk] = [...ds]; set('kid-linkdone', doneMap); recordChange('L_' + dk.replace(/-/g, '') + '_' + sk(id), ds.has(id)); render();
  });

  $('#summary').addEventListener('click', (e) => { const sb = e.target.closest('[data-say]'); if (!sb || !window.speechSynthesis) return; const u = new SpeechSynthesisUtterance(sb.dataset.say); u.lang = 'en-US'; u.rate = 0.85; speechSynthesis.cancel(); speechSynthesis.speak(u); });

  function render() {
    renderSummary();
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const items = allItems().sort(sortItems);
    let html = '';
    if (tab === 'today') {
      const prepAll = items.filter(prepNow);
      const near = items.filter((i) => { const d = diff(i.due); return d !== null && d <= 1 && !prepNow(i); });
      const week = items.filter((i) => { const d = diff(i.due); return d !== null && d >= 2 && d <= 7 && !prepNow(i); });
      html += groupHTML(prepTitle(), prepAll.filter((i) => !isDone(i.id)));
      for (const k of Object.keys(CAT)) html += groupHTML(CAT[k], near.filter((i) => i.cat === k && !isDone(i.id)));
      html += groupHTML('이번 주 다가오는 일', week.filter((i) => !isDone(i.id)));
      html += groupHTML('완료', [...prepAll, ...near, ...week].filter((i) => isDone(i.id)), false);
      if (!html) html = '<div class="empty">오늘·내일 할 일이 없어요 🎉</div>';
    } else if (tab === 'sources') {
      html = `<div class="group"><h3><span>연결 상태</span><span>${esc(fmtAsOf())}</span></h3>` +
        data.sources.map((s) => `<div class="src"><span class="dot ${s.status}"></span><div><div class="name">${esc(s.name)} <span class="tag">${CAT[s.cat]}</span></div><div class="note">${{ ok: '자동 수집 중', login: '로그인 필요', app: '앱 전용' }[s.status]} · ${esc(s.note)}</div></div>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">열기 ›</a>` : ''}</div>`).join('') +
        `</div><p class="hint">● 초록: Aside가 매일 자동으로 모아요 &nbsp;● 노랑: 한 번 로그인해 두면 자동 수집으로 바뀌어요 &nbsp;● 회색: 휴대폰 앱 전용이라 자동 수집이 안 돼요. 받은 공지나 카톡을 복사해서 오른쪽 아래 ＋ 버튼에 붙여넣으면 줄마다 할 일로 나눠 넣어요.</p>
        <p class="hint">🔔 버튼으로 알림을 켜면, 앱을 열 때와 열어둔 동안 30분마다 오늘·내일 할 일과 새 소식을 알려줘요. 휴대폰에서는 브라우저 메뉴의 '홈 화면에 추가'로 앱처럼 설치하세요.</p>
        <p class="hint"><button class="ghost" id="resetBtn">체크 기록 초기화</button></p>`;
    } else {
      const sel = items.filter((i) => i.cat === tab);
      const open = sel.filter((i) => !isDone(i.id));
      html += groupHTML('오늘·내일', open.filter((i) => { const d = diff(i.due); return d !== null && d <= 1; }));
      html += groupHTML('이번 주', open.filter((i) => { const d = diff(i.due); return d !== null && d >= 2 && d <= 7; }));
      html += groupHTML('다가오는 일', open.filter((i) => { const d = diff(i.due); return d !== null && d > 7; }));
      html += groupHTML('기한 없음', open.filter((i) => diff(i.due) === null));
      html += groupHTML('완료', sel.filter((i) => isDone(i.id)), false);
      if (!html) html = '<div class="empty">아직 항목이 없어요</div>';
    }
    $('#view').innerHTML = html;
  }

  function fmtAsOf() {
    if (!data.asOf) return '';
    const d = new Date(data.asOf);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 기준`;
  }

  // ---------- paste parser ----------
  function parseDue(line) {
    const t = today0();
    if (/모레/.test(line)) { t.setDate(t.getDate() + 2); return ymd(t); }
    if (/내일/.test(line)) { t.setDate(t.getDate() + 1); return ymd(t); }
    if (/오늘/.test(line)) return ymd(t);
    const m = line.match(/(\d{1,2})\s*[\/.월]\s*(\d{1,2})\s*일?/);
    if (m) {
      const mo = +m[1], da = +m[2];
      if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
        let y = t.getFullYear(); const cand = new Date(y, mo - 1, da);
        if (cand < t && (t - cand) / 86400000 > 60) y++;
        return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
      }
    }
    return '';
  }
  function addFromText(text, cat, src, due) {
    const lines = text.split(/\n+/).map((l) => l.replace(/^[\s\-*•·▶▷☞※\d.)]+/, '').trim()).filter((l) => l.length >= 2);
    const man = get(LS.manual, []);
    for (const l of lines) man.push({ id: 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), cat, src, kind: 'task', title: l.slice(0, 120), due: due || parseDue(l), pri: /필수|중요|꼭|마감|급/.test(l) ? 'high' : 'mid', note: '', manual: true });
    set(LS.manual, man);
    toast(`${lines.length}개 추가했어요`);
    render();
  }

  // ---------- notifications ----------
  async function notify(title, body, tag) {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) return reg.showNotification(title, { body, tag, icon: 'icon-192.png', badge: 'icon-192.png' });
      return new Notification(title, { body, tag, icon: 'icon-192.png' });
    } catch {}
  }
  function checkAlerts() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const key = ymd(today0());
    const sent = get(LS.notified, {});
    if (sent.day !== key) { sent.day = key; sent.ids = []; }
    const due = allItems().filter((i) => i.kind !== 'info' && !isDone(i.id) && (() => { const d = diff(i.due); return d !== null && d <= 1; })() && !sent.ids.includes(i.id));
    if (due.length) {
      const lines = due.slice(0, 4).map((i) => `· [${CAT[i.cat]}] ${i.title}`).join('\n');
      notify(`오늘·내일 할 일 ${due.length}개`, lines + (due.length > 4 ? `\n외 ${due.length - 4}개` : ''), 'kid-due');
      sent.ids.push(...due.map((i) => i.id));
    }
    if (newIds.size && !sent.newAt?.includes(data.asOf)) {
      const n = data.items.filter((i) => newIds.has(i.id));
      notify(`새 소식 ${n.length}건`, n.slice(0, 4).map((i) => `· [${CAT[i.cat]}] ${i.title}`).join('\n'), 'kid-new');
      sent.newAt = data.asOf;
    }
    set(LS.notified, sent);
  }

  // ---------- detail ----------
  let detId = null;
  const LINKNAME = (u) => /ixl\.com/.test(u) ? 'IXL 열기' : /band\.us/.test(u) ? '밴드에서 보기' : /classdojo/.test(u) ? 'ClassDojo에서 보기' : /ealimi/.test(u) ? 'e알리미에서 보기' : /youtu/.test(u) ? '영상 보기' : /outlook/.test(u) ? '메일 열기' : /teams/.test(u) ? 'Teams 열기' : /tasktalk/.test(u) ? 'tasktalk 열기' : /calendar\.google/.test(u) ? '캘린더 열기' : '원문 열기';
  function openDetail(id) {
    const i = allItems().find((x) => x.id === id); if (!i) return;
    detId = id;
    const [cls, lbl] = ddLabelFor(i) || [];
    $('#detTags').innerHTML = (lbl ? `<span class="dd ${cls}">${lbl}</span>` : '') + `<span class="tag">${CAT[i.cat]}</span><span class="tag">${esc(SRCNAME[i.src] || i.src)}</span>${whoTag(i.id)}` + (i.kind === 'info' ? '<span class="tag">일정</span>' : '');
    $('#detTitle').textContent = i.title;
    $('#detNote').textContent = i.note || '';
    $('#detBody').textContent = i.detail || '';
    const src = data.sources.find((s) => s.id === i.src);
    const links = [i.link, i.link2, !i.link && src?.url].filter(Boolean);
    $('#detLinks').innerHTML = links.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${LINKNAME(u)} ›</a>`).join('');
    $('#detToggle').textContent = isDone(id) ? '완료 취소' : (i.kind === 'info' ? '확인했어요' : '완료 체크');
    $('#det').showModal();
  }
  $('#detClose').addEventListener('click', () => $('#det').close());
  $('#det').addEventListener('click', (e) => { if (e.target.id === 'det') $('#det').close(); });
  $('#detToggle').addEventListener('click', () => { if (detId) toggle(detId); $('#det').close(); });

  // ---------- quick add: clipboard / share link ----------
  async function prefillClipboard() {
    try {
      const t = (await navigator.clipboard.readText() || '').trim();
      const ta = $('#dlgForm textarea[name=text]');
      if (t && t.length >= 4 && !ta.value) { ta.value = t; ta.select(); toast('복사해 둔 내용을 붙여 넣었어요'); }
    } catch {}
  }
  function openAddWith(text, src) {
    $('#dlgForm').reset();
    const c = tab in CAT ? tab : 'school';
    $('#dlgForm').querySelector('input[value="' + c + '"]').checked = true;
    $('#dlgForm textarea[name=text]').value = text;
    if (src) $('#dlgForm select[name=src]').value = src;
    $('#dlg').showModal();
  }
  function handleHashAdd() {
    const m = location.hash.match(/^#add=([^&]*)(?:&src=(\w+))?/);
    if (!m) return;
    let text = ''; try { text = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch { text = m[1]; }
    history.replaceState(null, '', location.pathname + location.search);
    if (text.trim()) openAddWith(text.trim(), m[2]);
  }

  // ---------- 가족 공유 동기화 (Firebase Realtime Database REST) ----------
  let syncOk = null;
  function sk(s) { return String(s).replace(/[^A-Za-z0-9_-]/g, '_'); }
  function syncCfg() { return data && data.sync && data.sync.url ? data.sync : null; }
  function metaMap() { return get('kid-meta', {}); }
  function hhmm(t) { const d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function whoTag(id) {
    if (!isDone(id)) return '';
    const m = metaMap()[sk(id)]; if (!m || !m.d) return '';
    return '<span class="tag who">✓ ' + esc(m.by || '체크') + ' ' + hhmm(m.t) + '</span>';
  }
  function linkWho(dk, id) { const m = metaMap()['L_' + dk.replace(/-/g, '') + '_' + sk(id)]; return m && m.d ? (m.by ? m.by + ' ' : '') + hhmm(m.t) : ''; }
  function setSyncState(ok) { if (syncOk !== ok) { syncOk = ok; renderWho(); } }
  function recordChange(key, done) {
    const m = metaMap(); m[key] = { t: Date.now(), d: !!done, by: get('kid-who', '') || '' }; set('kid-meta', m);
    pushChange(key, m[key]);
  }
  async function pushChange(key, v) {
    const c = syncCfg(); if (!c) return;
    try { const r = await fetch(c.url + '/kid/' + c.key + '/' + key + '.json', { method: 'PUT', body: JSON.stringify(v) }); setSyncState(r.ok); } catch { setSyncState(false); }
  }
  function applyMeta(k, v, checks, ld) {
    if (k.startsWith('L_')) {
      const parts = k.split('_'); const d8 = parts[1]; const id = parts.slice(2).join('_');
      const dk = d8.slice(0, 4) + '-' + d8.slice(4, 6) + '-' + d8.slice(6, 8);
      const s = new Set(ld[dk] || []); if (v.d) s.add(id); else s.delete(id); ld[dk] = [...s];
    } else if (v.d) checks[k] = new Date(v.t).toISOString(); else delete checks[k];
  }
  function migrateMeta() {
    const m = metaMap(); const checks = get('kid-checks', {}); const ld = get('kid-linkdone', {}); let ch = false;
    for (const [id, iso] of Object.entries(checks)) { const k = sk(id); if (!m[k]) { m[k] = { t: Date.parse(iso) || Date.now(), d: true, by: '' }; ch = true; } }
    for (const [dk, ids] of Object.entries(ld)) for (const id of ids) { const k = 'L_' + dk.replace(/-/g, '') + '_' + sk(id); if (!m[k]) { m[k] = { t: Date.now(), d: true, by: '' }; ch = true; } }
    if (ch) set('kid-meta', m);
  }
  async function pullRemote() {
    const c = syncCfg(); if (!c) return;
    try {
      const resp = await fetch(c.url + '/kid/' + c.key + '.json', { cache: 'no-store' });
      if (!resp.ok) throw new Error('http ' + resp.status);
      const remote = (await resp.json()) || {};
      const m = metaMap(); const checks = get('kid-checks', {}); const ld = get('kid-linkdone', {});
      let changed = false;
      for (const [k, v] of Object.entries(remote)) { const loc = m[k]; if (!loc || v.t > loc.t) { m[k] = v; applyMeta(k, v, checks, ld); changed = true; } }
      for (const [k, v] of Object.entries(m)) if (!remote[k] || remote[k].t < v.t) pushChange(k, v);
      if (changed) { set('kid-meta', m); set('kid-checks', checks); set('kid-linkdone', ld); render(); }
      setSyncState(true);
    } catch { setSyncState(false); }
  }
  function renderWho() {
    let bar = document.getElementById('whoBar');
    if (!bar) {
      const s = document.getElementById('summary'); if (!s) return;
      bar = document.createElement('div'); bar.id = 'whoBar'; bar.className = 'whobar'; s.parentNode.insertBefore(bar, s);
      bar.addEventListener('click', (e) => {
        const b = e.target.closest('[data-who]'); if (b) { set('kid-who', b.dataset.who); renderWho(); return; }
        if (e.target.closest('[data-change]')) { localStorage.removeItem('kid-who'); renderWho(); }
      });
    }
    const who = get('kid-who', '');
    if (!who) bar.innerHTML = '<span class="wq">누가 보고 있나요?</span>' + ['엄마', '아빠', '정임'].map((n) => '<button data-who="' + n + '">' + n + '</button>').join('');
    else bar.innerHTML = '<span class="sdot' + (syncOk === false ? ' off' : '') + '"></span><span class="wt">' + esc(who) + ' · ' + (syncOk === false ? '연동 안 됨(이 폰에만 저장)' : '가족과 같이 보는 중') + '</span><button class="ghost" data-change="1">바꾸기</button>';
  }
  let __tick = 0, __first = false;
  setInterval(() => {
    if (document.hidden || !syncCfg()) return;
    if (!__first) { __first = true; migrateMeta(); pullRemote(); return; }
    if (++__tick % 4 === 0) pullRemote();
  }, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && syncCfg()) pullRemote(); });

  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2000); }

  // ---------- load ----------
  async function load(pass, quiet) {
    const d = await decrypt(pass);
    data = d;
    const seen = get(LS.seen, null);
    newIds = new Set(seen ? d.items.filter((i) => !seen.includes(i.id)).map((i) => i.id) : []);
    set(LS.seen, d.items.map((i) => i.id));
    $('#meta').textContent = fmtAsOf() + ' · 오늘 학교에서 챙길 것';
    render();
    if (!quiet) toast(newIds.size ? `새 항목 ${newIds.size}개` : '최신 상태예요');
    checkAlerts();
  }

  async function unlock(pass) {
    try {
      await load(pass, true);
      localStorage.setItem(LS.pass, pass);
      $('#lock').classList.add('hidden');
      $('#app').classList.remove('hidden');
      handleHashAdd();
    } catch (e) { $('#lockErr').textContent = '패스코드가 맞지 않아요'; }
  }

  // ---------- events ----------
  $('#lockForm').addEventListener('submit', (e) => { e.preventDefault(); unlock($('#pass').value.trim()); });
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.tab; render(); window.scrollTo({ top: 0 }); } });
  $('#summary').addEventListener('click', (e) => { const s = e.target.closest('[data-go]'); if (s) { tab = s.dataset.go; render(); } });
  $('#view').addEventListener('click', (e) => {
    const it = e.target.closest('.item');
    if (e.target.id === 'resetBtn') { if (confirm('체크 기록을 모두 지울까요?')) { set(LS.checks, {}); render(); } return; }
    if (!it) return;
    const id = it.dataset.id; const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'toggle') return toggle(id);
    if (act === 'del') { set(LS.manual, get(LS.manual, []).filter((i) => i.id !== id)); return render(); }
    openDetail(id);
  });
  $('#syncBtn').addEventListener('click', () => load(localStorage.getItem(LS.pass)).catch(() => toast('불러오기 실패')));
  $('#notifBtn').addEventListener('click', async () => {
    if (!('Notification' in window)) return toast('이 브라우저는 알림을 지원하지 않아요');
    const p = await Notification.requestPermission();
    if (p === 'granted') { toast('알림을 켰어요'); set(LS.notified, {}); checkAlerts(); }
    else toast('알림이 차단돼 있어요. 브라우저 설정에서 허용해 주세요');
  });
  $('#fab').addEventListener('click', () => { $('#dlgForm').reset(); const c = tab in CAT ? tab : 'school'; $('#dlgForm').querySelector(`input[value="${c}"]`).checked = true; $('#dlg').showModal(); prefillClipboard(); });
  $('#dlg').addEventListener('close', () => {
    if ($('#dlg').returnValue !== 'save') return;
    const f = new FormData($('#dlgForm'));
    addFromText(f.get('text'), f.get('cat'), f.get('src'), f.get('due'));
  });

  setInterval(() => { const p = localStorage.getItem(LS.pass); if (p && !$('#app').classList.contains('hidden')) load(p, true).catch(() => {}); }, 30 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { const p = localStorage.getItem(LS.pass); if (p && !$('#app').classList.contains('hidden')) load(p, true).catch(() => {}); } });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(async (reg) => {
      try { if ('periodicSync' in reg) await reg.periodicSync.register('kid-refresh', { minInterval: 3 * 60 * 60 * 1000 }); } catch {}
    }).catch(() => {});
  }

  const saved = localStorage.getItem(LS.pass);
  if (saved) unlock(saved);
})();
