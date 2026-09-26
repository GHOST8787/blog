// 投票頁：入口畫面、參與者三選一、發起人結果檢視。帶 ?id= 才會用到。
import {
    ref, onValue, push, update, set, get, serverTimestamp,
    app, db, auth, S, T, LANG, $, $state, $home, $poll, pollId, MAX_POLLS,
    STATES, ICONS, SEGCLS, SEGCOLOR,
    esc, fmtRange, fmtDate, sortedSlots, displayName, voterUids, voteOf,
    isOrganizer, votingOpen, showState, addMinutes,
    googleName, loadSavedNames, savedName, watch, dropWatches
} from './core.js';

// 只有投票頁用得到的狀態，不進 core 的共用區
let pinned = null;             // 名單浮層釘住的那一格
let draft = {};                // 按了但還沒送出的選擇，送出前只動這裡不寫資料庫
let submittedOnce = false;     // 這個身分在這場已經送出過

// 換身分時由 app.js 呼叫：把這一頁的旗標與草稿全部歸零，讓監聽可以重新掛。
export function resetPoll() {
    publicAttached = false;
    metaLoaded = false;
    attached = null;
    orgNoteLoaded = false;
    clearTimeout(loadTimer);
    loadTimer = null;
    pinned = null;
    draft = {};
    submittedOnce = false;
    hideTip();
    $('mt-gone').classList.add('hidden');
    $('mt-identity').classList.add('hidden');
    $('mt-identity').classList.remove('flex');
}

// 參與者自己改要顯示的名字（發起人看到的就是這個）
$('mt-name-save').addEventListener('click', async () => {
    const name = $('mt-name').value.trim();
    if (!name || !S.me || !pollId) return;
    try {
        // 發起人的名字放在 S.meta（所有拿到連結的人都要看得到）；
        // 參與者的放在 private（只有發起人看得到）。
        // 兩種身分各自再記回帳號一份，下次開新會議／回別人的問卷就直接帶出來。
        const kept = name.slice(0, 40);
        const payload = isOrganizer()
            ? { [`meet/polls/${pollId}/meta/organizerName`]: kept }
            : Object.fromEntries(Object.entries(participantRecord(name))
                .map(([k, v]) => [`meet/polls/${pollId}/private/participants/${S.me.uid}/${k}`, v]));
        if (!S.me.isAnonymous) {
            payload[`meet/users/${S.me.uid}/${isOrganizer() ? 'organizerName' : 'participantName'}`] = kept;
        }
        await update(ref(db), payload);
        loadSavedNames();   // 下一次要帶的就是這個
        $('mt-name-msg').textContent = T.nameSaved;
        setTimeout(() => { $('mt-name-msg').textContent = ''; }, 1600);
    } catch (err) {
        $('mt-name-msg').textContent = T.nameFailed + err.message;
    }
});

/* ===================== B. 投票頁 ===================== */
let publicAttached = false;
let loadTimer = null;
let metaLoaded = false;


// S.meta / S.slots / S.tally 的規則是「拿到連結就能讀」（連結 id 不可猜＝入場券），
// 所以不等登入就先把內容畫出來。S.votes 與 private 仍受保護，由 attachRole() 依身分掛。
export function attachPublic() {
    if (publicAttached) return;
    publicAttached = true;

    // 超過 3 秒還沒有結果才顯示提示，不要一進頁面就閃一次「載入中」
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => { if (!S.meta) showState(T.loading); }, 3000);

    watch(`meet/polls/${pollId}/meta`, snap => {
        clearTimeout(loadTimer);
        S.meta = snap.val();
        metaLoaded = true;
        decidePollView();
    }, err => {
        // 未登入而且被拒＝規則還沒開放公開讀，不報錯，登入後由 boot() 重掛；
        // 已登入還被拒才是真的權限問題
        clearTimeout(loadTimer);
        showState('');   // 3 秒提示可能已經冒出來了，安靜等登入時不要讓它掛著
        publicAttached = false;
        if (!S.me) return;
        console.error('[meet] S.meta read failed', err);
        showState(T.denied + ' (' + err.code + ')');
    });

    watch(`meet/polls/${pollId}/slots`, snap => {
        S.slots = snap.val() || {};
        // 發起人刪掉的時段要從草稿裡拿掉。留著的話 hasUnsaved() 永遠是 true，
        // 送出時又會寫一張指向不存在時段的票，被 .validate 整包退掉。
        Object.keys(draft).forEach(id => { if (!S.slots[id]) delete draft[id]; });
        renderAll();
    }, () => {});

    // 統計原本掛在 attachParticipant 裡，公開之後看的人不需要身分
    watch(`meet/polls/${pollId}/tally`, s => { S.tally = s.val() || {}; renderAll(); }, () => {});
}

function attachRole() {
    if (!S.me || !S.meta) return;
    if (isOrganizer()) attachOrganizer(); else attachParticipant();
}

