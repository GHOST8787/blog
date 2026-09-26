// blog/en/meet.js
// English copy of blog/meet.js. Logic is identical; only the T dictionary and date format differ.
// Data structure and Security Rules: jesus8745/docs/20260924_meet_firebase_spec.md

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
    getDatabase, ref, onValue, push, update, set, get, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";
import {
    getAuth, GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged,
    signInAnonymously, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCwjNQeSSKNJHkUSS4SnXAHq4E-xn4uAKc",
    authDomain: "blog8787-f2ace.firebaseapp.com",
    databaseURL: "https://blog8787-f2ace-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "blog8787-f2ace",
    storageBucket: "blog8787-f2ace.firebasestorage.app",
    messagingSenderId: "619380552537",
    appId: "1:619380552537:web:e235bc3f22f6e2da7ad248",
    measurementId: "G-XT1H58ZNZZ"
};

const app = initializeApp(firebaseConfig, 'meet');
const db = getDatabase(app);
const auth = getAuth(app);
const GOOGLE_CLIENT_ID = '619380552537-c3lnr7vsaoabdllgt7begcsk3ldhj98t.apps.googleusercontent.com';

const MAX_POLLS = 10;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const T = {
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    states: { yes: 'Works', notice: 'Needs notice', no: "Can't", pend: 'No reply' },
    signInFirst: 'Sign in first',
    loading: 'Loading...',
    denied: 'No permission to read this meeting. Check that you signed in with the invited Google account.',
    minutes: 'min',
    deadlineLabel: 'Closes',
    noDeadline: 'No deadline',
    repliedFmt: (a, b) => `${a} / ${b} replied`,
    titleRequired: 'Meeting name is required',
    slotRequired: 'Add at least one candidate time',
    quotaFull: `You already have ${MAX_POLLS} meetings running. Close one to start another.`,
    createFailed: 'Create failed: ',
    voteFailed: 'Submit failed: ',
    closed: 'Closed',
    open: 'Collecting',
    lockedBadge: 'Locked in',
    bestBadge: 'Most available',
    proposedBy: (n) => `proposed by ${n}`,
    youProposed: 'you proposed',
    otherProposed: 'proposed by a participant',
    yesCount: (a, b) => `${a}/${b} works`,
    answeredFmt: (a, b) => `You answered ${a} of ${b} times`,
    myYes: 'Marked as works: ',
    nothingPicked: 'nothing yet',
    lockedNote: 'The organizer locked this in. A calendar invite follows separately.',
    verdictBest: 'Most available right now',
    verdictLocked: 'Locked in',
    lockBtn: 'Pause tallying',
    unlockBtn: 'Undo lock-in',
    closeBtn: 'Delete poll',
    reopenBtn: 'Reopen',
    deleteConfirm: 'Tap again to delete',
    deleteBtn: 'Delete',
    copyBtn: 'Link',
    copyShare: 'Copy share link',
    codeEmpty: 'Paste a slot code first.',
    codeOk: n => `${n} slot${n > 1 ? 's' : ''} filled in.`,
    codeError: { format: 'That is not a slot code (it must start with MT1.).', signature: 'Signature mismatch - the code may be incomplete or altered.', payload: 'The content could not be read. Generate the code again.', empty: 'This code carries no slots.' },
    noteSaved: 'Saved',
    noteFailed: 'Could not save: ',
    leadFmt: r => `Best so far ${r}`,
    lockedFmt: r => `Locked ${r}`,
    leadNone: 'Best so far: no replies yet',
    dupSlot: 'That slot is already on the list.',
    delSlot: 'Delete this slot',
    delSlotConfirm: 'Tap again to delete',
    delSlotFailed: 'Could not delete: ',
    removeVoter: 'Remove',
    removeConfirm: 'Tap again',
    removeFailed: 'Failed',
    repliedSlots: n => `${n} slot${n > 1 ? 's' : ''} answered`,
    notRepliedYet: 'No reply yet',
    noVoters: 'Nobody has opened this link yet.',
    copyManual: 'The browser blocked the automatic copy. Please copy this link manually:',
    copied: 'Copied',
    openPoll: 'Results',
    votingClosed: 'Voting is closed for this meeting.',
    deadlinePassed: 'The voting deadline has passed.',
    confirmDelete: 'Delete this meeting and every reply. Are you sure?',
    noPolls: 'No meetings yet.',
    submitBtn: 'Submit',
    resubmitBtn: 'Update my reply',
    submitting: 'Submitting…',
    pickSomething: 'Pick your times, then hit Submit',
    unsaved: 'You have unsubmitted changes',
    submittedAt: (t) => `Submitted ${t}`,
    canEdit: 'Submitted. Change anything and hit update again.',
    tallyFmt: (y, n, x) => `${y} yes · ${n} needs notice · ${x} no`,
    joinedNone: 'You have not replied to any meeting yet.',
    joinedDeleted: 'This poll has been deleted',
    nobody: 'nobody',
    andMore: (n) => ` …${n} in total`,
    totalPeople: 'people',
    yourReply: 'Your reply',
    notAnswered: 'no reply yet',
    organizerRole: 'Organizer',
    participantRole: 'Participant',
    addFailed: 'Add failed: ',
    deleteFailed: 'Delete failed: ',
    signInFailed: 'Sign-in failed: ',
    copyPrompt: 'Copy this link:',
    defaultPlace: 'Microsoft Teams',
    homeDenied: "Can't read your meeting list. The Firebase rules may not be published yet.",
    guest: 'Guest',
    guestBadge: 'Guest',
    notSignedIn: ' (not signed in)',
    nameSaved: 'Updated',
    nameFailed: 'Update failed: ',
    anonFailed: 'Anonymous voting failed: ',
    anonNeedsConsole: 'Anonymous voting is off: Firebase Console -> Authentication -> Sign-in method -> Anonymous -> Enable.',
    anonCannotCreate: 'Anonymous identities can vote only. Sign in with Google to create a meeting.'
};

