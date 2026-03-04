/* ═══════════════════════════════════════════════════════════
   config.js  │  전역 설정 & 차트 렌더러
   ═══════════════════════════════════════════════════════════ */

// ── 전역 설정 객체 ─────────────────────────────────────────
const CONFIG = {
  kakaoKey: localStorage.getItem('kakao_key') || '',
  molitKey: localStorage.getItem('molit_key') || '',

  save(kakao, molit) {
    this.kakaoKey = kakao.trim();
    this.molitKey = molit.trim();
    localStorage.setItem('kakao_key', this.kakaoKey);
    localStorage.setItem('molit_key', this.molitKey);
  },

  isKakaoSet()  { return this.kakaoKey.length > 10; },
  isMolitSet()  { return this.molitKey.length > 10; },
  isAnySet()    { return this.isKakaoSet() || this.isMolitSet(); },
};

// ── 등급 색상 ─────────────────────────────────────────────
const GRADE_COLOR = {
  S: '#059669', A: '#2563EB', B: '#D97706', C: '#EA580C', D: '#DC2626'
};

const GRADE_NAME = {
  S: '최우수', A: '우수', B: '양호', C: '보통', D: '미흡'
};

const SCORE_LABEL = {
  '실거래가시세변동': '💹 시세변동',
  '핵심시설접근성':   '🏙️ 핵심시설',
  '지하철버스교통':   '🚇 교통',
  '학군':             '🏫 학군',
  '편의시설':         '🏪 편의시설',
  '건물신축도':       '🏗️ 신축도',
  '㎡당가격수준':     '💰 가격수준',
};

// ── 점수 → 색상 ───────────────────────────────────────────
function scoreColor(s) {
  return s >= 75 ? '#10B981' : s >= 55 ? '#F59E0B' : '#EF4444';
}
function scoreBg(s) {
  return s >= 75 ? '#F0FDF4' : s >= 55 ? '#FFFBEB' : '#FEF2F2';
}
function scoreBorder(s) {
  return s >= 75 ? '#86EFAC' : s >= 55 ? '#FDE68A' : '#FECACA';
}

// ── 가격 포맷 ─────────────────────────────────────────────
function fmtPrice(man) {
  if (!man || man <= 0) return '정보없음';
  const uk = Math.floor(man / 10000);
  const m  = man % 10000;
  if (uk > 0 && m > 0) return `${uk}억 ${m.toLocaleString()}만원`;
  if (uk > 0) return `${uk}억원`;
  return `${m.toLocaleString()}만원`;
}

/* ═══════════════════════════════════════════════════════════
   CHARTS  │  Canvas 기반 순수 JS 차트 (라이브러리 없음)
   ═══════════════════════════════════════════════════════════ */

