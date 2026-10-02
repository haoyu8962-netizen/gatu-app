import { getBootstrapFatalCopy, getBootstrapFatalDirection, getBootstrapFatalLocale } from "@/lib/bootstrap-error-copy";

const BOOTSTRAP_ERROR_PAGE_ATTRIBUTE = "data-terminal-bootstrap-error";

interface BootstrapErrorPageOptions {
	onReload?: () => void;
}

export function renderBootstrapErrorPage({ onReload = reloadWindow }: BootstrapErrorPageOptions = {}): void {
	try {
		const body = document.body;
		if (!body || body.querySelector(`[${BOOTSTRAP_ERROR_PAGE_ATTRIBUTE}]`)) return;
		const locale = getBootstrapFatalLocale();
		const copy = getBootstrapFatalCopy(locale);
		const direction = getBootstrapFatalDirection(locale);
		document.documentElement.lang = locale;
		document.documentElement.dir = direction;

		const container = document.createElement("main");
		container.setAttribute(BOOTSTRAP_ERROR_PAGE_ATTRIBUTE, "");
		container.lang = locale;
		container.dir = direction;
		container.style.cssText =
			"min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0F1A1F;color:#fff;font-family:system-ui,sans-serif;text-align:center";

		const content = document.createElement("div");
		content.setAttribute("role", "alert");
		content.setAttribute("aria-labelledby", "terminal-bootstrap-error-heading");
		content.setAttribute("aria-describedby", "terminal-bootstrap-error-description");
		const heading = document.createElement("h1");
		const description = document.createElement("p");
		const reloadButton = document.createElement("button");

		heading.id = "terminal-bootstrap-error-heading";
		heading.textContent = copy.heading;
		heading.style.cssText = "margin:0 0 8px;font-size:16px";
		description.id = "terminal-bootstrap-error-description";
		description.textContent = copy.description;
		description.style.cssText = "margin:0 0 16px;color:#aab4b9;font-size:13px";
		reloadButton.type = "button";
		reloadButton.textContent = copy.reload;
		reloadButton.style.cssText =
			"border:0;border-radius:6px;padding:8px 12px;background:#86E5D3;color:#08090D;font:inherit;cursor:pointer";
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
