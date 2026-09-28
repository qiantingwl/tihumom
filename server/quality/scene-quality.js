// Geometry is measured in the rendered SVG coordinate system. Names/comments are
// never treated as evidence of a bird, wheel, pedal or animation.
export function captureScene() {
  // DOM indices change when scripts insert decorations; identity must follow
  // the same element through the sampled animation.
  const identities = (window.__pelicanGeometryIds ||= { nodes: new WeakMap(), next: 0 })
  const identity = (node) => {
    if (!identities.nodes.has(node)) identities.nodes.set(node, identities.next++)
    return identities.nodes.get(node)
  }
  const canvases = [...document.querySelectorAll('svg')]
    .filter((node) => {
      const box = node.getBoundingClientRect(),
        style = getComputedStyle(node)
      return (
        box.width > 0 &&
        box.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0
      )
    })
    .sort((a, b) => {
      const first = a.getBoundingClientRect(),
        second = b.getBoundingClientRect()
      return second.width * second.height - first.width * first.height
    })
  // Keep independent SVGs separate. A large decorative canvas must not hide
  // the actual artwork, nor may pieces from different SVGs form a bicycle.
  return { canvases: canvases.map(captureCanvas) }

  function captureCanvas(svg) {
    const bounds = svg.getBoundingClientRect()
    const viewport = {
      x: Math.max(0, bounds.x),
      y: Math.max(0, bounds.y),
      width: Math.min(innerWidth, bounds.right) - Math.max(0, bounds.x),
      height: Math.min(innerHeight, bounds.bottom) - Math.max(0, bounds.y),
    }
    const shapes = []
    const selector = 'circle,ellipse,path,polygon,polyline,line,rect'
    const entries = [...svg.querySelectorAll(selector)].filter((node) => node.ownerSVGElement === svg).map((node) => ({
      node,
      id: identity(node),
      display: node,
    }))
    for (const use of svg.querySelectorAll('use')) {
      if (use.ownerSVGElement !== svg) continue
      if (use.closest('defs,clipPath,mask,pattern,symbol')) continue
      const href =
        use.getAttribute('href') || use.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
      if (!href?.startsWith('#')) continue
      const reference = document.getElementById(href.slice(1))
      if (!reference) continue
      const parentMatrix = reference.parentElement?.getCTM?.()
      const useMatrix = use.getScreenCTM()
      if (!parentMatrix || !useMatrix) continue
      const translate = svg.createSVGMatrix().translate(use.x.baseVal.value, use.y.baseVal.value)
      const children = reference.matches(selector)
        ? [reference]
        : [...reference.querySelectorAll(selector)]
      for (const node of children) {
        const childMatrix = node.getCTM()
        if (childMatrix)
          entries.push({
            node,
            id: `use-${identity(use)}-${identity(node)}`,
            display: use,
            reference,
            matrix: useMatrix
              .multiply(translate)
              .multiply(parentMatrix.inverse())
              .multiply(childMatrix),
          })
      }
    }
    const paintAlpha = (paint) => {
      if (!paint || paint === 'none' || paint === 'transparent') return 0
      // Computed CSS colors may use legacy rgba() or modern slash alpha syntax.
      const alpha = paint.match(/\/\s*([\d.]+%?)\s*\)$/)?.[1] ||
        paint.match(/^(?:rgba|hsla)\([^)]*,\s*([\d.]+%?)\s*\)$/)?.[1]
      return alpha ? parseFloat(alpha) / (alpha.endsWith('%') ? 100 : 1) : 1
    }
    for (const { id, node, display, reference, matrix: instanceMatrix } of entries) {
      if (!instanceMatrix && node.closest('defs,clipPath,mask,pattern,symbol')) continue
      const style = getComputedStyle(node)
      const fillAlpha = paintAlpha(style.fill) * Number(style.fillOpacity)
      const strokeAlpha = paintAlpha(style.stroke) * Number(style.strokeOpacity)
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        (fillAlpha <= 0.05 && (strokeAlpha <= 0.05 || parseFloat(style.strokeWidth) <= 0))
      )
        continue
      let opacity = 1
      for (
        let ancestor = display;
        ancestor && ancestor !== svg.parentElement;
        ancestor = ancestor.parentElement
      )
      {
        const ancestorStyle = getComputedStyle(ancestor)
        opacity *= Number(ancestorStyle.opacity)
        if (ancestorStyle.display === 'none') opacity = 0
      }
      if (getComputedStyle(display).visibility === 'hidden') opacity = 0
      // <use> paints a referenced subtree. Its own opacity and the referenced
      // group's opacity both apply; definitions are not themselves visible.
      if (reference) {
        for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
          const ancestorStyle = getComputedStyle(ancestor)
          opacity *= Number(ancestorStyle.opacity)
          if (ancestorStyle.display === 'none') opacity = 0
          if (ancestor === reference) break
        }
      }
      if (opacity < 0.05 || Math.max(fillAlpha, strokeAlpha) * opacity <= 0.05) continue
      try {
        const matrix = instanceMatrix || node.getScreenCTM(),
          length = node.getTotalLength()
        if (!matrix || !Number.isFinite(length) || length <= 0) continue
        const points = Array.from({ length: 49 }, (_, index) => {
          const p = node.getPointAtLength((length * index) / 48)
          return {
            x: matrix.a * p.x + matrix.c * p.y + matrix.e,
            y: matrix.b * p.x + matrix.d * p.y + matrix.f,
          }
        })
        const x = Math.min(...points.map((p) => p.x)),
          y = Math.min(...points.map((p) => p.y))
        const width = Math.max(...points.map((p) => p.x)) - x,
          height = Math.max(...points.map((p) => p.y)) - y
        const cx = x + width / 2,
          cy = y + height / 2
        const radii = points
          .slice(0, -1)
          .map((p) => Math.hypot((p.x - cx) / (width / 2 || 1), (p.y - cy) / (height / 2 || 1)))
        const round =
          width > 0 &&
          height > 0 &&
          Math.min(width, height) / Math.max(width, height) > 0.68 &&
          radii.every((r) => Math.abs(r - 1) < 0.16)
        // Several diameters in one path form a spoke cluster. Track its centre
        // separately from the rim: a stationary rim can hide a wildly orbiting hub.
        const centerCrossings = radii.filter(
          (value, index) => value < 0.23 && (index === 0 || radii[index - 1] >= 0.23),
        ).length
        const radial =
          !round &&
          Math.min(width, height) / Math.max(width, height) > 0.65 &&
          centerCrossings >= 3 &&
          radii.filter((value) => value > 0.7).length >= 8
        shapes.push({
          id,
          x,
          y,
          width,
          height,
          cx,
          cy,
          round,
          radial,
          filled: fillAlpha > 0.05,
          stroke:
            strokeAlpha <= 0.05
              ? 0
              : (parseFloat(style.strokeWidth) || 0) * Math.hypot(matrix.a, matrix.b),
          points,
        })
      } catch {
        /* Unsupported geometry cannot serve as positive evidence. */
      }
    }
    return { id: identity(svg), viewport, shapes }
  }
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const radius = (shape) => (shape.width + shape.height) / 4
const center = (shape) => ({ x: shape.cx, y: shape.cy })
// Filled outlines close back at their starting point; use vertical extrema for
// them, and actual endpoints for open strokes.
const ends = (shape) =>
  distance(shape.points[0], shape.points.at(-1)) < Math.max(1, shape.height * 0.05)
    ? [
        shape.points.reduce((a, b) => (a.y < b.y ? a : b)),
        shape.points.reduce((a, b) => (a.y > b.y ? a : b)),
      ]
    : [shape.points[0], shape.points.at(-1)].sort((a, b) => a.y - b.y)
