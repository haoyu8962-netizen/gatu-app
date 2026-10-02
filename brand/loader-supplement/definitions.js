// Supplementary status glyphs for the Sairn Motion Library v1.3, written in its catalog vocabulary
// (brand/tools/Sairn-Motion-Library-v1.3.html, `G` in /lib/catalog.js). This is a JavaScript expression,
// not a module: scripts/brand-export-motion.mjs evaluates it inside the motion library page, appends the
// result to window.SairnMotion.GLYPHS and renders it with the library's own renderGlyph.
//
// partial: ring = the unfilled remainder, the right half is drawn once as a solid sector (the confirmed
//   fill). A butt-capped arc whose stroke width equals the badge radius paints a half disc of that radius.
// info: neutral-toned filled badge with a knocked-out "i".
// warning: attention-toned filled badge with a knocked-out "!"; mirrors info.
(() => {
  const D = { confirm: 560 };
  const E = { enter: 'cubic-bezier(.22,.7,.28,1)' };
  const strokeAttrs = (color, w) => 'fill="none" stroke="' + color + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"';
  return [
    { id: 'partial', name: '部分成交', ring: 'success',
      draw: (c) => '<path class="srm-anim srm-gfill" pathLength="1" d="M12 7 A5 5 0 0 1 12 17" fill="none" stroke="' + c + '" stroke-width="10"/>',
      draw16: (c) => '<path class="srm-anim srm-gfill" pathLength="1" d="M8 4.5 A3.5 3.5 0 0 1 8 11.5" fill="none" stroke="' + c + '" stroke-width="7"/>',
      css: '.srm-g-partial .srm-gfill{stroke-dasharray:1 2;animation:srm13-gfill ' + D.confirm + 'ms ' + E.enter + ' both}@keyframes srm13-gfill{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}' },
    { id: 'info', name: '提示', filled: 'info',
      draw: (c) => '<circle cx="12" cy="7.5" r="1.25" fill="' + c + '"/><path d="M12 10.6 V16.7" ' + strokeAttrs(c, 2.3) + '/>',
      draw16: (c) => '<circle cx="8" cy="5" r="1" fill="' + c + '"/><rect x="7" y="7" width="2" height="5" rx="1" fill="' + c + '"/>' },
    { id: 'warning', name: '警告', filled: 'attention',
      draw: (c) => '<path d="M12 7.3 V13.4" ' + strokeAttrs(c, 2.3) + '/><circle cx="12" cy="16.5" r="1.25" fill="' + c + '"/>',
      draw16: (c) => '<rect x="7" y="4" width="2" height="5" rx="1" fill="' + c + '"/><circle cx="8" cy="11" r="1" fill="' + c + '"/>' },
  ];
})()