const CHARTS = (() => {

  // ── 레이더 차트 ───────────────────────────────────────────
  function drawRadar(canvasId, scores, grade) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx    = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W/2, cy = H/2;
    const R  = Math.min(W, H) * 0.36;
    const keys   = Object.keys(scores);
    const vals   = keys.map(k => scores[k] / 100);
    const labels = keys.map(k => SCORE_LABEL[k] || k);
    const n      = keys.length;
    const color  = GRADE_COLOR[grade] || '#2563EB';

    ctx.clearRect(0, 0, W, H);

    // 배경 그리드
    [0.25, 0.5, 0.75, 1].forEach(r => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
        const x = cx + Math.cos(angle) * R * r;
        const y = cy + Math.sin(angle) * R * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = r === 1 ? '#CBD5E1' : '#E2E8F0';
      ctx.lineWidth   = r === 1 ? 1.5 : 1;
      ctx.stroke();
      // 눈금 레이블
      if (r < 1) {
        ctx.fillStyle = '#94A3B8';
        ctx.font = '10px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(r * 100), cx + 4, cy - R * r + 4);
      }
    });

    // 축 선
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * R, cy + Math.sin(angle) * R);
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth   = 1;
      ctx.stroke();
    }

    // 데이터 폴리곤
    const hex = color;
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);

    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const x = cx + Math.cos(angle) * R * vals[i];
      const y = cy + Math.sin(angle) * R * vals[i];
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle   = `rgba(${r},${g},${b},0.15)`;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.stroke();

    // 꼭짓점 점
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const x = cx + Math.cos(angle) * R * vals[i];
      const y = cy + Math.sin(angle) * R * vals[i];
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle   = 'white';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      ctx.stroke();
    }

    // 레이블
    ctx.fillStyle  = '#334155';
    ctx.font       = 'bold 11px Pretendard, sans-serif';
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const lx = cx + Math.cos(angle) * (R + 28);
      const ly = cy + Math.sin(angle) * (R + 28);
      ctx.textAlign    = lx < cx - 5 ? 'right' : lx > cx + 5 ? 'left' : 'center';
      ctx.textBaseline = ly < cy - 5 ? 'bottom' : ly > cy + 5 ? 'top' : 'middle';
      ctx.fillText(labels[i], lx, ly);
    }
  }

  // ── 월별 가격 추이 (라인+바 콤보) ────────────────────────
  function drawPriceTrend(canvasId, recs) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const PAD = { top:30, right:20, bottom:50, left:70 };
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top  - PAD.bottom;

    ctx.clearRect(0, 0, W, H);

    if (!recs || recs.length === 0) {
      ctx.fillStyle  = '#94A3B8';
      ctx.font       = '13px Pretendard, sans-serif';
      ctx.textAlign  = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('실거래가 데이터 없음 (MOLIT API 키 필요)', W/2, H/2);
      return;
    }

    // 월별 집계
    const monthly = {};
    recs.forEach(r => {
      const key = `${r.year}-${String(r.month).padStart(2,'0')}`;
      if (!monthly[key]) monthly[key] = [];
      if (r.area > 0) monthly[key].push(r.price / r.area);
    });

    const months = Object.keys(monthly).sort();
    const avgs   = months.map(m => monthly[m].reduce((a,b)=>a+b,0) / monthly[m].length);
    const cnts   = months.map(m => monthly[m].length);

    if (months.length < 2) {
      ctx.fillStyle = '#94A3B8'; ctx.font = '13px Pretendard, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('데이터가 부족합니다', W/2, H/2);
      return;
    }

    const minA = Math.min(...avgs) * 0.95;
    const maxA = Math.max(...avgs) * 1.05;
    const maxC = Math.max(...cnts);

    const xPos = i => PAD.left + (i / (months.length - 1)) * cW;
    const yPos = v => PAD.top  + cH - ((v - minA) / (maxA - minA)) * cH;

    // 거래건수 막대 (배경)
    months.forEach((_, i) => {
      const bh = (cnts[i] / maxC) * cH * 0.5;
      ctx.fillStyle = 'rgba(100,116,139,0.12)';
      ctx.fillRect(xPos(i) - 14, PAD.top + cH - bh, 28, bh);
    });

    // 라인 영역
    ctx.beginPath();
    ctx.moveTo(xPos(0), yPos(avgs[0]));
    months.forEach((_, i) => ctx.lineTo(xPos(i), yPos(avgs[i])));
    ctx.lineTo(xPos(months.length-1), PAD.top + cH);
    ctx.lineTo(xPos(0), PAD.top + cH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(37,99,235,0.07)';
    ctx.fill();

    // 라인
    ctx.beginPath();
    ctx.moveTo(xPos(0), yPos(avgs[0]));
    months.forEach((_, i) => ctx.lineTo(xPos(i), yPos(avgs[i])));
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    ctx.stroke();

    // 포인트
    months.forEach((_, i) => {
      ctx.beginPath();
      ctx.arc(xPos(i), yPos(avgs[i]), 5, 0, Math.PI*2);
      ctx.fillStyle   = 'white';
      ctx.fill();
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth   = 2;
      ctx.stroke();
    });

    // Y축 레이블
    ctx.fillStyle  = '#64748B';
    ctx.font       = '11px Pretendard, sans-serif';
    ctx.textAlign  = 'right';
    ctx.textBaseline = 'middle';
    [0, 0.25, 0.5, 0.75, 1].forEach(r => {
      const v = minA + (maxA - minA) * r;
      const y = yPos(v);
      ctx.fillText(Math.round(v).toLocaleString(), PAD.left - 8, y);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y);
      ctx.strokeStyle = '#F1F5F9';
      ctx.lineWidth   = 1;
      ctx.stroke();
    });

    // X축 레이블
    ctx.fillStyle    = '#64748B';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    months.forEach((m, i) => {
      ctx.fillText(m.replace('-','.'), xPos(i), PAD.top + cH + 10);
    });

    // Y축 제목
    ctx.save();
    ctx.translate(14, PAD.top + cH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle    = '#94A3B8';
    ctx.font         = '11px Pretendard, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('㎡당 평균가 (만원)', 0, 0);
    ctx.restore();
  }

  // ── 핵심시설 수평 바 차트 ────────────────────────────────
  function drawHubBars(containerId, facilities) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const entries = Object.entries(facilities).filter(([,v])=>v>0);
    if (!entries.length) {
      container.innerHTML = `<div style="text-align:center;padding:32px;color:#94A3B8;font-size:13px">카카오 API 키 설정 시 표시됩니다</div>`;
      return;
    }

    const maxDist = Math.max(...entries.map(([,v])=>v));
    container.innerHTML = entries.sort((a,b)=>a[1]-b[1]).map(([name, dist]) => {
      const km  = (dist/1000).toFixed(1);
      const pct = Math.min(100, (dist / 25000) * 100);
      const clr = dist<=3000 ? '#10B981' : dist<=8000 ? '#F59E0B' : '#EF4444';
      return `
        <div class="hub-item">
          <div class="hub-name">${name}</div>
          <div class="hub-bar-wrap">
            <div class="hub-bar-bg">
              <div class="hub-bar-fill" style="width:${pct}%;background:${clr}"></div>
            </div>
          </div>
          <div class="hub-dist" style="color:${clr}">${km}km</div>
        </div>`;
    }).join('');
  }

  return { drawRadar, drawPriceTrend, drawHubBars };
})();