// 投票頁只有三種畫面，由「問卷還在不在 × 有沒有身分」決定，選定就停住不反覆跳：
// 問卷沒了 → 已被移除；沒身分 → 入口畫面（問卷名稱＋選登入或訪客）；有身分 → 投票畫面
export function decidePollView() {
    if (!metaLoaded || !S.authResolved) return;   // 兩邊都回來才決定，避免畫面先跳一種再換
    const $gate = $('mt-gate');
    if (!S.meta) {
        showState('');
        $poll.classList.add('hidden');
        $gate.classList.add('hidden');
        $('mt-gone').classList.remove('hidden');
        return;
    }
    showState('');
    $('mt-gone').classList.add('hidden');
    if (!S.me) {
        $('mt-gate-title').textContent = S.meta.title || '';
        $('mt-gate-org').textContent = S.meta.organizerName ? T.orgPrefix + S.meta.organizerName : '';
        $poll.classList.add('hidden');
        $gate.classList.remove('hidden');
        return;
    }
    $gate.classList.add('hidden');
    $poll.classList.remove('hidden');
    attachRole();
    renderPollHeader();
    renderAll();
}

let attached = null;
function attachOrganizer() {
    if (attached === 'org') return;
    attached = 'org';
    watch(`meet/polls/${pollId}/votes`, s => {
        S.votes = s.val() || {};
        renderAll();
        syncTally();          // 發起人看得到全量票，順便把統計節點校正回真值
    });
    watch(`meet/polls/${pollId}/private/organizerNote`, s => {
        if (orgNoteLoaded) return;
        orgNoteLoaded = true;
        $('org-note').value = s.val() || '';
    }, () => {});
    watch(`meet/polls/${pollId}/private/participants`, s => { S.participants = s.val() || {}; renderAll(); });
    watch(`meet/polls/${pollId}/private/slotOwners`, s => { S.slotOwners = s.val() || {}; renderAll(); });
    // 發起人也能改自己在別人那邊顯示的名字，跟參與者同一張卡，只是存的位置不同
    $('mt-name').value = (S.meta && S.meta.organizerName) || googleName();
    $('mt-identity').classList.remove('hidden');
    $('mt-identity').classList.add('flex');
}
// 參與者那筆記錄的完整內容。匿名的人第一次寫進去就是整包，不會只有半筆。
function participantRecord(name) {
    // 只留顯示名稱與「是不是訪客」。email 存過但畫面從來沒用過，公司環境下
    // 等於白收同事的帳號資料，2026-09-26 拿掉。
    return { name, anon: !!S.me.isAnonymous };
}

function attachParticipant() {
    if (attached === 'part') return;
    attached = 'part';
    // 匿名訪客先不登記。只點進來看一眼的人不該出現在發起人的名單上，
    // 等他按了「儲存名字」或按了「送出」才建立這筆。登入身分有真名，照舊即時登記。
    $('mt-identity').classList.remove('hidden');
    $('mt-identity').classList.add('flex');
    if (S.me.isAnonymous) {
        $('mt-name').value = `${T.guest}${S.me.uid.slice(0, 4)}`;
    } else {
        // 帳號裡存過的「回覆時用的名字」優先，沒存過才用 Google 帳號的名字
        savedName('participantName').then(name => {
            $('mt-name').value = name;
            update(ref(db, `meet/polls/${pollId}/private/participants/${S.me.uid}`), participantRecord(name))
                .catch(err => console.warn('[meet] register participant failed', err.code));
        });
    }
    watch(`meet/polls/${pollId}/votes/${S.me.uid}`, s => {
        const mine = s.val() || {};
        S.votes = { [S.me.uid]: mine };
        // 資料庫裡已經有票，代表送出過；草稿以資料庫為準重新鋪一次
        submittedOnce = Object.keys(mine).length > 0;
        draft = { ...mine };
        renderAll();
    });
}

// 草稿跟已送出的差異，換算成 S.tally 每個時段的加減
function tallyDelta() {
    if (!S.me) return {};
    const committed = (S.votes[S.me.uid] || {});
    const delta = {};
    const bump = (slotId, key, n) => {
        if (!delta[slotId]) delta[slotId] = { yes: 0, notice: 0, no: 0 };
        delta[slotId][key] += n;
    };
    new Set([...Object.keys(committed), ...Object.keys(draft)]).forEach(slotId => {
        const before = committed[slotId] || null;
        const after = draft[slotId] || null;
        if (before === after) return;
        if (before) bump(slotId, before, -1);
        if (after) bump(slotId, after, +1);
    });
    return delta;
}

function hasUnsaved() {
    if (!S.me) return false;
    const committed = (S.votes[S.me.uid] || {});
    const keys = new Set([...Object.keys(committed), ...Object.keys(draft)]);
    for (const k of keys) {
        if ((committed[k] || null) !== (draft[k] || null)) return true;
    }
    return false;
}

// 會議頁右下角的紫色分享鈕
$('p-copy').addEventListener('click', async () => {
    const btn = $('p-copy');
    const url = `${location.origin}${location.pathname}?id=${pollId}`;
    try { await navigator.clipboard.writeText(url); btn.innerHTML = T.copied; }
    catch { window.prompt(T.copyManual, url); return; }
    setTimeout(() => { btn.innerHTML = `<i class="fa-regular fa-copy mr-1.5"></i>${T.copyShare}`; }, 1600);
});

