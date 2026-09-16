export const headerSafeArea = "pt-[env(safe-area-inset-top)]";
export const headerSurface = "sticky top-0 z-40 bg-surface";
export const headerBorder = "border-b border-trading-panel-stroke-card";
export const headerInner = "flex h-14 items-center gap-2 pl-[max(0.625rem,var(--sal))] pr-[max(0.625rem,var(--sar))]";
export const headerBrand = "flex shrink-0 items-center gap-1.5";
export const headerLogo =
	"touch-target grid shrink-0 place-items-center rounded-8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus max-[359px]:hidden";
export const headerActions = "ms-auto flex min-w-0 flex-1 items-center justify-end gap-1 min-[360px]:gap-2";
export const headerAccount =
	"flex min-w-0 flex-1 justify-end [&_button]:h-11 [&_button]:min-h-11 [&_button]:min-w-0 [&_button]:rounded-8 [&_button]:border-trading-panel-stroke-card [&_button]:px-2.5 [&_button]:text-xs";
export const headerTheme = "size-11 min-h-11 text-trading-panel-muted hover:text-trading-panel-fg";
export const headerLanguage = "size-11 min-h-11 text-market-close-muted hover:text-market-close-fg";
export const headerSettings = "size-11 min-h-11 shrink-0 text-trading-panel-muted hover:text-trading-panel-fg";
export const tradeSplit = "flex min-h-[clamp(370px,60svh,480px)] w-full min-w-0 items-stretch";
export const bookColumn = "relative min-w-0 flex-1 self-stretch";
export const tradeScroll = "flex flex-1 flex-col";
export const tradeEmbeddedContent =
	"trade-panel-container flex-1 min-h-min flex flex-col gap-2 px-2.5 py-1.5 font-market-close";
export const tradeColumn = "flex-[1.53] min-w-0 border-r border-stroke-weak/60";
export const positionsWrapper = "w-full min-w-0 min-h-0 flex flex-col border-t border-stroke-weak/60";
export const pageSurface = "h-full min-h-0 bg-background [overflow-anchor:none]";
export const pageScroll = "overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
export const terminal = "mobile-terminal fixed inset-0 w-full flex flex-col bg-background text-fg font-sans";
export const workspace = "flex-1 min-h-0 flex flex-col overflow-hidden pl-[var(--sal)] pr-[var(--sar)]";
export const nav = "relative z-50 shrink-0 bg-surface border-t border-trading-panel-stroke-card";
export const navSafeArea = "pb-[env(safe-area-inset-bottom)]";
export const navInner = "flex items-stretch pl-[var(--sal)] pr-[var(--sar)]";
export const navItem = "flex-1 flex flex-col items-center justify-center gap-[3px] rounded-none px-1";
export const navLabel = "text-3xs tracking-wide";
export const positionsScroll =
	"min-w-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
export const positionsTabs = "h-[47px] min-w-max gap-0 border-b border-market-close-stroke-card px-3.5 pr-7";
export const positionsTab =
	"min-h-11 shrink-0 px-2.5 text-[13px] font-medium leading-none text-market-close-subtle transition-colors duration-[120ms] hover:text-market-close-fg focus-visible:outline-market-close-focus data-active:text-market-close-fg";
export const positionsFade =
	"pointer-events-none absolute inset-y-0 right-0 w-7 bg-linear-to-r from-transparent to-modal";
export const tradeView = "flex min-h-0 flex-col self-stretch";
export const ctaWrapper = "shrink-0 border-t border-trading-panel-stroke-card bg-surface";
export const ctaEmbeddedPadding = "px-2.5 py-2";
export const ctaButton = "w-full rounded-[10px] text-sm font-bold whitespace-nowrap shadow-none";
export const ctaEmbeddedHeight = "h-[38px]";
export const summary = "mt-auto border-t border-trading-panel-stroke-row pt-2";
export const summaryRow = "flex min-w-0 items-center justify-between";
export const summaryCompactRow = "gap-1 py-0.5";
export const summaryLabel = "min-w-0 truncate text-trading-panel-muted";
export const summaryValue = "shrink-0 whitespace-nowrap text-right font-semibold tabular-nums";
export const available =
	"relative flex min-h-[15px] w-full min-w-0 items-center justify-between gap-2 text-xs leading-[15px] text-trading-panel-muted after:absolute after:top-1/2 after:left-0 after:h-6 after:w-full after:-translate-y-1/2 after:content-[''] disabled:cursor-default";
export const marketBar =
	"w-full max-w-full min-w-0 shrink-0 overflow-hidden border-b border-trading-panel-stroke-row bg-surface font-market-close text-trading-panel-fg";
export const marketGrid =
	"grid min-h-[61px] min-w-0 grid-cols-2 items-center gap-x-4 px-4 py-2.5 max-[360px]:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] max-[360px]:gap-x-1 max-[360px]:px-2.5";
