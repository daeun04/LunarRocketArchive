// 달 착륙지 3D 시뮬레이션 (landing.html)
// 지구–달 시스템 장면 → 달 클릭 시 줌인 → 착륙지 마커.
// 미션 목록이 리모컨 역할: 목록을 누르면 카메라가 착륙지로 이동하고 정보 패널을 띄움.
// 데이터: data/landings.json / 텍스처: img/textures (NASA SVS CGI Moon Kit, NASA Blue Marble Next Generation)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ===== 장면 크기 (실제 비율 아님: 달 반지름 = 1) =====
const MOON_R = 1;
const EARTH_R = 3.67;                          // 지구/달 반지름 비율은 실제와 같게
const EARTH_POS = new THREE.Vector3(0, 0, 0);
const MOON_POS = new THREE.Vector3(30, 0, 0);  // 실제(약 221)보다 훨씬 가깝게 축소
const TO_MOON = MOON_POS.clone().sub(EARTH_POS).normalize();
const SYSTEM_TARGET = new THREE.Vector3(15, 0, 0);
const MOON_VIEW_DIST = 3.4;                    // 달 중심에서 카메라까지
const MARKER_SIZE = 0.055;
const TEX = 'img/textures/';
const REDUCE_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

const OUTCOME_TEXT = { success: '성공', partial: '부분 성공', fail: '실패' };

// ===== DOM =====
const $ = (id) => document.getElementById(id);
const container = $('sim-canvas');
const loadingEl = $('sim-loading');
const listEl = $('mission-list');
const infoEl = $('sim-info');
const hintEl = $('stage-hint');
const viewLabel = $('view-label');
const yearRange = $('year-range');
const yearOut = $('year-out');
const playBtn = $('play-btn');
const viewBtns = document.querySelectorAll('[data-view]');

function showError(msg) {
  loadingEl.classList.remove('is-done');
  loadingEl.classList.add('is-error');
  loadingEl.textContent = msg;
}

// ===== 렌더러 =====
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  showError('이 브라우저에서 WebGL을 사용할 수 없습니다.');
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
Object.assign(labelRenderer.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
container.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 3000);
camera.position.set(8, 16, 38);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 0.8;
controls.target.copy(SYSTEM_TARGET);
controls.minDistance = 8;
controls.maxDistance = 120;

// ===== 조명: 카메라를 따라다니는 비스듬한 빛 (앞면·뒷면 어디를 봐도 지형 굴곡이 보이도록) =====
scene.add(new THREE.HemisphereLight(0x8899bb, 0x0a0a14, 0.35));
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
scene.add(sun, sun.target);

// ===== 우주 배경: 사진과 맨눈의 중간 =====
// 옅은 은하수(NASA SVS Deep Star Maps 2020) + 실제 등급 분포의 별 + 노출 연출.
// 진하기는 아래 상수 4개로 조정
const SKY = {
  MILKY: 0.22,       // 은하수 진하기 (0 = 없음, 0.55 = 진함)
  STARS: 1500,       // 별 개수
  STAR_GAIN: 0.75,   // 별 밝기 배율
  MIN_EXPOSURE: 0.35 // 달을 크게 확대했을 때 남는 밝기 (0 = 별·은하수 모두 사라짐)
};
const sky = new THREE.Group();   // 매 프레임 카메라 위치로 옮김 → 무한히 먼 하늘
scene.add(sky);
const SKY_R = 1500;
const milkyMat = new THREE.MeshBasicMaterial({
  side: THREE.BackSide, depthWrite: false, toneMapped: false, transparent: true, opacity: 0,
});
const milky = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 64, 32), milkyMat);
milky.scale.x = -1;               // 안쪽에서 볼 때 좌우가 뒤집히지 않게
milky.renderOrder = -2;
sky.add(milky);

