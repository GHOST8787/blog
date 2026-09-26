// 我的會議：清單、額度、本機快取、建立會議表單。沒有 ?id= 的首頁才會用到。
import {
    ref, onValue, push, update, set, get, serverTimestamp,
    app, db, auth, S, T, LANG, $, $state, $home, $poll, pollId, MAX_POLLS,
    STATES, ICONS, SEGCLS, SEGCOLOR,
    esc, fmtRange, fmtDate, sortedSlots, displayName, voterUids, voteOf,
    isOrganizer, votingOpen, showState, addMinutes,
    googleName, loadSavedNames, savedName, watch, dropWatches
} from './core.js';

// 換身分時由 app.js 呼叫：清掉首頁自己的旗標，讓清單監聽可以重新掛。
export function resetHome() {
    joinedAttached = false;
    $('mt-joined').innerHTML = '';
    $('mt-joined-wrap').classList.add('hidden');
    $('mt-my-polls').innerHTML = '';
    $('mt-create').classList.add('hidden');
}

/* ===================== A. 我的會議 ===================== */
export function startHome() {
    $home.classList.remove('hidden');
    showState('');
    renderCreateSlots();

    // 先把上次看到的畫出來，畫面立刻有東西，同時標「更新中」
    const cached = readCache(S.me.uid);
    if (cached) {
        paintQuota(cached.active || 0);
        paintPolls(cached.list);
        setStale(true);
    } else {
        // 沒有這個帳號的快取。inline script 可能已經照上一個帳號畫了東西，先清掉。
        $('mt-my-polls').innerHTML = '';
        setStale(false);
    }

    let liveActive = cached ? (cached.active || 0) : 0;
    watch(`meet/users/${S.me.uid}/activeCount`, snap => {
        liveActive = snap.val() || 0;
        paintQuota(liveActive);
    });

    watch(`meet/users/${S.me.uid}/polls`, async snap => {
        showState('');            // 讀得到就把先前的權限錯誤訊息清掉
        const ids = Object.keys(snap.val() || {});
        // 三筆資料同時發，不要一筆等完再發下一筆（原本三個連續 await＝三趟往返）
        const rows = await Promise.all(ids.map(async id => {
            let m, v, s;
            try {
                const r = await Promise.all([
                    get(ref(db, `meet/polls/${id}/meta`)),
                    get(ref(db, `meet/polls/${id}/votes`)),
                    get(ref(db, `meet/polls/${id}/slots`)),
                ]);
                m = r[0].val(); v = r[1].val() || {}; s = r[2].val() || {};
            } catch (e) {
                return null;      // 這一場讀不到就跳過，不要讓整份清單跟著失敗
            }
            return m ? { id, meta: m, voters: Object.keys(v).length, slots: Object.keys(s).length,
                         lead: leadingSlot(s, v, m.lockedSlot, m.organizer) } : null;
        }));
        const list = rows.filter(Boolean).sort((a, b) => (b.meta.createdAt || 0) - (a.meta.createdAt || 0));
        paintPolls(list);
        setStale(false);
        writeCache(S.me.uid, list, liveActive);
    }, err => {
        // 登出之後這幾個監聽還掛在舊 uid 上，Firebase 立刻回拒絕；沒有身分就別報錯
        setStale(false);
        if (!S.me) { showState(''); return; }
        showState(T.homeDenied + ' (' + err.code + ')');
    });

    // 清單要按了才載入。回過的會議可能很多，每一場都要讀一次 S.meta，
    // 一進首頁就全抓會拖慢頁面，也讀了使用者當下沒有要看的東西。
    const jb = $('mt-joined-btn');
    if (jb) jb.classList.toggle('hidden', !!S.me.isAnonymous);
}

