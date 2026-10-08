import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const TEST_RUNNER = /^(?:vitest run|playwright test|node --test)$/;
const TEST_RUNNER_IN_TEXT = /(?<!\S)(?:vitest\s+run|playwright\s+test|node\s+--test)(?!\S)/g;
const SHELL_OPERATOR = /^(?:&&|\|\|?|;)$/;
const CONCURRENCY_GROUP = "group: ${{ github.workflow }}-${{ github.ref }}";
const SHARD_FLAGS = "--fully-parallel --shard=${{ matrix.shard }}/2";
const PULL_REQUEST_WORKFLOWS = [
	"production-build.yml",
	"terminal-tests.yml",
	"static-checks.yml",
	"website-build.yml",
	"slider-browser.yml",
	"claude-code-review.yml",
];

function readWorkflow(name) {
	return readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
}

function countOccurrences(source, needle) {
	return source.split(needle).length - 1;
}

function workflowListItems(source) {
	const items = [];
	let item;
	for (const line of source.split("\n")) {
		const indent = line.search(/\S/);
		if (item && (indent < 0 || indent > item.indent)) {
			item.lines.push(line);
			continue;
		}
		const start = /^( *)- (.*)$/.exec(line);
		item = start ? { indent: start[1].length, lines: [`${start[1]}  ${start[2]}`] } : undefined;
		if (item) items.push(item);
	}
	return items;
}

function stepCommands(step) {
	const keyIndent = step.indent + 2;
	let directory = ".";
	let commands = [];
	for (const [index, line] of step.lines.entries()) {
		if (line.search(/\S/) !== keyIndent) continue;
		const [, key, value] = /^\s*([\w-]+):\s*(.*)$/.exec(line) ?? [];
		if (key === "working-directory") directory = value;
		if (key !== "run") continue;
		const block = /^([>|])[+-]?$/.exec(value);
		if (!block) {
			commands = [value];
			continue;
		}
		const end = step.lines.findIndex(
			(next, nextIndex) => nextIndex > index && next.trim() !== "" && next.search(/\S/) <= keyIndent,
		);
		const body = step.lines.slice(index + 1, end < 0 ? undefined : end).map((next) => next.trim());
		commands = block[1] === ">" ? [body.join(" ")] : body.join("\n").replaceAll("\\\n", " ").split("\n");
	}
	return { directory, commands: commands.filter((command) => !command.startsWith("#")) };
}

function testRunnerCalls(directory, command) {
	const tokens = command
		.replace(/\$\{\{.*?\}\}/g, "expression")
		.split(/\s+/)
		.filter(Boolean);
	return tokens.flatMap((token, index) => {
		const runner = `${token} ${tokens[index + 1]}`;
		if (!TEST_RUNNER.test(runner)) return [];
		const commandStart = tokens.slice(0, index).findLastIndex((other) => SHELL_OPERATOR.test(other)) + 1;
		const prefix = tokens.slice(commandStart, index);
		const directoryFlag = prefix.findLastIndex((other) => other === "--dir" || other === "-C");
		const rest = tokens.slice(index + 2);
		const end = rest.findIndex((other) => SHELL_OPERATOR.test(other));
		return [
			{
				directory: directoryFlag < 0 ? directory : join(directory, prefix[directoryFlag + 1]),
				paths: rest.slice(0, end < 0 ? undefined : end).filter((argument) => !argument.startsWith("-")),
			},
		];
	});
}

function matchesAnyFile(directory, listed) {
	const path = join(REPOSITORY_ROOT, directory, listed);
	if (!listed.includes("*")) return existsSync(path);
	const pattern = basename(listed)
		.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
		.replaceAll("*", ".*");
	const name = new RegExp(`^${pattern}$`);
	const parent = dirname(path);
	return existsSync(parent) && readdirSync(parent).some((entry) => !entry.startsWith(".") && name.test(entry));
}

function pathSelectsFile(listed, file) {
	if (dirname(listed) !== dirname(file)) return false;
	if (!listed.includes("*")) return basename(listed) === basename(file);
	const pattern = basename(listed)
		.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
		.replaceAll("*", ".*");
	return new RegExp(`^${pattern}$`).test(basename(file));
}

test("cancels superseded runs in pull request workflows and never in the comment-driven one", () => {
	for (const name of PULL_REQUEST_WORKFLOWS) {
		const workflow = readWorkflow(name);
		assert.equal(workflow.includes(CONCURRENCY_GROUP), true, `${name} is missing the concurrency group`);
		assert.equal(workflow.includes("cancel-in-progress: true"), true, `${name} does not cancel superseded runs`);
	}
	assert.equal(/^concurrency:/m.test(readWorkflow("claude.yml")), false);
});

