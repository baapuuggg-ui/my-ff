/**
 * ClickSpark – vanilla JS port of the React Bits component.
 * Mounts a transparent full-page canvas over everything and draws
 * radiating spark lines on every click/tap.
 *
 * Usage:
 *   import { initClickSpark } from './ClickSpark.js';
 *   initClickSpark({ sparkColor: '#14b8a6', sparkCount: 8, ... });
 */

export function initClickSpark({
  sparkColor   = '#14b8a6',
  sparkSize    = 12,
  sparkRadius  = 22,
  sparkCount   = 8,
  duration     = 440,
  easing       = 'ease-out',
  extraScale   = 1.0,
} = {}) {

  /* ── Canvas setup ─────────────────────────────────────────────────────── */
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, {
    position:      'fixed',
    inset:         '0',
    width:         '100%',
    height:        '100%',
    pointerEvents: 'none',       // clicks fall through to page content
    zIndex:        '99999',
    userSelect:    'none',
  });
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let sparks = [];
  let rafId  = null;

  /* ── Resize ───────────────────────────────────────────────────────────── */
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(document.documentElement);

  /* ── Easing ───────────────────────────────────────────────────────────── */
  function ease(t) {
    switch (easing) {
      case 'linear':      return t;
      case 'ease-in':     return t * t;
      case 'ease-in-out': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      default:            return t * (2 - t);   // ease-out
    }
  }

  /* ── Draw loop ────────────────────────────────────────────────────────── */
  function draw(timestamp) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    sparks = sparks.filter(spark => {
      const elapsed = timestamp - spark.startTime;
      if (elapsed >= duration) return false;

      const progress  = elapsed / duration;
      const eased     = ease(progress);
      const distance  = eased * sparkRadius * extraScale;
      const lineLen   = sparkSize * (1 - eased);
      const alpha     = 1 - eased;

      const x1 = spark.x + distance           * Math.cos(spark.angle);
      const y1 = spark.y + distance           * Math.sin(spark.angle);
      const x2 = spark.x + (distance+lineLen) * Math.cos(spark.angle);
      const y2 = spark.y + (distance+lineLen) * Math.sin(spark.angle);

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = sparkColor;
      ctx.lineWidth   = 2.5;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      return true;
    });

    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(draw);
  }

  rafId = requestAnimationFrame(draw);

  /* ── Click handler ────────────────────────────────────────────────────── */
  function onClick(e) {
    const x   = e.clientX;
    const y   = e.clientY;
    const now = performance.now();

    for (let i = 0; i < sparkCount; i++) {
      sparks.push({
        x, y,
        angle:     (2 * Math.PI * i) / sparkCount,
        startTime: now,
      });
    }
  }

  // Touch support
  function onTouch(e) {
    if (e.touches.length > 0) {
      onClick({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    }
  }

  document.addEventListener('click',      onClick);
  document.addEventListener('touchstart', onTouch, { passive: true });

  /* ── Dispose ──────────────────────────────────────────────────────────── */
  return function dispose() {
    cancelAnimationFrame(rafId);
    ro.disconnect();
    document.removeEventListener('click',      onClick);
    document.removeEventListener('touchstart', onTouch);
    canvas.remove();
  };
}
