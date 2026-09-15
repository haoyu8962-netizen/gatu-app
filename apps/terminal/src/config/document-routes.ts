export const DOCUMENT_ROUTE_PATHS = ["/cookies", "/docs", "/privacy", "/risk", "/support", "/terms"] as const;

export type DocumentRoutePath = (typeof DOCUMENT_ROUTE_PATHS)[number];
