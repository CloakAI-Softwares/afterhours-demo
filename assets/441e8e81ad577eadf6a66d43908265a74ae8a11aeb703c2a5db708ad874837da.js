/**
 * Afterhours audio bridge — in-world app (runs in Hyperfy's app sandbox as
 * (world, app, fetch, props, setTimeout) on the server AND every client).
 *
 * Server side: polls the brain for queued performances and paces them out
 * line by line over app.send('line').
 * Client side: on each line, plays the mp3 spatially at the character's
 * position and triggers the TALK gesture on them.
 *
 * props.brainUrl — brain service base URL (default http://localhost:4801)
 */

if (world.isServer) {
  const brainUrl = (props && props.brainUrl) || 'http://localhost:4801'
  let busy = false

  function performLines(lines, i, done) {
    if (i >= lines.length) return done()
    const line = lines[i]
    app.send('line', line)
    const holdMs = Math.max(line.durationMs || 3000, 2000) + 700
    setTimeout(function () {
      performLines(lines, i + 1, done)
    }, holdMs)
  }

  function poll() {
    if (busy) return setTimeout(poll, 500)
    fetch(brainUrl + '/world/next')
      .then(function (res) {
        return res.json()
      })
      .then(function (data) {
        const perf = data && data.performance
        if (perf && perf.lines && perf.lines.length) {
          busy = true
          performLines(perf.lines, 0, function () {
            busy = false
          })
        }
      })
      .catch(function () {})
      .then(function () {
        setTimeout(poll, 700)
      })
  }

  poll()
}

if (world.isClient) {
  let current = null

  // Vendy's constant machine hum (props.machineHum + props.humFor) — a
  // spatial loop that follows the character. Distinct from the room's
  // fluorescent hum by construction: different asset, different source.
  if (props && props.machineHum && props.humFor) {
    try {
      const machineHum = app.create('audio', {
        src: props.machineHum,
        loop: true,
        group: 'sfx',
        spatial: true,
        volume: 0.5,
      })
      app.add(machineHum)
      machineHum.play()
      let cooldown = 0
      app.on('update', function (delta) {
        cooldown -= delta
        if (cooldown > 0) return
        cooldown = 0.25
        const target = findPlayer(props.humFor)
        if (target) {
          const pos = target.position
          machineHum.position.set(pos.x, pos.y + 1.5, pos.z)
        }
      })
    } catch (err) {
      console.error('[bridge] machine hum failed:', err && err.message)
    }
  }

  function findPlayer(name) {
    const players = world.getPlayers()
    if (!players) return null
    for (const p of players) {
      try {
        if (p && p.name === name) return p
      } catch (err) {
        // some proxies may throw on property access — skip them
      }
    }
    return null
  }

  app.on('line', function (line) {
    const target = findPlayer(line.characterName)
    // tell the spectate camera system (and anything else) who's speaking
    try {
      const pos = target ? target.position : null
      app.emit('ah:speaking', {
        name: line.characterName,
        position: pos ? [pos.x, pos.y, pos.z] : null,
        durationMs: line.durationMs || 3000,
      })
    } catch (err) {
      // decorative — never block the line
    }
    // spatial voice at the character's head
    if (line.audioUrl) {
      try {
        if (current) {
          current.stop()
          app.remove(current)
          current = null
        }
        const audio = app.create('audio', {
          src: line.audioUrl,
          group: 'sfx',
          spatial: true,
          volume: 1,
        })
        if (target) {
          const pos = target.position
          audio.position.set(pos.x, pos.y + 1.6, pos.z)
        }
        app.add(audio)
        audio.play()
        current = audio
      } catch (err) {
        console.error('[bridge] audio failed:', err && err.message)
      }
    }
    // talk gesture for the duration of the line
    if (target) {
      try {
        target.applyEffect({
          emote: 'asset://emote-talk.glb?l=1',
          duration: Math.max((line.durationMs || 3000) / 1000, 2),
        })
      } catch (err) {
        console.error('[bridge] emote failed:', err && err.message)
      }
    }
    // lipsync: schedule each mouth shape (engine patch 004 exposes setViseme)
    if (target && target.setViseme && line.visemes && line.visemes.length) {
      for (const frame of line.visemes) {
        setTimeout(
          (function (v) {
            return function () {
              try {
                target.setViseme(v)
              } catch (err) {
                // avatar may have despawned mid-line
              }
            }
          })(frame.viseme),
          frame.atMs
        )
      }
      // always close the mouth at the end, even if 'sil' frames got dropped
      setTimeout(function () {
        try {
          target.setViseme('sil')
        } catch (err) {}
      }, (line.durationMs || 3000) + 200)
    }
  })
}