// 我回過的會議：從 users/<uid>/joined 拿場次，會議被刪掉的不列
let joinedAttached = false;
async function renderJoined() {
    const wrap = $('mt-joined-wrap');
    if (!wrap || S.me.isAnonymous || joinedAttached) return;
    joinedAttached = true;      // 匿名 uid 每次都不同，留紀錄沒有意義
    watch(`meet/users/${S.me.uid}/joined`, async snap => {
        wrap.classList.remove('hidden');
        const entries = Object.entries(snap.val() || {});
        if (!entries.length) { $('mt-joined').innerHTML = emptyJoined(); return; }
        const rows = await Promise.all(entries.map(async ([id, at]) => {
            const m = (await get(ref(db, `meet/polls/${id}/meta`))).val();
            if (!m) {
                // 會議已經被刪掉，順手把自己這筆參加紀錄清掉，免得列表點下去是死連結
                update(ref(db), { [`meet/users/${S.me.uid}/joined/${id}`]: null }).catch(() => {});
                return null;
            }
            return { id, meta: m, at: typeof at === 'number' ? at : 0 };
        }));
        const list = rows.filter(Boolean).sort((a, b) => b.at - a.at);
        $('mt-joined').innerHTML = list.length ? list.map(renderJoinedRow).join('') : emptyJoined();
    }, err => console.warn('[meet] joined list failed', err.code));
}

function emptyJoined() {
    return `<div class="mt-card rounded-xl px-5 py-4 font-mono text-[11px] text-gray-600">${T.joinedNone}</div>`;
}

// 按鈕在使用者資訊列右邊：第一次按才去讀資料並展開，之後純開合
$('mt-joined-btn').addEventListener('click', () => {
    const wrap = $('mt-joined-wrap');
    if (wrap.classList.contains('hidden')) {
        renderJoined();
        wrap.classList.remove('hidden');
        wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        wrap.classList.add('hidden');
    }
});

function renderJoinedRow(p) {
    const done = p.meta.state !== 'open';
    const cls = done
        ? 'bg-accent-success/15 text-accent-success border border-accent-success/30'
        : 'bg-accent-purple/15 text-accent-purple border border-accent-purple/30';
    const when = p.at
        ? `${fmtDate(p.at)} ${new Date(p.at).toLocaleTimeString(T.timeLocale, { hour: '2-digit', minute: '2-digit' })}`
        : '—';
    return `<a href="meet.html?id=${encodeURIComponent(p.id)}" class="block mt-card rounded-xl p-4 sm:p-5 hover:border-white/10 transition">
        <div class="flex items-center gap-2 mb-1.5">
            <span class="font-mono text-[10px] text-gray-600">#${esc(p.id.slice(-6))}</span>
            <span class="font-mono text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap ${cls}">${done ? T.closed : T.open}</span>
        </div>
        <div class="text-white font-medium mb-1">${esc(p.meta.title)}</div>
        <div class="font-mono text-[11px] text-gray-500">${esc(p.meta.organizerName || '')} · ${T.submittedAt(when)}</div>
    </a>`;
}

/* ===== 首頁卡片用的「目前預計時間」：票最多的時段，定案了就顯示定案那個 ===== */
/* ---- 首頁清單快取 ----
   RTDB 的 Web SDK 沒有磁碟快取（persistence 只有 Android／iOS 有），
   分頁一關記憶體快取就沒了，所以自己留一份最後看到的清單：
   下次進來先把它畫出來，伺服器資料回來再整份覆蓋。 */
const CACHE_VER = 2;                       // 改過快取格式就加一，舊的自然失效
const cacheKey = uid => `mt-home-v${CACHE_VER}-${uid}`;
const LAST_UID_KEY = 'mt-last-uid';        // meet.html 的 inline script 靠這個知道要讀誰的快取

function readCache(uid) {
    try {
        const o = JSON.parse(localStorage.getItem(cacheKey(uid)) || 'null');
        return o && Array.isArray(o.list) ? o : null;
    } catch (e) { return null; }   // 存壞了就當作沒有，不擋畫面
}
function writeCache(uid, list, active) {
    // html 是給 inline script 用的：它沒有 renderPollRow，只能直接塞現成的字串
    try {
        localStorage.setItem(LAST_UID_KEY, uid);
        localStorage.setItem(cacheKey(uid), JSON.stringify({
            at: Date.now(), list, active, html: list.map(renderPollRow).join('')
        }));
    }
    catch (e) { /* 無痕視窗或配額滿，快取只是加速，失敗不影響功能 */ }
}
function dropCache(uid) {
    try {
        localStorage.removeItem(cacheKey(uid));
        // 也要清掉 last-uid，否則登出後 inline script 還會畫上一個人的清單
        if (localStorage.getItem(LAST_UID_KEY) === uid) localStorage.removeItem(LAST_UID_KEY);
    } catch (e) { }
}
/* 刪掉一場之後立刻把它從快取拿掉，
   免得下次進來又從快取閃一下已經不存在的會議 */
