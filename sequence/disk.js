// 「儲存」直接寫回原檔：用瀏覽器的 File System Access API 拿到檔案本身，之後每次存都覆蓋同一個檔。
// 只有電腦版 Chrome／Edge 有這組 API，其他瀏覽器 diskOK 是 false，呼叫端退回原本的下載。
// 檔案控制碼放在 IndexedDB，重新整理後還記得是哪個檔；權限則要等使用者按儲存時再跟瀏覽器要一次。

import { S } from './state.js';
import { jsonText, svgText, currentPuml, isPuml, toMermaid, fileBase } from './io.js';

export const diskOK = typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function';

let cur = null;                      // 目前綁定的檔案（FileSystemFileHandle）
export const boundName = () => (cur ? cur.name : '');

/* ── IndexedDB：只存一筆，key 固定 ── */
const DB = 'ghost.sequence', STORE = 'handles', KEY = 'file';
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

/* 開頁時把上次的檔找回來。找不到、瀏覽器擋 IndexedDB 都當作沒綁檔。 */
export async function restoreHandle() {
    if (!diskOK) return '';
    try { cur = (await idb('readonly', (s) => s.get(KEY))) || null; } catch { cur = null; }
    return boundName();
}

/* 開檔成功讀進來之後才綁定；讀壞的檔不綁，免得下次儲存蓋掉它 */
export async function bind(handle) {
    cur = handle;
    try { await idb('readwrite', (s) => s.put(handle, KEY)); } catch { /* 存不進去就只記在這次的頁面裡 */ }
}

/* 跳出開檔視窗，回傳 { file, handle }；使用者按取消回傳 null */
export async function pickFile(accept) {
    let h;
    try {
        [h] = await window.showOpenFilePicker({ types: [{ description: 'UML', accept }], excludeAcceptAllOption: false });
    } catch (e) {
        if (e && e.name === 'AbortError') return null;
        throw e;
    }
    return { file: await h.getFile(), handle: h };
}

const PUML_EXT = /[.](puml|plantuml|pu|iuml|wsd)$/i;

/* 這個檔能不能裝下目前這張圖；能的話回傳要寫進去的文字，不能回傳 null（改走另存新檔） */
function contentFor(name) {
    if (/[.]svg$/i.test(name)) return svgText();
    if (/[.]json$/i.test(name)) return isPuml() ? null : jsonText();
    if (PUML_EXT.test(name)) return isPuml() ? currentPuml() : null;
    if (/[.](mmd|mermaid)$/i.test(name)) return S.type === 'seq' && !isPuml() ? toMermaid() : null;
    if (/[.]txt$/i.test(name)) return isPuml() ? currentPuml() : toMermaid();
    return null;
}

async function canWrite(h) {
    const opt = { mode: 'readwrite' };
    if ((await h.queryPermission(opt)) === 'granted') return true;
    return (await h.requestPermission(opt)) === 'granted';
}

async function writeTo(h, text) {
    const w = await h.createWritable();
    await w.write(text);
    await w.close();
}

/* 儲存：有綁檔且裝得下就覆蓋它，否則跳「另存新檔」並改綁到新檔。
   回傳 { name, as }（as＝這次是另存新檔），使用者取消回傳 null，其他錯誤往外丟。 */
export async function saveDisk() {
    const text = cur ? contentFor(cur.name) : null;
    if (cur && text !== null) {
        if (!(await canWrite(cur))) throw new Error('permission');
        await writeTo(cur, text);
        return { name: cur.name, as: false };
    }
    const puml = isPuml();
    let h;
    try {
        h = await window.showSaveFilePicker({
            suggestedName: `${fileBase()}.${puml ? 'puml' : 'json'}`,
            types: [puml ? { description: 'PlantUML', accept: { 'text/plain': ['.puml'] } }
                         : { description: 'JSON', accept: { 'application/json': ['.json'] } }],
        });
    } catch (e) {
        if (e && e.name === 'AbortError') return null;
        throw e;
    }
    await writeTo(h, contentFor(h.name) ?? (puml ? currentPuml() : jsonText()));
    await bind(h);
    return { name: h.name, as: true };
}