test("builds the default pairing on pull requests and every pairing for main, release tags and manual runs", () => {
	const builds = readWorkflow("production-build.yml");
	const [, defaultPairings, allPairings] =
		/github\.event_name == 'pull_request' && github\.base_ref != 'main'\)\s+&& '(\[[^']+\])'\s+\|\| '(\[[^']+\])'/.exec(
			builds,
		) ?? [];

	assert.deepEqual(JSON.parse(defaultPairings), [{ enabled: "false" }]);
	const combinations = JSON.parse(allPairings).map((pairing) => pairing.enabled);
	assert.deepEqual(combinations.sort(), ["false", "true"]);

	assert.equal(/^\s+branches:/m.test(builds), false, "a base-branch filter would stop pull requests into dev from building");
	assert.equal(/^  workflow_dispatch:/m.test(builds), true);
});

test("starts the release builds for release tags only, never for archive tags", () => {
	const builds = readWorkflow("production-build.yml");
	const tagPatterns = [.../^  push:\n    tags:\n((?:      - .+\n)+)/m.exec(builds)[1].matchAll(/- "([^"]+)"/g)].map(
		(match) => match[1],
	);

	assert.deepEqual(tagPatterns, ["v[0-9]*", "cloudfront-[0-9]*"]);
	assert.equal(/^\s+tags-ignore:/m.test(builds), false, "tags and tags-ignore cannot be combined");

	const matchesAnyPattern = (tag) =>
		tagPatterns.some((pattern) =>
			new RegExp(`^${pattern.replace(/[.+?^${}()|\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`).test(tag),
		);
	for (const tag of ["v0.1.0", "v1", "cloudfront-2026-09-17-p21"]) {
		assert.equal(matchesAnyPattern(tag), true, `${tag} should start the release builds`);
	}
	for (const tag of ["archive/2026-09-10/huagan", "archive/v1", "vault-backup", "cloudfront-draft", "v"]) {
		assert.equal(matchesAnyPattern(tag), false, `${tag} must not start four production builds`);
	}
});

test("shards every browser invocation by test, in two jobs", () => {
	const browser = readWorkflow("slider-browser.yml");

	assert.equal(browser.includes("shard: [1, 2]"), true);
	assert.equal(/^\s+branches:/m.test(browser), false);
	const invocations = countOccurrences(browser, "exec playwright test");
	assert.equal(invocations >= 4, true);
	assert.equal(countOccurrences(browser, SHARD_FLAGS), invocations, "an unsharded invocation runs in full in both jobs");
	assert.equal(/pnpm --dir apps\/terminal test:browser/.test(browser), false, "package scripts bypass the shard flags");
	assert.equal(
		browser.includes("--config tests/browser/notifications.playwright.config.ts"),
		true,
		"the notification lifecycle regression must run in the browser job",
	);
	assert.equal(
		browser.includes("--config tests/browser/top-nav-connected.playwright.config.ts"),
		true,
		"the connected header width regression must run in the browser job",
	);
	assert.equal(
		browser.includes("--config tests/browser/brand-surfaces.playwright.config.ts"),
		true,
		"the brand surface regression must run in the browser job",
	);
	assert.equal(
		Number(/timeout-minutes: (\d+)/.exec(browser)?.[1]) >= 25,
		true,
		"a shard runs every browser suite and outran a 15-minute limit; keep at least 25 minutes",
	);
});

test("keeps the merged static checks in one job", () => {
	const staticChecks = readWorkflow("static-checks.yml");

	for (const command of ["pnpm typecheck", "pnpm check", "pnpm i18n:extract"]) {
		assert.equal(staticChecks.includes(`run: ${command}`), true, `static checks no longer run ${command}`);
	}
	assert.equal(countOccurrences(staticChecks, "runs-on:"), 1);
	assert.equal(staticChecks.includes('- "apps/terminal/src/locales/**/*.po"'), true);
	for (const replaced of ["typecheck.yml", "i18n-check.yml"]) {
		assert.equal(existsSync(new URL(`../.github/workflows/${replaced}`, import.meta.url)), false);
	}
});

