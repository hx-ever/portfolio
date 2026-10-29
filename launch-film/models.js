/* models.js — the five portfolio builds, loaded from window.ASSETS and themed the way web/src/components/three
 * themes them (graphite bodies, one accent per project at its interaction points). Everything here is set up once;
 * the comp poses the returned handles as a pure function of time.
 *
 *   const M = await FILM_MODELS.load(THREE, THREEX, renderer);   // → { auraeyez, buggy, hxkeysair, corelink, arx }
 *
 * Each handle: { group, size: {x, y, z} (mm, after orientation), ... model-specific controls }. The group sits with
 * its footprint centred on the origin and its base at y = 0; world units are millimetres, y up.
 */
(function () {
  const ACCENT = {
    auraeyez: '#D89E64', landrover: '#83C25D', hxkeysair: '#51BEC8', corelink: '#917EDD', arx: '#DC7482',
  };
  const GRAPHITE_DEEP = '#3A3A3D';

  const b2ab = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;

  function parse(THREEX, name) {
    return new Promise((res, rej) => new THREEX.GLTFLoader().parse(b2ab(window.ASSETS.glb[name]), '', g => res(g.scene), rej));
  }

  // Matte-plastic normalisation the site applies to every CAD material (AuraEyez / Hxkeys).
  function matte(std) {
    std.metalness = 0;
    std.roughness = Math.max(std.roughness, 0.78);
    std.envMapIntensity = 0.06;
    if (std.isMeshPhysicalMaterial) { std.specularIntensity = 0.35; std.specularColor.setScalar(1); }
    const c = std.color;
    if (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.55) c.multiplyScalar(0.85);
  }

  // Wrap a GLB scene: orient (Euler), scale metres → mm, centre the footprint, base on y = 0.
  function mount(THREE, scene, euler) {
    const inner = new THREE.Group(), group = new THREE.Group();
    inner.rotation.set(euler[0], euler[1], euler[2]);
    inner.scale.setScalar(1000);
    inner.add(scene);
    group.add(inner);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const c = box.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -box.min.y, -c.z);
    group.updateMatrixWorld(true);
    const size = box.getSize(new THREE.Vector3());
    return { group, inner, size: { x: size.x, y: size.y, z: size.z } };
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  async function auraeyez(THREE, THREEX) {
    const scene = await parse(THREEX, 'auraeyez');
    const knobMat = new THREE.MeshStandardMaterial({ color: ACCENT.auraeyez, metalness: 0.45, roughness: 0.3, envMapIntensity: 0.5 });
    const seen = new Set();
    scene.traverse(o => {
      if (!o.isMesh) return;
      if (o.name === 'Body1008' || o.name === 'Body1009') { o.material = knobMat; return; }
      for (const std of [].concat(o.material)) {
        if (!std.isMeshStandardMaterial || seen.has(std)) continue;
        seen.add(std);
        if (std.name === 'Plastic - Glossy (Black)') { std.color.set('#1E1E20'); std.metalness = 0.2; std.roughness = 0.5; std.envMapIntensity = 0.15; continue; }
        if (std.name.startsWith('PEKK')) { std.color.set(ACCENT.auraeyez); std.metalness = 0.2; std.roughness = 0.5; std.envMapIntensity = 0.12; continue; }
        if (std.name === 'Glass - Medium Color') { std.color.set('#DDE2E2'); std.metalness = 0; std.roughness = 0.28; std.envMapIntensity = 0.9; std.transparent = true; std.opacity = 0.55; continue; }
        matte(std);
        if (std.name === 'ABS (White)') { std.color.set('#AEAEB2'); std.roughness = 0.72; std.metalness = 0.1; }
        else if (std.name === 'Paint - Enamel Glossy (Yellow)') { std.color.set(GRAPHITE_DEEP); std.roughness = 0.6; std.metalness = 0.15; }
      }
    });
    // The face points −Y in the file: turn it face-up so the eyes look at a camera above the board.
    const m = mount(THREE, scene, [Math.PI, 0, 0]);
    // OLED: a canvas plane just above the cover glass, eyes drawn RoboEyes-style (rounded rects, white glow).
    const glass = scene.getObjectByName('Body5002');
    const gb = new THREE.Box3().setFromObject(glass);
    const gc = gb.getCenter(new THREE.Vector3()), gs = gb.getSize(new THREE.Vector3());
    const W = 512, H = 256, canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d'), tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(gs.x, gs.z), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    screen.rotation.x = -Math.PI / 2;
    const local = m.group.worldToLocal(new THREE.Vector3(gc.x, gb.max.y + 0.4, gc.z));
    screen.position.copy(local);
    m.group.add(screen);
    let last = '';
    // lit: backlight 0..1 · eyes: 0..1 (fade + scale in) · open: lid 0..1 · gaze: −1..1 horizontal
    m.setScreen = ({ lit = 0, eyes = 0, open = 1, gaze = 0 }) => {
      const key = [lit, eyes, open, gaze].map(v => v.toFixed(3)).join();
      if (key === last) return;
      last = key;
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#1A1A1C'; g.fillRect(0, 0, W, H);
      if (lit > 0) { g.fillStyle = `rgba(255,255,255,${(0.05 * lit).toFixed(3)})`; g.fillRect(0, 0, W, H); }
      if (eyes > 0) {
        const grow = 1 - Math.pow(1 - eyes, 3);
        g.save(); g.globalAlpha = eyes; g.fillStyle = '#fff'; g.shadowColor = 'rgba(255,255,255,0.55)'; g.shadowBlur = 22;
        for (const side of [-1, 1]) {
          const lean = 1 + 0.18 * Math.max(0, gaze * side);
          const w = 135 * grow, h = 155 * grow * Math.max(0.06, open) * lean;
          const cx = W / 2 + side * 96 + gaze * 40, cy = H / 2;
          roundRect(g, cx - w / 2, cy - h / 2, w, h, Math.min(41 * grow, h / 2));
          g.fill();
        }
        g.restore();
      }
      tex.needsUpdate = true;
    };
    m.setScreen({});
    return m;
  }

  async function buggy(THREE, THREEX) {
    const scene = await parse(THREEX, 'buggy');
    const S = (c, metalness, roughness) => new THREE.MeshStandardMaterial({ color: c, metalness, roughness, envMapIntensity: 0.08 });
    const MATS = [
      ['wheelwithout', S('#37383C', 0.1, 0.62)], ['tyre', S('#17181B', 0, 0.95)], ['motor', S('#3A3F45', 0.8, 0.35)],
      ['gear', S('#3E4046', 0.1, 0.6)], ['encoder', S('#1E1F22', 0.05, 0.65)], ['batteryframe', S('#333B36', 0.15, 0.72)],
      ['battery', S('#2E3B4E', 0.05, 0.6)], ['ballhousing', S('#9AA1AA', 0.7, 0.35)], ['ball', S('#26272B', 0, 0.85)],
    ];
    const PLATE = S('#333B36', 0.15, 0.72), PCB = S('#237A3C', 0.05, 0.55), TERM = S(ACCENT.landrover, 0, 0.5), CAP = S('#2A36A0', 0.1, 0.4),
      SILVER = S('#B9BEC4', 0.85, 0.3), GOLD = S('#C9A227', 0.85, 0.35), IC = S('#141518', 0.05, 0.55), CONN = S('#1B1C1F', 0.05, 0.5),
      HEAD = S('#C7CBD1', 0.3, 0.45);
    const DRIVER = { motordriverboard: PCB, motordriverboard001: TERM, motordriverboard002: TERM, motordriverboard003: TERM,
      motordriverboard004: TERM, motordriverboard005: CAP, motordriverboard048: SILVER, motordriverboard049: SILVER,
      motordriverboard050: SILVER, motordriverboard051: SILVER, motordriverboard052: CONN };
    const STM = { stm32mountboard: PCB, stm32mountboard001: CONN, stm32mountboard002: HEAD, stm32mountboard003: SILVER,
      stm32mountboard004: HEAD, stm32mountboard005: SILVER };
    scene.updateMatrixWorld(true);
    scene.traverse(o => {
      if (!o.isMesh) return;
      const n = o.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (n.startsWith('motordriverboard')) {
        if (DRIVER[n]) { o.material = DRIVER[n]; return; }
        const s = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).multiplyScalar(1000);
        const h = s.z, big = Math.max(s.x, s.y);
        o.material = big >= 2 && big <= 3 && h <= 3.5 ? GOLD : h >= 6 && big <= 2.5 ? SILVER : IC;
        return;
      }
      if (n.startsWith('stm32mountboard')) { o.material = STM[n] || IC; return; }
      if (n.startsWith('connector') || n.startsWith('connplate')) { o.material = CONN; return; }
      const hit = MATS.find(([stem]) => n.startsWith(stem));
      o.material = hit ? hit[1] : PLATE;
    });
    // Wheels: re-parent each under a pivot at its own centre so it can roll about the axle (GLB lateral axis = Y).
    const wheels = [];
    for (const name of ['Wheel', 'Wheel001']) {
      const w = scene.getObjectByName(name);
      if (!w || !w.parent) continue;
      const box = new THREE.Box3().setFromObject(w), pivot = new THREE.Group();
      w.parent.add(pivot);
      pivot.position.copy(w.parent.worldToLocal(box.getCenter(new THREE.Vector3())));
      pivot.updateMatrixWorld(true);
      pivot.attach(w);
      wheels.push({ pivot, r: box.getSize(new THREE.Vector3()).x / 2 * 1000 });
    }
    // +Z is down in the file, X runs caster (front, +X) to sensors (−X).
    const m = mount(THREE, scene, [Math.PI / 2, 0, 0]);
    m.wheelR = wheels.length ? wheels[0].r : 54;
    m.setRoll = dist => { for (const w of wheels) w.pivot.rotation.y = dist / m.wheelR; };
    return m;
  }

  async function hxkeysair(THREE, THREEX) {
    const scene = await parse(THREEX, 'hxkeysair');
    const CASE = new THREE.MeshStandardMaterial({ color: '#1E2C4E', roughness: 0.75, metalness: 0.1 });
    const seen = new Set();
    scene.traverse(o => {
      if (!o.isMesh) return;
      if (/^(Structure|Upper_Plate|Lower_Plate|Base)$/.test(o.name)) { o.material = CASE; return; }
      for (const std of [].concat(o.material)) {
        if (!std.isMeshStandardMaterial || seen.has(std)) continue;
        seen.add(std); matte(std);
      }
    });
    const CAPS = ['MX_Normal_Tilted_v11', 'MX_Normal_Tilted_v12', 'MX_Normal_Tilted_v13', 'MX_Normal_Tilted_v14', 'MX_Normal_v11',
      'MX_Normal_v12', 'MX_Normal_v13', 'MX_Normal_v14', '1x2_R3_v61', '1x2_R3_v62', 'Body5012'];
    const clones = new Map();
    const capMat = mt => {
      if (!clones.has(mt)) {
        const c = mt.clone(); c.color.set(ACCENT.hxkeysair); c.metalness = 0; c.roughness = 0.62; c.envMapIntensity = 0.15;
        if (c.isMeshPhysicalMaterial) { c.specularIntensity = 0.4; c.specularColor.setScalar(1); c.clearcoat = 0.04; c.clearcoatRoughness = 0.5; }
        clones.set(mt, c);
      }
      return clones.get(mt);
    };
    const caps = CAPS.map(n => scene.getObjectByName(n)).filter(Boolean);
    caps.forEach((node, i) => {
      if (i < 10) node.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(capMat) : capMat(o.material); });
    });
    const m = mount(THREE, scene, [-Math.PI / 2, 0, 0]);
    // Per cap: rest position and the local vector for +1 mm of world up, so a lift is one multiply-add per frame.
    m.group.updateMatrixWorld(true);
    m.caps = caps.map((node, i) => {
      const p = node.parent, inv = new THREE.Matrix4().copy(p.matrixWorld).invert();
      const o = new THREE.Vector3().applyMatrix4(inv), up = new THREE.Vector3(0, 1, 0).applyMatrix4(inv).sub(o);
      const x = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3()).x;
      return { node, rest: node.position.clone(), up, x, i };
    });
    const xs = m.caps.map(c => c.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
    m.caps.forEach(c => { c.wave = (c.x - x0) / (x1 - x0 || 1); });
    m.setCaps = f => { for (const c of m.caps) c.node.position.copy(c.rest).addScaledVector(c.up, f(c)); };
    return m;
  }

  async function corelink(THREE, THREEX) {
    const scene = await parse(THREEX, 'corelink');
    const mt = (color, roughness = 0.75) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
    const BODY = mt('#AEAEB2', 0.72), CAP = mt('#A6A6AB', 0.68), PCB = mt('#234230', 0.6), INLAY = mt('#101215', 0.5), MOD = mt('#232327', 0.55);
    const KNOB = new THREE.MeshStandardMaterial({ color: ACCENT.corelink, metalness: 0.45, roughness: 0.3 });
    const DOME = new THREE.MeshStandardMaterial({ color: '#4A4260', roughness: 0.4, metalness: 0, emissive: ACCENT.corelink, emissiveIntensity: 0.1 });
    const LED = new THREE.MeshStandardMaterial({ color: '#1B1D22', roughness: 0.4, metalness: 0, emissive: ACCENT.corelink, emissiveIntensity: 0.1 });
    const BY = { body: BODY, cap: CAP, placeholder: PCB, Component5: PCB, Component6: INLAY, Body1: MOD, knobleft: KNOB, knobright: KNOB,
      Component9: DOME, Component10: DOME, Component7: LED, Component8: LED };
    scene.traverse(o => { if (o.isMesh) o.material = BY[o.name] || BODY; });
    const m = mount(THREE, scene, [Math.PI / 2, 0, 0]);
    m.setLeds = k => { DOME.emissiveIntensity = 0.1 + 1.2 * k; LED.emissiveIntensity = 0.1 + 1.2 * k; };
    // Screen: the dashboard rings the site draws, on a canvas over the inlay.
    const inlay = scene.getObjectByName('Component6');
    if (inlay) {
      const b = new THREE.Box3().setFromObject(inlay), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
      const W = 512, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.x * 0.92, s.y * 0.88), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      plane.position.copy(m.group.worldToLocal(new THREE.Vector3(c.x, c.y, b.max.z + 0.3)));
      m.group.add(plane);
      let last = -1;
      m.setDash = k => {
        const q = Math.round(k * 60) / 60;
        if (q === last) return;
        last = q;
        g.fillStyle = '#101215'; g.fillRect(0, 0, W, H);
        const rings = [[W * 0.32, 24.6, 15, 35, '°'], [W * 0.68, 58, 0, 100, '%']];
        for (const [x, v, lo, hi, unit] of rings) {
          g.lineWidth = 13; g.strokeStyle = 'rgba(255,255,255,0.08)';
          g.beginPath(); g.arc(x, H / 2, 62, 0, Math.PI * 2); g.stroke();
          g.strokeStyle = ACCENT.corelink; g.lineCap = 'round';
          g.beginPath(); g.arc(x, H / 2, 62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (v - lo) / (hi - lo) * q); g.stroke();
          g.fillStyle = `rgba(245,245,247,${q})`; g.font = '600 34px FilmMono'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText((unit === '°' ? (v * q).toFixed(1) : Math.round(v * q)) + unit, x, H / 2 + 2);
        }
        tex.needsUpdate = true;
      };
      m.setDash(0);
    } else m.setDash = () => {};
    return m;
  }

  async function arx(THREE, THREEX) {
    const scene = await parse(THREEX, 'arx');
    const S = (color, roughness, metalness) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const FRAME = S('#54444A', 0.76, 0.12), BODY = S('#5E4C52', 0.7, 0.12), LEG = S('#443A40', 0.8, 0.1), PCB = S('#1E4D33', 0.6, 0),
      MOTOR = S('#8E9298', 0.35, 0.7), PIN = S('#C9A227', 0.4, 0.8);
    const matFor = n => /^SOLID00[1-4]$/.test(n) ? MOTOR : /Pins/.test(n) ? PIN : /pcb|XIAO|Seeed|SOLID$|Shield|Body/.test(n) ? PCB
      : /support/.test(n) ? LEG : /chassis/.test(n) ? FRAME : BODY;
    scene.traverse(o => {
      if (!o.isMesh) return;
      if (/^(tilt[1-4]|circular[1-4]|fan_v\d+)$/.test(o.name)) { o.visible = false; return; }
      o.material = matFor(o.name);
    });
    // Two-blade props (the site's blade: dark root, rose tip), on the four motors.
    const blade = (() => {
      const pos = [], col = [], idx = [], dark = new THREE.Color('#1A1B1E'), tip = new THREE.Color(ACCENT.arx), mix = new THREE.Color();
      const SPAN = 12, CH = 5;
      for (let i = 0; i <= SPAN; i++) {
        const t = i / SPAN, r = 3.5 + (17 - 3.5) * t, chord = 6.2 * (0.45 + 0.55 * Math.sin(Math.PI * (0.18 + 0.82 * t))) * (1 - 0.3 * t * t);
        const tw = 0.62 - 0.44 * t, k = Math.min(1, Math.max(0, (t - 0.72) / 0.23)); mix.copy(dark).lerp(tip, k * k * (3 - 2 * k));
        for (let j = 0; j <= CH; j++) { const c = (j / CH - 0.5) * chord; pos.push(r, c * Math.sin(tw), c * Math.cos(tw)); col.push(mix.r, mix.g, mix.b); }
      }
      for (let i = 0; i < SPAN; i++) for (let j = 0; j < CH; j++) { const a = i * (CH + 1) + j; idx.push(a, a + CH + 1, a + 1, a + 1, a + CH + 1, a + CH + 2); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      return geo;
    })();
    const PROP = new THREE.MeshStandardMaterial({ color: '#fff', vertexColors: true, roughness: 0.35, metalness: 0, side: THREE.DoubleSide });
    const RING = S(ACCENT.arx, 0.4, 0.3);
    const m = mount(THREE, scene, [0, 0, 0]);
    const props = [];
    for (const [x, z, dir] of [[35.4, 35.4, 1], [-35.4, -35.4, 1], [35.4, -35.4, -1], [-35.4, 35.4, -1]]) {
      const p = new THREE.Group();
      p.position.set(x, m.size.y - 2, z);
      p.add(new THREE.Mesh(blade, PROP));
      const b2 = new THREE.Mesh(blade, PROP); b2.rotation.y = Math.PI; p.add(b2);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.9, 8, 24), RING); ring.rotation.x = Math.PI / 2; p.add(ring);
      m.group.add(p);
      props.push({ p, dir });
    }
    m.setProps = ang => { for (const q of props) q.p.rotation.y = q.dir * ang; };
    return m;
  }

  async function load(THREE, THREEX) {
    const out = {};
    for (const [k, f] of Object.entries({ auraeyez, buggy, hxkeysair, corelink, arx })) out[k] = await f(THREE, THREEX);
    return out;
  }

  window.FILM_MODELS = { load, ACCENT };
})();
