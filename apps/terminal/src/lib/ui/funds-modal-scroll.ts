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
/**
 * The close and back buttons reach below the header into the top of the body, so a form's heading
 * is a full-width block of the form's root that sticks to the top edge of the body on the dialog's
 * own surface: content scrolls under that band, never under the buttons. Sticky offsets start at
 * the body's padding, so the band is pulled up by the same step as that padding. A heading that is
 * the first block also covers the padding strip above it at rest; every heading adds its form's gap
 * as bottom padding with the same negative margin, so the band is tall enough and nothing moves.
 */
export const FUNDS_MODAL_BODY_TOP_PADDING_CLASS = "pt-3";
export const FUNDS_MODAL_HEADING_CLASS = "sticky -top-3 z-1 bg-modal";
export const FUNDS_MODAL_LEADING_HEADING_CLASS = `${FUNDS_MODAL_HEADING_CLASS} -mt-3 pt-3`;
export const FUNDS_MODAL_HEADING_SLOT = "funds-modal-heading";
/**
 * The shell's back button sits in the same band as the close button of the primitive and takes the
 * same layer, above the heading band.
 */
export const FUNDS_MODAL_BACK_BUTTON_CLASS = "absolute top-5 left-4 z-10 min-[1001px]:top-6 min-[1001px]:left-6";
