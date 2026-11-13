import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = "docs/work-memory/INDEX.md";
const legacyCommitsPath = "docs/work-memory/legacy-commits.txt";
const metadataPattern = /^<!-- work-memory\r?\n([\s\S]*?)\r?\n-->\r?\n/;
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const statusLabels = { recorded: "已整理，验证见正文", verified: "已验证，范围见正文", superseded: "已被后续记录替代" };

function requireValue(condition, message) {
	if (!condition) throw new Error(message);
}

export function parseRecord(text, filename) {
	const match = text.match(metadataPattern);
	requireValue(match, `${filename}: missing work-memory metadata`);
	const record = JSON.parse(match[1]);
	requireValue(record.schemaVersion === 1, `${filename}: unsupported schemaVersion`);
	requireValue(typeof record.id === "string" && idPattern.test(record.id), `${filename}: invalid id`);
	requireValue(filename === `${record.id}.md`, `${filename}: id must match filename`);
	requireValue(/^\d{4}-\d{2}-\d{2}$/.test(record.date), `${filename}: invalid date`);
	requireValue(
		new Date(`${record.date}T00:00:00Z`).toISOString().slice(0, 10) === record.date,
		`${filename}: invalid date`,
	);
	for (const key of ["title", "summary", "baseCommit"]) {
		requireValue(typeof record[key] === "string" && record[key].trim(), `${filename}: missing ${key}`);
	}
	requireValue(["retrospective", "task"].includes(record.kind), `${filename}: invalid kind`);
	requireValue(Object.hasOwn(statusLabels, record.status), `${filename}: invalid status`);
	for (const key of ["topics", "commits", "sources", "supersedes"]) {
		requireValue(Array.isArray(record[key]), `${filename}: missing ${key} array`);
	}
	requireValue(
		record.topics.length && new Set(record.topics).size === record.topics.length,
		`${filename}: invalid topics`,
	);
	requireValue(record.sources.length, `${filename}: evidence sources required`);
	requireValue(
		record.thread === null || (typeof record.thread?.id === "string" && typeof record.thread?.title === "string"),
		`${filename}: invalid thread`,
	);
	for (const commit of [record.baseCommit, ...record.commits]) {
		requireValue(typeof commit === "string" && /^[0-9a-f]{8,40}$/.test(commit), `${filename}: invalid commit`);
	}
	for (const heading of ["## 背景与范围", "## 结论与依据", "## 验证与限制", "## 后续与替代关系"]) {
		requireValue(text.slice(match[0].length).includes(heading), `${filename}: missing ${heading}`);
	}
	return { ...record, file: filename };
}

/**
 * One `git cat-file --batch-check` for every referenced commit. A name that does not resolve or peel to a commit fails,
 * as `git cat-file -e <name>^{commit}` did; an annotated tag of a commit passes. Output grows with the number of names,
 * so the buffer does too. A name that does not resolve still passes when it is a prefix of a commit of the previous
 * repository listed in `legacy-commits.txt`: the 2026-11-13 history rewrite changed every hash (ADR 0054).
 */
function readLegacyCommits(repoRoot) {
	const file = resolve(repoRoot, legacyCommitsPath);
	if (!existsSync(file)) return [];
	return readFileSync(file, "utf8")
		.split("\n")
		.filter((line) => line && !line.startsWith("#"))
		.map((line) => line.split(" ")[0]);
}

export function verifyCommits(repoRoot, commitOwners) {
	const commits = [...commitOwners.keys()];
	if (commits.length === 0) return;
	const lines = execFileSync("git", ["cat-file", "--batch-check"], {
		cwd: repoRoot,
		input: commits.map((commit) => `${commit}^{commit}\n`).join(""),
		encoding: "utf8",
		maxBuffer: 1024 * 1024 + commits.length * 256,
		stdio: ["pipe", "pipe", "pipe"],
	})
		.trimEnd()
		.split("\n");
	requireValue(lines.length === commits.length, "git cat-file --batch-check returned an unexpected number of lines");
	let legacyCommits;
	commits.forEach((commit, index) => {
		if (lines[index].split(" ")[1] === "commit") return;
		legacyCommits ??= readLegacyCommits(repoRoot);
		requireValue(
			legacyCommits.some((legacy) => legacy.startsWith(commit)),
			`${commitOwners.get(commit)}: unknown commit ${commit}`,
		);
	});
}

function isTracked(repoRoot, path) {
	return execFileSync("git", ["ls-files", "--", path], { cwd: repoRoot, encoding: "utf8" }).trim() !== "";
}

async function validatePath(repoRoot, path) {
	requireValue(
		typeof path === "string" && path && !isAbsolute(path) && !path.includes("\\"),
		`Invalid source path: ${path}`,
	);
	const target = await realpath(resolve(repoRoot, path));
	const local = relative(await realpath(repoRoot), target);
	requireValue(local && !local.startsWith("..") && !isAbsolute(local), `Source escapes repository: ${path}`);
}