/* ===== 公司端時段碼（MT1）：驗簽 → 還原候選時段 ===== */
const SLOT_CODE_SECRET = 'MTv1-ghost-ouo-slot-bridge';
const b64urlToBytes = s => {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
};
const bytesToB64url = b => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function decodeSlotCode(raw) {
    const parts = String(raw).trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'MT1') throw new Error('format');
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(SLOT_CODE_SECRET),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const full = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(parts[1])));
    if (bytesToB64url(full.slice(0, 16)) !== parts[2]) throw new Error('signature');
    let data;
    try { data = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]))); }
    catch { throw new Error('payload'); }
    if (!Array.isArray(data.s) || !data.s.length) throw new Error('empty');
    return data.s.slice(0, 20).map(p => ({ start: p[0] * 1000, end: p[1] * 1000 }));
}

const two = n => String(n).padStart(2, '0');
const dateVal = ms => { const d = new Date(ms); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };
const timeVal = ms => { const d = new Date(ms); return `${two(d.getHours())}:${two(d.getMinutes())}`; };

$('c-code-apply').addEventListener('click', async () => {
    const msg = $('c-code-msg');
    const raw = $('c-code').value.trim();
    msg.className = 'font-mono text-[10px] mt-2 text-red-400';
    if (!raw) { msg.textContent = T.codeEmpty; return; }
    let list;
    try { list = await decodeSlotCode(raw); }
    catch (err) { msg.textContent = T.codeError[err.message] || T.codeError.format; return; }
    $('c-slots').innerHTML = list.map(s => slotRowHtml(dateVal(s.start), timeVal(s.start), timeVal(s.end))).join('');
    msg.className = 'font-mono text-[10px] mt-2 text-accent-success';
    msg.textContent = T.codeOk(list.length);
});

/* ===== 發起人私人備註（存在 private/，參與者讀不到） ===== */
let orgNoteLoaded = false;
$('org-note-save').addEventListener('click', async () => {
    const msg = $('org-note-msg');
    msg.textContent = '';
    try {
        await set(ref(db, `meet/polls/${pollId}/private/organizerNote`), $('org-note').value.trim());
        msg.textContent = T.noteSaved;
    } catch (err) {
        msg.textContent = T.noteFailed + err.message;
    }
    setTimeout(() => { msg.textContent = ''; }, 2500);
});

function renderPollHeader() {
    $('p-id').textContent = 'POLL #' + pollId.slice(-6).toUpperCase();
    $('p-title').textContent = S.meta.title || '';
    $('p-note').textContent = S.meta.note || '';
    const on = S.meta.organizerName || 'Organizer';
    $('p-org-name').textContent = on;
    $('p-org-avatar').textContent = on.slice(0, 1);
    $('p-duration').innerHTML = S.meta.durationMin
        ? `<i class="fa-regular fa-clock mr-1.5"></i>${S.meta.durationMin} ${T.minutes}` : '';
    $('p-place').innerHTML = S.meta.place
        ? `<i class="fa-solid fa-location-dot mr-1.5"></i>${esc(S.meta.place)}` : '';
    $('p-deadline').innerHTML = S.meta.deadline
        ? `<i class="fa-regular fa-calendar-xmark mr-1.5"></i>${T.deadlineLabel} ${fmtDate(S.meta.deadline)}`
        : `<i class="fa-regular fa-calendar mr-1.5"></i>${T.noDeadline}`;
}

function renderAll() {
    if (!S.meta) return;
    const org = isOrganizer();
    $('organizer-view').classList.toggle('hidden', !org);
    $('participant-view').classList.toggle('hidden', org);
    $('mt-role-badge').textContent = org ? T.organizerRole : ((S.me && S.me.isAnonymous) ? T.guestBadge : T.participantRole);

    const canAdd = votingOpen() && (org || S.meta.allowGuestSlots === true);
    $('add-slot-card').classList.toggle('hidden', !canAdd);
    // 同一塊提議時段，依角色掛到對應清單底下（發起人在比例橫條下、參與者在時段卡下）
    const slotMount = $(org ? 'add-slot-mount-org' : 'add-slot-mount-part');
    const slotCard = $('add-slot-card');
    if (slotCard.parentNode !== slotMount) slotMount.appendChild(slotCard);

    const uids = voterUids();
    const replied = uids.filter(u => S.votes[u] && Object.keys(S.votes[u]).length).length;
    $('p-replied').innerHTML = org
        ? `<i class="fa-regular fa-user mr-1.5"></i>${T.repliedFmt(replied)}`
        : '';

    $('p-copy').classList.toggle('hidden', !org);
    $('org-note-card').classList.toggle('hidden', !org);   // 分享網址只有發起人能複製
    if (org) { renderBars(); renderVoters(); } else renderCards();
    renderVerdict();
}

// --- 發起人：比例橫條 ---
function countBy(slotId, state) { return listBy(slotId, state).length; }
function listBy(slotId, state) {
    return voterUids().filter(u => (voteOf(u, slotId) || 'pend') === state);
}
function bestSlotId() {
    let best = null, ty = -1, tn = -1;
    sortedSlots().forEach(s => {
        const y = countBy(s.id, 'yes'), n = countBy(s.id, 'notice');
        if (y > ty || (y === ty && n > tn)) { ty = y; tn = n; best = s.id; }
    });
    return best;
}

