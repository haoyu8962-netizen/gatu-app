import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { captureWorklog, publicEvent, redact } from "./capture-worklog.mjs";
import { loadMemory, parseRecord, renderIndex, updateIndex, verifyCommits } from "./work-memory.mjs";

function record(overrides = {}) {
	return {
		schemaVersion: 1,
		id: "2026-09-12-example",
		date: "2026-09-12",
		title: "示例",
		kind: "retrospective",
		status: "recorded",
		topics: ["example"],
		summary: "需要保留的结论",
		thread: null,
		baseCommit: "12345678",
		commits: [],
		sources: [{ path: "docs/current.md" }],
		supersedes: [],
		...overrides,
	};
}

function document(metadata) {
	return `<!-- work-memory\n${JSON.stringify(metadata)}\n-->\n# 示例\n\n## 背景与范围\n\n## 结论与依据\n\n## 验证与限制\n\n## 后续与替代关系\n`;
}

async function fixture(t) {
	const repo = await mkdtemp(resolve(tmpdir(), "work-memory-test-"));
	t.after(() => rm(repo, { recursive: true, force: true }));
	await mkdir(resolve(repo, "docs/work-memory/sessions"), { recursive: true });
	await writeFile(resolve(repo, "docs/current.md"), "Current specification\n");
	await writeFile(
		resolve(repo, "docs/work-memory/topics.json"),
		JSON.stringify([{ id: "example", title: "议题", documents: ["docs/current.md"] }]),
	);
	execFileSync("git", ["init", "--quiet", repo]);
	execFileSync("git", ["add", "docs/current.md"], { cwd: repo });
	execFileSync(
		"git",
		[
			"-c",
			"user.name=Memory Test",
			"-c",
			"user.email=memory@example.invalid",
			"-c",
			"commit.gpgsign=false",
			"-c",
			"core.hooksPath=/dev/null",
			"commit",
			"--quiet",
			"-m",
			"test(memory): fixture",
		],
		{ cwd: repo },
	);
	const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
	const metadata = record({ baseCommit });
	const save = async (data) => writeFile(resolve(repo, "docs/work-memory/sessions", `${data.id}.md`), document(data));
	await save(metadata);
	return { repo, metadata, save };
}

test("metadata requires real dates, matching file identity and verification sections", () => {
	const data = record();
	assert.equal(parseRecord(document(data), `${data.id}.md`).id, data.id);
	assert.throws(() => parseRecord(document({ ...data, date: "2026-02-30" }), `${data.id}.md`), /invalid date/);
	assert.throws(() => parseRecord(document(data), "different.md"), /match filename/);
	assert.throws(() => parseRecord(document(data).replace("## 验证与限制", ""), `${data.id}.md`), /missing/);
	assert.throws(() => parseRecord(document({ ...data, status: "success" }), `${data.id}.md`), /invalid status/);
	assert.throws(() => parseRecord(document({ ...data, sources: [] }), `${data.id}.md`), /evidence/);
});

test("index is deterministic and sorted, and the check never reads the local index", async (t) => {
	const { repo, metadata, save } = await fixture(t);
	const index = resolve(repo, "docs/work-memory/INDEX.md");
	await save({ ...metadata, id: "2026-09-11-previous", date: "2026-09-11" });
	await updateIndex(repo, true);
	await updateIndex(repo);
	const model = await loadMemory(repo);
	assert.equal(await readFile(index, "utf8"), renderIndex(model));
	assert.equal(renderIndex(model), renderIndex({ ...model, records: [...model.records].reverse() }));
	await save({ ...metadata, summary: "修正后的结论" });
	await updateIndex(repo, true);
	await updateIndex(repo);
	assert.match(await readFile(index, "utf8"), /修正后的结论/);
});

test("the check fails while the index is tracked by Git", async (t) => {
	const { repo } = await fixture(t);
	await updateIndex(repo);
	execFileSync("git", ["add", "docs/work-memory/INDEX.md"], { cwd: repo });
	await assert.rejects(updateIndex(repo, true), /INDEX\.md must not be tracked/);
	execFileSync("git", ["rm", "--cached", "--quiet", "docs/work-memory/INDEX.md"], { cwd: repo });
	await updateIndex(repo, true);
});

