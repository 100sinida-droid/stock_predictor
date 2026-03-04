/* ═══════════════════════════════════════════════════════════
   api.js  │  국토교통부 + 카카오 API 통신 모듈
   ═══════════════════════════════════════════════════════════ */

const API = (() => {

  // ── 법정동 코드 테이블 ────────────────────────────────────
  const LAWD_TABLE = {
    '강남':'11680','서초':'11650','송파':'11710','강동':'11740',
    '마포':'11440','용산':'11170','성동':'11200','광진':'11215',
    '강서':'11500','양천':'11470','영등포':'11560','동작':'11590',
    '관악':'11620','은평':'11380','서대문':'11410','종로':'11110',
    '중구':'11140','성북':'11290','노원':'11350','강북':'11305',
    '도봉':'11320','중랑':'11260','동대문':'11230','금천':'11545',
    '구로':'11530','수원':'41110','성남':'41130','분당':'41135',
    '고양':'41280','용인':'41460','부천':'41190','안산':'41270',
    '화성':'41590','남양주':'41360','평택':'41220','시흥':'41390',
    '해운대':'26350','수성':'27290','유성':'30200','목동':'11470',
    '일산':'41285','광명':'41210','하남':'41450','과천':'41290',
    '의왕':'41430','군포':'41410','안양':'41170','의정부':'41150',
    '판교':'41135','위례':'11710','동탄':'41590','광교':'41115',
    '부산':'26110','인천':'28110','대구':'27110','대전':'30110',
    '광주':'29110','울산':'31110','세종':'36110',
  };

  // ── 핵심시설 목록 ─────────────────────────────────────────
  const KEY_FACILITIES = [
    { name:'강남역',    query:'강남역',        weight:3 },
    { name:'광화문',    query:'광화문광장',     weight:3 },
    { name:'시청',      query:'서울시청',       weight:2 },
    { name:'여의도',    query:'여의도역',       weight:2 },
    { name:'판교테크노',query:'판교테크노밸리', weight:2 },
    { name:'잠실',      query:'잠실역',         weight:1 },
    { name:'종로',      query:'종로3가역',      weight:1 },
  ];

  // ── 유틸 ──────────────────────────────────────────────────
  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2
            + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180)
            * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function fmtDist(m) {
    return m >= 1000 ? `${(m/1000).toFixed(1)}km` : `${Math.round(m)}m`;
  }

  function fmtPrice(man) {
    if (!man || man <= 0) return '정보없음';
    const uk = Math.floor(man / 10000);
    const m  = man % 10000;
    if (uk > 0 && m > 0) return `${uk}억 ${m.toLocaleString()}만원`;
    if (uk > 0) return `${uk}억원`;
    return `${m.toLocaleString()}만원`;
  }

  function getRecentMonths(n) {
    const months = [];
    const now = new Date();
    for (let i = 0; i < n; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(
        `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}`
      );
    }
    return months;
  }

  function guessLawd(name) {
    for (const [k, v] of Object.entries(LAWD_TABLE)) {
      if (name.includes(k)) return v;
    }
    return '11680';
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ── CORS 프록시 (브라우저에서 공공API 직접 호출용) ─────────
  // 공공데이터포털은 CORS 미지원 → allorigins 프록시 사용
  function proxiedUrl(url) {
    return `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  }

  // ── 카카오 키워드 검색 ─────────────────────────────────────
  async function kakaoKeyword(query, x='', y='', radius=0) {
    const key = CONFIG.kakaoKey;
    if (!key) return [];
    const params = new URLSearchParams({ query, size: 5 });
    if (x) { params.set('x', x); params.set('y', y); params.set('radius', radius); }
    try {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?${params}`,
        { headers: { Authorization: `KakaoAK ${key}` } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.documents || [];
    } catch { return []; }
  }

  // ── 카카오 카테고리 검색 ──────────────────────────────────
  async function kakaoCategory(code, x, y, radius=500) {
    const key = CONFIG.kakaoKey;
    if (!key) return [];
    const params = new URLSearchParams({
      category_group_code: code, x, y, radius, size: 15
    });
    try {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/category.json?${params}`,
        { headers: { Authorization: `KakaoAK ${key}` } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.documents || [];
    } catch { return []; }
  }

  // ── 아파트 위치 조회 ──────────────────────────────────────
  async function getLocation(aptName) {
    const docs = await kakaoKeyword(aptName + ' 아파트');
    if (docs.length === 0) return { lat: null, lng: null, addr: '' };
    const d = docs[0];
    return {
      lat:  parseFloat(d.y || 0),
      lng:  parseFloat(d.x || 0),
      addr: d.address_name || '',
    };
  }

  // ── 국토교통부 실거래가 1개월치 ───────────────────────────
  async function fetchTrades(lawdCd, dealYmd) {
    const key = CONFIG.molitKey;
    if (!key) return [];
    const url = 'http://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade'
      + `?serviceKey=${key}&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYmd}&numOfRows=1000&pageNo=1`;
    try {
      const res  = await fetch(proxiedUrl(url));
      const text = await res.text();
      const parser = new DOMParser();
      const xml    = parser.parseFromString(text, 'text/xml');
      const items  = Array.from(xml.querySelectorAll('item'));
      return items.map(item => {
        const g = tag => (item.querySelector(tag)?.textContent || '').trim();
        return {
          name:       g('aptNm'),
          price:      parseInt(g('dealAmount').replace(/,/g,''), 10) || 0,
          area:       parseFloat(g('excluUseAr')) || 0,
          floor:      g('floor'),
          buildYear:  parseInt(g('buildYear'), 10) || 0,
          dong:       g('umdNm'),
          year:       parseInt(g('dealYear'),  10) || 0,
          month:      parseInt(g('dealMonth'), 10) || 0,
          day:        parseInt(g('dealDay'),   10) || 0,
        };
      }).filter(r => r.price > 0 && r.area > 0);
    } catch { return []; }
  }

  // ── 아파트 실거래가 수집 (n개월) ─────────────────────────
  async function getTradeRecords(aptName, nMonths = 6, onProgress) {
    const lawd   = guessLawd(aptName);
    const months = getRecentMonths(nMonths);
    const prefix = aptName.slice(0, 4);
    const allRecs = [];
    const target  = [];

    for (let i = 0; i < months.length; i++) {
      if (onProgress) onProgress(`실거래가 수집 중... (${i+1}/${months.length}개월)`);
      const recs = await fetchTrades(lawd, months[i]);
      allRecs.push(...recs);
      target.push(...recs.filter(r => r.name.includes(prefix) || r.name.includes(aptName)));
      await sleep(150);
    }
    return { target, allRecs };
  }

  // ── 점수 1: 실거래가 시세변동 (20점) ─────────────────────
  function scorePrice(recs) {
    const half = Math.max(1, Math.floor(recs.length / 2));
    const curr = recs.slice(0, half);
    const prev = recs.slice(half);
    const avg = arr => {
      const v = arr.filter(r=>r.area>0).map(r=>r.price/r.area);
      return v.length ? v.reduce((a,b)=>a+b,0)/v.length : 0;
    };
    const c = avg(curr), p = avg(prev);
    if (p === 0) return {
      score: 50,
      details: { '현재㎡단가(만)': Math.round(c), '이전㎡단가(만)': 0, '변동률(%)': 0, '거래건수': curr.length }
    };
    const chg = (c - p) / p * 100;
    const score = Math.max(0, Math.min(100, (chg + 5) / 15 * 100));
    const trend = chg > 2 ? '📈 상승' : chg < -2 ? '📉 하락' : '➡️ 보합';
    return {
      score: Math.round(score * 10) / 10,
      details: {
        '현재㎡단가(만)': Math.round(c),
        '이전㎡단가(만)': Math.round(p),
        '변동률(%)': Math.round(chg * 100) / 100,
        '추세': trend,
        '거래건수': curr.length,
      }
    };
  }

  // ── 점수 2: 핵심시설 접근성 (20점) ───────────────────────
  async function scoreHubFacilities(lat, lng) {
    if (!lat) return { score: 50, details: { '메시지': 'API 키 필요' }, facilities: {} };
    const details = {};
    const facDists = {};
    let totalW = 0, weightedSum = 0;

    for (const fac of KEY_FACILITIES) {
      totalW += fac.weight;
      const docs = await kakaoKeyword(fac.query);
      if (!docs.length) {
        details[fac.name] = '정보없음';
        weightedSum += fac.weight * 40;
        continue;
      }
      const d    = docs[0];
      const dist = haversine(lat, lng, parseFloat(d.y), parseFloat(d.x));
      let s;
      if      (dist <= 1000)  s = 100;
      else if (dist <= 3000)  s = 100 - (dist-1000)/2000*30;
      else if (dist <= 7000)  s = 70  - (dist-3000)/4000*30;
      else if (dist <= 15000) s = 40  - (dist-7000)/8000*40;
      else                    s = 0;
      s = Math.max(0, Math.round(s * 10) / 10);
      details[fac.name] = fmtDist(dist);
      facDists[fac.name] = dist;
      weightedSum += fac.weight * s;
    }

    // 가장 가까운 핵심시설
    const closest = Object.entries(facDists).sort((a,b)=>a[1]-b[1])[0];
    if (closest) {
      details['가장가까운'] = closest[0];
      details['거리']       = fmtDist(closest[1]);
    }

    return {
      score:      Math.round(weightedSum / totalW * 10) / 10,
      details,
      facilities: facDists,
    };
  }

  // ── 점수 3: 지하철·버스 교통 (15점) ─────────────────────
  async function scoreTransit(lat, lng) {
    if (!lat) return { score: 50, details: { '메시지': 'API 키 필요' } };
    const sx = String(lng), sy = String(lat);
    const subways = await kakaoCategory('SW8', sx, sy, 1500);
    const subDists = subways.map(s => ({
      name: s.place_name,
      dist: haversine(lat, lng, parseFloat(s.y), parseFloat(s.x))
    })).sort((a,b) => a.dist - b.dist);

    const cnt500 = subDists.filter(s => s.dist <= 500).length;
    const cnt1k  = subDists.filter(s => s.dist <= 1000).length;
    const nearest = subDists[0] || { name: '없음', dist: 9999 };

    const buses  = await kakaoCategory('BK9', sx, sy, 300);
    const busCnt = buses.length;

    let subScore;
    if      (nearest.dist <= 300)  subScore = 100;
    else if (nearest.dist <= 600)  subScore = 85;
    else if (nearest.dist <= 1000) subScore = 65;
    else if (nearest.dist <= 1500) subScore = 40;
    else                           subScore = 15;

    const bonus = Math.min(15, cnt500*8 + cnt1k*3) + Math.min(10, busCnt*2);
    const score = Math.min(100, subScore*0.75 + bonus);
    return {
      score: Math.round(score * 10) / 10,
      details: {
        '가장가까운역':   nearest.name,
        '역거리':         nearest.dist < 9999 ? fmtDist(nearest.dist) : '1.5km 초과',
        '500m내역수':     cnt500,
        '1km내역수':      cnt1k,
        '300m내버스정류장': busCnt,
      }
    };
  }

  // ── 점수 4: 학군 (15점) ───────────────────────────────────
  async function scoreSchool(lat, lng) {
    if (!lat) return { score: 50, details: { '메시지': 'API 키 필요' } };
    const sx = String(lng), sy = String(lat);
    const [elem, middle, high] = await Promise.all([
      kakaoCategory('SC4', sx, sy, 1000),
      kakaoCategory('MS2', sx, sy, 1000),
      kakaoCategory('HS3', sx, sy, 1500),
    ]);
    const nearDist = places => places.length
      ? Math.min(...places.map(p => haversine(lat, lng, parseFloat(p.y), parseFloat(p.x))))
      : 9999;
    const ed = nearDist(elem), md = nearDist(middle), hd = nearDist(high);
    const es = ed<=300?100: ed<=500?80: ed<=800?55: ed<=1000?30: 10;
    const ms = md<=500?100: md<=800?80: md<=1000?50: 20;
    const hs = hd<=700?100: hd<=1000?75: hd<=1500?50: 20;
    const score = es*0.5 + ms*0.3 + hs*0.2;
    return {
      score: Math.round(score * 10) / 10,
      details: {
        '초등학교': `${elem[0]?.place_name||'없음'} (${fmtDist(ed)})`,
        '중학교':   `${middle[0]?.place_name||'없음'} (${fmtDist(md)})`,
        '고등학교': `${high[0]?.place_name||'없음'} (${fmtDist(hd)})`,
        '1km내초등': elem.filter(p=>haversine(lat,lng,parseFloat(p.y),parseFloat(p.x))<=1000).length + '개',
      }
    };
  }

  // ── 점수 5: 편의시설 (10점) ───────────────────────────────
  async function scoreAmenity(lat, lng) {
    if (!lat) return { score: 50, details: {} };
    const sx = String(lng), sy = String(lat);
    const checks = [
      ['MT1','대형마트(500m)',  500, 20],
      ['HP8','병원(500m)',      500,  8],
      ['PM9','약국(300m)',      300,  4],
      ['CS2','편의점(200m)',    200,  2],
    ];
    let weighted = 0;
    const details = {};
    for (const [code, label, rad, w] of checks) {
      const cnt = (await kakaoCategory(code, sx, sy, rad)).length;
      details[label] = cnt + '개';
      weighted += Math.min(cnt, 3) * w;
    }
    const parks = await kakaoKeyword('공원', sx, sy, 700);
    details['공원(700m)'] = parks.length + '개';
    weighted += Math.min(parks.length, 2) * 10;
    return {
      score: Math.round(Math.min(100, weighted / 80 * 100) * 10) / 10,
      details
    };
  }

  // ── 점수 6: 건물 신축도 (10점) ────────────────────────────
  function scoreBuilding(recs) {
    const yrs = recs.filter(r => r.buildYear > 1970 && r.buildYear <= new Date().getFullYear())
                    .map(r => r.buildYear);
    if (!yrs.length) return { score: 50, details: { '건축년도': '정보없음' } };
    const avg = yrs.reduce((a,b)=>a+b,0) / yrs.length;
    const age = new Date().getFullYear() - avg;
    const score = Math.max(0, Math.min(100, (35 - age) / 35 * 100));
    return {
      score: Math.round(score * 10) / 10,
      details: {
        '평균건축년도': Math.round(avg) + '년',
        '평균연식':     Math.round(age) + '년',
        '재건축가능성': age >= 30 ? '높음(30년+)' : age >= 20 ? '보통(20~30년)' : '낮음',
      }
    };
  }

  // ── 점수 7: ㎡당 가격수준 (10점) ─────────────────────────
  function scorePriceLevel(recs) {
    if (!recs.length) return { score: 50, details: { '메시지': '데이터없음' } };
    const vals = recs.filter(r=>r.area>0).map(r=>r.price/r.area);
    if (!vals.length) return { score: 50, details: { '메시지': '데이터없음' } };
    const avg  = vals.reduce((a,b)=>a+b,0) / vals.length;
    const score = Math.max(0, Math.min(100, (4000 - avg) / 3500 * 100));
    const avgTotal = recs.reduce((a,r)=>a+r.price,0) / recs.length;
    return {
      score: Math.round(score * 10) / 10,
      details: {
        '㎡당평균가(만)': Math.round(avg).toLocaleString() + '만',
        '평균거래가':    fmtPrice(Math.round(avgTotal)),
        '최고거래가':    fmtPrice(Math.max(...recs.map(r=>r.price))),
        '최저거래가':    fmtPrice(Math.min(...recs.map(r=>r.price))),
      }
    };
  }

  // ── 메인 분석 함수 ────────────────────────────────────────
  async function analyze(aptName, onProgress = () => {}) {
    onProgress('위치 정보 조회 중...');
    const { lat, lng, addr } = await getLocation(aptName);

    onProgress('실거래가 데이터 수집 중...');
    const { target: recs } = await getTradeRecords(aptName, 6, onProgress);

    onProgress('시세 변동 분석 중...');
    const p1 = scorePrice(recs);

    onProgress('핵심시설 거리 분석 중...');
    const p2 = await scoreHubFacilities(lat, lng);

    onProgress('교통 접근성 분석 중...');
    const p3 = await scoreTransit(lat, lng);

    onProgress('학군 분석 중...');
    const p4 = await scoreSchool(lat, lng);

    onProgress('편의시설 분석 중...');
    const p5 = await scoreAmenity(lat, lng);

    onProgress('건물 신축도 분석 중...');
    const p6 = scoreBuilding(recs);

    onProgress('가격 수준 분석 중...');
    const p7 = scorePriceLevel(recs);

    const WEIGHTS = {
      '실거래가시세변동': 20, '핵심시설접근성': 20,
      '지하철버스교통':   15, '학군':          15,
      '편의시설':         10, '건물신축도':    10,
      '㎡당가격수준':     10,
    };

    const scores = {
      '실거래가시세변동': p1.score, '핵심시설접근성': p2.score,
      '지하철버스교통':   p3.score, '학군':           p4.score,
      '편의시설':         p5.score, '건물신축도':     p6.score,
      '㎡당가격수준':     p7.score,
    };

    const total = Object.keys(scores)
      .reduce((sum, k) => sum + scores[k] * WEIGHTS[k] / 100, 0);

    return {
      aptName, addr, lat, lng, recs,
      scores, total: Math.round(total * 10) / 10,
      grade: total>=80?'S': total>=70?'A': total>=60?'B': total>=50?'C':'D',
      details: {
        시세: p1.details, 핵심시설: p2.details, 교통: p3.details,
        학군: p4.details, 편의: p5.details, 건물: p6.details, 가격: p7.details,
        facilities: p2.facilities,
      },
      weights: WEIGHTS,
    };
  }

  // ── Public API ────────────────────────────────────────────
  return {
    analyze,
    kakaoKeyword,
    fmtPrice,
    fmtDist,
    haversine,
    KEY_FACILITIES,
  };
})();
