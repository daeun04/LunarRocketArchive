// 카드 픽셀 애니메이션 재생과 상세 페이지 이동
// - 마우스가 있는 기기(PC): 마우스를 올리면 재생, 떼면 원래대로. 카드를 클릭하면 바로 상세 페이지로 이동
// - 터치 기기(모바일): 카드를 탭했을 때만 모션이 재생되면서 "자세히 보기" 버튼이 나타나고,
//   그 버튼을 누르면 상세 페이지로 이동
// 상세 페이지 주소는 각 카드의 data-detail 값 (비어 있으면 아직 준비 중으로 보고 이동하지 않음)

const cards = document.querySelectorAll('.rocket-card');
const canHover = window.matchMedia('(hover: hover)').matches;
const PLAY_TIME = 7000; // 가장 긴 애니메이션(아폴로 미션, 약 6.3초)이 끝날 시간

function play(card) {
  clearTimeout(card.stopTimer);
  card.classList.remove('is-playing');
  void card.offsetWidth; // 클래스를 뺐다 다시 붙여 애니메이션을 처음부터 재생
  card.classList.add('is-playing');
  // 계속 반복되는 효과(별 반짝임 등)가 끝없이 돌지 않도록 재생이 끝나면 멈춤
  card.stopTimer = setTimeout(() => card.classList.remove('is-playing'), PLAY_TIME);
}

function goToDetail(card) {
  const url = card.dataset.detail;
  if (url) window.location.href = url;
}

// 모바일에서 탭한 카드 하나만 "선택됨" 상태로 (다른 카드의 버튼은 숨김)
function select(card) {
  cards.forEach((c) => c.classList.toggle('is-selected', c === card));
}

if (canHover) {
  cards.forEach((card) => {
    card.addEventListener('mouseenter', () => card.classList.add('is-playing'));
    card.addEventListener('mouseleave', () => card.classList.remove('is-playing'));
    card.addEventListener('click', () => goToDetail(card));
  });
} else {
  cards.forEach((card) => {
    // 카드 오른쪽 위에 "자세히 보기" 버튼 추가 (선택된 카드에서만 보임)
    const button = document.createElement('a');
    button.className = 'detail-btn';
    button.textContent = '자세히 보기 ›';
    button.href = card.dataset.detail || '#';
    button.addEventListener('click', (e) => {
      e.stopPropagation(); // 카드 탭(모션 재생)으로 처리되지 않게
      if (!card.dataset.detail) e.preventDefault(); // 상세 페이지 준비 전엔 이동 안 함
    });
    card.append(button);

    card.addEventListener('click', () => {
      play(card);
      select(card);
    });
  });

  // 카드 바깥을 탭하면 선택 해제
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.rocket-card')) select(null);
  });
}
