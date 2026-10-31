#!/usr/bin/env node
// Decides whether a dev -> main promotion may skip the jobs of one workflow that dev already ran (ADR 0016 D8).
// It may when the promotion leaves exactly dev's tree on main, and the last pull request merged into dev that
// changed the workflow's inputs passed the workflow on a merge with a dev commit that no other change to those
// inputs followed. A merge changed the inputs when its diff on dev matches the workflow's own `paths` filter, or
// when the workflow ran for it; a missing run is never taken as proof that nothing changed. Missing data, any
// doubt and any error answer "not covered", and the workflow then runs in full as it did before.
//
// In a promotion's coverage job: node scripts/promotion-coverage.mjs <workflow file>
// From a local checkout:         node scripts/promotion-coverage.mjs <workflow file> --base origin/main --head origin/dev
// Both read GITHUB_REPOSITORY and GITHUB_TOKEN; the local form needs a token that may read Actions.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GITHUB_COMMITTER = "noreply@github.com";
const PULL_REQUEST_MERGE_SUBJECT = /^Merge pull request #(\d+) from \S+$/;
// actions/checkout prints the commit it checked out on a line of its own, and GitHub names a pull request's merge
// commit after the head and the base commit it joined: "<time> HEAD is now at 868a6c1 Merge <head> into <base>".
const TESTED_MERGE = /^\S+ HEAD is now at [0-9a-f]+ Merge ([0-9a-f]{40}) into ([0-9a-f]{40})\r?$/gm;
const FIELD = "\u001f";
const RECORD = "\u001e";
const HISTORY_FORMAT = "%H%x1f%P%x1f%T%x1f%ce%x1f%s%x1e";
const USAGE = "usage: promotion-coverage.mjs <workflow file> [--base <revision> --head <revision>]";

function short(sha) {
	return sha.slice(0, 8);
}

/** Parses `git log --format=HISTORY_FORMAT` output into commits, in the order git printed them. */
export function parseHistory(output) {
	return output
		.split(RECORD)
		.map((record) => record.trim())
		.filter(Boolean)
		.map((record) => {
			const [sha, parents, tree, committerEmail, subject] = record.split(FIELD);
			return { sha, parents: parents ? parents.split(" ") : [], tree, committerEmail, subject };
		});
}

/** A commit that GitHub made when it merged a pull request, the only way dev is meant to change. */
export function isPullRequestMerge(commit) {
	return (
		commit.parents.length === 2 &&
		commit.committerEmail === GITHUB_COMMITTER &&
		PULL_REQUEST_MERGE_SUBJECT.test(commit.subject)
	);
}

function pullRequestOf(commit) {
	return `#${PULL_REQUEST_MERGE_SUBJECT.exec(commit.subject)[1]}`;
}

/** The pull request head and the base commit a job's checkout merged, or null unless its log names exactly one. */
export function parseTestedMerge(log) {
	const merges = new Set([...log.matchAll(TESTED_MERGE)].map((match) => `${match[1]} ${match[2]}`));
	if (merges.size !== 1) return null;
	const [head, base] = [...merges][0].split(" ");
	return { head, base };
}

/**
 * The `paths` patterns of a workflow's pull_request trigger, or null when it has none and so runs for every change.
 * Only the plain form these workflows use is read; any other filter or layout throws.
 */
export function parsePathFilter(source) {
	const lines = source.split("\n");
	const start = lines.indexOf("  pull_request:");
	if (start < 0) throw new Error("the workflow has no pull_request trigger in the form this script reads");
	let patterns = null;
	for (const line of lines.slice(start + 1)) {
		if (line.trim() === "" || /^ *#/.test(line)) continue;
		if (!line.startsWith("    ")) break;
		if (line === "    paths:" && patterns === null) {
			patterns = [];
			continue;
		}
		const item = patterns && /^ {6}- "([^"]+)"$/.exec(line);
		if (!item) throw new Error(`unsupported pull_request trigger line: ${line.trim()}`);
		patterns.push(item[1]);
	}
	return patterns;
}

/**
 * Whether changed files would start a workflow under GitHub's path filter rules: `*` stops at `/`, `**` does not,
 * `**` followed by a slash also matches no directory at all, a leading `!` excludes, and the last pattern that
 * matches a file decides. The other special characters are not used here and throw rather than being guessed at.
 */
export function pathFilterMatcher(patterns) {
	if (patterns === null) return (files) => files.length > 0;
	const rules = patterns.map((pattern) => {
		const negated = pattern.startsWith("!");
		const glob = negated ? pattern.slice(1) : pattern;
		if (/[?+[\]]/.test(glob)) throw new Error(`unsupported path pattern ${pattern}`);
		const source = glob
			.split(/(\*\*\/|\*\*|\*)/)
			.map((part) => {
				if (part === "**/") return "(?:.*/)?";
				if (part === "**") return ".*";
				if (part === "*") return "[^/]*";
				return part.replace(/[.^${}()|\\]/g, "\\$&");
			})
			.join("");
		return { negated, expression: new RegExp(`^${source}$`) };
	});
	return (files) =>
		files.some((file) => rules.reduce((included, rule) => (rule.expression.test(file) ? !rule.negated : included), false));
}