const STATES = ['yes', 'notice', 'no'];
const ICONS = { yes: 'fa-solid fa-check', notice: 'fa-solid fa-bell', no: 'fa-solid fa-xmark' };
const SEGCLS = { yes: 'seg-yes', notice: 'seg-notice', no: 'seg-no', pend: 'seg-pend' };
const SEGCOLOR = { yes: '#4ADE80', notice: '#FBBF24', no: '#6B7280', pend: 'rgba(255,255,255,.12)' };

// === DOM ===
const $ = (id) => document.getElementById(id);
const $state = $('mt-state');
const $home = $('view-home');
const $poll = $('view-poll');

// === State ===
const pollId = new URLSearchParams(location.search).get('id');
let me = null;
let meta = null, slots = {}, votes = {}, participants = {}, slotOwners = {}, tally = {};
let pinned = null;
// What the participant has picked but not submitted yet. Nothing hits the database until Submit.
let draft = {};
// This identity has already submitted in this poll (anonymous submissions are final)
let submittedOnce = false;

// === Helpers ===
function esc(s) {
    return String(s === undefined || s === null ? '' : s)
        .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtRange(start, end) {
    const a = new Date(start), b = new Date(end);
    const hm = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return { day: `${MONTHS[a.getMonth()]} ${a.getDate()} (${T.weekdays[a.getDay()]})`, time: `${hm(a)}–${hm(b)}` };
}
function fmtDate(ms) {
    const d = new Date(ms);
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
function sortedSlots() {
    return Object.entries(slots).map(([id, s]) => ({ id, ...s })).sort((a, b) => a.start - b.start);
}
function displayName(uid) {
    if (participants[uid] && participants[uid].name) {
        return participants[uid].name + (participants[uid].anon ? T.notSignedIn : '');
    }
    if (meta && uid === meta.organizer) return meta.organizerName || 'Organizer';
    return uid.slice(0, 6);
}
function voterUids() {
    const set = new Set(Object.keys(participants));
    Object.keys(votes).forEach(u => set.add(u));
    if (meta) set.delete(meta.organizer);   // the organizer never votes, so keep them out of every count
    return [...set];
}
function voteOf(uid, slotId) { return (votes[uid] && votes[uid][slotId]) || null; }
function isOrganizer() { return !!(me && meta && me.uid === meta.organizer); }
function votingOpen() {
    if (!meta) return false;
    if (meta.state !== 'open') return false;
    if (meta.lockedSlot) return false;
    if (meta.deadline && meta.deadline > 0 && meta.deadline < Date.now()) return false;
    return true;
}
function showState(msg) {
    $state.textContent = msg;
    $state.classList.toggle('hidden', !msg);
}

// === Auth ===
onAuthStateChanged(auth, (user) => {
    me = user;
    const logged = !!user;
    $('mt-login-prompt').classList.toggle('hidden', logged);
    $('mt-login-prompt').classList.toggle('flex', !logged);
    $('mt-user-badge').classList.toggle('hidden', !logged);
    $('mt-user-badge').classList.toggle('flex', logged);
    if (logged) {
        $('mt-user-email').textContent = user.isAnonymous
            ? T.guestBadge
            : (user.email || user.displayName || user.uid.slice(0, 8));
        hideAuthModal();
    }
    // Anonymous voting is offered on poll pages only; creating a meeting still needs a Google account
    $('mt-anon-btn').classList.toggle('hidden', logged || !pollId);
    if ($modalAnon) $modalAnon.classList.toggle('hidden', logged || !pollId);
    boot();
});

$('mt-logout-btn').addEventListener('click', () => {
    if (me) dropCache(me.uid);   // 換人登入不要看到上一個人的清單
    signOut(auth);
});

function onGoogleCredential(response) {
    const cred = GoogleAuthProvider.credential(response.credential);
    signInWithCredential(auth, cred).catch(err => {
        console.error('[meet] signInWithCredential failed', err);
        showState(T.signInFailed + err.message);
    });
}
function initGoogleSignIn() {
    if (!(window.google && google.accounts && google.accounts.id)) {
        setTimeout(initGoogleSignIn, 150);
        return;
    }
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onGoogleCredential });
    const opts = { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'en' };
    if ($('mt-gis-btn')) google.accounts.id.renderButton($('mt-gis-btn'), opts);
    if ($('mt-gis-btn-modal')) google.accounts.id.renderButton($('mt-gis-btn-modal'), opts);
}
initGoogleSignIn();

