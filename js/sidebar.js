// 분류 사이드바
// - 헤더 아래 왼쪽 위의 ☰ 버튼으로 열고, ✕ 버튼·바깥 영역·Esc 키로 닫음
// - 분류 제목(연도별 등)을 누르면 카드 전체를 그 기준으로 묶어서 보여줌
// - 하위 항목(1960년대 등)을 누르면 그 묶음만 보여줌
// 목록은 각 카드의 data-year / data-type / data-country 값으로 자동 생성되므로,
// 카드를 새로 추가할 때 이 세 값만 적어주면 됨.

const view = document.getElementById('archive-view');
const archiveCards = Array.from(view.querySelectorAll('.rocket-card')); // 처음 순서 기억
const sidebar = document.getElementById('archive-sidebar');
const toggleBtn = document.querySelector('.sidebar-toggle');
const closeBtn = sidebar.querySelector('.sidebar-close');
const backdrop = document.querySelector('.sidebar-backdrop');
const groupsNav = sidebar.querySelector('.sidebar-groups');
const viewBar = document.querySelector('.view-bar');
const viewLabel = viewBar.querySelector('.view-label');

const GROUPINGS = {
  decade:  { title: '연도별',   sub: 'BY YEAR',    groupOf: (card) => `${Math.floor(card.dataset.year / 10) * 10}년대` },
  type:    { title: '탐사선별', sub: 'BY CRAFT',   groupOf: (card) => card.dataset.type },
  country: { title: '국가별',   sub: 'BY COUNTRY', groupOf: (card) => card.dataset.country },
};

// 카드를 연도순으로 정렬한 뒤 묶음별로 나눔 (묶음 순서도 가장 이른 연도 순)
function groupCards(key) {
  const byYear = [...archiveCards].sort((a, b) => a.dataset.year - b.dataset.year);
  const groups = new Map();
  byYear.forEach((card) => {
    const name = GROUPINGS[key].groupOf(card);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(card);
  });
  return groups;
}

function makeGrid(list) {
  const grid = document.createElement('div');
  grid.className = 'rocket-grid';
  grid.append(...list);
  return grid;
}

function showAll() {
  view.replaceChildren(makeGrid(archiveCards));
  viewBar.hidden = true;
  markCurrent(sidebar.querySelector('.sidebar-all'));
}

function showGrouped(key, only) {
  view.replaceChildren();
  groupCards(key).forEach((list, name) => {
    if (only && name !== only) return;
    const section = document.createElement('section');
    section.className = 'rocket-group';
    const title = document.createElement('h3');
    title.className = 'group-title';
    title.innerHTML = `${name} <span class="group-count">${list.length}</span>`;
    section.append(title, makeGrid(list));
    view.append(section);
  });
  viewLabel.textContent = only
    ? `${GROUPINGS[key].title} › ${only}`
    : `${GROUPINGS[key].title} 보기`;
  viewBar.hidden = false;
  const selector = only
    ? `[data-group="${key}"][data-value="${only}"]`
    : `.sidebar-group-title[data-group="${key}"]`;
  markCurrent(sidebar.querySelector(selector));
}

function markCurrent(button) {
  sidebar.querySelectorAll('[aria-current]').forEach((b) => b.removeAttribute('aria-current'));
  if (button) button.setAttribute('aria-current', 'true');
}

// 사이드바 목록 만들기
Object.entries(GROUPINGS).forEach(([key, { title, sub }]) => {
  const section = document.createElement('section');
  section.className = 'sidebar-group';

  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'sidebar-group-title';
  head.dataset.group = key;
  head.innerHTML = `${title} <span class="sidebar-sub">${sub}</span>`;

  const list = document.createElement('ul');
  groupCards(key).forEach((items, name) => {
    const li = document.createElement('li');
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'sidebar-item';
    item.dataset.group = key;
    item.dataset.value = name;
    item.innerHTML = `<span>${name}</span><span class="sidebar-count">${items.length}</span>`;
    li.append(item);
    list.append(li);
  });

  section.append(head, list);
  groupsNav.append(section);
});
markCurrent(sidebar.querySelector('.sidebar-all'));

// 열기 / 닫기
function openSidebar() {
  sidebar.inert = false;
  sidebar.classList.add('is-open');
  backdrop.classList.add('is-open');
  toggleBtn.setAttribute('aria-expanded', 'true');
  closeBtn.focus();
}

function closeSidebar() {
  sidebar.classList.remove('is-open');
  backdrop.classList.remove('is-open');
  sidebar.inert = true;
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.focus();
}

toggleBtn.addEventListener('click', () => {
  if (sidebar.classList.contains('is-open')) closeSidebar();
  else openSidebar();
});
closeBtn.addEventListener('click', closeSidebar);
backdrop.addEventListener('click', closeSidebar);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sidebar.classList.contains('is-open')) closeSidebar();
});

// 분류 선택 → 카드 다시 배치하고 사이드바 닫기
sidebar.addEventListener('click', (e) => {
  const button = e.target.closest('[data-group]');
  if (!button) return;
  const { group, value } = button.dataset;
  if (group === 'all') showAll();
  else showGrouped(group, value);
  closeSidebar();
});

document.querySelector('.view-reset').addEventListener('click', showAll);