function inside(point, shape) {
  if (!shape.filled) return false
  let contains = false
  for (let i = 0, j = shape.points.length - 1; i < shape.points.length; j = i++) {
    const a = shape.points[i],
      b = shape.points[j]
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      contains = !contains
  }
  return contains
}
function touches(a, b, margin) {
  const tolerance = margin + (a.stroke + b.stroke) / 2
  if (
    a.x > b.x + b.width + tolerance ||
    b.x > a.x + a.width + tolerance ||
    a.y > b.y + b.height + tolerance ||
    b.y > a.y + a.height + tolerance
  )
    return false
  return (
    a.points.some((p) => inside(p, b) || b.points.some((q) => distance(p, q) <= tolerance)) ||
    b.points.some((p) => inside(p, a))
  )
}
function wheels(scene) {
  const minRadius = Math.min(scene.viewport.width, scene.viewport.height) * 0.035
  const circles = scene.shapes.filter((shape) => shape.round && radius(shape) >= minRadius)
  const distinct = circles
    .sort((a, b) => radius(b) - radius(a))
    .filter(
      (shape, i, list) =>
        !list
          .slice(0, i)
          .some((other) => distance(center(shape), center(other)) < radius(shape) * 0.35),
    )
  const pairs = []
  for (let i = 0; i < distinct.length; i++)
    for (let j = i + 1; j < distinct.length; j++) {
      const a = distinct[i],
        b = distinct[j],
        r = (radius(a) + radius(b)) / 2
      if (Math.min(radius(a), radius(b)) / Math.max(radius(a), radius(b)) < 0.65) continue
      const dx = Math.abs(a.cx - b.cx),
        dy = Math.abs(a.cy - b.cy)
      if (dx < r * 2.05 || dx > r * 8 || dy > r * 0.8) continue
      pairs.push({ left: a.cx < b.cx ? a : b, right: a.cx < b.cx ? b : a, r, span: dx })
    }
  return pairs
}
function inspectPair(scene, pair) {
  const { left, right, r, span } = pair
  const baseline = (left.cy + right.cy) / 2
  const midpoint = (left.cx + right.cx) / 2
  const relevant = scene.shapes.filter(
    (shape) =>
      shape.id !== left.id &&
      shape.id !== right.id &&
      shape.width < span * 1.5 &&
      shape.height < r * 6 &&
      shape.cx > left.cx - r &&
      shape.cx < right.cx + r &&
      shape.cy > baseline - r * 4.5 &&
      shape.cy < baseline + r * 0.6,
  )
  const frame = relevant.filter(
    (shape) =>
      !shape.round && shape.y + shape.height >= baseline - r * 1.2 && shape.y < baseline + r * 0.25,
  )
  const rear = frame.filter((shape) => touches(shape, left, r * 0.08))
  const connected = new Set(rear.map((shape) => shape.id))
  for (let turn = 0, changed = true; changed && turn < frame.length; turn++) {
    changed = false
    for (const shape of frame)
      if (
        !connected.has(shape.id) &&
        frame.some((other) => connected.has(other.id) && touches(shape, other, r * 0.08))
      ) {
        connected.add(shape.id)
        changed = true
      }
  }
  const connectedFrame = frame.filter((shape) => connected.has(shape.id))
  const frameJoined = connectedFrame.some((shape) => touches(shape, right, r * 0.08))
  const bodies = relevant.filter(
    (shape) =>
      shape.filled &&
      shape.width >= r * 0.85 &&
      shape.height >= r * 0.55 &&
      shape.width < span * 1.15 &&
      shape.height < r * 3 &&
      shape.cy < baseline - r * 0.65 &&
      shape.cy > baseline - r * 3.4 &&
      shape.cx >= left.cx - r * 0.25 &&
      shape.cx <= right.cx + r * 0.25,
  )
  const cranks = relevant.filter(
    (shape) =>
      shape.round &&
      radius(shape) < r * 0.45 &&
      radius(shape) > r * 0.04 &&
      shape.cx > left.cx + span * 0.25 &&
      shape.cx < right.cx - span * 0.2 &&
      Math.abs(shape.cy - baseline) < r * 0.5,
  )
  const isCrankArm = (shape) =>
    shape.width < r * 1.3 &&
    shape.height < r * 1.3 &&
    cranks.some((crank) =>
      ends(shape).some((p) => distance(p, center(crank)) < r * 0.08 + shape.stroke / 2),
    )
  let riderAttached = false
  const riderIds = new Set()
  const limbIds = new Set()
  const feet = []
  for (const body of bodies) {
    // Require a physical route from the body to the bicycle/pedal area.
    // Detached head/body decorations and clouds cannot pass on mere proximity.
    const segments = relevant.filter(
      (shape) =>
        shape.id !== body.id &&
        !shape.round &&
        !shape.radial &&
        shape.height >= r * 0.25 &&
        shape.width < span * 0.65 &&
        Math.abs(shape.cx - midpoint) < span * 0.4,
    )
    const legs = segments.filter((shape) => {
      const endpoints = ends(shape)
      // A frame tube touching the bird halfway along is not a leg. Its upper
      // endpoint must actually attach to the body, and its lower end reach down.
      return (
        endpoints[1].y - endpoints[0].y > r * 0.35 &&
        endpoints[0].y < baseline - r * 0.6 &&
        (inside(endpoints[0], body) ||
          body.points.some((p) => distance(p, endpoints[0]) <= r * 0.12 + body.stroke / 2))
      )
    })
    for (const upper of legs) {
      const ankle = ends(upper)[1]
      // A two-piece thigh/shin must meet at the joint, not cross halfway.
      const lower = segments.filter(
        (s) =>
          s.id !== upper.id &&
          !isCrankArm(s) &&
          ends(s)[0].y < baseline - r * 0.65 &&
          ends(s)[1].y > ankle.y + r * 0.25 &&
          distance(ends(s)[0], ankle) <= r * 0.06 + (upper.stroke + s.stroke) / 2,
      )
      // A complete hip-to-ankle path remains a candidate even when another
      // shape touches its end. In particular, never absorb the crank as a shin.
      for (const leg of [upper, ...lower]) {
        if (
          ends(leg)[1].y < baseline - r * 0.65 ||
          !connectedFrame.some((part) => touches(leg, part, r * 0.08))
        )
          continue
        riderAttached = true
        riderIds.add(body.id)
        limbIds.add(upper.id)
        limbIds.add(leg.id)
        feet.push({ id: `${upper.id}:${leg.id}`, point: ends(leg)[1], stroke: leg.stroke })
      }
    }
  }
  const visible = [left, right].every(
    (shape) =>
      shape.x >= scene.viewport.x - r * 0.15 &&
      shape.x + shape.width <= scene.viewport.x + scene.viewport.width + r * 0.15 &&
      shape.y >= scene.viewport.y - r * 0.15 &&
      shape.y + shape.height <= scene.viewport.y + scene.viewport.height + r * 0.15,
  )
  const nearby = relevant.filter(
    (shape) =>
      !shape.round &&
      !shape.radial &&
      !limbIds.has(shape.id) &&
      shape.width < r * 1.3 &&
      shape.height < r * 1.3 &&
      cranks.some((crank) => distance(center(shape), center(crank)) < r * 0.8),
  )
  const arms = nearby.filter((shape) =>
    cranks.some((crank) =>
      shape.points.some((p) => distance(p, center(crank)) < r * 0.08 + shape.stroke / 2),
    ),
  )
  // The crank centre and middle of its arms are NOT a pedal contact surface.
  const pedalTips = arms.flatMap((arm) => {
    const crank = cranks.reduce((a, b) =>
      distance(center(a), center(arm)) < distance(center(b), center(arm)) ? a : b,
    )
    const maximum = Math.max(...arm.points.map((p) => distance(p, center(crank))))
    return maximum > r * 0.22
      ? arm.points
          .map((point, index) => ({ id: `${arm.id}:${index}`, point, stroke: arm.stroke }))
          .filter((tip) => distance(tip.point, center(crank)) >= maximum * 0.82)
      : []
  })
  return {
    frameJoined,
    riderAttached,
    riderIds: [...riderIds],
    limbIds: [...limbIds],
    feet,
    hasPedals: pedalTips.length > 0,
    pedalTips,
    visible,
    ...pair,
  }
}