/** The newest run of a head; a re-run keeps its run, its merge and its creation time, and reports its last attempt. */
function newestRun(runs) {
	return runs.toSorted((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)[0];
}

function notCovered(reason) {
	return { covered: false, reason };
}

/**
 * @param {object} promotion
 * @param {string} promotion.head the dev commit being promoted
 * @param {string} promotion.mergeTree the tree the promotion would leave on main
 * @param {string} promotion.promoted the newest first-parent commit of dev that main already contains
 * @param {Array} promotion.history dev's first-parent commits from `head` back, newest first
 * @param {string[] | null} promotion.pathFilter the workflow's pull_request `paths` patterns
 * @param {(merge: object) => string[] | Promise<string[]>} promotion.changedFiles the files a merge changed on dev
 * @param {(sha: string) => Promise<Array>} promotion.runsFor this workflow's pull request runs for a head commit
 * @param {(run: object) => Promise<{head: string, base: string} | null>} promotion.testedMergeOf the merge a run checked out
 */
export async function decideCoverage({
	head,
	mergeTree,
	promoted,
	history,
	pathFilter,
	changedFiles,
	runsFor,
	testedMergeOf,
}) {
	if (history[0]?.sha !== head) return notCovered(`dev's history does not start at ${short(head)}`);
	if (history[0].tree !== mergeTree) {
		return notCovered(`main has changes that dev lacks: the promotion leaves ${short(mergeTree)}, not dev's tree`);
	}
	const unpromoted = history.findIndex((commit) => commit.sha === promoted);
	if (unpromoted <= 0) return notCovered(`${short(promoted)}, the last promoted commit, is not an earlier commit of dev`);

	const matchesInputs = pathFilterMatcher(pathFilter);
	const runsByHead = new Map();
	async function runsOf(merge) {
		if (!runsByHead.has(merge.parents[1])) runsByHead.set(merge.parents[1], await runsFor(merge.parents[1]));
		return runsByHead.get(merge.parents[1]);
	}
	async function changedInputs(merge) {
		return matchesInputs(await changedFiles(merge)) || (await runsOf(merge)).length > 0;
	}

	for (const [index, merge] of history.slice(0, unpromoted).entries()) {
		if (!isPullRequestMerge(merge)) return notCovered(`${short(merge.sha)} changed dev without a pull request merge`);
		if (!(await changedInputs(merge))) continue;

		const runs = await runsOf(merge);
		if (runs.length === 0) return notCovered(`${pullRequestOf(merge)} changed this workflow's inputs and never ran it`);
		const run = newestRun(runs);
		const label = `${pullRequestOf(merge)}'s run ${run.id}`;
		if (run.status !== "completed" || run.conclusion !== "success") {
			return notCovered(`${label} is ${run.conclusion ?? run.status}`);
		}
		const tested = await testedMergeOf(run);
		if (tested?.head !== merge.parents[1]) return notCovered(`cannot tell which merge ${label} tested`);
		const testedBase = history.findIndex((commit) => commit.sha === tested.base);
		if (testedBase <= index) {
			return notCovered(`${label} tested a merge onto ${short(tested.base)}, which is not an earlier commit of dev`);
		}
		for (const between of history.slice(index + 1, testedBase)) {
			if (!isPullRequestMerge(between)) {
				return notCovered(`${short(between.sha)} changed dev without a pull request merge after ${label} started`);
			}
			if (await changedInputs(between)) {
				return notCovered(`${pullRequestOf(between)} also changed this workflow's inputs and landed after ${label} started`);
			}
		}
		const later = testedBase - 1;
		const since =
			later === 0 ? "dev has not changed since" : `none of the ${later} other merges into dev since then changed its inputs`;
		return { covered: true, reason: `${label} passed on a merge onto ${short(tested.base)}, and ${since}`, run };
	}
	return notCovered("no pull request merged into dev since the last promotion changed this workflow's inputs");
}

/** Never throws: a failed lookup is a reason to run the workflow, not to fail the promotion. */
export async function checkCoverage(load) {
	try {
		return await decideCoverage(await load());
	} catch (error) {
		return { covered: false, reason: `the check failed: ${error.message}`, failed: true };
	}
}

function git(args, cwd) {
	return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

/** Every first-parent commit of `revision`, newest first; reads commits only. */
export function readHistory(revision, cwd) {
	return parseHistory(git(["log", "--first-parent", `--format=${HISTORY_FORMAT}`, revision], cwd));
}

/** The files a merge changed on dev, renames as their old and new paths; reads trees, never file contents. */
export function readChangedFiles(merge, cwd) {
	return git(["diff", "--name-only", "--no-renames", "-z", merge.parents[0], merge.sha], cwd)
		.split("\0")
		.filter(Boolean);
}

/**
 * The newest first-parent commit of dev that main contains. Not `git merge-base`: a branch started from main
 * carries main's promotion merges into dev, and the merge base then becomes one of those, off dev's own line.
 */
export function readPromoted(main, history, cwd) {
	const unpromoted = Number(git(["rev-list", "--first-parent", "--count", history[0].sha, `^${main}`], cwd));
	return history[unpromoted]?.sha ?? "";
}

function readPromotion({ base, head }) {
	if (base) {
		const [main, dev] = [base, head].map((revision) => git(["rev-parse", "--verify", `${revision}^{commit}`]));
		return { main, head: dev, mergeTree: git(["merge-tree", "--write-tree", main, dev]).split("\n")[0] };
	}
	// A pull_request checkout is GitHub's merge commit, whose parents are main's head and dev's head.
	const [main, dev, ...others] = git(["log", "-1", "--format=%P", "HEAD"]).split(" ");
	if (!dev || others.length > 0) throw new Error("HEAD is not a pull request's merge commit");
	return { main, head: dev, mergeTree: git(["log", "-1", "--format=%T", "HEAD"]) };
}

export function githubClient({ api, repository, token, workflow, fetch = globalThis.fetch }) {
	const headers = {
		accept: "application/vnd.github+json",
		authorization: `Bearer ${token}`,
		"x-github-api-version": "2022-11-28",
	};
	// A dropped connection is tried once more; a second failure leaves the workflow to run in full.
	async function send(url, init) {
		try {
			return await fetch(url, init);
		} catch {
			return fetch(url, init);
		}
	}
	async function getJson(path) {
		const response = await send(`${api}/repos/${repository}${path}`, { headers });
		if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`);
		return response.json();
	}
	async function readLog(job) {
		// The API redirects to signed storage, which must not receive the token.
		const path = `/actions/jobs/${job}/logs`;
		const redirect = await send(`${api}/repos/${repository}${path}`, { headers, redirect: "manual" });
		const location = redirect.headers.get("location");
		if (!location) throw new Error(`GET ${path} answered ${redirect.status}`);
		const log = await send(location);
		if (!log.ok) throw new Error(`the log of job ${job} answered ${log.status}`);
		return log.text();
	}
	return {
		async runsFor(sha) {
			const page = await getJson(`/actions/workflows/${workflow}/runs?event=pull_request&head_sha=${sha}&per_page=100`);
			if (page.total_count > page.workflow_runs.length) throw new Error(`${short(sha)} has more runs than one page`);
			return page.workflow_runs;
		},
		async testedMergeOf(run) {
			const { jobs } = await getJson(`/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
			const job = jobs.find((candidate) => candidate.conclusion === "success");
			if (!job) return null;
			// One read in a local replay of 44 came back without the checkout line; a second read is cheaper
			// than running a workflow in full for nothing.
			return parseTestedMerge(await readLog(job.id)) ?? parseTestedMerge(await readLog(job.id));
		},
	};
}

function parseArguments(argv) {
	const [workflow, ...flags] = argv;
	if (!/^[\w-]+\.ya?ml$/.test(workflow ?? "")) throw new Error(USAGE);
	const options = {};
	for (let index = 0; index < flags.length; index += 2) {
		const [flag, value] = flags.slice(index, index + 2);
		if (!["--base", "--head"].includes(flag) || !value) throw new Error(USAGE);
		options[flag.slice(2)] = value;
	}
	if (Boolean(options.base) !== Boolean(options.head)) throw new Error(USAGE);
	return { workflow, ...options };
}

function required(env, name) {
	if (!env[name]) throw new Error(`${name} is not set`);
	return env[name];
}

/** Prints the verdict and hands it to the workflow: `covered=true` is the only answer that skips anything. */
export function report(workflow, verdict, env) {
	const outcome = verdict.covered ? "covered: the jobs that dev already ran are skipped" : "not covered: it runs in full";
	const line = `${workflow} ${outcome} (${verdict.reason})`;
	console.log(verdict.failed ? `::warning title=Promotion coverage::${line}` : line);
	if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `covered=${verdict.covered === true}\n`);
	if (env.GITHUB_STEP_SUMMARY) {
		const link = verdict.run?.html_url ? `\n\n[The run that covers it](${verdict.run.html_url})` : "";
		appendFileSync(env.GITHUB_STEP_SUMMARY, `### Promotion coverage of ${workflow}\n\n${line}${link}\n`);
	}
}

async function main(argv, env) {
	const { workflow, base, head } = parseArguments(argv);
	const verdict = await checkCoverage(async () => {
		const promotion = readPromotion({ base, head });
		if (!base && env.GITHUB_EVENT_PATH) {
			const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
			if (event.pull_request?.head?.sha !== promotion.head) throw new Error("HEAD does not merge the pull request's head");
		}
		const client = githubClient({
			api: env.GITHUB_API_URL || "https://api.github.com",
			repository: required(env, "GITHUB_REPOSITORY"),
			token: required(env, "GITHUB_TOKEN"),
			workflow,
		});
		const history = readHistory(promotion.head);
		return {
			...promotion,
			promoted: readPromoted(promotion.main, history),
			history,
			pathFilter: parsePathFilter(git(["show", `${promotion.head}:.github/workflows/${workflow}`])),
			changedFiles: (merge) => readChangedFiles(merge),
			...client,
		};
	});
	report(workflow, verdict, env);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await main(process.argv.slice(2), process.env);
}
