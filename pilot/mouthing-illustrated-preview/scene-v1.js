// Woffiz illustrated preview, photo-real version: built from the three reference stills in ./reference (1.png mouthing the sleeve,
// 2.png toy offered, 3.png chewing the toy). The whole clip is a pure function of time:
//   WoffizScene.init({ captions, images: [img1, img2, img3] })   WoffizScene.draw(ctx, tSeconds)
// Motion = the puppy is cut out on its own layer and warped (it tugs the sleeve and the cuff follows, tail wag, chewing); the background stays still, slow camera, window light, dust and a staged cross-dissolve: the puppy side changes first (it pauses/releases)
// while the handler's side (arm and toy) changes later (the toy is offered only afterwards). The old vector scene is scene-vector.js.
(function (root) {
  'use strict'
  const W = 1280
  const H = 720
  const VIEW_H = 610 // picture area; the caption bar owns the rest, so captions never cover the toy
  const PI = Math.PI
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
  const smooth = (x) => x * x * (3 - 2 * x)
  const seg = (t, a, b) => smooth(clamp((t - a) / (b - a)))
  const lerp = (a, b, k) => a + (b - a) * k
  const FONT = "'Heebo', 'Segoe UI', Arial, sans-serif"
  const P = { blue: '#1F6FD1', cta: '#FFC22E', ctaInk: '#3D2600', navy: '#14304F' }

  // Key times (seconds)
  const T = {
    puppyChange: [8.0, 8.7], // puppy releases the sleeve and looks up; the handler's arm has not moved
    handlerChange: [10.3, 10.85], // only now the other hand brings the toy
    chew: [12.5, 13.05], // puppy takes the toy and settles down to chew
    praiseFrom: 14.4,
  }
  const SPLIT = [756, 776] // image-space x range where the "puppy side" hands over to the "handler side"
  // camera keys: [t, zoom, focusX, focusY] in image pixels (1672 x 941 reference space)
  const CAM = [
    [0, 1.0, 836, 470],
    [8, 1.07, 800, 430],
    [12.5, 1.05, 880, 450],
    [13.05, 1.03, 760, 560],
    [24, 1.12, 520, 640],
  ]

  let cfg = { captions: [], images: [] }
  let buf = null

  function camera(t, img) {
    let i = 0
    while (i < CAM.length - 2 && t >= CAM[i + 1][0]) i++
    const a = CAM[i]
    const b = CAM[i + 1]
    const k = seg(t, a[0], b[0])
    const z = lerp(a[1], b[1], k) * (1 + 0.004 * Math.sin(t * 1.9)) // breathing
    const s = Math.max(W / img.width, VIEW_H / img.height) * z
    const fx = lerp(a[2], b[2], k) * (img.width / 1672)
    const fy = lerp(a[3], b[3], k) * (img.height / 941)
    const ox = clamp(W / 2 - fx * s + 2 * Math.sin(t * 0.7), W - img.width * s, 0)
    const oy = clamp(VIEW_H / 2 - fy * s + 1.5 * Math.sin(t * 0.9 + 1), VIEW_H - img.height * s, 0)
    return { s, ox, oy, sx: img.width / 1672 }
  }
  const toCanvas = (cam, ix, iy) => [cam.ox + ix * cam.sx * cam.s, cam.oy + iy * cam.sx * cam.s]

  function drawImg(c, img, cam, alpha = 1) {
    c.globalAlpha = alpha
    c.drawImage(img, cam.ox, cam.oy, img.width * cam.s, img.height * cam.s)
    c.globalAlpha = 1
  }

  // ---------- life: the puppy moves on its own layer ----------
  // For each moving zone the puppy (and, in the mouthing still, the sleeve) is cut out with a colour mask, the background under it is
  // filled in, and only the cut-out is redrawn as a warped triangle mesh. The wall, the sofa, the floor and the handler's hand stay
  // exactly where they are. Fields are in reference-image pixels (1672 x 941) and fall to zero at the zone edge.
  const sstep = (a, b, x) => smooth(clamp((x - a) / (b - a)))
  const rot = (x, y, px, py, th) => {
    const dx = x - px
    const dy = y - py
    return [px + dx * Math.cos(th) - dy * Math.sin(th) - x, py + dx * Math.sin(th) + dy * Math.cos(th) - y]
  }
  function tailField(x, y, px, py, rmax, amp, rate, t, ymax) {
    const d = Math.hypot(x - px, y - py)
    const w = sstep(15, 70, d) * (1 - sstep(rmax - 50, rmax, d)) * (y < ymax ? 1 : 1 - sstep(ymax, ymax + 40, y))
    return rot(x, y, px, py, amp * Math.sin(t * rate) * w)
  }
  const ZONES = [
    {
      key: 'A', rect: [300, 120, 930, 470], sleeve: true,
      // mouthing: the puppy tugs, the cuff follows, the hand and knee are outside the weights
      field(x, y, t) {
        const slow = 1 - sstep(6.6, 7.8, t) // the tugging settles before the puppy lets go
        const pull = Math.pow(Math.max(0, Math.sin((t * 2 * PI) / 1.25)), 1.4) * slow
        const nib = 0.35 * Math.sin(t * 13) * slow
        const wy = lerp(1, 1 - sstep(395, 448, y), sstep(690, 720, x)) * lerp(1, sstep(170, 340, y), sstep(690, 720, x))
        const w = sstep(250, 480, x) * (1 - sstep(790, 905, x)) * wy
        const [rx, ry] = rot(x, y, 500, 380, 0.011 * (pull - 0.3) * Math.exp(-(((x - 580) / 190) ** 2 + ((y - 320) / 170) ** 2) / 2))
        return [-17 * pull * w + rx, (4 * pull + 1.6 * nib) * w + ry]
      },
    },
    { key: 'A', rect: [30, 190, 310, 450], field: (x, y, t) => tailField(x, y, 215, 395, 215, 0.2, 6.2, t, 430) },
    {
      key: 'B', rect: [260, 120, 800, 470], // toy offered: the puppy watches and nods
      field(x, y, t) {
        const head = sstep(300, 480, x) * (1 - sstep(700, 780, x)) * sstep(150, 230, y) * (1 - sstep(420, 540, y))
        const [rx, ry] = rot(x, y, 520, 420, 0.02 * Math.sin(t * 1.3) * head)
        return [rx, 2.6 * Math.sin(t * 1.6) * head + ry]
      },
    },
    { key: 'B', rect: [30, 190, 310, 450], field: (x, y, t) => tailField(x, y, 215, 395, 215, 0.17, 4.2, t, 430) },
    {
      key: 'C', rect: [0, 380, 720, 800], // calm chewing and a wagging tail
      field(x, y, t) {
        const c = Math.sin(t * 5.2)
        const head = sstep(190, 330, x) * (1 - sstep(600, 720, x)) * sstep(400, 460, y) * (1 - sstep(640, 740, y))
        const [rx, ry] = rot(x, y, 250, 640, 0.022 * c * head)
        const [tx, ty] = tailField(x, y, 125, 640, 160, 0.2, 6.5, t, 700)
        return [rx + tx, 2.2 * c * head + ry + ty]
      },
    },
  ]
  const STEP = 20
  const makeCanvas = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }))

  // colour masks (HSV measured on the three stills: fur H 31-35 S>.45, wall H 23-25, sleeve H 176-179)
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
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) if (q >= 0 && q < w * h && bin[q] && !lab[q]) ((lab[q] = n), stack.push(q))
      }
      if (cnt > bestN) ((bestN = cnt), (best = n))
    }
    const out = new Uint8Array(w * h)
    for (let i = 0; i < w * h; i++) out[i] = lab[i] === best ? 1 : 0
    return out
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
    return bin.map((v, i) => (v || !outside[i] ? 1 : 0))
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
  function prepareZone(z, img) {
    const k = img.width / 1672
    const [x0, y0, x1, y1] = z.rect.map((v) => Math.round(v * k))
    const w = x1 - x0
    const h = y1 - y0
    const src = makeCanvas(w, h)
    const sc = src.getContext('2d', { willReadFrequently: true })
    sc.drawImage(img, x0, y0, w, h, 0, 0, w, h)
    const id = sc.getImageData(0, 0, w, h)
    const d = id.data
    const fur = new Uint8Array(w * h)
    const teal = new Uint8Array(w * h)
    for (let i = 0; i < w * h; i++) {
      const [hh, s, v] = hsv(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])
      if (hh >= 29.5 && hh <= 52 && s >= 0.33 && v >= 0.35) fur[i] = 1
      if (z.sleeve && hh >= 160 && hh <= 200 && s >= 0.28 && v >= 0.3) teal[i] = 1
    }
    let F = fillHoles(largest(fur, w, h), w, h)
    if (z.sleeve) {
      const T = largest(teal, w, h)
      F = F.map((v, i) => (v || T[i] ? 1 : 0))
    }
    F = dilate(F, w, h, 2)
    // cut-out layer (soft 1px edge) and the background plate with the cut-out region filled in from its surroundings
    const fg = makeCanvas(w, h)
    const fd = new ImageData(new Uint8ClampedArray(d), w, h)
    for (let i = 0; i < w * h; i++) {
      let a = F[i] * 255
      const x = i % w
      if (F[i]) {
        const edge = (x > 0 && !F[i - 1]) || (x < w - 1 && !F[i + 1]) || (i >= w && !F[i - w]) || (i + w < w * h && !F[i + w])
        if (edge) a = 150
      }
      fd.data[i * 4 + 3] = a
    }
    fg.getContext('2d').putImageData(fd, 0, 0)
    const unk = dilate(F, w, h, 4)
    const known = Uint8Array.from(unk, (v) => 1 - v)
    const pd = new Uint8ClampedArray(d)
    for (let guard = 0; guard < 400; guard++) {
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
              if (known[j]) ((r += pd[j * 4]), (g += pd[j * 4 + 1]), (b += pd[j * 4 + 2]), n++)
            }
          if (n) fill.push([i, r / n, g / n, b / n])
        }
      if (!fill.length) break
      for (const [i, r, g, b] of fill) ((pd[i * 4] = r), (pd[i * 4 + 1] = g), (pd[i * 4 + 2] = b), (known[i] = 1))
    }
    for (let i = 0; i < w * h; i++) pd[i * 4 + 3] = unk[i] ? 255 : 0 // only the filled-in ring is drawn: no seam at the zone edge
    const plate = makeCanvas(w, h)
    plate.getContext('2d').putImageData(new ImageData(pd, w, h), 0, 0)
    return { fg, plate, x0, y0, w, h, k }
  }

  function tri(c, tex, ox, oy, k, cam, v0, v1, v2) {
    const u0 = v0.sx * k - ox, w0 = v0.sy * k - oy, u1 = v1.sx * k - ox, w1 = v1.sy * k - oy, u2 = v2.sx * k - ox, w2 = v2.sy * k - oy
    const det = (u1 - u0) * (w2 - w0) - (u2 - u0) * (w1 - w0)
    if (Math.abs(det) < 1e-6) return
    const a = ((v1.px - v0.px) * (w2 - w0) - (v2.px - v0.px) * (w1 - w0)) / det
    const cc = ((v2.px - v0.px) * (u1 - u0) - (v1.px - v0.px) * (u2 - u0)) / det
    const b = ((v1.py - v0.py) * (w2 - w0) - (v2.py - v0.py) * (w1 - w0)) / det
    const d = ((v2.py - v0.py) * (u1 - u0) - (v1.py - v0.py) * (u2 - u0)) / det
    const e = v0.px - a * u0 - cc * w0
    const f = v0.py - b * u0 - d * w0
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
    const bx = Math.max(0, Math.floor(Math.min(u0, u1, u2)) - 1)
    const by = Math.max(0, Math.floor(Math.min(w0, w1, w2)) - 1)
    const bw = Math.min(tex.width - bx, Math.ceil(Math.max(u0, u1, u2)) - bx + 1)
    const bh = Math.min(tex.height - by, Math.ceil(Math.max(w0, w1, w2)) - by + 1)
    if (bw > 0 && bh > 0) c.drawImage(tex, bx, by, bw, bh, bx, by, bw, bh)
    c.restore()
  }
  function drawLayer(c, img, cam, t, key, alpha = 1) {
    c.globalAlpha = alpha
    c.drawImage(img, cam.ox, cam.oy, img.width * cam.s, img.height * cam.s)
    const K = cam.sx * cam.s
    ZONES.forEach((z, zi) => {
      if (z.key !== key) return
      const pre = (prepared[zi] ||= prepareZone(z, img))
      // background plate (identical to the picture except where the puppy was), then the puppy cut-out as a moving mesh
      c.drawImage(pre.plate, cam.ox + (pre.x0 / pre.k) * K, cam.oy + (pre.y0 / pre.k) * K, (pre.w / pre.k) * K, (pre.h / pre.k) * K)
      const [x0, y0, x1, y1] = z.rect
      const nx = Math.ceil((x1 - x0) / STEP)
      const ny = Math.ceil((y1 - y0) / STEP)
      const V = []
      for (let j = 0; j <= ny; j++)
        for (let i = 0; i <= nx; i++) {
          const sx = Math.min(x1, x0 + i * STEP)
          const sy = Math.min(y1, y0 + j * STEP)
          const edge = Math.min(sstep(0, 24, sx - x0), sstep(0, 24, x1 - sx), sstep(0, 24, sy - y0), sstep(0, 24, y1 - sy))
          const [dx, dy] = z.field(sx, sy, t)
          V.push({ sx, sy, px: cam.ox + (sx + dx * edge) * K, py: cam.oy + (sy + dy * edge) * K })
        }
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const a = V[j * (nx + 1) + i]
          const b = V[j * (nx + 1) + i + 1]
          const d = V[(j + 1) * (nx + 1) + i]
          const e = V[(j + 1) * (nx + 1) + i + 1]
          tri(c, pre.fg, pre.x0, pre.y0, pre.k, cam, a, b, d)
          tri(c, pre.fg, pre.x0, pre.y0, pre.k, cam, b, e, d)
        }
    })
    c.globalAlpha = 1
  }
  const prepared = {}

  function picture(c, t) {
    const [im1, im2, im3] = cfg.images
    const cam = camera(t, im1)
    c.save()
    c.beginPath()
    c.rect(0, 0, W, VIEW_H)
    c.clip()
    const a3 = seg(t, T.chew[0], T.chew[1])
    if (a3 < 1) {
      drawLayer(c, im1, cam, t, 'A')
      const early = seg(t, T.puppyChange[0], T.puppyChange[1])
      const late = seg(t, T.handlerChange[0], T.handlerChange[1])
      if (early > 0 || late > 0) {
        if (!buf) buf = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, VIEW_H) : Object.assign(document.createElement('canvas'), { width: W, height: VIEW_H })
        const b = buf.getContext('2d')
        b.globalCompositeOperation = 'source-over'
        b.clearRect(0, 0, W, VIEW_H)
        drawLayer(b, im2, cam, t, 'B')
        const x0 = clamp((cam.ox + SPLIT[0] * cam.sx * cam.s) / W)
        const x1 = clamp((cam.ox + SPLIT[1] * cam.sx * cam.s) / W)
        const g = b.createLinearGradient(0, 0, W, 0)
        g.addColorStop(0, `rgba(0,0,0,${early})`)
        g.addColorStop(x0, `rgba(0,0,0,${early})`)
        g.addColorStop(Math.max(x1, x0 + 1e-4), `rgba(0,0,0,${late})`)
        g.addColorStop(1, `rgba(0,0,0,${late})`)
        b.globalCompositeOperation = 'destination-in'
        b.fillStyle = g
        b.fillRect(0, 0, W, VIEW_H)
        c.drawImage(buf, 0, 0)
      }
    }
    if (a3 > 0) drawLayer(c, im3, cam, t, 'C', a3)

    // warm window light drifting a little, soft vignette, dust motes
    const glow = c.createRadialGradient(1260, 30, 0, 1260, 30, 760)
    const gi = 0.14 + 0.04 * Math.sin(t * 0.6)
    glow.addColorStop(0, `rgba(255,236,190,${gi})`)
    glow.addColorStop(1, 'rgba(255,236,190,0)')
    c.fillStyle = glow
    c.fillRect(0, 0, W, VIEW_H)
    const vg = c.createRadialGradient(W / 2, VIEW_H / 2, 320, W / 2, VIEW_H / 2, 800)
    vg.addColorStop(0, 'rgba(60,30,10,0)')
    vg.addColorStop(1, 'rgba(60,30,10,0.18)')
    c.fillStyle = vg
    c.fillRect(0, 0, W, VIEW_H)
    for (let i = 0; i < 16; i++) {
      const x = ((i * 137 + t * (5 + (i % 4) * 3)) % (W + 40)) - 20
      const y = VIEW_H - ((i * 71 + t * (7 + (i % 3) * 4)) % (VIEW_H + 40)) + 20
      const a = (0.12 + 0.12 * Math.sin(t * 0.8 + i)) * (y > 60 ? 1 : 0)
      c.beginPath()
      c.arc(x, y, 1.6 + (i % 3), 0, PI * 2)
      c.fillStyle = `rgba(255,244,214,${Math.max(0, a)})`
      c.fill()
    }
    // calm praise: a few soft golden sparkles around the puppy
    if (t > T.praiseFrom - 0.3) {
      const fade = 1 - seg(t, 22.8, 23.4)
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.9 + i * 0.29) % 1
        const [px, py] = toCanvas(cam, 330 + i * 70 + 20 * Math.sin(i * 2), 400 + ((i * 47) % 90) - ph * 40)
        sparkle(c, px, py, 0.5 + 0.7 * Math.sin(ph * PI), 'rgba(255,214,110,1)', Math.sin(ph * PI) * 0.85 * fade * seg(t, T.praiseFrom - 0.3, T.praiseFrom + 0.5))
      }
    }
    c.restore()
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
    const active = t < 8.5 ? 1 : t < 13.4 ? 2 : 3
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
    // caption bar below the picture
    c.fillStyle = 'rgba(20,48,79,1)'
    c.fillRect(0, VIEW_H, W, H - VIEW_H)
    c.fillStyle = P.cta
    c.fillRect(0, VIEW_H, W, 4)
    const cap = cfg.captions.find((k) => t * 1000 >= k.startMs && t * 1000 < k.endMs)
    if (!cap) return
    const a = clamp((t * 1000 - cap.startMs) / 250) * clamp((cap.endMs - t * 1000) / 250)
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
    const fade = Math.max(1 - seg(t, 0, 0.4), seg(t, 23.4, 24))
    if (fade > 0) {
      c.fillStyle = `rgba(255,244,221,${fade})`
      c.fillRect(0, 0, W, H)
    }
    c.restore()
  }

  root.WoffizScene = {
    W,
    H,
    init(config) {
      cfg = Object.assign({ captions: [], images: [] }, config)
    },
    draw,
  }
})(typeof window !== 'undefined' ? window : globalThis)