export function inspectScenes(scenes) {
  const canvasIds = new Set(scenes.flatMap((scene) => scene.canvases?.map((canvas) => canvas.id) || []))
  if (!canvasIds.size) return inspectCanvasScenes(scenes.map((scene) =>
    scene.shapes ? scene : { shapes: [], viewport: { width: 0, height: 0 } }))
  const candidates = [...canvasIds].map((id) => inspectCanvasScenes(scenes.map((scene) =>
    scene.canvases?.find((canvas) => canvas.id === id) || { shapes: [], viewport: { width: 0, height: 0 } })))
  return candidates.sort((a, b) =>
    Number(b.every((check) => check.passed)) - Number(a.every((check) => check.passed)) ||
    b.filter((check) => check.passed).length - a.filter((check) => check.passed).length)[0]
}

function inspectCanvasScenes(scenes) {
  // Identify the same wheel pair across time, rather than accepting/rejecting
  // whichever pair happens to look plausible in the first animation frame.
  const tracks = new Map()
  for (const scene of scenes)
    for (const pair of wheels(scene)) {
      const key = JSON.stringify([pair.left.id, pair.right.id].sort())
      if (tracks.has(key)) continue
      const states = scenes.map((sample) => {
        const left = sample.shapes.find((shape) => shape.id === pair.left.id)
        const right = sample.shapes.find((shape) => shape.id === pair.right.id)
        return left && right
          ? inspectPair(sample, {
              left,
              right,
              r: (radius(left) + radius(right)) / 2,
              span: Math.abs(right.cx - left.cx),
            })
          : null
      })
      const coherentFrames = states.filter(
        (state) => state?.frameJoined && state?.riderAttached,
      ).length
      tracks.set(key, { states, coherentFrames, r: pair.r })
    }
  const chosen = [...tracks.values()].sort(
    (a, b) => b.coherentFrames - a.coherentFrames || b.r - a.r,
  )[0]
  const checks = []
  const check = (name, passed, yes, no) =>
    checks.push({ name, passed, status: passed ? 'passed' : 'failed', detail: passed ? yes : no })
  check(
    '双轮结构',
    !!chosen,
    '实际渲染中识别到分离且比例协调的轮对',
    '未识别到有效轮对：可能缺轮、重叠或旋转变换使车轮脱位',
  )
  if (!chosen) return checks
  const states = chosen.states
  // One sampled overlap/occlusion is not enough to declare a structural defect.
  const supported = (predicate) => states.filter(predicate).length >= Math.max(1, states.length - 1)
  const count = (predicate) => `${states.filter(predicate).length}/${states.length}`
  check(
    '车架连接',
    supported((state) => state?.frameJoined),
    `车架连接证据 ${count((state) => state?.frameJoined)} 帧；不因单帧遮挡判降智`,
    '多帧中车架与车轮未连成完整自行车，或运动时反复脱离',
  )
  check(
    '骑乘结构',
    supported((state) => state?.riderAttached),
    `骑乘连接证据 ${count((state) => state?.riderAttached)} 帧；主体与车体/踏板区域相连`,
    '多帧中主体与自行车分离，或缺少连接车体/踏板的腿部结构',
  )
  const spanRatio = states.filter(Boolean).map((state) => state.span / state.r)
  check(
    '轮对稳定',
    supported(Boolean) &&
      Math.max(...spanRatio) - Math.min(...spanRatio) < 0.65 &&
      states
        .filter(Boolean)
        .every((state) => Math.abs(state.left.cy - state.right.cy) < state.r * 0.8),
    '前后轮间距与相对高度在动画中保持稳定',
    '前后轮相对位置大幅变化，出现轮子绕错误中心飞转',
  )
  const spokeIds = new Set(
    scenes.flatMap((scene, index) => {
      const state = states[index]
      return state
        ? scene.shapes
            .filter(
              (shape) =>
                shape.radial &&
                shape.stroke > 0 &&
                radius(shape) > state.r * 0.5 &&
                radius(shape) < state.r * 1.25 &&
                Math.min(distance(center(shape), center(state.left)), distance(center(shape), center(state.right))) < state.r * 0.25,
            )
            .map((shape) => shape.id)
        : []
    }),
  )
  const detachedSpokes = [...spokeIds].some(
    (id) =>
      scenes.filter((scene, index) => {
        const state = states[index],
          shape = scene.shapes.find((shape) => shape.id === id)
        return (
          state &&
          shape &&
          Math.min(
            distance(center(shape), center(state.left)),
            distance(center(shape), center(state.right)),
          ) >
            state.r * 0.4
        )
      }).length >= 2,
  )
  check(
    '辐条归位',
    !detachedSpokes,
    '未发现车轮辐条在多个采样帧中脱离轮心',
    '辐条在多个采样帧中脱离轮心，轮胎还在原位但内部结构绕错误中心飞转',
  )
  // Pixel changes in a cloud or a moving leg do not establish wheel rotation.
  // Follow visible spoke clusters relative to their own hub, removing bicycle
  // translation/scale/tilt. A plain untextured rim is not evidence of a stopped wheel.
  const wheelMotion = ['left', 'right'].map((side) => {
    const candidates = new Set(scenes.flatMap((scene, index) => {
      const state = states[index]
      if (!state) return []
      return scene.shapes.filter((shape) => !shape.round && shape.stroke > 0 &&
        !state.limbIds.includes(shape.id) &&
        Math.hypot(shape.width, shape.height) > state.r * 0.9 &&
        distance(center(shape), center(state[side])) < state.r * 0.25 &&
        shape.points.every((point) => distance(point, center(state[side])) < state.r * 1.05)).map((shape) => shape.id)
    }))
    let observable = false, moving = false
    for (const id of candidates) {
      const samples = scenes.flatMap((scene, index) => {
        const state = states[index], shape = scene.shapes.find((s) => s.id === id)
        return state && shape && distance(center(shape), center(state[side])) < state.r * 0.3
          ? [{ shape, state }] : []
      })
      if (samples.length < Math.max(3, Math.ceil(scenes.length * 0.6))) continue
      observable = true
      const relative = (point, state) => {
        const hub = state[side], dx = state.right.cx - state.left.cx, dy = state.right.cy - state.left.cy
        const span = Math.hypot(dx, dy), x = point.x - hub.cx, y = point.y - hub.cy
        return { x: (x * dx + y * dy) / span / state.r, y: (y * dx - x * dy) / span / state.r }
      }
      const first = samples[0]
      moving ||= samples.slice(1).some((sample) => sample.shape.points.some((point, index) =>
        distance(relative(point, sample.state), relative(first.shape.points[index], first.state)) > 0.12))
    }
    return { observable, moving }
  })
  check('车轮转动', wheelMotion.every((wheel) => !wheel.observable || wheel.moving),
    wheelMotion.some((wheel) => wheel.observable)
      ? '可跟踪的轮内辐条相对轮心转动；不把背景运动当作车轮转动'
      : '轮内缺少可持续跟踪的纹理；不据此单独判定车轮停转',
    '多帧可见的轮内辐条相对轮心静止，车轮未形成实际转动')
  if (states.some((state) => state?.hasPedals)) {
    // Do not merge alternating accidental contacts of different legs into one
    // continuous pedal stroke. The same attached limb must stay on the pedals.
    const limbTracks = new Set(states.flatMap((state) => state?.feet.map((foot) => foot.id) || []))
    const pedalTracks = new Set(
      states.flatMap((state) => state?.pedalTips.map((tip) => tip.id) || []),
    )
    // A leg must follow one pedal through the cycle. Alternating between the
    // two opposite pedals is incidental proximity, not continuous contact.
    const bestContact = Math.max(
      0,
      ...[...limbTracks].flatMap((id) =>
        [...pedalTracks].map(
          (pedalId) =>
            states.filter((state, index) => {
              if (!state) return false
              const [upperId, lowerId] = id.split(':')
              const upper = scenes[index].shapes.find((s) => String(s.id) === upperId),
                lower = scenes[index].shapes.find((s) => String(s.id) === lowerId)
              if (!upper || !lower) return false
              let foot = ends(lower)[1]
              if (upper !== lower) {
                const joints = ends(upper)
                  .flatMap((a) => ends(lower).map((b, i) => ({ distance: distance(a, b), i })))
                  .sort((a, b) => a.distance - b.distance)
                if (joints[0].distance > state.r * 0.06 + (upper.stroke + lower.stroke) / 2)
                  return false
                foot = ends(lower)[1 - joints[0].i]
              }
              return state.pedalTips.some(
                (tip) =>
                  tip.id === pedalId &&
                  distance(tip.point, foot) < state.r * 0.15 + (tip.stroke + lower.stroke) / 2,
              )
            }).length,
        ),
      ),
    )
    check(
      '踏板衔接',
      bestContact >= Math.max(1, states.length - 1),
      `同一腿部末端与踏板持续衔接证据 ${bestContact}/${states.length} 帧`,
      '同一腿部在多帧中离开踏板，腿与脚踏各自动画，未形成连续踩踏',
    )
  }
  // Canvas framing/translation is presentation, not evidence of broken structure.
  // Keep evaluating actual wheel, frame and rider relationships across all frames.
  let articulated = false
  const firstIndex = states.findIndex((state) => state?.riderAttached)
  const first = states[firstIndex]
  if (first?.riderAttached) {
    for (const id of first.limbIds) {
      const initial = scenes[firstIndex].shapes.find((shape) => shape.id === id)
      for (let i = 0; i < scenes.length; i++) {
        const state = states[i],
          shape = scenes[i].shapes.find((item) => item.id === id)
        if (!shape || !state) continue
        const relative = (point, pair) => {
          const dx = pair.right.cx - pair.left.cx,
            dy = pair.right.cy - pair.left.cy
          const lengthSquared = dx * dx + dy * dy
          const x = point.x - pair.left.cx,
            y = point.y - pair.left.cy
          return { x: (x * dx + y * dy) / lengthSquared, y: (y * dx - x * dy) / lengthSquared }
        }
        if (
          shape.points.some(
            (point, index) =>
              distance(relative(point, state), relative(initial.points[index], first)) > 0.025,
          )
        )
          articulated = true
      }
    }
  }
  check(
    '踩踏动作',
    articulated,
    '连接主体与车体的肢体相对车轮有实际动作变化',
    '未检测到连接主体与车体的踩踏动作；背景移动或单独转轮不作为踩踏证据',
  )
  return checks
}
