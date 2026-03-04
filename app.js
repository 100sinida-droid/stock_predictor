/* ═══════════════════════════════════════════════════════════
   app.js  │  UI 렌더링 & 이벤트 핸들러
   ═══════════════════════════════════════════════════════════ */

// ── 빠른 검색 예시 ────────────────────────────────────────
const QUICK_SEARCHES = [
  '래미안퍼스티지', '아크로리버파크', '마포래미안푸르지오',
  '힐스테이트판교역', '자이아파트', '롯데캐슬'
];

// ── DOM 준비 ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initUI();
  restoreApiKeys();
  updateApiStatus();
});

// ── UI 초기화 ─────────────────────────────────────────────
function initUI() {
  // 빠른 검색 칩
  const qsWrap = document.getElementById('quick-search');
  if (qsWrap) {
    QUICK_SEARCHES.forEach(name => {
      const chip = document.createElement('button');
      chip.className   = 'quick-chip';
      chip.textContent = name;
      chip.onclick     = () => {
        document.getElementById('search-input').value = name;
        runSearch(name);
      };
      qsWrap.appendChild(chip);
    });
  }

  // 검색 이벤트
  const searchBtn   = document.getElementById('search-btn');
  const searchInput = document.getElementById('search-input');
  if (searchBtn)   searchBtn.onclick  = () => runSearch(searchInput.value.trim());
  if (searchInput) {
    searchInput.onkeydown = e => { if (e.key === 'Enter') runSearch(searchInput.value.trim()); };
    searchInput.oninput   = () => handleAutocomplete(searchInput.value);
  }

  // API 패널 토글
  const panelHeader = document.getElementById('api-panel-header');
  if (panelHeader) panelHeader.onclick = toggleApiPanel;

  // API 저장
  const apiSaveBtn = document.getElementById('api-save-btn');
  if (apiSaveBtn) apiSaveBtn.onclick = saveApiKeys;

  // 면적 필터
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      filterTradeTable(chip.dataset.area);
    };
  });

  // API 패널 열기 (키 미설정 시)
  if (!CONFIG.isAnySet()) {
    document.getElementById('api-panel')?.classList.add('open');
  }
}

// ── API 키 복원 ───────────────────────────────────────────
function restoreApiKeys() {
  const ki = document.getElementById('kakao-key-input');
  const mi = document.getElementById('molit-key-input');
  if (ki) ki.value = CONFIG.kakaoKey;
  if (mi) mi.value = CONFIG.molitKey;
}

// ── API 키 저장 ───────────────────────────────────────────
function saveApiKeys() {
  const kakao = document.getElementById('kakao-key-input')?.value || '';
  const molit = document.getElementById('molit-key-input')?.value || '';
  CONFIG.save(kakao, molit);
  updateApiStatus();
  showToast('✅ API 키가 저장되었습니다', 'success');
  if (CONFIG.isAnySet()) {
    document.getElementById('api-panel')?.classList.remove('open');
  }
}

// ── 상태 표시 업데이트 ────────────────────────────────────
function updateApiStatus() {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (!dot || !text) return;
  if (CONFIG.isKakaoSet() && CONFIG.isMolitSet()) {
    dot.className   = 'status-dot connected';
    text.textContent = 'API 연결됨';
  } else if (CONFIG.isAnySet()) {
    dot.className   = 'status-dot partial';
    text.textContent = '일부 연결됨';
  } else {
    dot.className   = 'status-dot';
    text.textContent = 'API 미설정';
  }
}

// ── API 패널 토글 ─────────────────────────────────────────
function toggleApiPanel() {
  document.getElementById('api-panel')?.classList.toggle('open');
}

// ── 자동완성 ─────────────────────────────────────────────
const FAMOUS_APTS = [
  '래미안퍼스티지', '아크로리버파크', '마포래미안푸르지오',
  '헬리오시티', '올림픽파크포레온', '디에이치아너힐스',
  '반포자이', '개포주공아파트', '잠실엘스', '잠실리센츠',
  '힐스테이트판교역', '판교알파리움', '광교중흥S클래스',
  '동탄역롯데캐슬', '위례자이더시티', '하남포웰시티',
  '래미안블레스티지', '신반포자이', '아크로비스타',
  '삼성레미안', '자이아파트', '롯데캐슬이스트폴',
];