// 刪掉一個候選時段要一起清乾淨：時段本身、提議人、統計、以及所有人對這個時段的票。
// 定案在這個時段的話同時取消定案。
function deleteSlotPayload(slotId) {
    const payload = {
        [`meet/polls/${pollId}/slots/${slotId}`]: null,
        [`meet/polls/${pollId}/private/slotOwners/${slotId}`]: null,
        [`meet/polls/${pollId}/tally/${slotId}`]: null
    };
    Object.keys(S.votes).forEach(uid => {
        if (S.votes[uid] && S.votes[uid][slotId]) {
            payload[`meet/polls/${pollId}/votes/${uid}/${slotId}`] = null;
        }
    });
    if (S.meta && S.meta.lockedSlot === slotId) {
        payload[`meet/polls/${pollId}/meta/lockedSlot`] = null;
    }
    return payload;
}

function renderBars() {
    const headcount = voterUids().length;
    const total = headcount || 1;   // 寬度用的分母保底 1，顯示的分母用真實人數
    const best = bestSlotId();
    $('slot-bars').innerHTML = sortedSlots().map(s => {
        const c = { yes: countBy(s.id, 'yes'), notice: countBy(s.id, 'notice'), no: countBy(s.id, 'no'), pend: countBy(s.id, 'pend') };
        const isBest = s.id === best && !S.meta.lockedSlot;
        const isLocked = s.id === S.meta.lockedSlot;
        const r = fmtRange(s.start, s.end);

        const segs = ['yes', 'notice', 'no', 'pend'].filter(k => c[k] > 0).map(k =>
            `<div class="seg ${SEGCLS[k]}" style="width:${c[k] / total * 100}%" data-slot="${s.id}" data-state="${k}"></div>`
        ).join('');

        const badge = isLocked
            ? `<span class="ml-2 font-mono text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap bg-accent-success/15 text-accent-success border border-accent-success/30">${T.lockedBadge}</span>`
            : (isBest ? `<span class="ml-2 font-mono text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap bg-accent-purple/15 text-accent-purple border border-accent-purple/30">${T.bestBadge}</span>` : '');

        const owner = S.slotOwners[s.id];
        const by = (owner && owner !== S.meta.organizer)
            ? `<span class="font-mono text-[9px] text-gray-600 ml-2">${esc(T.proposedBy(displayName(owner)))}</span>` : '';

        const num = k => `<span class="whitespace-nowrap" data-slot="${s.id}" data-state="${k}">
            <span class="inline-block w-2 h-2 rounded-sm align-middle mr-1" style="background:${SEGCOLOR[k]}"></span>${c[k]}</span>`;

        return `<div class="slot-row px-5 py-4 ${isBest ? 'is-best' : ''} ${isLocked ? 'is-locked' : ''}">
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2.5">
                <div><span class="text-sm text-white font-medium">${r.day}</span>
                    <span class="font-mono text-[11px] text-gray-500 ml-2">${r.time}</span>${by}${badge}</div>
                <div class="flex items-center gap-3">
                    <div class="font-mono text-sm ${isLocked ? 'text-accent-success' : (isBest ? 'text-accent-purple' : 'text-gray-400')}">${T.yesCount(c.yes, headcount)}</div>
                    <button type="button" class="js-del-slot shrink-0 px-2 py-1 rounded-full border border-white/10 text-[10px] font-mono text-gray-600 hover:text-red-300 hover:border-red-400/30 transition" data-slot="${s.id}" title="${T.delSlot}"><i class="fa-regular fa-trash-can"></i></button>
                </div>
            </div>
            <div class="bar mb-2">${segs}</div>
            <div class="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-gray-500">
                ${num('yes')}${num('notice')}${num('no')}${num('pend')}
            </div>
        </div>`;
    }).join('');
}

// --- 名單浮層 ---
const tip = $('tip');
function showTip(slotId, state, x, y) {
    const s = S.slots[slotId];
    if (!s) return;
    const r = fmtRange(s.start, s.end);
    const names = listBy(slotId, state).map(displayName);
    $('tip-title').textContent = `${r.day} ${r.time} · ${T.states[state]}`;
    $('tip-count').textContent = names.length + ' ' + T.totalPeople;
    const box = $('tip-names');
    box.className = 'names font-mono text-[11px] text-gray-300' + (names.length <= 8 ? ' few' : '');
    box.innerHTML = names.length
        ? names.map(n => `<span class="truncate">${esc(n)}</span>`).join('')
        : `<span class="text-gray-600">${T.nobody}</span>`;
    tip.classList.add('show');
    moveTip(x, y);
}
function moveTip(x, y) {
    const r = tip.getBoundingClientRect();
    let left = x + 14, top = y + 16;
    if (left + r.width > window.innerWidth - 10) left = window.innerWidth - r.width - 10;
    if (top + r.height > window.innerHeight - 10) top = y - r.height - 14;
    tip.style.left = Math.max(10, left) + 'px';
    tip.style.top = Math.max(10, top) + 'px';
}
function hideTip() {
    if (pinned) return;
    tip.classList.remove('show');
    document.querySelectorAll('.seg.on').forEach(e => e.classList.remove('on'));
}
const $bars = $('slot-bars');
$bars.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-state]');
    if (t && !pinned) showTip(t.dataset.slot, t.dataset.state, e.clientX, e.clientY);
});
$bars.addEventListener('mousemove', e => { if (tip.classList.contains('show') && !pinned) moveTip(e.clientX, e.clientY); });
$bars.addEventListener('mouseout', e => {
    if (!e.relatedTarget || !e.relatedTarget.closest('[data-state]')) hideTip();
});
$bars.addEventListener('click', e => {
    const t = e.target.closest('[data-state]');
    if (!t) { pinned = null; hideTip(); return; }
    const key = t.dataset.slot + ':' + t.dataset.state;
    if (pinned === key) { pinned = null; hideTip(); return; }
    pinned = null;
    showTip(t.dataset.slot, t.dataset.state, e.clientX, e.clientY);
    pinned = key;
    document.querySelectorAll('.seg.on').forEach(el => el.classList.remove('on'));
    if (t.classList.contains('seg')) t.classList.add('on');
});
document.addEventListener('click', e => { if (!e.target.closest('#slot-bars')) { pinned = null; hideTip(); } });

