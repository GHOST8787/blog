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
            || /^(if\s*\(|else\s*if\s*\(|elseif\s*\(|endif\b|repeat\b|while\s*\(|endwhile\b|fork\b|end\s*fork\b|partition\b)/i.test(s)) act++;
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
const GROUPS = ['alt', 'opt', 'loop', 'par', 'break', 'critical', 'group'];
const unq = (s) => String(s || '').trim().replace(/^"(.*)"$/, '$1');
const qt = (s) => (/^[^\s"<>:\-[\],]+$/.test(s) ? s : `"${s}"`);
const inNL = (s) => String(s).replace(/\\n/g, '\n');
const outNL = (s) => String(s).split('\n').join('\\n');
const MSG_RE = /^("[^"]+"|[^\s"<>:\-[\]]+)\s*([xo]?<{0,2}-(?:\[[^\]]*\])?-?(?:>{1,2}|[\\/]{1,2})?[xo]?)\s*("[^"]+"|[^\s"<>:\-[\]+*!]+)\s*(\+\+|--|\*\*|!!)?\s*(?::\s?(.*))?$/;
const NOTE_RE = /^(note|hnote|rnote)\s+(left of|right of|over|left|right)\b\s*([^:]*?)\s*(?::\s?(.*))?$/i;

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
        r.sig = rowSig(r);
        rows.push(r);
        return r;
    };

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i], t = raw.trim();
        let m;
        if (!t) { pre.push(raw); continue; }
        if (t.startsWith("/'")) { const j = t.includes("'/") ? i : until(i, /'\/\s*$/); keepRaw(i, j); i = j; continue; }
        if (t.startsWith("'") || /^@(start|end)uml/i.test(t)) { pre.push(raw); continue; }
        if (/^<style>/i.test(t)) { const j = until(i, /<\/style>/i); keepRaw(i, j); i = j; continue; }
        if (/^skinparam\b.*\{\s*$/i.test(t)) { const j = until(i, /^\}$/); keepRaw(i, j); i = j; continue; }
        if (/^(legend|header|footer|center\s+footer|right\s+footer|left\s+footer)(\s+(left|right|center|top|bottom))*$/i.test(t)) {
            const kw = t.match(/(legend|header|footer)/i)[1].toLowerCase();
            const j = until(i, new RegExp('^end' + kw + '$', 'i')); keepRaw(i, j); i = j; continue;
        }
        if ((m = t.match(/^title\s+(.*)$/i))) { name = m[1].trim(); hasTitle = true; pre.push({ title: true, text: raw }); continue; }
        if ((m = t.match(new RegExp('^(' + SHAPES.join('|') + ')\\s+(.+)$', 'i')))) {
            const rm = m[2].match(/^("[^"]+"|[^\s"]+)(?:\s+as\s+("[^"]+"|[^\s"]+))?(.*)$/i);
            let id, nm, nameFirst = true;
            if (rm[2] && /^"/.test(rm[2])) { id = unq(rm[1]); nm = unq(rm[2]); nameFirst = false; }
            else if (rm[2]) { nm = unq(rm[1]); id = unq(rm[2]); }
            else { nm = id = unq(rm[1]); }
            const shape = m[1].toLowerCase();
            let p = pm.get(id);
            if (!p) { p = { id }; pm.set(id, p); parts.push(p); }
            Object.assign(p, { name: nm, shape, kind: shape === 'actor' ? 'actor' : 'object', decl: true,
                src: raw, pre, tail: rm[3] || '', nameFirst, quoted: /^"/.test(rm[1]) });
            pre = [];
            p.sig = partSig(p);
            continue;
        }
        if ((m = t.match(/^==\s*(.*?)\s*==$/))) { addRow({ kind: 'phase', text: inNL(m[1]) }, raw); continue; }
        if ((m = t.match(/^\.\.\.\s*(.*?)\s*(?:\.\.\.)?$/))) { addRow({ kind: 'phase', delay: true, text: inNL(m[1]) }, raw); continue; }
        if ((m = t.match(new RegExp('^(' + GROUPS.join('|') + ')\\b\\s*(.*)$', 'i')))) {
            const b = { id: nid('b'), kind: m[1].toLowerCase(), label: m[2], from: rows.length, to: -1, elses: [], src: raw, pre };
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
            lastMsg.act.push({ op, id, src: raw, pre, after: lastMsg === rows[rows.length - 1] ? endsSinceRow : 0 });
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
        if ((m = t.match(NOTE_RE))) {
            const kw = m[1], pos = m[2].toLowerCase();
            let tg = m[3] ? m[3].split(',').map(unq).filter(Boolean) : [];
            if (!tg.length && lastMsg) tg = [pos === 'left' ? lastMsg.from : lastMsg.to];
            if (!tg.length) { keepRaw(i, i, true); continue; }
            tg.forEach(usePart);
            let text, j = i;
            if (m[4] === undefined) {
                j = until(i, /^end\s*(note|hnote|rnote)$/i);
                text = lines.slice(i + 1, j).map((s) => s.trim()).join('\n');
            } else text = inNL(m[4]);
            const r = addRow({ kind: 'note', kw, pos: pos.replace(/ of$/, ''), at: tg[0], at2: tg[1] || '', text }, raw);
            if (j > i) { r.srcLines = lines.slice(i, j + 1); r.src = null; }
            i = j;
            continue;
        }
        if ((m = t.match(MSG_RE)) && /[<>\\/]/.test(m[2])) {
            const a = m[2], left = a.includes('<');
            const from = usePart(left ? m[3] : m[1]), to = usePart(left ? m[1] : m[3]);
            const dashed = (a.replace(/\[[^\]]*\]/, '').match(/-/g) || []).length >= 2;
            const open = />>|<<|[\\/]/.test(a);
            const col = a.match(/\[([^\]]*)\]/);
            const mk = a.match(/^([xo])|([xo])$/);
            let text = m[5] === undefined ? '' : inNL(m[5]), tone = 'solid';
            if (text.startsWith('※')) { tone = 'dash'; text = text.slice(1).trim(); }
            const r = addRow({
                kind: 'msg', from, to, type: dashed ? 'return' : (open ? 'async' : 'sync'), tone, text,
                openHead: open && dashed, color: col ? col[1] : '', mark: mk ? (mk[1] || mk[2]) : '', mod: m[4] || '',
            }, raw);
            if (r.mod === '++') calls.push({ callee: to, caller: from });
            if (r.mod === '--') { const k = calls.map((c) => c.callee).lastIndexOf(from); if (k >= 0) calls.splice(k, 1); }
            lastMsg = r;
            continue;
        }
        // 認得、但時序圖畫不出來的：照原文保留
        if (/^(autonumber|skinparam|hide|show|!|scale|newpage|caption|mainframe|box\b|end\s+box|\|\|\||\|\|\d+\|\||ref\s+over|create\s|destroy\s|delay)/i.test(t)) {
            if (/^ref\s+over\s+[^:]+$/i.test(t)) { const j = until(i, /^end\s*ref$/i); keepRaw(i, j); i = j; continue; }
            keepRaw(i, i);
            continue;
        }
        keepRaw(i, i, true);
    }
    while (bstack.length) {   // 少了 end：當作在最後一列結束
        const b = bstack.pop(); b.to = rows.length - 1; b.endSrc = null; b.endPre = [];
        if (b.to >= b.from) blocks.push(b);
    }
    const d = { name, parts, rows, blocks };
    d.puml = { orig: src, nl, tail: pre, hasTitle, titleName: name, sig0: modelSig(d) };
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
    ]);
}