// Anonymous voting: the identity stays in this device's browser, so a returning
// guest is the same visitor and can edit their own votes. It used to be in-memory
// and evaporate with the tab - a guest who wanted to change their answer the next
// day left behind a ghost vote nobody could touch.
async function anonSignIn() {
    try {
        await setPersistence(auth, browserLocalPersistence);
        await signInAnonymously(auth);
    } catch (err) {
        console.error('[meet] anonymous sign-in failed', err);
        showState(((err.code === 'auth/operation-not-allowed' || err.code === 'auth/admin-restricted-operation') ? T.anonNeedsConsole : T.anonFailed + err.message));
    }
}
$('mt-anon-btn').addEventListener('click', anonSignIn);
// The same action inside the auth modal (the dialog that opens on a vote tap)
const $modalAnon = $('mt-auth-anon');
if ($modalAnon) $modalAnon.addEventListener('click', () => { hideAuthModal(); anonSignIn(); });

const $authModal = $('mt-auth-modal');
function showAuthModal() { $authModal.classList.add('show'); $authModal.setAttribute('aria-hidden', 'false'); }
function hideAuthModal() { $authModal.classList.remove('show'); $authModal.setAttribute('aria-hidden', 'true'); }
$('mt-auth-cancel').addEventListener('click', hideAuthModal);
$authModal.addEventListener('click', e => { if (e.target === $authModal) hideAuthModal(); });

// === Boot ===
let booted = false;
function boot() {
    if (!me) {
        $home.classList.add('hidden');
        // Poll content is publicly readable, so keep it visible while signed out
        // and only hide the home view; tapping a pick opens the sign-in choice
        if (!pollId) showState('');
        return;
    }
    if (!pollId && me.isAnonymous) {
        // Anonymous identities can vote only; creating a meeting needs a Google account
        $home.classList.add('hidden');
        showState(T.anonCannotCreate);
        return;
    }
    if (pollId) {
        // Content listeners attach at module load (no sign-in needed); this adds
        // the identity-specific part. If public reads are not open yet, attachPublic
        // retries here after sign-in.
        attachPublic();
        attachRole();
        return;
    }
    if (booted) return;
    booted = true;
    startHome();
}

/* ===================== A. My meetings ===================== */
function startHome() {
    $home.classList.remove('hidden');
    showState('');
    renderCreateSlots();

    // Paint what we saw last time first, so the page is never blank,
    // and flag it as refreshing while the server answer is on its way
    const cached = readCache(me.uid);
    if (cached) {
        paintQuota(cached.active || 0);
        paintPolls(cached.list);
        setStale(true);
    } else {
        // No cache for this account. The inline script may have painted the
        // previous account's list, so clear it.
        $('mt-my-polls').innerHTML = '';
        setStale(false);
    }

    let liveActive = cached ? (cached.active || 0) : 0;
    onValue(ref(db, `meet/users/${me.uid}/activeCount`), snap => {
        liveActive = snap.val() || 0;
        paintQuota(liveActive);
    });

    onValue(ref(db, `meet/users/${me.uid}/polls`), async snap => {
        showState('');            // A successful read clears any earlier permission error
        const ids = Object.keys(snap.val() || {});
        // Fire all three reads together. They used to be three sequential
        // awaits, which cost three round trips per meeting.
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
                return null;      // Skip this one rather than failing the whole list
            }
            return m ? { id, meta: m, voters: Object.keys(v).length, slots: Object.keys(s).length,
                         lead: leadingSlot(s, v, m.lockedSlot, m.organizer) } : null;
        }));
        const list = rows.filter(Boolean).sort((a, b) => (b.meta.createdAt || 0) - (a.meta.createdAt || 0));
        paintPolls(list);
        setStale(false);
        writeCache(me.uid, list, liveActive);
    }, err => { setStale(false); showState(T.homeDenied + ' (' + err.code + ')'); });

    // The list loads on demand. Someone may have replied to a lot of polls and each
    // one costs a meta read, so fetching them all on page load is slow and wasteful.
    const jb = $('mt-joined-btn');
    if (jb) jb.classList.toggle('hidden', !!me.isAnonymous);
}

