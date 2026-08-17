/**
 * qr.js — สร้าง QR ที่ชี้ไปยัง index.html?c=<cardId>
 * ใช้ qrcode-generator (global `qrcode`) จาก assets/vendor-qrcode.js
 */
(function () {
  'use strict';

  var EC_LEVEL = 'M';   // กันเลอะ/ยับได้ราว 15% เหมาะกับการ์ดที่พิมพ์ออกมา
  var TYPE_AUTO = 0;    // ให้ไลบรารีเลือกขนาดเอง
  var QUIET = 4;        // ขอบขาวรอบ QR ตามสเปก
  var EXPORT_SCALE = 12; // px ต่อ 1 module ตอนบันทึก PNG

  var el = {};
  var lastUrl = '';

  function defaultBase() {
    var href = window.location.href.split('?')[0].split('#')[0];
    return href.replace(/qr\.html$/, '') || href;
  }

  function buildUrl(base, cardId) {
    var trimmed = (base || '').trim();
    if (!trimmed) throw new Error('ยังไม่ได้กรอกที่อยู่การ์ด');

    var url = new URL(trimmed, window.location.href);
    var id = (cardId || '').trim();
    if (id) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
        throw new Error('รหัสการ์ดใช้ได้เฉพาะ a-z A-Z 0-9 _ - (ไม่เกิน 64 ตัว)');
      }
      url.searchParams.set('c', id);
    }
    return url.toString();
  }

  function drawQr(canvas, text, scale) {
    var qr = qrcode(TYPE_AUTO, EC_LEVEL);
    qr.addData(text);
    qr.make();

    var count = qr.getModuleCount();
    var size = (count + QUIET * 2) * scale;

    canvas.width = size;
    canvas.height = size;

    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';

    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect((c + QUIET) * scale, (r + QUIET) * scale, scale, scale);
        }
      }
    }
    return size;
  }

  function showError(message) {
    el.error.textContent = message;
    el.error.hidden = false;
  }

  function clearError() {
    el.error.hidden = true;
    el.error.textContent = '';
  }

  function refresh() {
    var url;
    try {
      url = buildUrl(el.base.value, el.cardId.value);
    } catch (e) {
      lastUrl = '';
      el.link.textContent = '—';
      showError(e.message);
      return;
    }

    clearError();
    lastUrl = url;
    el.link.textContent = url;

    // วาดบนหน้าจอที่ความละเอียดพอดี ตอนบันทึกค่อยวาดใหม่ที่ scale สูง
    try {
      drawQr(el.canvas, url, 6);
    } catch (e) {
      showError('ลิงก์ยาวเกินไปสำหรับ QR — ลองย่อ URL ให้สั้นลง');
    }
  }

  function download() {
    if (!lastUrl) return;
    var offscreen = document.createElement('canvas');
    try {
      drawQr(offscreen, lastUrl, EXPORT_SCALE);
    } catch (e) {
      showError('สร้างไฟล์ไม่สำเร็จ: ลิงก์ยาวเกินไป');
      return;
    }

    var name = 'qr-' + (el.cardId.value.trim() || 'card') + '.png';
    offscreen.toBlob(function (blob) {
      if (!blob) { showError('บันทึกไฟล์ไม่สำเร็จ'); return; }
      var href = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
    }, 'image/png');
  }

  function copy() {
    if (!lastUrl) return;
    var done = function () {
      var original = el.copy.textContent;
      el.copy.textContent = 'คัดลอกแล้ว ✓';
      setTimeout(function () { el.copy.textContent = original; }, 1600);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lastUrl).then(done, fallback);
    } else {
      fallback();
    }

    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = lastUrl;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { showError('คัดลอกอัตโนมัติไม่ได้ กรุณาคัดลอกลิงก์ด้วยตัวเอง'); }
      document.body.removeChild(ta);
    }
  }

  function init() {
    el.base = document.getElementById('base');
    el.cardId = document.getElementById('cardId');
    el.canvas = document.getElementById('canvas');
    el.link = document.getElementById('link');
    el.error = document.getElementById('error');
    el.copy = document.getElementById('copy');
    el.download = document.getElementById('download');

    el.base.value = defaultBase();
    el.cardId.value = (window.CARD_DATA && window.CARD_DATA.defaultCardId) || 'demo';

    el.base.addEventListener('input', refresh);
    el.cardId.addEventListener('input', refresh);
    el.copy.addEventListener('click', copy);
    el.download.addEventListener('click', download);

    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