test("unknown topics, missing files and nonexistent commits fail validation", async (t) => {
	const { repo, metadata, save } = await fixture(t);
	await save({ ...metadata, topics: ["unknown"] });
	await assert.rejects(loadMemory(repo), /unknown topic/);
	await save({ ...metadata, sources: [{ path: "docs/missing.md" }] });
	await assert.rejects(loadMemory(repo), /ENOENT/);
	await save({ ...metadata, baseCommit: "deadbeef" });
	await assert.rejects(loadMemory(repo), new RegExp(`${metadata.id}: unknown commit deadbeef`));
	const tree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repo, encoding: "utf8" }).trim();
	const blob = execFileSync("git", ["rev-parse", "HEAD:docs/current.md"], { cwd: repo, encoding: "utf8" }).trim();
	for (const object of [tree, blob]) {
		await save({ ...metadata, commits: [object] });
		await assert.rejects(loadMemory(repo), new RegExp(`${metadata.id}: unknown commit ${object}`));
	}
	await save(metadata);
	await loadMemory(repo);
});

test("an annotated tag peels to its commit, and a failure names the record that cites the reference", async (t) => {
	const { repo, metadata, save } = await fixture(t);
	execFileSync(
		"git",
		[
			"-c",
			"user.name=Memory Test",
			"-c",
			"user.email=memory@example.invalid",
			"-c",
			"tag.gpgSign=false",
			"tag",
			"-a",
			"fixture-tag",
			"-m",
			"fixture tag",
		],
		{ cwd: repo },
	);
	const tag = execFileSync("git", ["rev-parse", "fixture-tag"], { cwd: repo, encoding: "utf8" }).trim();
	await save({ ...metadata, commits: [tag] });
	await loadMemory(repo);
	await save({ ...metadata, id: "2026-09-13-other", date: "2026-09-13", commits: ["deadbeef"] });
	await assert.rejects(loadMemory(repo), /2026-09-13-other: unknown commit deadbeef/);
});

test("commit verification reads more output than the default 1 MiB buffer", async (t) => {
	const { repo } = await fixture(t);
	const owners = new Map();
	for (let index = 0; index < 25_000; index += 1) owners.set(index.toString(16).padStart(40, "f"), "2026-09-12-bulk");
	assert.throws(() => verifyCommits(repo, owners), new RegExp(`2026-09-12-bulk: unknown commit ${"f".repeat(39)}0`));
});

test("duplicate topic IDs, escaping symlinks and non-HTTPS evidence fail", async (t) => {
	const { repo, metadata, save } = await fixture(t);
	await symlink(tmpdir(), resolve(repo, "docs/outside"));
	await save({ ...metadata, sources: [{ path: "docs/outside" }] });
	await assert.rejects(loadMemory(repo), /escapes/);
	await save({ ...metadata, sources: [{ url: "javascript:alert(1)" }] });
	await assert.rejects(loadMemory(repo), /invalid source/);
	await save(metadata);
	const topic = { id: "example", title: "议题", documents: ["docs/current.md"] };
	await writeFile(resolve(repo, "docs/work-memory/topics.json"), JSON.stringify([topic, topic]));
	await assert.rejects(loadMemory(repo), /duplicate topic/);
});

test("replacement references must exist and cannot form a cycle", async (t) => {
	const { repo, metadata, save } = await fixture(t);
	await save({ ...metadata, status: "superseded" });
	await assert.rejects(loadMemory(repo), /missing replacement/);
	const next = { ...metadata, id: "2026-09-12-next", supersedes: [metadata.id] };
	await save(next);
	await loadMemory(repo);
	await save({ ...metadata, supersedes: [next.id] });
	await assert.rejects(loadMemory(repo), /cycle/);
	await save({ ...metadata, supersedes: ["missing"] });
	await assert.rejects(loadMemory(repo), /invalid supersedes/);
});

