/*! Sairn Motion 1.3.0 — SVG + CSS motion for the A / Signal Gate mark. No dependencies. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SairnMotion = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';const modules={"/lib/tokens.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.T = void 0;
/* Tokens are injected by the build from tokens/sairn.tokens.json (single source). */
const T = {"name":"sairn","version":"1.3.0","identity":"A / Signal Gate","color":{"primitive":{"teal-950":"#061F27","teal-900":"#08262E","teal-850":"#0A3038","teal-800":"#0C353D","teal-750":"#123B43","teal-600":"#2B5055","teal-500":"#536C70","teal-300":"#A5BFBC","teal-250":"#C3CFCA","teal-200":"#D2DEDA","teal-150":"#DBE0D9","teal-100":"#E8EFEB","paper-50":"#FAFAF5","paper-100":"#F5F4EE","paper-200":"#F0F3ED","white":"#FFFFFF","snow":"#F4F8F4","mint-300":"#86E5D3","mint-700":"#176B64","amber-300":"#E6B766","amber-700":"#99621F","red-300":"#F09C95","red-700":"#B3443C","green-300":"#74DA86","green-700":"#247630"},"theme":{"dark":{"surface":{"base":"#0A3038","card-top":"#0C353D","card-bottom":"#061F27","raised":"#123B43","code":"#08262E"},"border":{"subtle":"#2B5055","strong":"#536C70"},"text":{"primary":"#F4F8F4","secondary":"#A5BFBC","on-accent":"#08262E"},"brand":{"signal":"#86E5D3","choice":"#E6B766","wordmark":"#FFFFFF"},"status":{"success":"#86E5D3","error":"#F09C95","pending":"#E6B766","attention":"#E6B766","neutral":"#A5BFBC"},"pnl":{"green":"#74DA86","red":"#F09C95"},"focus":"#E6B766"},"light":{"surface":{"base":"#F5F4EE","card-top":"#FAFAF5","card-bottom":"#F0F3ED","raised":"#E8EFEB","code":"#08262E"},"border":{"subtle":"#DBE0D9","strong":"#C3CFCA"},"text":{"primary":"#08262E","secondary":"#536C70","on-accent":"#FFFFFF"},"brand":{"signal":"#176B64","choice":"#99621F","wordmark":"#08262E"},"status":{"success":"#176B64","error":"#B3443C","pending":"#99621F","attention":"#99621F","neutral":"#536C70"},"pnl":{"green":"#247630","red":"#B3443C"},"focus":"#176B64"}},"pnlConvention":{"green-up":{"label":"绿涨红跌","up":"green","down":"red"},"red-up":{"label":"红涨绿跌","up":"red","down":"green"}},"rules":["brand.signal 不承担涨跌含义；涨跌只用 pnl.up / pnl.down。","light 主题下 amber 文字不放在 surface.raised 上（4.36:1）。","status.neutral 用于已取消；status.pending 与 status.attention 同色，以形状和是否动来区分。"]},"type":{"family":{"sans":"Arial, 'PingFang SC', 'Noto Sans CJK SC', 'Source Han Sans SC', 'Microsoft YaHei', sans-serif","mono":"ui-monospace, 'SF Mono', Menlo, Consolas, monospace"},"card":{"floor":28,"label":28,"legal":28,"body":32,"subtitle":32,"stat":46,"title":{"portrait":76,"square":64,"story":84,"landscape":54},"titleMin":{"portrait":58,"square":50,"story":64,"landscape":44}},"ui":{"min":11,"caption":12,"body":14,"title":24}},"motion":{"duration":{"feedback":400,"confirm":560,"brand":800,"loop-fast":1400,"loop":2000,"loop-calm":2800},"easing":{"enter":"cubic-bezier(.22,.7,.28,1)","loop":"ease-in-out","fade":"ease-out"},"loopFloor":{"dark":0.55,"light":0.78,"mono":0.78},"maxPanelTranslation":24,"rules":["不旋转标志","不变形路径","不用滤镜","动画结束不触发业务状态"]},"safeArea":{"story":{"top":250,"bottom":340,"source":"Meta Stories 建议"},"margin":{"portrait":72,"square":64,"story":72,"landscape":56}},"radius":{"card":0,"panel":28,"cell":20,"badge":12,"button":16}};
exports.T = T;
},
"/lib/catalog.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PALETTES = exports.GLYPHS = exports.CATALOG = exports.PATHS = void 0;
/**
 * Sairn motion catalog. Mark paths are the approved A / Signal Gate geometry (do not redraw).
 * Durations and easings come from tokens (T.motion). Every loop dims to the theme floor
 * (--srm-floor) so the dimmest frame still meets 3:1 against the surface.
 */
