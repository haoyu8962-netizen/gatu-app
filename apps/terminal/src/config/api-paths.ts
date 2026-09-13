// Same-origin HTTP endpoints that the client calls with plain `fetch`. Static hosting must route
// every path under `/api/` to the server or edge function that mounts these handlers; nothing
// else on the client depends on the TanStack Start server-function transport.
export const API_PATH_PREFIX = "/api/";
export const GEO_API_PATH = "/api/geo";
export const REFERRAL_GEO_API_PATH = "/api/referral-geo";
export const CLIENT_ERROR_REPORT_API_PATH = "/api/client-error-report";
export const LEADERBOARD_API_PATH = "/api/leaderboard";
export const BUILD_META_PATH = "/build-meta.json";
