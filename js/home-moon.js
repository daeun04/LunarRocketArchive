// 홈 화면 히어로: 천천히 도는 3D 달 + 착륙지 점 (미리보기)
// 전체 시뮬레이션은 landing.html. 여기선 휠 확대를 쓰지 않아 페이지 스크롤을 막지 않음.
import * as THREE from 'three';

const TEX = 'img/textures/';
const REDUCE_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hero = document.querySelector('.moon-hero');
const link = hero.querySelector('.hero-moon');
const box = document.getElementById('hero-canvas');
const readout = hero.querySelector('.hero-readout');
const DEFAULT_READOUT = readout.textContent;

// '로켓 아카이브 ↓': 주소에 #을 남기지 않고 카드 영역으로 스크롤 (sidebar.js의 #해시 보기와 겹치지 않게)
hero.querySelector('[data-scroll]')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('archive').scrollIntoView({ behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
});

// ===== 통계 (data/landings.json) =====
const dataReady = fetch('data/landings.json')
  .then((r) => r.json())
  .then((data) => {
    const L = data.landings;
    const set = (k, v) => hero.querySelectorAll(`[data-stat="${k}"]`).forEach((el) => { el.textContent = v; });
    set('all', L.length);
    set('success', L.filter((m) => m.outcome === 'success').length);
    set('countries', new Set(L.map((m) => m.country)).size);
    set('far', L.filter((m) => Math.abs(m.lon) > 90).length);
    return data;
  })
  .catch(() => null);

// ===== 3D =====
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch {
  hero.classList.add('no-webgl');
}

