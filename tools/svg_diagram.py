"""部落格架構圖產生器：吃 JSON，吐深色手繪風 SVG。

排版數學抄自 archify（~/.agents/skills/archify/renderers/），視覺語言沿用
NP_06 / NP_09 / NP_10 那批手繪 SVG。四條規則：

1. 節點座標由 (col, group) 兩個整數算出，不手填 x/y。
2. 一切以節點中心 cx 為錨；框從中心往兩邊長，框內文字全部 text-anchor="middle"。
   改任一節點寬度不會破壞整排對齊。
3. 字太長時縮字級而不是溢出；縮到下限仍放不下才報錯。中文一個字算兩單位。
4. 邊界是硬檢查。超出 viewBox 安全區直接 raise，不靠眼睛看。

用法：
    python svg_diagram.py <spec.json> <out.svg>
"""

from __future__ import annotations

import json
import math
import sys
import unicodedata
from pathlib import Path

# ---------------------------------------------------------------- 版面常數

LAYOUT = {
    "titleY": 38,
    "subtitleY": 56,
    "leftX": 152,          # 第 0 欄的中心線
    "colGap": 288,         # 欄距（中心到中心）
    "groupTopYs": [100, 306],
    "groupLabelDy": -16,   # group 標籤相對節點頂端
    "nodeW": 208,
    "nodeH": 74,
    "labelDy": 27,         # 節點內：主標
    "sublabelDy": 46,      # 節點內：副標
    "tagDyFromBottom": 11, # 節點內：tag（從底部往上算）
    # 流向標籤整組疊在線的「上方」，不跨線。NP_10.2 手繪版的做法：
    # 線 y=152、標籤 y=142，字與線淨距 10px。兩行時主標再往上讓一行。
    "flowLabelDy": -22,    # 主標基線相對線
    "flowNoteDy": -9,      # 補充基線相對線
    "returnDrop": 42,      # 回程通道離節點底的距離
    "bandGap": 20,         # 說明文字第一行離回程通道的距離（貼著線走）
    "bandDy": 76,          # 沒有回程線可貼時的退路：離節點底多遠
    "groupRuleDy": -40,    # 兩組之間的分隔線，相對下一組節點頂端
    "margin": 24,          # viewBox 左右安全邊距
    "maskPad": 5,          # 文字遮罩左右各留的空白
}

PALETTE = {
    "bg": "#050505",
    "card": "#0A0A0C",
    "cardEdge": "#1F1F26",
    "hotCard": "#140F1F",
    "hotEdge": "#3A2F52",
    "accent": "#BF94FF",
    "accentDim": "#8B7BA8",
    "text": "#FFFFFF",
    "muted": "#9CA3AF",
    "dim": "#6B7280",
}

FONT_SANS = "Plus Jakarta Sans, sans-serif"
FONT_MONO = "JetBrains Mono, monospace"

# 字寬估算：每 1px 字級佔 0.6px 寬（archify text-fit.mjs 的 widthFactor）
WIDTH_FACTOR = 0.6
H_PADDING = 18  # 框內左右合計保留，比 archify 的 8 大，因為這裡字級大得多

TYPE = {
    "label":    {"preferred": 14.0, "minimum": 10.5, "weight": "700", "font": FONT_SANS},
    "sublabel": {"preferred": 11.0, "minimum": 8.5,  "weight": "400", "font": FONT_MONO},
    "tag":      {"preferred": 10.5, "minimum": 8.0,  "weight": "700", "font": FONT_MONO},
}


# ---------------------------------------------------------------- 文字量測

def text_units(value: str) -> float:
    """CJK 與全形字算兩單位，其餘算一單位（archify utils.mjs 的 textUnits）。"""
    total = 0.0
    for ch in str(value or ""):
        total += 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1
    return total


def fitted_font_size(text: str, box_width: float, kind: str) -> float:
    """放得下就用 preferred，放不下就縮，最低不低於 minimum。"""
    spec = TYPE[kind]
    units = max(1.0, text_units(text))
    available = max(1.0, box_width - H_PADDING)
    fitted = min(spec["preferred"], available / (units * WIDTH_FACTOR))
    return max(spec["minimum"], math.floor(fitted * 10) / 10)


def minimum_text_width(text: str, kind: str) -> float:
    """縮到下限時這段字還需要多寬。用來判斷縮字救不救得回來。"""
    return text_units(text) * TYPE[kind]["minimum"] * WIDTH_FACTOR


