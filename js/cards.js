// 카드 픽셀 애니메이션 재생 제어
// - 마우스가 있는 기기: 카드에 마우스를 올리면 재생, 떼면 원래대로
// - 터치 기기: 카드가 화면에 충분히 보이면 한 번 자동 재생, 탭하면 다시 재생

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

if (canHover) {
  cards.forEach((card) => {
    card.addEventListener('mouseenter', () => card.classList.add('is-playing'));
    card.addEventListener('mouseleave', () => card.classList.remove('is-playing'));
  });
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        play(entry.target);
        observer.unobserve(entry.target); // 자동 재생은 카드마다 한 번만
      }
    });
  }, { threshold: 0.6 }); // 카드가 60% 이상 보일 때

  cards.forEach((card) => {
    observer.observe(card);
    card.addEventListener('click', () => play(card));
  });
}