test("public archive excludes reasoning, unknown assistant phases, credentials and tool payloads", () => {
	const row = (payload) => ({ type: "response_item", timestamp: "2026-09-12T09:00:00Z", payload });
	assert.equal(publicEvent(row({ type: "reasoning", text: "PRIVATE" }), 1), null);
	assert.equal(
		publicEvent(row({ type: "message", role: "assistant", content: [{ type: "output_text", text: "PRIVATE" }] }), 2),
		null,
	);
	assert.equal(
		publicEvent(row({ type: "message", role: "developer", content: [{ type: "input_text", text: "PRIVATE" }] }), 3),
		null,
	);
	assert.equal(publicEvent(row({ type: "function_call_output", output: "PRIVATE" }), 4), null);
	assert.equal(publicEvent(row({ type: "function_call", arguments: "PRIVATE" }), 4), null);
	const invocation = publicEvent(row({ type: "function_call", name: "exec_command", arguments: "PRIVATE" }), 5);
	assert.equal(invocation.name, "exec_command");
	assert.ok(!JSON.stringify(invocation).includes("PRIVATE"));
	const visible = publicEvent(
		row({
			type: "message",
			role: "assistant",
			phase: "final_answer",
			content: [{ type: "output_text", text: "测试通过" }],
		}),
		6,
	);
	assert.equal(visible.text, "测试通过");
	assert.equal(visible.sourceLine, 6);
	const scrubbed = redact(
		`api_key=PRIVATE\nuser@example.invalid\n0x${"a".repeat(64)}\nBearer PRIVATE\n/Users/example/project`,
	);
	assert.ok(!scrubbed.includes("PRIVATE") && !scrubbed.includes("user@example.invalid") && !scrubbed.includes("0x"));
	assert.equal(redact('<in-app-browser-context source="ui">PRIVATE</in-app-browser-context>'), "[REDACTED_CONTEXT]");
});

async function sourceFile(repo, payloads, metadata = {}) {
	const path = resolve(repo, "source.jsonl");
	const rows = [{ type: "session_meta", payload: { id: "test-thread", cwd: repo, ...metadata } }, ...payloads];
	await writeFile(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
	return path;
}

test("snapshot records original event order, manifest and independent immutable copies", async (t) => {
	const { repo } = await fixture(t);
	const source = await sourceFile(repo, [
		{
			type: "response_item",
			timestamp: "2026-09-12T08:00:00Z",
			payload: { type: "message", role: "user", content: [{ type: "input_text", text: "开始" }] },
		},
		{ type: "response_item", payload: { type: "reasoning", text: "PRIVATE" } },
		{
			type: "response_item",
			timestamp: "2026-09-12T08:01:00Z",
			payload: {
				type: "message",
				role: "assistant",
				phase: "commentary",
				content: [{ type: "output_text", text: "正在核查" }],
			},
		},
	]);
	const first = await captureWorklog({ repoRoot: repo, source, threadId: "test-thread" });
	const second = await captureWorklog({ repoRoot: repo, source, threadId: "test-thread" });
	assert.notEqual(first.directory, second.directory);
	const exported = await readFile(resolve(first.directory, "events.jsonl"), "utf8");
	assert.ok(!exported.includes("PRIVATE"));
	assert.deepEqual(
		exported
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line).sourceLine),
		[2, 4],
	);
	const manifest = JSON.parse(await readFile(resolve(first.directory, "manifest.json"), "utf8"));
	assert.equal(manifest.exportedEvents, 2);
	assert.equal(manifest.excluded["response_item/reasoning"], 1);
	assert.match(manifest.eventsSha256, /^[a-f0-9]{64}$/);
	assert.equal(manifest.firstTimestamp, "2026-09-12T08:00:00Z");
});

test("wrong project, wrong thread and corrupt sources cannot be archived", async (t) => {
	const { repo } = await fixture(t);
	const source = await sourceFile(repo, [], { cwd: tmpdir() });
	await assert.rejects(captureWorklog({ repoRoot: repo, source, threadId: "test-thread" }), /does not match/);
	await sourceFile(repo, []);
	await assert.rejects(
		captureWorklog({ repoRoot: repo, source, threadId: "test-thread" }),
		/No recognized public events/,
	);
	await assert.rejects(captureWorklog({ repoRoot: repo, source, threadId: "different" }), /does not match/);
	await assert.rejects(captureWorklog({ repoRoot: repo, source, threadId: "../escape" }), /Invalid thread/);
	await writeFile(source, `${JSON.stringify({ type: "session_meta", payload: { id: "test-thread", cwd: repo } })}\n{`);
	await assert.rejects(captureWorklog({ repoRoot: repo, source, threadId: "test-thread" }), /incomplete JSON/);
});
