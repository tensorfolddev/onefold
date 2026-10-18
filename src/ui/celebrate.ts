// Confetti on a throwaway canvas over the page, removed when it lands: a burst for a finished ticket, two cannons for a
// whole epic. The words are in the toast (top right). Nothing moves for people who asked for less motion.
// ponytail: hand-rolled (~60 lines) instead of a confetti package; swap in canvas-confetti if we want shapes/emoji.
const COLORS = ["#0073ea", "#00c875", "#fdab3d", "#e2445c", "#a25ddc", "#ffcb00", "#66ccff", "#ff7575"];
const SMALL = { pieces: 110, ms: 2200, speed: 19 };
const BIG = { pieces: 260, ms: 3600, speed: 26 };
const FRAME_MS = 1000 / 60;

interface Piece { x: number; y: number; vx: number; vy: number; size: number; color: string; angle: number; spin: number; round: boolean }

export function celebrate(big: boolean) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  canvas.setAttribute("aria-hidden", "true");
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  document.body.append(canvas);

  const { pieces, ms, speed } = big ? BIG : SMALL;
  const { width: w, height: h } = canvas;
  // Fired upwards: from both bottom corners for an epic, from the bottom middle for a ticket.
  const cannons = big ? [{ x: 0, lean: 1 }, { x: w, lean: -1 }] : [{ x: w / 2, lean: 0 }];
  const list: Piece[] = Array.from({ length: pieces }, (_, i) => {
    const c = cannons[i % cannons.length];
    const angle = -Math.PI / 2 + (c.lean ? c.lean * (0.25 + Math.random() * 0.45) : (Math.random() - 0.5) * 1.1);
    const v = speed * dpr * (0.55 + Math.random() * 0.6);
    return {
      x: c.x, y: h, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, size: (6 + Math.random() * 7) * dpr,
      color: COLORS[i % COLORS.length], angle: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.35, round: Math.random() < 0.3,
    };
  });

  const start = performance.now();
  let last = start;
  const frame = (now: number) => {
    const k = Math.min((now - last) / FRAME_MS, 3); // the same speed at 60 Hz or 120 Hz
    last = now;
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = t < ms * 0.7 ? 1 : Math.max(0, 1 - (t - ms * 0.7) / (ms * 0.3)); // fade out at the end
    for (const p of list) {
      p.vy += 0.42 * dpr * k;
      p.vx *= 0.99 ** k;
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.angle += p.spin * k;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, (p.size / 2) * Math.abs(Math.cos(p.angle * 2))); // flutters
      }
      ctx.restore();
    }
    if (t < ms) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