function forgetFromCache(uid, pollId) {
    const c = readCache(uid);
    if (!c) return;
    writeCache(uid, c.list.filter(p => p.id !== pollId), Math.max(0, (c.active || 0) - 1));
}

function setStale(on) {
    const el = $('mt-stale');
    if (el) el.classList.toggle('hidden', !on);
}
function paintPolls(list) {
    $('mt-my-polls').innerHTML = list.length
        ? list.map(renderPollRow).join('')
        : `<div class="text-center text-gray-600 font-mono text-sm py-8">${T.noPolls}</div>`;
}
function paintQuota(n) {
    $('mt-quota-used').textContent = n;
    $('mt-quota-bar').style.width = Math.min(100, n / MAX_POLLS * 100) + '%';
}

function leadingSlot(slotsObj, votesObj, lockedId, organizerUid) {
    const ids = Object.keys(slotsObj || {});
    if (!ids.length) return null;
    if (lockedId && slotsObj[lockedId]) return { slot: slotsObj[lockedId], locked: true };
    const voters = Object.entries(votesObj || {}).filter(e => e[0] !== organizerUid).map(e => e[1]);
    let bestId = null, by = -1, bn = -1;
    ids.sort((a, b) => slotsObj[a].start - slotsObj[b].start).forEach(id => {
        let y = 0, n = 0;
        voters.forEach(v => { if (v[id] === 'yes') y++; else if (v[id] === 'notice') n++; });
        if (y > by || (y === by && n > bn)) { by = y; bn = n; bestId = id; }
    });
    if (by <= 0 && bn <= 0) return null;
    return { slot: slotsObj[bestId], locked: false };
}

function renderPollRow(p) {
    const done = p.meta.state !== 'open';
    const cls = done
        ? 'bg-accent-success/15 text-accent-success border border-accent-success/30'
        : 'bg-accent-purple/15 text-accent-purple border border-accent-purple/30';
    const dl = p.meta.deadline ? `${T.deadlineLabel} ${fmtDate(p.meta.deadline)}` : T.noDeadline;
    const lead = p.lead
        ? (() => { const r = fmtRange(p.lead.slot.start, p.lead.slot.end); const txt = `${r.day} ${r.time}`;
                   return `<div class="font-mono text-[11px] ${p.lead.locked ? 'text-accent-success' : 'text-accent-purple'}"><i class="fa-regular fa-calendar-check mr-1.5"></i>${p.lead.locked ? T.lockedFmt(txt) : T.leadFmt(txt)}</div>`; })()
        : `<div class="font-mono text-[11px] text-gray-600"><i class="fa-regular fa-calendar mr-1.5"></i>${T.leadNone}</div>`;
    return `<div class="js-row cursor-pointer mt-card rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 hover:border-white/10 transition" data-id="${p.id}">
        <div class="min-w-[180px]">
            <div class="flex items-center gap-2 mb-1.5">
                <span class="font-mono text-[10px] text-gray-600">#${esc(p.id.slice(-6))}</span>
                <span class="font-mono text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap ${cls}">${done ? T.closed : T.open}</span>
            </div>
            <div class="text-white font-medium mb-1">${esc(p.meta.title)}</div>
            ${lead}
        </div>
        <div class="flex flex-col items-start sm:items-end gap-2 shrink-0">
            <div class="flex items-center gap-2">
            <button class="js-copy px-3 py-2 rounded-lg border border-white/10 text-[11px] font-mono text-gray-400 hover:text-white transition" data-id="${p.id}"><i class="fa-regular fa-copy mr-1"></i>${T.copyBtn}</button>
            <button class="js-del px-3 py-2 rounded-lg border border-white/10 text-[11px] font-mono text-gray-600 hover:text-red-400 transition" data-id="${p.id}"><i class="fa-regular fa-trash-can"></i></button>
            </div>
            <div class="font-mono text-[11px] text-gray-500">${T.rowMeta(p.voters, p.slots)} · ${dl}</div>
        </div>
    </div>`;
}

