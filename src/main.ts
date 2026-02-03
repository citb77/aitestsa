import './style.css'
import * as THREE from 'three'

type Vec2 = { x: number; y: number }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

class Input {
  private keys = new Set<string>()
  private pressed = new Set<string>()

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase()
      if (!this.keys.has(k)) this.pressed.add(k)
      this.keys.add(k)
    })
    target.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase()
      this.keys.delete(k)
    })
  }

  isDown(k: string) {
    return this.keys.has(k.toLowerCase())
  }

  consumePressed(k: string) {
    k = k.toLowerCase()
    const had = this.pressed.has(k)
    this.pressed.delete(k)
    return had
  }

  clearPressed() {
    this.pressed.clear()
  }
}

class Sfx {
  ctx: AudioContext | null = null

  private ensure() {
    if (!this.ctx) this.ctx = new AudioContext()
    // iOS-style: still might be suspended until user gesture
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
  }

  shoot() {
    this.ensure()
    if (!this.ctx) return
    const t = this.ctx.currentTime

    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = 'square'
    o.frequency.setValueAtTime(880, t)
    o.frequency.exponentialRampToValueAtTime(420, t + 0.08)

    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)

    o.connect(g)
    g.connect(this.ctx.destination)
    o.start(t)
    o.stop(t + 0.1)
  }

  explosion() {
    this.ensure()
    if (!this.ctx) return
    const t = this.ctx.currentTime

    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(140, t)
    o.frequency.exponentialRampToValueAtTime(55, t + 0.25)

    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)

    o.connect(g)
    g.connect(this.ctx.destination)
    o.start(t)
    o.stop(t + 0.3)
  }

  pickup() {
    this.ensure()
    if (!this.ctx) return
    const t = this.ctx.currentTime

    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = 'triangle'
    o.frequency.setValueAtTime(520, t)
    o.frequency.exponentialRampToValueAtTime(1040, t + 0.12)

    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)

    o.connect(g)
    g.connect(this.ctx.destination)
    o.start(t)
    o.stop(t + 0.18)
  }
}

type EntityKind = 'player' | 'enemy' | 'bullet' | 'enemyBullet' | 'pickup' | 'particle'

type Entity = {
  kind: EntityKind
  mesh: THREE.Object3D
  pos: THREE.Vector3
  vel: THREE.Vector3
  radius: number
  hp?: number
  ttl?: number
  damage?: number
  value?: number
  pickupType?: 'health' | 'power'
}

type Wave = {
  at: number // distance trigger
  spawn: (g: Game) => void
}

class Game {
  readonly root: HTMLElement
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly input: Input
  readonly sfx = new Sfx()

  private clock = new THREE.Clock()
  private hudEl: HTMLDivElement
  private bannerEl: HTMLDivElement

  private texLoader = new THREE.TextureLoader()
  private texShip: THREE.Texture | null = null
  private texEnemy: THREE.Texture | null = null
  private texEnemy2: THREE.Texture | null = null

  private entities: Entity[] = []
  private player!: Entity

  private paused = false
  private started = false
  private gameOver = false

  private score = 0
  private distance = 0
  private scrollSpeed = 9

  private fireCooldown = 0
  private fireRate = 10 // shots/sec baseline
  private power = 0

  private checkpointDist = 0
  private checkpointIndex = 0
  private nextCheckpointAt = 40

  private waves: Wave[] = []
  private waveIndex = 0

  // parallax layers
  private parallax: { obj: THREE.Object3D; factor: number }[] = []

  constructor(root: HTMLElement) {
    this.root = root

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setSize(root.clientWidth, root.clientHeight)
    this.renderer.setClearColor(0x05060a)
    root.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0x05060a, 18, 70)

    this.camera = new THREE.PerspectiveCamera(60, root.clientWidth / root.clientHeight, 0.1, 200)
    this.camera.position.set(-4, 0, 18)
    this.camera.lookAt(8, 0, 0)

    this.input = new Input(window)

    this.hudEl = document.createElement('div')
    this.hudEl.className = 'hud'
    this.root.appendChild(this.hudEl)