// Polls I replied to. Deleted polls are skipped.
let joinedAttached = false;
async function renderJoined() {
    const wrap = $('mt-joined-wrap');
    if (!wrap || me.isAnonymous || joinedAttached) return;
    joinedAttached = true;      // anonymous uids change every time
    onValue(ref(db, `meet/users/${me.uid}/joined`), async snap => {
        wrap.classList.remove('hidden');
        const entries = Object.entries(snap.val() || {});
        if (!entries.length) { $('mt-joined').innerHTML = emptyJoined(); return; }
        const rows = await Promise.all(entries.map(async ([id, at]) => {
            const m = (await get(ref(db, `meet/polls/${id}/meta`))).val();
            if (!m) {
                // The poll is gone, so clear my own joined record rather than leave a dead link
                update(ref(db), { [`meet/users/${me.uid}/joined/${id}`]: null }).catch(() => {});
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

// Button sits to the right of the user badge: the first press loads and opens the list,
// after that it just toggles
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
        ? `${fmtDate(p.at)} ${new Date(p.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
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

/* ===== Best time shown on the home cards: the slot with the most yes votes, or the locked one ===== */
/* ---- Home list cache ----
   The web RTDB SDK has no disk persistence (that is Android / iOS only),
   so the in-memory cache dies with the tab. Keep our own copy of the last
   list we rendered: paint it immediately on the next visit, then replace
   the whole thing once the server answers. */
const CACHE_VER = 2;                       // 改過快取格式就加一，舊的自然失效
const cacheKey = uid => `mt-home-v${CACHE_VER}-${uid}`;
const LAST_UID_KEY = 'mt-last-uid';        // meet.html 的 inline script 靠這個知道要讀誰的快取

function readCache(uid) {
    try {
        const o = JSON.parse(localStorage.getItem(cacheKey(uid)) || 'null');
        return o && Array.isArray(o.list) ? o : null;
    } catch (e) { return null; }   // Corrupt entry: treat as empty rather than blocking the page
}
function writeCache(uid, list, active) {
    // html is for the inline script, which has no renderPollRow and can only
    // drop a ready-made string into place
    try {
        localStorage.setItem(LAST_UID_KEY, uid);
        localStorage.setItem(cacheKey(uid), JSON.stringify({
            at: Date.now(), list, active, html: list.map(renderPollRow).join('')
        }));
    }
    catch (e) { /* Private window or quota full - the cache only speeds things up */ }
}
function dropCache(uid) {
    try {
        localStorage.removeItem(cacheKey(uid));
        // Clear last-uid too, or the inline script keeps painting the previous
        // person's list after they sign out
        if (localStorage.getItem(LAST_UID_KEY) === uid) localStorage.removeItem(LAST_UID_KEY);
    } catch (e) { }
}
/* Drop a deleted poll from the cache straight away, so the next visit
   does not flash a meeting that no longer exists */
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
            <div class="font-mono text-[11px] text-gray-500">${p.voters} replied · ${p.slots} times · ${dl}</div>
        </div>
    </div>`;
}

// Deleting a meeting touches three places: the meeting itself, my own list of meetings,
// and activeCount if it was still open. The activeCount rule only allows a move of 1,
// so the base has to be read fresh rather than taken from the screen.
async function deletePollPayload(id) {
    const m = (await get(ref(db, `meet/polls/${id}/meta`))).val();
    const cur = (await get(ref(db, `meet/users/${me.uid}/activeCount`))).val() || 0;
    const payload = {
        [`meet/polls/${id}`]: null,
        [`meet/users/${me.uid}/polls/${id}`]: null
    };
    if (m && m.state === 'open' && cur > 0) payload[`meet/users/${me.uid}/activeCount`] = cur - 1;
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
            forgetFromCache(me.uid, id);
        }
        catch (err) { window.alert(T.deleteFailed + err.message); }
        return;   // stop here, or the click falls through to js-row and opens the poll just deleted
    }
    const row = e.target.closest('.js-row');
    if (row) location.href = `meet.html?id=${encodeURIComponent(row.dataset.id)}`;
});

// --- Create ---
$('mt-new-btn').addEventListener('click', () => {
    $('mt-create').classList.toggle('hidden');
    if (!$('mt-create').classList.contains('hidden')) $('c-title').focus();
});
$('c-cancel').addEventListener('click', () => $('mt-create').classList.add('hidden'));

function addMinutes(hhmm, mins) {
    const [h, m] = hhmm.split(':').map(Number);
    const t = (h * 60 + m + mins) % 1440;
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}
function slotRowHtml(date, start, end) {
    return `<div class="flex flex-wrap items-center gap-2 js-slot-row">
        <input type="date" value="${date}" class="mt-input rounded-lg px-3 py-2 text-sm font-mono js-sd">
        <input type="time" value="${start}" class="mt-input rounded-lg px-3 py-2 text-sm font-mono js-st">
        <span class="text-gray-600 font-mono text-sm">to</span>
        <input type="time" value="${end}" class="mt-input rounded-lg px-3 py-2 text-sm font-mono js-se">
        <button class="js-rm w-9 h-9 rounded-lg border border-white/10 text-gray-600 hover:text-red-400 transition text-xs"><i class="fa-regular fa-trash-can"></i></button>
    </div>`;
}
function renderCreateSlots() {
    const iso = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
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

// Changing the start time pushes the end time out by one meeting length; changing the length recalculates every row
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
        if (end <= start) end += 86400000;   // crosses midnight
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
        cur = (await get(ref(db, `meet/users/${me.uid}/activeCount`))).val() || 0;
    } catch (e1) {
        console.error('[meet] read activeCount failed', e1);
        err.textContent = T.createFailed + e1.message;
        btn.disabled = false;
        return;
    }
    if (cur >= MAX_POLLS) { err.textContent = T.quotaFull; btn.disabled = false; return; }

    const dlv = $('c-deadline').value;
    const newId = push(ref(db, 'meet/polls')).key;
    const payload = {
        [`meet/polls/${newId}/meta`]: {
            organizer: me.uid,
            organizerName: me.displayName || (me.email || '').split('@')[0] || 'Organizer',
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
        [`meet/users/${me.uid}/activeCount`]: cur + 1,
        [`meet/users/${me.uid}/polls/${newId}`]: true
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

// Participants pick the name the organizer sees
$('mt-name-save').addEventListener('click', async () => {
    const name = $('mt-name').value.trim();
    if (!name || !me || !pollId) return;
    try {
        await update(ref(db, `meet/polls/${pollId}/private/participants/${me.uid}`), participantRecord(name));
        $('mt-name-msg').textContent = T.nameSaved;
        setTimeout(() => { $('mt-name-msg').textContent = ''; }, 1600);
    } catch (err) {
        $('mt-name-msg').textContent = T.nameFailed + err.message;
    }
});

/* ===================== B. Poll page ===================== */
let publicAttached = false;
let loadTimer = null;

function startPoll() {
    $poll.classList.remove('hidden');
    attachPublic();
}

// meta / slots / tally are readable by anyone holding the link (the unguessable id
// is the ticket), so paint content before sign-in. votes and private stay protected
// and attach per identity in attachRole().
function attachPublic() {
    if (publicAttached) return;
    publicAttached = true;

    // Only show a loading hint after 3s with no answer; no flash on entry
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => { if (!meta) showState(T.loading); }, 3000);

    onValue(ref(db, `meet/polls/${pollId}/meta`), snap => {
        clearTimeout(loadTimer);
        meta = snap.val();
        if (!meta) {
            // The meeting is gone (deleted, or a stale link): say so plainly,
            // no identity needed, and stay put
            showState('');
            $poll.classList.add('hidden');
            $('mt-gone').classList.remove('hidden');
            return;
        }
        showState('');
        $('mt-gone').classList.add('hidden');
        $poll.classList.remove('hidden');
        attachRole();
        renderPollHeader();
        renderAll();
    }, err => {
        // Denied while signed out = public reads not enabled yet; stay quiet and
        // let boot() re-attach after sign-in. Denied while signed in is a real error.
        clearTimeout(loadTimer);
        showState('');   // the 3s hint may already be up; do not leave it hanging while waiting quietly
        publicAttached = false;
        if (!me) return;
        console.error('[meet] meta read failed', err);
        showState(T.denied + ' (' + err.code + ')');
    });

    onValue(ref(db, `meet/polls/${pollId}/slots`), snap => {
        slots = snap.val() || {};
        // Drop slots the organizer deleted from the draft. Keeping them makes hasUnsaved()
        // permanently true and makes submit write a vote for a slot that no longer exists,
        // which .validate rejects, taking the whole update down with it.
        Object.keys(draft).forEach(id => { if (!slots[id]) delete draft[id]; });
        renderAll();
    }, () => {});

    // The tally used to attach inside attachParticipant; it is public now
    onValue(ref(db, `meet/polls/${pollId}/tally`), s => { tally = s.val() || {}; renderAll(); }, () => {});
}

function attachRole() {
    if (!me || !meta) return;
    if (isOrganizer()) attachOrganizer(); else attachParticipant();
}

let attached = null;
function attachOrganizer() {
    if (attached === 'org') return;
    attached = 'org';
    onValue(ref(db, `meet/polls/${pollId}/votes`), s => {
        votes = s.val() || {};
        renderAll();
        syncTally();          // the organizer can read every vote, so fix the tally node here
    });
    onValue(ref(db, `meet/polls/${pollId}/private/organizerNote`), s => {
        if (orgNoteLoaded) return;
        orgNoteLoaded = true;
        $('org-note').value = s.val() || '';
    }, () => {});
    onValue(ref(db, `meet/polls/${pollId}/private/participants`), s => { participants = s.val() || {}; renderAll(); });
    onValue(ref(db, `meet/polls/${pollId}/private/slotOwners`), s => { slotOwners = s.val() || {}; renderAll(); });
}
// The full participant record. An anonymous guest writes the whole thing at once,
// so the node is never created half-filled.
function participantRecord(name) {
    return { name, email: me.email || '', anon: !!me.isAnonymous };
}

function attachParticipant() {
    if (attached === 'part') return;
    attached = 'part';
    // Anonymous guests are not registered yet. Someone who only opened the page
    // should not show up on the organizer's list; the record is created when they save a
    // name or hit submit. Signed-in users have a real name, so they register right away.
    const initialName = me.isAnonymous
        ? `${T.guest}${me.uid.slice(0, 4)}`
        : (me.displayName || (me.email || '').split('@')[0] || T.guest);
    if (!me.isAnonymous) {
        update(ref(db, `meet/polls/${pollId}/private/participants/${me.uid}`), participantRecord(initialName))
            .catch(err => console.warn('[meet] register participant failed', err.code));
    }
    $('mt-name').value = initialName;
    $('mt-identity').classList.remove('hidden');
    $('mt-identity').classList.add('flex');
    onValue(ref(db, `meet/polls/${pollId}/votes/${me.uid}`), s => {
        const mine = s.val() || {};
        votes = { [me.uid]: mine };
        submittedOnce = Object.keys(mine).length > 0;
        draft = { ...mine };
        renderAll();
    });
}

// Difference between the draft and what was submitted, as per-slot tally deltas
function tallyDelta() {
    if (!me) return {};
    const committed = (votes[me.uid] || {});
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
    if (!me) return false;
    const committed = (votes[me.uid] || {});
    const keys = new Set([...Object.keys(committed), ...Object.keys(draft)]);
    for (const k of keys) {
        if ((committed[k] || null) !== (draft[k] || null)) return true;
    }
    return false;
}

// Purple share button at the bottom-right of the poll header
$('p-copy').addEventListener('click', async () => {
    const btn = $('p-copy');
    const url = `${location.origin}${location.pathname}?id=${pollId}`;
    try { await navigator.clipboard.writeText(url); btn.innerHTML = T.copied; }
    catch { window.prompt(T.copyManual, url); return; }
    setTimeout(() => { btn.innerHTML = `<i class="fa-regular fa-copy mr-1.5"></i>${T.copyShare}`; }, 1600);
});

/* ===== Office slot code (MT1): verify the signature, then restore the slots ===== */
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

/* ===== Organizer private note (lives under private/, unreadable by participants) ===== */
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
    $('p-title').textContent = meta.title || '';
    $('p-note').textContent = meta.note || '';
    const on = meta.organizerName || 'Organizer';
    $('p-org-name').textContent = on;
    $('p-org-avatar').textContent = on.slice(0, 1);
    $('p-duration').innerHTML = meta.durationMin
        ? `<i class="fa-regular fa-clock mr-1.5"></i>${meta.durationMin} ${T.minutes}` : '';
    $('p-place').innerHTML = meta.place
        ? `<i class="fa-solid fa-location-dot mr-1.5"></i>${esc(meta.place)}` : '';
    $('p-deadline').innerHTML = meta.deadline
        ? `<i class="fa-regular fa-calendar-xmark mr-1.5"></i>${T.deadlineLabel} ${fmtDate(meta.deadline)}`
        : `<i class="fa-regular fa-calendar mr-1.5"></i>${T.noDeadline}`;
}

function renderAll() {
    if (!meta) return;
    const org = isOrganizer();
    $('organizer-view').classList.toggle('hidden', !org);
    $('participant-view').classList.toggle('hidden', org);
    $('mt-role-badge').textContent = org ? T.organizerRole : ((me && me.isAnonymous) ? T.guestBadge : T.participantRole);

    const canAdd = votingOpen() && (org || meta.allowGuestSlots === true);
    $('add-slot-card').classList.toggle('hidden', !canAdd);

    const uids = voterUids();
    const replied = uids.filter(u => votes[u] && Object.keys(votes[u]).length).length;
    $('p-replied').innerHTML = org
        ? `<i class="fa-regular fa-user mr-1.5"></i>${T.repliedFmt(replied, uids.length)}`
        : '';

    $('p-copy').classList.toggle('hidden', !org);
    $('org-note-card').classList.toggle('hidden', !org);   // only the organizer may copy the share link
    if (org) { renderBars(); renderVoters(); } else renderCards();
    renderVerdict();
}

// --- Organizer bars ---
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

// Deleting a slot clears everything tied to it: the slot, its proposer, the tally and every vote on it.
// If the poll was locked on this slot, unlock it too.
function deleteSlotPayload(slotId) {
    const payload = {
        [`meet/polls/${pollId}/slots/${slotId}`]: null,
        [`meet/polls/${pollId}/private/slotOwners/${slotId}`]: null,
        [`meet/polls/${pollId}/tally/${slotId}`]: null
    };
    Object.keys(votes).forEach(uid => {
        if (votes[uid] && votes[uid][slotId]) {
            payload[`meet/polls/${pollId}/votes/${uid}/${slotId}`] = null;
        }
    });
    if (meta && meta.lockedSlot === slotId) {
        payload[`meet/polls/${pollId}/meta/lockedSlot`] = null;
    }
    return payload;
}

function renderBars() {
    const headcount = voterUids().length;
    const total = headcount || 1;   // the bar width needs a non-zero denominator; the label shows the real headcount
    const best = bestSlotId();
    $('slot-bars').innerHTML = sortedSlots().map(s => {
        const c = { yes: countBy(s.id, 'yes'), notice: countBy(s.id, 'notice'), no: countBy(s.id, 'no'), pend: countBy(s.id, 'pend') };
        const isBest = s.id === best && !meta.lockedSlot;
        const isLocked = s.id === meta.lockedSlot;
        const r = fmtRange(s.start, s.end);

        const segs = ['yes', 'notice', 'no', 'pend'].filter(k => c[k] > 0).map(k =>
            `<div class="seg ${SEGCLS[k]}" style="width:${c[k] / total * 100}%" data-slot="${s.id}" data-state="${k}"></div>`
        ).join('');

        const badge = isLocked
            ? `<span class="ml-2 font-mono text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap bg-accent-success/15 text-accent-success border border-accent-success/30">${T.lockedBadge}</span>`
            : (isBest ? `<span class="ml-2 font-mono text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap bg-accent-purple/15 text-accent-purple border border-accent-purple/30">${T.bestBadge}</span>` : '');

        const owner = slotOwners[s.id];
        const by = (owner && owner !== meta.organizer)
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

// --- Tooltip ---
const tip = $('tip');
function showTip(slotId, state, x, y) {
    const s = slots[slotId];
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

// --- Participant cards ---
function renderCards() {
    const committed = (me && votes[me.uid]) || {};
    const open = votingOpen();
    $('slot-cards').innerHTML = sortedSlots().map(s => {
        // Tappable even while signed out (the tap opens the sign-in choice);
        // anonymous voters can now edit their own votes
        const canVote = open;
        const mine = draft[s.id] || null;             // the UI follows the draft, not the database
        const t = tally[s.id] || {};
        const counts = `<div class="font-mono text-[10px] text-gray-500 mt-2">${T.tallyFmt(t.yes || 0, t.notice || 0, t.no || 0)}</div>`;
        const r = fmtRange(s.start, s.end);
        const owner = slotOwners[s.id];
        const by = (owner && owner !== meta.organizer)
            ? `<span class="font-mono text-[9px] text-gray-600 ml-2">${me && owner === me.uid ? T.youProposed : T.otherProposed}</span>` : '';
        const locked = s.id === meta.lockedSlot
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

// Submit bar: button label and status line
function renderSubmitBar() {
    const btn = $('p-submit');
    const msg = $('p-submit-msg');
    if (!btn) return;
    const dirty = hasUnsaved();
    btn.textContent = submittedOnce ? T.resubmitBtn : T.submitBtn;
    btn.classList.remove('hidden');
    btn.disabled = !votingOpen() || !dirty;
    if (dirty) msg.textContent = T.unsaved;
    else if (submittedOnce) msg.textContent = T.canEdit;
    else msg.textContent = T.pickSomething;
}

$('slot-cards').addEventListener('click', async e => {
    const btn = e.target.closest('.pick');
    if (!btn || btn.disabled) return;
    if (!me) { showAuthModal(); return; }
    const slotId = btn.dataset.slot;
    // Draft only. Nothing is written until Submit.
    if (draft[slotId] === btn.dataset.pick) delete draft[slotId];
    else draft[slotId] = btn.dataset.pick;
    renderCards();
});

// --- Submit: one multi-path update carrying votes, tally and the joined record ---
$('p-submit').addEventListener('click', async () => {
    if (!me) { showAuthModal(); return; }
    const btn = $('p-submit');
    const msg = $('p-submit-msg');
    const delta = tallyDelta();
    if (!Object.keys(delta).length) return;

    btn.disabled = true;
    msg.textContent = T.submitting;

    const payload = {};
    // Only write slots that actually changed. The anonymous rule is !data.exists(),
    // so re-writing an untouched vote at its current value is denied and takes the
    // whole multi-path update down with it.
    const committed = votes[me.uid] || {};
    new Set([...Object.keys(committed), ...Object.keys(draft)]).forEach(slotId => {
        const before = committed[slotId] || null;
        const after = draft[slotId] || null;
        if (before === after) return;
        payload[`meet/polls/${pollId}/votes/${me.uid}/${slotId}`] = after;
    });
    // Tally deltas. The rule only allows each number to move by 1 from its current value,
    // so the base has to match the server: the cached copy on screen falls behind as soon as
    // someone else votes or the organizer reconciles, and being off by more than 1 is denied.
    let base = tally;
    try {
        base = (await get(ref(db, `meet/polls/${pollId}/tally`))).val() || {};
        tally = base;
    } catch (e) {
        console.warn('[meet] could not read the latest tally, falling back to the cached copy', e.code);
    }
    Object.entries(delta).forEach(([slotId, d]) => {
        ['yes', 'notice', 'no'].forEach(k => {
            if (!d[k]) return;
            const cur = (base[slotId] && base[slotId][k]) || 0;
            payload[`meet/polls/${pollId}/tally/${slotId}/${k}`] = Math.max(0, cur + d[k]);
        });
    });
    if (!me.isAnonymous) {
        // Server time, not this machine's clock. The rule is newData.val() <= now, so a
        // device running even a few seconds fast would have the whole update denied.
        payload[`meet/users/${me.uid}/joined/${pollId}`] = serverTimestamp();
    } else {
        // An anonymous guest has now actually left something, so register them here
        const typed = ($('mt-name').value || '').trim();
        const rec = participantRecord(typed || `${T.guest}${me.uid.slice(0, 4)}`);
        Object.entries(rec).forEach(([k, v]) => {
            payload[`meet/polls/${pollId}/private/participants/${me.uid}/${k}`] = v;
        });
    }

    try {
        await update(ref(db), payload);
        submittedOnce = true;
        msg.textContent = T.submittedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
        renderCards();
    } catch (err) {
        console.error('[meet] submit failed', err);
        msg.textContent = '';
        btn.disabled = false;
        window.alert(T.voteFailed + err.message);
    }
});


// Organizer only: recompute the tally from every vote and write back what differs.
// This backfills votes cast before the tally node existed and corrects inflated numbers.
async function syncTally() {
    if (!isOrganizer() || !meta) return;
    const want = {};
    Object.keys(slots).forEach(id => { want[id] = { yes: 0, notice: 0, no: 0 }; });
    Object.entries(votes).forEach(([uid, v]) => {
        if (uid === meta.organizer) return;
        Object.entries(v || {}).forEach(([slotId, pick]) => {
            if (want[slotId] && want[slotId][pick] !== undefined) want[slotId][pick]++;
        });
    });
    const payload = {};
    Object.entries(want).forEach(([slotId, w]) => {
        ['yes', 'notice', 'no'].forEach(k => {
            const cur = (tally[slotId] && tally[slotId][k]) || 0;
            if (cur !== w[k]) payload[`meet/polls/${pollId}/tally/${slotId}/${k}`] = w[k];
        });
    });
    if (!Object.keys(payload).length) return;
    try { await update(ref(db), payload); }
    catch (err) { console.warn('[meet] sync tally failed', err.code); }
}
// --- Verdict ---
// --- Participant admin (organizer only) ---
function renderVoters() {
    const uids = voterUids();
    $('voter-count').textContent = uids.length;
    $('voter-list').innerHTML = uids.length ? uids.map(u => {
        const n = votes[u] ? Object.keys(votes[u]).length : 0;
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
        // Also remove the slots they proposed, so a spammy anonymous voter leaves nothing behind
        const payload = {
            [`meet/polls/${pollId}/votes/${uid}`]: null,
            [`meet/polls/${pollId}/private/participants/${uid}`]: null
        };
        Object.keys(slotOwners).forEach(slotId => {
            if (slotOwners[slotId] === uid) Object.assign(payload, deleteSlotPayload(slotId));
        });
        await update(ref(db), payload);
    } catch (err) {
        btn.disabled = false;
        btn.dataset.armed = '';
        btn.textContent = T.removeFailed;
    }
});

function renderVerdict() {
    const sid = meta.lockedSlot || bestSlotId();
    const s = slots[sid];
    if (!s) { $('verdict').innerHTML = ''; return; }
    const r = fmtRange(s.start, s.end);

    if (isOrganizer()) {
        const CAP = 10;
        const nameList = (state) => {
            const arr = listBy(sid, state).map(displayName);
            if (!arr.length) return T.nobody;
            return arr.length <= CAP ? arr.join(', ') : arr.slice(0, CAP).join(', ') + T.andMore(arr.length);
        };
        const lockBtn = `<button id="lock-btn" class="px-5 py-2.5 rounded-full ${meta.lockedSlot ? 'border border-white/15 text-gray-400' : 'bg-accent-purple text-black font-bold'} text-xs tracking-wide transition">${meta.lockedSlot ? T.unlockBtn : T.lockBtn}</button>`;
        // This wipes the whole meeting and every reply, with no undo, so it is red and takes two presses
        const closeBtn = `<button id="close-btn" class="px-4 py-2.5 rounded-full border border-red-400/40 text-red-300 hover:text-red-200 hover:border-red-400/70 text-xs tracking-wide transition">${T.closeBtn}</button>`;

        $('verdict').innerHTML = `<div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-[220px] flex-1">
                <div class="font-mono text-[10px] text-accent-purple uppercase tracking-wider mb-2">${meta.lockedSlot ? T.verdictLocked : T.verdictBest}</div>
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
                await update(ref(db, `meet/polls/${pollId}/meta`), { lockedSlot: meta.lockedSlot ? null : sid });
            } catch (err) { window.alert(err.message); }
        };
        const delBtn = $('close-btn');
        delBtn.onclick = async () => {
            // The first press swaps in a confirm label and backs out after 4 seconds,
            // so a stray click cannot wipe the meeting
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
    // Reached while signed out too (content is publicly readable); no identity, no own votes
    const answered = me ? all.filter(x => voteOf(me.uid, x.id)).length : 0;
    const myYes = !me ? [] : all.filter(x => voteOf(me.uid, x.id) === 'yes').map(x => {
        const rr = fmtRange(x.start, x.end); return `${rr.day} ${rr.time}`;
    });
    const body = meta.lockedSlot
        ? `<div class="text-xl font-bold text-white mb-2">${r.day} ${r.time}</div>
           <p class="text-xs text-gray-400">${T.lockedNote}</p>`
        : `<div class="text-sm text-gray-300 mb-2">${T.answeredFmt(answered, all.length)}</div>
           <p class="text-xs text-gray-500">${T.myYes}${esc(myYes.join(', ') || T.nothingPicked)}</p>`;
    $('verdict').innerHTML = `<div class="font-mono text-[10px] text-accent-purple uppercase tracking-wider mb-2">${meta.lockedSlot ? T.verdictLocked : T.yourReply}</div>${body}`;
}

// --- Propose a slot ---
$('new-time').addEventListener('change', () => {
    $('new-end').value = addMinutes($('new-time').value, (meta && meta.durationMin) || 60);
});

// add-slot-msg 的預設提示，換時間時還原回去
const ADD_SLOT_HINT = $('add-slot-msg').textContent;
function setAddSlotMsg(text, isError) {
    const el = $('add-slot-msg');
    el.textContent = text;
    el.classList.toggle('text-red-400', !!isError);
    el.classList.toggle('text-gray-600', !isError);
}

// Editing any time field clears the duplicate warning
['new-date', 'new-time', 'new-end'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', () => setAddSlotMsg(ADD_SLOT_HINT, false));
});

$('add-slot').addEventListener('click', async () => {
    const d = $('new-date').value, t = $('new-time').value, te = $('new-end').value;
    if (!d || !t || !te) return;
    const start = new Date(`${d}T${t}`).getTime();
    let endMs = new Date(`${d}T${te}`).getTime();
    if (endMs <= start) endMs += 86400000;
    if (Object.values(slots).some(s2 => s2.start === start && s2.end === endMs)) {
        setAddSlotMsg(T.dupSlot, true);
        return;
    }
    const slotId = push(ref(db, `meet/polls/${pollId}/slots`)).key;
    const payload = {
        [`meet/polls/${pollId}/slots/${slotId}`]: { start, end: endMs, createdAt: serverTimestamp() },
        [`meet/polls/${pollId}/private/slotOwners/${slotId}`]: me.uid
    };
    // Proposing a slot counts as leaving something, so register an anonymous guest here too.
    // Otherwise the organizer only sees "proposed by a1b2c3" on the bar.
    if (me.isAnonymous) {
        const typed = ($('mt-name').value || '').trim();
        const rec = participantRecord(typed || `${T.guest}${me.uid.slice(0, 4)}`);
        Object.entries(rec).forEach(([k, v]) => {
            payload[`meet/polls/${pollId}/private/participants/${me.uid}/${k}`] = v;
        });
    }
    try {
        await update(ref(db), payload);
        // A slot you proposed is pre-picked as "yes", but it still needs Submit
        draft[slotId] = 'yes';
        renderCards();
    }
    catch (err) {
        console.error('[meet] add slot failed', err);
        $('add-slot-msg').textContent = T.addFailed + err.message;
    }
});

// Organizer deletes a candidate slot (two-step confirm)
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

console.log('[meet] initialized', { app: app.name, pollId });

// Poll content does not wait for sign-in: start listening as soon as the module loads
if (pollId) startPoll();