const starMat = new THREE.ShaderMaterial({
  uniforms: { uExposure: { value: 1 }, uPixelRatio: { value: renderer.getPixelRatio() } },
  vertexShader: `
    attribute float aSize; attribute float aBright; attribute vec3 aColor;
    uniform float uExposure; uniform float uPixelRatio;
    varying vec3 vColor; varying float vAlpha;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uPixelRatio;
      vColor = aColor;
      vAlpha = aBright * uExposure;
    }`,
  fragmentShader: `
    varying vec3 vColor; varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5) * 2.0;
      float a = pow(clamp(1.0 - d, 0.0, 1.0), 1.4) * vAlpha;
      if (a < 0.004) discard;
      gl_FragColor = vec4(vColor, a);
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const STAR_COLORS = [   // [비율, 색] 대부분 흰색, 약간의 푸른·노란 별
  [0.18, new THREE.Color('#cfdcff')],
  [0.52, new THREE.Color('#ffffff')],
  [0.20, new THREE.Color('#fff0dc')],
  [0.10, new THREE.Color('#ffd7b0')],
];
function pickStarColor() {
  let r = Math.random();
  for (const [p, c] of STAR_COLORS) { if ((r -= p) <= 0) return c; }
  return STAR_COLORS[1][1];
}

// density(u, v): 0~1 은하수 밝기 (null이면 고르게)
function buildStars(density) {
  const M_MIN = -1.5;
  const M_MAX = 5.5;
  const K = Math.pow(10, 0.5 * (M_MAX - M_MIN)) - 1;
  const pos = [];
  const size = [];
  const bright = [];
  const col = [];
  while (bright.length < SKY.STARS) {
    // 등급: 한 등급 어두워질 때마다 별이 약 3배 많아지는 실제 분포
    const m = M_MIN + 2 * Math.log10(1 + Math.random() * K);
    const u = Math.random();
    const cosT = Math.random() * 2 - 1;
    const v = 1 - Math.acos(cosT) / Math.PI;
    // 희미한 별은 은하수 쪽에 살짝 더 많게
    if (density && m > 3 && Math.random() > 0.45 + 0.55 * density(u, v)) continue;
    const phi = u * Math.PI * 2;
    const sinT = Math.sqrt(1 - cosT * cosT);
    // 은하수 구(scale.x = -1)와 같은 방향
    pos.push(Math.cos(phi) * sinT * SKY_R * 0.9, cosT * SKY_R * 0.9, Math.sin(phi) * sinT * SKY_R * 0.9);
    const lf = (M_MAX - m) / (M_MAX - M_MIN);               // 0(가장 희미) ~ 1(가장 밝음)
    size.push(1.4 + 2.0 * lf * lf);
    bright.push(Math.min(1, (0.1 + 0.9 * Math.pow(lf, 1.8)) * SKY.STAR_GAIN));
    const c = pickStarColor();
    col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  g.setAttribute('aBright', new THREE.Float32BufferAttribute(bright, 1));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  const stars = new THREE.Points(g, starMat);
  stars.renderOrder = -1;
  stars.frustumCulled = false;
  sky.add(stars);
}

new THREE.TextureLoader().load(
  TEX + 'sky_milkyway_4k.jpg',
  (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    milkyMat.map = t;
    milkyMat.needsUpdate = true;
    // 은하수 밝기를 작은 캔버스로 읽어 별 밀도로 사용
    const w = 512;
    const h = 256;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(t.image, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    let max = 1;
    for (let i = 0; i < px.length; i += 4) max = Math.max(max, px[i] + px[i + 1] + px[i + 2]);
    buildStars((u, v) => {
      const x = Math.min(w - 1, Math.floor(u * w));
      const y = Math.min(h - 1, Math.floor((1 - v) * h));
      const i = (y * w + x) * 4;
      return Math.min(1, ((px[i] + px[i + 1] + px[i + 2]) / max) * 2.2);
    });
  },
  undefined,
  () => buildStars(null),   // 은하수 파일이 없으면 별만 고르게
);

// 화면에서 천체가 차지하는 비율(대략) → 노출
let exposure = 1;
function coverage(center, radius) {
  const d = camera.position.distanceTo(center);
  if (d <= radius) return 1;
  const ang = Math.asin(radius / d);
  return Math.min(1, (ang / THREE.MathUtils.degToRad(camera.fov / 2)) ** 2);
}
function updateSky(dt) {
  sky.position.copy(camera.position);
  const cov = Math.max(coverage(MOON_POS, MOON_R), coverage(EARTH_POS, EARTH_R));
  const target = 1 - (1 - SKY.MIN_EXPOSURE) * THREE.MathUtils.smoothstep(cov, 0.03, 0.5);
  exposure += (target - exposure) * Math.min(1, dt * 2.5);   // 서서히 바뀜
  starMat.uniforms.uExposure.value = exposure;
  milkyMat.opacity = SKY.MILKY * exposure;
}

// ===== 텍스처 =====
const manager = new THREE.LoadingManager();
const pctEl = $('load-pct');
manager.onProgress = (_url, loaded, total) => { pctEl.textContent = `${Math.round((loaded / total) * 100)}%`; };
manager.onLoad = () => loadingEl.classList.add('is-done');
manager.onError = (url) => showError(`텍스처를 불러오지 못했습니다: ${url}`);
const loader = new THREE.TextureLoader(manager);
const maxAniso = renderer.capabilities.getMaxAnisotropy();

function colorTex(url, l = loader) {
  const t = l.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

// ===== 지구 =====
const earthTilt = new THREE.Group();
earthTilt.position.copy(EARTH_POS);
earthTilt.rotation.z = THREE.MathUtils.degToRad(23.4);
scene.add(earthTilt);
const earthMesh = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_R, 96, 64),
  new THREE.MeshStandardMaterial({
    map: colorTex(TEX + 'earth_bluemarble_4k.jpg'),        // NASA Blue Marble Next Generation
    roughnessMap: loader.load(TEX + 'earth_roughness_2k.jpg'), // 바다(어두움)=매끈 → 빛 반사, 육지=거침
    roughness: 1,
    metalness: 0,
  }),
);
earthTilt.add(earthMesh);

// 구름 층: 흰 구름/검은 하늘 지도를 투명도로 써서 지표 위에 살짝 띄움.
// 로딩 화면(manager)과 따로 받아서, 파일이 없어도 오류 없이 구름만 빠진 채로 동작
const cloudMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, roughness: 1, metalness: 0,
});
const clouds = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.01, 96, 64), cloudMat);
clouds.visible = false;
earthTilt.add(clouds);
new THREE.TextureLoader().load(
  TEX + 'earth_clouds_4k.jpg',
  (t) => {
    cloudMat.alphaMap = t;       // 밝을수록 진한 구름
    cloudMat.needsUpdate = true;
    clouds.visible = true;
  },
  undefined,
  () => console.info('구름 텍스처(img/textures/earth_clouds_4k.jpg)가 없어 구름 층 없이 표시합니다.'),
);
// 대기 빛: 가장자리만 밝게
earthTilt.add(new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_R * 1.04, 64, 48),
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
        float f = pow(1.0 - max(dot(vN, vV), 0.0), 3.0);
        gl_FragColor = vec4(0.3, 0.65, 1.0, 1.0) * f * 1.1;
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
));

// ===== 달 =====
// SphereGeometry의 UV 중앙(u = 0.5)이 경도 0°이고 로컬 +X 방향.
// 앞면(경도 0°)이 지구를 보도록 달을 Y축으로 180° 돌림 (지구는 달 기준 -X 쪽)
const moonPivot = new THREE.Group();
moonPivot.position.copy(MOON_POS);
moonPivot.rotation.y = Math.PI;
scene.add(moonPivot);
const moonMat = new THREE.MeshStandardMaterial({
  map: colorTex(TEX + 'moon_color_2k.jpg'),
  normalMap: loader.load(TEX + 'moon_normal_2k.png'),   // ldem_16_uint.tif 고도에서 미리 계산한 노멀 맵
  normalScale: new THREE.Vector2(1, 1),
  roughness: 1,
  metalness: 0,
});
const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 192, 128), moonMat);
moonPivot.add(moonMesh);
moonPivot.updateMatrixWorld(true);

// 줌인할 때 4k 색 텍스처로 교체 (한 번만)
let hiResLoaded = false;
function loadHiRes() {
  if (hiResLoaded || renderer.capabilities.maxTextureSize < 4096) return;
  hiResLoaded = true;
  // 로딩 화면 없이 뒤에서 받아 두었다가 다 받으면 교체
  new THREE.TextureLoader().load(TEX + 'moon_color_4k.webp', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    const old = moonMat.map;
    moonMat.map = t;
    moonMat.needsUpdate = true;
    old.dispose();
  });
}

// 위도·경도(도) → 달 로컬 좌표 (u = 0.5가 경도 0°인 SphereGeometry 기준)
function latLonToLocal(lat, lon, r = MOON_R) {
  const la = THREE.MathUtils.degToRad(lat);
  const lo = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    r * Math.cos(la) * Math.cos(lo),
    r * Math.sin(la),
    -r * Math.cos(la) * Math.sin(lo),
  );
}

// ===== 이름표 =====
function makeLabel(text, cls, color) {
  const wrap = document.createElement('div');
  const span = document.createElement('span');
  span.className = cls;
  span.textContent = text;
  if (color) span.style.setProperty('--c', color);
  wrap.appendChild(span);
  return new CSS2DObject(wrap);
}
const earthLabel = makeLabel('EARTH', 'body-label');
earthLabel.position.set(0, EARTH_R + 0.6, 0);
scene.add(earthLabel);
const moonLabel = makeLabel('MOON', 'body-label');
moonLabel.position.copy(MOON_POS).add(new THREE.Vector3(0, MOON_R + 0.5, 0));
scene.add(moonLabel);

// ===== 마커 아이콘 (흰색으로 그리고 국가 색을 곱함) =====
function iconTexture(kind) {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.strokeStyle = g.fillStyle = '#fff';
  const mid = s / 2;
  // 바깥 테두리
  g.globalAlpha = 0.55;
  g.lineWidth = 6;
  g.beginPath(); g.arc(mid, mid, 58, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 1;
  g.lineWidth = 11;
  if (kind === 'success') {
    g.beginPath(); g.arc(mid, mid, 38, 0, Math.PI * 2); g.fill();
  } else if (kind === 'partial') {
    g.beginPath(); g.arc(mid, mid, 34, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(mid, mid, 34, Math.PI / 2, Math.PI * 1.5); g.fill();
  } else {
    g.beginPath(); g.arc(mid, mid, 34, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(mid - 20, mid - 20); g.lineTo(mid + 20, mid + 20);
    g.moveTo(mid + 20, mid - 20); g.lineTo(mid - 20, mid + 20);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ICONS = { success: iconTexture('success'), partial: iconTexture('partial'), fail: iconTexture('fail') };
const markerGeo = new THREE.PlaneGeometry(1, 1);
const hitGeo = new THREE.CircleGeometry(0.85, 16);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });   // 보이지 않는 클릭 영역
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// 선택 표시: 지면에서 솟는 빛기둥 + 퍼지는 고리 (선택된 마커에 붙였다 뗐다 함)
const selectFx = new THREE.Group();
const beamMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 8, 1, true), beamMat);
beam.rotation.x = Math.PI / 2;
beam.position.z = 2.5;
const ringMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 48), ringMat);
ring.position.z = 0.25;   // 고리가 커져도 둥근 지면에 묻히지 않게 살짝 띄움
selectFx.add(beam, ring);

// ===== 상태 =====
let missions = [];
let countries = {};
let year = 2025;
const countryOn = new Set();
let selected = null;
let hovered = null;
let view = 'system';        // 'system' | 'moon'
let flight = null;          // 카메라 이동 애니메이션
let trip = null;            // 탐사선 비행 연출 { m, phase: 'frame' | 'cruise', t }
let showAllPaths = false;   // false = 선택한 미션의 궤적만
const TRIP_TIME = 3.2;      // 지구 → 달 비행 시간(초)
const TRAJ_POINTS = 200;

// 탐사선: 흰 점 + 국가 색 빛무리
const probe = new THREE.Group();
probe.add(new THREE.Mesh(
  new THREE.SphereGeometry(0.1, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xffffff }),
));
const probeGlowMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
probe.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), probeGlowMat));
probe.visible = false;
scene.add(probe);

// ===== 연출용 궤적: 지구 → (달 옆 경유) → 착륙지 =====
function buildTrajectory(m, i) {
  const S = m.posWorld;
  const n = m.normalWorld;
  const a = i * 2.39996;                                       // 황금각으로 미션마다 다른 방향
  const lateral = new THREE.Vector3(0, Math.cos(a), Math.sin(a));
  const spread = 2.2 + (i % 5) * 0.6;
  const D = MOON_POS.distanceTo(EARTH_POS);
  const pts = [
    EARTH_POS.clone().add(TO_MOON.clone().multiplyScalar(0.8).add(lateral.clone().multiplyScalar(0.6)).normalize().multiplyScalar(EARTH_R * 1.02)),
    EARTH_POS.clone().addScaledVector(TO_MOON, D * 0.3).addScaledVector(lateral, spread),
    EARTH_POS.clone().addScaledVector(TO_MOON, D * 0.72).addScaledVector(lateral, spread * 0.8),
  ];
  const facing = -n.dot(TO_MOON);                              // 1 = 지구 쪽(앞면), -1 = 뒷면
  if (facing < 0.3) {
    // 앞면이 아니면 달을 비켜 돌아가는 경유점 추가 (궤적이 달을 뚫지 않게)
    const side = n.clone().addScaledVector(TO_MOON, -n.dot(TO_MOON));
    if (side.lengthSq() < 1e-4) side.copy(lateral); else side.normalize();
    pts.push(MOON_POS.clone().addScaledVector(TO_MOON, -1.0).addScaledVector(side, 2.3));
    if (facing < -0.3) pts.push(MOON_POS.clone().addScaledVector(TO_MOON, 1.0).addScaledVector(side, 1.9));
  }
  pts.push(MOON_POS.clone().addScaledVector(n, 1.7), S.clone());
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  // getSpacedPoints: 길이 기준으로 고르게 → 비행 중 선이 탐사선 위치와 맞게 그려짐
  const geo = new THREE.BufferGeometry().setFromPoints(curve.getSpacedPoints(TRAJ_POINTS));
  const color = new THREE.Color(countries[m.country]?.color || '#00ffcc');
  const mat = m.outcome === 'fail'
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.3 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 });
  const line = new THREE.Line(geo, mat);
  if (m.outcome === 'fail') line.computeLineDistances();
  m.curve = curve;
  m.line = line;
  scene.add(line);
}

// ===== 마커 만들기 =====
function buildMarker(m, i) {
  const color = countries[m.country]?.color || '#00ffcc';
  const local = latLonToLocal(m.lat, m.lon, MOON_R * (1.002 + i * 0.00004)); // 겹치는 마커끼리 깜빡임 방지
  const normal = local.clone().normalize();
  const group = new THREE.Group();
  group.position.copy(local);
  group.quaternion.setFromUnitVectors(Z_AXIS, normal);
  const icon = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({
    map: ICONS[m.outcome] || ICONS.success, color, transparent: true, depthWrite: false, toneMapped: false,
  }));
  icon.renderOrder = 2;
  const hit = new THREE.Mesh(hitGeo, hitMat);
  hit.userData.mission = m;
  group.add(icon, hit);
  moonPivot.add(group);

  const label = makeLabel(m.name, 'site-label', color);
  label.visible = false;
  group.add(label);

  group.updateMatrixWorld(true);
  m.group = group;
  m.hit = hit;
  m.label = label;
  m.color = color;
  m.posWorld = moonPivot.localToWorld(latLonToLocal(m.lat, m.lon, MOON_R));
  m.normalWorld = m.posWorld.clone().sub(MOON_POS).normalize();
}

// ===== 미션 목록 =====
// 목록은 간단하게: 국가 색 점 · 짧은 이름 · (실패/부분만 꼬리표) · 'yy
// 슬라이더 연도 이후 미션과 꺼진 국가는 목록에서 숨김
const decades = [];   // { el, countEl, list: [m...] }
function buildList() {
  listEl.replaceChildren();
  decades.length = 0;
  let cur = null;
  for (const m of missions) {
    const d = Math.floor(m.year / 10) * 10;
    if (!cur || cur.d !== d) {
      const h = document.createElement('li');
      h.className = 'decade';
      const label = document.createElement('span');
      label.textContent = `${d}s`;
      const count = document.createElement('span');
      h.append(label, count);
      listEl.appendChild(h);
      cur = { d, el: h, countEl: count, list: [] };
      decades.push(cur);
    }
    cur.list.push(m);
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mission-btn';
    btn.dataset.id = m.id;
    btn.style.setProperty('--c', m.color);
    btn.title = `${m.name} · ${m.country} · ${OUTCOME_TEXT[m.outcome]}`;
    const dot = document.createElement('span');
    dot.className = 'm-dot';
    const name = document.createElement('span');
    name.className = 'm-name';
    name.textContent = m.name.replace(/\s*\(.*\)$/, '');   // '루나 17호 (루노호드 1)' → '루나 17호'
    btn.append(dot, name);
    if (m.outcome !== 'success') {
      const tag = document.createElement('span');
      tag.className = `m-tag tag-${m.outcome}`;
      tag.textContent = m.outcome === 'fail' ? '실패' : '부분';
      btn.append(tag);
    } else {
      btn.append(document.createElement('span'));            // 칸 맞춤용 빈 칸
    }
    const yr = document.createElement('span');
    yr.className = 'm-year';
    yr.textContent = `'${String(m.year).slice(2)}`;
    btn.append(yr);
    btn.addEventListener('click', () => select(m));
    li.appendChild(btn);
    listEl.appendChild(li);
    m.li = li;
    m.btn = btn;
  }
}

