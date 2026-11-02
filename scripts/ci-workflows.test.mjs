import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
// The workflows a dev to main promotion may skip, each with the job its coverage job decides about (ADR 0016 D8).
const PROMOTION_COVERAGE_JOBS = {
	"terminal-tests.yml": "terminal-tests",
	"slider-browser.yml": "terminal-browser",
	"production-build.yml": "terminal",
	"website-build.yml": "website",
};
const PROMOTION = { event_name: "pull_request", base_ref: "main", head_ref: "dev" };
const EVENTS = [
	{
		name: "a pull request into dev",
		github: { event_name: "pull_request", base_ref: "dev", head_ref: "claude/feature" },
		pairings: ["false"],
	},
	{ name: "a covered promotion", github: PROMOTION, covered: "true", skips: true, pairings: ["true"] },
	{ name: "an uncovered promotion", github: PROMOTION, covered: "false", pairings: ["false", "true"] },
	{
		name: "a promotion whose coverage job failed",
		github: PROMOTION,
		covered: "",
		coverageFails: true,
		pairings: ["false", "true"],
	},
	{
		name: "an urgent fix into main",
		github: { event_name: "pull_request", base_ref: "main", head_ref: "claude/hotfix" },
		pairings: ["false", "true"],
	},
	{ name: "a release tag", github: { event_name: "push", base_ref: "", head_ref: "" }, pairings: ["false", "true"] },
	{
		name: "a manual run",
		github: { event_name: "workflow_dispatch", base_ref: "", head_ref: "" },
		pairings: ["false", "true"],
	},
	{
		name: "a cancelled run of a pull request into dev",
		github: { event_name: "pull_request", base_ref: "dev", head_ref: "claude/feature" },
		cancelled: true,
	},
	{ name: "a cancelled promotion", github: PROMOTION, covered: "false", cancelled: true },
];
const EXPRESSION_TOKEN = /\s+|==|!=|&&|\|\||!|\(|\)|'[^']*'|fromJSON\(|cancelled\(\)|(?:github|needs)(?:\.[\w-]+)+/y;

function readWorkflow(name) {
	return readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
}

/** A workflow's jobs by id, each as the text of the lines below its id. */
function workflowJobs(source) {
	const jobs = {};
	let id;
	for (const line of (/^jobs:\n([\s\S]*)$/m.exec(source)?.[1] ?? "").split("\n")) {
		const start = /^ {2}([\w-]+):$/.exec(line);
		if (start) {
			id = start[1];
			jobs[id] = [];
		} else if (id && !/^ {0,2}\S/.test(line)) {
			jobs[id].push(line);
		}
	}
	return Object.fromEntries(Object.entries(jobs).map(([job, lines]) => [job, lines.join("\n")]));
}

function jobValue(job, key) {
	return new RegExp(`^ {4}${key}: (.+)$`, "m").exec(job)?.[1];
}

/**
 * Evaluates the part of GitHub's expression syntax these workflows use. Every value compared here is a
 * lowercase string, so JavaScript's operators of the same names give GitHub's results; any other syntax
 * (another function, a number, an object filter) fails the test instead of being guessed at.
 */
function evaluate(expression, { github, covered = "", cancelled = false }) {
	const source = expression.trim().replace(/^\$\{\{([\s\S]*)\}\}$/, "$1");
	EXPRESSION_TOKEN.lastIndex = 0;
	while (EXPRESSION_TOKEN.lastIndex < source.length) {
		const at = EXPRESSION_TOKEN.lastIndex;
		assert.ok(EXPRESSION_TOKEN.exec(source), `unsupported expression syntax: ${source.slice(at)}`);
	}
	const needs = { coverage: { outputs: { covered } } };
	return new Function("github", "needs", "cancelled", `return (${source.replaceAll("fromJSON(", "JSON.parse(")});`)(
		github,
		needs,
		() => cancelled,
	);
}

/** What `needs.coverage.outputs.covered` holds for an event: empty unless the coverage job ran. */
function coverageOutput(name, event) {
	const { coverage } = workflowJobs(readWorkflow(name));
	return !event.cancelled && evaluate(jobValue(coverage, "if"), event) ? (event.covered ?? "") : "";
}

/**
 * Whether GitHub starts a job that needs the coverage job. An `if` that calls no status function also requires
 * `success()`: the run was not cancelled and every job it needs succeeded, so a skipped coverage job (any event but
 * a promotion) would skip it too. A status function's name inside a string literal is not a call.
 */