export const marketAsset = "flex shrink-0 [&>span]:size-11 [&_button]:size-11 [&_.relative.inline-flex]:size-7";
export const marketQuote =
	"grid min-w-0 grid-cols-[minmax(0,1fr)_36px] items-center gap-2 overflow-visible max-[360px]:gap-1";
export const marketPrice =
	"block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[18px] leading-[22px] font-bold text-trading-panel-fg tabular-nums max-[360px]:text-base max-[360px]:leading-5";
export const marketChange = "max-w-full whitespace-normal text-[11px] leading-[15px] font-semibold tabular-nums";
export const marketExpand =
	"relative flex h-[30px] w-9 shrink-0 items-center justify-center rounded-[8px] border bg-transparent after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:bg-trading-panel-hover active:bg-fill-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-focus";
export const book =
	"orderbook-panel-container flex-1 min-h-0 flex flex-col overflow-hidden font-market-close text-trading-panel-fg [--orderbook-hover-gap:4px]";
export const bookHeader =
	"grid h-[35px] shrink-0 grid-cols-2 items-center gap-1 border-b border-trading-panel-stroke-row pl-2 pr-3 text-xs tracking-normal orderbook-header-text uppercase";
export const bookMid = "shrink-0 flex h-[24px] items-center justify-start px-2 gap-1.5";
export const bookFooter =
	"shrink-0 h-[31px] border-t border-trading-panel-stroke-row flex items-center gap-1 text-trading-panel-muted pl-2 pr-1 text-xs max-[339px]:pl-1";
export const marketSelector =
	"inline-flex min-h-11 min-w-0 shrink-0 items-center rounded-[9px] bg-transparent py-1 pr-1 font-market-close hover:bg-trading-panel-hover active:bg-fill-press cursor-pointer leading-none";
export const marketName =
	"whitespace-nowrap text-base leading-5 font-bold tracking-tight text-trading-panel-fg max-[360px]:text-[13px] max-[360px]:leading-4";
export const marketBadge =
	"inline-flex max-w-20 shrink-0 items-center truncate rounded-[4px] px-1.5 py-0.5 text-[10px] leading-none font-semibold whitespace-nowrap";
export const orderControl =
	"relative flex h-[35px] min-w-0 items-center gap-3 whitespace-nowrap rounded-none bg-surface px-0 text-xs font-semibold text-trading-panel-fg";
export const orderCaret = "h-1.5 w-[9px] shrink-0 text-trading-panel-subtle";
export const sizeFrame = "h-8 px-2.5";
export const sizeLabel = "me-2 shrink-0 whitespace-nowrap text-2xs text-trading-panel-subtle";
export const sizeValue =
	"h-7 min-w-0 flex-1 bg-transparent px-0 text-right text-base font-semibold tabular-nums text-trading-panel-fg";
export const sizeUnit =
	"relative ms-2 inline-flex h-8 min-w-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap text-xs font-semibold text-trading-panel-fg after:absolute after:inset-0 after:content-[''] disabled:cursor-not-allowed";
export const sizeSliderRow = "flex items-center gap-2 pt-0.5";
export const sliderFrame = "relative h-[33px] w-full";
export const sliderTrack = "absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full";
export const sizePercent = "h-[31px] w-20 shrink-0 rounded-[8px] px-2";
export const buttonOutlineNeutralSm =
	"inline-flex items-center justify-center gap-1.5 font-semibold select-none rounded-8 border bg-transparent shadow-raised py-1.5 text-xs text-fg";
export const buttonFilledBrandMd =
	"inline-flex items-center justify-center gap-2 select-none py-2 px-4 bg-action text-on-action";
export const buttonIconGhostNeutralSm =
	"inline-flex items-center justify-center shrink-0 select-none rounded-8 bg-transparent text-fg";
export const headerWalletFrame =
	"h-11 min-h-11 min-w-0 max-w-full rounded-8 border-trading-panel-stroke-card px-2.5 text-xs";
export const sideBox = "rounded-[10px] border-trading-panel-stroke-card bg-surface";
export const sideMobile = "h-[31px] py-0 text-xs after:content-none";
export const ctaConnect =
	"bg-trading-panel-control text-trading-panel-on-control hover:not-data-disabled:bg-trading-panel-control/90";
export const ctaConnectDark = "dark:bg-fill-weak dark:text-action dark:hover:not-data-disabled:bg-fill-hover";
export const optionsGrid = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 max-[1000px]:gap-y-3";
export const option = "min-w-0 min-h-5 items-center gap-1.5 max-[1000px]:min-h-8";
export const optionLabel = "text-xs text-trading-panel-muted";
export const optionControl =
	"size-[17px] rounded-[5px] border-trading-panel-stroke-control data-checked:border-trading-panel-control data-checked:bg-trading-panel-control";