// ===== 국가 범례 (눌러서 켜고 끄기) =====
function buildLegend() {
  const box = $('country-legend');
  box.replaceChildren();
  const used = [...new Set(missions.map((m) => m.country))];
  for (const name of used) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'legend-chip';
    chip.setAttribute('aria-pressed', 'true');
    chip.style.setProperty('--c', countries[name]?.color || '#00ffcc');
    const dot = document.createElement('span');
    dot.className = 'dot';
    chip.append(dot, name);
    chip.addEventListener('click', () => {
      if (countryOn.has(name)) countryOn.delete(name); else countryOn.add(name);
      chip.setAttribute('aria-pressed', String(countryOn.has(name)));
      applyFilters();
    });
    box.appendChild(chip);
    countryOn.add(name);
  }
}

const isShown = (m) => m.year <= year && countryOn.has(m.country);

// 연도·국가 조건을 마커·궤적·목록에 반영
function applyFilters() {
  yearOut.textContent = year;
  yearRange.value = year;
  if (selected && !isShown(selected)) deselect();
  const count = { success: 0, partial: 0, fail: 0 };
  let shown = 0;
  for (const m of missions) {
    const on = isShown(m);
    m.group.visible = on;
    m.li.hidden = !on;
    if (on) { shown++; count[m.outcome]++; }
  }
  for (const d of decades) {
    const n = d.list.filter(isShown).length;
    d.el.hidden = n === 0;
    d.countEl.textContent = n;
  }
  updateTrajectories();
  $('st-all').textContent = shown;
  $('st-success').textContent = count.success;
  $('st-partial').textContent = count.partial;
  $('st-fail').textContent = count.fail;
  document.querySelector('.list-count').textContent = `${shown} / ${missions.length}`;
  // 타임라인: 슬라이더 채움 + 이후 연도 막대 흐리게
  const min = Number(yearRange.min);
  const max = Number(yearRange.max);
  yearRange.style.setProperty('--p', `${((year - min) / Math.max(1, max - min)) * 100}%`);
  histBars.forEach((b, y) => b.classList.toggle('is-future', y > year));
}