function handleAutocomplete(val) {
  const list = document.getElementById('autocomplete-list');
  if (!list) return;
  if (!val || val.length < 1) { list.classList.remove('show'); return; }

  const matched = FAMOUS_APTS.filter(a => a.includes(val)).slice(0, 5);
  if (!matched.length) { list.classList.remove('show'); return; }

  list.innerHTML = matched.map(name => `
    <div class="ac-item" onclick="selectAc('${name}')">
      🏠 <div><strong>${name}</strong></div>
    </div>
  `).join('');
  list.classList.add('show');
}

function selectAc(name) {
  document.getElementById('search-input').value = name;
  document.getElementById('autocomplete-list')?.classList.remove('show');
  runSearch(name);
}

// 자동완성 닫기
document.addEventListener('click', e => {
  if (!e.target.closest('.search-input-wrap')) {
    document.getElementById('autocomplete-list')?.classList.remove('show');
  }
});

// ── 검색 실행 ─────────────────────────────────────────────
let currentRecs = [];
let currentResult = null;

async function runSearch(name) {
  if (!name) { showToast('아파트 이름을 입력해 주세요', 'error'); return; }
  document.getElementById('autocomplete-list')?.classList.remove('show');

  // UI 상태 전환
  setLoading(true);
  hideError();
  document.getElementById('result-section').classList.remove('show');

  try {
    if (!CONFIG.isAnySet()) {
      showError('API 키가 설정되지 않았습니다. 상단 [API 설정] 패널에서 키를 입력해 주세요.\n카카오 API 키만 있어도 위치·교통·학군 분석이 가능합니다.');
      setLoading(false);
      document.getElementById('api-panel')?.classList.add('open');
      return;
    }

    const result = await API.analyze(name, msg => updateLoadingMsg(msg));
    currentResult = result;
    currentRecs   = result.recs;
    renderResult(result);
    showToast(`✅ ${name} 분석 완료!`, 'success');
  } catch (err) {
    console.error(err);
    showError(`분석 중 오류가 발생했습니다: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

// ── 로딩 상태 ─────────────────────────────────────────────
function setLoading(on) {
  const lo  = document.getElementById('loading-overlay');
  const btn = document.getElementById('search-btn');
  if (lo)  { on ? lo.classList.add('show')  : lo.classList.remove('show'); }
  if (btn) { btn.disabled = on; btn.textContent = on ? '⏳ 분석 중...' : '🔍 분석 시작'; }
}

function updateLoadingMsg(msg) {
  const el = document.getElementById('loading-msg');
  if (el) el.textContent = msg;
}

function showError(msg) {
  const el = document.getElementById('error-box');
  if (!el) return;
  el.textContent = '⚠️ ' + msg;
  el.classList.add('show');
}
function hideError() {
  document.getElementById('error-box')?.classList.remove('show');
}

// ── 결과 렌더링 ───────────────────────────────────────────
function renderResult(r) {
  renderHeader(r);
  renderScoreCards(r);
  renderProsConsAnalysis(r);
  renderInvestOpinion(r);
  renderCharts(r);
  renderHubBars(r);
  renderTradeTable(r.recs);
  document.getElementById('result-section').classList.add('show');
  document.getElementById('result-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── 헤더 ─────────────────────────────────────────────────
function renderHeader(r) {
  const { aptName, addr, total, grade, scores, weights } = r;
  const gc = GRADE_COLOR[grade];

  document.getElementById('res-apt-name').textContent  = aptName;
  document.getElementById('res-apt-addr').textContent  = addr || '주소 정보 없음 (카카오 API 키 필요)';
  document.getElementById('res-score-num').textContent = total;
  document.getElementById('res-grade').textContent     = grade;
  document.getElementById('res-grade-desc').textContent= GRADE_NAME[grade] + ' 등급';
  document.getElementById('res-date').textContent      = new Date().toLocaleString('ko-KR');

  // 등급 색상 적용
  document.getElementById('res-grade').style.color = gc;
  document.getElementById('res-score-num').style.color = gc;

  // 게이지 바
  const fill = document.getElementById('res-gauge-fill');
  if (fill) {
    fill.style.background = `linear-gradient(90deg, #1D4ED8, ${gc})`;
    setTimeout(() => fill.style.width = total + '%', 100);
  }

  // 링 SVG
  const ringFill = document.getElementById('res-ring-fill');
  if (ringFill) {
    const circumference = 2 * Math.PI * 46;
    ringFill.setAttribute('stroke', gc);
    ringFill.setAttribute('stroke-dasharray', circumference);
    setTimeout(() => {
      ringFill.setAttribute('stroke-dashoffset', circumference * (1 - total/100));
    }, 100);
  }
}

// ── 점수 카드 ─────────────────────────────────────────────
function renderScoreCards(r) {
  const { scores, weights, details } = r;
  const container = document.getElementById('score-cards');
  if (!container) return;

  const detailMap = {
    '실거래가시세변동': details.시세,
    '핵심시설접근성':   details.핵심시설,
    '지하철버스교통':   details.교통,
    '학군':             details.학군,
    '편의시설':         details.편의,
    '건물신축도':       details.건물,
    '㎡당가격수준':     details.가격,
  };

  container.innerHTML = Object.keys(scores).map((key, i) => {
    const s   = scores[key];
    const w   = weights[key] || 0;
    const d   = detailMap[key] || {};
    const vc  = scoreColor(s);
    const bg  = scoreBg(s);
    const bc  = scoreBorder(s);
    const sub = Object.entries(d).slice(0,2)
      .map(([k,v]) => `<span>· ${k}: <b>${v}</b></span>`).join('');

    return `
      <div class="score-card fade-in-up" style="animation-delay:${i*0.06}s">
        <div class="sc-header">
          <div>
            <div class="sc-label">${SCORE_LABEL[key] || key}</div>
            <div class="sc-weight">가중치 ${w}점</div>
          </div>
          <div class="sc-score" style="color:${vc}">${s}<span class="sc-pt">점</span></div>
        </div>
        <div class="sc-bar-bg">
          <div class="sc-bar-fill" style="width:0%;background:${vc}"
               data-target="${s}"></div>
        </div>
        <div class="sc-details">${sub}</div>
      </div>`;
  }).join('');

  // 바 애니메이션
  setTimeout(() => {
    container.querySelectorAll('.sc-bar-fill').forEach(el => {
      el.style.transition = 'width 1s cubic-bezier(0.4,0,0.2,1)';
      el.style.width = el.dataset.target + '%';
    });
  }, 200);
}

// ── 장단점 자동 분석 ──────────────────────────────────────
function autoAnalysis(r) {
  const { scores, details, total } = r;
  const pros = [], cons = [];

  // 시세변동
  const chg = details.시세?.['변동률(%)'] || 0;
  if (chg >= 5)  pros.push(['💹 강한 시세 상승',   `최근 ${chg.toFixed(1)}% 급등 — 단기 투자 모멘텀 탁월`]);
  else if (chg >= 2) pros.push(['💹 시세 상승 추세', `최근 ${chg.toFixed(1)}% 상승 — 꾸준한 우상향 확인`]);
  else if (chg <= -5) cons.push(['💹 시세 급락',     `최근 ${Math.abs(chg).toFixed(1)}% 하락 — 단기 리스크 주의`]);
  else if (chg <= -2) cons.push(['💹 시세 하락',     `최근 ${Math.abs(chg).toFixed(1)}% 하락 — 추세 모니터링 필요`]);
  const cnt = details.시세?.['거래건수'] || 0;
  if (cnt >= 10) pros.push(['💹 활발한 거래량', `최근 ${cnt}건으로 유동성 우수`]);
  else if (cnt === 0) cons.push(['💹 거래량 부족', '최근 거래 없음 — 유동성 주의']);

  // 핵심시설
  const shub = scores['핵심시설접근성'];
  const closest = details.핵심시설?.['가장가까운'] || '';
  const closestDist = details.핵심시설?.['거리'] || '';
  if (shub >= 80) pros.push(['🏙️ 최상급 도심 접근성', `${closest} 등 핵심 업무지구까지 ${closestDist} — 직주근접 최적`]);
  else if (shub >= 60) pros.push(['🏙️ 양호한 도심 접근성', `${closest}까지 ${closestDist} — 출퇴근 편의성 우수`]);
  else if (shub < 35) cons.push(['🏙️ 도심 접근성 한계', '강남·광화문 등 핵심시설까지 거리가 멀어 출퇴근 부담']);

  // 교통
  const str = scores['지하철버스교통'];
  const station = details.교통?.['가장가까운역'] || '';
  const sdist   = details.교통?.['역거리'] || '';
  const cnt500  = details.교통?.['500m내역수'] || 0;
  if (str >= 80) pros.push(['🚇 역세권 프리미엄', `${station}${cnt500>=2?' ·더블역세권':''} (${sdist})`]);
  else if (str >= 60) pros.push(['🚇 양호한 교통', `${station} (${sdist})`]);
  else if (str < 40) cons.push(['🚇 교통 접근성 부족', `역까지 ${sdist} — 대중교통 이용 불편`]);

  // 학군
  const ssch = scores['학군'];
  const elem  = details.학군?.['초등학교'] || '';
  if (ssch >= 80) pros.push(['🏫 우수 학군', `${elem} 근접 — 초·중·고 도보권`]);
  else if (ssch >= 65) pros.push(['🏫 양호한 학군', `${elem} — 주요 학교 접근 편리`]);
  else if (ssch < 40) cons.push(['🏫 학군 접근성 부족', '초등학교까지 거리가 멀어 통학 부담']);

  // 편의시설
  const sam  = scores['편의시설'];
  const mart = details.편의?.['대형마트(500m)'] || '0개';
  const park = details.편의?.['공원(700m)'] || '0개';
  if (sam >= 75) pros.push(['🏪 생활 인프라 탁월', `마트 ${mart} · 공원 ${park} — 생활 편의 최상`]);
  else if (mart !== '0개') pros.push(['🛒 대형마트 근접', `500m 내 마트 ${mart} — 장보기 편리`]);
  if (parseInt(park) >= 2) pros.push(['🌳 녹지 환경 우수', `700m 내 공원 ${park} — 쾌적한 자연환경`]);
  if (sam < 35) cons.push(['🏪 편의시설 부족', '근거리 마트·병원·공원 제한적']);

  // 건물
  const sbd  = scores['건물신축도'];
  const yr   = details.건물?.['평균건축년도'] || '';
  const age  = details.건물?.['평균연식'] || '';
  const redev= details.건물?.['재건축가능성'] || '';
  if (sbd >= 80) pros.push(['🏗️ 신축급 건물', `${yr} 준공 (${age}) — 최신 시설·커뮤니티`]);
  else if (sbd >= 60) pros.push(['🏗️ 준신축 건물', `${yr} 준공 (${age}) — 양호한 건물 상태`]);
  else {
    if (redev.includes('높음')) pros.push(['🔨 재건축 기대감', `${age} 노후 — 재건축 가능권 진입, 장기 투자 매력`]);
    cons.push(['🏗️ 노후 건물', `${age} — 유지비 증가 가능, 생활 불편 주의`]);
  }

  // 가격
  const spv = scores['㎡당가격수준'];
  const m2p = details.가격?.['㎡당평균가(만)'] || '';
  const avg = details.가격?.['평균거래가'] || '';
  if (spv >= 70) pros.push(['💰 합리적 가격', `㎡당 ${m2p} (평균 ${avg}) — 접근 가능한 가격대`]);
  else if (spv < 30) cons.push(['💰 높은 가격 부담', `㎡당 ${m2p} (평균 ${avg}) — 높은 진입 장벽`]);

  // 투자의견
  let invest, target;
  if (total >= 75) {
    invest = '✅ 적극 추천 — 교통·학군·시세 등 핵심 지표에서 복수의 강점 확인. 실거주·투자 모두 높은 만족도 기대.';
    target = '직주근접 원하는 직장인, 자녀 교육 중시 가정, 안정적 자산 성장을 원하는 투자자';
  } else if (total >= 62) {
    invest = '🟡 긍정적 검토 — 전반적으로 균형 잡힌 입지. 일부 약점을 감안하고 판단하세요.';
    target = '중장기 실거주 목적 수요자, 안정 지향 투자자';
  } else if (total >= 50) {
    invest = '⚠️ 중립 — 장단점이 혼재. 직장 위치·자녀 유무에 따라 판단이 달라질 수 있습니다.';
    target = '해당 지역 직장인, 특정 생활권 선호자';
  } else {
    invest = '🔴 신중 검토 — 다수 항목 취약. 개발계획·재건축 호재 유무를 추가 확인하세요.';
    target = '장기 저가 매수 전략 투자자, 지역 특수 수요자';
  }

  return { pros: pros.slice(0,5), cons: cons.slice(0,4), invest, target };
}

// ── 장단점 렌더링 ─────────────────────────────────────────
function renderProsConsAnalysis(r) {
  const { pros, cons } = autoAnalysis(r);

  const mkItem = ([title, desc]) => `
    <div class="pc-item">
      <div class="pc-ico">✅</div>
      <div><div class="pc-title">${title}</div><div class="pc-desc">${desc}</div></div>
    </div>`;
  const mkConItem = ([title, desc]) => `
    <div class="pc-item">
      <div class="pc-ico">⚠️</div>
      <div><div class="pc-title">${title}</div><div class="pc-desc">${desc}</div></div>
    </div>`;

  const prosEl = document.getElementById('pros-list');
  const consEl = document.getElementById('cons-list');
  if (prosEl) prosEl.innerHTML = pros.length ? pros.map(mkItem).join('') : '<div class="pc-desc">데이터 분석 중 장점이 발견되지 않았습니다</div>';
  if (consEl) consEl.innerHTML = cons.length ? cons.map(mkConItem).join('') : '<div class="pc-desc">특별한 단점이 발견되지 않았습니다</div>';
}

// ── 투자의견 렌더링 ───────────────────────────────────────
function renderInvestOpinion(r) {
  const { invest, target } = autoAnalysis(r);
  const el = document.getElementById('invest-text');
  const tl = document.getElementById('invest-target');
  if (el) el.textContent = invest;
  if (tl) tl.textContent = '🎯 추천 대상: ' + target;
}

// ── 차트 렌더링 ───────────────────────────────────────────
function renderCharts(r) {
  CHARTS.drawRadar('radar-canvas', r.scores, r.grade);
  CHARTS.drawPriceTrend('trend-canvas', r.recs);
}

// ── 핵심시설 바 ───────────────────────────────────────────
function renderHubBars(r) {
  CHARTS.drawHubBars('hub-bars', r.details.facilities || {});
}

// ── 실거래 테이블 ─────────────────────────────────────────
function renderTradeTable(recs, areaFilter = 'all') {
  const tbody = document.getElementById('trade-tbody');
  if (!tbody) return;

  let filtered = [...recs];
  if (areaFilter !== 'all') {
    const [min, max] = areaFilter.split('-').map(Number);
    filtered = filtered.filter(r => r.area >= min && (!max || r.area < max));
  }

  filtered.sort((a, b) => b.year*10000 + b.month*100 + b.day - (a.year*10000 + a.month*100 + a.day));
  const top = filtered.slice(0, 20);

  if (!top.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:#94A3B8">
      ${recs.length === 0 ? '거래 데이터 없음 (MOLIT API 키 필요)' : '해당 면적의 거래 내역이 없습니다'}
    </td></tr>`;
    return;
  }

  tbody.innerHTML = top.map(r => {
    const date = `${r.year}.${String(r.month).padStart(2,'0')}.${String(r.day).padStart(2,'0')}`;
    const m2   = r.area > 0 ? Math.round(r.price / r.area) : 0;
    const py   = Math.round(r.area / 3.305); // 평형 환산
    return `
      <tr>
        <td><b>${r.name}</b></td>
        <td>${date}</td>
        <td>${r.area}㎡ <span style="color:#94A3B8;font-size:11px">(${py}평)</span></td>
        <td>${r.floor}층</td>
        <td class="price-cell">${fmtPrice(r.price)}</td>
        <td class="m2-cell">${m2.toLocaleString()}만/㎡</td>
      </tr>`;
  }).join('');
}

// ── 면적 필터 ─────────────────────────────────────────────
function filterTradeTable(area) {
  renderTradeTable(currentRecs, area || 'all');
}

// ── 토스트 알림 ───────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = `toast ${type}`;
  void toast.offsetWidth;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}
