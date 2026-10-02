/** Sairn Motion 1.3 — type declarations for sairn-motion.js (module import or window.SairnMotion). */
export as namespace SairnMotion;

export type MotionId =
  | 'brand-intro' | 'page-loading' | 'button-loading'
  | 'ai-analyzing' | 'data-syncing' | 'reconnecting'
  | 'wallet-awaiting' | 'submitting' | 'awaiting-result'
  | 'success' | 'error' | 'cancelled' | 'unknown'
  | 'copy-feedback' | 'skeleton' | 'progress';
export type GlyphId = 'success' | 'error' | 'cancelled' | 'unknown' | 'pending' | 'wallet' | 'submitting';
export type Theme = 'on-dark' | 'on-light' | 'mono';
export type Phase = 'idle' | 'wallet-awaiting' | 'submitting' | 'awaiting-result' | 'confirmed' | 'failed' | 'cancelled' | 'unknown';

export interface RenderOptions {
  /** Default 'on-dark'. 'mono' uses currentColor and must be inlined to inherit colour. */
  theme?: Theme;
  /** Width and height in px. Default: the motion's own canvas. */
  size?: number;
  /** Accessible name. Default: the Chinese name. */
  label?: string;
  /** true → aria-hidden, for motions next to visible text. */
  decorative?: boolean;
  paused?: boolean;
  /** true → final static frame, no animation. */
  reducedMotion?: boolean;
  /** Default true: inline the rules this SVG needs. Use false after injecting motionCSS() once. */
  embedStyle?: boolean;
}
export interface MotionOptions extends RenderOptions {
  /** 'progress' only: measured value 0–100. Default 0. */
  progress?: number;
}

/** Stylesheet for every motion and glyph; inject once per page. */
export function motionCSS(): string;
export function renderMotion(id: MotionId, options?: MotionOptions): string;
/** Status glyph: 24 grid for 20–32 px; size ≤ 18 uses the 16-grid outline. */
export function renderGlyph(id: GlyphId, options?: RenderOptions): string;
/** Update a rendered 'progress' SVG. Throws outside 0–100. */
export function setProgress(svg: SVGSVGElement, value: number): void;
/** 'unknown' maps to 'unknown', never to 'error'. 'idle' → null. */
export function motionForPhase(phase: Phase): MotionId | null;
export function glyphForPhase(phase: Phase): GlyphId | null;
export function motionTokens(): Record<string, unknown>;

/** <script> usage: window.SairnMotion. */
declare global {
  interface Window { SairnMotion: typeof import('./sairn-motion'); }
}
