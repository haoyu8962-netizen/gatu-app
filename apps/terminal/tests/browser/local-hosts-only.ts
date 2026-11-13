// Chromium resolves nothing but the loopback names and uses no proxy, so a browser test cannot reach the
// exchange, a wallet provider or any other named host from a developer machine or a CI runner (ADR 0056).
// Without the proxy flag a system proxy would resolve the names itself. A request to a literal IP address
// is not covered: fixtures must not contain one.
export const LOCAL_HOSTS_ONLY_ARGS = [
	"--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost",
	"--no-proxy-server",
];
