// Woffiz illustrated preview: the whole animation as one pure function of time, drawn with Canvas 2D (no assets, no network).
//   WoffizScene.init({ captions, durationMs })   WoffizScene.draw(ctx, tSeconds)
// Edit shapes, colours and key times here; scripts/render-illustrated-preview.mjs renders it to MP4, preview.html plays it live.
// Story (DRAFT technique): 1) puppy mouths the sleeve, the handler's hand stays relaxed and still; 2) puppy pauses/releases,
// and only then the toy is offered; 3) puppy chews the toy calmly and is praised. No waiting time, no pulling the hand away.
(function (root) {
  'use strict'
  const W = 1280
  const H = 720
  const PI = Math.PI
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
  const smooth = (x) => x * x * (3 - 2 * x)
  const seg = (t, a, b) => smooth(clamp((t - a) / (b - a)))
  const lerp = (a, b, k) => a + (b - a) * k
  const FONT = "'Heebo', 'Segoe UI', Arial, sans-serif"

  const P = {
    wallTop: '#CDEBFF', wallBot: '#EAF6FF', wainscot: '#BEE0F8', floor: '#EDCB98', floorLine: '#DDB57A',
    rug: '#FFF4DD', rugEdge: '#2F7DE1', rugEdge2: '#FFC22E',
    teal: '#1E9AA3', tealDark: '#16777F', tealFar: '#188089', tealLight: '#46BDC4',
    skin: '#F1BE97', skinShade: '#DFA277', hair: '#5A3B2A', pants: '#35466B', pantsDark: '#2A3857', shoe: '#F7F4EE',
    gold: '#E9A93F', goldLight: '#F6CC78', goldDark: '#C98A2F', goldBelly: '#FBE3AE', nose: '#3A2A24',
    blue: '#2F7DE1', blueDark: '#1F5FB4', cream: '#FFF1D0', ink: '#1D2B3A', cta: '#FFC22E', ctaInk: '#3D2600', navy: '#14304F', pink: '#FF7A9C',
  }

  // Key times (seconds). Everything below is derived from these.
  const T = {
    pauseFrom: 8.0, pauseTo: 8.9, // puppy stops mouthing and lifts its head
    armFrom: 10.2, armTo: 11.6, // only now does the other hand bring the toy
    leanFrom: 11.4, bite: 12.6, // puppy leans in and takes the toy
    transfer: [12.4, 12.9], retract: [13.0, 14.2], // toy moves to the mouth, empty hand goes back
    happyFrom: 14.8, // praise
  }

  let cfg = { captions: [], durationMs: 24000 }

  // ---------- small drawing helpers ----------
  function ell(c, x, y, rx, ry, fill, rot = 0) {
    c.beginPath()
    c.ellipse(x, y, rx, ry, rot, 0, PI * 2)
    c.fillStyle = fill
    c.fill()
  }
  function rr(c, x, y, w, h, r, fill) {
    c.beginPath()
    c.roundRect(x, y, w, h, r)
    c.fillStyle = fill
    c.fill()
  }
  function line(c, pts, width, color) {
    c.beginPath()
    c.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1])
    c.lineWidth = width
    c.strokeStyle = color
    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.stroke()
  }
  function heart(c, x, y, s, color, alpha) {
    c.save()
    c.globalAlpha = alpha
    c.translate(x, y)
    c.scale(s, s)
    c.beginPath()
    c.moveTo(0, 8)
    c.bezierCurveTo(-22, -8, -12, -24, 0, -12)
    c.bezierCurveTo(12, -24, 22, -8, 0, 8)
    c.fillStyle = color
    c.fill()
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
  const blink = (t) => (t % 4.3 > 4.15 ? 0.1 : 1)

  // ---------- room ----------
  function drawRoom(c, t) {
    const g = c.createLinearGradient(0, 0, 0, 340)
    g.addColorStop(0, P.wallTop)
    g.addColorStop(1, P.wallBot)
    c.fillStyle = g
    c.fillRect(0, 0, W, 340)
    c.fillStyle = P.wainscot
    c.fillRect(0, 296, W, 44)
    c.fillStyle = '#A9D3F0'
    c.fillRect(0, 292, W, 5)
    // floor
    c.fillStyle = P.floor
    c.fillRect(0, 340, W, 380)
    c.strokeStyle = P.floorLine
    c.lineWidth = 3
    for (let y = 372; y < 720; y += 52 + (y - 372) * 0.12) {
      c.beginPath()
      c.moveTo(0, y)
      c.lineTo(W, y)
      c.stroke()
    }
    // window with a drifting cloud
    c.save()
    rr(c, 930, 92, 230, 180, 22, '#FFFFFF')
    c.beginPath()
    c.roundRect(944, 106, 202, 152, 14)
    c.clip()
    const sky = c.createLinearGradient(0, 106, 0, 258)
    sky.addColorStop(0, '#7CCBFF')
    sky.addColorStop(1, '#CFEEFF')
    c.fillStyle = sky
    c.fillRect(944, 106, 202, 152)
    const cx = 944 + ((t * 9) % 320) - 60
    ell(c, cx, 160, 38, 15, '#FFFFFF')
    ell(c, cx + 24, 150, 26, 16, '#FFFFFF')
    ell(c, cx - 22, 152, 22, 12, '#FFFFFF')
    c.fillStyle = '#FFFFFF'
    c.fillRect(1041, 106, 8, 152)
    c.fillRect(944, 177, 202, 8)
    c.restore()
    // sun-lit patch on the floor
    c.save()
    c.globalAlpha = 0.18
    c.fillStyle = '#FFFFFF'
    c.beginPath()
    c.moveTo(980, 340)
    c.lineTo(1140, 340)
    c.lineTo(1230, 560)
    c.lineTo(1000, 560)
    c.closePath()
    c.fill()
    c.restore()
    // framed paw print
    rr(c, 96, 90, 130, 150, 16, '#FFF1D0')
    rr(c, 108, 102, 106, 126, 8, '#FFE08A')
    ell(c, 161, 178, 22, 18, P.goldDark)
    ;[[-26, -10], [-9, -26], [9, -26], [26, -10]].forEach(([dx, dy]) => ell(c, 161 + dx, 160 + dy + 8, 7, 9, P.goldDark))
    // plant
    c.fillStyle = '#2E9E5B'
    ;[[-30, -70, -0.5], [0, -90, 0], [30, -66, 0.5], [-14, -52, -0.25], [16, -50, 0.25]].forEach(([dx, dy, r]) => ell(c, 1196 + dx, 300 + dy, 14, 40, '#2E9E5B', r))
    rr(c, 1166, 296, 60, 52, 8, '#D9763C')
    rr(c, 1160, 290, 72, 16, 8, '#C4642D')
    // rug with a blue-and-yellow border
    ell(c, 640, 478, 540, 96, 'rgba(60,40,10,0.12)')
    ell(c, 640, 462, 536, 94, P.rugEdge)
    ell(c, 640, 462, 520, 82, P.rugEdge2)
    ell(c, 640, 462, 508, 74, P.rug)
    c.strokeStyle = '#F1DDB8'
    c.lineWidth = 3
    c.setLineDash([2, 16])
    c.beginPath()
    c.ellipse(640, 462, 440, 58, 0, 0, PI * 2)
    c.stroke()
    c.setLineDash([])
  }

  // ---------- puppy ----------
  const HEAD_KEYS = [
    [0, 534, 350, -0.35],
    [T.pauseFrom, 534, 350, -0.35],
    [T.pauseTo, 600, 328, -0.12],
    [T.leanFrom, 600, 328, -0.12],
    [T.bite, 572, 325, -0.15],
    [13.4, 560, 350, -0.22],
    [999, 560, 350, -0.22],
  ]
  function headPose(t) {
    let i = 0
    while (i < HEAD_KEYS.length - 2 && t >= HEAD_KEYS[i + 1][0]) i++
    const a = HEAD_KEYS[i]
    const b = HEAD_KEYS[i + 1]
    const k = seg(t, a[0], b[0] === a[0] ? a[0] + 1e-6 : b[0])
    return { x: lerp(a[1], b[1], k), y: lerp(a[2], b[2], k), r: lerp(a[3], b[3], k) }
  }
  function puppyState(t) {
    const p = headPose(t)
    let open = 0.1
    if (t < T.pauseFrom) {
      // quick little nibbles on the sleeve
      const n = Math.sin(t * 12.5)
      open = 0.3 + 0.3 * n
      p.y += 2 * Math.sin(t * 12.5 + 1)
      p.r += 0.025 * Math.sin(t * 6.3)
    } else if (t < T.pauseTo) open = lerp(0.35, 0.1, seg(t, T.pauseFrom, T.pauseTo))
    else if (t < T.bite) open = 0.1 + 0.25 * seg(t, 11.8, T.bite)
    else open = 0.18 + 0.16 * Math.sin((t - T.bite) * 4.2) // slow, calm chewing
    const chewing = t > 13.2
    if (chewing) {
      p.y += 3 * Math.sin((t - T.bite) * 4.2)
      p.r += 0.02 * Math.sin((t - T.bite) * 2.1)
    }
    const tailRate = t < T.pauseFrom ? 5 : chewing ? 6.5 : 4
    const tail = Math.sin(t * tailRate) * (chewing ? 20 : 14)
    // eyes follow the toy while it approaches
    const look = t > T.armFrom && t < T.bite ? 0.7 * seg(t, T.armFrom, 11.2) : 0
    return { head: p, open, tail, look, happy: t > T.happyFrom }
  }

  function drawPuppy(c, t, s, toyInMouth) {
    const hp = s.head
    // soft shadow
    ell(c, 705, 482, 175, 15, 'rgba(60,40,10,0.18)')
    // tail
    c.save()
    c.translate(800, 405)
    c.rotate((s.tail * PI) / 180)
    c.beginPath()
    c.moveTo(0, 0)
    c.bezierCurveTo(46, -10, 70, -48, 56, -92)
    c.lineWidth = 26
    c.strokeStyle = P.gold
    c.lineCap = 'round'
    c.stroke()
    ell(c, 57, -90, 14, 14, P.goldLight)
    c.restore()
    // hind leg + body
    ell(c, 765, 445, 60, 54, P.goldDark)
    ell(c, 690, 428, 128, 68, P.gold)
    ell(c, 690, 458, 100, 34, P.goldBelly)
    ell(c, 770, 442, 52, 46, P.gold)
    ell(c, 796, 480, 30, 11, P.cream)
    // front legs
    ;[[622, P.goldDark], [662, P.gold]].forEach(([x, col]) => {
      line(c, [[x, 440], [x - 2, 474]], 30, col)
      ell(c, x - 2, 478, 20, 10, P.cream)
    })
    // neck
    const A = [628, 414]
    line(c, [A, [hp.x, hp.y]], 92, P.gold)
    // collar (blue) with a yellow tag
    const k = 0.5
    const px = lerp(A[0], hp.x, k)
    const py = lerp(A[1], hp.y, k)
    const d = Math.hypot(hp.x - A[0], hp.y - A[1])
    const nx = -(hp.y - A[1]) / d
    const ny = (hp.x - A[0]) / d
    line(c, [[px + nx * 46, py + ny * 46], [px - nx * 46, py - ny * 46]], 15, P.blue)
    ell(c, px - nx * 46 + 4, py - ny * 46 + 14, 9, 9, P.cta)
    // head
    c.save()
    c.translate(hp.x, hp.y)
    c.rotate(hp.r)
    const o = s.open
    if (toyInMouth) drawToy(c, MOUTH[0], MOUTH[1], PI / 2 + 0.09 * Math.sin((t - T.bite) * 4.2))
    ell(c, 0, 0, 60, 56, P.gold)
    // lower jaw + mouth
    ell(c, -44, 30 + 7 * o, 38, 16, P.goldLight)
    if (o > 0.12) {
      ell(c, -56, 27 + 3 * o, 28, 3 + 8 * o, '#7A2E3A')
      if (o > 0.45) ell(c, -54, 33 + 6 * o, 13, 4 + 3 * o, P.pink)
    }
    ell(c, -48, 10, 46, 27, P.goldLight)
    c.beginPath()
    c.moveTo(-86, 22)
    c.quadraticCurveTo(-60, 28 + o * 3, -24, 24)
    c.lineWidth = 3
    c.strokeStyle = P.goldDark
    c.stroke()
    ell(c, -90, 2, 13, 10, P.nose)
    ell(c, -94, -1, 4, 3, 'rgba(255,255,255,0.7)')
    // eye + brow
    if (s.happy) {
      c.beginPath()
      c.arc(-18, -8, 9, PI * 1.1, PI * 1.9)
      c.lineWidth = 4
      c.strokeStyle = P.nose
      c.stroke()
    } else {
      const bl = blink(t)
      ell(c, -18 - 4 * s.look, -10, 9, 11 * bl, P.nose)
      ell(c, -21 - 4 * s.look, -14, 3.2, 3.6 * bl, '#FFFFFF')
    }
    line(c, [[-34, -28], [-12, -32]], 4, P.goldDark)
    ell(c, -30, 22, 10, 6, 'rgba(255,122,156,0.45)')
    // forehead tuft
    ell(c, -2, -42, 20, 9, P.goldLight, -0.2)
    // floppy ear
    c.save()
    c.translate(26, -14)
    c.rotate(0.32 + 0.07 * Math.sin(t * (t < T.pauseFrom ? 9 : 3)))
    ell(c, 0, 30, 24, 46, P.goldDark)
    c.restore()
    c.restore()
  }

  // ---------- toy (blue and cream) ----------
  function drawToy(c, x, y, rot) {
    c.save()
    c.translate(x, y)
    c.rotate(rot)
    rr(c, -46, -12, 92, 24, 12, P.cream)
    c.fillStyle = P.blue
    c.fillRect(-30, -12, 11, 24)
    c.fillRect(19, -12, 11, 24)
    ;[[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sy]) => {
      ell(c, sx * 54, sy * 13, 15, 15, P.blue)
      ell(c, sx * 54 - 4, sy * 13 - 4, 5, 4, 'rgba(255,255,255,0.45)')
    })
    c.restore()
  }

  // ---------- handler ----------
  const SHOULDER = [308, 292]
  const MOUTH = [-82, 26] // where the toy sits, in the puppy's head space (held crosswise)
  function nearArm(c) {
    const pts = [SHOULDER, [352, 388], [486, 412]]
    line(c, pts, 50, P.tealDark)
    line(c, pts, 40, P.teal)
    // ribbed cuff (the part the puppy mouths)
    line(c, [[458, 408], [486, 412]], 44, P.tealDark)
    line(c, [[460, 408.3], [486, 412]], 34, P.tealLight)
    line(c, [[470, 410], [470.5, 410]], 36, P.tealDark)
    line(c, [[480, 411.4], [480.5, 411.4]], 36, P.tealDark)
  }
  function relaxedHand(c, x, y, rot) {
    c.save()
    c.translate(x, y)
    c.rotate(rot)
    ell(c, 0, 0, 17, 14, P.skin)
    // soft, slightly curled fingers
    ;[-9, -3, 3, 9].forEach((dy, i) => line(c, [[8, dy], [24 - Math.abs(dy) * 0.3, dy + 2 + i * 0.4]], 8, P.skin))
    line(c, [[-4, -12], [8, -17], [16, -15]], 8, P.skinShade)
    c.restore()
  }
  function farArm(c, t, k, wrist) {
    // k: 0 rest .. 1 offered. Behind the torso at rest.
    const E = [lerp(330, 350, k), lerp(385, 372, k)]
    const pts = [SHOULDER, E, wrist]
    line(c, pts, 46, P.tealDark)
    line(c, pts, 36, '#2AA9B1')
    line(c, [[wrist[0] - 10, wrist[1] + 2], wrist], 40, P.tealDark)
  }
  function handlerBody(c) {
    // torso
    c.beginPath()
    c.moveTo(205, 464)
    c.bezierCurveTo(198, 380, 214, 300, 252, 268)
    c.bezierCurveTo(284, 248, 322, 262, 330, 300)
    c.bezierCurveTo(340, 360, 334, 420, 322, 464)
    c.closePath()
    c.fillStyle = P.teal
    c.fill()
    // sweater details: stripes, ribbing, collar
    c.save()
    c.clip()
    c.fillStyle = P.tealLight
    c.fillRect(190, 336, 160, 12)
    c.fillRect(190, 366, 160, 12)
    c.fillStyle = P.tealDark
    c.fillRect(190, 440, 160, 30)
    c.restore()
    ell(c, 292, 268, 30, 12, P.cream)
    ell(c, 292, 270, 20, 6, P.tealDark)
  }
  function legs(c) {
    line(c, [[250, 452], [430, 458]], 54, P.pants)
    line(c, [[250, 440], [430, 446]], 12, P.pantsDark)
    ell(c, 456, 466, 30, 17, P.shoe)
    rr(c, 430, 475, 56, 8, 4, P.blue)
  }
  function handlerHead(c, t, happy) {
    const by = 1.2 * Math.sin(t * 1.6)
    c.save()
    c.translate(0, by)
    rr(c, 276, 240, 30, 34, 10, P.skinShade) // neck
    // hair (back), face, ear, fringe
    ell(c, 278, 202, 58, 60, P.hair)
    ell(c, 300, 208, 48, 52, P.skin)
    ell(c, 272, 212, 14, 18, P.skinShade)
    c.beginPath()
    c.moveTo(246, 192)
    c.bezierCurveTo(250, 142, 320, 140, 348, 176)
    c.bezierCurveTo(334, 170, 312, 166, 296, 178)
    c.bezierCurveTo(280, 190, 262, 196, 246, 192)
    c.closePath()
    c.fillStyle = P.hair
    c.fill()
    // nose, cheek, brow
    ell(c, 346, 216, 8, 7, P.skinShade)
    ell(c, 316, 228, 10, 6, 'rgba(255,122,156,0.45)')
    line(c, [[310, 190], [332, 188]], 4, P.hair)
    if (happy) {
      c.beginPath()
      c.arc(322, 206, 9, PI * 1.1, PI * 1.9)
      c.lineWidth = 4
      c.strokeStyle = P.nose
      c.stroke()
      c.beginPath()
      c.moveTo(310, 232)
      c.quadraticCurveTo(326, 258, 342, 230)
      c.closePath()
      c.fillStyle = '#8A2F3A'
      c.fill()
      ell(c, 326, 241, 8, 4, P.pink)
    } else {
      const bl = blink(t + 1.3)
      ell(c, 324, 206, 6, 8 * bl, P.nose)
      ell(c, 322, 203, 2.2, 2.4 * bl, '#FFFFFF')
      c.beginPath()
      c.moveTo(310, 232)
      c.quadraticCurveTo(326, 244, 340, 230)
      c.lineWidth = 4
      c.strokeStyle = '#8A3F3A'
      c.lineCap = 'round'
      c.stroke()
    }
    c.restore()
  }

  // ---------- effects ----------
  function stillRing(c, t) {
    const a = seg(t, 1.4, 2.2) * (1 - seg(t, 7.2, 8.0))
    if (a <= 0) return
    c.save()
    c.globalAlpha = 0.85 * a
    c.setLineDash([8, 10])
    c.lineWidth = 4
    c.strokeStyle = P.blue
    c.beginPath()
    c.ellipse(510, 450, 42 + 2 * Math.sin(t * 2), 30 + 2 * Math.sin(t * 2), 0, 0, PI * 2)
    c.stroke()
    c.restore()
  }
  function praise(c, t) {
    const t0 = 15.2
    if (t < t0 - 0.2) return
    const fade = 1 - seg(t, 22.8, 23.4)
    for (let i = 0; i < 6; i++) {
      const age = (t - t0 - i * 0.62 + 40) % 3.6
      if (t < t0 + i * 0.62) continue
      const y = 150 - age * 22
      const x = 372 + Math.sin(age * 2.2 + i) * 22 + (i % 3) * 22
      heart(c, x, y, 0.9 + 0.5 * seg(age, 0, 1), i % 2 ? P.pink : '#FF9DB6', clamp(1 - age / 3.6) * fade)
    }
    for (let i = 0; i < 4; i++) {
      const ph = (t * 1.1 + i * 0.37) % 1
      sparkle(c, 640 + i * 70 - 60, 232 + ((i * 53) % 70), 0.6 + 0.6 * Math.sin(ph * PI), P.cta, Math.sin(ph * PI) * fade)
    }
    // calm voice: soft arcs from the handler's mouth while the line is spoken
    const sp = t > 15.0 && t < 18.5 ? 1 : 0
    if (sp) {
      for (let i = 0; i < 3; i++) {
        const ph = (t * 1.6 + i * 0.33) % 1
        c.save()
        c.globalAlpha = (1 - ph) * 0.7
        c.lineWidth = 4
        c.strokeStyle = P.blue
        c.lineCap = 'round'
        c.beginPath()
        c.arc(352, 240, 16 + ph * 30, -0.7, 0.7)
        c.stroke()
        c.restore()
      }
    }
  }

  // ---------- overlay: brand, steps, draft chip, captions ----------
  function ui(c, t) {
    // brand pill
    rr(c, 36, 24, 150, 54, 27, P.blue)
    ell(c, 66, 51, 8, 7, '#FFFFFF')
    ;[[-9, -8], [-3, -12], [3, -12], [9, -8]].forEach(([dx, dy]) => ell(c, 66 + dx * 1.1, 51 + dy, 3, 4, '#FFFFFF'))
    c.font = `800 30px ${FONT}`
    c.fillStyle = '#FFFFFF'
    c.textAlign = 'left'
    c.textBaseline = 'middle'
    c.direction = 'ltr'
    c.fillText('Woffiz', 90, 53)
    // draft chip
    rr(c, 204, 34, 300, 34, 17, 'rgba(20,48,79,0.82)')
    c.font = `700 19px ${FONT}`
    c.fillStyle = '#FFFFFF'
    c.textAlign = 'center'
    c.direction = 'rtl'
    c.fillText('טיוטה · תצוגה מקדימה מקומית', 354, 52)
    // step dots (1 on the right, RTL reading order)
    const active = t < 8.5 ? 1 : t < 14.8 ? 2 : 3
    for (let n = 1; n <= 3; n++) {
      const x = 1240 - (n - 1) * 62 - 26
      const on = n === active
      ell(c, x, 52, 24, 24, on ? P.cta : 'rgba(255,255,255,0.85)')
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
    // caption
    const cap = cfg.captions.find((k) => t * 1000 >= k.startMs && t * 1000 < k.endMs)
    if (!cap) return
    const a = clamp((t * 1000 - cap.startMs) / 250) * clamp((cap.endMs - t * 1000) / 250)
    c.save()
    c.globalAlpha = a
    c.translate(0, (1 - a) * 12)
    rr(c, 40, 586, 1200, 118, 30, 'rgba(20,48,79,0.94)')
    ell(c, 1176, 645, 34, 34, P.cta)
    c.font = `800 40px ${FONT}`
    c.fillStyle = P.ctaInk
    c.direction = 'ltr'
    c.textAlign = 'center'
    c.fillText(String(cap.step), 1176, 648)
    c.font = `800 42px ${FONT}`
    c.fillStyle = '#FFFFFF'
    c.direction = 'rtl'
    c.textAlign = 'center'
    cap.lines.forEach((ln, i) => c.fillText(ln, 580, 619 + i * 54))
    c.restore()
  }

  function draw(c, t) {
    c.save()
    c.clearRect(0, 0, W, H)
    drawRoom(c, t)
    const s = puppyState(t)

    // far arm (brings the toy): behind the torso at rest
    const kOffer = seg(t, T.armFrom, T.armTo)
    const kBack = seg(t, T.retract[0], T.retract[1])
    const reach = kOffer * (1 - kBack)
    const wristRest = [392, 418]
    const wristOffer = [426 + 14 * seg(t, T.leanFrom, T.bite), 336]
    const wrist = [lerp(wristRest[0], wristOffer[0], reach), lerp(wristRest[1], wristOffer[1], reach)]
    if (reach > 0.001) farArm(c, t, reach, wrist)

    handlerBody(c)
    legs(c)
    nearArm(c)
    handlerHead(c, t, s.happy)

    const toyInMouth = t >= T.transfer[1]
    drawPuppy(c, t, s, toyInMouth)
    // near hand: relaxed and perfectly still the whole time
    relaxedHand(c, 506, 436, 1.2)
    stillRing(c, t)

    // toy: carried by the far hand, then held in the puppy's mouth
    const hp = s.head
    const mouthLocal = MOUTH
    const cr = Math.cos(hp.r)
    const sr = Math.sin(hp.r)
    const mouth = [hp.x + mouthLocal[0] * cr - mouthLocal[1] * sr, hp.y + mouthLocal[0] * sr + mouthLocal[1] * cr]
    const held = [wrist[0] + 52, wrist[1] - 2]
    if (t >= T.armFrom + 0.2 && !toyInMouth) {
      const m = seg(t, T.transfer[0], T.transfer[1])
      drawToy(c, lerp(held[0], mouth[0], m), lerp(held[1], mouth[1], m), lerp(0, hp.r + PI / 2, m))
    }
    if (reach > 0.001) relaxedHand(c, wrist[0] + 2, wrist[1], t < T.transfer[1] ? 0.1 : 0.5)

    praise(c, t)
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
      cfg = Object.assign({ captions: [], durationMs: 24000 }, config)
    },
    draw,
  }
})(typeof window !== 'undefined' ? window : globalThis)
