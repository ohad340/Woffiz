// Woffiz illustrated preview, v2: layered compositing over the three reference stills in ./reference.
//   WoffizScene.init({ captions, images: [mouthing, toy offered, chewing] })   WoffizScene.draw(ctx, tSeconds)
// Every frame is a pure function of t = frameIndex / fps (deterministic; nothing depends on real-time capture).
//
// How a still is animated (v1 warped rectangular crops of the whole picture, which moved wall and sofa pixels, ghosted the tail,
// left rectangle seams and stretched the nose; v2 replaces that):
//   * each moving part (head, tail, sleeve cuff) is cut out with a colour matte into its own transparent layer;
//   * a clean background plate is made once: the same picture with those parts removed and the uncovered pixels filled in from their
//     surroundings (onion-peel fill), so no second copy of a moving part is left underneath;
//   * the head and the tail are moved RIGIDLY (small translation/rotation about a fixed pivot, no stretching);
//   * only the cuff of the sleeve is deformed, with a weight that is zero at the hand and the upper arm;
//   * the handler, the hand, the body, the paws, the wall, the sofa and the rug are in the plate and never move;
//   * the story changes (mouthing -> toy offered -> chewing) are hard cuts at step boundaries, never cross-dissolves between poses.
(function (root) {
  'use strict'
  const W = 1280
  const H = 720
  const VIEW_H = 610 // picture area; the caption bar below it never covers the picture
  const PI = Math.PI
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
  const smooth = (x) => x * x * (3 - 2 * x)
  const seg = (t, a, b) => smooth(clamp((t - a) / (b - a)))
  const lerp = (a, b, k) => a + (b - a) * k
  const bump = (u) => (u > 0 && u < 1 ? Math.sin(PI * u) ** 2 : 0) // eased 0 -> 1 -> 0
  const FONT = "'Heebo', 'Segoe UI', Arial, sans-serif"
  const P = { blue: '#1F6FD1', cta: '#FFC22E', ctaInk: '#3D2600', navy: '#14304F' }

  // ---------- timeline (seconds) ----------
  const T = {
    release: [7.4, 8.6], // the tugging stops and the puppy goes still (a tiny ease only: the pose change to 'released' is the cut below)
    cutB: 10.9, // hard cut at the step boundary: the puppy has let go and the toy is offered (the pause above lasted from 7.4 to 10.9; the toy comes only after it)
    cutC: 12.8, // hard cut: the puppy has the toy and chews
    praiseFrom: 14.4,
  }
  const stateAt = (t) => (t < T.cutB ? 'A' : t < T.cutC ? 'B' : 'C')
  const IDX = { A: 0, B: 1, C: 2 }
  // one slow camera move per state: zoom z0->z1 and focus (ref px) f0->f1 over the state's span
  const CAMS = {
    A: { t: [0, T.cutB], z: [1.0, 1.06], f: [[836, 470], [800, 430]] },
    B: { t: [T.cutB, T.cutC], z: [1.04, 1.0], f: [[860, 440], [840, 455]] },
    C: { t: [T.cutC, 24], z: [1.0, 1.09], f: [[760, 590], [560, 640]] },
  }

  // ---------- parts: where each moving part is (reference px, 1672 x 941) ----------
  const TAIL = [[70, 215], [262, 215], [266, 330], [252, 388], [232, 424], [170, 428], [118, 434], [68, 420]]
  const SPECS = {
    A: [
      { name: 'head', kind: 'fur', poly: [[430, 170], [800, 170], [815, 300], [800, 380], [756, 438], [640, 458], [590, 486], [470, 494], [424, 432], [424, 330], [436, 230]], feather: 9, dark: [[686, 296, 744, 386]], pale: [[690, 300, 790, 440]], whisk: [[726, 280, 820, 345], [690, 385, 760, 430]] },
      { name: 'sleeve', kind: 'teal', poly: [[650, 300], [780, 140], [935, 100], [985, 340], [905, 446], [740, 446], [690, 392]], feather: 9, under: 'head' },
      { name: 'tail', kind: 'fur', poly: TAIL, feather: 7 },
    ],
    B: [
      { name: 'head', kind: 'fur', poly: [[420, 170], [770, 170], [782, 300], [770, 420], [716, 454], [640, 462], [590, 488], [470, 494], [418, 432], [416, 330], [430, 230]], feather: 9, dark: [[686, 346, 744, 436]], pale: [[690, 346, 790, 446]], whisk: [[722, 330, 800, 380], [690, 395, 760, 440]] },
      { name: 'tail', kind: 'fur', poly: TAIL, feather: 7 },
    ],
    C: [
      { name: 'head', kind: 'fur', poly: [[290, 395], [700, 395], [712, 520], [704, 640], [672, 698], [620, 706], [560, 700], [470, 712], [380, 720], [310, 700], [286, 560]], feather: 9, dark: [[584, 654, 658, 712]], pale: [[580, 640, 680, 720]] },
      { name: 'tail', kind: 'fur', poly: [[0, 480], [150, 480], [168, 560], [160, 700], [120, 730], [30, 720], [0, 660]], feather: 7 },
    ],
  }
  const PIVOT = { A: { head: [545, 472], tail: [232, 392] }, B: { head: [545, 472], tail: [232, 392] }, C: { head: [330, 690], tail: [135, 650] } }

  let cfg = { captions: [], images: [] }
  const built = {}

  // ---------- helpers ----------
  const makeCanvas = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }))
  function hsv(r, g, b) {
    r /= 255
    g /= 255
    b /= 255
    const mx = Math.max(r, g, b)
    const dl = mx - Math.min(r, g, b)
    let h = 0
    if (dl) h = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4
    return [(h * 60 + 360) % 360, mx ? dl / mx : 0, mx]
  }
  function largest(bin, w, h) {
    const lab = new Int32Array(w * h)
    let best = 0
    let bestN = 0
    let n = 0
    const stack = []
    for (let i = 0; i < w * h; i++) {
      if (!bin[i] || lab[i]) continue
      n++
      let cnt = 0
      stack.push(i)
      lab[i] = n
      while (stack.length) {
        const p = stack.pop()
        cnt++
        const x = p % w
        if (x > 0 && bin[p - 1] && !lab[p - 1]) ((lab[p - 1] = n), stack.push(p - 1))
        if (x < w - 1 && bin[p + 1] && !lab[p + 1]) ((lab[p + 1] = n), stack.push(p + 1))
        if (p >= w && bin[p - w] && !lab[p - w]) ((lab[p - w] = n), stack.push(p - w))
        if (p + w < w * h && bin[p + w] && !lab[p + w]) ((lab[p + w] = n), stack.push(p + w))
      }
      if (cnt > bestN) ((bestN = cnt), (best = n))
    }
    return Uint8Array.from(lab, (v) => (v === best ? 1 : 0))
  }
  function fillHoles(bin, w, h) {
    const outside = new Uint8Array(w * h)
    const stack = []
    const push = (i) => !bin[i] && !outside[i] && ((outside[i] = 1), stack.push(i))
    for (let x = 0; x < w; x++) (push(x), push((h - 1) * w + x))
    for (let y = 0; y < h; y++) (push(y * w), push(y * w + w - 1))
    while (stack.length) {
      const p = stack.pop()
      const x = p % w
      if (x > 0) push(p - 1)
      if (x < w - 1) push(p + 1)
      if (p >= w) push(p - w)
      if (p + w < w * h) push(p + w)
    }
    return Uint8Array.from(bin, (v, i) => (v || !outside[i] ? 1 : 0))
  }
  function dilate(bin, w, h, r) {
    let cur = bin
    for (let k = 0; k < r; k++) {
      const nxt = Uint8Array.from(cur)
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x
          if (!cur[i] && ((x > 0 && cur[i - 1]) || (x < w - 1 && cur[i + 1]) || (y > 0 && cur[i - w]) || (y < h - 1 && cur[i + w]))) nxt[i] = 1
        }
      cur = nxt
    }
    return cur
  }
  // onion-peel fill: unknown pixels take the average of their known neighbours, ring by ring (rgba is modified in place)
  function inpaint(rgba, w, h, unknown) {
    const known = Uint8Array.from(unknown, (v) => 1 - v)
    for (let guard = 0; guard < 600; guard++) {
      const fill = []
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x
          if (known[i]) continue
          let r = 0, g = 0, b = 0, n = 0
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx
              const yy = y + dy
              if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
              const j = yy * w + xx
              if (known[j]) ((r += rgba[j * 4]), (g += rgba[j * 4 + 1]), (b += rgba[j * 4 + 2]), n++)
            }
          if (n) fill.push([i, r / n, g / n, b / n])
        }
      if (!fill.length) break
      for (const [i, r, g, b] of fill) ((rgba[i * 4] = r), (rgba[i * 4 + 1] = g), (rgba[i * 4 + 2] = b), (known[i] = 1))
    }
  }

  // ---------- build: matte, layers, clean plate (once per still) ----------
  function buildState(key) {
    const img = cfg.images[IDX[key]]
    const k = img.width / 1672
    const full = makeCanvas(img.width, img.height)
    const fc = full.getContext('2d', { willReadFrequently: true })
    fc.drawImage(img, 0, 0)
    const fid = fc.getImageData(0, 0, img.width, img.height)
    const plateData = new Uint8ClampedArray(fid.data)
    const unknownFull = new Uint8Array(img.width * img.height)
    const parts = {}
    const masks = {}
    for (const spec of SPECS[key]) {
      const xs = spec.poly.map((p) => p[0] * k)
      const ys = spec.poly.map((p) => p[1] * k)
      const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 24)
      const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 24)
      const x1 = Math.min(img.width, Math.ceil(Math.max(...xs)) + 24)
      const y1 = Math.min(img.height, Math.ceil(Math.max(...ys)) + 24)
      const w = x1 - x0
      const h = y1 - y0
      // cut region (soft polygon): where this part ends and the body (kept in the plate) begins
      const cut = makeCanvas(w, h)
      const cg = cut.getContext('2d', { willReadFrequently: true })
      cg.filter = `blur(${spec.feather * k}px)`
      cg.fillStyle = '#fff'
      cg.beginPath()
      spec.poly.forEach((p, i) => (i ? cg.lineTo(p[0] * k - x0, p[1] * k - y0) : cg.moveTo(p[0] * k - x0, p[1] * k - y0)))
      cg.closePath()
      cg.fill()
      const cd = cg.getImageData(0, 0, w, h).data
      const c = new Float32Array(w * h)
      for (let i = 0; i < w * h; i++) c[i] = cd[i * 4 + 3] / 255
      // colour matte (measured: fur H 31-35, wall H 23-25, sleeve H 176-179)
      const bin = new Uint8Array(w * h)
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x
          if (c[i] < 0.5) continue
          const j = ((y + y0) * img.width + (x + x0)) * 4
          const [hh, s, v] = hsv(fid.data[j], fid.data[j + 1], fid.data[j + 2])
          // pale cream fur (muzzle tip) has low saturation: accepted only inside the listed zones, so the cream baseboard is never taken
          const pale = spec.pale && spec.pale.some(([a, b, d, e]) => x + x0 >= a * k && x + x0 < d * k && y + y0 >= b * k && y + y0 < e * k)
          if (spec.kind === 'fur' ? hh >= 29.5 && hh <= (pale ? 70 : 52) && s >= (pale ? 0.05 : 0.22) && v >= 0.35 : hh >= 150 && hh <= 215 && s >= 0.25 && v >= 0.25) bin[i] = 1
        }
      let m = fillHoles(largest(bin, w, h), w, h)
      if (spec.kind === 'fur' && spec.dark) {
        // the nose and the inside of the mouth are dark, not fur-coloured, and sit on the silhouette: grow the matte over dark pixels that touch it
        for (let step = 0; step < 22; step++) {
          const add = []
          for (let y = 1; y < h - 1; y++)
            for (let x = 1; x < w - 1; x++) {
              const i = y * w + x
              if (m[i] || c[i] < 0.5) continue
              if (!spec.dark.some(([a, b, d, e]) => x + x0 >= a * k && x + x0 < d * k && y + y0 >= b * k && y + y0 < e * k)) continue
              if (!(m[i - 1] || m[i + 1] || m[i - w] || m[i + w])) continue
              const j = ((y + y0) * img.width + (x + x0)) * 4
              const [hh, , v] = hsv(fid.data[j], fid.data[j + 1], fid.data[j + 2])
              if (v < 0.5 && !(hh >= 150 && hh <= 260)) add.push(i)
            }
          if (!add.length) break
          for (const i of add) m[i] = 1
        }
      }
      const core = Uint8Array.from(m)
      for (const [wx0, wy0, wx1, wy1] of spec.whisk || []) {
        // whiskers are pale strokes on the wall: take them with the head so no copy stays behind
        for (let y = Math.round(wy0 * k) - y0; y < Math.round(wy1 * k) - y0; y++)
          for (let x = Math.round(wx0 * k) - x0; x < Math.round(wx1 * k) - x0; x++) {
            if (x < 0 || y < 0 || x >= w || y >= h) continue
            const j = ((y + y0) * img.width + (x + x0)) * 4
            const [hh, s, v] = hsv(fid.data[j], fid.data[j + 1], fid.data[j + 2])
            if (hh >= 15 && hh <= 70 && s < 0.22 && v > 0.9) m[y * w + x] = 1
          }
      }
      // the matte carries 4 px of fringe (mixed fur/wall/fabric pixels move with their part); 8 px are cleared from the plate so no static debris stays behind
      const solid = Uint8Array.from(dilate(Uint8Array.from(m, (v) => 1 - v), w, h, 3), (v) => 1 - v) // matte eroded by 3 px: only pure colours
      const gone = dilate(m, w, h, 8)
      m = dilate(m, w, h, 4)
      masks[spec.name] = { m, core, solid, x0, y0, w, h, c }
      // layer: original colours, alpha = soft matte x soft cut
      const layer = makeCanvas(w, h)
      const ld = new ImageData(w, h)
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x
          let n = 0
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += m[clamp(y + dy, 0, h - 1) * w + clamp(x + dx, 0, w - 1)]
          const j = ((y + y0) * img.width + (x + x0)) * 4
          ld.data[i * 4] = fid.data[j]
          ld.data[i * 4 + 1] = fid.data[j + 1]
          ld.data[i * 4 + 2] = fid.data[j + 2]
          ld.data[i * 4 + 3] = Math.round((n / 9) * c[i] * 255)
          if (c[i] >= 0.999 && gone[i]) unknownFull[(y + y0) * img.width + (x + x0)] = 1
        }
      // what a sleeve hides behind the puppy's snout: rebuilt from the fabric around it so releasing never exposes a hole
      if (spec.under && masks[spec.under]) {
        const u = masks[spec.under]
        const near = dilate(Uint8Array.from(m), w, h, 60)
        const unk = new Uint8Array(w * h)
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const ux = x + x0 - u.x0
            const uy = y + y0 - u.y0
            if (ux >= 0 && uy >= 0 && ux < u.w && uy < u.h && u.core[uy * u.w + ux] && !m[y * w + x] && near[y * w + x]) unk[y * w + x] = 1
          }
        const rgb = new Uint8ClampedArray(ld.data)
        const knownTeal = Uint8Array.from(solid) // fill only from pure fabric pixels, never from the dark/mixed fringe next to the snout
        const tmp = Uint8Array.from(unk, (v, i) => (v || !knownTeal[i] ? 1 : 0))
        inpaint(rgb, w, h, tmp)
        for (let i = 0; i < w * h; i++)
          if (unk[i]) {
            ld.data[i * 4] = rgb[i * 4]
            ld.data[i * 4 + 1] = rgb[i * 4 + 1]
            ld.data[i * 4 + 2] = rgb[i * 4 + 2]
            ld.data[i * 4 + 3] = Math.round(c[i] * 255)
          }
      }
      layer.getContext('2d').putImageData(ld, 0, 0)
      parts[spec.name] = { layer, x0, y0, w, h, k }
    }
    // clean plate: every moving part removed, the hole filled from the background around it
    inpaint(plateData, img.width, img.height, unknownFull)
    const plate = makeCanvas(img.width, img.height)
    plate.getContext('2d').putImageData(new ImageData(plateData, img.width, img.height), 0, 0)
    return { plate, parts, img }
  }

  // ---------- camera ----------
  function camera(t, state, img) {
    const c = CAMS[state]
    const u = seg(t, c.t[0], c.t[1])
    const z = lerp(c.z[0], c.z[1], u) * (1 + 0.003 * Math.sin(t * 1.3)) // slow breathing of the frame
    const s = Math.max(W / img.width, VIEW_H / img.height) * z
    const k = img.width / 1672
    const fx = lerp(c.f[0][0], c.f[1][0], u) * k
    const fy = lerp(c.f[0][1], c.f[1][1], u) * k
    const ox = clamp(W / 2 - fx * s + 1.5 * Math.sin(t * 0.5), W - img.width * s, 0)
    const oy = clamp(VIEW_H / 2 - fy * s + 1.0 * Math.sin(t * 0.7 + 1), VIEW_H - img.height * s, 0)
    return { s, ox, oy, k }
  }

  // ---------- motion: smooth, irregular, different per part ----------
  const TUGS = [[0.7, 0.62, 0.8], [1.85, 0.56, 1.0], [3.05, 0.7, 0.7], [4.3, 0.52, 1.0], [5.35, 0.66, 0.85], [6.45, 0.6, 0.5]] // [start, duration, strength]
  function tugAt(t) {
    let p = 0
    for (const [s, d, a] of TUGS) p += a * bump((t - s) / d)
    return p
  }
  function wag(t, rate, amp, phase) {
    const env = 0.7 + 0.3 * Math.sin(t * 0.55 + phase)
    return amp * env * Math.sin(2 * PI * rate * t + 0.35 * Math.sin(t * 0.8 + phase) + phase)
  }
  function motion(t, state) {
    if (state === 'A') {
      const p = tugAt(t)
      const r = seg(t, T.release[0], T.release[1])
      const nib = 0.5 * Math.sin(2 * PI * 3.3 * t) * (1 - r) * clamp(p * 2, 0, 1)
      const pauseDrift = r * (0.9 * Math.sin(2 * PI * 0.33 * t) + 0.4 * Math.sin(2 * PI * 0.71 * t))
      return {
        head: { dx: -6.2 * p - 1.2 * r, dy: 2.4 * p + nib - 1 * r + pauseDrift * 0.5, rot: 0.011 * p - 0.004 * r + 0.004 * Math.sin(2 * PI * 0.4 * t) * r },
        cuff: [-6.2 * p * 0.92, 2.4 * p * 0.92], // the cuff stays with the mouth while it is held, and does not follow the release
        tail: wag(t, 0.95, 0.07 - 0.03 * r, 0.3),
      }
    }
    if (state === 'B') {
      return { head: { dx: 1.3 * Math.sin(2 * PI * 0.27 * t), dy: 1.6 * Math.sin(2 * PI * 0.41 * t + 1), rot: 0.008 * Math.sin(2 * PI * 0.31 * t) }, tail: wag(t, 0.8, 0.06, 1.1) }
    }
    const chew = Math.sin(2 * PI * 1.55 * t + 0.4)
    const env = 0.75 + 0.25 * Math.sin(t * 0.6)
    return { head: { dx: 0.8 * Math.sin(2 * PI * 0.29 * t), dy: 2.0 * chew * env + 0.7 * Math.sin(2 * PI * 0.37 * t), rot: 0.006 * Math.sin(2 * PI * 1.55 * t + 1.2) * env }, tail: wag(t, 0.7, 0.07, 2.0) }
  }

  // ---------- drawing ----------
  function drawRigid(c, part, cam, pivot, d, rot) {
    const K = cam.s * cam.k
    const cs = Math.cos(rot)
    const sn = Math.sin(rot)
    const rx = part.x0 / part.k - pivot[0]
    const ry = part.y0 / part.k - pivot[1]
    const sc = K / part.k
    c.save()
    c.setTransform(sc * cs, sc * sn, -sc * sn, sc * cs, cam.ox + K * (pivot[0] + d[0] + cs * rx - sn * ry), cam.oy + K * (pivot[1] + d[1] + sn * rx + cs * ry))
    c.drawImage(part.layer, 0, 0)
    c.restore()
  }
  const MESH = 12
  function tri(c, tex, v0, v1, v2) {
    const det = (v1.u - v0.u) * (v2.v - v0.v) - (v2.u - v0.u) * (v1.v - v0.v)
    if (Math.abs(det) < 1e-6) return
    const a = ((v1.px - v0.px) * (v2.v - v0.v) - (v2.px - v0.px) * (v1.v - v0.v)) / det
    const cc = ((v2.px - v0.px) * (v1.u - v0.u) - (v1.px - v0.px) * (v2.u - v0.u)) / det
    const b = ((v1.py - v0.py) * (v2.v - v0.v) - (v2.py - v0.py) * (v1.v - v0.v)) / det
    const d = ((v2.py - v0.py) * (v1.u - v0.u) - (v1.py - v0.py) * (v2.u - v0.u)) / det
    const e = v0.px - a * v0.u - cc * v0.v
    const f = v0.py - b * v0.u - d * v0.v
    const mx = (v0.px + v1.px + v2.px) / 3
    const my = (v0.py + v1.py + v2.py) / 3
    const grow = (p, m) => p + Math.sign(p - m) * 0.5
    c.save()
    c.beginPath()
    c.moveTo(grow(v0.px, mx), grow(v0.py, my))
    c.lineTo(grow(v1.px, mx), grow(v1.py, my))
    c.lineTo(grow(v2.px, mx), grow(v2.py, my))
    c.closePath()
    c.clip()
    c.setTransform(a, b, cc, d, e, f)
    const bx = Math.max(0, Math.floor(Math.min(v0.u, v1.u, v2.u)) - 1)
    const by = Math.max(0, Math.floor(Math.min(v0.v, v1.v, v2.v)) - 1)
    const bw = Math.min(tex.width - bx, Math.ceil(Math.max(v0.u, v1.u, v2.u)) - bx + 1)
    const bh = Math.min(tex.height - by, Math.ceil(Math.max(v0.v, v1.v, v2.v)) - by + 1)
    if (bw > 0 && bh > 0) c.drawImage(tex, bx, by, bw, bh, bx, by, bw, bh)
    c.restore()
  }
  // the sleeve: only the cuff near the mouth deforms; the weight is zero at the hand, the upper arm and the layer edge
  function drawSleeve(c, part, cam, dcuff) {
    if (!dcuff || (Math.abs(dcuff[0]) < 0.02 && Math.abs(dcuff[1]) < 0.02)) return drawRigid(c, part, cam, [0, 0], [0, 0], 0)
    const K = cam.s * cam.k
    const nx = Math.ceil(part.w / MESH)
    const ny = Math.ceil(part.h / MESH)
    const V = []
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= nx; i++) {
        const u = Math.min(part.w, i * MESH)
        const v = Math.min(part.h, j * MESH)
        const rx = (part.x0 + u) / part.k
        const ry = (part.y0 + v) / part.k
        const w = Math.exp(-(((rx - 748) / 62) ** 2 + ((ry - 392) / 48) ** 2) / 2) * (1 - smooth(clamp((rx - 790) / 100))) * (1 - smooth(clamp((ry - 402) / 38)))
        V.push({ u, v, px: cam.ox + (rx + dcuff[0] * w) * K, py: cam.oy + (ry + dcuff[1] * w) * K })
      }
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const a = V[j * (nx + 1) + i]
        const b = V[j * (nx + 1) + i + 1]
        const d = V[(j + 1) * (nx + 1) + i]
        const e = V[(j + 1) * (nx + 1) + i + 1]
        tri(c, part.layer, a, b, d)
        tri(c, part.layer, b, e, d)
      }
  }
  function sparkle(c, x, y, s, color, alpha) {
    c.save()
    c.globalAlpha = alpha
    c.translate(x, y)
    c.scale(s, s)
    c.beginPath()
    c.moveTo(0, -12)
    c.quadraticCurveTo(2, -2, 12, 0)
    c.quadraticCurveTo(2, 2, 0, 12)
    c.quadraticCurveTo(-2, 2, -12, 0)
    c.quadraticCurveTo(-2, -2, 0, -12)
    c.fillStyle = color
    c.fill()
    c.restore()
  }

  function picture(c, t) {
    const state = stateAt(t)
    const b = (built[state] ||= buildState(state))
    const cam = camera(t, state, b.img)
    const mo = motion(t, state)
    c.save()
    c.beginPath()
    c.rect(0, 0, W, VIEW_H)
    c.clip()
    c.imageSmoothingQuality = 'high'
    c.drawImage(b.plate, cam.ox, cam.oy, b.img.width * cam.s, b.img.height * cam.s)
    // order: sleeve under the snout, tail, head on top
    if (b.parts.sleeve) drawSleeve(c, b.parts.sleeve, cam, mo.cuff)
    if (b.parts.tail) drawRigid(c, b.parts.tail, cam, PIVOT[state].tail, [0, 0], mo.tail)
    if (b.parts.head) drawRigid(c, b.parts.head, cam, PIVOT[state].head, [mo.head.dx, mo.head.dy], mo.head.rot)
    // calm praise: a few soft golden sparkles around the puppy (state C only)
    if (state === 'C' && t > T.praiseFrom - 0.3) {
      const fade = 1 - seg(t, 22.8, 23.4)
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.9 + i * 0.29) % 1
        const px = cam.ox + (330 + i * 70 + 20 * Math.sin(i * 2)) * cam.k * cam.s
        const py = cam.oy + (400 + ((i * 47) % 90) - ph * 40) * cam.k * cam.s
        sparkle(c, px, py, 0.5 + 0.7 * Math.sin(ph * PI), 'rgba(255,214,110,1)', Math.sin(ph * PI) * 0.85 * fade * seg(t, T.praiseFrom - 0.3, T.praiseFrom + 0.5))
      }
    }
    c.restore()
  }

  function rr(c, x, y, w, h, r, fill) {
    c.beginPath()
    c.roundRect(x, y, w, h, r)
    c.fillStyle = fill
    c.fill()
  }
  function disc(c, x, y, r, fill) {
    c.beginPath()
    c.arc(x, y, r, 0, PI * 2)
    c.fillStyle = fill
    c.fill()
  }
  function ui(c, t) {
    rr(c, 36, 24, 150, 54, 27, P.blue)
    disc(c, 66, 55, 8, '#FFFFFF')
    ;[[-9, -8], [-3, -12], [3, -12], [9, -8]].forEach(([dx, dy]) => disc(c, 66 + dx * 1.1, 55 + dy, 3.4, '#FFFFFF'))
    c.font = `800 30px ${FONT}`
    c.fillStyle = '#FFFFFF'
    c.textAlign = 'left'
    c.textBaseline = 'middle'
    c.direction = 'ltr'
    c.fillText('Woffiz', 90, 53)
    rr(c, 204, 34, 300, 34, 17, 'rgba(20,48,79,0.82)')
    c.font = `700 19px ${FONT}`
    c.fillStyle = '#FFFFFF'
    c.textAlign = 'center'
    c.direction = 'rtl'
    c.fillText('טיוטה · תצוגה מקדימה מקומית', 354, 52)
    const ms = t * 1000
    const cap = cfg.captions.find((k) => ms >= k.startMs && ms < k.endMs)
    const started = cfg.captions.filter((k) => ms >= k.startMs)
    const active = (cap ?? started[started.length - 1])?.step ?? 1
    for (let n = 1; n <= 3; n++) {
      const x = 1240 - (n - 1) * 62 - 26
      const on = n === active
      disc(c, x, 52, 24, on ? P.cta : 'rgba(255,255,255,0.88)')
      if (on) {
        c.lineWidth = 3
        c.strokeStyle = '#E08A00'
        c.beginPath()
        c.arc(x, 52, 24, 0, PI * 2)
        c.stroke()
      }
      c.font = `800 26px ${FONT}`
      c.fillStyle = on ? P.ctaInk : P.navy
      c.direction = 'ltr'
      c.textAlign = 'center'
      c.fillText(String(n), x, 54)
    }
    c.fillStyle = P.navy
    c.fillRect(0, VIEW_H, W, H - VIEW_H)
    c.fillStyle = P.cta
    c.fillRect(0, VIEW_H, W, 4)
    if (!cap) return
    const a = clamp((ms - cap.startMs) / 200) * clamp((cap.endMs - ms) / 200) // captions never overlap: each fades out before the next starts
    c.save()
    c.globalAlpha = a
    disc(c, 1196, 667, 32, P.cta)
    c.font = `800 38px ${FONT}`
    c.fillStyle = P.ctaInk
    c.direction = 'ltr'
    c.textAlign = 'center'
    c.fillText(String(cap.step), 1196, 670)
    c.font = `800 40px ${FONT}`
    c.fillStyle = '#FFFFFF'
    c.direction = 'rtl'
    c.textAlign = 'center'
    cap.lines.forEach((ln, i) => c.fillText(ln, 600, 640 + i * 50))
    c.restore()
  }

  function draw(c, t) {
    c.save()
    c.clearRect(0, 0, W, H)
    if (cfg.images.length === 3) picture(c, t)
    ui(c, t)
    const fade = Math.max(1 - seg(t, 0, 0.4), seg(t, 23.4, 24)) // opening and closing fade only; story changes are cuts
    if (fade > 0) {
      c.fillStyle = `rgba(255,244,221,${fade})`
      c.fillRect(0, 0, W, H)
    }
    c.restore()
  }

  root.WoffizScene = {
    W,
    H,
    T,
    init(config) {
      cfg = Object.assign({ captions: [], images: [] }, config)
      for (const k of Object.keys(built)) delete built[k]
    },
    draw,
  }
})(typeof window !== 'undefined' ? window : globalThis)
