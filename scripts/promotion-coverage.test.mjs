import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	checkCoverage,
	decideCoverage,
	githubClient,
	isPullRequestMerge,
	parseHistory,
	parseTestedMerge,
	readHistory,
	readPromoted,
	report,
} from "./promotion-coverage.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));

function sha(name) {
	return createHash("sha1").update(name).digest("hex");
}

function headOf(name) {
	return sha(`${name} head`);
}

/**
 * dev's first-parent history, newest first, from entries listed oldest first: `#N name` is GitHub's merge of
 * pull request N from branch `name`, and a bare `name` is a commit pushed to dev directly.
 */
function devHistory(...entries) {
	let parent = sha("root");
	const commits = entries.map((entry) => {
		const [, number, name] = /^(?:#(\d+) )?(.+)$/.exec(entry);
		const commit = number
			? {
					sha: sha(name),
					parents: [parent, headOf(name)],
					tree: sha(`${name} tree`),
					committerEmail: "noreply@github.com",
					subject: `Merge pull request #${number} from zora4523-bot/${name}`,
				}
			: { sha: sha(name), parents: [parent], tree: sha(`${name} tree`), committerEmail: "dev@example.com", subject: name };
		parent = commit.sha;
		return commit;
	});
	return commits.reverse();
}

function run(id, overrides = {}) {
	return { id, status: "completed", conclusion: "success", created_at: "2026-10-31T09:37:20Z", ...overrides };
}

/** A promotion of `history` past the commit named `promoted`, with fake runs keyed by the merged pull request's name. */
function promotion(history, { runs = {}, tested = {}, mergeTree = history[0].tree, promoted = "promoted" } = {}) {
	const asked = [];
	return {
		asked,
		input: {
			head: history[0].sha,
			mergeTree,
			promoted: sha(promoted),
			history,
			async runsFor(head) {
				const name = Object.keys(runs).find((candidate) => headOf(candidate) === head);
				asked.push(name);
				return name ? runs[name] : [];
			},
			async testedMergeOf(candidate) {
				return tested[candidate.id] ?? null;
			},
		},
	};
}

function merged(name, onto) {
	return { head: headOf(name), base: sha(onto) };
}

test("covers a workflow whose last run tested the merge exactly as it landed", async () => {
	const history = devHistory("#1 promoted", "#2 feature", "#3 record");
	const { input, asked } = promotion(history, { runs: { feature: [run(10)] }, tested: { 10: merged("feature", "promoted") } });

	const verdict = await decideCoverage(input);

	assert.equal(verdict.covered, true, verdict.reason);
	assert.match(verdict.reason, /^#2's run 10 passed on a merge onto [0-9a-f]{8}, and none of the 1 other merges/);
	assert.deepEqual(asked, [undefined, "feature"], "the newer documentation merge is checked for runs first");
});

test("covers a run whose base later gained only merges that never ran the workflow", async () => {
	const history = devHistory("#1 promoted", "#2 notes", "#3 feature");
	const { input } = promotion(history, { runs: { feature: [run(10)] }, tested: { 10: merged("feature", "promoted") } });

	const verdict = await decideCoverage(input);

	assert.equal(verdict.covered, true, verdict.reason);
});

test("runs in full when another merge that ran the workflow landed after the run started", async () => {
	const history = devHistory("#1 promoted", "#2 first", "#3 second");
	const { input } = promotion(history, {
		runs: { first: [run(20)], second: [run(30)] },
		tested: { 20: merged("first", "promoted"), 30: merged("second", "promoted") },
	});

	const verdict = await decideCoverage(input);

	assert.equal(verdict.covered, false);
	assert.match(verdict.reason, /^#2 also ran this workflow and landed after #3's run 30 started$/);
});

test("looks past the last promotion for merges that landed after the run started", async () => {
	const history = devHistory("#1 base", "#2 promoted", "#3 feature");
	const tested = { 10: merged("feature", "base") };

	const untouched = await decideCoverage(promotion(history, { runs: { feature: [run(10)] }, tested }).input);
	assert.equal(untouched.covered, true, untouched.reason);

	const touched = promotion(history, { runs: { feature: [run(10)], promoted: [run(5)] }, tested });
	const verdict = await decideCoverage(touched.input);
	assert.equal(verdict.covered, false);
	assert.match(verdict.reason, /^#2 also ran this workflow/);
});

test("runs in full when main has changes that dev lacks", async () => {
	const history = devHistory("#1 promoted", "#2 feature");
	const { input } = promotion(history, {
		runs: { feature: [run(10)] },
		tested: { 10: merged("feature", "promoted") },
		mergeTree: sha("main hotfix tree"),
	});

	const verdict = await decideCoverage(input);

	assert.equal(verdict.covered, false);
	assert.match(verdict.reason, /^main has changes that dev lacks/);
});

test("runs in full when dev changed without a pull request merge", async () => {
	const tested = { 10: merged("feature", "promoted") };
	const pushedLast = devHistory("#1 promoted", "#2 feature", "hotfix");
	const pushedBetween = devHistory("#1 promoted", "hotfix", "#3 feature");

	const last = await decideCoverage(promotion(pushedLast, { runs: { feature: [run(10)] }, tested }).input);
	const between = await decideCoverage(promotion(pushedBetween, { runs: { feature: [run(10)] }, tested }).input);

	assert.equal(last.covered, false);
	assert.match(last.reason, /changed dev without a pull request merge$/);
	assert.equal(between.covered, false);
	assert.match(between.reason, /changed dev without a pull request merge after #3's run 10 started$/);
});

test("runs in full when the last run did not pass or has not finished", async () => {
	const history = devHistory("#1 promoted", "#2 feature");
	const tested = { 10: merged("feature", "promoted") };

	for (const [overrides, state] of [
		[{ conclusion: "failure" }, "failure"],
		[{ conclusion: "cancelled" }, "cancelled"],
		[{ status: "in_progress", conclusion: null }, "in_progress"],
	]) {
		const verdict = await decideCoverage(promotion(history, { runs: { feature: [run(10, overrides)] }, tested }).input);
		assert.equal(verdict.covered, false);
		assert.equal(verdict.reason, `#2's run 10 is ${state}`);
	}
});

test("judges a head by its newest run", async () => {
	const history = devHistory("#1 promoted", "#2 feature");
	const older = run(10, { conclusion: "failure", created_at: "2026-10-30T09:00:00Z" });
	const newer = run(11, { created_at: "2026-10-31T09:00:00Z" });
	const tested = { 10: merged("feature", "promoted"), 11: merged("feature", "promoted") };

	const passedLast = await decideCoverage(promotion(history, { runs: { feature: [newer, older] }, tested }).input);
	const failedLast = await decideCoverage(
		promotion(history, {
			runs: { feature: [run(10, { created_at: "2026-10-30T09:00:00Z" }), run(11, { conclusion: "failure" })] },
			tested,
		}).input,
	);

	assert.equal(passedLast.covered, true, passedLast.reason);
	assert.match(passedLast.reason, /run 11/);
	assert.equal(failedLast.covered, false);
});

test("runs in full when the tested merge cannot be read or joined another head", async () => {
	const history = devHistory("#1 promoted", "#2 feature");

	for (const tested of [{}, { 10: { head: sha("an earlier push"), base: sha("promoted") } }]) {
		const verdict = await decideCoverage(promotion(history, { runs: { feature: [run(10)] }, tested }).input);
		assert.equal(verdict.covered, false);
		assert.equal(verdict.reason, "cannot tell which merge #2's run 10 tested");
	}
});

test("runs in full when the run tested a merge onto a commit that is not on dev", async () => {
	const history = devHistory("#1 promoted", "#2 feature");
	const tested = { 10: { head: headOf("feature"), base: sha("main") } };

	const verdict = await decideCoverage(promotion(history, { runs: { feature: [run(10)] }, tested }).input);

	assert.equal(verdict.covered, false);
	assert.match(verdict.reason, /which is not an earlier commit of dev$/);
});

test("runs in full when no pull request since the last promotion ran the workflow", async () => {
	const history = devHistory("#1 old", "#2 promoted", "#3 notes");

	const verdict = await decideCoverage(
		promotion(history, { runs: { old: [run(10)] }, tested: { 10: merged("old", "root") } }).input,
	);

	assert.equal(verdict.covered, false);
	assert.equal(verdict.reason, "no pull request merged into dev since the last promotion ran this workflow");
});

test("runs in full when the last promoted commit is not on dev's first-parent history", async () => {
	const history = devHistory("#1 promoted", "#2 feature");
	const { input } = promotion(history, {
		runs: { feature: [run(10)] },
		tested: { 10: merged("feature", "promoted") },
		promoted: "main hotfix",
	});

	const verdict = await decideCoverage(input);

	assert.equal(verdict.covered, false);
	assert.match(verdict.reason, /the last promoted commit, is not an earlier commit of dev$/);
});

test("runs in full when the history does not start at the promoted head", async () => {
	const history = devHistory("#1 promoted", "#2 feature");
	const { input } = promotion(history, { runs: { feature: [run(10)] }, tested: { 10: merged("feature", "promoted") } });

	const verdict = await decideCoverage({ ...input, head: sha("somewhere else") });

	assert.equal(verdict.covered, false);
	assert.match(verdict.reason, /^dev's history does not start at/);
});

test("answers not covered, without throwing, when a lookup fails", async () => {
	const history = devHistory("#1 promoted", "#2 feature");
	const { input } = promotion(history);

	const failedRuns = await checkCoverage(async () => ({
		...input,
		runsFor: async () => {
			throw new Error("GET /actions/workflows/terminal-tests.yml/runs answered 502");
		},
	}));
	const failedLoad = await checkCoverage(async () => {
		throw new Error("HEAD is not a pull request's merge commit");
	});

	assert.deepEqual(failedRuns, {
		covered: false,
		reason: "the check failed: GET /actions/workflows/terminal-tests.yml/runs answered 502",
		failed: true,
	});
	assert.equal(failedLoad.covered, false);
	assert.equal(failedLoad.failed, true);
});

/** A fake GitHub API: routes keyed by URL answer with a Response or throw an Error, or take a list of those in turn. */
function fakeGithub(routes) {
	const requests = [];
	async function fetch(url, init = {}) {
		requests.push({ url, redirect: init.redirect ?? "follow", authorization: init.headers?.authorization ?? null });
		const route = routes[url];
		if (!route) throw new Error(`unexpected request to ${url}`);
		const answer = Array.isArray(route) ? route.shift() : route;
		if (answer instanceof Error) throw answer;
		return answer;
	}
	const client = githubClient({ api: "https://api.test", repository: "o/r", token: "secret", workflow: "w.yml", fetch });
	return { client, requests };
}

test("lists one workflow's pull request runs for a head and refuses a list longer than one page", async () => {
	const head = headOf("feature");
	const url = `https://api.test/repos/o/r/actions/workflows/w.yml/runs?event=pull_request&head_sha=${head}&per_page=100`;
	const { client, requests } = fakeGithub({
		[url]: [
			Response.json({ total_count: 1, workflow_runs: [run(10)] }),
			Response.json({ total_count: 101, workflow_runs: [run(10)] }),
		],
	});

	assert.deepEqual(await client.runsFor(head), [run(10)]);
	assert.equal(requests[0].authorization, "Bearer secret");
	await assert.rejects(client.runsFor(head), /has more runs than one page/);
});

test("reads a run's tested merge from the log the API redirects to, without sending the token there", async () => {
	const jobs = "https://api.test/repos/o/r/actions/runs/7/jobs?filter=latest&per_page=100";
	const logs = "https://api.test/repos/o/r/actions/jobs/2/logs";
	const line = `HEAD is now at 868a6c1 Merge ${headOf("feature")} into ${sha("promoted")}`;
	const redirect = () => new Response(null, { status: 302, headers: { location: "https://storage.test/log" } });
	const { client, requests } = fakeGithub({
		[jobs]: Response.json({ jobs: [{ id: 1, conclusion: "skipped" }, { id: 2, conclusion: "success" }] }),
		[logs]: [redirect(), redirect()],
		"https://storage.test/log": [new Response("a log cut short"), new Response(`setup\n${line}\nmore`)],
	});

	assert.deepEqual(await client.testedMergeOf({ id: 7 }), merged("feature", "promoted"));
	assert.deepEqual(
		requests.map(({ url, redirect, authorization }) => [url, redirect, authorization !== null]),
		[
			[jobs, "follow", true],
			[logs, "manual", true],
			["https://storage.test/log", "follow", false],
			[logs, "manual", true],
			["https://storage.test/log", "follow", false],
		],
		"a log without the checkout line is read once more, and storage never receives the token",
	);
});

test("tries a dropped connection once more, and fails when it drops again", async () => {
	const head = headOf("feature");
	const url = `https://api.test/repos/o/r/actions/workflows/w.yml/runs?event=pull_request&head_sha=${head}&per_page=100`;
	const dropped = () => new TypeError("fetch failed");
	const { client, requests } = fakeGithub({
		[url]: [dropped(), Response.json({ total_count: 1, workflow_runs: [run(10)] }), dropped(), dropped()],
	});

	assert.deepEqual(await client.runsFor(head), [run(10)]);
	await assert.rejects(client.runsFor(head), /fetch failed/);
	assert.equal(requests.length, 4);
});

test("knows no tested merge for a run without a successful job, and fails on a missing log", async () => {
	const jobs = "https://api.test/repos/o/r/actions/runs/7/jobs?filter=latest&per_page=100";
	const logs = "https://api.test/repos/o/r/actions/jobs/2/logs";
	const skipped = fakeGithub({ [jobs]: Response.json({ jobs: [{ id: 1, conclusion: "skipped" }] }) });
	const expired = fakeGithub({
		[jobs]: Response.json({ jobs: [{ id: 2, conclusion: "success" }] }),
		[logs]: new Response("gone", { status: 410 }),
	});

	assert.equal(await skipped.client.testedMergeOf({ id: 7 }), null);
	await assert.rejects(expired.client.testedMergeOf({ id: 7 }), /GET \/actions\/jobs\/2\/logs answered 410/);
});

test("hands the workflow covered=true for a covered verdict only, and warns when the check failed", (t) => {
	const directory = mkdtempSync(join(tmpdir(), "promotion-coverage-report-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const env = { GITHUB_OUTPUT: join(directory, "output"), GITHUB_STEP_SUMMARY: join(directory, "summary") };
	const logged = [];
	t.mock.method(console, "log", (line) => logged.push(line));

	report("terminal-tests.yml", { covered: true, reason: "#2's run 10 passed", run: { html_url: "https://github.com/r/1" } }, env);
	report("terminal-tests.yml", { covered: false, reason: "no pull request ran it" }, env);
	report("terminal-tests.yml", { covered: false, reason: "the check failed: 502", failed: true }, env);

	assert.equal(readFileSync(env.GITHUB_OUTPUT, "utf8"), "covered=true\ncovered=false\ncovered=false\n");
	assert.match(readFileSync(env.GITHUB_STEP_SUMMARY, "utf8"), /\[The run that covers it\]\(https:\/\/github\.com\/r\/1\)/);
	assert.deepEqual(logged, [
		"terminal-tests.yml covered: its jobs are skipped (#2's run 10 passed)",
		"terminal-tests.yml not covered: its jobs run in full (no pull request ran it)",
		"::warning title=Promotion coverage::terminal-tests.yml not covered: its jobs run in full (the check failed: 502)",
	]);
});

test("reads the merge a job checked out from its log", () => {
	// The checkout line of PR #129's Static Checks job (run 41189444079), the run the next promotion relies on.
	const line =
		"2026-10-31T09:37:29.0939805Z HEAD is now at 868a6c1 Merge 44d95ef9d58849244e1504147e7e113b958ec8a5 into d99c2bc9e55b73172f05897af24dd4235d631928";

	assert.deepEqual(parseTestedMerge(`2026-10-31T09:37:28Z Checking out the ref\n${line}\n2026-10-31T09:37:29Z done`), {
		head: "44d95ef9d58849244e1504147e7e113b958ec8a5",
		base: "d99c2bc9e55b73172f05897af24dd4235d631928",
	});
	assert.equal(parseTestedMerge("HEAD is now at 868a6c1 docs: a commit that is not a merge"), null);
	assert.equal(parseTestedMerge(""), null);
});

test("accepts only GitHub's pull request merges as changes to dev", () => {
	const [merge] = devHistory("#7 feature");

	assert.equal(isPullRequestMerge(merge), true);
	assert.equal(isPullRequestMerge({ ...merge, parents: merge.parents.slice(0, 1) }), false);
	assert.equal(isPullRequestMerge({ ...merge, committerEmail: "dev@example.com" }), false);
	assert.equal(isPullRequestMerge({ ...merge, subject: "Merge branch 'main' into dev" }), false);
	assert.equal(isPullRequestMerge({ ...merge, subject: "feat(terminal): squashed change (#7)" }), false);
});

test("parses the first-parent history git prints", () => {
	const output = [
		`${sha("b")}\u001f${sha("a")} ${headOf("b")}\u001f${sha("b tree")}\u001fnoreply@github.com\u001fMerge pull request #2 from zora4523-bot/b\u001e`,
		`${sha("a")}\u001f\u001f${sha("a tree")}\u001fdev@example.com\u001finitial commit\u001e`,
	].join("\n");

	assert.deepEqual(parseHistory(output), [
		{
			sha: sha("b"),
			parents: [sha("a"), headOf("b")],
			tree: sha("b tree"),
			committerEmail: "noreply@github.com",
			subject: "Merge pull request #2 from zora4523-bot/b",
		},
		{ sha: sha("a"), parents: [], tree: sha("a tree"), committerEmail: "dev@example.com", subject: "initial commit" },
	]);
});

test("finds the last promoted commit on dev's own line after a branch from main carried a promotion into dev", (t) => {
	const directory = mkdtempSync(join(tmpdir(), "promotion-coverage-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const identity = { GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.com", GIT_CONFIG_GLOBAL: "/dev/null" };
	const env = { ...process.env, ...identity, GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.com" };
	const git = (...args) =>
		execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: directory, env, encoding: "utf8" }).trim();
	const commit = (message) => git("commit", "-q", "--allow-empty", "-m", message);
	const mergeInto = (target, branch, number) => {
		git("switch", "-q", target);
		git("merge", "-q", "--no-ff", "-m", `Merge pull request #${number} from zora4523-bot/${branch}`, branch);
		return git("rev-parse", "HEAD");
	};

	git("init", "-q", "-b", "main");
	commit("start");
	git("switch", "-q", "-c", "dev");
	git("switch", "-q", "-c", "feature");
	commit("feature");
	const promotedDev = mergeInto("dev", "feature", 1);
	const main = mergeInto("main", "dev", 2);
	git("switch", "-q", "-c", "release-record");
	commit("record the release");
	const head = mergeInto("dev", "release-record", 3);

	assert.equal(git("merge-base", main, head), main, "the merge base is main's promotion merge, off dev's own line");
	assert.equal(readPromoted(main, readHistory(head, directory), directory), promotedDev);
});

test("reads this repository's history with the format it parses", () => {
	const git = (...args) => execFileSync("git", args, { cwd: REPOSITORY_ROOT, encoding: "utf8" }).trim();
	const [latest] = readHistory("HEAD");

	assert.equal(latest.sha, git("rev-parse", "HEAD"));
	assert.equal(latest.tree, git("rev-parse", "HEAD^{tree}"));
	assert.deepEqual(latest.parents, git("log", "-1", "--format=%P", "HEAD").split(" ").filter(Boolean));
	assert.equal(latest.committerEmail, git("log", "-1", "--format=%ce", "HEAD"));
});
