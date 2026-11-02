// 상세 페이지(관제실 화면) 공통 동작
// 1) 패널이 화면에 들어오면 하나씩 켜짐 + 숫자 카운트업 (막대 차오름은 CSS)
// 2) 미션 상태줄의 UTC 시계
// 3) 대표 픽셀아트: 처음 한 번 재생, 누르거나 마우스를 올리면 다시 재생
// 4) 달 착륙 지점 지도 그리기 (.moon[data-sites]가 있을 때)
// 5) 어려운 단어(.term)를 누르면 설명 창 (단어 설명은 js/glossary.js)
// 6) 기록 사진을 누르면 페이지 안에서 크게 보기 (원본 출처 링크는 그 안에)

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ----- 1) 패널 부팅 + 숫자 카운트업 -----
// 숫자는 HTML에 최종값이 적혀 있고, 연출할 때만 0부터 올림
// 406771 → 406,771 처럼 세 자리마다 쉼표 (소수점 자리수는 유지). 연도처럼 쉼표가 없어야 하면 data-plain
const formatNumber = (n, decimals, plain) =>
  plain ? n.toFixed(decimals)
        : n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

function countUp(el) {
  const raw = el.textContent.replace(/,/g, '');
  const to = Number(raw);
  const decimals = (raw.split('.')[1] || '').length; // 83.6처럼 소수점이 있으면 그 자리수 유지
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(Math.max((now - start) / 1200, 0), 1); // 첫 프레임 시각이 start보다 이를 수 있어 0 미만 방지
    el.textContent = formatNumber(to * (1 - Math.pow(1 - p, 3)), decimals, 'plain' in el.dataset); // 끝으로 갈수록 천천히
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

// ----- 3) 대표 픽셀아트: 페이지를 열 때 한 번 재생, 이후 누르거나 마우스를 올리면 다시 재생 -----
// (계속 반복하면 글을 읽는 동안 눈에 걸려서)
const heroArt = document.querySelector('.hero-frame');
const PLAY_TIME = 7000; // 가장 긴 애니메이션(아폴로 미션, 약 6.3초)이 끝날 시간
function playHero() {
  clearTimeout(heroArt.stopTimer);
  heroArt.classList.remove('is-playing');
  void heroArt.offsetWidth; // 클래스를 뺐다 다시 붙여 처음부터 재생
  heroArt.classList.add('is-playing');
  heroArt.stopTimer = setTimeout(() => heroArt.classList.remove('is-playing'), PLAY_TIME);
}
if (heroArt && !reduceMotion) {
  heroArt.setAttribute('role', 'button');
  heroArt.setAttribute('tabindex', '0');
  heroArt.setAttribute('aria-label', '애니메이션 다시 보기');
  heroArt.title = '누르면 다시 재생';
  playHero();
  heroArt.addEventListener('click', playHero);
  heroArt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playHero(); }
  });
  if (window.matchMedia('(hover: hover)').matches) {
    heroArt.addEventListener('mouseenter', () => {
      if (!heroArt.classList.contains('is-playing')) playHero();
    });
  }
}

// ----- 기록의 날짜·시각: 기계가 읽을 수 있는 datetime 속성을 달고, 시각이 있으면 한국 시간도 작게 표시 -----
// <time>1969.07.21 02:56</time> (UTC) → 옆에 "한국 07.21 11:56"
document.querySelectorAll('.timeline time').forEach((t) => {
  const m = t.textContent.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})(?: (\d{2}):(\d{2}))?$/);
  if (!m) return; // "2027 (예정)"처럼 연도만 있는 항목은 그대로
  const [, y, mo, d, hh, mm] = m;
  if (!hh) { t.setAttribute('datetime', `${y}-${mo}-${d}`); return; }
  t.setAttribute('datetime', `${y}-${mo}-${d}T${hh}:${mm}Z`);
  const kst = new Date(Date.UTC(+y, +mo - 1, +d, +hh + 9, +mm));
  const two = (n) => String(n).padStart(2, '0');
  const label = `${two(kst.getUTCMonth() + 1)}.${two(kst.getUTCDate())} ${two(kst.getUTCHours())}:${two(kst.getUTCMinutes())}`;
  const span = document.createElement('span');
  span.className = 'kst';
  span.textContent = `한국 ${label}`;
  t.append(span);
});

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

// ----- 6) 기록 사진 크게 보기 -----
// 사진을 누르면 화면 가운데에 크게 띄우고, 설명·출처와 위키미디어 원본 링크를 함께 보여줌.
// ← → 키나 양옆 버튼으로 같은 페이지의 다른 사진으로 넘기고, Esc·✕·바깥을 누르면 닫힘.
const photoLinks = [...document.querySelectorAll('.photo-fig a')];
if (photoLinks.length) {
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', '기록 사진 크게 보기');
  box.innerHTML = `
    <button type="button" class="lb-close" aria-label="닫기">✕</button>
    <button type="button" class="lb-prev" aria-label="이전 사진">◀</button>
    <figure class="lb-figure">
      <img class="lb-img" alt="">
      <figcaption class="lb-caption"></figcaption>
    </figure>
    <button type="button" class="lb-next" aria-label="다음 사진">▶</button>`;
  document.body.append(box);
  const img = box.querySelector('.lb-img');
  const caption = box.querySelector('.lb-caption');
  let index = 0;
  let opener = null;

  function show(i) {
    index = (i + photoLinks.length) % photoLinks.length;
    const link = photoLinks[index];
    const thumb = link.querySelector('img');
    const fig = link.closest('.photo-fig');
    const cap = fig.querySelector('.caption');
    const credit = cap.querySelector('.credit');
    img.src = thumb.src;
    img.alt = thumb.alt;
    caption.innerHTML = '';
    caption.append(
      document.createTextNode(thumb.alt),
      Object.assign(document.createElement('span'), { className: 'credit', textContent: credit ? credit.textContent : '' }),
      Object.assign(document.createElement('a'), {
        href: link.href, target: '_blank', rel: 'noopener', className: 'lb-source',
        textContent: `원본 보기 (위키미디어 공용) ↗  ·  ${index + 1} / ${photoLinks.length}`,
      }),
    );
  }
  function open(i) {
    opener = document.activeElement;
    show(i);
    box.hidden = false;
    document.body.style.overflow = 'hidden'; // 뒤 페이지가 스크롤되지 않게
    box.querySelector('.lb-close').focus();
  }
  function close() {
    box.hidden = true;
    document.body.style.overflow = '';
    if (opener) opener.focus();
  }

  photoLinks.forEach((link, i) => {
    link.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return; // 새 탭으로 열기는 그대로 허용
      e.preventDefault();
      open(i);
    });
  });
  box.querySelector('.lb-close').addEventListener('click', close);
  box.querySelector('.lb-prev').addEventListener('click', () => show(index - 1));
  box.querySelector('.lb-next').addEventListener('click', () => show(index + 1));
  box.addEventListener('click', (e) => { if (e.target === box) close(); }); // 바깥(어두운 부분) 누르면 닫힘
  document.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });
}
