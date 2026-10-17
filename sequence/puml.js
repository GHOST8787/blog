// PUML（PlantUML）進出：判斷貼進來／開進來的是哪一種圖，以及時序圖的 PUML 讀寫。
// 活動圖的讀寫在 act.js。這裡不畫圖、不綁事件。
//
// 時序圖讀進來會變成工具自己的資料（parts / rows / blocks），鍵盤操作全部沿用。
// 為了「匯出不漏」，每個元素記住自己原本那一行（src），沒改過就原樣寫回；
// 圖上畫不出來的語法（skinparam、註解、autonumber…）掛在下一個元素的 pre 上，照原位置放回。
// 整張圖完全沒動過時，直接吐回原檔，一個位元組都不差。

import { S, nid } from './state.js';

/* ── 判斷是哪一種 ─────────────────────────── */
const PUML_EXT = /\.(puml|plantuml|pu|iuml|wsd)$/i;
const MERMAID_OTHER = /^(flowchart|graph|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4\w*)\b/;

export function detect(text, fname = '') {
    const t = String(text || '').replace(/^﻿/, '');
    const lines = t.split(/\r?\n/);
    const isPuml = PUML_EXT.test(fname) || /^\s*@start\w+/im.test(t);
    if (!isPuml) {
        const first = lines.map((s) => s.trim()).find((s) => s && !s.startsWith('%%'));
        if (first && MERMAID_OTHER.test(first)) return { fmt: 'mermaid', type: 'other', name: first.split(/\s/)[0] };
        return { fmt: 'mermaid', type: 'seq' };
    }
    const st = t.match(/^\s*@start(\w+)/im);
    if (st && st[1].toLowerCase() !== 'uml') return { fmt: 'puml', type: 'other', name: '@start' + st[1] };
    let act = 0, seq = 0, other = '';
    for (const raw of lines) {
        const s = raw.trim();
        if (!s || s.startsWith("'")) continue;
        if (/^(start|stop|kill|detach)$/i.test(s) || /^:/.test(s) || /^\|[^|]+\|/.test(s)
            || /^(if\s*\(|else\s*if\s*\(|elseif\s*\(|endif\b|repeat\b|while\s*\(|endwhile\b|fork\b|end\s*fork\b|partition\b|switch\s*\()/i.test(s)
            || /^[-*]+\s+[^->\s]/.test(s)) act++;
        else if (/^(participant|actor|boundary|control|entity|database|collections|queue)\s/i.test(s)
            || /^("[^"]+"|[^\s"<>:-]+)\s*[xo]?<{0,2}-{1,2}(\[[^\]]*\])?-?(>{1,2}|[\\/]{1,2})/.test(s)
            || /^(activate|deactivate|return|alt|loop|opt|par|break|critical)\b/i.test(s)) seq++;
        else if (/^(class|interface|enum|abstract|usecase|component|node|state|object|package|rectangle|entity\s+\S+\s*\{)\b/i.test(s)) other = other || s.split(/\s/)[0];
    }
    if (act && act >= seq) return { fmt: 'puml', type: 'act' };
    if (seq) return { fmt: 'puml', type: 'seq' };
    if (other) return { fmt: 'puml', type: 'other', name: other };
    return { fmt: 'puml', type: 'seq' };
}

/* ── 時序圖：PUML → 工具資料 ──────────────── */
const SHAPES = ['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue'];
const GROUPS = ['alt', 'opt', 'loop', 'par', 'break', 'critical', 'group', 'partition'];
const unq = (s) => String(s || '').trim().replace(/^"(.*)"$/, '$1');
const qt = (s) => (/^[^\s"<>:\-[\],]+$/.test(s) ? s : `"${s}"`);
const inNL = (s) => String(s).replace(/\\n/g, '\n');
const outNL = (s) => String(s).split('\n').join('\\n');
const ARW = String.raw`(?:\(\d+\))?[xo]?(?:<{1,2}|[\\/]{1,2})?-(?:\[[^\]]*\])?-?(?:>{1,2}|[\\/]{1,2})?[xo]?(?:\(\d+\))?`;
const MODS = String.raw`(--\+\+|\+\+|--|\*\*|!!)`;
const MSG_RE = new RegExp(String.raw`^("[^"]+"|[^\s"<>:\-[\]]+)\s*(${ARW})\s*("[^"]+"|[^\s"<>:\-[\]+*!]+)\s*${MODS}?\s*(?::\s?(.*))?$`);
/* 把一支 PUML 箭頭拆成五段：起點記號 x/o、起點的頭、線（含 [#色]）、終點的頭、終點記號；(10) 是斜箭頭。
   頭只在左邊（<- //-- 這種）＝箭頭往左指，發送方是右邊那一個。 */
function decomp(a0) {
    const sl = a0.match(/\((\d+)\)/), a = a0.replace(/\(\d+\)/g, '');
    const m = a.match(/^([xo])?(<<|<|\\\\|\\|\/\/|\/)?(-+(?:\[[^\]]*\])?-*)(>>|>|\\\\|\\|\/\/|\/)?([xo])?$/);
    if (!m) return null;
    const [, ld = '', lh = '', body, rh = '', rd = ''] = m;
    const rev = !!lh && !rh, head = rev ? lh : rh;
    const dashed = (body.replace(/\[[^\]]*\]/, '').match(/-/g) || []).length >= 2;
    const open = head === '>>' || head === '<<', half = /^[\\/]+$/.test(head);
    const col = body.match(/\[([^\]]*)\]/);
    const o = {
        rev, type: dashed ? 'return' : (open || half ? 'async' : 'sync'), openHead: open && dashed,
        color: col ? col[1] : '', mark: rev ? ld : rd, markFrom: rev ? rd : ld,
    };
    if (half) {
        // 右邊的 \ 與左邊的 / 鉤在線的上面，反過來在下面；兩撇的是只有一撇、不填滿
        o.half = (head[0] === '\\') !== rev ? 'top' : 'bottom';
        o.stick = head.length === 2;
    }
    if (lh && rh) { o.both = true; if (lh === '<<') o.bothOpen = true; }
    if (sl) o.slant = +sl[1];
    return o;
}
const NOTE_RE = /^(note|hnote|rnote|ref)\s+(left of|right of|over|left|right)\b\s*([^:]*?)\s*(?::\s?(.*))?$/i;

/* 每種元素的「指紋」：沒變就用原本那一行 */
export const partSig = (p) => JSON.stringify([p.id, p.name, p.kind, p.shape || '']);
export const rowSig = (r) => JSON.stringify([r.kind, r.from, r.to, r.type, r.tone, r.text, r.at, r.at2, r.pos, !!r.delay]);
export const blockSig = (b) => JSON.stringify([b.kind, b.label]);
const elseSig = (e) => JSON.stringify([e.label]);

export function parseSeqPuml(text) {
    const src = String(text).replace(/^﻿/, '');
    const nl = src.includes('\r\n') ? '\r\n' : '\n';
    const lines = src.split(/\r?\n/);
    const parts = [], pm = new Map(), rows = [], blocks = [], bstack = [], calls = [];
    const unknown = [];
    let pre = [], kept = 0, name = '', hasTitle = false, lastMsg = null;
    const boxes = [], legend = [];
    let header = '', footer = '';
    let box = null, hasLegend = false;
    const boxStack = [];
    const inBoxes = (id) => boxStack.forEach((bx) => { if (!bx.ids.includes(id)) bx.ids.push(id); });
    // autonumber：起始值、間隔、格式記在 autoCfg；stop 到 resume 之間的訊息不編號
    let autoCfg = null, numOn = true;
    const pendCreate = [];      // create X：下一條指到 X 的訊息就是建立它的那一條
    // 只影響畫面、不是一列的設定：外框、圖說、時長標示、間距、自動執行長條、藏起沒用到的參與者
    const X = { mainframe: '', caption: '', durations: [], skin: {}, style: {}, ignoreNewpage: false, teoz: false, handwritten: false };
    let gap = 0, autoAct = false, hideUnlinked = false, pendNum = null;
    // skinparam 名稱不分大小寫；skinparam sequence { ArrowColor red } 這種區塊，裡面的名字前面接上區塊名
    const skinLine = (s, prefix = '') => {
        const sm = s.trim().match(/^([\w.]+)\s*(?:<<[^>]*>>)?\s+(.+?)\s*$/);
        if (sm) X.skin[(prefix + sm[1]).toLowerCase()] = sm[2].trim();
    };

    const usePart = (raw) => {
        const id = unq(raw);
        if (!pm.has(id)) {
            const p = { id, name: id, kind: 'object', shape: 'participant', decl: false, pre: [] };
            p.sig = partSig(p);
            pm.set(id, p); parts.push(p);
        }
        return id;
    };
    const keepRaw = (from, to, isUnknown) => {
        for (let k = from; k <= to; k++) pre.push(lines[k]);
        if (lines.slice(from, to + 1).some((s) => s.trim())) kept += to - from + 1;
        if (isUnknown) unknown.push({ line: from + 1, text: lines[from].trim() });
    };
    const until = (from, re) => { let j = from + 1; while (j < lines.length && !re.test(lines[j].trim())) j++; return Math.min(j, lines.length - 1); };
    let endsSinceRow = 0;     // 上一列之後收了幾個區塊：activate／deactivate 寫在 end 後面時要記住
    const addRow = (r, line) => {
        endsSinceRow = 0;
        r.id = nid('r'); r.src = line; r.pre = pre; pre = [];
        if (!r.tone) r.tone = 'solid';
        if (r.kind === 'msg' && autoCfg && !numOn) r.noOff = true;
        if (r.kind === 'msg' && pendNum) { r.num = pendNum; pendNum = null; }
        if (gap) { r.gap = gap; gap = 0; }
        r.sig = rowSig(r);
        rows.push(r);
        return r;
    };

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        let t = raw.trim(), m;
        if (!t) { pre.push(raw); continue; }
        if (t.startsWith("/'")) { const j = t.includes("'/") ? i : until(i, /'\/\s*$/); keepRaw(i, j); i = j; continue; }
        if (t.startsWith("'") || /^@(start|end)uml/i.test(t)) { pre.push(raw); continue; }
        if (/^<style>/i.test(t)) {
            // <style> 只讀這個工具畫得出來的幾項：元素 { 屬性 值 }
            const j = until(i, /<\/style>/i);
            const stack = [];
            lines.slice(i + 1, j).forEach((s0) => {
                const s = s0.trim();
                let sm;
                if ((sm = s.match(/^([\w.\s,]+?)\s*\{\s*$/))) stack.push(sm[1].trim().toLowerCase());
                else if (s === '}') stack.pop();
                else if ((sm = s.match(/^(\w+)\s+(.+?)\s*;?$/)) && stack.length) X.style[`${stack[stack.length - 1]}.${sm[1].toLowerCase()}`] = sm[2];
            });
            keepRaw(i, j); i = j; continue;
        }
        if ((m = t.match(/^skinparam\s+(\w*)\s*\{\s*$/i))) {
            const j = until(i, /^\}$/);
            lines.slice(i + 1, j).forEach((s) => skinLine(s, m[1]));
            keepRaw(i, j); i = j; continue;
        }
        if ((m = t.match(/^skinparam\s+(.+)$/i))) { skinLine(m[1]); keepRaw(i, i); continue; }
        if (/^ignore\s+newpage\b/i.test(t)) { X.ignoreNewpage = true; keepRaw(i, i); continue; }
        if ((m = t.match(/^(hide|show)\s+footbox\b/i))) { X.hideFootbox = /hide/i.test(m[1]); keepRaw(i, i); continue; }
        if (/^!pragma\s+teoz\s+true\b/i.test(t)) { X.teoz = true; keepRaw(i, i); continue; }
        if (/^!option\s+handwritten\s+true\b/i.test(t)) { X.handwritten = true; keepRaw(i, i); continue; }
        if (/^(legend|header|footer|center\s+footer|right\s+footer|left\s+footer)(\s+(left|right|center|top|bottom))*$/i.test(t)) {
            const kw = t.match(/(legend|header|footer)/i)[1].toLowerCase();
            const j = until(i, new RegExp('^end\\s*' + kw + '$', 'i'));
            if (kw === 'legend' && !hasLegend) {
                // 圖例：每一行變成工具圖例的一條（純文字、各自一行）；== 標題 == 只留字，---- 分隔線不畫
                hasLegend = true;
                lines.slice(i + 1, j).forEach((s) => {
                    const x = s.trim();
                    if (!x) return;
                    // 分隔線留在資料裡（改圖例後匯出才不會少），圖上不畫
                    if (/^(-{2,}|={2,}|\.{2,}|_{2,})$/.test(x)) { legend.push({ tone: 'text', sep: true, text: x, raw: x }); return; }
                    legend.push({ tone: 'text', line: true, text: x.replace(/^==\s*(.*?)\s*==$/, '$1'), raw: x });
                });
                if (lines.slice(i, j + 1).some((s) => s.trim())) kept += j - i + 1;
                pre.push({ legend: true, lines: lines.slice(i, j + 1) });
                i = j; continue;
            }
            const body = lines.slice(i + 1, j).map((s) => s.trim()).filter(Boolean).join('\n');
            if (kw === 'header') header = body; else if (kw === 'footer') footer = body;
            keepRaw(i, j); i = j; continue;
        }
        // 頁首／頁尾一行的寫法
        if ((m = t.match(/^(?:(?:left|right|center)\s+)?(header|footer)\s+(.+)$/i))) {
            if (/^header$/i.test(m[1])) header = m[2].trim(); else footer = m[2].trim();
            keepRaw(i, i); continue;
        }
        // box "名稱" #色 … end box：框住中間宣告的參與者
        // box 可以包 box（teoz）：外層也算有包到裡面宣告的參與者
        if ((m = t.match(/^box\b\s*("[^"]*"|[^#]*?)?\s*(#\S+)?\s*$/i))) {
            box = { label: unq(m[1] || ''), color: m[2] || '', ids: [], depth: boxStack.length };
            boxStack.push(box); boxes.push(box); keepRaw(i, i); continue;
        }
        if (/^end\s*box$/i.test(t)) { boxStack.pop(); box = boxStack[boxStack.length - 1] || null; keepRaw(i, i); continue; }
        if (/^title$/i.test(t)) {
            const j = until(i, /^end\s*title$/i);
            name = lines.slice(i + 1, j).map((s) => s.trim()).filter(Boolean).join(' ');
            hasTitle = true; pre.push({ title: true, text: raw, lines: lines.slice(i, j + 1) });
            i = j; continue;
        }
        if ((m = t.match(/^title\s+(.*)$/i))) { name = m[1].trim(); hasTitle = true; pre.push({ title: true, text: raw }); continue; }
        if ((m = t.match(new RegExp('^(' + SHAPES.join('|') + ')\\s+(.+)$', 'i')))) {
            const rm = m[2].match(/^("[^"]+"|[^\s"]+)(?:\s+as\s+("[^"]+"|[^\s"]+))?(.*)$/i);
            if (!rm) { keepRaw(i, i, true); continue; }
            let id, nm, nameFirst = true;
            if (rm[2] && /^"/.test(rm[2])) { id = unq(rm[1]); nm = unq(rm[2]); nameFirst = false; }
            else if (rm[2]) { nm = unq(rm[1]); id = unq(rm[2]); }
            else { nm = id = unq(rm[1]); }
            const shape = m[1].toLowerCase();
            let p = pm.get(id);
            if (!p && !/^\s*\[\s*$/.test(rm[3] || '')) { p = { id }; pm.set(id, p); parts.push(p); }
            let tail = rm[3] || '';
            // participant P [ 多行內容 ]：=標題 變粗體、---- 分隔線不畫，其餘每行一行
            if (/^\s*\[\s*$/.test(tail)) {
                const j = until(i, /^\]$/);
                const body = lines.slice(i + 1, j).map((s) => s.trim()).filter((s) => s && !/^(-{2,}|={2,}|\.{2,}|_{2,})$/.test(s));
                if (!pm.has(id)) { p = { id }; pm.set(id, p); parts.push(p); }
                Object.assign(pm.get(id), { name: body.map((s) => s.replace(/^=+\s*(.*)$/, '**$1**')).join('\n'), shape, kind: shape === 'actor' ? 'actor' : 'object',
                    decl: true, src: null, srcLines: lines.slice(i, j + 1), pre, tail: '', bracket: true, nameFirst: true, quoted: false, color: '', stereo: '' });
                inBoxes(id);
                pre = [];
                pm.get(id).sig = partSig(pm.get(id));
                i = j;
                continue;
            }
            const pc = tail.match(/(?:^|\s)(#[^\s<>]+)/), ps = tail.match(/<<\s*(?:\(\s*(\S)\s*,\s*([^)]*?)\s*\)\s*)?(.*?)\s*>>/);
            const po = tail.match(/\border\s+(-?\d+)/i);
            Object.assign(p, { name: nm, shape, kind: shape === 'actor' ? 'actor' : 'object', decl: true,
                src: raw, pre, tail, nameFirst, quoted: /^"/.test(rm[1]), color: pc ? pc[1] : '', stereo: ps ? ps[3] : '',
                spot: ps && ps[1] ? { ch: ps[1], color: ps[2] } : null, ...(po ? { order: +po[1] } : {}) });
            inBoxes(id);
            pre = [];
            p.sig = partSig(p);
            continue;
        }
        if ((m = t.match(/^==\s*(.*?)\s*==$/))) { addRow({ kind: 'phase', text: inNL(m[1]) }, raw); continue; }
        // newpage：PUML 會拆成下一張圖；這裡畫成一條分頁線，標題寫在線上
        if ((m = t.match(/^newpage\b\s*(.*)$/i))) { addRow({ kind: 'phase', page: true, text: inNL(m[1].trim()) }, raw); continue; }
        // ||| 與 ||45||：下一列往下多空一段
        if ((m = t.match(/^\|\|(\d*)\|\|$/))) { gap += m[1] ? +m[1] : 20; keepRaw(i, i); continue; }
        if ((m = t.match(/^autoactivate\s+(on|off)\b/i))) { autoAct = /on/i.test(m[1]); keepRaw(i, i); continue; }
        if ((m = t.match(/^mainframe\s+(.*)$/i))) { X.mainframe = m[1].trim(); keepRaw(i, i); continue; }
        if ((m = t.match(/^caption\s+(.*)$/i))) { X.caption = m[1].trim(); keepRaw(i, i); continue; }
        if (/^hide\s+unlinked\b/i.test(t)) { hideUnlinked = true; keepRaw(i, i); continue; }
        if ((m = t.match(/^\.\.\.\s*(.*?)\s*(?:\.\.\.)?$/))) { addRow({ kind: 'phase', delay: true, text: inNL(m[1]) }, raw); continue; }
        if ((m = t.match(new RegExp('^(' + GROUPS.join('|') + ')\\b\\s*(.*)$', 'i')))) {
            const after = t.slice(m[1].length), dm = after.match(/^\s*(?:#[^\s#]+\s*)+/);
            const b = { id: nid('b'), kind: m[1].toLowerCase(), label: dm ? after.slice(dm[0].length).trim() : m[2], deco: dm ? dm[0] : '',
                from: rows.length, to: -1, elses: [], src: raw, pre };
            pre = [];
            b.sig = blockSig(b);
            bstack.push(b);
            continue;
        }
        if ((m = t.match(/^else\b\s*(.*)$/i)) && bstack.length) {
            const e = { at: rows.length, label: m[1], src: raw, pre };
            pre = [];
            e.sig = elseSig(e);
            bstack[bstack.length - 1].elses.push(e);
            continue;
        }
        if (/^end$/i.test(t) && bstack.length) {
            const b = bstack.pop();
            b.to = rows.length - 1; b.endSrc = raw; b.endPre = pre; pre = [];
            if (b.to >= b.from) { blocks.push(b); endsSinceRow++; }
            else {   // 空的區塊沒有列可以掛，原文整段收回去當保留文字
                const back = [...b.pre, b.src];
                b.elses.forEach((e) => back.push(...e.pre, e.src));
                back.push(...b.endPre, b.endSrc);
                pre = back;
            }
            continue;
        }
        if ((m = t.match(/^(activate|deactivate)\s+("[^"]+"|\S+)/i)) && lastMsg) {
            const op = m[1].toLowerCase(), id = usePart(m[2]);
            lastMsg.act = lastMsg.act || [];
            const ac = t.match(/\s(#\S+)\s*$/);
            lastMsg.act.push({ op, id, src: raw, pre, color: ac ? ac[1] : '', after: lastMsg === rows[rows.length - 1] ? endsSinceRow : 0 });
            pre = [];
            if (op === 'activate') calls.push({ callee: id, caller: lastMsg.to === id ? lastMsg.from : null });
            else { const k = calls.map((c) => c.callee).lastIndexOf(id); if (k >= 0) calls.splice(k, 1); }
            continue;
        }
        if ((m = t.match(/^return\b\s*(.*)$/i))) {
            const top = calls.pop();
            const caller = top && (top.caller || (lastMsg ? lastMsg.from : null));
            if (top && caller && caller !== top.callee) {
                lastMsg = addRow({ kind: 'msg', from: top.callee, to: caller, type: 'return', ret: true, retFrom: top.callee, retTo: caller, text: inNL(m[1]) }, raw);
                continue;
            }
            keepRaw(i, i, true);
            continue;
        }
        let par = '';
        if ((m = t.match(/^([&/])\s*(.+)$/)) && !/^\/'/.test(t)) { par = m[1]; t = m[2]; }
        if ((m = t.match(/^(note|hnote|rnote)\s+across\b\s*(#\S+)?\s*(?::\s?(.*))?$/i)) && parts.length) {
            let text, j = i;
            if (m[3] === undefined) {
                j = until(i, /^end\s*(note|hnote|rnote)$/i);
                text = lines.slice(i + 1, j).map((s) => s.trim()).join('\n');
            } else text = inNL(m[3]);
            const r = addRow({ kind: 'note', kw: m[1].toLowerCase(), pos: 'over', at: parts[0].id, at2: parts[parts.length - 1].id,
                across: true, ncolor: m[2] || '', text, ...(par ? { par } : {}) }, raw);
            if (j > i) { r.srcLines = lines.slice(i, j + 1); r.src = null; }
            i = j;
            continue;
        }
        if ((m = t.match(NOTE_RE))) {
            const kw = m[1], pos = m[2].toLowerCase();
            let tgs = m[3] || '', ncolor = '';
            const cm = tgs.match(/\s*(#[^\s,]+)\s*$/);
            if (cm) { ncolor = cm[1]; tgs = tgs.slice(0, cm.index); }
            let tg = tgs ? tgs.split(',').map(unq).filter(Boolean) : [];
            if (!tg.length && lastMsg) tg = [pos === 'left' ? lastMsg.from : lastMsg.to];
            if (!tg.length) { keepRaw(i, i, true); continue; }
            tg.forEach(usePart);
            let text, j = i;
            if (m[4] === undefined) {
                j = until(i, /^end\s*(note|hnote|rnote|ref)$/i);
                text = lines.slice(i + 1, j).map((s) => s.trim()).join('\n');
            } else text = inNL(m[4]);
            const r = addRow({ kind: 'note', kw, pos: pos.replace(/ of$/, ''), at: tg[0], at2: tg[1] || '', ncolor, text, ...(par ? { par } : {}) }, raw);
            if (j > i) { r.srcLines = lines.slice(i, j + 1); r.src = null; }
            i = j;
            continue;
        }
        // teoz 的錨點 {名稱}：訊息照畫、錨點原文留著；{a} <-> {b} 的時長畫不出來，列進報告
        let anchor = '';
        if ((m = t.match(/^\{([^}]*)\}\s*<?-+>?\s*\{([^}]*)\}\s*(?::\s?(.*))?$/))) {
            X.durations.push({ a: m[1].trim(), b: m[2].trim(), text: inNL(m[3] || '') });
            keepRaw(i, i);
            continue;
        }
        if ((m = t.match(/^(\{[^}]*\})\s*(.+)$/))) {
            if (/\{[^}]*\}/.test(m[2])) { keepRaw(i, i, true); continue; }
            anchor = m[1] + ' '; t = m[2];
        }
        // 從圖外進來／出去的短箭頭 ?-> [-> ->] ->?：還不畫，列進報告（不能當成一個叫 ? 的參與者）
        const EP = String.raw`("[^"]+"|[^\s"<>:\-[\]?]+)`;
        const em = t.match(new RegExp(String.raw`^([?[])\s*(${ARW})\s*${EP}\s*${MODS}?\s*(?::\s?(.*))?$`))
            || t.match(new RegExp(String.raw`^${EP}\s*(${ARW})\s*([?\]])\s*${MODS}?\s*(?::\s?(.*))?$`));
        const ea = em && decomp(em[2]);
        if (ea) {
            // [-> A：從左邊圖外進來；A ->]：往右邊圖外出去；? 是不碰到邊、只畫一小段
            const leftSide = /^[?[]$/.test(em[1]), q = leftSide ? em[1] : em[3], id = usePart(leftSide ? em[3] : em[1]);
            let text = em[5] === undefined ? '' : inNL(em[5]), tone = 'solid';
            if (text.startsWith('※')) { tone = 'dash'; text = text.slice(1).trim(); }
            const { rev, ...ar } = ea;
            lastMsg = addRow({
                kind: 'msg', from: id, to: id, tone, text, ...ar, mod: em[4] || '', anchor, ...(par ? { par } : {}),
                ext: { side: leftSide ? 'L' : 'R', inward: leftSide ? !rev : rev, q },
            }, raw);
            continue;
        }
        const ma = (m = t.match(MSG_RE)) && /[<>\\/]/.test(m[2]) && decomp(m[2]);
        if (ma) {
            const { rev, ...ar } = ma;   // 頭在左邊（<- //--）：右邊那個是發送方
            const from = usePart(rev ? m[3] : m[1]), to = usePart(rev ? m[1] : m[3]);
            let text = m[5] === undefined ? '' : inNL(m[5]), tone = 'solid';
            if (text.startsWith('※')) { tone = 'dash'; text = text.slice(1).trim(); }
            const r = addRow({
                kind: 'msg', from, to, tone, text, ...ar, mod: m[4] || '', anchor, ...(par ? { par } : {}),
            }, raw);
            // autoactivate on：每條呼叫自動開執行長條，回傳（虛線）收掉
            if (autoAct && from !== to) {
                if (r.type === 'return') { r.auto = 'close'; const k = calls.map((c) => c.callee).lastIndexOf(from); if (k >= 0) calls.splice(k, 1); }
                else { r.auto = 'open'; calls.push({ callee: to, caller: from }); }
            }
            // ** 建立對方、!! 銷毀對方；前面寫過 create X 的，這一條就是建立 X 的訊息
            const pc = pendCreate.findIndex((c) => c.id === to);
            if (r.mod === '**' || pc >= 0) r.creates = [to];
            if (pc >= 0) {
                const sh = pendCreate[pc].shape, p = pm.get(to);
                if (sh && p) { p.shape = sh.toLowerCase(); p.kind = p.shape === 'actor' ? 'actor' : 'object'; p.sig = partSig(p); }
                pendCreate.splice(pc, 1);
            }
            if (r.mod === '!!') r.destroy = [to];
            if (r.mod === '--' || r.mod === '--++') { const k = calls.map((c) => c.callee).lastIndexOf(from); if (k >= 0) calls.splice(k, 1); }
            if (r.mod === '++' || r.mod === '--++') calls.push({ callee: to, caller: from });
            lastMsg = r;
            continue;
        }
        if ((m = t.match(/^autonumber\b\s*(.*)$/i))) {
            const a = m[1].trim(), f = a.match(/"([^"]*)"/);
            const lv = a.match(/^(\d+(?:\.\d+)+)(?:\s+(\d+))?/), n = a.match(/^(\d+)(?:\s+(\d+))?/), inc = a.match(/^inc\s+([A-Z])\b/i);
            if (/^stop\b/i.test(a)) numOn = false;
            else if (/^resume\b/i.test(a)) {
                numOn = true;
                if (f && autoCfg) autoCfg.fmt = f[1];
                const st = a.match(/^resume\s+(\d+)/i);
                if (st) pendNum = { ...(pendNum || {}), step: +st[1] };
            } else if (inc) pendNum = { ...(pendNum || {}), inc: inc[1].toUpperCase() };
            else if (!autoCfg) {
                autoCfg = { start: n && !lv ? +n[1] : 1, step: (lv || n) && (lv || n)[2] ? +(lv || n)[2] : 1, fmt: f ? f[1] : '' };
                if (lv) autoCfg.levels = lv[1].split('.').map(Number);
            } else {
                // 第二次寫 autonumber 15：從這裡重新起算
                numOn = true;
                if (lv || n) pendNum = { restart: true, start: n && !lv ? +n[1] : 1, step: (lv || n)[2] ? +(lv || n)[2] : 1, ...(lv ? { levels: lv[1].split('.').map(Number) } : {}), ...(f ? { fmt: f[1] } : {}) };
            }
            keepRaw(i, i); continue;
        }
        if ((m = t.match(new RegExp('^create\\s+(?:(' + SHAPES.join('|') + ')\\s+)?("[^"]+"|\\S+)\\s*$', 'i')))) {
            pendCreate.push({ id: unq(m[2]), shape: m[1] || '' });
            keepRaw(i, i); continue;
        }
        if ((m = t.match(/^destroy\s+("[^"]+"|\S+)\s*$/i))) {
            if (lastMsg) (lastMsg.destroy ||= []).push(unq(m[1]));
            keepRaw(i, i); continue;
        }
        // 認得、但時序圖畫不出來的：照原文保留。純樣式（skinparam、hide footbox…）不提，其餘列進報告
        if (/^delay\b/i.test(t)) { keepRaw(i, i, true); continue; }
        if (/^(skinparam|hide|show|!|scale)/i.test(t)) {
            keepRaw(i, i);
            continue;
        }
        keepRaw(i, i, true);
    }
    while (bstack.length) {   // 少了 end：當作在最後一列結束
        const b = bstack.pop(); b.to = rows.length - 1; b.endSrc = null; b.endPre = [];
        if (b.to >= b.from) blocks.push(b);
    }
    // hide unlinked：沒有任何訊息或 Note 用到的參與者不畫；宣告原文掛到前一個參與者後面，匯出照原位置放回
    if (hideUnlinked) {
        const used = new Set();
        rows.forEach((r) => [r.from, r.to, r.at, r.at2, ...(r.act || []).map((a) => a.id)].forEach((x) => x && used.add(x)));
        for (let k = 0; k < parts.length; k++) {
            const p = parts[k];
            if (used.has(p.id)) continue;
            const mine = [...(p.pre || []), ...(p.srcLines || (p.src ? [p.src] : []))];
            const prev = parts.slice(0, k).reverse().find((o) => used.has(o.id));
            if (prev) prev.post = [...(prev.post || []), ...mine];
            else if (parts[k + 1]) parts[k + 1].pre = [...mine, ...(parts[k + 1].pre || [])];
            else if (rows[0]) rows[0].pre = [...mine, ...rows[0].pre];
            else pre = [...mine, ...pre];
            parts.splice(k--, 1);
        }
    }
    // participant X order 10：照數字排，沒寫 order 的照宣告順序
    if (parts.some((p) => p.order !== undefined)) {
        const idx = new Map(parts.map((p, k) => [p, k]));
        parts.sort((a, b) => (a.order ?? idx.get(a)) - (b.order ?? idx.get(b)) || idx.get(a) - idx.get(b));
    }
    const d = { name, parts, rows, blocks, boxes, legend, header, footer, autoCfg, pumlX: X };
    d.puml = { orig: src, nl, tail: pre, hasTitle, titleName: name, sig0: modelSig(d), legendSig: JSON.stringify(legend) };
    d.report = {
        kind: 'pumlSeq', parts: parts.length, msgs: rows.filter((r) => r.kind === 'msg').length,
        notes: rows.filter((r) => r.kind === 'note').length, blocks: blocks.length, kept, unknown,
    };
    return d;
}

/* 整張圖的指紋：完全沒動過就吐回原檔 */
export function modelSig(d) {
    return JSON.stringify([
        d.name || '',
        d.parts.map(partSig),
        d.rows.map((r) => rowSig(r) + JSON.stringify((r.act || []).map((a) => a.op + a.id))),
        d.blocks.map((b) => [blockSig(b), b.from, b.to, (b.elses || []).map((e) => [e.at, e.label])]),
        (d.legend || []).map((l) => [l.tone, l.text]),
    ]);
}

/* ── 時序圖：工具資料 → PUML ──────────────── */
const ARROW = { sync: '->', return: '-->', async: '->>' };
function arrowOf(r) {
    const dash = r.type === 'return' ? '--' : '-';
    let head = r.half ? (r.half === 'top' ? '\\' : '/') : (r.type === 'async' || r.openHead ? '>>' : '>');
    if (r.half && r.stick) head += head;
    const body = r.color ? `-[${r.color}]${dash.slice(1)}` : dash;
    const start = r.both ? (r.bothOpen ? '<<' : '<') : '';
    return `${r.markFrom || ''}${start}${body}${head}${r.mark || ''}${r.slant ? `(${r.slant})` : ''}`;
}
// -> 變 <-、-[#red]-> 變 <-[#red]-、->x 變 x<-
function revArrow(a) {
    const mk = (a.match(/[xo]$/) || [''])[0], core = mk ? a.slice(0, -1) : a, head = (core.match(/>+$/) || [''])[0];
    return mk + '<'.repeat(head.length || 1) + core.slice(0, core.length - head.length);
}
const partLine = (p, ind) => {
    // 多行名字寫成 participant id [ … ] 的寫法
    if (String(p.name).includes('\n')) {
        const shape = p.kind === 'actor' ? 'actor' : (p.shape && p.shape !== 'actor' ? p.shape : 'participant');
        return [`${ind}${shape} ${qt(p.id)} [`, ...String(p.name).split('\n').map((s) => `${ind}  ${s.replace(/^\*\*(.*)\*\*$/, '=$1')}`), `${ind}]`].join('\n');
    }
    const shape = p.kind === 'actor' ? 'actor' : (p.shape && p.shape !== 'actor' ? p.shape : 'participant');
    const nm = p.quoted || /[\s"]/.test(p.name) ? `"${p.name}"` : qt(p.name);
    const id = p.name === p.id ? qt(p.id) : (p.nameFirst === false ? `${qt(p.id)} as "${p.name}"` : `${nm} as ${qt(p.id)}`);
    return `${ind}${shape} ${id}${p.tail || ''}`;
};
function rowLines(r, ind) {
    if (r.kind === 'phase' && r.page) return [`${ind}newpage${r.text ? ' ' + outNL(r.text) : ''}`];
    const pp = r.par ? r.par + ' ' : '';
    if (r.kind === 'phase') return [r.delay ? (r.text ? `${ind}...${outNL(r.text)}...` : `${ind}...`) : `${ind}== ${outNL(r.text)} ==`];
    if (r.kind === 'note') {
        const kw = r.kw || 'note', pos = r.pos || 'right';
        const where = (r.across ? 'across' : pos === 'over' ? `over ${qt(r.at)}${r.at2 ? ', ' + qt(r.at2) : ''}` : `${pos} of ${qt(r.at)}`)
            + (r.ncolor ? ' ' + r.ncolor : '');
        const ls = String(r.text).split('\n');
        if (ls.length === 1) return [`${ind}${pp}${kw} ${where} : ${r.text}`];
        return [`${ind}${pp}${kw} ${where}`, ...ls.map((s) => `${ind}  ${s}`), `${ind}end ${kw}`];
    }
    const tag = r.tone === 'dash' ? '※ ' : '';
    // return 只在兩端都沒被改過時沿用；改了端點就寫成明確的箭頭
    if (r.ret && r.from === r.retFrom && r.to === r.retTo && r.type === 'return') return [`${ind}return${r.text || tag ? ' ' + tag + outNL(r.text) : ''}`];
    const txt = tag + outNL(r.text);
    const tailOf = `${r.mod ? ' ' + r.mod : ''}${txt ? ' : ' + txt : ''}`;
    if (r.ext) {
        // 圖外箭頭：參與者在箭頭指著的那一頭（進來）或出發的那一頭（出去）
        const who = qt(r.ext.inward ? r.to : r.from), a = arrowOf(r), ra = revArrow(a);
        if (r.ext.side === 'L') return [`${ind}${pp}${r.anchor || ''}${r.ext.q}${r.ext.inward ? a : ra} ${who}${tailOf}`];
        return [`${ind}${pp}${r.anchor || ''}${who} ${r.ext.inward ? ra : a}${r.ext.q}${tailOf}`];
    }
    return [`${ind}${pp}${r.anchor || ''}${qt(r.from)} ${arrowOf(r)} ${qt(r.to)}${tailOf}`];
}
const indOf = (line, fallback) => (typeof line === 'string' ? line.match(/^\s*/)[0] : fallback);

export function toPumlSeq() {
    const P = S.puml;
    // 原檔沒有 title 時，圖名只拿來當下載檔名，不寫進 PUML，也不算改動
    const d = { name: P && !P.hasTitle ? '' : S.name, parts: S.parts, rows: S.rows, blocks: S.blocks, legend: S.legend };
    if (P && typeof P.orig === 'string' && modelSig(d) === P.sig0) return P.orig;
    const out = [];
    let legendDone = false;
    // 圖例沒改就原文照放；改過就照現在的內容重寫（標題那種原本有 == == 的行，字沒改就沿用原文）
    const legendLines = (head, end) => {
        legendDone = true;
        if (!S.legend.length) return [];
        const ind = indOf(head, '');
        return [head || 'legend', ...S.legend.map((l) => {
            const keep = l.raw && l.raw.replace(/^==\s*(.*?)\s*==$/, '$1') === l.text;
            return `${ind}  ${keep ? l.raw : l.text}`;
        }), end || `${ind}endlegend`];
    };
    const emitPre = (arr) => (arr || []).forEach((x) => {
        if (typeof x === 'string') { out.push(x); return; }
        if (x.legend) {
            if (JSON.stringify(S.legend) === P.legendSig) { out.push(...x.lines); legendDone = true; }
            else out.push(...legendLines(x.lines[0], x.lines[x.lines.length - 1]));
            return;
        }
        if (x.title) {   // 標題那一行：圖名改過才重寫
            if ((S.name || '') === (P ? P.titleName : '')) out.push(...(x.lines || [x.text]));
            else if (S.name) out.push(`${indOf(x.text, '')}title ${S.name}`);
        }
    });
    if (!P) { out.push('@startuml'); if (S.name) out.push(`title ${S.name}`); }
    S.parts.forEach((p) => {
        emitPre(p.pre);
        if (p.decl && p.srcLines && partSig(p) === p.sig) out.push(...p.srcLines);
        else if (p.decl && p.src && partSig(p) === p.sig) out.push(p.src);
        else if (p.decl || !P || partSig(p) !== p.sig) out.push(...partLine(p, indOf(p.src || (p.srcLines && p.srcLines[0]), '')).split('\n'));
        emitPre(p.post);
    });
    const depthAt = (i) => S.blocks.filter((b) => b.from <= i && b.to >= i).length;
    const sorted = S.blocks.map((b, k) => ({ b, k }));
    for (let i = 0; i < S.rows.length; i++) {
        const ind = '  '.repeat(depthAt(i));
        // 這一列開頭：外層區塊的 else 先，再開新區塊（外層先開）
        sorted.filter((o) => (o.b.elses || []).some((e) => e.at === i) && o.b.from < i)
            .sort((x, y) => (y.b.to - y.b.from) - (x.b.to - x.b.from))
            .forEach((o) => o.b.elses.filter((e) => e.at === i).forEach((e) => emitElse(e, o.b, i)));
        sorted.filter((o) => o.b.from === i)
            .sort((x, y) => (y.b.to - y.b.from) - (x.b.to - x.b.from) || x.k - y.k)
            .forEach((o) => {
                const b = o.b, bi = '  '.repeat(S.blocks.filter((q) => q !== b && q.from <= b.from && q.to >= b.to && (q.from < b.from || q.to > b.to)).length);
                emitPre(b.pre);
                out.push(b.src && blockSig(b) === b.sig ? b.src : `${indOf(b.src, bi)}${(b.kind + (b.deco || ' ') + (b.label || '')).trimEnd()}`);
                (b.elses || []).filter((e) => e.at === i).forEach((e) => emitElse(e, b, i));
            });
        const r = S.rows[i];
        emitPre(r.pre);
        if (r.srcLines && rowSig(r) === r.sig) out.push(...r.srcLines);
        else if (r.src && rowSig(r) === r.sig) out.push(r.src);
        else out.push(...rowLines(r, indOf(r.src || (r.srcLines && r.srcLines[0]), ind)));
        const acts = r.act || [];
        const emitActs = (c) => acts.filter((a) => (a.after || 0) === c).forEach((a) => { emitPre(a.pre); out.push(a.src); });
        emitActs(0);
        // 這一列結束：內層區塊先收；原本寫在第 c 個 end 後面的 activate／deactivate 照原位放回
        let closed = 0;
        sorted.filter((o) => o.b.to === i)
            .sort((x, y) => (x.b.to - x.b.from) - (y.b.to - y.b.from) || y.k - x.k)
            .forEach((o) => {
                if (closed) emitActs(closed);
                const b = o.b, bi = '  '.repeat(S.blocks.filter((q) => q !== b && q.from <= b.from && q.to >= b.to && (q.from < b.from || q.to > b.to)).length);
                (b.elses || []).filter((e) => e.at > i).forEach((e) => emitElse(e, b, i));
                emitPre(b.endPre);
                out.push(b.endSrc || `${bi}end`);
                closed++;
            });
        // 區塊結構改過、對不上原本位置的，放在這一列全部收完之後
        acts.filter((a) => (a.after || 0) >= Math.max(closed, 1)).forEach((a) => { emitPre(a.pre); out.push(a.src); });
    }
    if (P) emitPre(P.tail); else out.push('@enduml');
    // 原檔沒有圖例、在工具裡加了：放在 @enduml 前面
    if (P && !legendDone && S.legend.length) {
        let k = out.length; while (k > 0 && !/^\s*@enduml/i.test(out[k - 1])) k--;
        out.splice(k > 0 ? k - 1 : out.length, 0, ...legendLines('legend', 'endlegend'));
    }
    return out.join(P ? P.nl : '\n');

    function emitElse(e, b, i) {
        emitPre(e.pre);
        const bi = '  '.repeat(S.blocks.filter((q) => q !== b && q.from <= b.from && q.to >= b.to && (q.from < b.from || q.to > b.to)).length);
        out.push(e.src && elseSig(e) === e.sig ? e.src : `${indOf(e.src, bi)}else${e.label ? ' ' + e.label : ''}`);
    }
}
