/**
 * Afterhours section app — runs on every labyrinth section instance.
 * Runs in the Hyperfy app sandbox as (world, app, fetch, props, setTimeout).
 *
 * The section's look is baked into its textures (unlit); this script only
 * adds behavior:
 *  - props.sky (center/$scene instance only): fog + sun + hemisphere fill
 *  - props.hum: this section's own spatial ambience at the section center
 *    ('hum' = fluorescent buzz; the rest point gets a soft non-buzzing tone;
 *    the blackout zone gets nothing at all — silence is its feature)
 *  - fixture flicker on this section's own LightFlicker/LightDim nodes,
 *    with a quiet spatial tick (props.click)
 */

if (world.isClient) {
  if (props && props.sky) {
    try {
      const sky = app.create('sky', {
        hdr: props.hdr || null,
        sunDirection: new Vector3(-0.65, -0.6, -0.45).normalize(),
        sunIntensity: 0.95,
        sunColor: '#ffedca',
        ambientIntensity: 0.55,
        ambientColor: '#fff1d4',
        ambientGroundColor: '#7a6f52',
        fogNear: 14,
        fogFar: 46,
        fogColor: '#8d8259',
      })
      app.add(sky)
    } catch (err) {
      console.error('[section] sky failed:', err && err.message)
    }
  }

  if (props && props.hum) {
    try {
      const hum = app.create('audio', {
        src: props.hum,
        loop: true,
        group: 'music',
        spatial: true,
        volume: props.humVolume || 0.55,
        refDistance: 7,
        maxDistance: 26,
      })
      hum.position.set(0, 1.6, 0)
      app.add(hum)
      hum.play()
    } catch (err) {
      console.error('[section] hum failed:', err && err.message)
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

  for (let i = 0; i < 16; i++) {
    const panel = app.get('LightFlicker' + i)
    if (!panel) continue
    const dip = andThen => {
      panel.visible = false
      if (tick && rand() < 0.8) {
        try {
          tick.position.set(panel.position.x, panel.position.y - 0.3, panel.position.z)
          tick.play(true)
        } catch (err) {
          // decorative
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