// ===== 타임라인 막대: 연도별 착륙 시도 수 (아래부터 성공·부분·실패) =====
const histBars = new Map();
function buildTimeline(min, max) {
  const hist = $('year-hist');
  const ticks = $('year-ticks');
  hist.replaceChildren();
  ticks.replaceChildren();
  histBars.clear();
  const pos = (y) => `${((y - min) / (max - min)) * 100}%`;
  const span = max - min + 1;
  const byYear = new Map();
  for (const m of missions) {
    if (!byYear.has(m.year)) byYear.set(m.year, []);
    byYear.get(m.year).push(m);
  }
  for (const [y, list] of byYear) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hist-bar';
    b.style.left = pos(y);
    b.style.width = `max(4px, calc(100% / ${span} - 2px))`;
    const c = { success: 0, partial: 0, fail: 0 };
    list.forEach((m) => c[m.outcome]++);
    for (const [k, cls] of [['success', 's'], ['partial', 'p'], ['fail', 'f']]) {
      for (let i = 0; i < c[k]; i++) {
        const seg = document.createElement('i');
        seg.className = cls;
        b.appendChild(seg);
      }
    }
    const label = `${y}년 · 착륙 시도 ${list.length}건 (${list.map((m) => m.name.replace(/\s*\(.*\)$/, '')).join(', ')})`;
    b.title = label;
    b.setAttribute('aria-label', `${label}. 누르면 ${y}년까지 표시`);
    b.addEventListener('click', () => {
      stopPlay();
      year = y;
      applyFilters();
    });
    hist.appendChild(b);
    histBars.set(y, b);
  }
  // 가장 긴 빈 구간(1977–2012) 표시
  const ys = [...byYear.keys()].sort((a, b) => a - b);
  let gap = [0, 0];
  for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > gap[1] - gap[0]) gap = [ys[i - 1], ys[i]];
  if (gap[1] - gap[0] > 8) {
    const g = document.createElement('span');
    g.className = 'hist-gap';
    g.style.left = pos((gap[0] + gap[1]) / 2);
    g.textContent = `${gap[0]} → ${gap[1]} 착륙 공백`;
    hist.appendChild(g);
  }
  for (let y = Math.ceil(min / 10) * 10; y <= max; y += 10) {
    const t = document.createElement('span');
    t.style.left = pos(y);
    t.textContent = y;
    ticks.appendChild(t);
  }
}

