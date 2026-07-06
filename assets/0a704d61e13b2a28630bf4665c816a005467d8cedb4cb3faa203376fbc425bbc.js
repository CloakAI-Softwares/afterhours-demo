/**
 * Afterhours labyrinth app — the non-Euclidean connectivity mechanic.
 * Runs in the Hyperfy app sandbox as (world, app, fetch, props, setTimeout).
 *
 * Every gate between sections is a 1.5m vestibule whose geometry is
 * identical everywhere — while you're inside one, you can't see either room.
 * When the local player crosses a gate's midplane, there's a real chance
 * they are silently relocated to the same relative spot in a DIFFERENT
 * gate on the same axis: heading, speed, and lateral offset are preserved,
 * so nothing visibly happens — but the space they walk into is somewhere
 * else, and walking a straight line can plausibly never bring them back.
 * (The wiki calls the real thing "impossible to map" — this is why ours is.)
 *
 * Occasionally the destination is a capped dead-end gate: the doorway you
 * watched someone disappear through is, when you follow, a wall.
 *
 * props.map: JSON string {gates:[{x,z,axis,open}], p, deadEndP, cooldownMs}
 */

if (world.isClient) {
  let config = null
  try {
    config = JSON.parse(props.map)
  } catch (err) {
    console.error('[labyrinth] bad map config:', err && err.message)
  }
  if (config && config.gates && config.gates.length) {
    const HALF_W = 1.3 // gate opening half-width + a little slack
    const P = config.p ?? 0.35
    const DEAD_P = config.deadEndP ?? 0.1
    const COOLDOWN = config.cooldownMs ?? 4000
    const gates = config.gates
    const openGates = gates.filter(function (g) {
      return g.open
    })

    let lastSide = {} // gate index -> which side of the midplane we were on
    let cooldownUntil = 0
    let clock = 0
    let seed = 1337
    const rand = function () {
      seed = (seed * 48271) % 2147483647
      return seed / 2147483647
    }

    app.on('update', function (delta) {
      clock += delta || 0.016
      const player = world.getPlayer()
      if (!player || !player.position) return
      const px = player.position.x
      const py = player.position.y
      const pz = player.position.z
      const now = clock * 1000
      for (let i = 0; i < gates.length; i++) {
        const g = gates[i]
        // signed distance from the gate midplane + lateral offset within it
        const depth = g.axis === 'x' ? px - g.x : pz - g.z
        const lateral = g.axis === 'x' ? pz - g.z : px - g.x
        if (Math.abs(depth) > 2.5 || Math.abs(lateral) > HALF_W) {
          delete lastSide[i]
          continue
        }
        const side = depth >= 0 ? 1 : -1
        const prev = lastSide[i]
        lastSide[i] = side
        if (prev === undefined || prev === side) continue
        // midplane crossed inside the vestibule — the LOS-break moment
        if (now < cooldownUntil) continue
        if (rand() > P) continue
        // pick a destination gate on the same axis
        const useDeadEnd = rand() < DEAD_P
        const pool = (useDeadEnd ? gates : openGates).filter(function (t) {
          return t.axis === g.axis && (t.x !== g.x || t.z !== g.z) && (useDeadEnd ? !t.open : true)
        })
        if (!pool.length) continue
        const t = pool[Math.floor(rand() * pool.length)]
        // land at the same relative spot: heading and speed carry over.
        // Dead-end destinations land safely INSIDE the vestibule — momentum
        // walks the traveler into the cap; the way forward is just… gone.
        const landDepth = useDeadEnd ? 0.45 * (t.in || 1) : depth
        const nx = g.axis === 'x' ? t.x + landDepth : t.x + lateral
        const nz = g.axis === 'x' ? t.z + lateral : t.z + landDepth
        try {
          player.teleport(new Vector3(nx, py, nz))
          cooldownUntil = now + COOLDOWN
        } catch (err) {
          console.error('[labyrinth] relocate failed:', err && err.message)
        }
        break
      }
    })
  }
}