export async function loadMemory(repoRoot) {
	const memoryRoot = resolve(repoRoot, "docs/work-memory");
	const topics = JSON.parse(await readFile(resolve(memoryRoot, "topics.json"), "utf8"));
	requireValue(Array.isArray(topics), "topics.json must be an array");
	const topicIds = new Set();
	for (const topic of topics) {
		requireValue(
			typeof topic.id === "string" && idPattern.test(topic.id) && !topicIds.has(topic.id),
			`Invalid or duplicate topic: ${topic.id}`,
		);
		requireValue(
			typeof topic.title === "string" && topic.title.trim() && Array.isArray(topic.documents) && topic.documents.length,
			`Invalid topic: ${topic.id}`,
		);
		topicIds.add(topic.id);
		for (const path of topic.documents) await validatePath(repoRoot, path);
	}
	const files = (await readdir(resolve(memoryRoot, "sessions"))).filter((name) => name.endsWith(".md")).sort();
	const records = [];
	for (const file of files)
		records.push(parseRecord(await readFile(resolve(memoryRoot, "sessions", file), "utf8"), file));
	const ids = new Set(records.map((record) => record.id));
	const commitOwners = new Map();
	for (const record of records) {
		for (const topic of record.topics) requireValue(topicIds.has(topic), `${record.id}: unknown topic ${topic}`);
		for (const source of record.sources) {
			if (source.path && !source.url) await validatePath(repoRoot, source.path);
			else
				requireValue(
					!source.path && typeof source.url === "string" && new URL(source.url).protocol === "https:",
					`${record.id}: invalid source`,
				);
		}
		for (const oldId of record.supersedes)
			requireValue(ids.has(oldId) && oldId !== record.id, `${record.id}: invalid supersedes ${oldId}`);
		for (const commit of [record.baseCommit, ...record.commits])
			if (!commitOwners.has(commit)) commitOwners.set(commit, record.id);
		if (record.status === "superseded")
			requireValue(
				records.some((next) => next.supersedes.includes(record.id)),
				`${record.id}: missing replacement`,
			);
	}
	const visiting = new Set();
	const visited = new Set();
	function visit(id) {
		requireValue(!visiting.has(id), `Supersession cycle: ${id}`);
		if (visited.has(id)) return;
		visiting.add(id);
		for (const old of records.find((record) => record.id === id).supersedes) visit(old);
		visiting.delete(id);
		visited.add(id);
	}
	for (const id of ids) visit(id);
	verifyCommits(repoRoot, commitOwners);
	return { topics, records };
}

function cell(text) {
	return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderIndex({ topics, records }) {
	const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
	const lines = [
		"# 工作记忆索引",
		"",
		"由 `pnpm memory:index` 在本地生成，不纳入版本控制（ADR 0049）；请编辑任务记录，不直接修改此文件。",
		"",
		"历史记录用于检索证据，不覆盖当前 AGENTS.md、专题规范或代码。记录日期不等于事件发生日期；测试结论只对正文注明的版本和范围有效。",
		"",
		"[使用与维护说明](README.md)",
		"",
		"## 按议题检索",
		"",
	];
	for (const topic of topics) {
		lines.push(
			`### ${topic.title}`,
			"",
			`当前规范：${topic.documents.map((path) => `[${path}](../../${path})`).join(" · ")}`,
			"",
		);
		for (const record of sorted.filter((item) => item.topics.includes(topic.id)))
			lines.push(
				`- [${record.title}](sessions/${record.file}) — ${record.date}；${statusLabels[record.status]}。${record.summary}`,
			);
		lines.push("");
	}
	lines.push(
		"## 按记录日期检索",
		"",
		"| 记录日期 | 任务记录 | 来源任务 | 基线提交 | 状态 |",
		"| --- | --- | --- | --- | --- |",
	);
	for (const record of sorted)
		lines.push(
			`| ${record.date} | [${cell(record.title)}](sessions/${record.file}) | ${record.thread ? `${cell(record.thread.title)}（\`${record.thread.id}\`）` : "未取得任务标识，见正文"} | \`${record.baseCommit}\` | ${statusLabels[record.status]} |`,
		);
	return `${lines.join("\n")}\n`;
}

/** Writes the local, Git-ignored index; `check` validates the records and that the index is not tracked (ADR 0049). */
export async function updateIndex(repoRoot, check = false) {
	const content = renderIndex(await loadMemory(repoRoot));
	if (check) {
		requireValue(
			!isTracked(repoRoot, indexPath),
			`${indexPath} must not be tracked; it is a local view (docs/adr/0049-local-work-memory-index.md): run git rm --cached ${indexPath}`,
		);
		return;
	}
	const index = resolve(repoRoot, indexPath);
	const temporary = `${index}.${process.pid}.tmp`;
	try {
		await writeFile(temporary, content, { flag: "wx" });
		await rename(temporary, index);
	} finally {
		await unlink(temporary).catch((error) => {
			if (error.code !== "ENOENT") throw error;
		});
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const mode = process.argv[2];
	if (!["--write", "--check"].includes(mode) || process.argv.length !== 3)
		throw new Error("Usage: node scripts/work-memory.mjs --write|--check");
	await updateIndex(root, mode === "--check");
	process.stdout.write(mode === "--check" ? "Work-memory records verified.\n" : "Work-memory index updated (local view).\n");
}
