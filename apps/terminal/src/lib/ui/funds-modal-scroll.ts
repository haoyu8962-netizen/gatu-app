/**
 * The Deposit / Withdraw / Bridge dialog and its status screens clip the popup, keep the header
 * fixed and scroll only the body, with the scrollbar hidden, on the desktop modal and the phone
 * sheet alike (`.claude/rules/style-ui-guide.md`, Dialog chrome).
 */
export const FUNDS_MODAL_POPUP_CLASS = "!overflow-hidden";
export const FUNDS_MODAL_HEADER_CLASS = "shrink-0";
export const FUNDS_MODAL_BODY_CLASS =
	"min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
export const FUNDS_MODAL_BODY_SLOT = "funds-modal-body";
