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

  isDown(k: string) { return this.keys.has(k.toLowerCase()) }
  consumePressed(k: string) {
    k = k.toLowerCase()
    const had = this.pressed.has(k)
    this.pressed.delete(k)
    return had
  }
  clearPressed() { this.pressed.clear() }
}

class Sfx {
  ctx: AudioContext | null = null
  private ensure() {
    if (!this.ctx) this.ctx = new AudioContext()
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
  }
  shoot() { this.ensure(); if (!this.ctx) return; const t = this.ctx.currentTime; const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); o.type = 'square'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.08); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + 0.1) }
  explosion() { this.ensure(); if (!this.ctx) return; const t = this.ctx.currentTime; const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.25); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + 0.3) }
  pickup() { this.ensure(); if (!this.ctx) return; const t = this.ctx.currentTime; const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(1040, t + 0.12); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + 0.18) }
  shield() { this.ensure(); if (!this.ctx) return; const t = this.ctx.currentTime; const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(440, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.15); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + 0.22) }
  bossHit() { this.ensure(); if (!this.ctx) return; const t = this.ctx.currentTime; const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(80, t + 0.12); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15); o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + 0.18) }
}

type EntityKind = 'player' | 'enemy' | 'enemyKamikaze' | 'enemyShooter' | 'asteroid' | 'boss' | 'bullet' | 'enemyBullet' | 'pickup' | 'particle'

type Entity = {
  kind: EntityKind
  mesh: THREE.Object3D
  pos: THREE.Vector3
  vel: THREE.Vector3
  radius: number
  hp?: number
  maxHp?: number
  ttl?: number
  damage?: number
  value?: number
  pickupType?: 'health' | 'power' | 'shield'
  shieldActive?: boolean
  enemyType?: 'kamikaze' | 'shooter'
  bossPhase?: number
}

type Wave = { at: number; spawn: (g: Game) => void }

class Game {
  readonly root: HTMLElement
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  readonly input: Input
  readonly sfx = new Sfx()

  private clock = new THREE.Clock()
  private hudEl: HTMLDivElement
  private bannerEl: HTMLDivElement
  private texLoader = new THREE.TextureLoader()
  private texShip: THREE.Texture | null = null
  private entities: Entity[] = []
  private player!: Entity
  private paused = false
  private started = false
  private gameOver = false
  private bossSpawned = false
  private score = 0
  private distance = 0
  private scrollSpeed = 9
  private fireCooldown = 0
  private fireRate = 10
  private power = 0
  private playerInvuln = 0
  private shieldTime = 0
  private checkpointDist = 0
  private checkpointIndex = 0
  private nextCheckpointAt = 40
  private nextAsteroidAt = 6
  private waves: Wave[] = []
  private waveIndex = 0
  private parallax: { obj: THREE.Object3D; factor: number }[] = []

