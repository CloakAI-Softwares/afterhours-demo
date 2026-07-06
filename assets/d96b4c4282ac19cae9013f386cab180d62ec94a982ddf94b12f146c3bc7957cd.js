/**
 * Afterhours scene app — the $scene script for "Sublevel 0".
 * Runs in the Hyperfy app sandbox as (world, app, fetch, props, setTimeout).
 *
 * The room's look is baked into its textures (unlit) — nothing here may
 * change the environment's colors. This script only adds:
 *  - fog (distance haze, docs/02 §3) + a dim warm HDR so avatars aren't flat
 *  - the fluorescent hum (props.hum), looped
 *  - fixture flicker per spec: 15-25% dips, 80-150ms, one fixture at a time,
 *    every 20-40s per fixture — via each panel's dimmer twin behind it —
 *    with a quiet spatial tick at the fixture (props.click)
 */

if (world.isClient) {
  try {
    const sky = app.create('sky', {
      hdr: (props && props.hdr) || null,
      sunDirection: new Vector3(-0.65, -0.6, -0.45).normalize(),
      sunIntensity: 0.95,
      sunColor: '#ffedca',
      // patch 005: hemisphere fill so avatar shade-sides never go black
      ambientIntensity: 0.55,
      ambientColor: '#fff1d4',
      ambientGroundColor: '#7a6f52',
      fogNear: 14,
      fogFar: 46,
      fogColor: '#8d8259',
    })
    app.add(sky)
  } catch (err) {
    console.error('[scene] sky failed:', err && err.message)
  }

  if (props && props.hum) {
    try {
      const hum = app.create('audio', {
        src: props.hum,
        loop: true,
        group: 'music',
        spatial: false,
        volume: 0.6,
      })
      app.add(hum)
      hum.play()
    } catch (err) {
      console.error('[scene] hum failed:', err && err.message)
    }
  }

  let tick = null
  if (props && props.click) {
    try {
      tick = app.create('audio', {
        src: props.click,
        group: 'sfx',
        spatial: true,
        volume: 0.35,
        refDistance: 1.5,
        maxDistance: 9,
      })
      app.add(tick)
    } catch (err) {
      tick = null
    }
  }

  let seed = 977
  function rand() {
    seed = (seed * 48271) % 2147483647
    return seed / 2147483647
  }

  // independent schedule per fixture: a dip every 20-40s, 80-150ms long,
  // occasionally a quick double-dip
  for (let i = 0; i < 16; i++) {
    const panel = app.get('LightFlicker' + i)
    if (!panel) continue
    const dip = andThen => {
      panel.visible = false // dimmer twin behind shows: ~25% darker
      if (tick && rand() < 0.8) {
        try {
          tick.position.set(panel.position.x, panel.position.y - 0.3, panel.position.z)
          tick.play(true)
        } catch (err) {
          // tick is decorative — never let it break the loop
        }
      }
      setTimeout(function () {
        panel.visible = true
        if (andThen) andThen()
      }, 80 + rand() * 70)
    }
    const schedule = () => {
      setTimeout(function () {
        dip(function () {
          if (rand() < 0.25) {
            setTimeout(function () {
              dip(null)
            }, 90 + rand() * 140)
          }
        })
        schedule()
      }, 20000 + rand() * 20000)
    }
    schedule()
  }
}