function jobRuns(name, job, event) {
	const { coverage } = workflowJobs(readWorkflow(name));
	const coverageSucceeded = !event.cancelled && evaluate(jobValue(coverage, "if"), event) && !event.coverageFails;
	const succeeded = !event.cancelled && (jobValue(job, "needs") === undefined || coverageSucceeded);
	const condition = jobValue(job, "if");
	if (condition === undefined) return succeeded;
	const callsStatusFunction = /\b(?:success|failure|always|cancelled)\(\)/.test(condition.replace(/'[^']*'/g, "''"));
	const context = { github: event.github, covered: coverageOutput(name, event), cancelled: Boolean(event.cancelled) };
	return (callsStatusFunction || succeeded) && evaluate(condition, context);
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

test("builds the default on pull requests into dev, the pairing-on state alone on a covered promotion, and both otherwise", () => {
	const builds = readWorkflow("production-build.yml");
	const { terminal } = workflowJobs(builds);
	const pairing = /^ {8}pairing: >-\n((?: {10}.+\n)+)/m.exec(terminal)?.[1];
	assert.ok(pairing, "the build matrix is no longer one folded pairing expression");

	for (const event of EVENTS) {
		const builds = jobRuns("production-build.yml", terminal, event);
		assert.equal(builds, !event.cancelled, `${event.name} ${builds ? "builds" : "builds nothing"}`);
		if (!builds) continue;
		const context = { github: event.github, covered: coverageOutput("production-build.yml", event) };
		const built = evaluate(pairing.replace(/\n */g, " "), context).map((entry) => entry.enabled);
		assert.deepEqual(built, event.pairings, `${event.name} builds pairing ${built.join(" and ")}`);
	}
	assert.equal(/^  workflow_dispatch:/m.test(builds), true);
});

test("asks for promotion coverage only on a dev to main promotion, read-only and in one shared form", () => {
	const forms = new Set();
	for (const name of Object.keys(PROMOTION_COVERAGE_JOBS)) {
		const source = readWorkflow(name);
		const { coverage } = workflowJobs(source);
		assert.ok(coverage, `${name} has no coverage job`);
		for (const event of EVENTS) {
			assert.equal(
				evaluate(jobValue(coverage, "if"), event),
				event.github === PROMOTION,
				`${name} ${event.github === PROMOTION ? "must" : "must not"} ask for coverage on ${event.name}`,
			);
		}
		assert.equal(jobValue(coverage, "name"), "Promotion coverage");
		assert.equal(countOccurrences(source, "node scripts/promotion-coverage.mjs"), 1, `${name} asks for coverage once`);
		assert.equal(coverage.includes(`run: node scripts/promotion-coverage.mjs ${name}\n`), true, `${name} must ask about its own runs`);
		assert.match(
			coverage,
			/^ {4}outputs:\n {6}covered: \$\{\{ steps\.check\.outputs\.covered \}\}\n[\s\S]*- id: check\n {8}run: node /m,
			"the script's covered= line must reach the jobs that read needs.coverage.outputs.covered",
		);
		assert.match(coverage, /^ {10}fetch-depth: 0$/m, "the script walks dev's history and finds main's newest dev commit");
		assert.match(coverage, /^ {4}permissions:\n {6}actions: read\n {6}contents: read\n(?! {6})/m);
		assert.equal(/:\s*write\b/.test(coverage), false, "the coverage job only reads");
		assert.equal(
			/^\s+branches(?:-ignore)?:/m.test(source),
			false,
			`${name}: a base-branch filter would stop pull requests into dev from running it, or skip a fix that goes straight into main`,
		);
		forms.add(coverage.replace(name, "<workflow>"));
	}
	assert.equal(forms.size, 1, "the coverage jobs differ in more than the workflow they ask about");

	const staticChecks = readWorkflow("static-checks.yml");
	assert.equal(/^\s+needs:/m.test(staticChecks), false, "a promotion always runs the static checks");
	assert.equal(staticChecks.includes("promotion-coverage.mjs"), false, "a promotion always runs the static checks");
});

test("skips the tests, browser regressions and website build only on a promotion found covered", () => {
	for (const [name, job] of Object.entries(PROMOTION_COVERAGE_JOBS)) {
		const jobs = workflowJobs(readWorkflow(name));
		assert.deepEqual(Object.keys(jobs), ["coverage", job], `${name} has a job outside the promotion coverage decision`);
		assert.equal(jobValue(jobs[job], "needs"), "coverage", `${name}: ${job} must wait for the coverage decision`);
		if (name === "production-build.yml") continue;
		for (const event of EVENTS) {
			const runs = jobRuns(name, jobs[job], event);
			assert.equal(runs, !event.skips && !event.cancelled, `${name} ${runs ? "runs" : "skips"} ${job} for ${event.name}`);
		}
	}

	const terminalTests = readWorkflow("terminal-tests.yml");
	for (const file of ["scripts/promotion-coverage.mjs", "scripts/promotion-coverage.test.mjs"]) {
		assert.equal(terminalTests.includes(`- "${file}"`), true, `terminal-tests.yml does not start for ${file}`);
	}
	assert.match(
		terminalTests,
		/node --test\n(?:[ \t]+scripts\/\S+\n)*[ \t]+scripts\/promotion-coverage\.test\.mjs\n/,
		"the coverage decision's own tests never run in CI",
	);
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
		Number(jobValue(workflowJobs(browser)["terminal-browser"], "timeout-minutes")) >= 25,
		true,
		"a shard runs every browser suite and outran a 15-minute limit; keep at least 25 minutes",
	);
});

test("shards every terminal Vitest step across two jobs and runs the other steps once", () => {
	const terminalTests = readWorkflow("terminal-tests.yml");
	const vitestShardFlags = "--maxWorkers=1 --shard=${{ matrix.shard }}/2 --passWithNoTests";

	assert.match(
		terminalTests,
		/\n    strategy:\n      fail-fast: false\n      matrix:\n        shard: \[1, 2\]\n    name: /,
		"the matrix is exactly two shards: an include or exclude entry would drop or add a job",
	);
	const invocations = countOccurrences(terminalTests, "exec vitest run");
	assert.equal(invocations >= 14, true);
	assert.equal(
		countOccurrences(terminalTests, `exec vitest run ${vitestShardFlags}`),
		invocations,
		"an unsharded Vitest step runs in full in both jobs",
	);

	const steps = workflowListItems(terminalTests).filter((item) => item.lines.some((line) => /^\s*run:/.test(line)));
	const onceOnly = steps.filter((step) => {
		const body = step.lines.join("\n");
		return /node --test|pnpm test:cloudfront|pnpm brand:check/.test(body);
	});
	assert.equal(onceOnly.length, 3, "the release validators, CloudFront tooling and brand check are three steps");
	for (const step of onceOnly) {
		assert.equal(
			step.lines.some((line) => line.trim() === "if: matrix.shard == 1"),
			true,
			`${step.lines[0].trim()} would run in both shards`,
		);
	}
	const gated = steps.filter((step) => step.lines.some((line) => line.trim().startsWith("if:")));
	assert.equal(gated.length, onceOnly.length, "a Vitest step gated to one shard would skip half of its files");

	const allowedFlags = ["--maxWorkers=1", "--passWithNoTests", "--shard=expression/2"];
	let vitestSteps = 0;
	for (const { commands } of steps.map(stepCommands)) {
		for (const command of commands) {
			const tokens = executableCommand(command)
				.replace(/\$\{\{.*?\}\}/g, "expression")
				.split(/\s+/)
				.filter(Boolean);
			const start = tokens.findIndex((token, index) => token === "vitest" && tokens[index + 1] === "run");
			if (start < 0) continue;
			vitestSteps += 1;
			const argumentsAfterRun = tokens.slice(start + 2);
			assert.deepEqual(
				argumentsAfterRun.filter((token) => token.startsWith("-")).sort(),
				allowedFlags,
				"an extra flag such as --exclude can empty a selection that --passWithNoTests then accepts",
			);
			const paths = argumentsAfterRun.filter((token) => !token.startsWith("-"));
			assert.equal(paths.length > 0, true, "a Vitest step without paths runs the whole suite in both shards");
			for (const listed of paths) {
				assert.match(
					listed,
					/\.test\.tsx?$/,
					`${listed} exists but is not a test file: Vitest would select nothing for it and still pass`,
				);
			}
		}
	}
	assert.equal(vitestSteps, invocations, "a Vitest command behind a shell comment does not run");
});

test("does not start the browser regressions for a change to unit tests only", () => {
	const browser = readWorkflow("slider-browser.yml");
	const paths = [.../^      - "([^"]+)"$/gm[Symbol.matchAll](browser)].map((match) => match[1]);
	const source = paths.indexOf("apps/terminal/src/**");

	assert.equal(source >= 0, true);
	for (const excluded of ["!apps/terminal/src/**/*.test.ts", "!apps/terminal/src/**/*.test.tsx"]) {
		assert.equal(paths.indexOf(excluded) > source, true, `${excluded} must come after the pattern it narrows`);
	}
	// GitHub applies the patterns in order and the last one that matches a file decides, so a positive
	// pattern added after the exclusions would start the workflow for unit tests again.
	const startsFor = (file) => {
		let started = false;
		for (const pattern of paths) {
			const negated = pattern.startsWith("!");
			const expression = (negated ? pattern.slice(1) : pattern)
				.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
				.replaceAll("**", "\u0000")
				.replaceAll("*", "[^/]*")
				.replaceAll("\u0000", ".*");
			if (new RegExp(`^${expression}$`).test(file)) started = !negated;
		}
		return started;
	};
	for (const [file, expected] of [
		["apps/terminal/src/lib/tests/format.test.ts", false],
		["apps/terminal/src/components/staking/__tests__/staking-view.test.tsx", false],
		["apps/terminal/src/lib/tests/harness/react.tsx", true],
		["apps/terminal/src/locales/zh/messages.po", true],
		["apps/terminal/src/hooks/trade/use-order-entry-data.ts", true],
		["apps/terminal/tests/browser/account-actions.pw.ts", true],
		["packages/ui/src/modal.tsx", true],
		["docs/agent-handbook.md", false],
	]) {
		assert.equal(startsFor(file), expected, `${file} ${expected ? "must" : "must not"} start the browser regressions`);
	}
	assert.deepEqual(
		paths.filter((path) => path.startsWith("!")),
		["!apps/terminal/src/**/*.test.ts", "!apps/terminal/src/**/*.test.tsx"],
		"only *.test files are excluded: fixtures import src/lib/tests/harness, and catalogs change rendered text",
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
		"src/lib/tests/trading-authorization.test.tsx",
		"src/lib/tests/use-agent-status-cache.test.tsx",
		"src/lib/tests/use-agent-wallet.test.tsx",
		"src/lib/tests/establish-connection-modal.test.tsx",
		"src/lib/tests/use-connection-wallet-client.test.tsx",
		"src/lib/tests/use-terms-acceptance.test.tsx",
		"src/lib/tests/owner-trading-signer.test.tsx",
		"src/lib/tests/dialog-notice-radius-contract.test.ts",
		"src/lib/tests/loading-placeholder-contract.test.ts",
		"src/lib/tests/funds-modal-scroll-contract.test.ts",
		"src/lib/tests/global-modals-hip3-disclaimer.test.tsx",
		"src/lib/tests/deposit-modal-warm.test.ts",
		"src/lib/tests/i18n-reactivity-contract.test.ts",
		"src/lib/tests/agent-session.test.ts",
		"src/lib/tests/use-agent-status-mobile-ended.test.tsx",
		"src/lib/tests/mobile-agent-ended-notifier.test.tsx",
		"src/lib/tests/trading-guard-session.test.tsx",
		"src/lib/tests/use-privy-owner-signer.test.tsx",
		"src/lib/tests/api-wallet-view-agent-only.test.tsx",
		"src/lib/tests/portfolio-page-agent-only.test.tsx",
		"src/lib/tests/referral-dashboard-agent-only.test.tsx",
		"src/lib/tests/mobile-agent-qr-scanner-load.test.ts",
		"src/lib/tests/trading-activation.test.ts",
		"src/components/staking/__tests__/use-staking-controller.test.tsx",
		"src/components/vaults/__tests__/use-vault-action-controller.test.tsx",
	]) {
		assert.equal(terminalTests.includes(file), true, `${file} never runs in CI`);
	}
});

