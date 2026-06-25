/* =========================================================================
 *  자린고비 햄스터 🐹  —  하루 예산을 굴려주는 귀여운 절약 앱
 *  데이터는 전부 localStorage 에만 저장됩니다. (로그인/서버 없음)
 * ========================================================================= */

(function () {
  "use strict";

  // ---------------------------------------------------------------------
  //  저장소
  // ---------------------------------------------------------------------
  var STORE_KEY = "jaringobi-hamster.v1";

  /** @returns {{goalAmount:number, totalDays:number, startDate:string, dailyBase:number, entries:Object<string,number>}|null} */
  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.totalDays || !s.goalAmount) return null;
      if (!s.entries) s.entries = {};
      return s;
    } catch (e) {
      return null;
    }
  }

  function saveState(s) {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  }

  function resetState() {
    localStorage.removeItem(STORE_KEY);
  }

  // ---------------------------------------------------------------------
  //  날짜 유틸 (로컬 기준, YYYY-MM-DD)
  // ---------------------------------------------------------------------
  function toKey(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }
  function fromKey(k) {
    var p = k.split("-");
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function todayKey() { return toKey(new Date()); }
  function addDays(key, n) {
    var d = fromKey(key);
    d.setDate(d.getDate() + n);
    return toKey(d);
  }
  function diffDays(aKey, bKey) {
    // bKey - aKey, 일 단위
    var a = fromKey(aKey), b = fromKey(bKey);
    return Math.round((b - a) / 86400000);
  }
  function prettyDate(key) {
    var d = fromKey(key);
    var dow = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    return (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + dow + ")";
  }

  // ---------------------------------------------------------------------
  //  숫자 유틸
  // ---------------------------------------------------------------------
  function won(n) {
    var v = Math.round(n);
    return v.toLocaleString("ko-KR") + "원";
  }
  function comma(n) { return Math.round(n).toLocaleString("ko-KR"); }
  function parseNum(str) {
    var digits = String(str).replace(/[^0-9]/g, "");
    return digits ? parseInt(digits, 10) : 0;
  }

  // ---------------------------------------------------------------------
  //  핵심 계산 로직  (스펙의 예시와 정확히 일치)
  //  - dailyBase = goalAmount / totalDays
  //  - 어떤 날의 carry(이월 잔액) = 그 이전까지 기록된 모든 날의 (base - spent) 합
  //  - 오늘 쓸 수 있는 금액 = base + carry
  //  - 오늘 입력 시 결과 = (오늘 쓸 수 있는 금액 - 실제 지출)
  //        + 면 적립 → 다음날로 이월,  - 면 초과 → 다음날 예산에서 차감
  //  (오늘 available - spent 가 곧 다음 carry 이며, 이는 base-spent 의 누적합과 동일)
  // ---------------------------------------------------------------------

  /** 시작일부터 targetKey "이전" 날까지 기록된 (base - spent)의 누적 = targetKey 시작 시점 carry */
  function carryBefore(s, targetKey) {
    var carry = 0;
    var keys = Object.keys(s.entries);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      // targetKey 보다 앞선 날짜만 합산
      if (diffDays(k, targetKey) > 0) {
        carry += (s.dailyBase - s.entries[k]);
      }
    }
    return carry;
  }

  /** 오늘 기준 종합 정보 */
  function compute(s) {
    var tKey = todayKey();
    var dayNumber = Math.max(1, diffDays(s.startDate, tKey) + 1); // 1-based
    var elapsed = Math.min(s.totalDays, Math.max(0, diffDays(s.startDate, tKey) + 1));
    var remaining = Math.max(0, s.totalDays - diffDays(s.startDate, tKey) - 1);

    var carry = carryBefore(s, tKey);             // 오늘 시작 시점 이월 잔액
    var available = s.dailyBase + carry;          // 오늘 쓸 수 있는 금액
    var todaySpent = s.entries[tKey];             // 오늘 입력값 (undefined 가능)
    var loggedToday = todaySpent !== undefined;

    // 누적: 기록된 모든 날의 base 합 - 지출 합  (= 현재까지 총 절약/잔액)
    var totalAllocated = 0, totalSpent = 0, savedDays = 0, overDays = 0;
    Object.keys(s.entries).forEach(function (k) {
      totalAllocated += s.dailyBase;
      totalSpent += s.entries[k];
      var d = s.dailyBase - s.entries[k];
      if (d > 0) savedDays++; else if (d < 0) overDays++;
    });
    var totalBalance = totalAllocated - totalSpent; // 누적 적립(+)/초과(-)

    // 기간이 끝났는지 (마지막 날 다음날 이후)
    var lastDayKey = addDays(s.startDate, s.totalDays - 1);
    var finished = diffDays(lastDayKey, tKey) > 0;

    // 진행률: 경과일 / 전체일
    var progress = Math.min(1, Math.max(0, diffDays(s.startDate, tKey) + 1) / s.totalDays);

    return {
      tKey: tKey,
      dayNumber: Math.min(dayNumber, s.totalDays),
      elapsed: elapsed,
      remaining: remaining,
      carry: carry,
      available: available,
      todaySpent: todaySpent,
      loggedToday: loggedToday,
      totalBalance: totalBalance,
      totalSpent: totalSpent,
      goalAmount: s.goalAmount,
      savedDays: savedDays,
      overDays: overDays,
      finished: finished,
      progress: progress
    };
  }

  // ---------------------------------------------------------------------
  //  햄스터 마스코트 SVG  (표정 3종: happy / neutral / sad)
  //  크림/베이지 톤, 동전을 안고 있는 자린고비 햄스터
  // ---------------------------------------------------------------------
  function hamsterSVG(mood) {
    mood = mood || "neutral";

    var eyes, mouth, brows, blush, sparkle = "";
    if (mood === "happy") {
      // 행복: 반달 눈 + 활짝 웃는 입
      eyes =
        '<path d="M70 96 q9 -11 18 0" stroke="#2B2620" stroke-width="4.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M112 96 q9 -11 18 0" stroke="#2B2620" stroke-width="4.5" fill="none" stroke-linecap="round"/>';
      mouth = '<path d="M92 112 q8 12 16 0" stroke="#7A4A2B" stroke-width="3.5" fill="none" stroke-linecap="round"/>';
      blush = '<ellipse cx="64" cy="108" rx="11" ry="7" fill="#FFC2A1" opacity=".75"/>' +
              '<ellipse cx="136" cy="108" rx="11" ry="7" fill="#FFC2A1" opacity=".75"/>';
      sparkle = '<text x="150" y="64" font-size="22">✨</text><text x="34" y="74" font-size="18">✨</text>';
    } else if (mood === "sad") {
      // 시무룩: 처진 눈 + 작은 입
      eyes =
        '<circle cx="79" cy="98" r="6.5" fill="#2B2620"/>' +
        '<circle cx="121" cy="98" r="6.5" fill="#2B2620"/>' +
        '<circle cx="81" cy="96" r="2" fill="#fff"/>' +
        '<circle cx="123" cy="96" r="2" fill="#fff"/>';
      brows =
        '<path d="M68 84 q10 4 18 9" stroke="#2B2620" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M132 84 q-10 4 -18 9" stroke="#2B2620" stroke-width="3.5" fill="none" stroke-linecap="round"/>';
      mouth = '<path d="M92 116 q8 -8 16 0" stroke="#7A4A2B" stroke-width="3.5" fill="none" stroke-linecap="round"/>';
      blush = '<ellipse cx="64" cy="110" rx="9" ry="6" fill="#B8C7E0" opacity=".6"/>' +
              '<ellipse cx="136" cy="110" rx="9" ry="6" fill="#B8C7E0" opacity=".6"/>';
      sparkle = '<text x="138" y="78" font-size="16">💧</text>';
    } else {
      // 평범/만족: 동그란 눈 + 작은 미소
      eyes =
        '<circle cx="79" cy="96" r="7" fill="#2B2620"/>' +
        '<circle cx="121" cy="96" r="7" fill="#2B2620"/>' +
        '<circle cx="82" cy="93" r="2.2" fill="#fff"/>' +
        '<circle cx="124" cy="93" r="2.2" fill="#fff"/>';
      mouth = '<path d="M94 110 q6 6 12 0" stroke="#7A4A2B" stroke-width="3.5" fill="none" stroke-linecap="round"/>';
      blush = '<ellipse cx="64" cy="106" rx="10" ry="6" fill="#FFC2A1" opacity=".6"/>' +
              '<ellipse cx="136" cy="106" rx="10" ry="6" fill="#FFC2A1" opacity=".6"/>';
    }

    return (
      '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<defs>' +
          '<radialGradient id="body" cx="50%" cy="38%" r="70%">' +
            '<stop offset="0%" stop-color="#FBEBCB"/>' +
            '<stop offset="100%" stop-color="#EFD6A8"/>' +
          '</radialGradient>' +
        '</defs>' +
        // 그림자
        '<ellipse cx="100" cy="184" rx="58" ry="11" fill="#E4D2B0" opacity=".5"/>' +
        // 귀
        '<ellipse cx="62" cy="48" rx="20" ry="22" fill="#EFD6A8"/>' +
        '<ellipse cx="138" cy="48" rx="20" ry="22" fill="#EFD6A8"/>' +
        '<ellipse cx="62" cy="50" rx="11" ry="13" fill="#C99A6A"/>' +
        '<ellipse cx="138" cy="50" rx="11" ry="13" fill="#C99A6A"/>' +
        // 머리/몸
        '<ellipse cx="100" cy="104" rx="74" ry="70" fill="url(#body)"/>' +
        // 얼굴 밝은 부분
        '<ellipse cx="100" cy="112" rx="50" ry="44" fill="#FFF4DC"/>' +
        blush +
        (brows || "") +
        eyes +
        // 코
        '<ellipse cx="100" cy="104" rx="6.5" ry="5" fill="#F2879B"/>' +
        mouth +
        // 손 + 동전 (자린고비!)
        '<ellipse cx="100" cy="150" rx="26" ry="24" fill="#FFD15B" stroke="#E9A93C" stroke-width="3"/>' +
        '<text x="100" y="158" font-size="20" text-anchor="middle" fill="#B5781E" font-family="Jua, sans-serif">₩</text>' +
        '<ellipse cx="78" cy="150" rx="11" ry="9" fill="#F4DCAF"/>' +
        '<ellipse cx="122" cy="150" rx="11" ry="9" fill="#F4DCAF"/>' +
        sparkle +
      '</svg>'
    );
  }

  function moodFor(delta) {
    if (delta > 0) return "happy";
    if (delta < 0) return "sad";
    return "neutral";
  }

  // ---------------------------------------------------------------------
  //  렌더링 헬퍼
  // ---------------------------------------------------------------------
  var app = document.getElementById("app");
  var currentRoute = null;

  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  function render(node) {
    app.innerHTML = "";
    app.appendChild(node);
  }

  // 숫자 카운트업 애니메이션
  function countUp(node, to, opts) {
    opts = opts || {};
    var dur = opts.dur || 700;
    var fmt = opts.fmt || comma;
    var from = opts.from || 0;
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      var val = from + (to - from) * eased;
      node.textContent = fmt(val);
      if (p < 1) requestAnimationFrame(step);
      else node.textContent = fmt(to);
    }
    requestAnimationFrame(step);
  }

  // 통화 입력에 콤마 자동 포맷
  function attachCommaInput(input, onChange) {
    input.addEventListener("input", function () {
      var caretFromEnd = input.value.length - input.selectionStart;
      var n = parseNum(input.value);
      input.value = n ? comma(n) : "";
      var pos = Math.max(0, input.value.length - caretFromEnd);
      try { input.setSelectionRange(pos, pos); } catch (e) {}
      if (onChange) onChange(n);
    });
  }

  // ---------------------------------------------------------------------
  //  1) 설정(온보딩) 화면
  // ---------------------------------------------------------------------
  function ScreenSetup() {
    var state = { days: null, amount: null, startDate: todayKey() };

    var node = el(
      '<div class="screen">' +
        '<div class="brand">자린고비 햄스터 <span class="dot">🐹</span></div>' +
        '<div class="speech">함께 목표를 세워볼까요?<br>하루 예산을 제가 똑똑하게 나눠둘게요!</div>' +
        '<div class="mascot pop bounce" id="setup-mascot"></div>' +

        '<div class="card">' +
          '<div class="field">' +
            '<label>며칠 동안 모을까요?</label>' +
            '<div class="input-wrap">' +
              '<input id="in-days" inputmode="numeric" placeholder="0" />' +
              '<span class="suffix">일</span>' +
            '</div>' +
            '<div class="quick-row" id="days-chips">' +
              '<button class="chip" data-v="7">일주일</button>' +
              '<button class="chip" data-v="30">한 달</button>' +
              '<button class="chip" data-v="100">100일</button>' +
            '</div>' +
          '</div>' +

          '<div class="field">' +
            '<label>목표 금액은 얼마인가요?</label>' +
            '<div class="input-wrap">' +
              '<input id="in-amount" inputmode="numeric" placeholder="0" />' +
              '<span class="suffix">원</span>' +
            '</div>' +
            '<div class="quick-row" id="amount-chips">' +
              '<button class="chip" data-v="100000">10만</button>' +
              '<button class="chip" data-v="300000">30만</button>' +
              '<button class="chip" data-v="500000">50만</button>' +
            '</div>' +
          '</div>' +

          '<div class="field" style="margin-bottom:6px">' +
            '<label>언제부터 시작할까요?</label>' +
            '<div class="input-wrap">' +
              '<input id="in-start" type="date" style="text-align:left" value="' + state.startDate + '" />' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="card center" id="preview" style="background:var(--cream); box-shadow:none">' +
          '<div class="muted" style="font-size:14px">하루 예산</div>' +
          '<div style="font-family:\'Jua\',sans-serif;font-size:34px;color:var(--accent-deep);margin-top:4px" id="preview-amount">- 원</div>' +
          '<div class="muted" style="font-size:13px;margin-top:4px" id="preview-sub">금액과 기간을 입력해 주세요</div>' +
        '</div>' +

        '<div class="spacer"></div>' +
        '<button class="btn btn-primary" id="start-btn" disabled>시작하기</button>' +
        '<div class="fineprint">모든 기록은 이 브라우저에만 저장돼요 · 로그인 없이 시작</div>' +
      '</div>'
    );

    node.querySelector("#setup-mascot").innerHTML = hamsterSVG("happy");

    var inDays = node.querySelector("#in-days");
    var inAmount = node.querySelector("#in-amount");
    var inStart = node.querySelector("#in-start");
    var startBtn = node.querySelector("#start-btn");
    var previewAmount = node.querySelector("#preview-amount");
    var previewSub = node.querySelector("#preview-sub");

    function refresh() {
      state.days = parseNum(inDays.value);
      state.amount = parseNum(inAmount.value);
      state.startDate = inStart.value || todayKey();

      var valid = state.days > 0 && state.amount > 0;
      startBtn.disabled = !valid;

      if (valid) {
        var base = Math.round(state.amount / state.days);
        previewAmount.textContent = won(base);
        var endKey = addDays(state.startDate, state.days - 1);
        previewSub.textContent =
          state.days + "일 동안 매일 약 " + comma(base) + "원 · ~" + prettyDate(endKey);
      } else {
        previewAmount.textContent = "- 원";
        previewSub.textContent = "금액과 기간을 입력해 주세요";
      }
    }

    attachCommaInput(inDays); // 일수도 콤마(예: 1,000일) 허용
    attachCommaInput(inAmount);
    inDays.addEventListener("input", refresh);
    inAmount.addEventListener("input", refresh);
    inStart.addEventListener("change", refresh);

    node.querySelectorAll("#days-chips .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        inDays.value = comma(Number(c.dataset.v));
        markChips(node, "#days-chips", c);
        refresh();
      });
    });
    node.querySelectorAll("#amount-chips .chip").forEach(function (c) {
      c.addEventListener("click", function () {
        inAmount.value = comma(Number(c.dataset.v));
        markChips(node, "#amount-chips", c);
        refresh();
      });
    });

    startBtn.addEventListener("click", function () {
      if (startBtn.disabled) return;
      var base = Math.round(state.amount / state.days);
      var s = {
        goalAmount: state.amount,
        totalDays: state.days,
        startDate: state.startDate,
        dailyBase: base,
        entries: {}
      };
      saveState(s);
      go("home");
    });

    render(node);
  }

  function markChips(node, sel, active) {
    node.querySelectorAll(sel + " .chip").forEach(function (c) { c.classList.remove("on"); });
    active.classList.add("on");
  }

  // ---------------------------------------------------------------------
  //  2) 홈(메인) 화면
  // ---------------------------------------------------------------------
  function ScreenHome() {
    var s = loadState();
    if (!s) return ScreenSetup();
    var c = compute(s);

    if (c.finished) return ScreenCelebrate();

    var mood, speech;
    if (c.loggedToday) {
      var d = c.available - c.todaySpent;
      mood = moodFor(d);
      if (d > 0) speech = "오늘은 " + comma(d) + "원 아꼈어요! 내일이 더 든든해요 🐹";
      else if (d < 0) speech = "오늘은 " + comma(-d) + "원 더 썼어요. 내일 조금만 아껴봐요!";
      else speech = "오늘은 딱 맞게 썼어요. 완벽해요! 👏";
    } else {
      mood = c.carry < 0 ? "neutral" : "happy";
      speech = c.carry > 0
        ? "어제까진 " + comma(c.carry) + "원 적립! 오늘도 알뜰하게 가볼까요?"
        : (c.carry < 0
            ? "지금 " + comma(-c.carry) + "원 초과 중이에요. 오늘 조금만 아껴요!"
            : "오늘 하루도 알뜰하게 시작해볼까요? 🐹");
    }

    var overClass = c.available < 0 ? " over" : "";

    var node = el(
      '<div class="screen">' +
        '<div class="topbar">' +
          '<div class="brand">자린고비 햄스터 <span class="dot">🐹</span></div>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="icon-btn" id="to-history" title="기록">📅</button>' +
            '<button class="icon-btn" id="to-settings" title="설정">⚙️</button>' +
          '</div>' +
        '</div>' +

        '<div class="speech">' + speech + '</div>' +
        '<div class="mascot pop bounce" id="home-mascot"></div>' +

        '<div class="hero">' +
          '<div class="label">오늘 쓸 수 있는 금액</div>' +
          '<div class="big-amount' + overClass + '">' +
            '<span id="big-num">0</span><span class="won">원</span>' +
          '</div>' +
        '</div>' +

        '<div>' +
          '<div class="progress"><i id="prog-bar"></i></div>' +
          '<div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--ink-soft);padding:0 2px">' +
            '<span>' + c.dayNumber + '일차</span>' +
            '<span>' + Math.round(c.progress * 100) + '%</span>' +
            '<span>총 ' + s.totalDays + '일</span>' +
          '</div>' +
        '</div>' +

        '<div class="stats">' +
          '<div class="stat"><div class="v">' + c.remaining + '일</div><div class="k">남은 기간</div></div>' +
          '<div class="stat"><div class="v ' + (c.totalBalance >= 0 ? 'good' : 'bad') + '">' +
              (c.totalBalance >= 0 ? '+' : '−') + comma(Math.abs(c.totalBalance)) +
            '</div><div class="k">' + (c.totalBalance >= 0 ? '누적 적립' : '누적 초과') + '</div></div>' +
          '<div class="stat"><div class="v">' + comma(s.dailyBase) + '</div><div class="k">하루 기본예산</div></div>' +
        '</div>' +

        '<div class="spacer"></div>' +
        (c.loggedToday
          ? '<button class="btn btn-ghost" id="spend-btn">오늘 지출 다시 입력하기</button>'
          : '<button class="btn btn-primary" id="spend-btn">오늘 지출 입력하기</button>') +
      '</div>'
    );

    node.querySelector("#home-mascot").innerHTML = hamsterSVG(mood);
    node.querySelector("#spend-btn").addEventListener("click", function () { go("spend"); });
    node.querySelector("#to-history").addEventListener("click", function () { go("history"); });
    node.querySelector("#to-settings").addEventListener("click", openSettings);

    render(node);

    // 애니메이션
    requestAnimationFrame(function () {
      node.querySelector("#prog-bar").style.width = (c.progress * 100) + "%";
    });
    countUp(node.querySelector("#big-num"), c.available, { dur: 800 });
  }

  // ---------------------------------------------------------------------
  //  3) 지출 입력 화면
  // ---------------------------------------------------------------------
  function ScreenSpend() {
    var s = loadState();
    if (!s) return ScreenSetup();
    var c = compute(s);

    var node = el(
      '<div class="screen">' +
        '<div class="page-head">' +
          '<button class="icon-btn" id="back">←</button>' +
          '<h2>오늘 지출 입력</h2>' +
        '</div>' +

        '<div class="card center" style="background:var(--cream);box-shadow:none">' +
          '<div class="muted" style="font-size:14px">오늘 쓸 수 있는 금액</div>' +
          '<div style="font-family:\'Jua\',sans-serif;font-size:30px;color:' +
            (c.available < 0 ? 'var(--bad)' : 'var(--ink)') + ';margin-top:2px">' + won(c.available) + '</div>' +
          (c.carry !== 0
            ? '<div class="muted" style="font-size:12.5px;margin-top:3px">기본 ' + comma(s.dailyBase) + '원 ' +
                (c.carry > 0 ? '＋ 적립 ' + comma(c.carry) : '− 초과 ' + comma(-c.carry)) + '원</div>'
            : '') +
        '</div>' +

        '<div class="card">' +
          '<div class="field" style="margin-bottom:0">' +
            '<label>오늘 쓴 금액</label>' +
            '<div class="input-wrap">' +
              '<input id="in-spent" inputmode="numeric" placeholder="0" autofocus />' +
              '<span class="suffix">원</span>' +
            '</div>' +
            '<div class="quick-row" id="spent-chips">' +
              '<button class="chip" data-v="0">안 썼어요</button>' +
              '<button class="chip" data-add="1000">+1천</button>' +
              '<button class="chip" data-add="5000">+5천</button>' +
              '<button class="chip" data-add="10000">+1만</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="spacer"></div>' +
        '<button class="btn btn-primary" id="submit" disabled>입력 완료</button>' +
      '</div>'
    );

    var inSpent = node.querySelector("#in-spent");
    var submit = node.querySelector("#submit");
    var touched = false;

    if (c.loggedToday) {
      inSpent.value = comma(c.todaySpent);
      touched = true;
      submit.disabled = false;
    }

    function refresh() { submit.disabled = !touched; }
    attachCommaInput(inSpent, function () { touched = true; refresh(); });

    node.querySelectorAll("#spent-chips .chip").forEach(function (ch) {
      ch.addEventListener("click", function () {
        if (ch.dataset.add) {
          inSpent.value = comma(parseNum(inSpent.value) + Number(ch.dataset.add));
        } else {
          inSpent.value = comma(Number(ch.dataset.v));
        }
        touched = true;
        refresh();
      });
    });

    node.querySelector("#back").addEventListener("click", function () { go("home"); });

    submit.addEventListener("click", function () {
      if (submit.disabled) return;
      var spent = parseNum(inSpent.value);
      var s2 = loadState();
      s2.entries[c.tKey] = spent;
      saveState(s2);
      ScreenResult(c.available, spent);
    });

    render(node);
    setTimeout(function () { try { inSpent.focus(); } catch (e) {} }, 250);
  }

  // ---------------------------------------------------------------------
  //  지출 결과 피드백 화면 (햄스터 반응)
  // ---------------------------------------------------------------------
  function ScreenResult(available, spent) {
    var delta = available - spent;       // + 적립, - 초과
    var mood = moodFor(delta);
    var nextKey = addDays(todayKey(), 1);

    var title, sub, pillCls, pillTxt, amtCls;
    if (delta > 0) {
      title = "와! 오늘 " + comma(delta) + "원 아꼈어요 🐹";
      sub = "아낀 만큼 내일 예산에 그대로 적립됐어요.";
      pillCls = "save"; pillTxt = "＋ 적립"; amtCls = "save";
    } else if (delta < 0) {
      title = "오늘은 " + comma(-delta) + "원 초과했어요";
      sub = "초과한 만큼 내일 예산에서 차감돼요. 내일은 조금만 아껴봐요!";
      pillCls = "over"; pillTxt = "− 초과"; amtCls = "over";
    } else {
      title = "딱 맞게 썼어요! 완벽해요 👏";
      sub = "이월 없이 깔끔하게 마무리됐어요.";
      pillCls = "even"; pillTxt = "딱 맞음"; amtCls = "even";
    }

    var s = loadState();
    var c = compute(s);
    var nextAvailable = s.dailyBase + delta; // 다음날 기본예산 + 오늘 이월
    // (단, 기간 종료 여부는 홈에서 처리)

    var node = el(
      '<div class="screen center" style="justify-content:center;text-align:center">' +
        '<div class="spacer"></div>' +
        '<div class="speech">' + title + '</div>' +
        '<div class="mascot pop ' + (delta < 0 ? 'shake' : 'bounce') + '" id="res-mascot"></div>' +
        '<div style="margin-top:6px"><span class="pill ' + pillCls + '">' + pillTxt + '</span></div>' +
        '<div class="result-amount ' + amtCls + '" style="margin-top:10px">' +
          (delta > 0 ? "＋" : delta < 0 ? "−" : "") + '<span id="res-num">0</span>원</div>' +
        '<div class="muted" style="margin-top:10px;line-height:1.5;padding:0 14px">' + sub + '</div>' +

        '<div class="card" style="margin-top:22px;text-align:left">' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<div class="muted" style="font-size:14px">오늘 쓴 금액</div>' +
            '<div style="font-family:\'Jua\',sans-serif;font-size:18px">' + won(spent) + '</div>' +
          '</div>' +
          '<div style="height:1px;background:var(--beige);margin:13px 0"></div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<div class="muted" style="font-size:14px">내일 쓸 수 있는 금액</div>' +
            '<div style="font-family:\'Jua\',sans-serif;font-size:18px;color:' +
              (nextAvailable < 0 ? 'var(--bad)' : 'var(--accent-deep)') + '">' + won(nextAvailable) + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="spacer"></div>' +
        '<button class="btn btn-primary" id="done">확인</button>' +
      '</div>'
    );

    node.querySelector("#res-mascot").innerHTML = hamsterSVG(mood);
    node.querySelector("#done").addEventListener("click", function () { go("home"); });
    render(node);

    countUp(node.querySelector("#res-num"), Math.abs(delta), { dur: 750 });
  }

  // ---------------------------------------------------------------------
  //  4) 기록 / 캘린더 화면
  // ---------------------------------------------------------------------
  function ScreenHistory() {
    var s = loadState();
    if (!s) return ScreenSetup();

    // 시작일~오늘(또는 종료일)까지 날짜 리스트
    var lastIdx = Math.min(s.totalDays - 1, diffDays(s.startDate, todayKey()));
    var rows = [];
    for (var i = 0; i <= Math.max(lastIdx, 0); i++) {
      var key = addDays(s.startDate, i);
      var spent = s.entries[key];
      rows.push({ idx: i, key: key, spent: spent });
    }

    var listHTML = "";
    if (Object.keys(s.entries).length === 0) {
      listHTML = '<div class="empty">아직 기록이 없어요.<br>오늘 지출을 입력하면 여기에 차곡차곡 쌓여요! 🐹</div>';
    } else {
      rows.slice().reverse().forEach(function (r) {
        var logged = r.spent !== undefined;
        var delta = logged ? (s.dailyBase - r.spent) : null;
        var dcls = !logged ? "even" : delta > 0 ? "save" : delta < 0 ? "over" : "even";
        var dtxt = !logged ? "미입력"
          : delta > 0 ? "＋" + comma(delta) + " 적립"
          : delta < 0 ? "−" + comma(-delta) + " 초과"
          : "딱 맞음";
        listHTML +=
          '<div class="h-item">' +
            '<div class="date"><b>' + (r.idx + 1) + '일차</b>' + prettyDate(r.key) + '</div>' +
            '<div class="nums">' +
              '<div class="spent">' + (logged ? won(r.spent) : "—") + '</div>' +
              '<div class="delta ' + dcls + '">' + dtxt + '</div>' +
            '</div>' +
          '</div>';
      });
    }

    var node = el(
      '<div class="screen">' +
        '<div class="page-head">' +
          '<button class="icon-btn" id="back">←</button>' +
          '<h2>나의 절약 기록</h2>' +
        '</div>' +
        '<div id="cal-mount"></div>' +
        '<div class="history-list">' + listHTML + '</div>' +
        '<div class="spacer"></div>' +
      '</div>'
    );

    node.querySelector("#cal-mount").appendChild(buildCalendar(s, rows));
    node.querySelector("#back").addEventListener("click", function () { go("home"); });
    render(node);
  }

  function buildCalendar(s, rows) {
    // 시작일이 속한 주의 일요일부터 그리드 구성
    var startD = fromKey(s.startDate);
    var leadBlanks = startD.getDay(); // 0(일)~6(토)
    var cellsHTML = "";
    var dows = ["일", "월", "화", "수", "목", "금", "토"];
    dows.forEach(function (d) { cellsHTML += '<div class="cal-dow">' + d + '</div>'; });
    for (var b = 0; b < leadBlanks; b++) cellsHTML += '<div class="cal-cell empty-cell"></div>';

    var tKey = todayKey();
    rows.forEach(function (r) {
      var logged = r.spent !== undefined;
      var delta = logged ? (s.dailyBase - r.spent) : null;
      var cls = !logged ? "" : delta > 0 ? "save" : delta < 0 ? "over" : "even";
      var isToday = r.key === tKey ? " today" : "";
      var d = fromKey(r.key);
      var badge = logged
        ? (delta > 0 ? "+" + shortNum(delta) : delta < 0 ? "−" + shortNum(-delta) : "0")
        : "";
      cellsHTML +=
        '<div class="cal-cell ' + cls + isToday + '">' +
          '<span class="d">' + d.getDate() + '</span>' +
          (badge ? '<span class="m">' + badge + '</span>' : '') +
        '</div>';
    });

    var node = el(
      '<div class="cal">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div style="font-family:\'Jua\',sans-serif;font-size:16px">한눈에 보기</div>' +
          '<div style="font-size:12px;color:var(--ink-soft)">' +
            '<span style="color:var(--good)">●</span> 적립 ' +
            '<span style="color:var(--bad);margin-left:6px">●</span> 초과</div>' +
        '</div>' +
        '<div class="cal-grid">' + cellsHTML + '</div>' +
      '</div>'
    );
    return node;
  }

  function shortNum(n) {
    if (n >= 10000) return (Math.round(n / 1000) / 10) + "만";
    if (n >= 1000) return Math.round(n / 1000) + "천";
    return String(n);
  }

  // ---------------------------------------------------------------------
  //  5) 목표 종료 축하 화면
  // ---------------------------------------------------------------------
  function ScreenCelebrate() {
    var s = loadState();
    var c = compute(s);
    var totalSaved = c.goalAmount - c.totalSpent; // 목표 대비 아낀 총액
    var positive = totalSaved >= 0;

    var node = el(
      '<div class="screen celebrate" style="justify-content:center">' +
        '<div class="spacer"></div>' +
        '<div class="speech">' +
          (positive
            ? '대단해요! 목표 기간 동안 알뜰하게 잘 모았어요 🎉'
            : '목표는 살짝 넘었지만, 끝까지 해낸 게 멋져요! 🐹') +
        '</div>' +
        '<div class="mascot pop bounce" id="cel-mascot"></div>' +
        '<div class="muted" style="margin-top:6px;font-size:15px">' +
          (positive ? '목표보다 아낀 금액' : '목표보다 더 쓴 금액') + '</div>' +
        '<div class="total" style="color:' + (positive ? 'var(--accent-deep)' : 'var(--bad)') + '">' +
          (positive ? '＋' : '−') + '<span id="cel-num">0</span>원</div>' +

        '<div class="stats" style="margin-top:20px">' +
          '<div class="stat"><div class="v">' + s.totalDays + '일</div><div class="k">목표 기간</div></div>' +
          '<div class="stat"><div class="v good">' + c.savedDays + '일</div><div class="k">아낀 날</div></div>' +
          '<div class="stat"><div class="v bad">' + c.overDays + '일</div><div class="k">초과한 날</div></div>' +
        '</div>' +

        '<div class="card" style="margin-top:16px;text-align:left">' +
          '<div style="display:flex;justify-content:space-between"><span class="muted">목표 금액</span>' +
            '<b style="font-family:\'Jua\',sans-serif;font-weight:400">' + won(c.goalAmount) + '</b></div>' +
          '<div style="height:1px;background:var(--beige);margin:12px 0"></div>' +
          '<div style="display:flex;justify-content:space-between"><span class="muted">실제 쓴 금액</span>' +
            '<b style="font-family:\'Jua\',sans-serif;font-weight:400">' + won(c.totalSpent) + '</b></div>' +
        '</div>' +

        '<div class="spacer"></div>' +
        '<button class="btn btn-primary" id="restart">새 목표 시작하기</button>' +
        '<button class="btn btn-text" id="view-history" style="margin:6px auto 0">기록 다시 보기</button>' +
      '</div>'
    );

    node.querySelector("#cel-mascot").innerHTML = hamsterSVG(positive ? "happy" : "neutral");
    node.querySelector("#restart").addEventListener("click", function () {
      resetState();
      go("setup");
    });
    node.querySelector("#view-history").addEventListener("click", function () { go("history"); });
    render(node);

    countUp(node.querySelector("#cel-num"), Math.abs(totalSaved), { dur: 1100 });
    if (positive) launchConfetti();
  }

  function launchConfetti() {
    var colors = ["#FF8A3D", "#FFD15B", "#2BBF7E", "#FFB088", "#F2879B"];
    var box = document.createElement("div");
    box.className = "confetti";
    for (var i = 0; i < 60; i++) {
      var p = document.createElement("i");
      var left = (i * 1.7 + (i % 5) * 4) % 100;
      p.style.left = left + "%";
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = (2 + (i % 5) * 0.4) + "s";
      p.style.animationDelay = ((i % 10) * 0.12) + "s";
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 5000);
  }

  // ---------------------------------------------------------------------
  //  설정 시트 (재설정/초기화)
  // ---------------------------------------------------------------------
  function openSettings() {
    var s = loadState();
    var msg =
      "목표를 다시 설정할까요?\n\n" +
      "[확인] 새 목표 만들기 (기존 기록 삭제)\n" +
      "[취소] 그대로 두기";
    if (confirm(msg)) {
      resetState();
      go("setup");
    }
  }

  // ---------------------------------------------------------------------
  //  라우터
  // ---------------------------------------------------------------------
  var routes = {
    setup: ScreenSetup,
    home: ScreenHome,
    spend: ScreenSpend,
    history: ScreenHistory,
    celebrate: ScreenCelebrate
  };

  function go(route) {
    currentRoute = route;
    window.scrollTo(0, 0);
    (routes[route] || ScreenHome)();
  }

  // 시작
  function boot() {
    var s = loadState();
    if (s) go("home");
    else go("setup");
  }

  boot();
})();