def esc(value) -> str:
    return (
        str(value if value is not None else "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


# ---------------------------------------------------------------- 定位

def node_geometry(node: dict, spec: dict) -> dict:
    """(col, group) -> 幾何。cx 是錨點，框與框內文字都對齊它。"""
    width = node.get("width", LAYOUT["nodeW"])
    height = node.get("height", LAYOUT["nodeH"])
    cx = LAYOUT["leftX"] + node["col"] * LAYOUT["colGap"]
    y = LAYOUT["groupTopYs"][node["group"]] + node.get("yOffset", 0)
    return {
        **node,
        "width": width,
        "height": height,
        "cx": cx,
        "cy": y + height / 2,
        "x": cx - width / 2,
        "y": y,
    }


def validate(nodes: dict, spec: dict) -> None:
    vb_w, vb_h = spec["viewBox"]
    problems = []
    margin = LAYOUT["margin"]

    seen = {}
    for node in nodes.values():
        key = (node["group"], node["col"])
        if key in seen:
            problems.append(
                f'節點 "{seen[key]}" 與 "{node["id"]}" 佔用同一格 group {key[0]} col {key[1]}。'
            )
        seen[key] = node["id"]

        if node["x"] < margin or node["x"] + node["width"] > vb_w - margin:
            problems.append(
                f'節點 "{node["id"]}" 超出左右安全區（x={node["x"]:.0f}, '
                f'右緣={node["x"] + node["width"]:.0f}，允許 {margin}~{vb_w - margin}）。'
                f' 縮小 nodeW 或加大 viewBox[0]。'
            )
        if node["y"] + node["height"] > vb_h - margin:
            problems.append(
                f'節點 "{node["id"]}" 超出下緣（底={node["y"] + node["height"]:.0f}，'
                f'允許到 {vb_h - margin}）。加大 viewBox[1] 或調 groupTopYs。'
            )

        for kind in ("label", "sublabel", "tag"):
            text = node.get(kind)
            if not text:
                continue
            needed = minimum_text_width(text, kind)
            if needed > node["width"] - H_PADDING:
                problems.append(
                    f'節點 "{node["id"]}" 的 {kind}「{text}」縮到最小字級仍需 '
                    f'{needed:.0f}px，框內只有 {node["width"] - H_PADDING:.0f}px。'
                    f' 改短文字或把 width 加到 {needed + H_PADDING:.0f} 以上。'
                )

    for flow in spec.get("flows", []):
        for end in ("from", "to"):
            if flow[end] not in nodes:
                problems.append(f'流向指向不存在的節點 "{flow[end]}"。')

    if problems:
        raise SystemExit("排版檢查未通過：\n  - " + "\n  - ".join(problems))


# ---------------------------------------------------------------- 繪製

def draw_text(x, y, text, kind=None, *, fill, size=None, weight=None,
              font=None, anchor="middle") -> str:
    if kind:
        spec = TYPE[kind]
        size = size if size is not None else spec["preferred"]
        weight = weight if weight is not None else spec["weight"]
        font = font if font is not None else spec["font"]
    return (
        f'  <text x="{x:.1f}" y="{y:.1f}" fill="{fill}" font-family="{font}"'
        f' font-size="{size}" font-weight="{weight}" text-anchor="{anchor}">{esc(text)}</text>\n'
    )


def draw_node(node: dict) -> str:
    hot = bool(node.get("hot"))
    fill = PALETTE["hotCard"] if hot else PALETTE["card"]
    edge = PALETTE["hotEdge"] if hot else PALETTE["cardEdge"]
    out = (
        f'  <rect x="{node["x"]:.1f}" y="{node["y"]:.1f}" width="{node["width"]}"'
        f' height="{node["height"]}" rx="8" fill="{fill}" stroke="{edge}"/>\n'
    )
    out += draw_text(
        node["cx"], node["y"] + LAYOUT["labelDy"], node["label"], "label",
        fill=PALETTE["text"],
        size=fitted_font_size(node["label"], node["width"], "label"),
    )
    if node.get("sublabel"):
        out += draw_text(
            node["cx"], node["y"] + LAYOUT["sublabelDy"], node["sublabel"], "sublabel",
            fill=PALETTE["muted"],
            size=fitted_font_size(node["sublabel"], node["width"], "sublabel"),
        )
    if node.get("tag"):
        out += draw_text(
            node["cx"], node["y"] + node["height"] - LAYOUT["tagDyFromBottom"],
            node["tag"], "tag",
            fill=PALETTE["accent"] if hot else PALETTE["accentDim"],
            size=fitted_font_size(node["tag"], node["width"], "tag"),
        )
    return out


def text_mask(cx: float, baseline: float, text: str, size: float) -> str:
    """在文字底下墊一塊背景色，讓字不會跟穿過它的線黏在一起。

    位移已經讓標籤避開線了；這層是保險，處理標籤比預期寬、或旁邊剛好有
    別條線經過的情形（archify 的 c-mask 同一個用途）。
    """
    width = text_units(text) * size * WIDTH_FACTOR + LAYOUT["maskPad"] * 2
    return (
        f'  <rect x="{cx - width / 2:.1f}" y="{baseline - size + 1:.1f}"'
        f' width="{width:.1f}" height="{size + 5:.1f}" fill="{PALETTE["bg"]}"/>\n'
    )


def draw_flow(flow: dict, nodes: dict) -> str:
    a, b = nodes[flow["from"]], nodes[flow["to"]]
    variant = flow.get("variant")
    accent = variant == "hot"
    # dashed 是「同一條路、量小很多」，顏色跟主路徑一致（手繪版兩條回程都是紫的，
    # 只用粗細區分）；灰色留給不強調的正向連線。
    colour = PALETTE["accent"] if variant in ("hot", "dashed") else PALETTE["dim"]
    dash = ' stroke-dasharray="5,4"' if variant == "dashed" else ""
    marker = "arrowHot" if variant in ("hot", "dashed") else "arrowDim"

    if flow.get("route") == "return":
        # 回程走節點下方的通道，中心對中心（手繪版 NP_10.2 的走法）。
        # 這條線刻意不掛文字——它要講的話由下面的說明帶負責，兩邊都寫會重複。
        # 粗細本身在說話：主路徑 2.4、對照路徑 1.2。
        stroke_w = 2.4 if accent else 1.2
        drop = max(a["y"] + a["height"], b["y"] + b["height"]) + LAYOUT["returnDrop"]
        d = (f'M {a["cx"]:.1f} {a["y"] + a["height"]:.1f} V {drop:.1f} '
             f'H {b["cx"]:.1f} V {b["y"] + b["height"] + 4:.1f}')
        return (f'  <path d="{d}" fill="none" stroke="{colour}" stroke-width="{stroke_w}"'
                f'{dash} marker-end="url(#{marker})"/>\n')

    stroke_w = 2 if accent else 1.4
    x1 = a["x"] + a["width"] + 4
    x2 = b["x"] - 8
    y = a["cy"]
    out = (f'  <line x1="{x1:.1f}" y1="{y:.1f}" x2="{x2:.1f}" y2="{y:.1f}"'
           f' stroke="{colour}" stroke-width="{stroke_w}"{dash}'
           f' marker-end="url(#{marker})"/>\n')

    cx = (x1 + x2) / 2
    has_note = bool(flow.get("note"))
    if flow.get("label"):
        # 有第二行時主標再往上讓一行，兩行整組都待在線的上方
        baseline = y + (LAYOUT["flowLabelDy"] if has_note else LAYOUT["flowNoteDy"])
        out += text_mask(cx, baseline, flow["label"], 10)
        out += draw_text(cx, baseline, flow["label"], "tag", fill=colour, size=10)
    if has_note:
        baseline = y + LAYOUT["flowNoteDy"]
        out += text_mask(cx, baseline, flow["note"], 9)
        out += draw_text(cx, baseline, flow["note"], "tag", fill=PALETTE["dim"], size=9)
    return out


def return_channel(group: int, nodes: dict, spec: dict):
    """該組回程線的水平段：(中心 x, 通道 y)。沒有回程線就回 None。"""
    for flow in spec.get("flows", []):
        if flow.get("route") != "return":
            continue
        a, b = nodes[flow["from"]], nodes[flow["to"]]
        if a["group"] != group:
            continue
        drop = max(a["y"] + a["height"], b["y"] + b["height"]) + LAYOUT["returnDrop"]
        return (a["cx"] + b["cx"]) / 2, drop
    return None


def draw_band(band: dict, nodes: dict, spec: dict) -> str:
    """回程線在講「這條路搬了什麼」，這段字就是那句話的內容。

    所以它貼在那條線的正下方、對齊線的水平中心，跟線讀成一個單位。不畫框
    （框會把它切成獨立卡片，讀成旁註），也不用色條標分組——貼著哪條線，
    就屬於哪一組，位置本身已經說完了。
    """
    channel = return_channel(band["group"], nodes, spec)
    if channel is None:
        # 沒有回程線可以貼，退回整組下方置中
        cx = spec["viewBox"][0] / 2
        top = LAYOUT["groupTopYs"][band["group"]] + LAYOUT["nodeH"] + LAYOUT["bandDy"]
    else:
        cx, top = channel[0], channel[1] + LAYOUT["bandGap"]

    avail = spec["viewBox"][0] - 2 * LAYOUT["margin"]
    out = draw_text(cx, top, band["title"], "label", anchor="middle",
                    fill=PALETTE["text"],
                    size=fitted_font_size(band["title"], avail, "label"))
    if band.get("note"):
        out += draw_text(cx, top + 18, band["note"], "sublabel", anchor="middle",
                         fill=PALETTE["muted"],
                         size=fitted_font_size(band["note"], avail, "sublabel"))
    return out


def render(spec: dict) -> str:
    vb_w, vb_h = spec["viewBox"]
    nodes = {n["id"]: node_geometry(n, spec) for n in spec["nodes"]}
    validate(nodes, spec)

    out = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb_w} {vb_h}"'
        f' width="{vb_w}" height="{vb_h}" role="img"'
        f' aria-label="{esc(spec.get("alt") or spec.get("title"))}">\n'
        '  <defs>\n'
        f'    <marker id="arrowHot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6"'
        f' markerHeight="6" orient="auto-start-reverse">'
        f'<path d="M0,0 L10,5 L0,10 z" fill="{PALETTE["accent"]}"/></marker>\n'
        f'    <marker id="arrowDim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6"'
        f' markerHeight="6" orient="auto-start-reverse">'
        f'<path d="M0,0 L10,5 L0,10 z" fill="{PALETTE["dim"]}"/></marker>\n'
        '  </defs>\n'
        f'  <rect x="0" y="0" width="{vb_w}" height="{vb_h}" fill="{PALETTE["bg"]}"/>\n'
    )

    out += draw_text(LAYOUT["margin"] + 8, LAYOUT["titleY"], spec["title"], "label",
                     fill=PALETTE["muted"], size=12, font=FONT_MONO, anchor="start")
    if spec.get("subtitle"):
        out += draw_text(LAYOUT["margin"] + 8, LAYOUT["subtitleY"], spec["subtitle"],
                         "sublabel", fill=PALETTE["dim"], size=11, anchor="start")

    for group in spec.get("groups", []):
        top = LAYOUT["groupTopYs"][group["index"]]
        if group["index"] > 0:
            rule_y = top + LAYOUT["groupRuleDy"]
            out += (f'  <line x1="{LAYOUT["margin"] + 8}" y1="{rule_y:.1f}"'
                    f' x2="{vb_w - LAYOUT["margin"] - 8}" y2="{rule_y:.1f}"'
                    f' stroke="{PALETTE["cardEdge"]}" stroke-width="1"/>\n')
        out += draw_text(LAYOUT["margin"] + 8, top + LAYOUT["groupLabelDy"],
                         group["label"], "tag",
                         fill=PALETTE["accent"], size=11, anchor="start")

    for flow in spec.get("flows", []):
        out += draw_flow(flow, nodes)
    for node in nodes.values():
        out += draw_node(node)
    for band in spec.get("bands", []):
        out += draw_band(band, nodes, spec)

    return out + "</svg>\n"


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("用法：python svg_diagram.py <spec.json> <out.svg>")
    spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    svg = render(spec)
    Path(sys.argv[2]).write_text(svg, encoding="utf-8")
    print(f"寫出 {sys.argv[2]}")
    print(f"  viewBox {spec['viewBox'][0]}x{spec['viewBox'][1]}"
          f"  節點 {len(spec['nodes'])}"
          f"  流向 {len(spec.get('flows', []))}"
          f"  說明帶 {len(spec.get('bands', []))}")
    print(f"  bytes {len(svg.encode('utf-8'))}")


if __name__ == "__main__":
    main()