function stepIndex(steps, command) {
	return steps.findIndex((step) => stepCommands(step).commands.includes(command));
}

test("tests the built website after building it, and keeps the source tests in the brand step", () => {
	const website = readWorkflow("website-build.yml");
	const websiteScripts = JSON.parse(readFileSync(new URL("../apps/website/package.json", import.meta.url), "utf8")).scripts;
	const steps = workflowListItems(website).filter((item) => item.lines.some((line) => /^\s*run:/.test(line)));

	const build = stepIndex(steps, "pnpm --filter @sairn/website build");
	const dist = stepIndex(steps, "pnpm --filter @sairn/website test:dist");
	assert.equal(build >= 0, true, "the website workflow no longer builds the site");
	assert.equal(dist > build, true, "test:dist reads apps/website/dist, so it must run after the build step");
	assert.equal(stepIndex(steps, "pnpm test:brand") < build, true, "the source tests run before the build");

	assert.match(websiteScripts.test, /--test tests\/\*\.test\.mjs$/, "`test` runs the source-only tests");
	assert.match(websiteScripts["test:dist"], /--test tests\/built\/\*\.test\.mjs$/, "`test:dist` runs the tests that read dist/");
	assert.equal(matchesAnyFile("apps/website", "tests/built/*.test.mjs"), true, "test:dist selects no file");
	const ignored = spawnSync("git", ["check-ignore", "-q", "apps/website/tests/built/site.test.mjs"], { cwd: REPOSITORY_ROOT });
	assert.equal(ignored.status, 1, "the built-site tests must not sit in a directory that .gitignore drops, such as dist/");
	assert.match(
		JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts["test:brand"],
		/pnpm --filter @sairn\/website test(?!:)/,
		"the brand step runs the website source tests",
	);
});