if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  box.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0.15, 4.4);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0x8899bb, 0.25));
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(-3, 1.6, 2.4);   // 왼쪽 위 앞에서 → 오른쪽 가장자리에 그늘
  scene.add(sun);

  // 기울기(고정) 안에서 자전 → 남북이 흔들리지 않음
  const tilt = new THREE.Group();
  tilt.rotation.x = 0.12;
  scene.add(tilt);
  const spin = new THREE.Group();
  spin.rotation.y = -Math.PI / 2 + 0.35;   // 앞면(경도 0°)이 카메라 쪽, 살짝 동쪽부터
  tilt.add(spin);

  const loader = new THREE.TextureLoader();
  const color = loader.load(TEX + 'moon_color_2k.jpg', () => hero.classList.add('is-loaded'));
  color.colorSpace = THREE.SRGBColorSpace;
  color.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const mat = new THREE.MeshStandardMaterial({ map: color, roughness: 1, metalness: 0 });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), mat);
  spin.add(moon);

  // 노멀 맵(4MB)은 첫 화면이 뜬 뒤에 받음. 받아 두면 시뮬레이션 페이지에서도 캐시로 빨리 열림
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
  idle(() => loader.load(TEX + 'moon_normal_2k.png', (t) => {
    mat.normalMap = t;
    mat.needsUpdate = true;
  }));

  // 가장자리 청록 빛 (사이버펑크 톤)
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(1.06, 64, 48),
    new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vN; varying vec3 vV;
        void main() {
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vN; varying vec3 vV;
        void main() {
          float f = pow(1.0 - max(dot(vN, vV), 0.0), 4.0);
          gl_FragColor = vec4(0.0, 1.0, 0.8, 1.0) * f * 0.55;
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  ));

  // 장식용 궤도 고리 + 도는 점
  const orbit = new THREE.Group();
  orbit.rotation.set(1.25, 0, 0.35);
  scene.add(orbit);
  const ringPts = new THREE.EllipseCurve(0, 0, 1.55, 1.55).getSpacedPoints(160).map((p) => new THREE.Vector3(p.x, p.y, 0));
  orbit.add(new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(ringPts),
    new THREE.LineDashedMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.35, dashSize: 0.05, gapSize: 0.05 }),
  ).computeLineDistances());
  const sat = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff007f }));
  orbit.add(sat);

  // ===== 착륙지 점 =====
  const latLon = (lat, lon, r) => {
    const la = THREE.MathUtils.degToRad(lat);
    const lo = THREE.MathUtils.degToRad(lon);
    return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo));
  };
  const Z = new THREE.Vector3(0, 0, 1);
  const dotGeo = new THREE.CircleGeometry(0.022, 20);
  const haloGeo = new THREE.RingGeometry(0.03, 0.04, 24);
  const hits = [];
  dataReady.then((data) => {
    if (!data) return;
    for (const m of data.landings) {
      const c = data.countries[m.country]?.color || '#00ffcc';
      const p = latLon(m.lat, m.lon, 1.003);
      const g = new THREE.Group();
      g.position.copy(p);
      g.quaternion.setFromUnitVectors(Z, p.clone().normalize());
      g.add(new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: c, toneMapped: false })));
      const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, toneMapped: false }));
      halo.userData.halo = true;
      g.add(halo);
      const hit = new THREE.Mesh(new THREE.CircleGeometry(0.06, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.userData.m = m;
      g.add(hit);
      spin.add(g);
      hits.push(hit);
    }
  });

  // ===== 마우스: 드래그로 돌리기, 점 위에 올리면 이름, 클릭하면 그 착륙지로 =====
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered = null;
  let drag = null;
  let dragged = false;
  let offset = 0;        // 드래그로 더한 회전
  let velocity = 0;

  function pickAt(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects([moon, ...hits], false)[0];
    return hit?.object.userData.m || null;
  }
  // <a> 안이라 그냥 두면 드래그할 때 브라우저가 링크 자체를 끌어 버림
  link.addEventListener('dragstart', (e) => e.preventDefault());
  box.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;   // 터치는 페이지 스크롤을 위해 그대로 둠
    drag = { x: e.clientX };
    dragged = false;
  });
  window.addEventListener('pointerup', () => { drag = null; });
  box.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x;
      drag.x = e.clientX;
      if (Math.abs(dx) > 0) dragged = true;
      velocity = dx * 0.006;
      offset += velocity;
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const m = pickAt(e);
    if (m !== hovered) {
      hovered = m;
      readout.textContent = m ? `▸ ${m.name} · ${m.date.slice(0, 4)} · ${m.country}` : DEFAULT_READOUT;
      link.classList.toggle('is-pointing', !!m);
    }
  });
  box.addEventListener('pointerleave', () => {
    hovered = null;
    readout.textContent = DEFAULT_READOUT;
    link.classList.remove('is-pointing');
  });
  // 링크(<a>) 안의 캔버스: 드래그 후 놓을 때는 이동하지 않고, 점을 눌렀으면 그 착륙지로 바로
  link.addEventListener('click', (e) => {
    if (dragged) {
      e.preventDefault();
      dragged = false;
      return;
    }
    if (hovered) link.href = `landing.html#${hovered.id}`;
  });

  // ===== 크기 · 렌더 루프 (화면에 보일 때만) =====
  function resize() {
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(box);
  resize();

  const clock = new THREE.Clock();
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    if (!drag) {
      velocity *= 0.92;            // 놓은 뒤 관성
      offset += velocity;
      if (!REDUCE_MOTION && !hovered) offset += dt * 0.08;
    }
    spin.rotation.y = -Math.PI / 2 + 0.35 + offset;
    if (!REDUCE_MOTION) {
      const a = t * 0.5;
      sat.position.set(Math.cos(a) * 1.55, Math.sin(a) * 1.55, 0);
      const pulse = 1 + (Math.sin(t * 3) * 0.5 + 0.5) * 0.6;
      spin.traverse((o) => { if (o.userData.halo) o.scale.setScalar(pulse); });
    }
    renderer.render(scene, camera);
  }
  new IntersectionObserver(([entry]) => {
    renderer.setAnimationLoop(entry.isIntersecting ? tick : null);
    clock.getDelta();
  }).observe(box);
}
