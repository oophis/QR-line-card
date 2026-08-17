/**
 * app.js — ตัวอ่านการ์ด
 *
 * หน้า 1..n-1  : เปิดดูได้ไม่จำกัด
 * หน้าสุดท้าย  : gate — เลือกซ้าย/ขวาได้ครั้งเดียว และแสดงเนื้อหาครั้งเดียว
 *
 * สถานะของ gate มี 3 แบบ
 *   choose  : ยังไม่เคยเลือก
 *   reveal  : เพิ่งเลือกใน session นี้ (มีอยู่ในหน่วยความจำเท่านั้น)
 *   sealed  : เคยเลือก+ดูไปแล้ว (อ่านจาก CardStore)
 */
(function () {
  'use strict';

  var CARD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

  /**
   * ภาพประกอบพื้นหลังแบบลายเส้น (ไม่ลงสี) — วางเป็นวอเตอร์มาร์กจางๆ หลังข้อความ
   * เพิ่มลายใหม่ได้ที่นี่ แล้วอ้างถึงด้วย page.art: '<key>' ใน card-data.js
   */
  var CARD_ART = {
    cake:
      '<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" ' +
      'stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
      '<ellipse cx="100" cy="168" rx="64" ry="9"/>' +
      '<path d="M40 168 L40 124 Q40 120 44 120 L156 120 Q160 120 160 124 L160 168"/>' +
      '<path d="M40 120 q9 -13 18 0 q9 -13 18 0 q9 -13 18 0 q9 -13 18 0 q9 -13 18 0 q9 -13 18 0"/>' +
      '<path d="M68 120 L68 84 Q68 80 72 80 L128 80 Q132 80 132 84 L132 120"/>' +
      '<path d="M68 80 q7 -11 14 0 q7 -11 14 0 q7 -11 14 0 q7 -11 14 0"/>' +
      '<line x1="100" y1="80" x2="100" y2="54"/>' +
      '<path d="M100 36 c-7 7 -7 14 0 20 c7 -6 7 -13 0 -20 Z"/>' +
      // จุดเทียน: แต้มสีอุ่นๆ เล็กน้อยตรงปลายเทียน ท่ามกลางลายเส้นล้วน
      '<circle cx="100" cy="44" r="9" fill="#ffcf8a" opacity="0.55" stroke="none"/>' +
      '<circle cx="100" cy="44" r="3.6" fill="#ff8a2b" stroke="none"/>' +
      '<path d="M150 52 v14 M143 59 h14"/>' +
      '<path d="M56 96 v10 M51 101 h10"/>' +
      '</svg>',

    'sleepy-cat':
      '<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="4" ' +
      'stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M64 150 Q60 190 100 190 Q140 190 136 150"/>' +
      '<path d="M132 168 Q168 170 162 128 Q158 100 130 104"/>' +
      '<circle cx="100" cy="112" r="38"/>' +
      '<path d="M76 82 L64 48 L96 76 Z"/>' +
      '<path d="M124 82 L136 48 L104 76 Z"/>' +
      '<path d="M82 104 q7 8 14 0"/>' +
      '<path d="M104 104 q7 8 14 0"/>' +
      '<path d="M96 120 L104 120 L100 126 Z"/>' +
      '<path d="M92 130 Q96 136 100 130 Q104 136 108 130"/>' +
      '<path d="M74 116 L46 111 M74 123 L46 123 M74 130 L46 135"/>' +
      '<path d="M126 116 L154 111 M126 123 L154 123 M126 130 L154 135"/>' +
      '<path d="M132 42 h12 l-12 12 h12"/>' +
      '<path d="M148 60 h9 l-9 9 h9"/>' +
      '<path d="M160 76 h6 l-6 6 h6"/>' +
      '</svg>',
  };

  var state = {
    cardId: null,
    card: null,
    index: 0,
    slideCount: 0,
    /** true เฉพาะช่วงที่เพิ่งเลือกใน session นี้ — รีเฟรชแล้วหายไป */
    revealActive: false,
    revealedChoice: null,
    dev: false,
  };

  var el = {};

  /* ---------------- utilities ---------------- */

  function qs(id) { return document.getElementById(id); }

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function elem(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function paragraphs(container, lines) {
    (lines || []).forEach(function (line) {
      container.appendChild(elem('p', 'body-line', line));
    });
  }

  function formatDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try {
      return d.toLocaleString('th-TH', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch (e) {
      return d.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  /* ---------------- confirm modal ---------------- */

  function showConfirm(opts) {
    return new Promise(function (resolve) {
      var overlay = elem('div', 'modal-overlay');
      var box = elem('div', 'modal');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');

      box.appendChild(elem('h2', 'modal-title', opts.title));
      box.appendChild(elem('p', 'modal-message', opts.message));

      var actions = elem('div', 'modal-actions');
      var cancel = elem('button', 'btn btn-ghost', opts.cancelLabel || 'ยกเลิก');
      var confirm = elem('button', 'btn btn-primary', opts.confirmLabel || 'ยืนยัน');
      cancel.type = 'button';
      confirm.type = 'button';
      actions.appendChild(cancel);
      actions.appendChild(confirm);
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      function close(result) {
        document.removeEventListener('keydown', onKey);
        overlay.parentNode && overlay.parentNode.removeChild(overlay);
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape') close(false);
      }

      cancel.addEventListener('click', function () { close(false); });
      confirm.addEventListener('click', function () { close(true); });
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close(false);
      });
      document.addEventListener('keydown', onKey);

      requestAnimationFrame(function () {
        overlay.classList.add('is-open');
        confirm.focus();
      });
    });
  }

  /* ---------------- rendering: pages ---------------- */

  function renderCardArt(key) {
    var svg = CARD_ART[key];
    if (!svg) return null;
    var wrap = elem('div', 'card-art card-art-' + key);
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = svg;
    return wrap;
  }

  function renderPage(page) {
    var slide = elem('section', 'slide');
    var card = elem('article', 'card');

    // ลายเส้นพื้นหลัง (ถ้ามี) เป็น absolute ไม่กินพื้นที่ flex ของการ์ด
    if (page.art) {
      var art = renderCardArt(page.art);
      if (art) card.appendChild(art);
    }

    if (page.eyebrow) card.appendChild(elem('div', 'eyebrow', page.eyebrow));
    card.appendChild(elem('h1', 'card-title', page.title));

    var bodyWrap = elem('div', 'card-body');
    paragraphs(bodyWrap, page.body);
    card.appendChild(bodyWrap);

    if (page.note) card.appendChild(elem('div', 'note', page.note));

    slide.appendChild(card);
    return slide;
  }

  /* ---------------- rendering: gate ---------------- */

  function renderGate() {
    var gate = state.card.gate;
    var slide = elem('section', 'slide slide-gate');
    var card = elem('article', 'card card-gate');

    var saved = CardStore.read(state.cardId);

    if (state.revealActive && state.revealedChoice) {
      // ตัดป้าย "หน้า 3" ออกในสถานะที่พื้นที่ตึงอยู่แล้ว (ตัวนับด้านบนบอกอยู่แล้วว่าอยู่หน้าไหน)
      renderReveal(card, gate, state.revealedChoice);
    } else if (saved) {
      renderSealed(card, gate, saved);
    } else {
      if (gate.eyebrow) card.appendChild(elem('div', 'eyebrow', gate.eyebrow));
      renderChoose(card, gate);
    }

    slide.appendChild(card);
    return slide;
  }

  function renderChoose(card, gate) {
    card.appendChild(elem('h1', 'card-title', gate.title));
    card.appendChild(elem('p', 'gate-prompt', gate.prompt));

    var picker = elem('div', 'picker');
    ['left', 'right'].forEach(function (side) {
      var opt = gate.options[side];
      var btn = elem('button', 'option option-' + side);
      btn.type = 'button';
      btn.setAttribute('aria-label', 'เลือก' + opt.label);

      btn.appendChild(elem('div', 'option-icon', opt.icon || ''));
      btn.appendChild(elem('div', 'option-label', opt.label));
      if (opt.teaser) btn.appendChild(elem('div', 'option-teaser', opt.teaser));

      btn.addEventListener('click', function () { attemptChoice(side); });
      picker.appendChild(btn);
    });
    card.appendChild(picker);

    card.appendChild(elem('div', 'warn', '⚠️ เลือกได้ครั้งเดียว เปิดดูได้ครั้งเดียว'));
  }

  function renderReveal(card, gate, side) {
    var opt = gate.options[side];
    card.classList.add('is-revealed');

    card.appendChild(elem('div', 'reveal-badge', 'คุณเลือก: ' + opt.label));
    card.appendChild(elem('h1', 'card-title', opt.title));

    var bodyWrap = elem('div', 'card-body');
    paragraphs(bodyWrap, opt.body);
    card.appendChild(bodyWrap);

    if (opt.code) {
      var codeBox = elem('div', 'code-box');
      codeBox.appendChild(elem('span', 'code-label', 'รหัส'));
      codeBox.appendChild(elem('strong', 'code-value', opt.code));
      card.appendChild(codeBox);
    }

    card.appendChild(elem('div', 'warn', '⚠️ แสดงครั้งเดียว ปิดแล้วดูซ้ำไม่ได้'));

    var close = elem('button', 'btn btn-primary btn-block', 'อ่านเสร็จแล้ว ปิดผนึก');
    close.type = 'button';
    close.addEventListener('click', function () {
      showConfirm({
        title: 'ปิดผนึกการ์ด?',
        message: 'ปิดแล้วจะไม่สามารถเปิดหน้านี้ได้อีก',
        confirmLabel: 'ปิดผนึก',
        cancelLabel: 'ขออ่านต่อ',
      }).then(function (ok) {
        if (!ok) return;
        state.revealActive = false;
        state.revealedChoice = null;
        render();
      });
    });
    card.appendChild(close);
  }

  function renderSealed(card, gate, saved) {
    var opt = gate.options[saved.choice];
    card.classList.add('is-sealed');

    card.appendChild(elem('div', 'seal-icon', '🔒'));
    card.appendChild(elem('h1', 'card-title', gate.sealedTitle));

    var bodyWrap = elem('div', 'card-body');
    paragraphs(bodyWrap, [gate.sealedBody]);
    card.appendChild(bodyWrap);

    var meta = elem('div', 'sealed-meta');
    meta.appendChild(elem('div', 'sealed-meta-row', 'สิ่งที่คุณเลือก: ' + (opt ? opt.label : saved.choice)));
    if (saved.chosenAt) {
      meta.appendChild(elem('div', 'sealed-meta-row', 'เปิดเมื่อ: ' + formatDateTime(saved.chosenAt)));
    }
    card.appendChild(meta);

    var back = elem('button', 'btn btn-ghost btn-block', 'กลับไปหน้า 1');
    back.type = 'button';
    back.addEventListener('click', function () { goTo(0); });
    card.appendChild(back);
  }

  /* ---------------- choice flow ---------------- */

  function attemptChoice(side) {
    var gate = state.card.gate;
    var opt = gate.options[side];

    showConfirm({
      title: 'เปิดฝั่ง "' + opt.label + '" ?',
      message: gate.confirmText,
      confirmLabel: 'ยืนยัน เปิดเลย',
      cancelLabel: 'ยังไม่เลือก',
    }).then(function (ok) {
      if (!ok) return;

      // ปิดผนึกทันทีที่ยืนยัน ไม่ใช่ตอนปิดหน้า
      // ถ้ารีเฟรชระหว่างอ่าน ถือว่าใช้สิทธิ์ไปแล้ว
      var saved = CardStore.seal(state.cardId, side);

      state.revealActive = true;
      state.revealedChoice = saved.choice;
      render();
    });
  }

  /* ---------------- navigation ---------------- */

  function isGate(index) {
    return index === state.slideCount - 1;
  }

  /** true ถ้ากำลังอ่านเนื้อหาที่เปิดครั้งเดียวอยู่ — ออกจากหน้าแล้วหายถาวร */
  function guardActive() {
    return state.revealActive && isGate(state.index);
  }

  function goTo(index) {
    if (index < 0 || index >= state.slideCount || index === state.index) return;

    if (guardActive()) {
      showConfirm({
        title: 'ออกจากหน้านี้?',
        message: 'เนื้อหาที่เปิดจะถูกปิดผนึกทันที และกลับมาดูไม่ได้อีก',
        confirmLabel: 'ออกและปิดผนึก',
        cancelLabel: 'ขออ่านต่อ',
      }).then(function (ok) {
        if (!ok) return;
        state.revealActive = false;
        state.revealedChoice = null;
        state.index = index;
        render();
      });
      return;
    }

    state.index = index;
    render();
  }

  function next() { goTo(state.index + 1); }
  function prev() { goTo(state.index - 1); }

  /* ---------------- swipe ---------------- */

  function bindSwipe(node) {
    var startX = 0, startY = 0, tracking = false;

    node.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      tracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    node.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

      // บนหน้าเลือก ปัดเพื่อ "เลือก" ไม่ใช่เปลี่ยนหน้า จึงต้องไม่ทำอะไรที่นี่
      if (isGate(state.index) && !state.revealActive && !CardStore.read(state.cardId)) return;

      if (dx < 0) next(); else prev();
    }, { passive: true });
  }

  /* ---------------- render ---------------- */

  function render() {
    clearNode(el.viewport);

    var slide = isGate(state.index)
      ? renderGate()
      : renderPage(state.card.pages[state.index]);
    el.viewport.appendChild(slide);

    renderDots();

    var lockedForward = isGate(state.index);
    el.prev.disabled = state.index === 0;
    el.next.disabled = lockedForward;
    el.counter.textContent = (state.index + 1) + ' / ' + state.slideCount;
  }

  function renderDots() {
    clearNode(el.dots);
    for (var i = 0; i < state.slideCount; i++) {
      var dot = elem('button', 'dot' + (i === state.index ? ' is-active' : ''));
      dot.type = 'button';
      dot.setAttribute('aria-label', 'ไปหน้า ' + (i + 1));
      if (isGate(i) && CardStore.read(state.cardId)) dot.classList.add('is-locked');
      (function (target) {
        dot.addEventListener('click', function () { goTo(target); });
      })(i);
      el.dots.appendChild(dot);
    }
  }

  /* ---------------- dev tools ---------------- */

  function renderDevBar() {
    var bar = elem('div', 'devbar');
    bar.appendChild(elem('span', 'devbar-label',
      'dev · card=' + state.cardId + ' · store=' + CardStore.backendName));

    var reset = elem('button', 'btn btn-ghost btn-sm', 'ล้างสถานะการ์ดนี้');
    reset.type = 'button';
    reset.addEventListener('click', function () {
      CardStore.reset(state.cardId);
      state.revealActive = false;
      state.revealedChoice = null;
      state.index = 0;
      render();
    });
    bar.appendChild(reset);
    document.body.appendChild(bar);
    // แถบนี้เป็น fixed ต้องเว้นที่ด้านล่างให้ ไม่งั้นทับปุ่มนำทาง
    document.body.classList.add('has-devbar');
  }

  /* ---------------- boot ---------------- */

  function fail(message) {
    clearNode(el.viewport);
    var card = elem('article', 'card');
    card.appendChild(elem('h1', 'card-title', 'เปิดการ์ดไม่ได้'));
    card.appendChild(elem('p', 'body-line', message));
    el.viewport.appendChild(card);
    el.nav.hidden = true;
  }

  function init() {
    el.viewport = qs('viewport');
    el.dots = qs('dots');
    el.prev = qs('prev');
    el.next = qs('next');
    el.counter = qs('counter');
    el.nav = qs('nav');
    el.brand = qs('brand');

    var data = window.CARD_DATA;
    var requested = param('c');
    var cardId = requested && CARD_ID_RE.test(requested) ? requested : data.defaultCardId;
    var card = data.cards[cardId];

    if (!card) {
      state.slideCount = 0;
      fail('ไม่พบการ์ด "' + cardId + '" — ตรวจสอบลิงก์หรือ QR อีกครั้ง');
      return;
    }

    state.cardId = cardId;
    state.card = card;
    state.slideCount = card.pages.length + 1;
    state.dev = param('dev') === '1';

    el.brand.textContent = card.brand || 'LINE QR Card';
    document.title = card.title || 'LINE QR Card';

    el.prev.addEventListener('click', prev);
    el.next.addEventListener('click', next);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    });
    bindSwipe(qs('stage'));

    render();
    if (state.dev) renderDevBar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