    this.bannerEl = document.createElement('div')
    this.bannerEl.className = 'banner'
    this.root.appendChild(this.bannerEl)

    window.addEventListener('resize', () => this.onResize())

    this.buildScene()
    this.reset(true)

    this.animate()
  }

  private onResize() {
    const w = this.root.clientWidth
    const h = this.root.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private buildScene() {
    const amb = new THREE.AmbientLight(0xffffff, 0.55)
    this.scene.add(amb)

    const dir = new THREE.DirectionalLight(0xaad6ff, 0.85)
    dir.position.set(5, 8, 10)
    this.scene.add(dir)

    // Dungeon-ish corridor: floor + ceiling + "pipes"
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1d2b3a, roughness: 0.9, metalness: 0.1 })
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x14202c, roughness: 0.95, metalness: 0.1 })

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(220, 18, 1, 1), floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(60, -7.5, 0)
    this.scene.add(floor)

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(220, 18, 1, 1), ceilMat)
    ceil.rotation.x = Math.PI / 2
    ceil.position.set(60, 7.5, 0)
    this.scene.add(ceil)

    // side walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x101822, roughness: 0.95, metalness: 0.1 })
    const wallGeom = new THREE.PlaneGeometry(220, 15)

    const wallTop = new THREE.Mesh(wallGeom, wallMat)
    wallTop.position.set(60, 0, -9)
    wallTop.rotation.y = 0
    this.scene.add(wallTop)

    const wallBot = new THREE.Mesh(wallGeom, wallMat)
    wallBot.position.set(60, 0, 9)
    wallBot.rotation.y = Math.PI
    this.scene.add(wallBot)

    // parallax layers: distant grid + particles
    const grid1 = new THREE.GridHelper(220, 60, 0x1a6aa3, 0x0b2338)
    grid1.rotation.z = Math.PI / 2
    grid1.position.set(60, 0, -22)
    this.scene.add(grid1)
    this.parallax.push({ obj: grid1, factor: 0.15 })

    const grid2 = new THREE.GridHelper(220, 40, 0x2e97cc, 0x0b1a28)
    grid2.rotation.z = Math.PI / 2
    grid2.position.set(60, 0, 24)
    this.scene.add(grid2)
    this.parallax.push({ obj: grid2, factor: 0.1 })

    // a few "pipes" / obstacles for depth
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6 + Math.random() * 0.4, 0.6 + Math.random() * 0.4, 6 + Math.random() * 6, 10),
        new THREE.MeshStandardMaterial({ color: 0x0e2a3e, roughness: 0.8, metalness: 0.4 })
      )
      m.rotation.z = Math.PI / 2
      m.position.set(10 + i * 16 + Math.random() * 5, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10)
      m.castShadow = false
      m.receiveShadow = true
      this.scene.add(m)
      this.parallax.push({ obj: m, factor: 0.6 })
    }

    // load optional textures (billboard look)
    const loadTex = (url: string) =>
      new Promise<THREE.Texture>((resolve, reject) => {
        this.texLoader.load(
          url,
          (t: THREE.Texture) => {
            t.colorSpace = THREE.SRGBColorSpace
            t.wrapS = THREE.ClampToEdgeWrapping
            t.wrapT = THREE.ClampToEdgeWrapping
            resolve(t)
          },
          undefined,
          reject
        )
      })

    Promise.allSettled([
      loadTex('/assets/staratlas/airbike.jpg'),
      loadTex('/assets/staratlas/greenader.jpg'),
      loadTex('/assets/staratlas/bombarella.jpg'),
    ]).then((results) => {
      const [a, g, b] = results
      if (a.status === 'fulfilled') this.texShip = a.value
      if (g.status === 'fulfilled') this.texEnemy = g.value
      if (b.status === 'fulfilled') this.texEnemy2 = b.value
      this.restylePlayerEnemyMeshes()
    })
  }

  private restylePlayerEnemyMeshes() {
    if (this.player && this.texShip) {
      const plane = this.player.mesh.getObjectByName('sprite') as THREE.Mesh | null
      if (plane) (plane.material as THREE.MeshBasicMaterial).map = this.texShip
    }
  }

  private makeBillboardSprite(w: number, h: number, color: number, tex?: THREE.Texture | null) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      map: tex ?? null,
      transparent: true,
      opacity: tex ? 1 : 0.95,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    mesh.name = 'sprite'
    return mesh
  }

  private addEntity(e: Entity) {
    this.entities.push(e)
    this.scene.add(e.mesh)
    return e
  }

  // (reserved for future pooling)

  private reset(firstBoot = false) {
    // clear entities
    for (const e of this.entities) this.scene.remove(e.mesh)
    this.entities = []

    this.score = 0
    this.distance = 0
    this.scrollSpeed = 9

    this.fireCooldown = 0
    this.fireRate = 10
    this.power = 0

    this.checkpointDist = 0
    this.checkpointIndex = 0
    this.nextCheckpointAt = 40

    this.gameOver = false
    this.paused = false

    this.makePlayer()
    this.buildWaves()
    this.waveIndex = 0

    if (firstBoot) {
      this.started = false
      this.bannerEl.innerHTML = `
        <h1>Star Atlas SideScroller — Prototype</h1>
        <p><strong>Move</strong>: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>Arrow Keys</kbd></p>
        <p><strong>Shoot</strong>: <kbd>Space</kbd> &nbsp; <strong>Pause</strong>: <kbd>P</kbd> &nbsp; <strong>Restart</strong>: <kbd>R</kbd></p>
        <p class="muted">Tip: click the game once to enable audio on some browsers.</p>
        <p><strong>Press</strong> <kbd>Space</kbd> to start.</p>
      `
    } else {
      this.bannerEl.innerHTML = ''
    }
  }

  private respawnAtCheckpoint() {
    // remove non-player entities
    for (const e of this.entities) {
      if (e.kind !== 'player') this.scene.remove(e.mesh)
    }
    this.entities = this.entities.filter((e) => e.kind === 'player')

    this.distance = this.checkpointDist
    this.scrollSpeed = 9 + this.checkpointIndex * 0.6

    // rewind waves
    this.waveIndex = 0
    while (this.waveIndex < this.waves.length && this.waves[this.waveIndex].at <= this.distance) this.waveIndex++

    this.player.hp = 5
    this.player.pos.set(0, 0, 0)
    this.player.vel.set(0, 0, 0)
    this.player.mesh.position.copy(this.player.pos)

    this.gameOver = false
    this.paused = false
    this.bannerEl.innerHTML = `
      <h1>Checkpoint ${this.checkpointIndex} reached</h1>
      <p>Respawned at distance <strong>${this.checkpointDist.toFixed(0)}</strong>. Press <kbd>Space</kbd> to continue.</p>
    `
    this.started = false
  }

  private makePlayer() {
    const group = new THREE.Group()

    // body
    const body = new THREE.Mesh(
      new THREE.ConeGeometry(0.65, 1.8, 10),
      new THREE.MeshStandardMaterial({ color: 0x6fe7ff, roughness: 0.4, metalness: 0.35 })
    )
    body.rotation.z = -Math.PI / 2
    group.add(body)

    // sprite overlay
    const sprite = this.makeBillboardSprite(3.0, 1.6, 0xffffff, this.texShip)
    sprite.position.set(0, 0, 0.4)
    group.add(sprite)

    // engine glow
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), new THREE.MeshBasicMaterial({ color: 0x68d9ff }))
    glow.position.set(-0.85, 0, 0)
    group.add(glow)

    group.position.set(0, 0, 0)

    this.player = this.addEntity({
      kind: 'player',
      mesh: group,
      pos: new THREE.Vector3(0, 0, 0),
      vel: new THREE.Vector3(0, 0, 0),
      radius: 0.8,
      hp: 5,
    })
  }

  private buildWaves() {
    const mkEnemy = (x: number, y: number, z: number, hp = 2, variant = 0) => {
      const g = new THREE.Group()

      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.75, 0),
        new THREE.MeshStandardMaterial({ color: variant ? 0xff5a92 : 0xffc14a, roughness: 0.5, metalness: 0.2 })
      )
      core.castShadow = false
      g.add(core)

      const sprite = this.makeBillboardSprite(2.4, 1.6, 0xffffff, variant ? this.texEnemy2 : this.texEnemy)
      sprite.position.set(0, 0, 0.8)
      g.add(sprite)

      g.position.set(x, y, z)

      const e = this.addEntity({
        kind: 'enemy',
        mesh: g,
        pos: new THREE.Vector3(x, y, z),
        vel: new THREE.Vector3(-1.2 - Math.random() * 0.7, (Math.random() - 0.5) * 1.2, 0),
        radius: 0.9,
        hp,
        value: 120,
      })

      return e
    }

    const mkTurret = (x: number, y: number, z: number) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 1.1, 1.1),
        new THREE.MeshStandardMaterial({ color: 0x7cf9b1, roughness: 0.65, metalness: 0.15 })
      )
      m.position.set(x, y, z)
      const e = this.addEntity({
        kind: 'enemy',
        mesh: m,
        pos: new THREE.Vector3(x, y, z),
        vel: new THREE.Vector3(-0.5, 0, 0),
        radius: 0.9,
        hp: 4,
        value: 260,
      })
      return e
    }

    const waves: Wave[] = [
      {
        at: 8,
        spawn: (_g) => {
          mkEnemy(22, 0, 0, 2, 0)
          mkEnemy(26, 2.5, 1.0, 2, 1)
        },
      },
      {
        at: 18,
        spawn: (_g) => {
          mkEnemy(22, -2.5, -1.0, 2, 0)
          mkEnemy(24, 0, 0.0, 2, 0)
          mkEnemy(26, 2.5, 1.0, 2, 0)
        },
      },
      {
        at: 30,
        spawn: (_g) => {
          mkTurret(26, 3.5, -1)
          mkTurret(29, -3.5, 1)
        },
      },
      {
        at: 46,
        spawn: (_g) => {
          for (let i = 0; i < 5; i++) mkEnemy(24 + i * 2.2, (i - 2) * 1.5, (i % 2 ? 2 : -2) * 0.7, 2, i % 2)
        },
      },
      {
        at: 60,
        spawn: (g) => {
          mkEnemy(24, 0, 0, 3, 1)
          mkEnemy(28, 2.2, -1.8, 2, 0)
          mkEnemy(28, -2.2, 1.8, 2, 0)
          g.spawnPickup(34, 0, 0, Math.random() < 0.55 ? 'power' : 'health')
        },
      },
      {
        at: 82,
        spawn: (_g) => {
          mkTurret(25, 0, 0)
          mkEnemy(30, 4.2, 0, 2, 0)
          mkEnemy(30, -4.2, 0, 2, 0)
        },
      },
      {
        at: 105,
        spawn: (_g) => {
          for (let i = 0; i < 7; i++) mkEnemy(24 + i * 2.0, (Math.random() - 0.5) * 8.0, (Math.random() - 0.5) * 4.0, 2, i % 2)
        },
      },
      {
        at: 128,
        spawn: (g) => {
          mkTurret(24, 3.0, -1.8)
          mkTurret(24, -3.0, 1.8)
          mkEnemy(29, 0, 0, 4, 1)
          g.spawnPickup(34, 0, 0, 'power')
        },
      },
      {
        at: 150,
        spawn: (_g) => {
          // mini-boss-ish chunk
          const boss = mkTurret(28, 0, 0)
          boss.hp = 10
          boss.radius = 1.25
          ;(boss.mesh as THREE.Mesh).scale.set(1.6, 1.6, 1.6)
        },
      },
    ]

    this.waves = waves
  }

  spawnPickup(x: number, y: number, z: number, type: 'health' | 'power') {
    const color = type === 'health' ? 0x58ff7f : 0x67a0ff
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.2, emissive: color, emissiveIntensity: 0.25 })
    )
    m.position.set(x, y, z)

    this.addEntity({
      kind: 'pickup',
      mesh: m,
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(-0.4, 0, 0),
      radius: 0.7,
      ttl: 20,
      pickupType: type,
    })
  }

  private spawnBullet(from: THREE.Vector3, dir: Vec2, isEnemy: boolean) {
    const color = isEnemy ? 0xff3b3b : 0x8bf7ff
    const geo = new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8)
    const mat = new THREE.MeshBasicMaterial({ color })
    const m = new THREE.Mesh(geo, mat)
    m.rotation.z = Math.PI / 2

    const speed = isEnemy ? 13 : 20
    const v = new THREE.Vector3(dir.x * speed, dir.y * speed, 0)
    m.position.copy(from)

    this.addEntity({
      kind: isEnemy ? 'enemyBullet' : 'bullet',
      mesh: m,
      pos: from.clone(),
      vel: v,
      radius: 0.28,
      ttl: 1.9,
      damage: isEnemy ? 1 : 1 + Math.floor(this.power / 2),
    })
  }

  private explode(at: THREE.Vector3, color = 0xff9c3b) {
    // lightweight particles: small spheres
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.07 + Math.random() * 0.07, 8, 8), new THREE.MeshBasicMaterial({ color }))
      const v = new THREE.Vector3((Math.random() - 0.2) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6)
      m.position.copy(at)
      this.addEntity({
        kind: 'particle',
        mesh: m,
        pos: at.clone(),
        vel: v,
        radius: 0,
        ttl: 0.45 + Math.random() * 0.45,
      })
    }

    // flash
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }))
    flash.position.copy(at)
    this.addEntity({ kind: 'particle', mesh: flash, pos: at.clone(), vel: new THREE.Vector3(), radius: 0, ttl: 0.12 })

    this.sfx.explosion()
  }

  private animate = () => {
    requestAnimationFrame(this.animate)

    const dt = Math.min(1 / 30, this.clock.getDelta())

    // Start gate
    if (!this.started) {
      if (this.input.consumePressed(' ') || this.input.consumePressed('space')) {
        this.started = true
        this.bannerEl.innerHTML = ''
        // user gesture: enable audio
        this.sfx.pickup()
      }
      this.render(0)
      return
    }

    // toggles
    if (this.input.consumePressed('p')) this.paused = !this.paused
    if (this.input.consumePressed('r')) this.reset(false)

    if (this.paused || this.gameOver) {
      this.render(0)
      return
    }

    this.update(dt)
    this.render(dt)
  }

  private update(dt: number) {
    // difficulty ramps
    this.scrollSpeed = lerp(this.scrollSpeed, 9 + Math.min(6, this.distance / 90), 0.03)

    this.distance += this.scrollSpeed * dt

    // checkpoints
    if (this.distance >= this.nextCheckpointAt) {
      this.checkpointDist = this.nextCheckpointAt
      this.checkpointIndex++
      this.nextCheckpointAt += 45
      this.score += 250
      this.bannerEl.innerHTML = `
        <h1>Checkpoint ${this.checkpointIndex}</h1>
        <p class="muted">Reached distance ${this.checkpointDist.toFixed(0)}. (+250 score)</p>
      `
      setTimeout(() => {
        if (this.bannerEl.innerHTML.includes('Checkpoint')) this.bannerEl.innerHTML = ''
      }, 1200)
    }

    // spawn waves
    while (this.waveIndex < this.waves.length && this.distance >= this.waves[this.waveIndex].at) {
      this.waves[this.waveIndex].spawn(this)
      this.waveIndex++
    }

    // player movement
    const p = this.player
    const move: Vec2 = { x: 0, y: 0 }
    if (this.input.isDown('w') || this.input.isDown('arrowup')) move.y += 1
    if (this.input.isDown('s') || this.input.isDown('arrowdown')) move.y -= 1
    if (this.input.isDown('a') || this.input.isDown('arrowleft')) move.x -= 1
    if (this.input.isDown('d') || this.input.isDown('arrowright')) move.x += 1

    const speed = 9
    p.vel.x = move.x * speed
    p.vel.y = move.y * speed

    p.pos.x = clamp(p.pos.x + p.vel.x * dt, -1.2, 5.5)
    p.pos.y = clamp(p.pos.y + p.vel.y * dt, -5.5, 5.5)

    // slight banking
    p.mesh.rotation.z = lerp(p.mesh.rotation.z, -move.y * 0.18, 0.1)
    p.mesh.rotation.y = lerp(p.mesh.rotation.y, move.x * 0.12, 0.1)

    // shoot
    this.fireCooldown = Math.max(0, this.fireCooldown - dt)
    const wantShoot = this.input.isDown(' ') || this.input.isDown('space')
    if (wantShoot && this.fireCooldown <= 0) {
      const spacing = 1 / (this.fireRate + this.power * 1.2)
      this.fireCooldown = spacing

      const base = p.pos.clone().add(new THREE.Vector3(1.15, 0, 0))
      this.spawnBullet(base, { x: 1, y: 0 }, false)
      if (this.power >= 2) this.spawnBullet(base.clone().add(new THREE.Vector3(0, 0.25, 0)), { x: 1, y: 0.08 }, false)
      if (this.power >= 2) this.spawnBullet(base.clone().add(new THREE.Vector3(0, -0.25, 0)), { x: 1, y: -0.08 }, false)

      this.sfx.shoot()
    }

    // update entities
    for (const e of this.entities) {
      if (e.kind === 'player') continue

      // global scroll
      e.pos.x -= this.scrollSpeed * dt

      e.pos.addScaledVector(e.vel, dt)

      // TTL
      if (typeof e.ttl === 'number') e.ttl -= dt

      // enemy AI shooting
      if (e.kind === 'enemy') {
        const t = performance.now() * 0.001
        e.mesh.rotation.y += dt * 0.8
        e.mesh.rotation.x = Math.sin(t * 1.3 + e.pos.x) * 0.2

        // occasional bullet
        if (Math.random() < dt * 0.7 && e.pos.x < 16 && e.pos.x > 2) {
          const toPlayer = p.pos.clone().sub(e.pos)
          toPlayer.z = 0
          toPlayer.normalize()
          this.spawnBullet(e.pos.clone().add(new THREE.Vector3(-0.7, 0, 0)), { x: toPlayer.x, y: toPlayer.y }, true)
        }

        // gentle oscillation
        e.vel.y = lerp(e.vel.y, Math.sin((this.distance + e.pos.x) * 0.1) * 1.2, 0.02)
      }

      // pickup spin
      if (e.kind === 'pickup') {
        e.mesh.rotation.x += dt * 1.8
        e.mesh.rotation.y += dt * 2.1
      }

      // particle fade
      if (e.kind === 'particle' && typeof e.ttl === 'number') {
        const mat = (e.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial
        if (mat && 'opacity' in mat) {
          mat.opacity = clamp((e.ttl ?? 0) * 3.0, 0, 1)
        }
      }

      e.mesh.position.copy(e.pos)
    }

    // collisions
    this.handleCollisions(dt)

    // cleanup
    this.entities = this.entities.filter((e) => {
      const dead = (typeof e.ttl === 'number' && e.ttl <= 0) || e.pos.x < -18 || e.pos.x > 60
      if (dead) this.scene.remove(e.mesh)
      return !dead
    })

    // update hud
    this.hudEl.innerHTML = `
      <div><strong>HP</strong>: ${p.hp ?? 0} &nbsp; <strong>Score</strong>: ${this.score}</div>
      <div><strong>Dist</strong>: ${this.distance.toFixed(0)} &nbsp; <strong>CP</strong>: ${this.checkpointIndex} (${this.checkpointDist.toFixed(0)})</div>
      <div><strong>Power</strong>: ${this.power} &nbsp; <strong>Waves</strong>: ${Math.min(this.waveIndex, this.waves.length)}/${this.waves.length}</div>
      <div style="opacity:0.75">P pause • R restart</div>
    `

    // victory
    if (this.waveIndex >= this.waves.length && this.distance > 170) {
      this.bannerEl.innerHTML = `
        <h1>Segment cleared</h1>
        <p>Score: <strong>${this.score}</strong></p>
        <p class="muted">Press <kbd>R</kbd> to replay.</p>
      `
      this.gameOver = true
    }
  }

  private handleCollisions(_dt: number) {
    const p = this.player

    const hits = (a: Entity, b: Entity) => {
      if (a.radius <= 0 || b.radius <= 0) return false
      const dx = a.pos.x - b.pos.x
      const dy = a.pos.y - b.pos.y
      const dz = a.pos.z - b.pos.z
      const rr = a.radius + b.radius
      return dx * dx + dy * dy + dz * dz <= rr * rr
    }

    // bullets vs enemies
    for (const b of this.entities) {
      if (b.kind !== 'bullet') continue
      for (const e of this.entities) {
        if (e.kind !== 'enemy') continue
        if (!hits(b, e)) continue

        b.ttl = 0
        e.hp = (e.hp ?? 1) - (b.damage ?? 1)
        if ((e.hp ?? 0) <= 0) {
          this.score += e.value ?? 100
          e.ttl = 0
          this.explode(e.pos, 0xffa34a)
          if (Math.random() < 0.18) this.spawnPickup(e.pos.x + 1.2, e.pos.y, e.pos.z, Math.random() < 0.5 ? 'health' : 'power')
        }
      }
    }

    // enemy bullets vs player
    for (const b of this.entities) {
      if (b.kind !== 'enemyBullet') continue
      if (!hits(b, p)) continue
      b.ttl = 0
      p.hp = (p.hp ?? 1) - (b.damage ?? 1)
      this.explode(p.pos.clone().add(new THREE.Vector3(0.2, 0, 0)), 0xff3b3b)
      if ((p.hp ?? 0) <= 0) this.onPlayerDeath()
    }

    // enemies ramming player
    for (const e of this.entities) {
      if (e.kind !== 'enemy') continue
      if (!hits(e, p)) continue
      e.ttl = 0
      p.hp = (p.hp ?? 1) - 2
      this.explode(e.pos, 0xff5a92)
      this.explode(p.pos, 0xff3b3b)
      if ((p.hp ?? 0) <= 0) this.onPlayerDeath()
    }

    // pickups
    for (const pu of this.entities) {
      if (pu.kind !== 'pickup') continue
      if (!hits(pu, p)) continue
      pu.ttl = 0
      if (pu.pickupType === 'health') {
        p.hp = clamp((p.hp ?? 0) + 2, 0, 9)
        this.score += 80
      } else {
        this.power = clamp(this.power + 1, 0, 6)
        this.score += 120
      }
      this.sfx.pickup()
    }
  }

  private onPlayerDeath() {
    this.gameOver = true
    this.bannerEl.innerHTML = `
      <h1>Ship down</h1>
      <p>Score: <strong>${this.score}</strong></p>
      <p>Press <kbd>Space</kbd> to respawn at checkpoint, or <kbd>R</kbd> to restart.</p>
    `
    this.started = false

    // next input handled in animate start gate
    const origConsume = this.input.consumePressed.bind(this.input)
    const resumeListener = () => {
      if (origConsume('r')) {
        this.reset(false)
        return
      }
      if (origConsume(' ') || origConsume('space')) {
        this.respawnAtCheckpoint()
        return
      }
      requestAnimationFrame(resumeListener)
    }
    requestAnimationFrame(resumeListener)
  }

  private render(_dt: number) {
    // parallax motion: based on distance
    for (const p of this.parallax) {
      p.obj.position.x = 60 - this.distance * p.factor
    }

    // camera follows player a bit
    this.camera.position.y = lerp(this.camera.position.y, this.player.pos.y * 0.08, 0.05)
    this.camera.lookAt(8, this.camera.position.y * 0.6, 0)

    this.player.mesh.position.copy(this.player.pos)

    this.renderer.render(this.scene, this.camera)
  }
}

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('Missing #app')

new Game(root)
