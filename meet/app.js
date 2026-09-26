// Meet 的進入點。meet.html 與 en/meet.html 都載這一支，語言看 <html lang> 決定。
// 這裡只做三件事：挑語言字串、接住登入狀態的變化、決定要進首頁還是投票頁。
import * as zh from './strings.zh.js';
import * as en from './strings.en.js';
import {
    auth, onAuthStateChanged, S, T, $, $home, pollId,
    setStrings, showState, initGoogleSignIn, loadSavedNames, dropWatches
} from './core.js';

import { startHome, resetHome } from './home.js';
import { attachPublic, decidePollView, resetPoll } from './poll.js';

// 字串要在任何畫面動作之前就位（Google 登入按鈕的 locale 也讀它）。
// home / poll 的模組本體只註冊事件，不在載入當下讀 T，所以這裡才設也來得及。
setStrings(document.documentElement.lang.toLowerCase().startsWith('zh') ? zh : en);

initGoogleSignIn();

let booted = false;

function boot() {
    if (!S.me) {
        $home.classList.add('hidden');
        // 投票頁：沒有身分就停在入口畫面（問卷名稱＋選「登入」或「訪客」）
        if (pollId) decidePollView();
        else showState('');
        return;
    }
    if (!pollId && S.me.isAnonymous) {
        // 匿名身分只能投票，開會議一定要 Google 帳號
        $home.classList.add('hidden');
        showState(T.anonCannotCreate);
        return;
    }
    if (pollId) {
        // 有身分了：關入口畫面、進投票畫面。規則被拒過的話 attachPublic 在這裡重試。
        attachPublic();
        decidePollView();
        return;
    }
    if (booted) return;
    booted = true;
    startHome();
}

// 換人就整個重來：解除全部監聽、把兩個畫面的旗標歸零，再照新身分重掛一次。
// 沒有這一段的話，在同一個分頁登出或換帳號，舊監聽會留在舊 uid 上一直被資料庫拒絕，
// 而且各模組以為「已經掛過了」不肯重掛，畫面就卡在前一個人的資料。
function resetForNewIdentity() {
    dropWatches();
    booted = false;
    resetHome();
    resetPoll();
}

let lastUid = null;
onAuthStateChanged(auth, (user) => {
    const uid = user ? user.uid : null;
    if (S.authResolved && uid !== lastUid) resetForNewIdentity();
    lastUid = uid;
    S.me = user;

    const logged = !!user;
    $('mt-login-prompt').classList.toggle('hidden', logged || !!pollId);
    $('mt-login-prompt').classList.toggle('flex', !logged && !pollId);
    $('mt-user-badge').classList.toggle('hidden', !logged);
    $('mt-user-badge').classList.toggle('flex', logged);
    if (logged) {
        $('mt-user-email').textContent = user.isAnonymous
            ? T.guestBadge
            : (user.email || user.displayName || user.uid.slice(0, 8));
    }

    S.authResolved = true;
    loadSavedNames();
    boot();
});

console.log('[meet] initialized', { pollId });

// 投票頁的內容不等登入：模組載入完就開始聽公開節點（meta / slots / tally 是公開讀）
if (pollId) attachPublic();
