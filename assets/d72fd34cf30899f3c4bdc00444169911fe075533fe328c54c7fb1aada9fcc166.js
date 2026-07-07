/**
 * TabletopMan — the first quadruped creature. Not a cast member (yet): an
 * ambient inhabitant that wanders its section endlessly.
 *
 * Motion is a pure function of synced world time (seeded waypoint schedule),
 * so every client computes the identical path with zero network traffic —
 * and the static museum build gets a live creature for free.
 *
 * props: { cx, cz (home center), radius, speed }
 */

if (world.isClient) {
  const cx = props.cx ?? 0
  const cz = props.cz ?? 0
  const radius = props.radius ?? 8
  const speed = props.speed ?? 0.7

  // seeded waypoint sequence — waypoint(k) is stable for all clients
  function waypoint(k) {
    let s = (k * 2654435761) % 2147483647
    const r = () => {
      s = (s * 48271) % 2147483647
      return s / 2147483647
    }
    r()
    const a = r() * Math.PI * 2
    const d = 2 + r() * (radius - 2)
    return [cx + Math.cos(a) * d, cz + Math.sin(a) * d]
  }

  // the engine names glTF skinned-mesh nodes generically — find any node
  // with a play() by traversal, and keep trying until the model has mounted
  let mesh = null
  let animStarted = false
  function findPlayable(node) {
    if (!node) return null
    if (typeof node.play === 'function') return node
    for (const c of node.children ?? []) {
      const hit = findPlayable(c)
      if (hit) return hit
    }
    return null
  }
  function ensureAnim() {
    if (animStarted) return
    try {
      mesh = findPlayable(app)
      if (mesh) {
        const name = (mesh.animNames && mesh.animNames[0]) || 'Walking'
        mesh.play({ name, loop: true })
        animStarted = true
        console.log('[tabletopman] playing', name)
      }
    } catch (err) {
      console.error('[tabletopman] anim failed:', err && err.message)
      animStarted = true // don't spam
    }
  }

  // incremental traversal: catch up to synced time once on join, then
  // advance by delta — O(1) per frame forever after
  let k = 0
  let from = waypoint(0)
  let to = waypoint(1)
  let seg = Math.hypot(to[0] - from[0], to[1] - from[1])
  let into = 0
  let caughtUp = false

  function advance(dist) {
    into += dist
    let guard = 0
    while (into >= seg && guard++ < 100000) {
      into -= seg
      k++
      from = to
      to = waypoint(k + 1)
      seg = Math.hypot(to[0] - from[0], to[1] - from[1])
    }
  }

  app.on('update', function (delta) {
    ensureAnim()
    if (!caughtUp) {
      caughtUp = true
      let t = 0
      try {
        if (world.getTime) t = world.getTime()
      } catch (err) {}
      advance(Math.max(0, t) * speed)
    } else {
      advance((delta || 0.016) * speed)
    }
    const f = into / seg
    const x = from[0] + (to[0] - from[0]) * f
    const z = from[1] + (to[1] - from[1]) * f
    app.position.set(x, 0, z)
    app.rotation.y = Math.atan2(to[0] - from[0], to[1] - from[1])
  })
}