// 刪一場會議要動三個地方：會議本體、我的會議清單、還在開放中的話把 activeCount 減一。
// activeCount 的規則是「只准跟現值差 ±1」，基準一定要現讀，不能拿畫面上的。
async function deletePollPayload(id) {
    const m = (await get(ref(db, `meet/polls/${id}/meta`))).val();
    const cur = (await get(ref(db, `meet/users/${S.me.uid}/activeCount`))).val() || 0;
    const payload = {
        [`meet/polls/${id}`]: null,
        [`meet/users/${S.me.uid}/polls/${id}`]: null
    };
    if (m && m.state === 'open' && cur > 0) payload[`meet/users/${S.me.uid}/activeCount`] = cur - 1;
    return payload;
}

$('mt-my-polls').addEventListener('click', async e => {
    const copy = e.target.closest('.js-copy');
    if (copy) {
        const url = `${location.origin}${location.pathname}?id=${copy.dataset.id}`;
        try { await navigator.clipboard.writeText(url); copy.innerHTML = T.copied; }
        catch { window.prompt(T.copyPrompt, url); }
        setTimeout(() => { copy.innerHTML = `<i class="fa-regular fa-copy mr-1"></i>${T.copyBtn}`; }, 1600);
        return;
    }
    const del = e.target.closest('.js-del');
    if (del) {
        if (!window.confirm(T.confirmDelete)) return;
        const id = del.dataset.id;
        try {
            await update(ref(db), await deletePollPayload(id));
            forgetFromCache(S.me.uid, id);
        }
        catch (err) { window.alert(T.deleteFailed + err.message); }
        return;   // 刪掉就停在首頁，不要再往下掉進 js-row 跳進剛刪掉的會議
    }
    const row = e.target.closest('.js-row');
    if (row) location.href = `meet.html?id=${encodeURIComponent(row.dataset.id)}`;
});

// --- 建立會議 ---
$('mt-new-btn').addEventListener('click', async () => {
    $('mt-create').classList.toggle('hidden');
    if ($('mt-create').classList.contains('hidden')) return;
    $('c-title').focus();
    // 顯示名稱預設帶上次當發起人用過的，沒用過才用 Google 帳號的名字
    if (!$('c-organizer-name').value) $('c-organizer-name').value = await savedName('organizerName');
});

$('c-cancel').addEventListener('click', () => $('mt-create').classList.add('hidden'));

function slotRowHtml(date, start, end) {
    return `<div class="flex flex-wrap items-center gap-2 js-slot-row">
        <input type="date" value="${date}" class="mt-input rounded-lg px-3 py-2 text-sm font-mono js-sd">
        <input type="time" value="${start}" class="mt-input rounded-lg px-3 py-2 text-sm font-mono js-st">
        <span class="text-gray-600 font-mono text-sm">–</span>
        <input type="time" value="${end}" class="mt-input rounded-lg px-3 py-2 text-sm font-mono js-se">
        <button class="js-rm w-9 h-9 rounded-lg border border-white/10 text-gray-600 hover:text-red-400 transition text-xs"><i class="fa-regular fa-trash-can"></i></button>
    </div>`;
}
function renderCreateSlots() {
    const d = new Date(Date.now() + 86400000);
    const iso = d.toISOString().slice(0, 10);
    const dur = Number($('c-duration').value) || 60;
    $('c-slots').innerHTML = slotRowHtml(iso, '10:00', addMinutes('10:00', dur))
                           + slotRowHtml(iso, '14:00', addMinutes('14:00', dur));
}
$('c-add-slot').addEventListener('click', () => {
    const last = $('c-slots').querySelector('.js-slot-row:last-child .js-sd');
    const d = last ? last.value : new Date().toISOString().slice(0, 10);
    const dur = Number($('c-duration').value) || 60;
    $('c-slots').insertAdjacentHTML('beforeend', slotRowHtml(d, '16:00', addMinutes('16:00', dur)));
});

