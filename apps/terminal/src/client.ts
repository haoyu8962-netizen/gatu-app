import { canHydrateAfterMobileAgentSyncScrub } from "./lib/mobile-sync/bootstrap-fragment";

if (canHydrateAfterMobileAgentSyncScrub) {
	void import("./lib/error-reporting/client")
		.then(({ installGlobalErrorReporting, reportClientError }) => {
			installGlobalErrorReporting();
			return import("./client-hydrate").catch((error: unknown) => {
				reportClientError(error, { kind: "react_uncaught" });
				renderBootstrapErrorPage();
			});
		})
		.catch(() => {
			renderBootstrapErrorPage();
		});
}

function renderBootstrapErrorPage(): void {
	try {
		const body = document.body;
		if (!body) return;

		const container = document.createElement("main");
		container.setAttribute("role", "alert");
		container.style.cssText =
			"min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0F1A1F;color:#fff;font-family:Inter,system-ui,sans-serif;text-align:center";

		const content = document.createElement("div");
		const heading = document.createElement("h1");
		const description = document.createElement("p");
		const reloadButton = document.createElement("button");

		heading.textContent = "Something went wrong";
		heading.style.cssText = "margin:0 0 8px;font-size:16px";
		description.textContent = "The terminal could not start safely. Reload it before trading.";
		description.style.cssText = "margin:0 0 16px;color:#aab4b9;font-size:13px";
		reloadButton.type = "button";
		reloadButton.textContent = "Reload terminal";
		reloadButton.style.cssText =
			"border:0;border-radius:6px;padding:8px 12px;background:#1FA67D;color:#fff;font:inherit;cursor:pointer";
		reloadButton.addEventListener("click", () => window.location.reload());

		content.append(heading, description, reloadButton);
		container.append(content);
		body.replaceChildren(container);
	} catch {}
}