test("keeps brand coverage when the website workflow only starts for its own inputs", () => {
	const website = readWorkflow("website-build.yml");
	const terminalTests = readWorkflow("terminal-tests.yml");
	const packageScripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;

	assert.equal(website.includes("run: pnpm test:brand"), true);
	for (const path of [
		"apps/website/**",
		"designs/og-cards/**",
		"scripts/generate-og-cards.mjs",
		"tests/**",
		"apps/terminal/public/og-terminal-1200x630.png",
		"apps/terminal/src/styles.css",
		"packages/ui/src/globals.css",
	]) {
		assert.equal(website.includes(`- "${path}"`), true, `website workflow does not start for ${path}`);
	}

	const terminalBrandTests = packageScripts["test:brand"].match(/src\/lib\/tests\/\S+\.test\.tsx?/g) ?? [];
	assert.equal(terminalBrandTests.length >= 5, true);
	assert.equal(
		terminalBrandTests.includes("src/lib/tests/status-motion-surface-contract.test.ts"),
		true,
		"the spinner registry must run with the brand tests",
	);
	for (const file of terminalBrandTests) {
		assert.equal(terminalTests.includes(file), true, `${file} only runs when the website workflow starts`);
	}
	assert.equal(/vitest run|pnpm test:brand/.test(readWorkflow("production-build.yml")), false);
});