// 改開始時間 → 結束時間跟著往後推一個會議長度；改長度 → 全部重算
$('c-slots').addEventListener('change', e => {
    const st = e.target.closest('.js-st');
    if (!st) return;
    const row = st.closest('.js-slot-row');
    row.querySelector('.js-se').value = addMinutes(st.value, Number($('c-duration').value) || 60);
});
$('c-duration').addEventListener('change', () => {
    const dur = Number($('c-duration').value) || 60;
    $('c-slots').querySelectorAll('.js-slot-row').forEach(row => {
        row.querySelector('.js-se').value = addMinutes(row.querySelector('.js-st').value, dur);
    });
});
$('c-slots').addEventListener('click', e => {
    const rm = e.target.closest('.js-rm');
    if (rm && $('c-slots').querySelectorAll('.js-slot-row').length > 1) rm.closest('.js-slot-row').remove();
});

$('c-submit').addEventListener('click', async () => {
    const btn = $('c-submit');
    const err = $('c-error');
    err.textContent = '';

    const title = $('c-title').value.trim();
    if (!title) { err.textContent = T.titleRequired; return; }

    const durationMin = Number($('c-duration').value);
    const rows = [...$('c-slots').querySelectorAll('.js-slot-row')];
    const slotsObj = {};
    const seen = new Set();
    for (const r of rows) {
        const d = r.querySelector('.js-sd').value;
        const t = r.querySelector('.js-st').value;
        const te = r.querySelector('.js-se').value;
        if (!d || !t || !te) continue;
        const start = new Date(`${d}T${t}`).getTime();
        let end = new Date(`${d}T${te}`).getTime();
        if (end <= start) end += 86400000;   // 跨午夜
        const sig = `${start}-${end}`;
        if (seen.has(sig)) { err.textContent = T.dupSlot; btn.disabled = false; return; }
        seen.add(sig);
        const key = push(ref(db, 'meet/tmp')).key;
        slotsObj[key] = { start, end, createdAt: serverTimestamp() };
    }
    if (!Object.keys(slotsObj).length) { err.textContent = T.slotRequired; return; }

    btn.disabled = true;
    let cur = 0;
    try {
        cur = (await get(ref(db, `meet/users/${S.me.uid}/activeCount`))).val() || 0;
    } catch (e1) {
        console.error('[meet] read activeCount failed', e1);
        err.textContent = T.createFailed + e1.message;
        btn.disabled = false;
        return;
    }
    if (cur >= MAX_POLLS) { err.textContent = T.quotaFull(MAX_POLLS); btn.disabled = false; return; }

    const dlv = $('c-deadline').value;
    const newId = push(ref(db, 'meet/polls')).key;
    const orgName = $('c-organizer-name').value.trim().slice(0, 40) || googleName();
    const payload = {
        [`meet/polls/${newId}/meta`]: {
            organizer: S.me.uid,
            organizerName: orgName,
            title,
            note: $('c-note').value.trim(),
            place: $('c-place').value.trim() || T.defaultPlace,
            durationMin,
            deadline: dlv ? new Date(`${dlv}T23:59`).getTime() : 0,
            allowGuestSlots: $('c-guest-slots').checked,
            state: 'open',
            createdAt: serverTimestamp()
        },
        [`meet/polls/${newId}/slots`]: slotsObj,
        [`meet/polls/${newId}/private/organizerNote`]: $('c-private').value.trim(),
        [`meet/users/${S.me.uid}/activeCount`]: cur + 1,
        [`meet/users/${S.me.uid}/polls/${newId}`]: true,
        [`meet/users/${S.me.uid}/organizerName`]: orgName
    };

    try {
        await update(ref(db), payload);
        location.href = `meet.html?id=${newId}`;
    } catch (e2) {
        console.error('[meet] create failed', e2);
        err.textContent = T.createFailed + e2.message;
        btn.disabled = false;
    }
});