// 기본은 선택한 미션의 궤적만. '모든 궤적'을 켜면 지구–달 보기에서 나머지도 옅게
function updateTrajectories() {
  for (const m of missions) {
    const isSel = m === selected;
    // '모든 궤적'은 지구–달·달 확대 어느 화면에서든 켜짐 (선택한 궤적만 진하게)
    m.line.visible = isShown(m) && (isSel || showAllPaths);
    m.line.material.opacity = isSel ? 0.95 : (selected ? 0.3 : 0.55);
  }
}

const pathBtn = $('path-btn');
pathBtn.addEventListener('click', () => {
  showAllPaths = !showAllPaths;
  pathBtn.setAttribute('aria-pressed', String(showAllPaths));
  updateTrajectories();
});

// ===== 탐사선 비행 연출: 지구–달 화면으로 → 궤적을 따라 비행(선이 그려짐) → 착륙지로 확대 =====
function startTrip(m) {
  cancelTrip();
  trip = { m, phase: 'frame', t: 0 };
  const d = camera.position.distanceTo(SYSTEM_TARGET);
  const framed = view === 'system' && !flight && d > 20 && d < 90;
  enterSystemMode();
  if (!framed) flyTo(systemCamPos(), SYSTEM_TARGET, { duration: 1.2 });
  m.line.geometry.setDrawRange(0, 0);
  probeGlowMat.color.set(m.color);
  probe.position.copy(m.curve.getPointAt(0));
  probe.visible = true;
  viewLabel.textContent = `TRANSIT · ${m.nameEn.toUpperCase()}`;
  setViewButtons(null);
  hintEl.textContent = '목록에서 다시 누르면 건너뜁니다';
}

