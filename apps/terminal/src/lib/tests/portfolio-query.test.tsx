// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPortfolioQueryStatus } from "@/domain/portfolio";
import { usePortfolioInfo } from "@/hooks/portfolio/use-portfolio-info";

const transport = vi.hoisted(() => ({ env: "Mainnet", info: { userVaultEquities: vi.fn() } }));
vi.mock("@sairn/hl-react", async (importOriginal) => ({
	...(await importOriginal<typeof import("@sairn/hl-react")>()),
	useHyperliquidTransport: () => transport,
}));

const FIRST_USER = "0x0000000000000000000000000000000000000001";
const SECOND_USER = "0x0000000000000000000000000000000000000002";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe({ user, mode, enabled = true }: { user: `0x${string}`; mode: string; enabled?: boolean }) {
	const query = usePortfolioInfo("userVaultEquities", { user }, mode, enabled);
	const status = getPortfolioQueryStatus(query, enabled, Date.now());
	return <output>{status === "ready" ? query.data?.[0]?.equity : status}</output>;
}

describe("portfolio query identity", () => {
	let root: Root;
	let container: HTMLDivElement;
	let client: QueryClient;

	beforeEach(() => {
		transport.env = "Mainnet";
		transport.info.userVaultEquities.mockReset();
		client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		container = document.createElement("div");
		root = createRoot(container);
	});
	afterEach(() => {
		act(() => root.unmount());
		client.clear();
	});

	async function render(user: `0x${string}`, mode = "disabled", enabled = true) {
		await act(async () => {
			root.render(
				<QueryClientProvider client={client}>
					<Probe user={user} mode={mode} enabled={enabled} />
				</QueryClientProvider>,
			);
		});
	}

	async function expectValue(value: string) {
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
		expect(container.textContent).toBe(value);
	}

	it.each(["wallet", "network", "mode"])(
		"isolates a pending %s transition from the previous result",
		async (change) => {
			transport.info.userVaultEquities.mockResolvedValueOnce([{ equity: "100" }]);
			await render(FIRST_USER);
			await expectValue("100");
			let finish: (data: Array<{ equity: string }>) => void = () => {};
			transport.info.userVaultEquities.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						finish = resolve;
					}),
			);
			if (change === "network") transport.env = "Testnet";
			await render(change === "wallet" ? SECOND_USER : FIRST_USER, change === "mode" ? "unifiedAccount" : "disabled");
			expect(container.textContent).toBe("loading");
			await act(async () => finish([{ equity: "200" }]));
			await expectValue("200");
			expect(client.getQueryCache().getAll()).toHaveLength(2);
		},
	);

	it("masks disconnected results and does not issue another request", async () => {
		transport.info.userVaultEquities.mockResolvedValue([{ equity: "100" }]);
		await render(FIRST_USER);
		await expectValue("100");
		await render(FIRST_USER, "disabled", false);
		expect(container.textContent).toBe("unavailable");
		expect(transport.info.userVaultEquities).toHaveBeenCalledTimes(1);
	});

	it("waits for a new response on re-entry rather than publishing old cached values", async () => {
		transport.info.userVaultEquities.mockResolvedValueOnce([{ equity: "100" }]);
		await render(FIRST_USER);
		await expectValue("100");
		transport.info.userVaultEquities.mockResolvedValueOnce([{ equity: "200" }]);
		await render(SECOND_USER);
		await expectValue("200");
		transport.info.userVaultEquities.mockImplementationOnce(() => new Promise(() => {}));
		await render(FIRST_USER);
		expect(container.textContent).toBe("loading");
	});
});
