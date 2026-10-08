// English strings for the sequence diagram tool. Keys must match strings.zh.js.
export const title = 'UML Sequence Diagram';
export const subtitle = 'Keyboard first · files stay on your own machine';

export const btn = {
    save: 'Download .json',
    svg: 'Download .svg',
    open: 'Open .json / .svg',
    png: 'Download .png',
    copy: 'Copy Mermaid text',
    copied: 'Copied',
    clear: 'Clear',
    viewDiagram: 'Diagram',
    viewSplit: 'Split',
    viewSource: 'Source',
};
export const hint = {
    file: 'File',
    view: 'View',
    saveTip: 'Save the whole diagram as .json on your own machine',
    svgTip: 'Download a vector .svg with the diagram data embedded, so it can be opened and edited again',
    openTip: 'Read a .json, or an .svg (exported here restores exactly; from elsewhere it is reverse-engineered and anything unrecognised is listed)',
    pngTip: 'Export the current diagram as a .png image',
    copyTip: 'Copy the Mermaid sequenceDiagram text to the clipboard',
    clearTip: 'Remove every row (Ctrl+Z brings it back)',
};

export const layer = {
    partWhat: (name, kind) => `Participant ${name} (${kind})`,
    partKeys: '<b>←→</b> neighbour · <b>Alt+←→</b> move column · <b>Tab</b> actor／object · <b>type</b> to rename',
    blockWhat: (kind, label, a, b) => `Block ${kind} "${label}" rows ${a}–${b}`,
    blockKeys: '<b>Shift+↑↓</b> last row · <b>Alt+↑↓</b> move block · <b>Tab</b> loop/alt/opt · <b>type</b> to rename',
    pointWhat: (who, name) => `Endpoint · ${who} @ ${name}`,
    pointKeys: '<b>←→</b> change lifeline · <b>↑↓</b> next row · <b>Tab</b> other end · <b>Esc</b> back',
    rowKeys: '<b>←→</b> receiver · <b>Shift+←→</b> sender · <b>Tab</b> type · <b>Shift+Tab</b> line · <b>type</b> to edit',
    emptyWhat: 'Empty',
    emptyKeys: '<b>Alt+M</b> message · <b>Alt+S</b> phase · <b>Alt+P</b> participant',
    more: 'full shortcut list under the ? at the top right',
    sender: 'sender',
    receiver: 'receiver',
    selfCall: (name) => `${name} self-call`,
    rowSpan: (a, b) => (a === b ? `Row ${a}` : `Rows ${a}–${b}`),
    phaseWhat: (t) => `Phase "${t}"`,
    dash: ' · dashed',
};

export const typeLabel = { sync: 'sync call', return: 'return', async: 'async', self: 'self-call' };

export const msg = {
    newRow: 'New message',
    newNote: 'Note',
    newPhase: 'New phase',
    newPart: 'New participant',
    unnamed: '(untitled)',
    blockLabel: 'condition',
    mmHead: 'MERMAID — applies to the diagram as you type',
    foot: (p, r, m, s, n, ph, b) =>
        `${p} participants · ${r} rows (messages ${m}, self-calls ${s}, notes ${n}, phases ${ph}) · blocks ${b}`,
    errLine: (n, m) => `Line ${n}: ${m}`,
    errFirst: 'the first line must be sequenceDiagram',
    errEnd: 'unmatched end',
    errNoEnd: 'a block is missing its end',
    errNoPart: 'at least one participant is required',
    errUnknown: (t) => `cannot parse "${t}"`,
    errOrphan: 'a message points at an undeclared participant',
    errFile: 'that file could not be read, nothing was loaded',
    openTitle: 'Open .json / .svg',
    svgBadXml: 'the SVG is malformed, XML parsing failed',
    svgNotSvg: 'not an SVG file (root element is not <svg>)',
    svgNoLifelines: 'no vertical lifelines found, this does not look like a sequence diagram',
    svgNoRows: 'lifelines found, but not a single message could be extracted',
    impOk: (r) => `Imported: ${r.parts} participants, ${r.msgs} messages, ${r.selfs} self-calls, ${r.notes} notes, ${r.phases} phases, ${r.dashed} dashed, ${r.legend} legend lines`,
    impNative: 'exported from this tool, restored exactly',
    impUnknown: (n) => `${n} shapes could not be recognised`,
    impLeftover: (n) => `${n} pieces of text were not attached to anything`,
    impDetail: 'What was not understood',
    impClose: 'Close',
};

