import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, open, realpath, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const threadPattern = /^[a-zA-Z0-9-]{1,80}$/;

export function redact(text) {
	return text
		.replace(
			/<(environment_context|in-app-browser-context|recommended_plugins|INSTRUCTIONS)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi,
			"[REDACTED_CONTEXT]",
		)
		.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
		.replace(
			/(?:authorization|cookie|set-cookie|private[_ -]?key|secret|password|access[_ -]?token|api[_ -]?key|mnemonic|seed phrase)["']?\s*[:=]\s*[^\n]+/gi,
			"[REDACTED_CREDENTIAL]",
		)
		.replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
		.replace(/\b(?:sk-|gh[pousr]_|github_pat_|xai-)[A-Za-z0-9_-]+/g, "[REDACTED_TOKEN]")
		.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_TOKEN]")
		.replace(/\b0x[0-9a-fA-F]{40,}\b/g, "[REDACTED_HEX]")
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
		.replace(/\/Users\/[^/\s]+/g, "/Users/[REDACTED]");
}

export function publicEvent(row, sourceLine) {
	const payload = row.payload;
	if (row.type !== "response_item" || !payload) return null;
	if (payload.type === "message") {
		const phase = payload.phase ?? payload.channel;
		const allowed =
			payload.role === "user" ||
			(payload.role === "assistant" && ["commentary", "final_answer", "final"].includes(phase));
		if (!allowed || !Array.isArray(payload.content)) return null;
		const text = payload.content
			.filter((item) => ["input_text", "output_text"].includes(item.type) && typeof item.text === "string")
			.map((item) => item.text)
			.join("\n");
		if (!text) return null;
		return {
			sourceLine,
			timestamp: row.timestamp,
			type: "message",
			role: payload.role,
			phase: phase ?? null,
			text: redact(text),
		};
	}
	if (
		["function_call", "custom_tool_call"].includes(payload.type) &&
		typeof payload.name === "string" &&
		/^[a-zA-Z0-9_.:-]+$/.test(payload.name)
	) {
		return { sourceLine, timestamp: row.timestamp, type: "tool_invocation", name: payload.name };
	}
	return null;
}

export async function captureWorklog({ repoRoot, source, threadId, now = new Date() }) {
	if (typeof threadId !== "string" || !threadPattern.test(threadId)) throw new Error("Invalid thread id");
	const size = (await stat(source)).size;
	if (!size) throw new Error("Empty session file");
	const stream = createReadStream(source, { start: 0, end: size - 1 });
	const lines = createInterface({ input: stream, crlfDelay: Infinity });
	let directory;
	let transcript;
	let count = 0;
	let exported = 0;
	let firstTimestamp = null;
	let lastTimestamp = null;
	const excluded = {};
	const digest = createHash("sha256");
	try {
		for await (const line of lines) {
			count++;
			let row;
			try {
				row = JSON.parse(line);
			} catch {
				throw new Error(`Invalid or incomplete JSON at source line ${count}; retry after the writer finishes`);
			}
			if (count === 1) {
				if (
					row.type !== "session_meta" ||
					row.payload?.id !== threadId ||
					(await realpath(row.payload.cwd)) !== (await realpath(repoRoot))
				)
					throw new Error("Session identity or project does not match; no archive created");
				const parent = resolve(repoRoot, ".worklog", now.toISOString().slice(0, 10), threadId);
				await mkdir(parent, { recursive: true, mode: 0o700 });
				directory = await mkdtemp(`${parent}/snapshot-`);
				transcript = await open(resolve(directory, "events.jsonl"), "wx", 0o600);
			}
			const event = publicEvent(row, count);
			if (!event) {
				const key = `${row.type}/${row.payload?.type ?? "metadata"}`;
				excluded[key] = (excluded[key] ?? 0) + 1;
				continue;
			}
			const output = `${JSON.stringify(event)}\n`;
			await transcript.writeFile(output);
			digest.update(output);
			exported++;
			firstTimestamp ??= row.timestamp;
			lastTimestamp = row.timestamp;
		}
		if (!exported) throw new Error("No recognized public events; inspect source format before retrying");
		await transcript.close();
		transcript = undefined;
		const manifest = {
			schemaVersion: 1,
			threadId,
			archivedAt: now.toISOString(),
			sourceBytes: size,
			sourceLines: count,
			exportedEvents: exported,
			firstTimestamp,
			lastTimestamp,
			excluded,
			eventsSha256: digest.digest("hex"),
			format: "Codex local rollout snapshot; observed schema, not a stable public export API",
			coverage:
				"Redacted visible text messages and tool invocation names only. Not a complete original transcript or a reasoning record.",
			omitted: [
				"reasoning",
				"system/developer instructions",
				"tool arguments and outputs",
				"images and attachments",
				"unknown message phases",
				"events written after snapshot start",
			],
			privacy:
				"Local only. Pattern redaction is incomplete; manually review before sharing or copying into tracked documents.",
		};
		await writeFile(resolve(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
			flag: "wx",
			mode: 0o600,
		});
		return { directory, exportedEvents: exported };
	} catch (error) {
		if (transcript) await transcript.close();
		if (directory) await rm(directory, { recursive: true });
		throw error;
	} finally {
		lines.close();
		stream.destroy();
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const [source, threadId] = process.argv.slice(2);
	if (!source || !threadId || process.argv.length !== 4)
		throw new Error("Usage: pnpm memory:capture <session-jsonl> <thread-id>");
	process.stdout.write(`${JSON.stringify(await captureWorklog({ repoRoot: root, source, threadId }))}\n`);
}