/* ── 時序圖：工具資料 → PUML ──────────────── */
const ARROW = { sync: '->', return: '-->', async: '->>' };
function arrowOf(r) {
    let a = ARROW[r.type] || '->';
    if (r.type === 'return' && r.openHead) a = '-->>';
    if (r.color) a = a.replace(/^-/, `-[${r.color}]`);
    if (r.mark) a += r.mark;
    return a;
}
const partLine = (p, ind) => {
    const shape = p.kind === 'actor' ? 'actor' : (p.shape && p.shape !== 'actor' ? p.shape : 'participant');
    const nm = p.quoted || /[\s"]/.test(p.name) ? `"${p.name}"` : qt(p.name);
    const id = p.name === p.id ? qt(p.id) : (p.nameFirst === false ? `${qt(p.id)} as "${p.name}"` : `${nm} as ${qt(p.id)}`);
    return `${ind}${shape} ${id}${p.tail || ''}`;
};
function rowLines(r, ind) {
    if (r.kind === 'phase') return [r.delay ? (r.text ? `${ind}...${outNL(r.text)}...` : `${ind}...`) : `${ind}== ${outNL(r.text)} ==`];
    if (r.kind === 'note') {
        const kw = r.kw || 'note', pos = r.pos || 'right';
        const where = pos === 'over' ? `over ${qt(r.at)}${r.at2 ? ', ' + qt(r.at2) : ''}` : `${pos} of ${qt(r.at)}`;
        const ls = String(r.text).split('\n');
        if (ls.length === 1) return [`${ind}${kw} ${where} : ${r.text}`];
        return [`${ind}${kw} ${where}`, ...ls.map((s) => `${ind}  ${s}`), `${ind}end ${kw}`];
    }
    const tag = r.tone === 'dash' ? '※ ' : '';
    // return 只在兩端都沒被改過時沿用；改了端點就寫成明確的箭頭
    if (r.ret && r.from === r.retFrom && r.to === r.retTo && r.type === 'return') return [`${ind}return${r.text || tag ? ' ' + tag + outNL(r.text) : ''}`];
    const txt = tag + outNL(r.text);
    return [`${ind}${qt(r.from)} ${arrowOf(r)} ${qt(r.to)}${r.mod ? ' ' + r.mod : ''}${txt ? ' : ' + txt : ''}`];
}
const indOf = (line, fallback) => (typeof line === 'string' ? line.match(/^\s*/)[0] : fallback);

export function toPumlSeq() {
    const P = S.puml;
    // 原檔沒有 title 時，圖名只拿來當下載檔名，不寫進 PUML，也不算改動
    const d = { name: P && !P.hasTitle ? '' : S.name, parts: S.parts, rows: S.rows, blocks: S.blocks };
    if (P && typeof P.orig === 'string' && modelSig(d) === P.sig0) return P.orig;
    const out = [];
    const emitPre = (arr) => (arr || []).forEach((x) => {
        if (typeof x === 'string') { out.push(x); return; }
        if (x.title) {   // 標題那一行：圖名改過才重寫
            if ((S.name || '') === (P ? P.titleName : '')) out.push(x.text);
            else if (S.name) out.push(`${indOf(x.text, '')}title ${S.name}`);
        }
    });
    if (!P) { out.push('@startuml'); if (S.name) out.push(`title ${S.name}`); }
    S.parts.forEach((p) => {
        emitPre(p.pre);
        if (p.decl && p.src && partSig(p) === p.sig) out.push(p.src);
        else if (p.decl || !P || partSig(p) !== p.sig) out.push(partLine(p, indOf(p.src, '')));
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
                out.push(b.src && blockSig(b) === b.sig ? b.src : `${indOf(b.src, bi)}${b.kind}${b.label ? ' ' + b.label : ''}`);
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
    return out.join(P ? P.nl : '\n');

    function emitElse(e, b, i) {
        emitPre(e.pre);
        const bi = '  '.repeat(S.blocks.filter((q) => q !== b && q.from <= b.from && q.to >= b.to && (q.from < b.from || q.to > b.to)).length);
        out.push(e.src && elseSig(e) === e.sig ? e.src : `${indOf(e.src, bi)}else${e.label ? ' ' + e.label : ''}`);
    }
}