// --- 參與者：三選一 ---
function renderCards() {
    const committed = (S.me && S.votes[S.me.uid]) || {};
    const open = votingOpen();
    $('slot-cards').innerHTML = sortedSlots().map(s => {
        // 沒登入也可以按：點下去會跳出登入／匿名的選擇；匿名現在可以改自己的票
        const canVote = open;
        const mine = draft[s.id] || null;             // 畫面看草稿，不看資料庫
        const t = S.tally[s.id] || {};
        const counts = `<div class="font-mono text-[10px] text-gray-500 mt-2">${T.tallyFmt(t.yes || 0, t.notice || 0, t.no || 0)}</div>`;
        const r = fmtRange(s.start, s.end);
        const owner = S.slotOwners[s.id];
        const by = (owner && owner !== S.meta.organizer)
            ? `<span class="font-mono text-[9px] text-gray-600 ml-2">${S.me && owner === S.me.uid ? T.youProposed : T.otherProposed}</span>` : '';
        const locked = s.id === S.meta.lockedSlot
            ? `<span class="ml-2 font-mono text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap bg-accent-success/15 text-accent-success border border-accent-success/30">${T.lockedBadge}</span>` : '';
        const picks = STATES.map(k =>
            `<button class="pick ${mine === k ? 'on-' + k : ''}" data-slot="${s.id}" data-pick="${k}" ${canVote ? '' : 'disabled'}>
                <i class="${ICONS[k]}"></i>${T.states[k]}</button>`
        ).join('');
        return `<div class="px-5 py-4">
            <div class="flex items-baseline justify-between gap-3 mb-3">
                <div><span class="text-sm text-white font-medium">${r.day}</span>
                    <span class="font-mono text-[11px] text-gray-500 ml-2">${r.time}</span>${by}${locked}</div>
                ${mine ? '' : `<span class="font-mono text-[10px] text-gray-600 shrink-0">${T.notAnswered}</span>`}
            </div>
            <div class="flex gap-2">${picks}</div>
            ${counts}
        </div>`;
    }).join('');
    renderSubmitBar();
}

// 送出列：按鈕文字與狀態說明
// 為什麼不能投：定案了、發起人收了、還是過了截止時間。可以投就回空字串。
function closedReason() {
    if (!S.meta) return '';
    if (S.meta.lockedSlot) return T.lockedDone;
    if (S.meta.state !== 'open') return T.votingClosed;
    if (S.meta.deadline && S.meta.deadline > 0 && S.meta.deadline < Date.now()) return T.deadlinePassed;
    return '';
}

function renderSubmitBar() {
    const btn = $('p-submit');
    const msg = $('p-submit-msg');
    if (!btn) return;
    const dirty = hasUnsaved();
    btn.textContent = submittedOnce ? T.resubmitBtn : T.submitBtn;
    btn.classList.remove('hidden');
    btn.disabled = !votingOpen() || !dirty;
    // 不能投的時候要說原因。原本只是把按鈕變灰，訊息還寫「選擇完成後請按送出」，
    // 人看不出來是截止了、被定案了、還是壞了。
    const why = closedReason();
    if (why) msg.textContent = why;
    else if (dirty) msg.textContent = T.unsaved;
    else if (submittedOnce) msg.textContent = T.canEdit;
    else msg.textContent = T.pickSomething;
}

$('slot-cards').addEventListener('click', async e => {
    const btn = e.target.closest('.pick');
    if (!btn || btn.disabled) return;
    if (!S.me) return;   // 入口畫面選完身分才進得到這個畫面，這行只是保險
    const slotId = btn.dataset.slot;
    // 只改草稿，按送出才寫資料庫
    if (draft[slotId] === btn.dataset.pick) delete draft[slotId];
    else draft[slotId] = btn.dataset.pick;
    renderCards();
});

// --- 送出：一次 multi-path update，票、統計、紀錄同一筆寫進去 ---
// 訪客要留下東西之前，一定要有個看得懂的名字。發起人名單上一排「訪客a1b2」
// 分不出誰是誰；同一個人換裝置回覆會變兩筆，有名字至少看得出來。
// 回傳打好的名字；還沒填就把游標送過去並回 null。
function requireGuestName() {
    if (!S.me || !S.me.isAnonymous) return '';
    const typed = ($('mt-name').value || '').trim();
    const placeholder = `${T.guest}${S.me.uid.slice(0, 4)}`;
    if (typed && typed !== placeholder) return typed;
    $('mt-name-msg').textContent = T.guestNameRequired;
    $('mt-name').focus();
    $('mt-name').select();
    setTimeout(() => { $('mt-name-msg').textContent = ''; }, 4000);
    return null;
}

