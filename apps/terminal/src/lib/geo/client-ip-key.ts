export interface ClientIpKey {
	/** Key for the per-client limiter: the IPv4 address, or the IPv6 /64. */
	key: string;
	/** The whole address in one spelling. Verdicts are cached per address: proxy and Tor flags belong to one address. */
	exact: string;
	/** Key for the per-network lookup budget: IPv4 /24 or IPv6 /48; the raw value when unparseable. */
	network: string;
	/** Coarse prefix that is safe to log: IPv4 /24 or IPv6 /48; null when the address is unparseable. */
	logPrefix: string | null;
}

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEXTET_PATTERN = /^[0-9a-f]{1,4}$/;

function parseIpv4(value: string): number[] | null {
	const match = IPV4_PATTERN.exec(value);
	if (!match) return null;
	const octets = match.slice(1).map(Number);
	return octets.every((octet) => octet <= 255) ? octets : null;
}

function parseHextets(part: string): number[] | null {
	if (part === "") return [];
	const groups = part.split(":");
	const hextets: number[] = [];
	for (const [index, group] of groups.entries()) {
		if (index === groups.length - 1 && group.includes(".")) {
			const octets = parseIpv4(group);
			if (!octets) return null;
			hextets.push(((octets[0] ?? 0) << 8) | (octets[1] ?? 0), ((octets[2] ?? 0) << 8) | (octets[3] ?? 0));
			continue;
		}
		if (!HEXTET_PATTERN.test(group)) return null;
		hextets.push(Number.parseInt(group, 16));
	}
	return hextets;
}

function parseIpv6(value: string): number[] | null {
	const address = value.toLowerCase().split("%")[0] ?? "";
	const halves = address.split("::");
	if (halves.length > 2) return null;
	const head = parseHextets(halves[0] ?? "");
	const tail = halves.length === 2 ? parseHextets(halves[1] ?? "") : [];
	if (!head || !tail) return null;
	if (halves.length === 1) return head.length === 8 ? head : null;
	const gap = 8 - head.length - tail.length;
	if (gap < 1) return null;
	return [...head, ...new Array<number>(gap).fill(0), ...tail];
}

function hex(hextets: number[]): string {
	return hextets.map((hextet) => hextet.toString(16)).join(":");
}

function ipv4Key(octets: number[]): ClientIpKey {
	const network = `${octets.slice(0, 3).join(".")}.0/24`;
	return { key: octets.join("."), exact: octets.join("."), network, logPrefix: network };
}

/**
 * Normalizes a client address for caching and rate limiting. IPv6 is keyed by its /64: that is the
 * unit a provider assigns to one subscriber or one site (RFC 6177, RIPE-690), so every address in it
 * belongs to the same user or network, while a shorter prefix could merge different customers and
 * hand one customer's jurisdiction verdict to another. IPv4 and IPv4-mapped IPv6 stay whole.
 */
export function toClientIpKey(ip: string): ClientIpKey {
	const trimmed = ip.trim();
	const ipv4 = parseIpv4(trimmed);
	if (ipv4) return ipv4Key(ipv4);

	const hextets = parseIpv6(trimmed);
	if (!hextets) {
		const raw = `raw:${trimmed.toLowerCase()}`;
		return { key: raw, exact: raw, network: raw, logPrefix: null };
	}
	const isIpv4Mapped = hextets.slice(0, 5).every((hextet) => hextet === 0) && hextets[5] === 0xffff;
	if (isIpv4Mapped) {
		const high = hextets[6] ?? 0;
		const low = hextets[7] ?? 0;
		return ipv4Key([high >> 8, high & 0xff, low >> 8, low & 0xff]);
	}
	const network = `${hex(hextets.slice(0, 3))}::/48`;
	return { key: `${hex(hextets.slice(0, 4))}::/64`, exact: hex(hextets), network, logPrefix: network };
}