function cancelTrip() {
  if (!trip) return;
  trip.m.line.geometry.setDrawRange(0, Infinity);
  trip = null;
  probe.visible = false;
  hintEl.textContent = '달을 클릭하면 확대됩니다';
}

function stepTrip(dt) {
  if (trip.phase === 'frame') {
    if (flight) return;            // 카메라가 자리 잡을 때까지 대기
    trip.phase = 'cruise';
  }
  trip.t = Math.min(1, trip.t + dt / TRIP_TIME);
  const k = trip.t * trip.t * (3 - 2 * trip.t);   // 출발·도착에서 천천히
  const m = trip.m;
  probe.position.copy(m.curve.getPointAt(k));
  probe.scale.setScalar(Math.max(0.35, camera.position.distanceTo(probe.position) / 40));
  m.line.geometry.setDrawRange(0, Math.ceil(k * TRAJ_POINTS) + 1);
  if (trip.t >= 1) {
    cancelTrip();
    flyToSite(m);
  }
}

// ===== 정보 패널 =====
function fmtCoord(m) {
  const la = `${Math.abs(m.lat).toFixed(2)}°${m.lat >= 0 ? 'N' : 'S'}`;
  const lo = `${Math.abs(m.lon).toFixed(2)}°${m.lon >= 0 ? 'E' : 'W'}`;
  return `${m.approx ? '약 ' : ''}${la} ${lo}`;
}
function showInfo(m) {
  infoEl.style.setProperty('--c', m.color);
  $('info-side').textContent = Math.abs(m.lon) > 90 ? '뒷면 FAR SIDE' : '앞면 NEAR SIDE';
  $('info-name').textContent = m.name;
  $('info-en').textContent = m.nameEn;
  const oc = $('info-outcome');
  oc.textContent = OUTCOME_TEXT[m.outcome];
  oc.className = `outcome-${m.outcome}`;
  $('info-date').textContent = m.date.replaceAll('-', '.');
  $('info-country').textContent = `${m.country} (${countries[m.country]?.en || ''})`;
  $('info-agency').textContent = m.agency;
  $('info-site').textContent = m.site;
  $('info-coord').textContent = fmtCoord(m) + (m.approx ? ' (추정)' : '');
  const verdict = $('info-verdict');
  verdict.textContent = m.outcomeNote ? `판정 근거: ${m.outcomeNote}` : '';
  verdict.hidden = !m.outcomeNote;
  $('info-note').textContent = m.note;
  // 같은 자리에 겹쳐 있는 미션 (마커로는 하나만 눌리므로 여기서 바로 이동)
  const near = $('info-near');
  const btns = near.querySelector('.near-btns');
  btns.replaceChildren(...m.neighbors.map((n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'near-btn';
    b.style.setProperty('--c', n.color);
    b.textContent = `${n.name} · ${n.year}`;
    b.addEventListener('click', () => select(n, { trip: false }));
    return b;
  }));
  near.hidden = m.neighbors.length === 0;
  $('info-source').textContent = m.source;
  const link = $('info-link');
  if (m.detail) {
    link.href = m.detail;
    link.textContent = `관련 기록: ${m.detailLabel || '상세 페이지'} →`;
    link.hidden = false;
  } else {
    link.hidden = true;
  }
  infoEl.hidden = false;
}

