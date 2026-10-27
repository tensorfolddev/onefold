// Every screen shows the same layout, scaled: our styles are written in px (easy to read and tune), and this turns
// each px in them into rem at build time, so the one root size in base.css scales the whole app with the screen.
// Left as px: hairlines (1px and under — borders stay crisp) and media queries (those are about the real screen).
// Container queries are converted too: a container grows with the scale, so its thresholds must grow with it.
const PX = /(-?\d*\.?\d+)px\b/g;
const toRem = (value) => value.replace(PX, (m, n) => (Math.abs(Number(n)) <= 1 ? m : `${Number((Number(n) / 16).toFixed(5))}rem`));
const ours = (node) => /[\\/]src[\\/]/.test(node.source?.input?.file ?? "");

module.exports = () => ({
  postcssPlugin: "onefold-px-scale",
  Declaration(decl) {
    if (ours(decl) && decl.value.includes("px") && !decl.value.includes("url(")) decl.value = toRem(decl.value);
  },
  AtRule: {
    container(rule) { if (ours(rule)) rule.params = toRem(rule.params); },
  },
});
module.exports.postcss = true;
