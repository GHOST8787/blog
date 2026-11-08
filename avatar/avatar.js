// Live2D-style animated avatar for the homepage card.
// Layers are pre-split from one illustration (1024px space). A shared deformation field
// (head turn, breathing, idle sway) is applied to every layer's mesh; the back hair gets an
// extra spring-driven sway; the iris slides inside the sclera mask; blink swaps lid patches.
// Falls back to the original <img> when WebGL is unavailable or the user prefers reduced motion.

const SIZE = 1024;
const GRID = 40;
const FIT = { k: 0.955, x: 0.026, y: 0.0495 };
const LAYERS = ["hair_back", "body", "iris", "sclera_mask", "blink_half", "blink_closed", "angry_face", "anger_mark"];
const EYE = { x: 11, y: 3 };            // iris travel in image px (about 20% of iris width; lids leave little vertical room)
const ANGRY = { clicks: 4, window: 1.5, hold: 2.5, fade: 0.12 }; // rapid clicks -> annoyed face
const MARK_C = [358, 155];              // anger mark centre (image px)

const VS = `
attribute vec2 aPos; attribute vec2 aUv;
uniform vec4 uView; // scale.x, scale.y, offset.x, offset.y (image px -> clip)
varying vec2 vUv;
void main(){ vUv = aUv; gl_Position = vec4(aPos * uView.xy + uView.zw, 0.0, 1.0); }`;
const FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex; uniform sampler2D uMask;
uniform vec2 uShift; uniform float uUseMask; uniform float uAlpha;
void main(){
  vec4 c = texture2D(uTex, vUv - uShift);
  if (uUseMask > 0.5) c *= texture2D(uMask, vUv).a;
  gl_FragColor = c * uAlpha;
}`;

function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

function loadImg(src) {
  return new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
}

export async function mountAvatar(img, base) {
  if (!img || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  canvas.className = img.className;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", img.alt || "Avatar");
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true });
  if (!gl) return;

  let imgs;
  try { imgs = await Promise.all(LAYERS.map((n) => loadImg(`${base}${n}.webp`))); }
  catch { return; }

  // ---- GL setup ----
  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return; gl.attachShader(prog, s);
  }
  gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  const loc = (n) => gl.getUniformLocation(prog, n);
  const U = { view: loc("uView"), tex: loc("uTex"), mask: loc("uMask"), shift: loc("uShift"), useMask: loc("uUseMask"), alpha: loc("uAlpha") };
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const tex = {};
  LAYERS.forEach((n, i) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgs[i]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    tex[n] = t;
  });
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  // mesh: rest positions + uvs + indices
  const N = GRID + 1, rest = new Float32Array(N * N * 2), uv = new Float32Array(N * N * 2);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = (j * N + i) * 2; rest[k] = (i / GRID) * SIZE; rest[k + 1] = (j / GRID) * SIZE;
    uv[k] = i / GRID; uv[k + 1] = j / GRID;
  }
  const idx = new Uint16Array(GRID * GRID * 6); let p = 0;
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1; idx.set([a, b, c, b, d, c], p); p += 6;
  }
  const aPos = gl.getAttribLocation(prog, "aPos"), aUv = gl.getAttribLocation(prog, "aUv");
  const posBuf = gl.createBuffer(), uvBuf = gl.createBuffer(), idxBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const bodyPos = new Float32Array(rest.length), hairPos = new Float32Array(rest.length), markPos = new Float32Array(rest.length);
  const tmp2 = new Float32Array(2);
  const headAt = (x, y, t) => { field(x, y, t, tmp2, 0, false); return [tmp2[0], tmp2[1]]; };

  // ---- state ----
  const S = { ax: 0, ay: 0, ex: 0, ey: 0, clicks: [], angryAt: -1e9, angryUntil: -1e9, tx: 0, ty: 0, lastMove: -1e9, wander: { x: 0, y: 0, until: 0 },
    hair: [0, 0], hairV: [0, 0], prevAx: 0, blinkAt: 1.5, blinkT: -1 };

  function field(x, y, t, out, k, hairSway) {
    let dx = 0, dy = 0;
    // head turn with depth (face centre moves more than the hood rim -> 3D feel)
    const wh = 1 - smoothstep(400, 485, y);
    if (wh > 0) {
      const ex = (x - 490) / 165, ey = (y - 320) / 130;
      const d = 0.3 + 0.7 * Math.exp(-(ex * ex + ey * ey));
      const sa = t - S.angryAt, shake = sa >= 0 && sa < 0.6 ? Math.sin(sa * 38) * 0.35 * (1 - sa / 0.6) : 0;
      const th = -(S.ax + shake) * 0.045, px = 510, py = 480, rx = x - px, ry = y - py;
      dx += wh * ((S.ax + shake) * 16 * d + (rx * Math.cos(th) - ry * Math.sin(th) - rx));
      dy += wh * (S.ay * 9 * d + (rx * Math.sin(th) + ry * Math.cos(th) - ry));
    }
    // breathing: shoulders and head rise, feet pinned
    const b = Math.sin(t * 2 * Math.PI / 3.6);
    dy -= b * 3.2 * Math.min(1, Math.max(0, (930 - y) / 500));
    dx += b * 1.2 * ((x - 512) / 512) * smoothstep(440, 620, y) * (1 - smoothstep(620, 760, y));
    // idle body sway around the feet
    const ph = 0.010 * Math.sin(t * 2 * Math.PI / 6.5), fx = x - 512, fy = y - 960;
    dx += fx * Math.cos(ph) - fy * Math.sin(ph) - fx; dy += fx * Math.sin(ph) + fy * Math.cos(ph) - fy;
    if (hairSway) {
      const s = Math.min(1, Math.max(0, (y - 440) / 340));
      const w = Math.pow(s, 1.5), w2 = Math.pow(s, 3);
      dx += S.hair[0] * w + S.hair[1] * w2;
      dy -= Math.abs(S.hair[0] * w) * 0.08;
    }
    out[k] = x + dx; out[k + 1] = y + dy;
  }

  function step(t, dt) {
    // gaze target: mouse when recently moved, otherwise slow wandering
    if (t - S.lastMove > 2.5) {
      if (t > S.wander.until) { S.wander = { x: (Math.random() * 2 - 1) * 0.6, y: (Math.random() * 2 - 1) * 0.4, until: t + 1.8 + Math.random() * 2.5 }; }
      S.tx = S.wander.x; S.ty = S.wander.y;
    }
    const k = 1 - Math.exp(-dt * 5);
    S.ax += (S.tx - S.ax) * k; S.ay += (S.ty - S.ay) * k;
    const ke = 1 - Math.exp(-dt * 12); // eyes lead the head
    S.ex += (S.tx - S.ex) * ke; S.ey += (S.ty - S.ey) * ke;
    // hair: two coupled springs driven by head velocity + gentle idle wind
    const headV = (S.ax - S.prevAx) / Math.max(dt, 1e-3); S.prevAx = S.ax;
    const drive = [-headV * 7 + Math.sin(t * 2 * Math.PI / 4.2) * 3, -headV * 4 + Math.sin(t * 2 * Math.PI / 2.9 + 1) * 2.5];
    for (let i = 0; i < 2; i++) {
      const kS = i ? 38 : 22, damp = i ? 4.5 : 3.2;
      const acc = kS * (drive[i] - S.hair[i]) - damp * S.hairV[i];
      S.hairV[i] += acc * dt; S.hair[i] += S.hairV[i] * dt;
      S.hair[i] = Math.max(-26, Math.min(26, S.hair[i]));
    }
    // blink scheduler: half -> closed -> half -> open
    if (S.blinkT < 0 && t > S.blinkAt) S.blinkT = 0;
    if (S.blinkT >= 0) { S.blinkT += dt; if (S.blinkT > 0.22) { S.blinkT = -1; S.blinkAt = t + 2.2 + Math.random() * 4 + (Math.random() < 0.15 ? -2 : 0); } }
  }

  function draw(t) {
    const w = canvas.width, h = canvas.height; gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    // object-fit: cover, object-position: top
    const sc = Math.max(w / SIZE, h / SIZE), ox = (w - SIZE * sc) / 2;
    // FIT matches the redrawn character's framing to the original PNG/20260125P.webp (same size/position in the card)
    const K = FIT.k, OX = FIT.x * SIZE, OY = FIT.y * SIZE;
    gl.uniform4f(U.view, (2 * sc * K) / w, (-2 * sc * K) / h, (2 * (ox + OX * sc)) / w - 1, 1 - (2 * OY * sc) / h);
    for (let k = 0; k < rest.length; k += 2) { field(rest[k], rest[k + 1], t, bodyPos, k, false); field(rest[k], rest[k + 1], t, hairPos, k, true); }
    const layer = (name, pos, opts = {}) => {
      if (opts.alpha === 0) return;
      gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[name]); gl.uniform1i(U.tex, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex.sclera_mask); gl.uniform1i(U.mask, 1);
      gl.uniform2f(U.shift, ...(opts.shift || [0, 0])); gl.uniform1f(U.useMask, opts.mask ? 1 : 0); gl.uniform1f(U.alpha, opts.alpha ?? 1);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    };
    layer("hair_back", hairPos);
    layer("body", bodyPos);
    layer("iris", bodyPos, { mask: true, shift: [S.ex * EYE.x / SIZE, S.ey * EYE.y / SIZE] });
    const ang = Math.min(1, (t - S.angryAt) / ANGRY.fade, (S.angryUntil - t) / ANGRY.fade);
    if (ang > 0) {
      layer("angry_face", bodyPos, { alpha: ang });
      // anger mark pops in with an overshoot, then pulses
      const u = t - S.angryAt, pop = u < 0.25 ? 0.4 + 0.75 * Math.sin((u / 0.25) * Math.PI * 0.6) : 1 + 0.06 * Math.sin(u * 14);
      const hx = headAt(MARK_C[0], MARK_C[1], t);
      for (let k = 0; k < rest.length; k += 2) { markPos[k] = hx[0] + (rest[k] - MARK_C[0]) * pop; markPos[k + 1] = hx[1] + (rest[k + 1] - MARK_C[1]) * pop; }
      layer("anger_mark", markPos, { alpha: ang });
    } else if (S.blinkT >= 0) {
      const b = S.blinkT; layer(b < 0.06 || b > 0.15 ? "blink_half" : "blink_closed", bodyPos);
    }
  }

  // ---- swap into the page ----
  const resize = () => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const cw = Math.max(1, Math.round(r.width * dpr)), ch = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  };
  img.replaceWith(canvas);
  new ResizeObserver(resize).observe(canvas); resize();

  addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.35;
    S.tx = Math.max(-1, Math.min(1, (e.clientX - cx) / (innerWidth * 0.45)));
    S.ty = Math.max(-1, Math.min(1, (e.clientY - cy) / (innerHeight * 0.45)));
    S.lastMove = performance.now() / 1000;
  }, { passive: true });

  // rapid clicks/taps on the card make her annoyed for a moment
  (canvas.parentElement || canvas).addEventListener("pointerdown", () => {
    const t = performance.now() / 1000;
    S.clicks = S.clicks.filter((c) => t - c < ANGRY.window); S.clicks.push(t);
    if (S.clicks.length >= ANGRY.clicks) {
      if (t > S.angryUntil) S.angryAt = t;
      S.angryUntil = t + ANGRY.hold; S.clicks = [];
    }
  });

  let visible = true, last = performance.now() / 1000;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(canvas);
  const loop = () => {
    const t = performance.now() / 1000, dt = Math.min(0.05, t - last); last = t;
    if (visible && !document.hidden) { step(t, dt); draw(t); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

const el = document.querySelector("img[data-avatar]");
if (el) mountAvatar(el, el.dataset.avatar);
