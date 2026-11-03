// 「儲存」只看名字：寫進使用者授權過的「存檔資料夾」，檔名＝命名欄的字＋副檔名，資料夾裡有同名檔就直接覆蓋。
// 改名、清空、開哪個檔都不影響存去哪裡。
// 只有電腦版 Chrome／Edge 有 showDirectoryPicker，其他瀏覽器 diskOK 是 false，呼叫端退回原本的下載。
// 資料夾控制碼放在 IndexedDB，重新整理後還記得是哪個資料夾；權限則要等使用者按儲存時再跟瀏覽器要一次。

import { jsonText, currentPuml, isPuml, fileBase } from './io.js';
import { S } from './state.js';

export const diskOK = typeof window.showDirectoryPicker === 'function';

let dir = null;                      // 存檔資料夾（FileSystemDirectoryHandle）
export const folderName = () => (dir ? dir.name : '');

/* ── IndexedDB：只存一筆，key 固定 ── */
const DB = 'ghost.sequence', STORE = 'handles', KEY = 'dir';
function idb(mode, fn) {
    return new Promise((ok, fail) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onerror = () => fail(req.error);
        req.onsuccess = () => {
            const tx = req.result.transaction(STORE, mode);
            const r = fn(tx.objectStore(STORE));
            tx.oncomplete = () => { req.result.close(); ok(r && r.result); };
            tx.onerror = () => { req.result.close(); fail(tx.error); };
        };
    });
}

/* 開頁時把上次的資料夾找回來，順手清掉舊版「綁定單一檔案」留下的那筆。找不到、瀏覽器擋 IndexedDB 都當作還沒選。 */
export async function restoreFolder() {
    if (!diskOK) return '';
    try {
        dir = (await idb('readonly', (s) => s.get(KEY))) || null;
        await idb('readwrite', (s) => s.delete('file'));
    } catch { /* 讀不到就當沒選過 */ }
    return folderName();
}

/* 跳出選資料夾的視窗；使用者按取消回傳 false，原本的資料夾不變 */
export async function pickFolder() {
    let h;
    try {
        h = await window.showDirectoryPicker({ id: 'ghost-sequence', mode: 'readwrite', startIn: dir || 'documents' });
    } catch (e) {
        if (e && e.name === 'AbortError') return false;
        throw e;
    }
    dir = h;
    try { await idb('readwrite', (s) => s.put(h, KEY)); } catch { /* 存不進去就只記在這次的頁面裡 */ }
    return true;
}

/* 跳出開檔視窗，從存檔資料夾開始；回傳 { file, inFolder }（inFolder＝這個檔就在存檔資料夾裡），使用者按取消回傳 null */
export async function pickFile(accept) {
    let h;
    try {
        [h] = await window.showOpenFilePicker({
            types: [{ description: 'UML', accept }], excludeAcceptAllOption: false,
            ...(dir ? { startIn: dir } : {}),
        });
    } catch (e) {
        if (e && e.name === 'AbortError') return null;
        throw e;
    }
    let inFolder = false;
    try { inFolder = !!(dir && (await dir.resolve(h))); } catch { /* 比不出來就當不在裡面，寧可多提醒 */ }
    return { file: await h.getFile(), inFolder };
}

export const saveExt = () => (isPuml() ? 'puml' : 'json');

/* 儲存：還沒選資料夾就先選，接著寫成「名字.副檔名」，同名覆蓋。
   要蓋掉的同名檔如果不是這張圖自己的檔（S.file），先回 { confirm: 檔名 } 不寫；
   呼叫端讓使用者再按一次，帶 force＝同一個檔名進來才真的覆蓋。
   寫成功回傳 { name, folder }，使用者取消選資料夾回傳 null；沒取名丟 'noname'，沒權限丟 'permission'，其他錯誤往外丟。 */
export async function saveDisk(force = '') {
    const base = fileBase();
    if (!base) throw new Error('noname');
    if (!dir && !(await pickFolder())) return null;
    const opt = { mode: 'readwrite' };
    if ((await dir.queryPermission(opt)) !== 'granted' && (await dir.requestPermission(opt)) !== 'granted') {
        throw new Error('permission');
    }
    const name = `${base}.${saveExt()}`;
    if (name !== S.file && name !== force) {
        let exists = true;
        try { await dir.getFileHandle(name); } catch (e) { if (e && e.name === 'NotFoundError') exists = false; else throw e; }
        if (exists) return { confirm: name };
    }
    const h = await dir.getFileHandle(name, { create: true });
    const w = await h.createWritable();
    await w.write(isPuml() ? currentPuml() : jsonText());
    await w.close();
    return { name, folder: dir.name };
}