// Astro 7 requires Node >=22.23.4 (apps/website/package.json engines), above the repository's >=22.15.0, so the two
// website workflows pin their own exact 22.x; the terminal workflows keep theirs (ADR 0016, 2026-10-26 note).
const WEBSITE_NODE_VERSION = "22.23.4";

test("runs the website workflows on an exact Node version that satisfies the website's engines", () => {
	const engines = JSON.parse(readFileSync(new URL("../apps/website/package.json", import.meta.url), "utf8")).engines.node;
	const minimum = /^>=(\d+)\.(\d+)\.(\d+)$/.exec(engines);
	assert.ok(minimum, `apps/website engines.node is ${engines}, expected a >=x.y.z minimum`);
	const pinned = WEBSITE_NODE_VERSION.split(".").map(Number);
	const required = minimum.slice(1).map(Number);
	const compare = pinned.map((part, index) => part - required[index]).find((difference) => difference !== 0) ?? 0;
	assert.equal(compare >= 0, true, `Node ${WEBSITE_NODE_VERSION} does not satisfy ${engines}`);
	assert.equal(pinned[0], required[0], "stay on the same Node major as the website's minimum");
	for (const name of ["website-build.yml", "website-markets-check.yml"]) {
		const versions = [...readWorkflow(name).matchAll(/node-version: (\S+)/g)].map((match) => match[1]);
		assert.deepEqual(versions, [WEBSITE_NODE_VERSION], `${name} must set node-version: ${WEBSITE_NODE_VERSION}`);
	}
});