// ===== 선택 =====
// trip: true면 탐사선 비행 연출 후 착륙지로, false면 바로 착륙지로
function select(m, { fly = true, trip: withTrip = true } = {}) {
  // 비행 중에 같은 미션을 다시 누르면 건너뛰기
  if (trip && trip.m === m) {
    cancelTrip();
    flyToSite(m);
    return;
  }
  // 슬라이더·국가 필터에 가려진 미션이면 보이도록 조건을 풀어 줌
  if (m.year > year) year = m.year;
  if (!countryOn.has(m.country)) {
    countryOn.add(m.country);
    document.querySelectorAll('.legend-chip').forEach((c) => {
      if (c.textContent === m.country) c.setAttribute('aria-pressed', 'true');
    });
  }
  selected = m;
  applyFilters();
  missions.forEach((x) => x.btn.removeAttribute('aria-current'));
  m.btn.setAttribute('aria-current', 'true');
  // 목록 안에서만 스크롤 (scrollIntoView는 페이지 전체까지 움직일 수 있어서)
  const lr = listEl.getBoundingClientRect();
  const br = m.btn.getBoundingClientRect();
  if (br.top < lr.top || br.bottom > lr.bottom) {
    listEl.scrollTo({ top: listEl.scrollTop + br.top - lr.top - lr.height / 2 + br.height / 2, behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
  }
  beamMat.color.set(m.color);
  ringMat.color.set(m.color);
  m.group.add(selectFx);
  showInfo(m);
  updateTrajectories();
  history.replaceState(null, '', `#${m.id}`);
  if (!fly) return;
  if (withTrip && !REDUCE_MOTION) {
    startTrip(m);
  } else {
    cancelTrip();
    flyToSite(m);
  }
}

function deselect() {
  if (!selected) return;
  cancelTrip();
  selected.btn.removeAttribute('aria-current');
  selectFx.removeFromParent();
  selected = null;
  infoEl.hidden = true;
  updateTrajectories();
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

// ===== 카메라 이동 =====
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// around: 이 점을 중심으로 돌아서 이동 (달을 뚫고 지나가지 않게)
function flyTo(pos, target, { around = null, duration = 1.4 } = {}) {
  flight = {
    fromPos: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toPos: pos.clone(),
    toTarget: target.clone(),
    around,
    t: 0,
    duration: REDUCE_MOTION ? 0.001 : duration,
  };
  controls.enabled = false;
}

function stepFlight(dt) {
  const f = flight;
  f.t = Math.min(1, f.t + dt / f.duration);
  const k = ease(f.t);
  if (f.around) {
    const a = f.fromPos.clone().sub(f.around);
    const b = f.toPos.clone().sub(f.around);
    const q = new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());
    const qk = new THREE.Quaternion().slerp(q, k);
    const len = THREE.MathUtils.lerp(a.length(), b.length(), k);
    camera.position.copy(f.around).add(a.normalize().applyQuaternion(qk).multiplyScalar(len));
  } else {
    camera.position.lerpVectors(f.fromPos, f.toPos, k);
  }
  controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
  camera.lookAt(controls.target);
  if (f.t >= 1) {
    flight = null;
    controls.enabled = true;
    controls.update();
  }
}

function setViewButtons(name) {
  viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
}

function enterMoonMode() {
  const wasSystem = view === 'system';
  view = 'moon';
  controls.minDistance = MOON_R * 1.12;
  controls.maxDistance = 9;
  hintEl.hidden = true;
  moonLabel.visible = false;
  earthLabel.visible = false;
  loadHiRes();
  updateTrajectories();
  return wasSystem;
}

// 달 중심에서 dir 방향으로 카메라 이동
function flyToMoon(dir, dist = MOON_VIEW_DIST) {
  const wasSystem = enterMoonMode();
  const pos = MOON_POS.clone().addScaledVector(dir.clone().normalize(), dist);
  // 달 중심을 축으로 호를 그리며 이동 → 뒷면으로 갈 때도 달을 뚫지 않음
  flyTo(pos, MOON_POS, { around: MOON_POS, duration: wasSystem ? 1.8 : 1.3 });
}

function flyToSite(m) {
  const d = view === 'moon' ? THREE.MathUtils.clamp(camera.position.distanceTo(MOON_POS), 2.4, MOON_VIEW_DIST) : MOON_VIEW_DIST - 0.6;
  flyToMoon(m.normalWorld, d);
  viewLabel.textContent = `MOON · ${m.nameEn.toUpperCase()}`;
  setViewButtons(null);
}

function showNear() {
  flyToMoon(TO_MOON.clone().negate().add(new THREE.Vector3(0, 0.15, 0)));
  viewLabel.textContent = 'MOON · NEAR SIDE';
  setViewButtons('near');
}
function showFar() {
  flyToMoon(TO_MOON.clone().add(new THREE.Vector3(0, 0.15, 0)));
  viewLabel.textContent = 'MOON · FAR SIDE';
  setViewButtons('far');
}
function systemCamPos() {
  // 세로로 좁은 화면에선 더 멀리서 봐야 지구·달이 다 들어옴
  const k = camera.aspect < 1 ? Math.min(2.2, 1 / camera.aspect) : 1;
  return SYSTEM_TARGET.clone().add(new THREE.Vector3(-7, 16, 38).multiplyScalar(k));
}
function enterSystemMode() {
  view = 'system';
  controls.minDistance = 8;
  controls.maxDistance = 120;
  hintEl.hidden = false;
  moonLabel.visible = true;
  earthLabel.visible = true;
  updateTrajectories();
}
function showSystem() {
  enterSystemMode();
  flyTo(systemCamPos(), SYSTEM_TARGET, { duration: 1.6 });
  viewLabel.textContent = 'EARTH–MOON';
  setViewButtons('system');
}

viewBtns.forEach((b) => b.addEventListener('click', () => {
  cancelTrip();
  if (b.dataset.view === 'system') showSystem();
  else if (b.dataset.view === 'near') showNear();
  else showFar();
}));

// ===== 클릭·호버 (Raycaster) =====
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const targets = [earthMesh, moonMesh];
  for (const m of missions) if (m.group.visible) targets.push(m.hit);
  return raycaster.intersectObjects(targets, false);
}

// 클릭한 자리에 겹쳐 있는 마커들 (앞에서부터, 달 표면에 닿기 전까지)
function stackAt(hits) {
  const stack = [];
  for (const h of hits) {
    const m = h.object.userData.mission;
    if (!m) break;
    if (!stack.includes(m)) stack.push(m);
  }
  return stack;
}

let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 500;
  down = null;
  if (moved > 6 || !quick || flight) return;   // 드래그(회전)는 클릭으로 치지 않음
  const hits = pick(e);
  if (!hits.length) return;
  const stack = stackAt(hits);
  if (stack.length) {
    // 겹친 마커: 이미 선택된 것을 다시 누르면 그 아래 다음 미션으로
    const i = stack.indexOf(selected);
    const m = i >= 0 ? stack[(i + 1) % stack.length] : stack[0];
    if (m === selected) return;
    // 달 확대 화면에서 마커를 누르면 비행 연출 없이 바로 이동
    select(m, { trip: view === 'system' });
    return;
  }
  const hit = hits[0];
  if (hit.object === moonMesh && view === 'system') {
    cancelTrip();
    // 누른 지점이 화면 가운데 오도록 줌인
    flyToMoon(hit.point.clone().sub(MOON_POS));
    viewLabel.textContent = 'MOON';
    setViewButtons(null);
  } else if (hit.object === earthMesh && view === 'moon') {
    showSystem();
  }
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' || e.buttons) return;
  const hit = pick(e)[0];
  const m = hit?.object.userData.mission || null;
  hovered = m;
  const clickable = !!m || (hit && hit.object === moonMesh && view === 'system') || (hit && hit.object === earthMesh && view === 'moon');
  container.classList.toggle('is-hover', !!clickable);
});
renderer.domElement.addEventListener('pointerleave', () => {
  hovered = null;
  container.classList.remove('is-hover');
});

