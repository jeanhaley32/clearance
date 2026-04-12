'use strict';
// ─── PLATFORM (device capability helpers) ─────────────────────────────────

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
         (typeof navigator.standalone !== 'undefined' && navigator.standalone === true);
}

function supportsHaptics() {
  return typeof navigator.vibrate === 'function';
}

function vibrate(pattern) {
  if (!supportsHaptics()) return false;
  try { return navigator.vibrate(pattern); }
  catch (e) { return false; }
}

function isTouchDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

if (typeof module !== 'undefined') {
  module.exports = { isIOS, isAndroid, isStandalone, supportsHaptics, vibrate, isTouchDevice };
}