test("checks the website market snapshot daily, read-only, with the website workflow's pinned setup", () => {
	const markets = readWorkflow("website-markets-check.yml");
	const website = readWorkflow("website-build.yml");
	// The website workflow checks out twice, once in its promotion coverage job; the rule is the same pinned commits.
	const actions = (workflow) => [...new Set([...workflow.matchAll(/^\s*- uses: (\S+)/gm)].map((match) => match[1]))].sort();

	assert.match(markets, /^on:\n  schedule:\n    - cron: "[0-9]+ [0-9]+ \* \* \*"\n  workflow_dispatch:\n\n/m, "runs once a day and on demand");
	assert.equal(/^\s+(pull_request|push):/m.test(markets), false, "the check reads live exchange data, so it never gates a pull request");
	assert.match(markets, /^permissions:\n  contents: read\n\n/m);
	assert.equal(/:\s*write\b/.test(markets), false, "the check never needs write access");
	assert.equal(Number(/timeout-minutes: (\d+)/.exec(markets)?.[1]) <= 10, true, "keep the check short");
	assert.deepEqual(actions(markets), actions(website), "use the same pinned action commits as the website workflow");
	for (const uses of actions(markets)) assert.match(uses, /@[0-9a-f]{40}$/, `${uses} is not pinned to a commit`);
	assert.equal(markets.includes(`node-version: ${WEBSITE_NODE_VERSION}`), true);
	assert.equal(markets.includes(CONCURRENCY_GROUP), true);

	const steps = workflowListItems(markets).filter((item) => item.lines.some((line) => /^\s*run:/.test(line)));
	assert.deepEqual(
		steps.flatMap((step) => stepCommands(step).commands),
		["pnpm install --frozen-lockfile", "pnpm --filter @sairn/website markets:snapshot --check"],
		"the check compares the committed snapshot and never rewrites it",
	);
	const websiteScripts = JSON.parse(readFileSync(new URL("../apps/website/package.json", import.meta.url), "utf8")).scripts;
	assert.match(websiteScripts["markets:snapshot"], /scripts\/markets-snapshot\.mjs$/);
});