$('p-submit').addEventListener('click', async () => {
    if (!S.me) return;   // 入口畫面選完身分才進得到這個畫面，這行只是保險
    const btn = $('p-submit');
    const msg = $('p-submit-msg');
    const delta = tallyDelta();
    if (!Object.keys(delta).length) return;
    const guestName = requireGuestName();
    if (guestName === null) return;   // 訪客還沒填名字

    btn.disabled = true;
    msg.textContent = T.submitting;

    const payload = {};
    // 只寫真的有變動的時段。匿名的人那條規則是 !data.exists()，
    // 把沒動過的票原值再寫一次會被擋，整包 update 一起掛掉。
    const committed = S.votes[S.me.uid] || {};
    new Set([...Object.keys(committed), ...Object.keys(draft)]).forEach(slotId => {
        const before = committed[slotId] || null;
        const after = draft[slotId] || null;
        if (before === after) return;
        payload[`meet/polls/${pollId}/votes/${S.me.uid}/${slotId}`] = after;
    });
    // 統計加減。規則只准每個數字跟現值差 ±1，所以基準一定要跟伺服器上的一樣——
    // 畫面上那份快取可能在別人投票或發起人校正之後就落後了，差超過 1 整包會被拒。
    let base = S.tally;
    try {
        base = (await get(ref(db, `meet/polls/${pollId}/tally`))).val() || {};
        S.tally = base;
    } catch (e) {
        console.warn('[meet] could not read the latest S.tally, falling back to the cached copy', e.code);
    }
    Object.entries(delta).forEach(([slotId, d]) => {
        ['yes', 'notice', 'no'].forEach(k => {
            if (!d[k]) return;
            const cur = (base[slotId] && base[slotId][k]) || 0;
            payload[`meet/polls/${pollId}/tally/${slotId}/${k}`] = Math.max(0, cur + d[k]);
        });
    });
    // 參加紀錄只有非匿名身分寫得進去
    if (!S.me.isAnonymous) {
        // 用伺服器時間，不要用這台機器的鐘。規則是 newData.val() <= now，
        // 裝置的鐘只要快幾秒就會整包被拒。
        payload[`meet/users/${S.me.uid}/joined/${pollId}`] = serverTimestamp();
    } else {
        // 匿名的人到這一刻才算真的留下東西，這時候才登記給發起人看
        const rec = participantRecord(guestName);
        Object.entries(rec).forEach(([k, v]) => {
            payload[`meet/polls/${pollId}/private/participants/${S.me.uid}/${k}`] = v;
        });
    }

    try {
        await update(ref(db), payload);
        submittedOnce = true;
        msg.textContent = T.submittedAt(new Date().toLocaleTimeString(T.timeLocale, { hour: '2-digit', minute: '2-digit' }));
        renderCards();
    } catch (err) {
        console.error('[meet] submit failed', err);
        msg.textContent = '';
        btn.disabled = false;
        window.alert(T.voteFailed + err.message);
    }
});


// 發起人專用：拿全量 S.votes 重算統計，跟資料庫不一致才寫回。
// 這同時補回「S.tally 上線前就存在的票」，也能修掉被灌大的數字。
async function syncTally() {
    if (!isOrganizer() || !S.meta) return;
    const want = {};
    Object.keys(S.slots).forEach(id => { want[id] = { yes: 0, notice: 0, no: 0 }; });
    Object.entries(S.votes).forEach(([uid, v]) => {
        if (uid === S.meta.organizer) return;
        Object.entries(v || {}).forEach(([slotId, pick]) => {
            if (want[slotId] && want[slotId][pick] !== undefined) want[slotId][pick]++;
        });
    });
    const payload = {};
    Object.entries(want).forEach(([slotId, w]) => {
        ['yes', 'notice', 'no'].forEach(k => {
            const cur = (S.tally[slotId] && S.tally[slotId][k]) || 0;
            if (cur !== w[k]) payload[`meet/polls/${pollId}/tally/${slotId}/${k}`] = w[k];
        });
    });
    if (!Object.keys(payload).length) return;
    try { await update(ref(db), payload); }
    catch (err) { console.warn('[meet] sync S.tally failed', err.code); }
}
// --- 結論區 ---
// --- 參與者管理（只有發起人看得到） ---
function renderVoters() {
    const uids = voterUids();
    $('voter-count').textContent = uids.length;
    $('voter-list').innerHTML = uids.length ? uids.map(u => {
        const n = S.votes[u] ? Object.keys(S.votes[u]).length : 0;
        const name = displayName(u);
        return `<div class="flex items-center gap-3 px-5 py-3">
            <span class="avatar shrink-0" style="background:#2a2a30">${esc(name.slice(0, 1))}</span>
            <span class="text-sm text-gray-300 truncate flex-1 min-w-0">${esc(name)}</span>
            <span class="font-mono text-[10px] text-gray-600 shrink-0">${n ? T.repliedSlots(n) : T.notRepliedYet}</span>
            <button type="button" class="js-del-voter shrink-0 px-3 py-1.5 rounded-full border border-white/10 text-[10px] font-mono text-gray-500 hover:text-red-300 hover:border-red-400/30 transition" data-uid="${u}">${T.removeVoter}</button>
        </div>`;
    }).join('') : `<div class="px-5 py-4 font-mono text-[11px] text-gray-600">${T.noVoters}</div>`;
}