test("re-runs the brand and legal guards whenever the brand source or legal text changes", () => {
	const filtersOf = (name) => new Set([...readWorkflow(name).matchAll(/^      - "([^"]+)"$/gm)].map((match) => match[1]));

	for (const [name, paths] of [
		["terminal-tests.yml", ["brand/**", "legal/**", "scripts/brand*.mjs"]],
		["production-build.yml", ["brand/**", "legal/**"]],
		["static-checks.yml", ["brand/brand.json"]],
		[
			"website-build.yml",
			[
				"brand/**",
				"legal/**",
				"apps/terminal/public/manifest.json",
				"apps/terminal/public/robots.txt",
				"apps/terminal/public/sitemap.xml",
				"apps/terminal/src/config/**",
			],
		],
	]) {
		const filters = filtersOf(name);
		for (const path of paths) {
			assert.equal(filters.has(path), true, `${name} does not start for ${path}`);
		}
	}

	const terminalTests = readWorkflow("terminal-tests.yml");
	assert.equal(terminalTests.includes("run: pnpm brand:check"), true, "terminal tests never check the brand source");
	for (const file of [
		"public-origins.test.ts",
		"brand-catalog-contract.test.ts",
		"pwa-manifest.test.ts",
		"network-storage.test.ts",
		"referral-join.test.ts",
		"referral.test.ts",
		"terms-content.test.ts",
		"legal-policy-contract.test.ts",
		"order-summary.test.tsx",
		"twap-order-summary.test.tsx",
	]) {
		assert.equal(terminalTests.includes(`src/lib/tests/${file}`), true, `${file} never runs in CI`);
	}
});

test("never lists a test path that matches no file", () => {
	const workflowNames = readdirSync(new URL("../.github/workflows/", import.meta.url));
	const missing = [];
	for (const name of workflowNames.filter((file) => file.endsWith(".yml"))) {
		const workflow = readWorkflow(name);
		const calls = workflowListItems(workflow)
			.map(stepCommands)
			.flatMap(({ directory, commands }) => commands.flatMap((command) => testRunnerCalls(directory, command)));
		const callsInText = workflow
			.split("\n")
			.filter((line) => !line.trim().startsWith("#"))
			.join("\n")
			.match(TEST_RUNNER_IN_TEXT);
		assert.equal(calls.length, callsInText?.length ?? 0, `${name} has a test runner call whose paths are not read`);
		for (const { directory, paths } of calls) {
			for (const listed of paths) {
				assert.equal(dirname(listed).includes("*"), false, `${name}: ${listed} has a wildcard outside the file name`);
				if (!matchesAnyFile(directory, listed)) missing.push(`${name}: ${join(directory, listed)}`);
			}
		}
	}
	assert.deepEqual(
		missing,
		[],
		"vitest and Playwright read a path that matches no file as a filter that selects nothing, and the step still passes",
	);
});

/** The part of a shell command that runs: everything from the first `#` token on is a comment. */
function executableCommand(command) {
	const tokens = command.split(/\s+/);
	const comment = tokens.findIndex((token) => token.startsWith("#"));
	return (comment < 0 ? tokens : tokens.slice(0, comment)).join(" ");
}

function tradingViewStepCalls(workflow) {
	const steps = workflowListItems(workflow).filter((item) =>
		item.lines.some((line) => line.trim() === "name: Test TradingView integration"),
	);
	assert.equal(steps.length, 1, "terminal-tests.yml has exactly one TradingView step");
	const { directory, commands } = stepCommands(steps[0]);
	return commands.flatMap((command) => testRunnerCalls(directory, executableCommand(command)));
}

test("selects both TradingView loader handshake tests in the terminal TradingView step", () => {
	const required = [
		"src/lib/tests/chart-library-loader-handshake-contract.test.ts",
		"src/lib/tests/chart-library-loader-handshake.test.ts",
	];
	const calls = tradingViewStepCalls(readWorkflow("terminal-tests.yml"));
	assert.equal(calls.length > 0, true, "the TradingView step runs a test runner");
	for (const file of required) {
		assert.equal(existsSync(join(REPOSITORY_ROOT, "apps/terminal", file)), true, `${file} is missing`);
		const selected = calls.some(
			({ directory, paths }) => directory === "apps/terminal" && paths.some((listed) => pathSelectsFile(listed, file)),
		);
		assert.equal(selected, true, `terminal-tests.yml does not select ${file}; the vendored loader patch would go unchecked`);
	}
});

test("ignores a TradingView step whose runner is commented out inline", () => {
	const workflow = readWorkflow("terminal-tests.yml");
	const step = workflowListItems(workflow).find((item) =>
		item.lines.some((line) => line.trim() === "name: Test TradingView integration"),
	);
	const runLine = step.lines.findIndex((line) => line.trim().startsWith("run:"));
	const commentedOut = [...step.lines];
	commentedOut[runLine + 1] = `${commentedOut[runLine + 1].replace(/^(\s*)/, "$1true; # ")}`;
	const { directory, commands } = stepCommands({ ...step, lines: commentedOut });
	assert.equal(commands.flatMap((command) => testRunnerCalls(directory, command)).length > 0, true);
	assert.deepEqual(
		commands.flatMap((command) => testRunnerCalls(directory, executableCommand(command))),
		[],
		"a runner behind an inline comment must not count as selected",
	);
});

test("rebuilds and re-checks chunking when a dependency patch changes", () => {
	for (const name of ["terminal-tests.yml", "production-build.yml"]) {
		assert.equal(readWorkflow(name).includes('- "patches/**"'), true, `${name} does not start for patches/**`);
	}
	assert.equal(
		readWorkflow("terminal-tests.yml").includes("src/lib/tests/vite-manual-chunks.test.ts"),
		true,
		"the manual chunk guard never runs in CI",
	);
});

test("runs the release metadata, CSP and card funding guards on pull requests", () => {
	const terminalTests = readWorkflow("terminal-tests.yml");
	for (const file of [
		"src/lib/tests/build-meta.test.ts",
		"src/lib/tests/security-policy-docs.test.ts",
		"src/lib/tests/privy-fiat-funding.test.ts",
		"src/lib/tests/privy-fiat-funding-host.test.tsx",
		"src/lib/tests/privy-fiat-funding-host-gate.test.tsx",
		"src/lib/tests/use-privy-fiat-funding-offer.test.tsx",
		"src/lib/tests/deposit-method-chooser.test.tsx",
		"src/lib/tests/deposit-modal-withdrawal-routing-guard.test.tsx",
		"src/lib/tests/use-deposit-routing-guard.test.tsx",
		"tests/mobile-trade-size-validation-a11y.test.tsx",
		"tests/trade-panel-open-interest-cap.test.tsx",
		"src/lib/tests/use-explicit-agent-approval.test.tsx",
		"src/lib/tests/agent-verification-status.test.ts",
		"src/lib/tests/use-agent-status-verification.test.tsx",
		"src/lib/tests/use-agent-status-mobile-cleanup.test.tsx",
		"src/lib/tests/use-agent-registration-race.test.tsx",
		"src/lib/tests/owner-trading-status.test.tsx",
		"src/lib/tests/use-connection-wallet-client.test.tsx",
		"src/lib/tests/use-terms-acceptance.test.tsx",
		"src/lib/tests/owner-trading-signer.test.tsx",
		"src/lib/tests/dialog-notice-radius-contract.test.ts",
		"src/lib/tests/loading-placeholder-contract.test.ts",
		"src/lib/tests/funds-modal-scroll-contract.test.ts",
		"src/lib/tests/global-modals-hip3-disclaimer.test.tsx",
		"src/lib/tests/deposit-modal-warm.test.ts",
		"src/lib/tests/i18n-reactivity-contract.test.ts",
	]) {
		assert.equal(terminalTests.includes(file), true, `${file} never runs in CI`);
	}
});
