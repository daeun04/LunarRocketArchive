// 상세 페이지(관제실 화면) 공통 동작
// 1) 패널이 화면에 들어오면 하나씩 켜짐 + 숫자 카운트업 (막대 차오름은 CSS)
// 2) 미션 상태줄의 UTC 시계
// 3) 대표 픽셀아트 모션 반복 재생
// 4) 달 착륙 지점 지도 그리기 (.moon[data-sites]가 있을 때)
// 5) 어려운 단어(.term)를 누르면 설명 창 (단어 설명은 js/glossary.js)

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ----- 1) 패널 부팅 + 숫자 카운트업 -----
// 숫자는 HTML에 최종값이 적혀 있고, 연출할 때만 0부터 올림
function countUp(el) {
  const to = Number(el.textContent);
  const decimals = (el.textContent.split('.')[1] || '').length; // 83.6처럼 소수점이 있으면 그 자리수 유지
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(Math.max((now - start) / 1200, 0), 1); // 첫 프레임 시각이 start보다 이를 수 있어 0 미만 방지
    el.textContent = (to * (1 - Math.pow(1 - p, 3))).toFixed(decimals); // 끝으로 갈수록 천천히
    if (p < 1) requestAnimationFrame(step);
  };
  el.textContent = '0';
  requestAnimationFrame(step);
}

function bootPanel(panel) {
  panel.classList.add('booted');
  panel.querySelectorAll('.count').forEach(countUp);
}

const panels = document.querySelectorAll('.panel');
if (!reduceMotion && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('can-boot');
  const panelObserver = new IntersectionObserver((entries) => {
    entries
      .filter((entry) => entry.isIntersecting)
      .forEach((entry, i) => {
        setTimeout(() => bootPanel(entry.target), i * 100); // 같이 보이는 패널은 0.1초 간격으로
        panelObserver.unobserve(entry.target);
      });
  }, { threshold: 0.15 });
  panels.forEach((panel) => panelObserver.observe(panel));
}

// ----- 2) UTC 시계 -----
const clock = document.querySelector('.clock');
if (clock) {
  const tick = () => { clock.textContent = 'UTC ' + new Date().toISOString().slice(11, 19); };
  tick();
  setInterval(tick, 1000);
}

// ----- 3) 대표 픽셀아트 반복 재생 -----
const heroArt = document.querySelector('.hero-frame');
const REPLAY_TIME = 7000; // 가장 긴 애니메이션(아폴로 미션, 약 6.3초)보다 조금 길게
if (heroArt && !reduceMotion) {
  heroArt.classList.add('is-playing');
  setInterval(() => {
    heroArt.classList.remove('is-playing');
    void heroArt.offsetWidth; // 클래스를 뺐다 다시 붙여 처음부터 재생
    heroArt.classList.add('is-playing');
  }, REPLAY_TIME);
}

// ----- 4) 달 착륙 지점 지도 -----
// data-sites: [["번호", 위도, 경도, 번호글자 x보정, y보정], ...]
// 달 앞면을 정면에서 본 모습(정사영)으로 위도·경도를 좌표로 바꿈
const moon = document.querySelector('.moon[data-sites]');
if (moon) {
  const NS = 'http://www.w3.org/2000/svg';
  const R = 92;
  const rad = Math.PI / 180;
  const make = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  };
  JSON.parse(moon.dataset.sites).forEach(([label, lat, lon, dx = 5, dy = -4]) => {
    const x = 100 + R * Math.cos(lat * rad) * Math.sin(lon * rad);
    const y = 100 - R * Math.sin(lat * rad);
    const text = make('text', { x: x + dx, y: y + dy, fill: '#fff', 'font-size': 9 });
    text.textContent = label;
    moon.append(
      make('circle', { cx: x, cy: y, r: 3, fill: 'none', stroke: '#ff007f', class: 'ping' }),
      make('circle', { cx: x, cy: y, r: 3, fill: '#ff007f' }),
      text,
    );
  });
}

// ----- 5) 어려운 단어 설명 창 -----
const isPhone = window.matchMedia('(max-width: 640px)');
let openPop = null;

function closeTerm() {
  if (!openPop) return;
  openPop.pop.remove();
  openPop.term.setAttribute('aria-expanded', 'false');
  openPop = null;
}

function openTerm(term) {
  const info = GLOSSARY[term.dataset.term];
  if (!info) return;
  const pop = document.createElement('div');
  pop.className = 'term-pop';
  pop.setAttribute('role', 'dialog');
  pop.innerHTML = `<b>${info.ko}<span class="en">${info.en}</span></b>${info.desc}`;
  // 페이지 맨 위층(body)에 띄움: 패널 안에 넣으면 기울어진 모니터나 스크롤 영역에 잘릴 수 있음
  document.body.append(pop);

  // PC: 단어 바로 아래에 띄움 (휴대폰은 CSS가 화면 아래 창으로 띄움)
  if (!isPhone.matches) {
    const t = term.getBoundingClientRect();
    pop.style.top = `${t.bottom + window.scrollY + 8}px`;
    pop.style.left = `${Math.max(12, Math.min(t.left, window.innerWidth - pop.offsetWidth - 12)) + window.scrollX}px`;
  }
  term.setAttribute('aria-expanded', 'true');
  openPop = { term, pop };
}

document.querySelectorAll('.term').forEach((term) => term.setAttribute('aria-expanded', 'false'));

document.addEventListener('click', (e) => {
  const term = e.target.closest('.term');
  if (term) {
    const same = openPop && openPop.term === term;
    closeTerm();
    if (!same) openTerm(term); // 같은 단어를 다시 누르면 닫기만
  } else if (!e.target.closest('.term-pop')) {
    closeTerm(); // 바깥을 누르면 닫힘
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeTerm();
});