$('voter-list').addEventListener('click', async e => {
    const btn = e.target.closest('.js-del-voter');
    if (!btn) return;
    if (btn.dataset.armed !== '1') {
        btn.dataset.armed = '1';
        btn.textContent = T.removeConfirm;
        btn.classList.add('text-red-300', 'border-red-400/30');
        setTimeout(() => {
            if (btn.isConnected && btn.dataset.armed === '1') {
                btn.dataset.armed = '';
                btn.textContent = T.removeVoter;
                btn.classList.remove('text-red-300', 'border-red-400/30');
            }
        }, 4000);
        return;
    }
    const uid = btn.dataset.uid;
    btn.disabled = true;
    try {
        // 連他提議過的時段一起刪掉，避免匿名亂提議之後留一堆孤兒選項
        const payload = {
            [`meet/polls/${pollId}/votes/${uid}`]: null,
            [`meet/polls/${pollId}/private/participants/${uid}`]: null
        };
        Object.keys(S.slotOwners).forEach(slotId => {
            if (S.slotOwners[slotId] === uid) Object.assign(payload, deleteSlotPayload(slotId));
        });
        await update(ref(db), payload);
    } catch (err) {
        btn.disabled = false;
        btn.dataset.armed = '';
        btn.textContent = T.removeFailed;
    }
});

function renderVerdict() {
    const sid = S.meta.lockedSlot || bestSlotId();
    const s = S.slots[sid];
    if (!s) { $('verdict').innerHTML = ''; return; }
    const r = fmtRange(s.start, s.end);

    if (isOrganizer()) {
        const CAP = 10;
        const nameList = (state) => {
            const arr = listBy(sid, state).map(displayName);
            if (!arr.length) return T.nobody;
            return arr.length <= CAP ? arr.join(T.listSep) : arr.slice(0, CAP).join(T.listSep) + T.andMore(arr.length);
        };
        const lockBtn = `<button id="lock-btn" class="px-5 py-2.5 rounded-full ${S.meta.lockedSlot ? 'border border-white/15 text-gray-400' : 'bg-accent-purple text-black font-bold'} text-xs tracking-wide transition">${S.meta.lockedSlot ? T.unlockBtn : T.lockBtn}</button>`;
        // 這顆會把整場會議連同所有回覆刪掉，不可復原，所以用紅色並要按兩次
        const closeBtn = `<button id="close-btn" class="px-4 py-2.5 rounded-full border border-red-400/40 text-red-300 hover:text-red-200 hover:border-red-400/70 text-xs tracking-wide transition">${T.closeBtn}</button>`;

        $('verdict').innerHTML = `<div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-[220px] flex-1">
                <div class="font-mono text-[10px] text-accent-purple uppercase tracking-wider mb-2">${S.meta.lockedSlot ? T.verdictLocked : T.verdictBest}</div>
                <div class="text-xl font-bold text-white mb-3">${r.day} ${r.time}</div>
                <div class="space-y-1.5 text-xs">
                    <div class="flex gap-2"><span class="font-mono text-gray-600 w-24 shrink-0">${T.states.yes}</span><span class="text-accent-success">${esc(nameList('yes'))}</span></div>
                    <div class="flex gap-2"><span class="font-mono text-gray-600 w-24 shrink-0">${T.states.notice}</span><span class="text-accent-warn">${esc(nameList('notice'))}</span></div>
                    <div class="flex gap-2"><span class="font-mono text-gray-600 w-24 shrink-0">${T.states.no}</span><span class="text-gray-400">${esc(nameList('no'))}</span></div>
                    <div class="flex gap-2"><span class="font-mono text-gray-600 w-24 shrink-0">${T.states.pend}</span><span class="text-gray-500">${esc(nameList('pend'))}</span></div>
                </div>
            </div>
            <div class="shrink-0 flex flex-col gap-2">${lockBtn}${closeBtn}</div>
        </div>`;

        $('lock-btn').onclick = async () => {
            try {
                await update(ref(db, `meet/polls/${pollId}/meta`), { lockedSlot: S.meta.lockedSlot ? null : sid });
            } catch (err) { window.alert(err.message); }
        };
        const delBtn = $('close-btn');
        delBtn.onclick = async () => {
            // 第一下換成確認字樣，4 秒沒有下一步就收回，避免誤觸把整場刪掉
            if (delBtn.dataset.armed !== '1') {
                delBtn.dataset.armed = '1';
                delBtn.textContent = T.deleteConfirm;
                setTimeout(() => {
                    if (delBtn.isConnected && delBtn.dataset.armed === '1') {
                        delBtn.dataset.armed = '';
                        delBtn.textContent = T.closeBtn;
                    }
                }, 4000);
                return;
            }
            delBtn.disabled = true;
            try {
                await update(ref(db), await deletePollPayload(pollId));
                location.href = 'meet.html';
            } catch (err) {
                delBtn.disabled = false;
                delBtn.dataset.armed = '';
                delBtn.textContent = T.closeBtn;
                window.alert(T.deleteFailed + err.message);
            }
        };
        return;
    }

    const all = sortedSlots();
    // 未登入也會走到這裡（內容公開讀），還沒有身分就沒有「我的票」
    const answered = S.me ? all.filter(x => voteOf(S.me.uid, x.id)).length : 0;
    const myYes = !S.me ? [] : all.filter(x => voteOf(S.me.uid, x.id) === 'yes').map(x => {
        const rr = fmtRange(x.start, x.end); return `${rr.day} ${rr.time}`;
    });
    const body = S.meta.lockedSlot
        ? `<div class="text-xl font-bold text-white mb-2">${r.day} ${r.time}</div>
           <p class="text-xs text-gray-400">${T.lockedNote}</p>`
        : `<div class="text-sm text-gray-300 mb-2">${T.answeredFmt(answered, all.length)}</div>
           <p class="text-xs text-gray-500">${T.myYes}${esc(myYes.join(T.listSep) || T.nothingPicked)}</p>`;
    $('verdict').innerHTML = `<div class="font-mono text-[10px] text-accent-purple uppercase tracking-wider mb-2">${S.meta.lockedSlot ? T.verdictLocked : T.yourReply}</div>${body}`;
}