/* Text for the opening sample diagram. The order matches sampleDiagram() in state.js. */
export const sample = {
    parts: ['User', 'Frontend', 'API', 'Database'],
    rows: [
        'Login flow', 'Click sign in', 'POST /login', 'Look up the account', 'Return the password hash',
        'Compare the password', 'Return a JWT', 'Store it in an httpOnly cookie', 'Redirect to the home page',
        'Token refresh', 'Refresh automatically before it expires', 'A fresh JWT',
    ],
    block: 'retry up to 3 times',
};

export const legendInit = [
    { tone: 'solid', text: 'Solid = ordinary call' },
    { tone: 'dash', text: 'Dashed = unconfirmed / external dependency' },
];

export const help = {
    head: 'Keyboard',
    lead: 'Focus has four levels. What the arrow keys do depends on the level — the status bar always says which one you are in.',
    secCross: 'Move between levels',
    secCrossNote: '(always available)',
    secRow: 'Row level',
    secRowNote: '(default)',
    secPoint: 'Endpoint level',
    secPointNote: '(Ctrl+←→)',
    secBlock: 'Block level',
    secBlockNote: '(Ctrl+↑)',
    secPart: 'Participant level',
    secPartNote: '(↑ at the top row, or click a header)',
    secAdd: 'Adding & files',
    rows: {
        cross: [
            ['Ctrl+←→', 'enter the endpoint level and grab the head or tail of the arrow'],
            ['Ctrl+↑', 'one level up: row → enclosing block → participants'],
            ['Ctrl+↓ / Esc', 'one level down'],
            ['Ctrl+Z', 'undo (Ctrl+Shift+Z to redo)'],
        ],
        row: [
            ['↑↓', 'change row. At the first row, ↑ goes up to the participants'],
            ['←→', 'move the receiver. Passing the sender turns it into a self-call'],
            ['Shift+←→', 'move the sender'],
            ['Tab', 'arrow type (sync / return / async)'],
            ['Shift+Tab', 'line style (solid / dashed)'],
            ['Enter or just type', 'edit, text selected; Enter commits, Shift+Enter commits and starts the next row'],
            ['Ctrl+Enter (while editing)', 'break the text onto a new line; messages, notes and phases can all be multi-line'],
            ['Alt+↑↓', 'move this row up or down'],
            ['Shift+↑↓', 'extend the selection (Shift+click works too)'],
            ['Ctrl+Enter', 'wrap the selected rows in a block'],
            ['Backspace', 'delete the selected rows'],
        ],
        point: [
            ['←→', 'move this endpoint to another lifeline'],
            ['↑↓', 'go to the row above or below, dropping back to the row level'],
            ['Tab', 'switch between head and tail'],
            ['Backspace', 'delete this row'],
        ],
        block: [
            ['↑↓', 'switch between nested blocks at this position'],
            ['Shift+↑↓', 'change which row the block ends on'],
            ['Alt+↑↓', 'move the whole block with its contents'],
            ['Tab / Enter / Backspace', 'loop／alt／opt / rename / unwrap'],
        ],
        part: [
            ['←→', 'select the neighbour'],
            ['Alt+←→', 'move the column'],
            ['Tab / Enter / Backspace', 'actor／object / rename / delete'],
            ['deleting a column', 'messages pointing at it survive and reattach to the left neighbour'],
        ],
        add: [
            ['Alt+M', 'add a message'],
            ['Alt+N', 'insert a note above this row'],
            ['Alt+S', 'insert a phase divider'],
            ['Alt+P', 'add a participant'],
            ['Ctrl+Enter', 'wrap the selected rows in a block'],
            ['Backspace', 'delete whatever is selected'],
            ['Ctrl+Z', 'undo (Ctrl+Shift+Z to redo)'],
        ],
    },
    pin: 'Select anything and just start typing, same as double-clicking the text. Mouse: click what you want; endpoints, notes and participant headers can be dragged. Click this <b>?</b> to pin the panel.',
};
