/* models.js — the five portfolio builds on one studio material rig, loaded from window.ASSETS.
 *
 *   const M = await FILM_MODELS.load(THREE, THREEX);   // → { auraeyez, buggy, hxkeysair, corelink, arx }
 *
 * One rig for all five (the art direction): matte white PC/ABS enclosures, deep low-saturation solder mask with ENIG
 * gold, brushed brass knobs, black rubber, carbon fibre for Arx. Each project's tint lives on one small detail only
 * (eyes, a status LED, the keycap glow, a light-pipe ring). Every device material shares FILM_MODELS.U.uEnd, which
 * dims (to 35 %) and half-desaturates the devices for the end card.
 *
 * Each handle: { group (footprint centred on the origin, base at y = 0, mm), size, setBuild(f), ...details }.
 * setBuild(f) assembles the parts: f(layer) → {off (mm above rest), op}; layers run bottom to top.
 */
(function () {
  const TINT = { auraeyez: '#E8A25A', landrover: '#9DBF8A', hxkeysair: '#8EC9C9', corelink: '#A9A2E0', arx: '#E39A8F' };
  const U = { uEnd: { value: 0 } };
  const LAYERS = 6;

  const b2ab = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
  const parse = (THREEX, name) => new Promise((res, rej) => new THREEX.GLTFLoader().parse(b2ab(window.ASSETS.glb[name]), '', g => res(g.scene), rej));

  // ── the rig's materials ────────────────────────────────────────────────────────────────────────────────────────
  function rig(THREE) {
    const P = (o) => new THREE.MeshPhysicalMaterial(o);
    const carbonTex = (() => {               // 2/2 twill, 4 px per tow, light so it modulates the part's own colour
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const over = ((x + y) >> 1) % 2 === 0, x0 = x * 4, y0 = y * 4;
        const gr = over ? g.createLinearGradient(x0, y0, x0 + 4, y0) : g.createLinearGradient(x0, y0, x0, y0 + 4);
        gr.addColorStop(0, '#a4a4a4'); gr.addColorStop(0.5, over ? '#ffffff' : '#e2e2e2'); gr.addColorStop(1, '#a4a4a4');
        g.fillStyle = gr; g.fillRect(x0, y0, 4, 4);
      }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
    })();
    const carbon = P({ color: '#ffffff', roughness: 0.42, metalness: 0.0, clearcoat: 0.35, clearcoatRoughness: 0.35 });
    carbon.weaveTex = carbonTex;
    const R = {
      white: P({ color: '#E7E4DE', roughness: 0.45, metalness: 0, specularIntensity: 0.45, sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff') }),
      satin: P({ color: '#E9E6E0', roughness: 0.34, metalness: 0, specularIntensity: 0.5 }),
      frosted: P({ color: '#E4E9EA', roughness: 0.62, metalness: 0, specularIntensity: 0.4, sheen: 0.5, sheenRoughness: 0.8, sheenColor: new THREE.Color('#ffffff') }),
      brass: P({ color: '#C9A15A', roughness: 0.4, metalness: 1, envMapIntensity: 1.6 }),
      gold: P({ color: '#D9B46C', roughness: 0.38, metalness: 1, envMapIntensity: 1.4 }),
      mask: P({ color: '#1F3A2B', roughness: 0.5, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
      rubber: P({ color: '#121212', roughness: 0.9, metalness: 0 }),
      graphite: P({ color: '#2B2B2E', roughness: 0.55, metalness: 0.2 }),
      black: P({ color: '#111113', roughness: 0.45, metalness: 0.1 }),
      gloss: P({ color: '#0D0D0F', roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 }),
      alu: P({ color: '#9A9DA2', roughness: 0.4, metalness: 0.9, envMapIntensity: 1.3 }),
      motor: P({ color: '#18181A', roughness: 0.36, metalness: 0.75 }),
      carbon,
    };
    // the site's own colour on the rig's surface: paint(kind, '#hex') or paint(kind, THREE.Color) for a CAD colour
    const cache = new Map();
    R.paint = (kind, color) => {
      const key = kind + (color.isColor ? color.getHexString() : color);
      if (!cache.has(key)) { const m = R[kind].clone(); m.weaveTex = R[kind].weaveTex; if (color.isColor) m.color.copy(color); else m.color.set(color); cache.set(key, m); }
      return cache.get(key);
    };
    // a CAD material's own colour, dimmed the way the site dims near-white albedo
    R.cad = std => { const c = std.color.clone(); if (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.55) c.multiplyScalar(0.85); return R.paint('white', c); };
    return R;
  }

  // Every device material: the end-card dim/desaturate, and (for carbon) the weave in object space.
  function inject(m) {
    if (m._inj) return m;
    m._inj = true;
    const weave = m.weaveTex;
    m.customProgramCacheKey = () => weave ? 'film-weave' : 'film';
    m.onBeforeCompile = sh => {
      sh.uniforms.uEnd = U.uEnd;
      if (weave) {
        sh.uniforms.tWeave = { value: weave };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nvarying vec3 vObjN;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position * 1000.0; vObjN = normal;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nvarying vec3 vObjN;\nuniform sampler2D tWeave;')
          .replace('#include <color_fragment>', `#include <color_fragment>
            vec3 an = abs(normalize(vObjN)); an /= (an.x + an.y + an.z);
            vec3 wv = texture2D(tWeave, vObj.yz / 8.0).rgb * an.x + texture2D(tWeave, vObj.xz / 8.0).rgb * an.y + texture2D(tWeave, vObj.xy / 8.0).rgb * an.z;
            diffuseColor.rgb *= wv * 1.4;`);
      }
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uEnd;')
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          float lumE = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(lumE), 0.5 * uEnd) * mix(1.0, 0.35, uEnd);`);
    };
    return m;
  }
  // an emissive detail in a project's tint; set(k) powers it (k can exceed 1 for bloom)
  function led(THREE, tint, geo) {
    const m = inject(new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.3, metalness: 0, emissive: tint, emissiveIntensity: 0 }));
    const mesh = new THREE.Mesh(geo, m);
    mesh.set = (k, color) => { m.emissiveIntensity = k; if (color) m.emissive.set(color); };
    return mesh;
  }

  // Wrap a GLB scene: orient, metres → mm, footprint centred, base on y = 0. Then split the meshes into assembly
  // layers by height and give every mesh its own material so each layer can fade in on its own.
  function mount(THREE, scene, euler) {
    const inner = new THREE.Group(), group = new THREE.Group();
    inner.rotation.set(euler[0], euler[1], euler[2]); inner.scale.setScalar(1000);
    inner.add(scene); group.add(inner); group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner), c = box.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -box.min.y, -c.z); group.updateMatrixWorld(true);
    const size = box.getSize(new THREE.Vector3());
    return { group, inner, size: { x: size.x, y: size.y, z: size.z } };
  }
  function partsOf(THREE, m) {
    const meshes = []; m.group.updateMatrixWorld(true);
    m.inner.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
    const lo = meshes.map(o => new THREE.Box3().setFromObject(o).min.y);
    const order = meshes.map((o, i) => i).sort((a, b) => lo[a] - lo[b]);
    m.parts = [];
    order.forEach((i, rank) => {
      const o = meshes[i], p = o.parent, inv = new THREE.Matrix4().copy(p.matrixWorld).invert();
      const z0 = new THREE.Vector3().applyMatrix4(inv), up = new THREE.Vector3(0, 1, 0).applyMatrix4(inv).sub(z0);
      const cl = x => { const c = x.clone(); c.weaveTex = x.weaveTex; return inject(c); };
      o.material = Array.isArray(o.material) ? o.material.map(cl) : cl(o.material);
      o.castShadow = true; o.receiveShadow = true;
      m.parts.push({ mesh: o, layer: Math.min(LAYERS - 1, Math.floor(rank / meshes.length * LAYERS)), rest: o.position.clone(), up });
    });
    let lastKey = '';
    m.setBuild = f => {
      const st = []; for (let l = 0; l < LAYERS; l++) st.push(f(l));
      const key = st.map(s => s.off.toFixed(3) + ':' + s.op.toFixed(3)).join();
      if (key === lastKey) return; lastKey = key;
      for (const q of m.parts) {
        const s = st[q.layer]; q.mesh.position.copy(q.rest).addScaledVector(q.up, s.off); q.mesh.visible = s.op > 0.002;
        for (const mt of [].concat(q.mesh.material)) {
          const tr = s.op < 0.999; if (mt.transparent !== tr) { mt.transparent = tr; mt.needsUpdate = true; }
          mt.opacity = s.op;
        }
      }
    };
    return m;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // ── U1 AuraEyez — grey ABS body, copper knobs and PIR ring, black bezel, frosted PIR lens, graphite backplate ──
  async function auraeyez(THREE, THREEX, R) {
    const scene = await parse(THREEX, 'auraeyez');
    scene.traverse(o => {
      if (!o.isMesh) return;
      if (o.name === 'Body1008' || o.name === 'Body1009') { o.material = R.paint('brass', '#D89E64'); return; }
      const std = [].concat(o.material)[0], n = std.name || '';
      o.material = n === 'ABS (White)' ? R.paint('white', '#AEAEB2') : n === 'Plastic - Glossy (Black)' ? R.paint('gloss', '#1E1E20')
        : n.startsWith('PEKK') ? R.paint('brass', '#D89E64') : n === 'Glass - Medium Color' ? R.paint('frosted', '#DDE2E2')
        : n === 'Paint - Enamel Glossy (Yellow)' ? R.paint('graphite', '#3A3A3D') : R.cad(std);
    });
    const m = partsOf(THREE, mount(THREE, scene, [Math.PI, 0, 0]));
    // OLED: eyes drawn RoboEyes-style on a transparent canvas just above the cover glass
    const glass = scene.getObjectByName('Body5002'), gb = new THREE.Box3().setFromObject(glass);
    const gc = gb.getCenter(new THREE.Vector3()), gs = gb.getSize(new THREE.Vector3());
    const W = 512, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const eyeMat = inject(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(gs.x, gs.z), eyeMat);
    screen.rotation.x = -Math.PI / 2; screen.position.copy(m.group.worldToLocal(new THREE.Vector3(gc.x, gb.max.y + 0.4, gc.z)));
    screen.renderOrder = 5; m.group.add(screen);
    let last = '';
    m.setScreen = ({ eyes = 0, open = 1, gaze = 0, glow = 1 }) => {
      const key = [eyes, open, gaze, glow].map(v => v.toFixed(3)).join(); if (key === last) return; last = key;
      g.clearRect(0, 0, W, H);
      if (eyes > 0) {
        const grow = 1 - Math.pow(1 - eyes, 3);
        g.save(); g.globalAlpha = Math.min(1, eyes * 1.4); g.fillStyle = '#ffffff'; g.shadowColor = 'rgba(255,255,255,0.55)'; g.shadowBlur = 22;
        for (const side of [-1, 1]) {
          const lean = 1 + 0.18 * Math.max(0, gaze * side), w = 135 * (0.85 + 0.15 * grow), h = 155 * grow * Math.max(0.05, open) * lean;
          const cx = W / 2 + side * 96 + gaze * 40, cy = H / 2;
          roundRect(g, cx - w / 2, cy - h / 2, w, h, Math.min(41, h / 2)); g.fill();
        }
        g.restore();
      }
      eyeMat.color.setScalar(glow); tex.needsUpdate = true;
    };
    m.setScreen({});
    return m;
  }

  // ── U2 Land Rover — green-grey plates, green boards with terminal blocks, blue electrolytic, silver and gold hardware ──
  async function buggy(THREE, THREEX, R) {
    const scene = await parse(THREEX, 'buggy');
    const PCB = R.paint('mask', '#237A3C'), TERM = R.paint('satin', '#52D96A'), CAP = R.paint('satin', '#2A36A0'), SILVER = R.paint('alu', '#B9BEC4'),
      GOLD = R.paint('gold', '#C9A227'), IC = R.paint('black', '#141518'), CONN = R.paint('black', '#1B1C1F'), HEAD = R.paint('satin', '#C7CBD1');
    const MATS = [['wheelwithout', R.paint('graphite', '#37383C')], ['tyre', R.paint('rubber', '#17181B')], ['motor', R.paint('motor', '#3A3F45')],
      ['gear', R.paint('graphite', '#3E4046')], ['encoder', R.paint('black', '#1E1F22')], ['batteryframe', R.paint('white', '#333B36')],
      ['battery', R.paint('graphite', '#2E3B4E')], ['ballhousing', R.paint('alu', '#9AA1AA')], ['ball', R.paint('black', '#26272B')]];
    const PLATE = R.paint('white', '#333B36');
    const EXPLICIT = { motordriverboard: PCB, motordriverboard001: TERM, motordriverboard002: TERM, motordriverboard003: TERM, motordriverboard004: TERM,
      motordriverboard005: CAP, motordriverboard048: SILVER, motordriverboard049: SILVER, motordriverboard050: SILVER, motordriverboard051: SILVER,
      motordriverboard052: CONN, stm32mountboard: PCB, stm32mountboard001: CONN, stm32mountboard002: HEAD, stm32mountboard003: SILVER,
      stm32mountboard004: HEAD, stm32mountboard005: SILVER };
    scene.updateMatrixWorld(true);
    scene.traverse(o => {
      if (!o.isMesh) return;
      const n = o.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (EXPLICIT[n]) { o.material = EXPLICIT[n]; return; }
      if (n.startsWith('motordriverboard')) {
        const s = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).multiplyScalar(1000), big = Math.max(s.x, s.y);
        o.material = big >= 2 && big <= 3 && s.z <= 3.5 ? GOLD : s.z >= 6 && big <= 2.5 ? SILVER : IC;
        return;
      }
      if (n.startsWith('stm32mountboard')) { o.material = IC; return; }
      if (n.startsWith('connector') || n.startsWith('connplate')) { o.material = CONN; return; }
      const hit = MATS.find(([stem]) => n.startsWith(stem));
      o.material = hit ? hit[1] : PLATE;
    });
    const wheels = [];
    for (const name of ['Wheel', 'Wheel001']) {
      const w = scene.getObjectByName(name); if (!w || !w.parent) continue;
      const box = new THREE.Box3().setFromObject(w), pivot = new THREE.Group();
      w.parent.add(pivot); pivot.position.copy(w.parent.worldToLocal(box.getCenter(new THREE.Vector3()))); pivot.updateMatrixWorld(true); pivot.attach(w);
      wheels.push(pivot);
    }
    const m = partsOf(THREE, mount(THREE, scene, [Math.PI / 2, 0, 0]));
    m.setRoll = ang => { for (const p of wheels) p.rotation.y = ang; };
    return m;
  }

  // ── U3 Hxkeys Air — navy case, teal keycaps and encoder knob; the rest in their CAD colours ──
  async function hxkeysair(THREE, THREEX, R) {
    const scene = await parse(THREEX, 'hxkeysair');
    const CAPS = ['MX_Normal_Tilted_v11', 'MX_Normal_Tilted_v12', 'MX_Normal_Tilted_v13', 'MX_Normal_Tilted_v14', 'MX_Normal_v11',
      'MX_Normal_v12', 'MX_Normal_v13', 'MX_Normal_v14', '1x2_R3_v61', '1x2_R3_v62', 'Body5012'];
    scene.traverse(o => {
      if (!o.isMesh) return;
      o.material = /^(Structure|Upper_Plate|Lower_Plate|Base)$/.test(o.name) ? R.paint('white', '#1E2C4E') : R.cad([].concat(o.material)[0]);
    });
    const caps = CAPS.map(n => scene.getObjectByName(n)).filter(Boolean);
    caps.forEach(c => c.traverse(o => { if (o.isMesh) o.material = R.paint('frosted', '#51BEC8'); }));
    const m = partsOf(THREE, mount(THREE, scene, [-Math.PI / 2, 0, 0]));
    // each cap's own materials glow, in a ripple from the corner the current enters
    m.capGlow = caps.map(node => {
      const mats = []; node.traverse(o => { if (o.isMesh) for (const mt of [].concat(o.material)) { mt.emissive = new THREE.Color('#51BEC8'); mats.push(mt); } });
      const c = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
      return { mats, x: c.x, z: c.z };
    });
    m.setGlow = (f, color) => { for (const c of m.capGlow) { const k = f(c); for (const mt of c.mats) { mt.emissiveIntensity = k; if (color) mt.emissive.set(color); } } };
    return m;
  }

  // ── U4 CoreLink — grey shell and fascia, violet knobs, violet domes and LEDs that light when it boots ──
  async function corelink(THREE, THREEX, R) {
    const scene = await parse(THREEX, 'corelink');
    const BY = { body: R.paint('satin', '#AEAEB2'), cap: R.paint('satin', '#A6A6AB'), placeholder: R.paint('mask', '#234230'), Component5: R.paint('mask', '#234230'),
      Component6: R.paint('gloss', '#101215'), Body1: R.paint('graphite', '#232327'), knobleft: R.paint('brass', '#917EDD'), knobright: R.paint('brass', '#917EDD'),
      Component9: R.paint('frosted', '#4A4260'), Component10: R.paint('frosted', '#4A4260'), Component7: R.paint('black', '#1B1D22'), Component8: R.paint('black', '#1B1D22') };
    scene.traverse(o => { if (o.isMesh) o.material = BY[o.name] || R.paint('satin', '#AEAEB2'); });
    const m = partsOf(THREE, mount(THREE, scene, [Math.PI / 2, 0, 0]));
    const lights = []; for (const n of ['Component7', 'Component8', 'Component9', 'Component10']) { const o = scene.getObjectByName(n); if (o) o.traverse(q => { if (q.isMesh) for (const mt of [].concat(q.material)) { mt.emissive = new THREE.Color('#917EDD'); lights.push(mt); } }); }
    m.setLeds = k => { for (const mt of lights) mt.emissiveIntensity = 0.1 + k; };
    m.setLeds(0);
    // the dashboard on the inlay: two rings in the CoreLink violet, as on the site
    const inlay = scene.getObjectByName('Component6');
    m.setDash = () => {};
    if (inlay) {
      const b = new THREE.Box3().setFromObject(inlay), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
      const W = 512, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const mat = inject(new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.x * 0.92, s.y * 0.88), mat);
      plane.position.copy(m.group.worldToLocal(new THREE.Vector3(c.x, c.y, b.max.z + 0.3))); m.group.add(plane);
      let last = -1;
      m.setDash = k => {
        const q = Math.round(k * 45) / 45; if (q === last) return; last = q;
        g.clearRect(0, 0, W, H);
        for (const [x, v, lo, hi, unit] of [[W * 0.32, 24.6, 15, 35, '°'], [W * 0.68, 58, 0, 100, '%']]) {
          g.lineWidth = 13; g.strokeStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.arc(x, H / 2, 62, 0, Math.PI * 2); g.stroke();
          g.strokeStyle = '#917EDD'; g.lineCap = 'round';
          g.beginPath(); g.arc(x, H / 2, 62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (v - lo) / (hi - lo) * q); g.stroke();
          g.fillStyle = `rgba(245,245,247,${q})`; g.font = '600 32px FilmMono'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText((unit === '°' ? (v * q).toFixed(1) : Math.round(v * q)) + unit, x, H / 2 + 2);
        }
        mat.color.setScalar(1.5); tex.needsUpdate = true;
      };
      m.setDash(0);
    }
    return m;
  }

  // ── U5 Arx — mauve-grey frame (carbon weave), warmer body, dark legs, green board, silver motors, rose rings and prop tips ──
  async function arx(THREE, THREEX, R) {
    const scene = await parse(THREEX, 'arx');
    const matFor = n => /^SOLID00[1-4]$/.test(n) ? R.paint('alu', '#8E9298') : /Pins/.test(n) ? R.paint('gold', '#C9A227')
      : /pcb|XIAO|Seeed|SOLID$|Shield|Body/.test(n) ? R.paint('mask', '#1E4D33') : /support/.test(n) ? R.paint('graphite', '#443A40')
      : /chassis/.test(n) ? R.paint('carbon', '#54444A') : R.paint('carbon', '#5E4C52');
    scene.traverse(o => {
      if (!o.isMesh) return;
      if (/^(tilt[1-4]|circular[1-4]|fan_v\d+)$/.test(o.name)) { o.visible = false; return; }
      o.material = matFor(o.name);
    });
    const m = partsOf(THREE, mount(THREE, scene, [0, 0, 0]));
    // two-blade props: dark root, rose tip (the site's blade); above a spin rate they hand over to a faint disc
    const blade = (() => {
      const pos = [], col = [], idx = [], SPAN = 12, CH = 5, dark = new THREE.Color('#1A1B1E'), tip = new THREE.Color('#DC7482'), mix = new THREE.Color();
      for (let i = 0; i <= SPAN; i++) {
        const t = i / SPAN, r = 3.5 + 13.5 * t, chord = 6.2 * (0.45 + 0.55 * Math.sin(Math.PI * (0.18 + 0.82 * t))) * (1 - 0.3 * t * t), tw = 0.62 - 0.44 * t;
        const k = Math.min(1, Math.max(0, (t - 0.72) / 0.23)); mix.copy(dark).lerp(tip, k * k * (3 - 2 * k));
        for (let j = 0; j <= CH; j++) { const c = (j / CH - 0.5) * chord; pos.push(r, c * Math.sin(tw), c * Math.cos(tw)); col.push(mix.r, mix.g, mix.b); }
      }
      for (let i = 0; i < SPAN; i++) for (let j = 0; j < CH; j++) { const a = i * (CH + 1) + j; idx.push(a, a + CH + 1, a + 1, a + 1, a + CH + 1, a + CH + 2); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx); geo.computeVertexNormals(); return geo;
    })();
    const PROP = inject(new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.35, metalness: 0, side: THREE.DoubleSide, transparent: true }));
    const DISC = inject(new THREE.MeshBasicMaterial({ color: '#2a2a2d', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    const RING = inject(R.paint('brass', '#DC7482').clone());
    const props = [];
    for (const [x, z, dir] of [[35.4, 35.4, 1], [-35.4, -35.4, 1], [35.4, -35.4, -1], [-35.4, 35.4, -1]]) {
      const p = new THREE.Group(); p.position.set(x, m.size.y - 2, z);
      p.add(new THREE.Mesh(blade, PROP)); const b2 = new THREE.Mesh(blade, PROP); b2.rotation.y = Math.PI; p.add(b2);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.9, 10, 32), RING); ring.rotation.x = Math.PI / 2; p.add(ring);
      const disc = new THREE.Mesh(new THREE.RingGeometry(3.5, 17, 48), DISC); disc.rotation.x = -Math.PI / 2; p.add(disc);
      m.group.add(p); props.push({ p, dir });
    }
    m.setProps = (ang, blur, op = 1) => {
      PROP.opacity = op * (1 - 0.85 * blur); DISC.opacity = op * 0.22 * blur; RING.transparent = op < 0.999; RING.opacity = op;
      for (const q of props) { q.p.rotation.y = q.dir * ang; q.p.visible = op > 0.002; }
    };
    return m;
  }

  async function load(THREE, THREEX) {
    const R = rig(THREE), out = {};
    for (const [k, f] of Object.entries({ auraeyez, buggy, hxkeysair, corelink, arx })) out[k] = await f(THREE, THREEX, R);
    return out;
  }

  window.FILM_MODELS = { load, TINT, U, LAYERS };
})();