infoEl.querySelector('.info-close').addEventListener('click', deselect);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') deselect();
});

// ===== 연도 슬라이더 · 재생 =====
let playTimer = null;
function stopPlay() {
  clearInterval(playTimer);
  playTimer = null;
  playBtn.textContent = '▶';
  playBtn.setAttribute('aria-label', '연도 재생');
}
yearRange.addEventListener('input', () => {
  stopPlay();
  year = Number(yearRange.value);
  applyFilters();
});
playBtn.addEventListener('click', () => {
  if (playTimer) { stopPlay(); return; }
  const min = Number(yearRange.min);
  const max = Number(yearRange.max);
  if (year >= max) year = min;
  applyFilters();
  playBtn.textContent = '❚❚';
  playBtn.setAttribute('aria-label', '재생 멈춤');
  playTimer = setInterval(() => {
    year++;
    applyFilters();
    if (year >= max) stopPlay();
  }, 350);
});

// ===== 크기 맞추기 =====
function resize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(container);
resize();
camera.position.copy(systemCamPos());
controls.update();
setViewButtons('system');

// ===== 매 프레임 =====
const clock = new THREE.Clock();
const camRight = new THREE.Vector3();
const camUp = new THREE.Vector3();
const camBack = new THREE.Vector3();
const tmp = new THREE.Vector3();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const time = clock.elapsedTime;
  if (flight) stepFlight(dt); else controls.update();

  // 빛: 보는 사람 기준 왼쪽 위에서 비스듬히
  camRight.setFromMatrixColumn(camera.matrixWorld, 0);
  camUp.setFromMatrixColumn(camera.matrixWorld, 1);
  camBack.setFromMatrixColumn(camera.matrixWorld, 2);
  sun.target.position.copy(controls.target);
  sun.position.copy(camBack).multiplyScalar(0.7)
    .addScaledVector(camRight, -0.9)
    .addScaledVector(camUp, 0.6)
    .normalize().multiplyScalar(50)
    .add(controls.target);

  // near 평면을 가장 가까운 천체 표면까지 거리에 맞춤.
  // 고정값(0.01)이면 멀리서 볼 때 깊이 정밀도가 모자라 표면 바로 위 마커가 깜빡임
  const surfaceDist = Math.min(
    camera.position.distanceTo(MOON_POS) - MOON_R,
    camera.position.distanceTo(EARTH_POS) - EARTH_R * 1.04,
  );
  const near = THREE.MathUtils.clamp(surfaceDist * 0.25, 0.005, 2);
  if (Math.abs(near - camera.near) > camera.near * 0.05) {
    camera.near = near;
    camera.updateProjectionMatrix();
  }

  if (!REDUCE_MOTION) {
    earthMesh.rotation.y += dt * 0.05;
    clouds.rotation.y += dt * 0.062;   // 구름은 지표보다 조금 빨리 흘러감
  }

  // 마커 크기: 카메라가 멀어지면 커져서 지구–달 보기에서도 점이 보이게
  const camDist = camera.position.distanceTo(MOON_POS);
  const s = MARKER_SIZE * THREE.MathUtils.clamp((camDist - MOON_R) / 2.2, 0.22, 2.2);
  for (const m of missions) {
    if (!m.group.visible) { m.label.visible = false; continue; }   // CSS2D 이름표는 부모가 숨어도 따로 꺼야 함
    m.group.scale.setScalar(s);
    // 이름표: 호버·선택된 것만, 카메라를 향한 면에 있을 때만
    const facing = tmp.copy(camera.position).sub(m.posWorld).dot(m.normalWorld) > 0;
    m.label.visible = facing && (m === hovered || m === selected);
  }

  if (selected) {
    const p = 1 + ((time * 0.8) % 1) * 1.6;
    ring.scale.setScalar(p);
    ringMat.opacity = 0.9 * (1 - (p - 1) / 1.6);
  }
  if (trip) stepTrip(dt);

  updateSky(dt);
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
renderer.setAnimationLoop(tick);

// ===== 데이터 불러오기 =====
fetch('data/landings.json')
  .then((r) => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  })
  .then((data) => {
    countries = data.countries || {};
    missions = data.landings
      .map((m) => ({ ...m, year: Number(m.date.slice(0, 4)) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    missions.forEach(buildMarker);
    missions.forEach(buildTrajectory);
    // 1° 안쪽(약 30km)에 있는 미션끼리는 마커가 겹치므로 '같은 지점'으로 묶음
    const NEAR_COS = Math.cos(THREE.MathUtils.degToRad(1));
    missions.forEach((m) => {
      m.neighbors = missions.filter((n) => n !== m && n.normalWorld.dot(m.normalWorld) > NEAR_COS);
    });
    buildList();
    buildLegend();
    const years = missions.map((m) => m.year);
    yearRange.min = Math.min(...years);
    yearRange.max = Math.max(...years);
    year = Math.max(...years);
    buildTimeline(Math.min(...years), Math.max(...years));
    applyFilters();

    // landing.html#apollo-11 처럼 들어오면 바로 그 착륙지로
    const fromHash = missions.find((m) => `#${m.id}` === location.hash);
    if (fromHash) select(fromHash);
  })
  .catch(() => showError('data/landings.json을 불러오지 못했습니다. Go Live 같은 로컬 서버로 열어 주세요.'));