const tokens_1 = require("./tokens");
const T = tokens_1.T;
const D = T.motion.duration, E = T.motion.easing;
const PATHS = {
    signal: 'M290 204 C290 184 298 179 315 188 L490 282 C506 291 514 304 514 323 L514 601 C514 621 506 636 490 646 L315 745 C298 755 290 750 290 730 Z',
    choice: 'M740 317 C757 307 762 313 762 334 L762 792 C762 813 756 820 740 810 L602 725 C586 715 578 700 578 680 L578 444 C578 424 586 410 602 400 Z',
    signal16: 'M3 2.6 Q3 2 3.55 2.3 L6.45 3.9 Q7 4.2 7 4.8 L7 9.2 Q7 9.8 6.45 10.15 L3.55 11.85 Q3 12.2 3 11.55 Z',
    choice16: 'M12.45 4.3 Q13 4 13 4.65 L13 13.35 Q13 14 12.45 13.65 L9.55 11.9 Q9 11.6 9 11 L9 6.85 Q9 6.25 9.55 5.9 Z'
};
exports.PATHS = PATHS;
/* Theme colours are resolved from tokens. mono uses currentColor throughout. */
function palette(theme) {
    if (theme === 'mono') return { signal: 'currentColor', choice: 'currentColor', success: 'currentColor', error: 'currentColor', pending: 'currentColor', neutral: 'currentColor', onBadge: 'none', floor: T.motion.loopFloor.mono, surface: 'transparent', mono: true };
    const th = T.color.theme[theme === 'on-light' ? 'light' : 'dark'];
    return {
        signal: th.brand.signal, choice: th.brand.choice, success: th.status.success, error: th.status.error,
        pending: th.status.pending, neutral: th.status.neutral, onBadge: th.text['on-accent'],
        floor: T.motion.loopFloor[theme === 'on-light' ? 'light' : 'dark'], surface: th.surface.base, mono: false
    };
}
exports.PALETTES = { 'on-dark': palette('on-dark'), 'on-light': palette('on-light'), mono: palette('mono') };
/* ---------- shared pieces (1024 canvas) ---------- */
const mark = (p, cls = ['', '']) => `<g class="srm-mark"><path class="${cls[0]}" data-part="signal" fill="${p.signal}" d="${PATHS.signal}"/><path class="${cls[1]}" data-part="choice" fill="${p.choice}" d="${PATHS.choice}"/></g>`;
/** Mark scaled to 70 % and centred at the top; the state token sits below it. */
const MARK_T = 'translate(512 288) scale(.7) translate(-526 -499.5)';
const smallMark = (p, cls = ['', '']) => `<g transform="${MARK_T}">${mark(p, cls)}</g>`;
const BADGE = { cx: 512, cy: 752, r: 196 };
/** Filled token for final states; ring token for states still in progress. mono is always a ring. */
function token(p, color, filled, cls = '') {
    const { cx, cy, r } = BADGE;
    if (filled && !p.mono) return `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
    return `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r - 16}" fill="none" stroke="${color}" stroke-width="32"/>`;
}
const glyphColor = (p, fallback) => p.mono ? 'currentColor' : (fallback || p.onBadge);
const strokeAttrs = (color, w) => `fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const CHECK = { d: 'M430 756 L490 816 L604 700', len: 248 };
const CROSS = 'M450 690 L574 814 M574 690 L450 814';
const QUESTION = 'M456 704 C456 660 486 634 516 634 C552 634 578 660 578 692 C578 724 556 740 536 752 C520 762 512 774 512 796';
/* ---------- catalog ---------- */
const CATALOG = [
    {
        id: 'brand-intro', name: '品牌入场', english: 'Brand entrance', group: '品牌', kind: 'once', token: 'brand', minSize: 64,
        description: '两扇面板先后归位，播放一次。不用于延长启动等待。',
        body: p => mark(p, ['srm-anim srm-a', 'srm-anim srm-b']),
        css: `.srm-brand-intro .srm-a{animation:srm13-in-l ${D.brand - 120}ms ${E.enter} both}.srm-brand-intro .srm-b{animation:srm13-in-r ${D.brand - 120}ms 120ms ${E.enter} both}@keyframes srm13-in-l{from{opacity:.5;transform:translate(-24px,12px)}to{opacity:1;transform:none}}@keyframes srm13-in-r{from{opacity:.5;transform:translate(24px,12px)}to{opacity:1;transform:none}}`
    },
    {
        id: 'page-loading', name: '页面加载', english: 'Page loading', group: '加载', kind: 'loop', token: 'loop', minSize: 48,
        description: '两扇面板交替呼吸。用于整页初始化，完成后由业务移除。',
        body: p => mark(p, ['srm-anim srm-a', 'srm-anim srm-b']),
        css: `.srm-page-loading .srm-a{animation:srm13-breathe ${D.loop}ms ${E.loop} infinite}.srm-page-loading .srm-b{animation:srm13-breathe ${D.loop}ms -${D.loop / 2}ms ${E.loop} infinite}`
    },
    {
        id: 'button-loading', name: '按钮加载', english: 'Button loading', group: '加载', kind: 'loop', token: 'loop-fast', minSize: 16,
        description: '16 px 简化轮廓，只改透明度，按钮宽度不变。按钮需同时设为 disabled。',
        viewBox: '0 0 16 16', width: 16, height: 16,
        body: p => `<path class="srm-anim srm-a" fill="${p.signal}" d="${PATHS.signal16}"/><path class="srm-anim srm-b" fill="${p.choice}" d="${PATHS.choice16}"/>`,
        css: `.srm-button-loading .srm-a{animation:srm13-breathe ${D['loop-fast']}ms ${E.loop} infinite}.srm-button-loading .srm-b{animation:srm13-breathe ${D['loop-fast']}ms -${D['loop-fast'] / 2}ms ${E.loop} infinite}`
    },
    {
        id: 'ai-analyzing', name: 'AI 分析中', english: 'AI analyzing', group: '数据', kind: 'loop', token: 'loop', minSize: 96,
        description: '底部三个节点依次点亮，标志保持静止。只表示请求处理中。',
        body: p => mark(p) + [386, 482, 578].map((x, i) => `<rect class="srm-anim srm-n srm-n${i}" x="${x}" y="880" width="60" height="60" rx="18" fill="${p.signal}"/>`).join(''),
        css: `.srm-ai-analyzing .srm-n{animation:srm13-seq ${D.loop}ms ${E.loop} infinite}.srm-ai-analyzing .srm-n1{animation-delay:-${Math.round(D.loop * 2 / 3)}ms}.srm-ai-analyzing .srm-n2{animation-delay:-${Math.round(D.loop / 3)}ms}`
    },
    {
        id: 'data-syncing', name: '数据同步', english: 'Data syncing', group: '数据', kind: 'loop', token: 'loop', minSize: 96,
        description: '两扇面板轻微反向移动，下方两段交替。行情刷新时仍需显示最后更新时间。',
        body: p => mark(p, ['srm-anim srm-up', 'srm-anim srm-down']) + `<rect class="srm-anim srm-f srm-f0" x="370" y="888" width="128" height="44" rx="22" fill="${p.signal}"/><rect class="srm-anim srm-f srm-f1" x="526" y="888" width="128" height="44" rx="22" fill="${p.choice}"/>`,
        css: `.srm-data-syncing .srm-up{animation:srm13-up ${D.loop}ms ${E.loop} infinite}.srm-data-syncing .srm-down{animation:srm13-down ${D.loop}ms ${E.loop} infinite}.srm-data-syncing .srm-f{animation:srm13-breathe ${D.loop}ms ${E.loop} infinite}.srm-data-syncing .srm-f1{animation-delay:-${D.loop / 2}ms}@keyframes srm13-up{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}@keyframes srm13-down{0%,100%{transform:translateY(0)}50%{transform:translateY(10px)}}`
    },
    {
        id: 'reconnecting', name: '正在重连', english: 'Reconnecting', group: '数据', kind: 'loop', token: 'loop-calm', minSize: 96,
        description: '中间连接块慢速起伏。连接恢复前，不自动重试下单。',
        body: p => mark(p) + `<rect x="358" y="890" width="104" height="40" rx="20" fill="${p.signal}"/><rect class="srm-anim srm-bridge" x="486" y="884" width="52" height="52" rx="16" fill="${p.choice}"/><rect x="562" y="890" width="104" height="40" rx="20" fill="${p.signal}"/>`,
        css: `.srm-reconnecting .srm-bridge{animation:srm13-bridge ${D['loop-calm']}ms ${E.loop} infinite}@keyframes srm13-bridge{0%,100%{opacity:var(--srm-floor,.55);transform:translateY(0)}50%{opacity:1;transform:translateY(-10px)}}`
    },
    {
        id: 'wallet-awaiting', name: '等待钱包确认', english: 'Wallet approval', group: '交易', kind: 'loop', token: 'loop-calm', minSize: 64,
        description: '暂停符号缓慢呼吸，表示需要用户在钱包中操作。保留取消入口。',
        body: p => smallMark(p) + token(p, p.pending, false) + `<rect class="srm-anim srm-pause" x="456" y="680" width="40" height="144" rx="16" fill="${glyphColor(p, p.pending)}"/><rect class="srm-anim srm-pause" x="528" y="680" width="40" height="144" rx="16" fill="${glyphColor(p, p.pending)}"/>`,
        css: `.srm-wallet-awaiting .srm-pause{animation:srm13-breathe ${D['loop-calm']}ms ${E.loop} infinite}`
    },
    {
        id: 'submitting', name: '正在提交', english: 'Submitting', group: '交易', kind: 'loop', token: 'loop-fast', minSize: 64,
        description: '箭头沿提交方向推进。动画结束不代表成交，不触发成功状态。',
        body: p => smallMark(p) + token(p, p.success, false) + `<path class="srm-anim srm-send" d="M428 752 H592 M540 696 L596 752 L540 808" ${strokeAttrs(glyphColor(p, p.success), 44)}/>`,
        css: `.srm-submitting .srm-send{animation:srm13-send ${D['loop-fast']}ms ${E.loop} infinite}@keyframes srm13-send{0%{opacity:var(--srm-floor,.55);transform:translateX(-14px)}55%,70%{opacity:1;transform:translateX(12px)}100%{opacity:var(--srm-floor,.55);transform:translateX(12px)}}`
    },
    {
        id: 'awaiting-result', name: '等待结果', english: 'Awaiting result', group: '交易', kind: 'loop', token: 'loop', minSize: 64,
        description: '三点依次呼吸，表示服务端尚未返回最终状态。受理不等于成交。',
        body: p => smallMark(p) + token(p, p.pending, false) + [440, 512, 584].map((x, i) => `<circle class="srm-anim srm-w srm-w${i}" cx="${x}" cy="752" r="30" fill="${glyphColor(p, p.pending)}"/>`).join(''),
        css: `.srm-awaiting-result .srm-w{animation:srm13-seq ${D.loop}ms ${E.loop} infinite}.srm-awaiting-result .srm-w1{animation-delay:-${Math.round(D.loop * 2 / 3)}ms}.srm-awaiting-result .srm-w2{animation-delay:-${Math.round(D.loop / 3)}ms}`
    },
    {
        id: 'success', name: '已确认', english: 'Confirmed', group: '结果', kind: 'once', token: 'confirm', minSize: 48,
        description: '勾号一次画出并停留，不循环。只在服务端确认后显示。',
        body: p => smallMark(p) + token(p, p.success, true, 'srm-anim srm-token') + `<path class="srm-anim srm-check" d="${CHECK.d}" ${strokeAttrs(glyphColor(p), 48)}/>`,
        css: `.srm-success .srm-token{animation:srm13-pop ${Math.round(D.confirm * .55)}ms ${E.enter} both}.srm-success .srm-check{stroke-dasharray:${CHECK.len};animation:srm13-draw ${Math.round(D.confirm * .6)}ms ${Math.round(D.confirm * .4)}ms ${E.enter} both}@keyframes srm13-draw{from{stroke-dashoffset:${CHECK.len}}to{stroke-dashoffset:0}}`
    },
    {
        id: 'error', name: '失败', english: 'Failed', group: '结果', kind: 'once', token: 'feedback', minSize: 48,
        description: '错误符号一次显现，不抖动、不自动重试。只用于明确的失败响应。',
        body: p => smallMark(p) + token(p, p.error, true, 'srm-anim srm-token') + `<path class="srm-anim srm-glyph" d="${CROSS}" ${strokeAttrs(glyphColor(p), 48)}/>`,
        css: `.srm-error .srm-token{animation:srm13-pop ${D.feedback}ms ${E.enter} both}.srm-error .srm-glyph{animation:srm13-fade ${D.feedback - Math.round(D.feedback / 3)}ms ${Math.round(D.feedback / 3)}ms ${E.fade} both}`
    },
    {
        id: 'cancelled', name: '已取消', english: 'Cancelled', group: '结果', kind: 'once', token: 'feedback', minSize: 48,
        description: '中性色停止方块，与失败和等待区分。撤单成功后才显示。',
        body: p => smallMark(p) + token(p, p.neutral, true, 'srm-anim srm-token') + `<rect class="srm-anim srm-glyph" x="446" y="686" width="132" height="132" rx="24" fill="${glyphColor(p)}"/>`,
        css: `.srm-cancelled .srm-token{animation:srm13-pop ${D.feedback}ms ${E.enter} both}.srm-cancelled .srm-glyph{animation:srm13-fade ${D.feedback - Math.round(D.feedback / 3)}ms ${Math.round(D.feedback / 3)}ms ${E.fade} both}`
    },
    {
        id: 'unknown', name: '结果未知', english: 'Unknown result', group: '结果', kind: 'once', token: 'feedback', minSize: 48,
        description: '问号出现后保持静止。超时不等于失败：先核对订单，再决定是否重下。',
        body: p => smallMark(p) + token(p, p.pending, true, 'srm-anim srm-token') + `<path class="srm-anim srm-glyph" d="${QUESTION}" ${strokeAttrs(glyphColor(p), 44)}/><circle class="srm-anim srm-glyph" cx="512" cy="858" r="27" fill="${glyphColor(p)}"/>`,
        css: `.srm-unknown .srm-token{animation:srm13-pop ${D.feedback}ms ${E.enter} both}.srm-unknown .srm-glyph{animation:srm13-fade ${D.feedback - Math.round(D.feedback / 3)}ms ${Math.round(D.feedback / 3)}ms ${E.fade} both}`
    },
    {
        id: 'copy-feedback', name: '复制完成', english: 'Copied', group: '工具', kind: 'once', token: 'feedback', minSize: 16,
        description: '小尺寸勾号。剪贴板写入成功后才播放。',
        viewBox: '0 0 32 32', width: 32, height: 32,
        body: p => `<path class="srm-anim srm-check" d="M7 16.5 L13 22.5 L25.5 10" ${strokeAttrs(p.success, 3.6)}/>`,
        css: `.srm-copy-feedback .srm-check{stroke-dasharray:28;animation:srm13-draw-s ${D.feedback}ms ${E.enter} both}@keyframes srm13-draw-s{from{stroke-dashoffset:28}to{stroke-dashoffset:0}}`
    },
    {
        id: 'skeleton', name: '内容骨架', english: 'Skeleton', group: '工具', kind: 'loop', token: 'loop', minSize: 240,
        description: '占位块只改透明度，不扫光。容器需同时设 aria\u2011busy。',
        viewBox: '0 0 640 320', width: 640, height: 320,
        body: p => `<rect x="0" y="8" width="72" height="16" rx="8" fill="${p.signal}" opacity=".5"/>` + [[0, 52, 270, 30, 8, ''], [0, 106, 580, 16, 8, ' srm-late'], [0, 136, 454, 16, 8, ''], [0, 198, 188, 106, 12, ' srm-late'], [210, 198, 188, 106, 12, ' srm-late'], [420, 198, 188, 106, 12, ' srm-late']]
            .map(([x, y, w, h, rx, c]) => `<rect class="srm-anim srm-block${c}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${p.signal}" opacity=".24"/>`).join(''),
        css: `.srm-skeleton .srm-block{animation:srm13-skel ${D.loop}ms ${E.loop} infinite}.srm-skeleton .srm-late{animation-delay:-${Math.round(D.loop * .3)}ms}@keyframes srm13-skel{0%,100%{opacity:.16}50%{opacity:.32}}`
    },
    {
        id: 'progress', name: '真实进度', english: 'Determinate progress', group: '工具', kind: 'data', token: null, minSize: 160,
        description: '只接受 0–100 的实测进度，不自增、不模拟完成。文件默认 0%。',
        viewBox: '0 0 640 32', width: 640, height: 32,
        body: (p, o) => `<rect x="0" y="8" width="640" height="16" rx="8" fill="${p.signal}" opacity="${p.mono ? .3 : .22}"/><rect class="srm-progress-value" data-progress-value="true" x="0" y="8" width="${o.progress * 6.4}" height="16" rx="8" fill="${p.signal}"/>`,
        css: `.srm-progress .srm-progress-value{transition:width 180ms ${E.fade}}`
    }
];
exports.CATALOG = CATALOG;
/* ---------- small status glyphs: 24 grid for 20–32 px, 16 grid (draw16) for 16 px ----------
   16 grid: badge r 7 and ring r 6.5 / 1 px land on whole pixels at 16 px; bars and squares sit on whole pixels. */
const G = {
    success: { name: '已确认', filled: 'success',
        draw: (c) => `<path class="srm-anim srm-gcheck" pathLength="1" d="M7.6 12.3 L10.6 15.3 L16.4 9.3" ${strokeAttrs(c, 2.3)}/>`,
        draw16: (c) => `<path class="srm-anim srm-gcheck" pathLength="1" d="M5 8.1 L7 10.1 L11 6.1" ${strokeAttrs(c, 1.5)}/>`,
        css: `.srm-g-success .srm-gcheck{stroke-dasharray:1;animation:srm13-gdraw ${D.confirm}ms ${E.enter} both}@keyframes srm13-gdraw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}` },
    error: { name: '失败', filled: 'error',
        draw: (c) => `<path d="M8.8 8.8 L15.2 15.2 M15.2 8.8 L8.8 15.2" ${strokeAttrs(c, 2.3)}/>`,
        draw16: (c) => `<path d="M5.75 5.75 L10.25 10.25 M10.25 5.75 L5.75 10.25" ${strokeAttrs(c, 1.5)}/>` },
    cancelled: { name: '已取消', filled: 'neutral',
        draw: (c) => `<rect x="8.6" y="8.6" width="6.8" height="6.8" rx="1.4" fill="${c}"/>`,
        draw16: (c) => `<rect x="6" y="6" width="4" height="4" rx=".75" fill="${c}"/>` },
    unknown: { name: '结果未知', filled: 'pending',
        draw: (c) => `<path d="M9.7 9.7 C9.7 8.3 10.8 7.3 12.1 7.3 C13.5 7.3 14.5 8.3 14.5 9.6 C14.5 10.8 13.7 11.3 13 11.8 C12.4 12.2 12 12.7 12 13.6" ${strokeAttrs(c, 2)}/><circle cx="12" cy="16.5" r="1.25" fill="${c}"/>`,
        draw16: (c) => `<path d="M6.4 6.4 C6.4 5.5 7.1 4.8 8 4.8 C8.9 4.8 9.6 5.5 9.6 6.3 C9.6 7.1 9.1 7.5 8.6 7.8 C8.2 8.1 8 8.4 8 9" ${strokeAttrs(c, 1.4)}/><circle cx="8" cy="11" r=".85" fill="${c}"/>` },
    pending: { name: '等待结果', ring: 'pending',
        draw: (c) => [7.6, 12, 16.4].map((x, i) => `<circle class="srm-anim srm-gd srm-gd${i}" cx="${x}" cy="12" r="1.75" fill="${c}"/>`).join(''),
        draw16: (c) => [5, 8, 11].map((x, i) => `<circle class="srm-anim srm-gd srm-gd${i}" cx="${x}" cy="8" r="1.1" fill="${c}"/>`).join(''),
        css: `.srm-g-pending .srm-gd{animation:srm13-seq ${D.loop}ms ${E.loop} infinite}.srm-g-pending .srm-gd1{animation-delay:-${Math.round(D.loop * 2 / 3)}ms}.srm-g-pending .srm-gd2{animation-delay:-${Math.round(D.loop / 3)}ms}` },
    wallet: { name: '等待钱包确认', ring: 'pending',
        draw: (c) => `<rect class="srm-anim srm-gp" x="9.1" y="8.4" width="2.1" height="7.2" rx=".9" fill="${c}"/><rect class="srm-anim srm-gp" x="12.8" y="8.4" width="2.1" height="7.2" rx=".9" fill="${c}"/>`,
        draw16: (c) => `<rect class="srm-anim srm-gp" x="5" y="5" width="2" height="6" rx=".5" fill="${c}"/><rect class="srm-anim srm-gp" x="9" y="5" width="2" height="6" rx=".5" fill="${c}"/>`,
        css: `.srm-g-wallet .srm-gp{animation:srm13-breathe ${D['loop-calm']}ms ${E.loop} infinite}` },
    submitting: { name: '正在提交', ring: 'success',
        draw: (c) => `<path class="srm-anim srm-ga" d="M7.8 12 H15.4 M12.8 9.2 L15.6 12 L12.8 14.8" ${strokeAttrs(c, 2)}/>`,
        draw16: (c) => `<path class="srm-anim srm-ga" d="M5 8 H10.6 M8.6 5.9 L10.7 8 L8.6 10.1" ${strokeAttrs(c, 1.5)}/>`,
        css: `.srm-g-submitting .srm-ga{animation:srm13-gsend ${D['loop-fast']}ms ${E.loop} infinite}@keyframes srm13-gsend{0%{opacity:var(--srm-floor,.55);transform:translateX(-1px)}55%,70%{opacity:1;transform:translateX(1px)}100%{opacity:var(--srm-floor,.55);transform:translateX(1px)}}` }
};
exports.GLYPHS = Object.entries(G).map(([id, g]) => ({ id, ...g }));
},
"/lib/engine.js":function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderMotion = renderMotion;
exports.renderGlyph = renderGlyph;
exports.motionCSS = motionCSS;
exports.getMotion = getMotion;
exports.getGlyph = getGlyph;
exports.motionForPhase = motionForPhase;
exports.glyphForPhase = glyphForPhase;
exports.setProgress = setProgress;
exports.requireProgress = requireProgress;
exports.motionTokens = motionTokens;
const catalog_1 = require("./catalog");
const tokens_1 = require("./tokens");
const T = tokens_1.T;
const THEMES = ['on-dark', 'on-light', 'mono'];
const XML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
function esc(value) {
    return Array.from(String(value)).filter(c => { const n = c.codePointAt(0); return n === 9 || n === 10 || n === 13 || (n >= 32 && n <= 0xD7FF) || (n >= 0xE000 && n <= 0xFFFD) || n >= 0x10000; }).join('').replace(/[&<>"']/g, c => XML[c]);
}
function requireProgress(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100)
        throw new RangeError('progress 须为 0–100 的有限数值；未知进度用 page-loading。');
    return value;
}
function getMotion(id) { const m = catalog_1.CATALOG.find(x => x.id === id); if (!m) throw new RangeError(`Unknown Sairn motion: ${String(id)}`); return m; }
function getGlyph(id) { const g = catalog_1.GLYPHS.find(x => x.id === id); if (!g) throw new RangeError(`Unknown Sairn glyph: ${String(id)}`); return g; }
/* Shared rules. Reduced motion: system setting, the SVG attribute, or any ancestor attribute. */
const BASE = [
    '.srm{overflow:visible}',
    '.srm .srm-anim{transform-box:fill-box;transform-origin:center}',
    '@keyframes srm13-breathe{0%,100%{opacity:1}50%{opacity:var(--srm-floor,.55)}}',
    '@keyframes srm13-seq{0%,25%,100%{opacity:var(--srm-floor,.55)}45%,70%{opacity:1}}',
    '@keyframes srm13-pop{from{opacity:.4;transform:scale(.72)}to{opacity:1;transform:none}}',
    '@keyframes srm13-fade{from{opacity:0}to{opacity:1}}',
    '.srm[data-paused="true"] .srm-anim,[data-motion-paused="true"] .srm .srm-anim{animation-play-state:paused!important}',
    '.srm[data-reduced="true"] .srm-anim,[data-motion-reduced="true"] .srm .srm-anim{animation:none!important}',
    '.srm[data-reduced="true"] .srm-progress-value,[data-motion-reduced="true"] .srm .srm-progress-value{transition:none!important}',
    '@media (prefers-reduced-motion:reduce){.srm .srm-anim{animation:none!important}.srm .srm-progress-value{transition:none!important}}'
].join('');
/** Complete stylesheet for a page that inlines many SVGs (inject once, render with embedStyle:false). */
function motionCSS() { return BASE + catalog_1.CATALOG.map(m => m.css).join('') + catalog_1.GLYPHS.map(g => g.css || '').join(''); }
let seq = 0;
function common(options) {
    const theme = options.theme ?? 'on-dark';
    if (!THEMES.includes(theme)) throw new RangeError('theme 须为 on-dark、on-light 或 mono。');
    for (const k of ['reducedMotion', 'paused', 'decorative', 'embedStyle'])
        if (options[k] !== undefined && typeof options[k] !== 'boolean') throw new TypeError(`${k} 须为布尔值。`);
    if (options.label !== undefined && (typeof options.label !== 'string' || !options.label.trim())) throw new TypeError('label 须为非空文本。');
    return { theme, p: catalog_1.PALETTES[theme] };
}
function svgOpen(o) {
    const aria = o.decorative ? 'aria-hidden="true"' : o.role === 'progressbar'
        ? `role="progressbar" aria-label="${esc(o.label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${o.progress}"`
        : `role="img" aria-label="${esc(o.label)}"`;
    const size = o.size ? ` width="${o.size}" height="${o.size}"` : ` width="${o.width}" height="${o.height}"`;
    return `<svg xmlns="http://www.w3.org/2000/svg"${size} viewBox="${o.viewBox}" class="srm ${o.cls}" data-motion="${o.id}" data-theme="${o.theme}" data-paused="${!!o.paused}" data-reduced="${!!o.reducedMotion}" style="--srm-floor:${o.floor}" color-interpolation="sRGB" focusable="false" ${aria}>`;
}
/**
 * Render one motion as an SVG string.
 * embedStyle (default true) inlines the rules this motion needs, so a saved file works alone.
 * reducedMotion:true renders the final static state (for static files); pages should toggle
 * data-reduced / data-motion-reduced instead of re-rendering.
 */
function renderMotion(id, options = {}) {
    const m = getMotion(id);
    const { theme, p } = common(options);
    const progress = id === 'progress' ? requireProgress(options.progress ?? 0) : 0;
    const label = options.label ?? m.name;
    const body = m.body(p, { progress });
    const style = options.reducedMotion || options.embedStyle === false ? '' : `<style>${BASE}${m.css}</style>`;
    return svgOpen({ id, theme, cls: `srm-${id}`, viewBox: m.viewBox || '0 0 1024 1024', width: m.width || 1024, height: m.height || 1024, size: options.size, paused: options.paused, reducedMotion: options.reducedMotion, floor: p.floor, decorative: options.decorative, label, role: id === 'progress' ? 'progressbar' : 'img', progress })
        + `<title>${esc(label)}</title>${style}${body}</svg>`;
}
/**
 * Small status glyph for toasts, rows and buttons. 24 grid for 20–32 px; at size ≤ 18 the 16-grid outline is used,
 * whose badge, ring, bars and squares sit on whole pixels at 16 px.
 */
function renderGlyph(id, options = {}) {
    const g = getGlyph(id);
    const { theme, p } = common(options);
    const label = options.label ?? g.name;
    const g16 = options.size !== undefined && options.size <= 18;
    const draw = g16 ? g.draw16 : g.draw;
    const ring = g16 ? `<circle cx="8" cy="8" r="6.5" fill="none" stroke="%C" stroke-width="1"/>` : `<circle cx="12" cy="12" r="9.1" fill="none" stroke="%C" stroke-width="1.8"/>`;
    const disc = g16 ? `<circle cx="8" cy="8" r="7" fill="%C"/>` : `<circle cx="12" cy="12" r="10" fill="%C"/>`;
    let body;
    if (g.filled) {
        body = p.mono ? ring.replace('%C', 'currentColor') + draw('currentColor') : disc.replace('%C', p[g.filled]) + draw(p.onBadge);
    }
    else {
        const c = p[g.ring];
        body = ring.replace('%C', c) + draw(c);
    }
    const style = options.reducedMotion || options.embedStyle === false || !g.css ? '' : `<style>${BASE}${g.css}</style>`;
    const vb = g16 ? 16 : 24;
    return svgOpen({ id: 'glyph-' + id, theme, cls: `srm-g-${id}${g16 ? ' srm-g16' : ''}`, viewBox: `0 0 ${vb} ${vb}`, width: vb, height: vb, size: options.size, paused: options.paused, reducedMotion: options.reducedMotion, floor: p.floor, decorative: options.decorative, label })
        + `<title>${esc(label)}</title>${style}${body}</svg>`;
}
const PHASES = { idle: null, 'wallet-awaiting': 'wallet-awaiting', submitting: 'submitting', 'awaiting-result': 'awaiting-result', confirmed: 'success', failed: 'error', cancelled: 'cancelled', unknown: 'unknown' };
const PHASE_GLYPH = { 'wallet-awaiting': 'wallet', submitting: 'submitting', 'awaiting-result': 'pending', confirmed: 'success', failed: 'error', cancelled: 'cancelled', unknown: 'unknown' };
/** Business phase → motion. Unknown stays unknown; it never maps to failure or a retry. */
function motionForPhase(phase) { if (!Object.hasOwnProperty.call(PHASES, phase)) throw new RangeError('Unknown business phase.'); return PHASES[phase]; }
function glyphForPhase(phase) { if (phase === 'idle') return null; if (!PHASE_GLYPH[phase]) throw new RangeError('Unknown business phase.'); return PHASE_GLYPH[phase]; }
/** Update a rendered progress SVG with a measured value. Never emits completion. */
function setProgress(svg, value) {
    const v = requireProgress(value);
    if (svg.getAttribute('data-motion') !== 'progress') throw new TypeError('setProgress 需要 progress SVG。');
    const bar = svg.querySelector('[data-progress-value]');
    bar.setAttribute('width', String(v * 6.4));
    if (svg.getAttribute('aria-hidden') !== 'true') svg.setAttribute('aria-valuenow', String(v));
}
function motionTokens() {
    return {
        version: '1.3.0', brand: T.identity,
        duration: T.motion.duration, easing: T.motion.easing, loopFloor: T.motion.loopFloor,
        maxPanelTranslationAt1024: T.motion.maxPanelTranslation, rules: T.motion.rules,
        themes: catalog_1.PALETTES,
        motions: catalog_1.CATALOG.map(m => ({ id: m.id, name: m.name, english: m.english, group: m.group, kind: m.kind, token: m.token, durationMs: m.token ? T.motion.duration[m.token] : 0, minSize: m.minSize, description: m.description, viewBox: m.viewBox || '0 0 1024 1024' })),
        glyphs: catalog_1.GLYPHS.map(g => ({ id: g.id, name: g.name, animated: !!g.css, viewBox: '0 0 24 24', sizes: [20, 24, 32], viewBox16: '0 0 16 16', sizes16: [16] })),
        phases: Object.fromEntries(Object.keys(PHASES).filter(k => k !== 'idle').map(k => [k, { motion: PHASES[k], glyph: PHASE_GLYPH[k] }]))
    };
}
}};const cache={};function load(id){if(cache[id])return cache[id].exports;if(!modules[id])throw new Error('Module not bundled: '+id);const m={exports:{}};cache[id]=m;modules[id](m,m.exports,function(req){const chunks=(id.slice(0,id.lastIndexOf('/')+1)+req).split('/');const normalized=[];for(const c of chunks){if(c==='..')normalized.pop();else if(c!=='.')normalized.push(c);}const base=normalized.join('/');return load(modules[base]?base:modules[base+'.js']?base+'.js':base+'/index.js');});return m.exports;}
const api = load('/lib/engine.js');
return { renderMotion: api.renderMotion, renderGlyph: api.renderGlyph, motionCSS: api.motionCSS, setProgress: api.setProgress, motionForPhase: api.motionForPhase, glyphForPhase: api.glyphForPhase, motionTokens: api.motionTokens };
});
