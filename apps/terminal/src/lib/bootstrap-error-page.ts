const BOOTSTRAP_ERROR_PAGE_ATTRIBUTE = "data-terminal-bootstrap-error";

interface BootstrapErrorPageOptions {
	onReload?: () => void;
}

export function renderBootstrapErrorPage({ onReload = reloadWindow }: BootstrapErrorPageOptions = {}): void {
	try {
		const body = document.body;
		if (!body || body.querySelector(`[${BOOTSTRAP_ERROR_PAGE_ATTRIBUTE}]`)) return;

		const container = document.createElement("main");
		container.setAttribute(BOOTSTRAP_ERROR_PAGE_ATTRIBUTE, "");
		container.setAttribute("role", "alert");
		container.setAttribute("aria-labelledby", "terminal-bootstrap-error-heading");
		container.setAttribute("aria-describedby", "terminal-bootstrap-error-description");
		container.style.cssText =
			"min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0F1A1F;color:#fff;font-family:Inter,system-ui,sans-serif;text-align:center";

		const content = document.createElement("div");
		const heading = document.createElement("h1");
		const description = document.createElement("p");
		const reloadButton = document.createElement("button");

		heading.id = "terminal-bootstrap-error-heading";
		heading.textContent = "Something went wrong";
		heading.style.cssText = "margin:0 0 8px;font-size:16px";
		description.id = "terminal-bootstrap-error-description";
		description.textContent = "The terminal could not start safely. Reload it before trading.";
		description.style.cssText = "margin:0 0 16px;color:#aab4b9;font-size:13px";
		reloadButton.type = "button";
		reloadButton.textContent = "Reload terminal";
		reloadButton.style.cssText =
			"border:0;border-radius:6px;padding:8px 12px;background:#1FA67D;color:#fff;font:inherit;cursor:pointer";
		reloadButton.addEventListener("click", onReload, { once: true });

		content.append(heading, description, reloadButton);
		container.append(content);
		body.replaceChildren(container);
		reloadButton.focus();
	} catch {}
}

function reloadWindow(): void {
	window.location.reload();
}