// --- 提議新時段 ---
$('new-time').addEventListener('change', () => {
    $('new-end').value = addMinutes($('new-time').value, (S.meta && S.meta.durationMin) || 60);
});

// 提議時段預設收合，按按鈕才展開
$('add-slot-toggle').addEventListener('click', () => {
    const form = $('add-slot-form');
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) setAddSlotMsg(addSlotHint(), false);
});

// add-slot-msg 的預設提示，換時間時還原回去。時長沒有鎖死，只是建議值。
const addSlotHint = () => T.lengthHint((S.meta && S.meta.durationMin) || 60);
function setAddSlotMsg(text, isError) {
    const el = $('add-slot-msg');
    el.textContent = text;
    el.classList.toggle('text-red-400', !!isError);
    el.classList.toggle('text-gray-600', !isError);
}

// 改任何一個時間欄位就把重複警告清掉
['new-date', 'new-time', 'new-end'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', () => setAddSlotMsg(addSlotHint(), false));
});

$('add-slot').addEventListener('click', async () => {
    if (!S.me) return;
    const d = $('new-date').value, t = $('new-time').value, te = $('new-end').value;
    if (!d || !t || !te) return;
    const start = new Date(`${d}T${t}`).getTime();
    let endMs = new Date(`${d}T${te}`).getTime();
    if (endMs <= start) endMs += 86400000;
    if (Object.values(S.slots).some(s2 => s2.start === start && s2.end === endMs)) {
        setAddSlotMsg(T.dupSlot, true);
        return;
    }
    const guestName = requireGuestName();
    if (guestName === null) return;   // 提議時段也會進名單，訪客一樣要先有名字
    const slotId = push(ref(db, `meet/polls/${pollId}/slots`)).key;
    const payload = {
        [`meet/polls/${pollId}/slots/${slotId}`]: { start, end: endMs, createdAt: serverTimestamp() },
        [`meet/polls/${pollId}/private/slotOwners/${slotId}`]: S.me.uid
    };
    // 提議時段也算留下東西了，匿名的人在這裡一併登記，
    // 否則發起人在比例條上只會看到「由 a1b2c3 提議」這種 uid 片段
    if (S.me.isAnonymous) {
        const rec = participantRecord(guestName);
        Object.entries(rec).forEach(([k, v]) => {
            payload[`meet/polls/${pollId}/private/participants/${S.me.uid}/${k}`] = v;
        });
    }
    try {
        await update(ref(db), payload);
        // 自己提的時段預設幫你勾「可以」，但一樣要按送出才算數
        draft[slotId] = 'yes';
        renderCards();
    }
    catch (err) {
        console.error('[meet] add slot failed', err);
        $('add-slot-msg').textContent = T.addFailed + err.message;
    }
});

// 發起人刪候選時段（兩段式確認）
$('slot-bars').addEventListener('click', async e => {
    const btn = e.target.closest('.js-del-slot');
    if (!btn) return;
    e.stopPropagation();
    if (btn.dataset.armed !== '1') {
        btn.dataset.armed = '1';
        btn.innerHTML = T.delSlotConfirm;
        btn.classList.add('text-red-300', 'border-red-400/30');
        setTimeout(() => {
            if (btn.isConnected && btn.dataset.armed === '1') {
                btn.dataset.armed = '';
                btn.innerHTML = '<i class="fa-regular fa-trash-can"></i>';
                btn.classList.remove('text-red-300', 'border-red-400/30');
            }
        }, 4000);
        return;
    }
    btn.disabled = true;
    try { await update(ref(db), deleteSlotPayload(btn.dataset.slot)); }
    catch (err) {
        btn.disabled = false;
        btn.dataset.armed = '';
        console.error('[meet] delete slot failed', err);
        window.alert(T.delSlotFailed + err.message);
    }
});