  constructor(root: HTMLElement) {
    this.root = root
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setSize(root.clientWidth, root.clientHeight)
    this.renderer.setClearColor(0x05060a)
    root.appendChild(this.renderer.domElement)

    this.renderer.domElement.addEventListener('pointerdown', () => {
      if (this.started) return
      if (this.gameOver) this.respawnAtCheckpoint()
      else { this.started = true; this.bannerEl.innerHTML = ''; this.sfx.pickup() }
    })

    this.scene = new THREE.Scene()
    const aspect = root.clientWidth / root.clientHeight
    const viewHeight = 16
    const viewWidth = viewHeight * aspect
    this.camera = new THREE.OrthographicCamera(-viewWidth / 2, viewWidth / 2, viewHeight / 2, -viewHeight / 2, 0.1, 200)
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
    const w = this.root.clientWidth, h = this.root.clientHeight
    const aspect = w / h, viewHeight = 16, viewWidth = viewHeight * aspect
    this.camera.left = -viewWidth / 2; this.camera.right = viewWidth / 2; this.camera.top = viewHeight / 2; this.camera.bottom = -viewHeight / 2
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private buildScene() {
    const amb = new THREE.AmbientLight(0xffffff, 0.55)
    this.scene.add(amb)
    const dir = new THREE.DirectionalLight(0xaad6ff, 0.85)
    dir.position.set(5, 8, 10)
    this.scene.add(dir)

    const starCount = 1400
    const starPos = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3 + 0] = -40 + Math.random() * 260
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 46
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 90
    }

    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe6ff, size: 0.11, sizeAttenuation: false, transparent: true, opacity: 0.9 }))
    stars.position.set(60, 0, -40)
    this.scene.add(stars)
    this.parallax.push({ obj: stars, factor: 0.06 })

    const baseUrl = import.meta.env.BASE_URL
    this.texLoader.load(`${baseUrl}assets/staratlas/airbike.jpg`, (t: THREE.Texture) => {
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping
      this.texShip = t; this.restylePlayerMesh()
    })
  }

  private restylePlayerMesh() {
    if (this.player && this.texShip) {
      const plane = this.player.mesh.getObjectByName('sprite') as THREE.Mesh | null
      if (plane) (plane.material as THREE.MeshBasicMaterial).map = this.texShip
    }
  }

  private makeBillboardSprite(w: number, h: number, color: number, tex?: THREE.Texture | null) {
    const mat = new THREE.MeshBasicMaterial({ color, map: tex ?? null, transparent: true, opacity: tex ? 1 : 0.95, depthWrite: false })
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  }

  private addEntity(e: Entity) {
    this.entities.push(e)
    this.scene.add(e.mesh)
    return e
  }

  private reset(firstBoot = false) {
    for (const e of this.entities) this.scene.remove(e.mesh)
    this.entities = []
    this.score = 0; this.distance = 0; this.scrollSpeed = 9
    this.fireCooldown = 0; this.fireRate = 10; this.power = 0; this.playerInvuln = 0; this.shieldTime = 0
    this.checkpointDist = 0; this.checkpointIndex = 0; this.nextCheckpointAt = 40
    this.nextAsteroidAt = 6
    this.gameOver = false; this.paused = false; this.bossSpawned = false

    this.makePlayer()
    this.buildWaves()
    this.waveIndex = 0

    if (firstBoot) {
      this.started = false
      this.bannerEl.innerHTML = `
        <h1>Star Atlas SideScroller</h1>
        <p><strong>Move</strong>: W/A/S/D or Arrow Keys &nbsp; <strong>Shoot</strong>: Space</p>
        <p><strong>Pause</strong>: P &nbsp; <strong>Restart</strong>: R</p>
        <p class="muted">New: Enemy types (Kamikaze, Shooter) & Boss battle!</p>
        <p><strong>Press Space to start</strong></p>
      `
    } else {
      this.bannerEl.innerHTML = ''
    }
  }

  private respawnAtCheckpoint() {
    for (const e of this.entities) { if (e.kind !== 'player') this.scene.remove(e.mesh) }
    this.entities = this.entities.filter((e) => e.kind === 'player')
    this.distance = this.checkpointDist
    this.scrollSpeed = 9 + this.checkpointIndex * 0.6
    this.waveIndex = 0
    while (this.waveIndex < this.waves.length && this.waves[this.waveIndex].at <= this.distance) this.waveIndex++
    this.player.hp = 5; this.playerInvuln = 1.25; this.player.shieldActive = false; this.shieldTime = 0
    this.player.mesh.visible = true; this.player.pos.set(0, 0, 0); this.player.vel.set(0, 0, 0)
    this.player.mesh.position.copy(this.player.pos)
    this.gameOver = false; this.paused = false
    this.bannerEl.innerHTML = `<h1>Checkpoint ${this.checkpointIndex}</h1><p>Respawned at distance ${this.checkpointDist.toFixed(0)}. Press Space to continue.</p>`
    this.started = false
  }

  private makePlayer() {
    const group = new THREE.Group()
    const modelRoot = new THREE.Group()
    modelRoot.name = 'playerModel'
    group.add(modelRoot)

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b3a48, roughness: 0.7, metalness: 0.35 })
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.25, 0.35), frameMat)
    frame.position.set(-0.05, 0, -0.05)
    modelRoot.add(frame)

    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 0.75, 10), frameMat)
    nose.rotation.z = Math.PI / 2
    nose.position.set(0.78, 0, -0.05)
    modelRoot.add(nose)

    const sprite = this.makeBillboardSprite(3.2, 1.6, 0xffffff, this.texShip)
    sprite.position.set(0.15, 0, 0.55)
    modelRoot.add(sprite)

    // Shield aura
    const shieldGeo = new THREE.SphereGeometry(1.4, 16, 16)
    const shieldMat = new THREE.MeshBasicMaterial({ color: 0x67a0ff, transparent: true, opacity: 0.3, wireframe: true })
    const shield = new THREE.Mesh(shieldGeo, shieldMat)
    shield.name = 'shield'
    shield.visible = false
    group.add(shield)

    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), new THREE.MeshBasicMaterial({ color: 0x68d9ff }))
    glow.position.set(-0.85, 0, 0.05)
    group.add(glow)
    group.position.set(0, 0, 0)

    this.player = this.addEntity({
      kind: 'player', mesh: group, pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(0, 0, 0),
      radius: 0.9, hp: 5, shieldActive: false,
    })
  }

  private spawnKamikaze(x: number, y: number) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xff4444, roughness: 0.6, metalness: 0.3, emissive: 0xff2222, emissiveIntensity: 0.2 })
    const geo = new THREE.TetrahedronGeometry(0.6)
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, 0)
    return this.addEntity({
      kind: 'enemyKamikaze', mesh: m, pos: new THREE.Vector3(x, y, 0),
      vel: new THREE.Vector3(-4, 0, 0), radius: 0.6, hp: 1, value: 150, enemyType: 'kamikaze',
    })
  }

  private spawnShooter(x: number, y: number) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xff8800, roughness: 0.5, metalness: 0.4, emissive: 0xff4400, emissiveIntensity: 0.15 })
    const geo = new THREE.BoxGeometry(1.2, 0.5, 0.5)
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, 0)
    return this.addEntity({
      kind: 'enemyShooter', mesh: m, pos: new THREE.Vector3(x, y, 0),
      vel: new THREE.Vector3(-1.2, 0, 0), radius: 0.7, hp: 3, value: 200, enemyType: 'shooter', ttl: 15,
    })
  }

  private spawnBoss(x: number, y: number) {
    const group = new THREE.Group()
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8800ff, roughness: 0.3, metalness: 0.6, emissive: 0x4400ff, emissiveIntensity: 0.3 })
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(2.5, 0), bodyMat)
    group.add(body)
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), coreMat)
    group.add(core)
    group.position.set(x, y, 0)
    return this.addEntity({
      kind: 'boss', mesh: group, pos: new THREE.Vector3(x, y, 0),
      vel: new THREE.Vector3(-0.5, 0, 0), radius: 2.5, hp: 50, maxHp: 50, value: 2000, bossPhase: 1,
    })
  }

  private buildWaves() {
    this.waves = [
      { at: 20, spawn: (g: Game) => g.spawnKamikaze(35, Math.random() * 6 - 3) },
      { at: 35, spawn: (g: Game) => g.spawnKamikaze(38, Math.random() * 6 - 3) },
      { at: 55, spawn: (g: Game) => g.spawnShooter(40, 2) },
      { at: 58, spawn: (g: Game) => g.spawnShooter(42, -2) },
      { at: 80, spawn: (g: Game) => { g.spawnKamikaze(35, Math.random() * 4 - 2); g.spawnShooter(40, 3) } },
      { at: 110, spawn: (g: Game) => { g.spawnShooter(35, 0); g.spawnShooter(38, 4); g.spawnKamikaze(32, -3) } },
      { at: 140, spawn: (g: Game) => { g.spawnShooter(35, 5); g.spawnShooter(38, -5); g.spawnKamikaze(30, 0) } },
      { at: 165, spawn: (g: Game) => g.spawnBoss(50, 0) },
    ]
  }

  private makeAsteroidMesh(size: number) {
    const geo = new THREE.IcosahedronGeometry(size, 2)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const tmp = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      tmp.fromBufferAttribute(pos, i)
      const n = (Math.sin(tmp.x * 3.1) + Math.sin(tmp.y * 2.7) + Math.sin(tmp.z * 3.7)) / 3
      const jitter = (Math.random() - 0.5) * 0.25
      const scale = 1 + n * 0.18 + jitter
      tmp.multiplyScalar(scale)
      pos.setXYZ(i, tmp.x, tmp.y, tmp.z)
    }
    geo.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.95, metalness: 0.05 })
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = false; m.receiveShadow = true
    m.userData.spin = new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2)
    return m
  }

  private spawnAsteroid(x: number, y: number, z: number) {
    const size = 0.7 + Math.random() * 1.3
    const m = this.makeAsteroidMesh(size)
    m.position.set(x, y, z)
    return this.addEntity({
      kind: 'asteroid', mesh: m, pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(-0.6 - Math.random() * 0.8, (Math.random() - 0.5) * 0.6, 0),
      radius: size * 0.9, hp: 2, value: 60,
    })
  }

  spawnPickup(x: number, y: number, z: number, type: 'health' | 'power' | 'shield') {
    let color: number, geo: THREE.BufferGeometry
    if (type === 'shield') {
      color = 0x67a0ff; geo = new THREE.TorusGeometry(0.5, 0.15, 8, 16)
    } else if (type === 'health') {
      color = 0x58ff7f; geo = new THREE.OctahedronGeometry(0.55, 0)
    } else {
      color = 0x67a0ff; geo = new THREE.OctahedronGeometry(0.55, 0)
    }
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.2, emissive: color, emissiveIntensity: type === 'shield' ? 0.4 : 0.25 }))
    m.position.set(x, y, z)
    this.addEntity({
      kind: 'pickup', mesh: m, pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(-0.4, 0, 0), radius: type === 'shield' ? 0.7 : 0.55, ttl: 20, pickupType: type,
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
      kind: isEnemy ? 'enemyBullet' : 'bullet', mesh: m, pos: from.clone(), vel: v,
      radius: 0.28, ttl: 1.9, damage: isEnemy ? 1 : 1 + Math.floor(this.power / 2),
    })
  }

  private explode(at: THREE.Vector3, color = 0xff9c3b) {
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.07 + Math.random() * 0.07, 8, 8), new THREE.MeshBasicMaterial({ color }))
      const v = new THREE.Vector3((Math.random() - 0.2) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6)
      m.position.copy(at)
      this.addEntity({ kind: 'particle', mesh: m, pos: at.clone(), vel: v, radius: 0, ttl: 0.45 + Math.random() * 0.45 })
    }
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }))
    flash.position.copy(at)
    this.addEntity({ kind: 'particle', mesh: flash, pos: at.clone(), vel: new THREE.Vector3(), radius: 0, ttl: 0.12 })
    this.sfx.explosion()
  }

  private animate = () => {
    requestAnimationFrame(this.animate)
    const dt = Math.min(1 / 30, this.clock.getDelta())

    if (!this.started) {
      if (this.input.consumePressed('r')) { this.reset(false); this.render(0); return }
      if (this.input.consumePressed(' ') || this.input.consumePressed('space')) {
        if (this.gameOver) this.respawnAtCheckpoint()
        else { this.started = true; this.bannerEl.innerHTML = ''; this.sfx.pickup() }
      }
      this.render(0)
      return
    }

    if (this.input.consumePressed('p')) this.paused = !this.paused
    if (this.input.consumePressed('r')) this.reset(false)

    if (this.paused || this.gameOver) { this.render(0); return }

    this.update(dt)
    this.render(dt)
  }

  private update(dt: number) {
    this.scrollSpeed = lerp(this.scrollSpeed, 9 + Math.min(6, this.distance / 90), 0.03)
    this.distance += this.scrollSpeed * dt

    // Shield timer
    if (this.shieldTime > 0) {
      this.shieldTime -= dt
      if (this.shieldTime <= 0) {
        this.player.shieldActive = false
        const shield = this.player.mesh.getObjectByName('shield')
        if (shield) shield.visible = false
      }
    }

    // Invulnerability
    this.playerInvuln = Math.max(0, this.playerInvuln - dt)
    if (this.playerInvuln > 0) {
      this.player.mesh.visible = Math.floor(performance.now() / 70) % 2 === 0
    } else {
      this.player.mesh.visible = true
      if (this.player.shieldActive) {
        const shield = this.player.mesh.getObjectByName('shield')
        if (shield) shield.visible = true
      }
    }

    // Checkpoints
    if (this.distance >= this.nextCheckpointAt) {
      this.checkpointDist = this.nextCheckpointAt
      this.checkpointIndex++
      this.nextCheckpointAt += 45
      this.score += 250
      this.bannerEl.innerHTML = `<h1>Checkpoint ${this.checkpointIndex}</h1><p class="muted">Reached distance ${this.checkpointDist.toFixed(0)}. (+250 score)</p>`
      setTimeout(() => { if (this.bannerEl.innerHTML.includes('Checkpoint')) this.bannerEl.innerHTML = '' }, 1200)
    }

    // Spawn waves
    while (this.waveIndex < this.waves.length && this.distance >= this.waves[this.waveIndex].at) {
      this.waves[this.waveIndex].spawn(this)
      this.waveIndex++
    }

    // Boss warning
    if (this.distance >= 155 && !this.bossSpawned) {
      this.bossSpawned = true
      this.bannerEl.innerHTML = `<h1 style="color:#ff4444">WARNING: BOSS APPROACHING</h1><p>Prepare for battle!</p>`
      setTimeout(() => { if (this.bannerEl.innerHTML.includes('WARNING')) this.bannerEl.innerHTML = '' }, 2000)
    }

    // Asteroid field
    if (this.distance >= this.nextAsteroidAt && !this.bossSpawned) {
      const x = 30 + Math.random() * 10
      const y = (Math.random() - 0.5) * 10
      const z = (Math.random() - 0.5) * 6
      this.spawnAsteroid(x, y, z)
      this.nextAsteroidAt += 6.5 + Math.random() * 4.5
    }

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

    p.mesh.rotation.z = lerp(p.mesh.rotation.z, -move.y * 0.18, 0.1)
    p.mesh.rotation.y = lerp(p.mesh.rotation.y, move.x * 0.12, 0.1)

    // Shooting
    this.fireCooldown = Math.max(0, this.fireCooldown - dt)
    const wantShoot = this.input.isDown(' ') || this.input.isDown('space')
    if (wantShoot && this.fireCooldown <= 0) {
      const spacing = 1 / (this.fireRate + this.power * 1.2)
      this.fireCooldown = spacing
      const base = p.pos.clone().add(new THREE.Vector3(1.15, 0, 0))
      this.spawnBullet(base, { x: 1, y: 0 }, false)
      if (this.power >= 2) {
        this.spawnBullet(base.clone().add(new THREE.Vector3(0, 0.25, 0)), { x: 1, y: 0.08 }, false)
        this.spawnBullet(base.clone().add(new THREE.Vector3(0, -0.25, 0)), { x: 1, y: -0.08 }, false)
      }
      this.sfx.shoot()
    }

    // Update entities
    for (const e of this.entities) {
      if (e.kind === 'player') continue

      // Global scroll
      e.pos.x -= this.scrollSpeed * dt
      e.pos.addScaledVector(e.vel, dt)

      if (typeof e.ttl === 'number') e.ttl -= dt

      // Enemy AI
      if (e.kind === 'enemyKamikaze') {
        // Kamikaze: accelerates toward player
        const dx = p.pos.x - e.pos.x
        const dy = p.pos.y - e.pos.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 0) {
          e.vel.x = lerp(e.vel.x, (dx / dist) * 5, 0.05)
          e.vel.y = lerp(e.vel.y, (dy / dist) * 5, 0.05)
        }
        e.mesh.rotation.x += dt * 3
        e.mesh.rotation.z += dt * 5
      }

      if (e.kind === 'enemyShooter') {
        e.mesh.rotation.y += dt * 0.8
        // Shoot at player
        if (Math.random() < dt * 0.5 && e.pos.x < 16 && e.pos.x > 2) {
          const toPlayer = p.pos.clone().sub(e.pos)
          toPlayer.z = 0
          toPlayer.normalize()
          this.spawnBullet(e.pos.clone().add(new THREE.Vector3(-0.7, 0, 0)), { x: toPlayer.x, y: toPlayer.y }, true)
        }
        e.vel.y = lerp(e.vel.y, Math.sin((this.distance + e.pos.x) * 0.1) * 1.2, 0.02)
      }

      if (e.kind === 'boss') {
        // Boss movement patterns
        const t = performance.now() * 0.001
        e.pos.y = Math.sin(t * 0.8) * 4
        if (e.hp && e.hp < e.maxHp! * 0.5) {
          e.pos.y = Math.sin(t * 1.5) * 5 // Faster in phase 2
        }
        e.mesh.rotation.y += dt * 0.3
        e.mesh.rotation.x = Math.sin(t * 0.5) * 0.1

        // Boss shooting patterns
        if (Math.random() < dt * 0.8 && e.pos.x < 20) {
          for (let i = -2; i <= 2; i++) {
            this.spawnBullet(e.pos.clone().add(new THREE.Vector3(-2, 0, 0)), { x: -0.8, y: i * 0.3 }, true)
          }
        }
      }

      // Asteroid spin
      if (e.kind === 'asteroid') {
        const spin = e.mesh.userData.spin as THREE.Vector3 | undefined
        if (spin) {
          e.mesh.rotation.x += spin.x * dt
          e.mesh.rotation.y += spin.y * dt
          e.mesh.rotation.z += spin.z * dt
        }
      }

      // Pickup spin
      if (e.kind === 'pickup') {
        e.mesh.rotation.x += dt * 1.8
        e.mesh.rotation.y += dt * 2.1
      }

      // Particle fade
      if (e.kind === 'particle' && typeof e.ttl === 'number') {
        const mat = (e.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial
        if (mat.opacity !== undefined) mat.opacity = Math.max(0, e.ttl / 0.9)
        if (e.ttl <= 0) {
          this.scene.remove(e.mesh)
          this.entities = this.entities.filter((ent) => ent !== e)
        }
      }

      // Bullet cleanup
      if (e.kind === 'bullet' || e.kind === 'enemyBullet') {
        if (e.ttl !== undefined && e.ttl <= 0) {
          this.scene.remove(e.mesh)
          this.entities = this.entities.filter((ent) => ent !== e)
        }
      }
    }

    // Cleanup off-screen entities
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i]
      if (e.kind === 'player') continue
      if (e.pos.x < -25 || e.pos.x > 60 || e.pos.y < -15 || e.pos.y > 15) {
        this.scene.remove(e.mesh)
        this.entities.splice(i, 1)
      }
    }

    // Collision detection
    const bullets = this.entities.filter((e) => e.kind === 'bullet')
    const enemyBullets = this.entities.filter((e) => e.kind === 'enemyBullet')
    const enemies = this.entities.filter((e) => e.kind?.startsWith('enemy') || e.kind === 'boss')
    const pickups = this.entities.filter((e) => e.kind === 'pickup')

    for (const b of bullets) {
      for (const e of enemies) {
        if (b.pos.distanceTo(e.pos) < b.radius + e.radius) {
          this.scene.remove(b.mesh)
          this.entities = this.entities.filter((ent) => ent !== b)
          e.hp = (e.hp ?? 1) - (b.damage ?? 1)
          if (e.hp !== undefined && e.hp <= 0) {
            this.explode(e.pos)
            this.scene.remove(e.mesh)
            this.entities = this.entities.filter((ent) => ent !== e)
            this.score += e.value ?? 100
            if (e.kind === 'boss') {
              this.bannerEl.innerHTML = `<h1>VICTORY!</h1><p>BOSS DEFEATED! (+${e.value} pts)</p>`
              this.bossSpawned = false
            }
          } else if (e.kind === 'boss') {
            this.sfx.bossHit()
          }
          break
        }
      }
    }

    for (const b of enemyBullets) {
      if (b.pos.distanceTo(p.pos) < b.radius + p.radius) {
        this.scene.remove(b.mesh)
        this.entities = this.entities.filter((ent) => ent !== b)
        if (this.playerInvuln <= 0 && !p.shieldActive) {
          p.hp = (p.hp ?? 5) - (b.damage ?? 1)
          this.playerInvuln = 1.25
          if (p.hp !== undefined && p.hp <= 0) {
            this.explode(p.pos)
            this.scene.remove(p.mesh)
            this.entities = this.entities.filter((ent) => ent !== p)
            this.gameOver = true
            this.bannerEl.innerHTML = `<h1>GAME OVER</h1><p>Distance: ${this.distance.toFixed(0)} • Score: ${this.score}</p><p>Press R to restart</p>`
          }
        }
      }
    }

    for (const e of enemies) {
      if (e.pos.distanceTo(p.pos) < e.radius + p.radius) {
        if (this.playerInvuln <= 0 && !p.shieldActive) {
          p.hp = (p.hp ?? 5) - 1
          this.playerInvuln = 1.25
          this.explode(p.pos.clone().add(e.pos).multiplyScalar(0.5))
          if (p.hp !== undefined && p.hp <= 0) {
            this.scene.remove(p.mesh)
            this.entities = this.entities.filter((ent) => ent !== p)
            this.gameOver = true
            this.bannerEl.innerHTML = `<h1>GAME OVER</h1><p>Distance: ${this.distance.toFixed(0)} • Score: ${this.score}</p><p>Press R to restart</p>`
          }
        }
      }
    }

    for (const pu of pickups) {
      if (pu.pos.distanceTo(p.pos) < pu.radius + p.radius) {
        this.scene.remove(pu.mesh)
        this.entities = this.entities.filter((ent) => ent !== pu)
        if (pu.pickupType === 'health') {
          p.hp = Math.min((p.hp ?? 5) + 1, 5)
        } else if (pu.pickupType === 'shield') {
          p.shieldActive = true
          this.shieldTime = 8
        } else {
          this.power = Math.min(this.power + 1, 5)
        }
        this.sfx.pickup()
      }
    }
  }

  private render(_dt: number) {
    this.renderer.render(this.scene, this.camera)
    this.updateHud()
  }

  private updateHud() {
    // Count active enemies
    const enemyCount = this.entities.filter((e) => e.kind?.startsWith('enemy') || e.kind === 'boss').length
    
    // Calculate next wave info
    let nextWaveInfo = ''
    if (this.waveIndex < this.waves.length) {
      const nextWave = this.waves[this.waveIndex]
      const distToWave = Math.max(0, nextWave.at - this.distance)
      nextWaveInfo = ` | Next wave: ${distToWave.toFixed(0)}m`
    } else if (this.bossSpawned) {
      nextWaveInfo = ' | BOSS FIGHT!'
    } else {
      nextWaveInfo = ' | Clear!'
    }

    this.hudEl.innerHTML = `
      <strong>Score:</strong> ${this.score} <br>
      <strong>Distance:</strong> ${this.distance.toFixed(0)}m <br>
      <strong>Wave:</strong> ${this.waveIndex}/${this.waves.length} <br>
      <strong>Enemies:</strong> ${enemyCount}${nextWaveInfo}
    `
  }
}
