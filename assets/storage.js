/**
 * storage.js — เก็บสถานะ "เลือกแล้ว / ดูแล้ว" ของแต่ละการ์ด
 *
 * ลำดับที่ลองใช้: localStorage -> cookie -> memory
 * (in-app browser ของ LINE บาง version ปิด localStorage จึงต้องมี fallback)
 *
 * สถานะที่เก็บ:
 *   { v, cardId, choice: 'left'|'right', chosenAt: <ISO>, sealed: true }
 *
 * หมายเหตุสำคัญ: sealed จะถูกเขียนทันทีที่ "ยืนยันการเลือก" ไม่ใช่ตอนปิดหน้า
 * ดังนั้นถ้าผู้ใช้รีเฟรช/ปิดเบราว์เซอร์ระหว่างอ่าน ก็ถือว่าใช้สิทธิ์ไปแล้ว
 * — นี่คือพฤติกรรมที่ต้องการ: เลือกครั้งเดียว ดูครั้งเดียว
 */
(function () {
  'use strict';

  var NS = 'lineqrcard';
  var VERSION = 1;
  var COOKIE_DAYS = 365 * 5;

  function keyFor(cardId) {
    return NS + ':v' + VERSION + ':' + cardId;
  }

  /* ---------- backend: localStorage ---------- */

  function lsAvailable() {
    try {
      var probe = NS + ':probe';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- backend: cookie ---------- */

  function cookieGet(name) {
    var parts = document.cookie ? document.cookie.split('; ') : [];
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      if (eq > -1 && decodeURIComponent(parts[i].slice(0, eq)) === name) {
        return decodeURIComponent(parts[i].slice(eq + 1));
      }
    }
    return null;
  }

  function cookieSet(name, value) {
    var expires = new Date(Date.now() + COOKIE_DAYS * 864e5).toUTCString();
    document.cookie =
      encodeURIComponent(name) + '=' + encodeURIComponent(value) +
      '; expires=' + expires + '; path=/; SameSite=Lax';
  }

  function cookieDel(name) {
    document.cookie =
      encodeURIComponent(name) + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
  }

  function cookieAvailable() {
    try {
      cookieSet(NS + ':probe', '1');
      var ok = cookieGet(NS + ':probe') === '1';
      cookieDel(NS + ':probe');
      return ok;
    } catch (e) {
      return false;
    }
  }

  /* ---------- backend: memory (สำรองสุดท้าย) ---------- */

  var memory = {};

  var backend = (function () {
    if (lsAvailable()) {
      return {
        name: 'localStorage',
        durable: true,
        get: function (k) { return window.localStorage.getItem(k); },
        set: function (k, v) { window.localStorage.setItem(k, v); },
        del: function (k) { window.localStorage.removeItem(k); },
      };
    }
    if (cookieAvailable()) {
      return {
        name: 'cookie',
        durable: true,
        get: cookieGet,
        set: cookieSet,
        del: cookieDel,
      };
    }
    return {
      name: 'memory',
      durable: false,
      get: function (k) { return Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : null; },
      set: function (k, v) { memory[k] = v; },
      del: function (k) { delete memory[k]; },
    };
  })();

  /* ---------- public API ---------- */

  function read(cardId) {
    var raw;
    try {
      raw = backend.get(keyFor(cardId));
    } catch (e) {
      return null;
    }
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== VERSION) return null;
      if (parsed.choice !== 'left' && parsed.choice !== 'right') return null;
      return parsed;
    } catch (e) {
      // ข้อมูลเสีย: ถือว่ายังไม่เคยเลือก แต่ไม่ลบทิ้ง เผื่อ debug
      return null;
    }
  }

  /**
   * บันทึกการเลือกและปิดผนึกทันที เขียนได้ครั้งเดียวเท่านั้น
   * @returns {object} สถานะปัจจุบัน (ของเดิมถ้าเคยเลือกไปแล้ว)
   */
  function seal(cardId, choice) {
    var existing = read(cardId);
    if (existing) return existing;

    var state = {
      v: VERSION,
      cardId: cardId,
      choice: choice,
      chosenAt: new Date().toISOString(),
      sealed: true,
    };
    try {
      backend.set(keyFor(cardId), JSON.stringify(state));
    } catch (e) {
      // เขียนไม่ได้ก็ยังคืน state เพื่อให้ session ปัจจุบันทำงานต่อได้
    }
    return state;
  }

  function reset(cardId) {
    try {
      backend.del(keyFor(cardId));
    } catch (e) { /* ไม่มีอะไรให้ทำ */ }
  }

  window.CardStore = {
    read: read,
    seal: seal,
    reset: reset,
    backendName: backend.name,
    durable: backend.durable,
  };
})();
