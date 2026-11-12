import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cspHash } from "../../scripts/collect-inline-script-hashes.mjs";
import { parseScriptHashes } from "./function-code.mjs";
import {
	API_REQUEST_TIMEOUT_MS,
	assertNoExtraLambdaModules,
	assertReleaseIdentity,
	assertNoSourceMaps,
	assertReleaseMarkersUploaded,
	assertSelfContainedLambdaEntry,
	buildFunctionUpdateCommands,
	buildInvalidationCommand,
	buildLambdaCommands,
	buildRetiredPageCommands,
	buildReuploadCommands,
	buildSyncCommands,
	buildSyncPlan,
	collectServedScriptHashes,
	evaluateReleaseGates,
	findExtraLambdaModules,
	findRelativeImports,
	HTML_CACHE_CONTROL,
	IMMUTABLE_CACHE_CONTROL,
	LAMBDA_ENTRIES,
	listPublicFiles,
	NO_STORE,
	objectCacheControl,
	planUpload,
	prepareResponseFunction,
	probeApiAfterLambdaUpdate,
	releaseFunctionPath,
	releaseLambda,
	releaseGateState,
	releaseStatic,
	RETIRED_PAGE_KEYS,
	resolveAwsProfile,
	REVALIDATE_CACHE_CONTROL,
	runSyncPlan,
	summarizeLambdaUpdate,
	verifyDeployment,
} from "./deploy.mjs";

test("objects get the cache policy the edge expects", () => {
	assert.equal(objectCacheControl("assets/index-abc.js"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/bundles/runtime.4d986d07cb97d8edacba.js"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/bundles/1227.68542dac293294290d44.rtl.css"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/bundles/EuclidCircular.be8f862db48c2976009f.woff2"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/bundles/library.js"), REVALIDATE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/charting_library.0123456789abcdef.js"), IMMUTABLE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/charting_library.js"), REVALIDATE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/charting_library.0123456789abcdef.js.br"), null);
	assert.equal(objectCacheControl("charting_library/charting_library.esm.js"), REVALIDATE_CACHE_CONTROL);
	assert.equal(objectCacheControl("charting_library/sameorigin.html"), REVALIDATE_CACHE_CONTROL);
	assert.ok(HTML_CACHE_CONTROL.includes("s-maxage=60") && HTML_CACHE_CONTROL.includes("stale-while-revalidate"));
	assert.equal(objectCacheControl("tradingview-theme-dark.css"), REVALIDATE_CACHE_CONTROL);
	assert.equal(objectCacheControl("_shell.html"), HTML_CACHE_CONTROL);
	assert.equal(objectCacheControl("docs/index.html"), HTML_CACHE_CONTROL);
	assert.equal(objectCacheControl("build-meta.json"), NO_STORE);
	assert.equal(objectCacheControl("sw.js"), NO_STORE);
	assert.equal(objectCacheControl("manifest.json"), REVALIDATE_CACHE_CONTROL);
	assert.equal(objectCacheControl("assets/index-abc.js.br"), null);
	assert.equal(objectCacheControl("sw.js.gz"), null);
});

test("only content-hashed files may be skipped; build metadata and then the shell are the last uploads", () => {
	const files = [
		"404.html",
		"_shell.html",
		"assets/a.js",
		"assets/a.js.br",
		"build-meta.json",
		"charting_library/bundles/runtime.4d986d07cb97d8edacba.js",
		"charting_library/charting_library.js",
		"charting_library/sameorigin.html",
		"docs/index.html",
		"manifest.json",
		"sw.js",
		"tradingview-theme-dark.css",
	];
	const plan = planUpload(files);
	assert.deepEqual(
		plan.early.map((item) => item.file),
		["assets/a.js", "charting_library/bundles/runtime.4d986d07cb97d8edacba.js", "charting_library/charting_library.js", "manifest.json", "sw.js", "tradingview-theme-dark.css"],
	);
	const steps = buildSyncPlan({ publicDir: "/out/public", bucket: "sairn-terminal", files });
	assert.deepEqual(
		steps.map((step) => step.stage),
		["immutable", "mutable", "mutable", "pages", "pages", "buildMeta", "retiredPages", "retiredPages", "retiredPages", "retiredPages", "retiredPages", "shell"],
	);
	assert.deepEqual(buildSyncCommands({ publicDir: "/out/public", bucket: "sairn-terminal", files }), steps.map((step) => step.command));
	const [immutable] = steps;
	assert.deepEqual(immutable.command.slice(0, 4), ["s3", "sync", "/out/public", "s3://sairn-terminal"]);
	assert.ok(immutable.command.includes("assets/a.js") && immutable.command.includes("charting_library/bundles/runtime.4d986d07cb97d8edacba.js"));
	assert.equal(immutable.command[immutable.command.indexOf("--cache-control") + 1], IMMUTABLE_CACHE_CONTROL);
	for (const step of steps.slice(1)) {
		assert.equal(step.command[1], "cp", `${step.stage} must upload unconditionally`);
		assert.ok(!step.command.includes("--delete"));
	}
	const synced = steps.filter((step) => step.command[1] === "sync").flatMap((step) => step.command);
	for (const file of files.filter((file) => objectCacheControl(file) !== null && objectCacheControl(file) !== IMMUTABLE_CACHE_CONTROL)) {
		assert.ok(!synced.includes(file), `${file} has no content hash and must never go through s3 sync`);
	}
	const keysOf = (step) => step.command.filter((_, index) => step.command[index - 1] === "--include");
	assert.deepEqual(keysOf(steps[1]).concat(keysOf(steps[2])).sort(), ["charting_library/charting_library.js", "manifest.json", "sw.js", "tradingview-theme-dark.css"]);
	assert.deepEqual(keysOf(steps[3]).concat(keysOf(steps[4])).sort(), ["404.html", "charting_library/sameorigin.html", "docs/index.html"]);
	assert.deepEqual(steps.at(-1).command, ["s3", "cp", join("/out/public", "_shell.html"), "s3://sairn-terminal/_shell.html", "--cache-control", HTML_CACHE_CONTROL, "--no-progress"]);
	assert.deepEqual(steps[5].command, ["s3", "cp", join("/out/public", "build-meta.json"), "s3://sairn-terminal/build-meta.json", "--cache-control", NO_STORE, "--no-progress"]);
	assert.equal(steps.filter((step) => step.command.some((argument) => argument.endsWith("_shell.html") && step.command[1] === "cp")).length, 6);
	assert.ok(!steps.some((step) => step.command.includes("assets/a.js.br")));
});

test("reupload rewrites the metadata of the selected objects in the bucket, never uploading a local body", () => {
	const files = ["_shell.html", "assets/a.js", "charting_library/bundles/x.0123456789abcdef0123.js", "charting_library/charting_library.js", "docs/index.html"];
	const commands = buildReuploadCommands({ bucket: "b", files, prefixes: ["charting_library/bundles/", "_shell.html"] });
	assert.equal(commands.length, 2);
	assert.deepEqual(commands[0].slice(0, 5), ["s3", "cp", "s3://b", "s3://b", "--recursive"]);
	assert.ok(commands.every((command) => command.includes("--metadata-directive") && command.includes("REPLACE")));
	assert.ok(commands.every((command) => !command.some((argument) => argument.startsWith("/"))));
	assert.ok(commands[0].includes("charting_library/bundles/x.0123456789abcdef0123.js") && commands[0].includes(IMMUTABLE_CACHE_CONTROL));
	assert.ok(commands[1].includes("_shell.html") && commands[1].includes(HTML_CACHE_CONTROL));
	assert.ok(!commands.flat().includes("docs/index.html") && !commands.flat().includes("charting_library/charting_library.js"));
	const many = Array.from({ length: 1_001 }, (_, index) => `charting_library/bundles/${index}.0123456789abcdef0123.js`);
	assert.equal(buildReuploadCommands({ bucket: "b", files: many, prefixes: ["charting_library/"] }).length, 3);
});

test("an executing sync overwrites the retired document pages with the shell unless the build still ships them", () => {
	assert.deepEqual(RETIRED_PAGE_KEYS, [
		"cookies/index.html",
		"docs/index.html",
		"privacy/index.html",
		"risk/index.html",
		"support/index.html",
		"terms/index.html",
	]);
	const commands = buildRetiredPageCommands({ publicDir: "/out", bucket: "b", files: ["_shell.html", "assets/a.js"] });
	assert.deepEqual(
		commands.map((command) => command.slice(0, 4)),
		RETIRED_PAGE_KEYS.map((key) => ["s3", "cp", join("/out", "_shell.html"), `s3://b/${key}`]),
	);
	for (const command of commands) {
		assert.equal(command[command.indexOf("--cache-control") + 1], HTML_CACHE_CONTROL);
		assert.equal(command[command.indexOf("--content-type") + 1], "text/html; charset=utf-8");
		assert.ok(!command.includes("rm") && !command.includes("--recursive") && !command.includes("--delete"));
	}
	const rollback = buildRetiredPageCommands({ publicDir: "/out", bucket: "b", files: ["_shell.html", "terms/index.html"] });
	assert.ok(!rollback.flat().includes("s3://b/terms/index.html"));
	assert.equal(rollback.length, 5);
});

test("the release markers are compared by content, so a skipped upload of the same size is caught", () => {
	const publicDir = createPublicDir();
	const local = { "_shell.html": Buffer.from(SHELL_HTML), "build-meta.json": Buffer.from(JSON.stringify(BUILD_META)) };
	assert.doesNotThrow(() => assertReleaseMarkersUploaded({ bucket: "b", publicDir, readObject: (_, key) => local[key] }));
	const olderShell = Buffer.from(SHELL_HTML.replace("chunk-1.js", "chunk-9.js"));
	assert.equal(olderShell.length, local["_shell.html"].length);
	assert.throws(
		() => assertReleaseMarkersUploaded({ bucket: "b", publicDir, readObject: (_, key) => (key === "_shell.html" ? olderShell : local[key]) }),
		/_shell.html in s3:\/\/b \(sha256 [0-9a-f]{12}\) differs from the local build/,
	);
	const olderMeta = Buffer.from(JSON.stringify({ ...BUILD_META, commit: "abd" }));
	assert.throws(
		() => assertReleaseMarkersUploaded({ bucket: "b", publicDir, readObject: (_, key) => (key === "build-meta.json" ? olderMeta : local[key]) }),
		/build-meta.json in s3:\/\/b .* differs from the local build/,
	);
	assert.throws(() => assertReleaseMarkersUploaded({ bucket: "b", publicDir, readObject: () => undefined }), /\(sha256 missing\)/);
});

/** Claims that only the state before the run could justify; a failure report must never make them. */
const UNKNOWABLE_CLAIMS = /\bstill\b|previous release|already reports|serves|partly written/i;

function failAt(plan, stage, { write } = {}) {
	const ran = [];
	const failedIndex = plan.findIndex((step) => step.stage === stage);
	let message;
	assert.throws(
		() =>
			runSyncPlan({
				plan,
				bucket: "b",
				run: (command) => {
					if (command === plan[failedIndex].command) {
						write?.(command);
						throw new Error("Failed to connect to proxy URL");
					}
					ran.push(command);
					write?.(command);
				},
			}),
		(error) => {
			message = error.message;
			return true;
		},
	);
	return { ran, message };
}

test("an interrupted upload reports only what this run did and never writes the shell before the metadata", () => {
	const files = ["_shell.html", "assets/a.js", "build-meta.json", "sw.js"];
	const plan = buildSyncPlan({ publicDir: "/out", bucket: "b", files });
	const early = failAt(plan, "mutable");
	assert.equal(early.ran.length, 1);
	assert.match(early.message, /stopped at command 2 of 10, stage "other files that are not HTML \(always uploaded\)"/);
	assert.match(early.message, /Stages that returned success in this run: "files classified immutable by path/);
	assert.match(early.message, /each holds either its earlier content or this build's, never part of one/);
	assert.match(early.message, /This run did not write the later stages: .*"build-meta\.json".*"_shell\.html"/);
	assert.match(early.message, /does not know what the bucket held before this run/);
	assert.match(early.message, /Run the same sync again unchanged, then verify\.\nCause: Failed to connect to proxy URL$/);
	assert.ok(!early.ran.flat().includes("s3://b/_shell.html") && !early.ran.flat().includes("s3://b/build-meta.json"));
	const meta = failAt(plan, "buildMeta");
	assert.match(meta.message, /stage "build-meta\.json"/);
	assert.match(meta.message, /This run did not write the later stages: "retired legal page copies of this shell", "_shell\.html"/);
	const retired = failAt(plan, "retiredPages");
	assert.match(retired.message, /Stages that returned success in this run: .*"build-meta\.json"/);
	const shell = failAt(plan, "shell");
	assert.ok(shell.ran.flat().includes("s3://b/build-meta.json"));
	assert.match(shell.message, /stage "_shell\.html".*No stage comes after it\./);
	const thirdRetired = plan.filter((step) => step.stage === "retiredPages")[2];
	let midStage;
	assert.throws(
		() =>
			runSyncPlan({
				plan,
				bucket: "b",
				run: (command) => {
					if (command === thirdRetired.command) throw new Error("Failed to connect to proxy URL");
				},
			}),
		(error) => {
			midStage = error.message;
			return true;
		},
	);
	assert.match(midStage, /Stages that returned success in this run: [^.]*"build-meta\.json"\./);
	assert.doesNotMatch(midStage.match(/Stages that returned success in this run: [^.]*\./)[0], /retired legal page copies/, "a stage whose command failed never counts as a success");
	assert.match(midStage, /Earlier commands of the same stage returned success\. The objects of the failed command are in an unknown state/);
	for (const { message } of [early, meta, retired, shell, { message: midStage }]) assert.doesNotMatch(message, UNKNOWABLE_CLAIMS);
	const ran = [];
	runSyncPlan({ plan, bucket: "b", run: (command) => ran.push(command) });
	assert.deepEqual(ran, plan.map((step) => step.command));
});

test("a failure report stays true when the failed command wrote its object and when an earlier run stopped later", () => {
	const publicDir = createPublicDir();
	writeFileSync(join(publicDir, "sw.js"), "self.version = 2;");
	const files = listPublicFiles(publicDir);
	const plan = buildSyncPlan({ publicDir, bucket: "b", files });
	const fake = createFakeBucket({
		"_shell.html": { body: Buffer.from("<html>older shell</html>"), mtimeMs: 0 },
		"build-meta.json": { body: Buffer.from('{"commit":"older"}'), mtimeMs: 0 },
	});

	const lostAnswer = failAt(plan, "buildMeta", { write: fake.run });
	assert.equal(fake.bucket.get("build-meta.json").body.toString("utf8"), JSON.stringify(BUILD_META), "the write happened although the command failed");
	assert.match(lostAnswer.message, /objects of the failed command are in an unknown state/);
	assert.doesNotMatch(lostAnswer.message, UNKNOWABLE_CLAIMS);

	const second = failAt(plan, "mutable", { write: fake.run });
	assert.equal(fake.bucket.get("build-meta.json").body.toString("utf8"), JSON.stringify(BUILD_META), "the first run left this build's metadata");
	assert.equal(fake.bucket.get("_shell.html").body.toString("utf8"), "<html>older shell</html>");
	assert.match(second.message, /This run did not write the later stages: .*"build-meta\.json"/);
	assert.match(second.message, /an earlier interrupted run may already have written some of these files/);
	assert.doesNotMatch(second.message, UNKNOWABLE_CLAIMS);
});

test("a file name with a filter wildcard is refused before any command is built", () => {
	for (const name of ["assets/a*.js", "assets/a?.js", "assets/[a].js", "assets/a].js", "*.html"]) {
		assert.throws(
			() => buildSyncPlan({ publicDir: "/out", bucket: "b", files: ["_shell.html", "build-meta.json", "assets/ok.js", name] }),
			(error) => error.message.includes(`(* ? [ ]): ${name}.`) && /nothing was uploaded/.test(error.message),
			name,
		);
	}
	assert.throws(() => buildSyncPlan({ publicDir: "/out", bucket: "b", files: ["_shell.html", "x*.css", "y?.png"] }), /2 file name\(s\).*x\*\.css, y\?\.png/);
	assert.doesNotThrow(() => buildSyncPlan({ publicDir: "/out", bucket: "b", files: ["_shell.html", "assets/a.js.br", "assets/historicalOrders._address-Dw7jPxv9.js"] }));
	assert.doesNotThrow(() => buildSyncPlan({ publicDir: "/out", bucket: "b", files: ["_shell.html", "assets/a*.js.br"] }), "a precompressed sibling is never uploaded");
});

function staticHarness({ publicDir = createPublicDir(), files, readObject } = {}) {
	const events = [];
	const fake = createFakeBucket();
	return {
		events,
		fake,
		options: {
			publicDir,
			bucket: "b",
			listFiles: (dir) => files ?? listPublicFiles(dir),
			assertLivePolicy: () => events.push("policy"),
			run: (command) => {
				events.push(`run ${command[1]}`);
				fake.run(command);
			},
			readObject: (bucket, key) => {
				events.push(`read ${key}`);
				return (readObject ?? fake.readObject)(bucket, key);
			},
			log: () => {},
			warn: () => {},
		},
	};
}

test("the sync command refuses source maps before uploading and compares the markers after the last upload", () => {
	const executed = staticHarness();
	releaseStatic({ ...executed.options, execute: true });
	assert.equal(executed.events[0], "policy");
	const reads = executed.events.map((event, index) => (event.startsWith("read ") ? index : -1)).filter((index) => index >= 0);
	assert.deepEqual(reads.map((index) => executed.events[index]), ["read _shell.html", "read build-meta.json"]);
	assert.ok(reads[0] > executed.events.findLastIndex((event) => event.startsWith("run ")), "the markers are read after every upload");

	const maps = staticHarness();
	assert.throws(
		() => releaseStatic({ ...maps.options, listFiles: (dir) => [...listPublicFiles(dir), "assets/chunk-1.js.map"], execute: true }),
		/source map/,
	);
	assert.deepEqual(maps.events, [], "nothing is checked or uploaded once a source map is found");

	const stale = staticHarness({ readObject: (_, key) => (key === "_shell.html" ? Buffer.from("<html>older</html>") : Buffer.from(JSON.stringify(BUILD_META))) });
	assert.throws(() => releaseStatic({ ...stale.options, execute: true }), /_shell\.html in s3:\/\/b .* differs from the local build/);

	const dryRun = staticHarness();
	releaseStatic({ ...dryRun.options, execute: false });
	assert.ok(!dryRun.events.includes("policy") && !dryRun.events.some((event) => event.startsWith("read ")));
});

test("captured command output never reaches the release log", () => {
	const marker = "IPDATA_API_KEY=marker-7f3a";
	const script = [
		`import { captureCommand } from ${JSON.stringify(new URL("./deploy.mjs", import.meta.url).href)};`,
		`const out = captureCommand(process.execPath, ["-e", ${JSON.stringify(`console.log(${JSON.stringify(marker)})`)}]);`,
		`process.stdout.write(out.includes(${JSON.stringify(marker)}) ? "captured" : "missing");`,
	].join("\n");
	const flags = process.execArgv.filter((flag) => flag.startsWith("--experimental-strip-types"));
	const result = spawnSync(process.execPath, [...flags, "--input-type=module", "-e", script], { encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout, "captured");
	assert.ok(!result.stdout.includes(marker));
});

test("a build that carries source maps is refused", () => {
	assert.doesNotThrow(() => assertNoSourceMaps(["assets/a.js", "_shell.html"]));
	assert.throws(() => assertNoSourceMaps(["assets/a.js", "assets/a.js.map"]), /1 source map\(s\), for example assets\/a\.js\.map/);
});

/**
 * Models the two AWS CLI upload commands the release uses against an in-memory bucket. `s3 sync`
 * uploads a file only when the key is missing, the sizes differ or the local file is newer than the
 * object (the CLI's default comparison); `s3 cp` always uploads. Each `--include` is read as the
 * exact key it names, which holds for real filters only because `buildSyncPlan` refuses keys that
 * contain a wildcard character (`* ? [ ]`).
 */
function createFakeBucket(objects = {}) {
	const bucket = new Map(Object.entries(objects));
	function filteredKeys(publicDir, args) {
		const keys = [];
		for (let index = 0; index < args.length; index += 1) if (args[index] === "--include") keys.push(args[index + 1]);
		return keys.filter((key) => existsSync(join(publicDir, key)));
	}
	function put(path, key) {
		bucket.set(key, { body: readFileSync(path), mtimeMs: Date.now() });
	}
	function run(command) {
		const [service, verb, source, target] = command;
		assert.equal(service, "s3", `unexpected command ${command.join(" ")}`);
		if (verb === "sync") {
			for (const key of filteredKeys(source, command)) {
				const local = statSync(join(source, key));
				const remote = bucket.get(key);
				if (remote && remote.body.length === local.size && local.mtimeMs <= remote.mtimeMs) continue;
				put(join(source, key), key);
			}
			return;
		}
		assert.equal(verb, "cp", `unexpected command ${command.join(" ")}`);
		if (command.includes("--recursive")) {
			for (const key of filteredKeys(source, command)) put(join(source, key), key);
			return;
		}
		put(source, target.replace(/^s3:\/\/[^/]+\//, ""));
	}
	return {
		bucket,
		run,
		headObject: (_, key) => bucket.get(key)?.body.length,
		readObject: (_, key) => bucket.get(key)?.body,
	};
}

test("a rollback from an older build of the same size replaces the shell and the build metadata", () => {
	const publicDir = createPublicDir();
	const older = new Date("2026-11-01T00:00:00Z");
	writeFileSync(join(publicDir, "manifest.json"), '{"name":"old"}');
	for (const file of listPublicFiles(publicDir)) utimesSync(join(publicDir, file), older, older);
	const sameSize = (text) => Buffer.from(text.replace(/[a-z]/g, "z"));
	const fake = createFakeBucket(
		Object.fromEntries(
			listPublicFiles(publicDir).map((file) => [file, { body: sameSize(readFileSync(join(publicDir, file), "utf8")), mtimeMs: Date.now() }]),
		),
	);
	const files = listPublicFiles(publicDir);
	for (const command of buildSyncCommands({ publicDir, bucket: "b", files })) fake.run(command);
	for (const file of ["_shell.html", "build-meta.json", "manifest.json"]) {
		assert.equal(fake.bucket.get(file).body.toString("utf8"), readFileSync(join(publicDir, file), "utf8"), `${file} kept the newer release`);
	}
	assert.equal(
		fake.bucket.get("assets/chunk-0.js").body.toString("utf8"),
		"zz",
		"content-hashed files that are already in the bucket are not uploaded again",
	);
	assert.doesNotThrow(() => assertReleaseMarkersUploaded({ bucket: "b", publicDir, headObject: fake.headObject, readObject: fake.readObject }));
});

test("cloudfront functions are updated from their files and published with the returned etag", () => {
	const [update, publish] = buildFunctionUpdateCommands({ name: "gatu-terminal-response", file: "/repo/deploy/cloudfront/functions/terminal-response.js", etag: "E1", comment: "sairn route marker + csp" });
	assert.deepEqual(update.slice(0, 6), ["cloudfront", "update-function", "--name", "gatu-terminal-response", "--if-match", "E1"]);
	assert.ok(update.includes("fileb:///repo/deploy/cloudfront/functions/terminal-response.js"));
	assert.ok(update.includes("Comment=sairn route marker + csp,Runtime=cloudfront-js-2.0"));
	assert.deepEqual(publish, ["cloudfront", "publish-function", "--name", "gatu-terminal-response", "--if-match", "<updated-etag>"]);
});

test("invalidation and lambda commands are explicit and bounded", () => {
	assert.deepEqual(buildInvalidationCommand("E123"), [
		"cloudfront",
		"create-invalidation",
		"--distribution-id",
		"E123",
		"--paths",
		"/*",
	]);
	const [update, wait] = buildLambdaCommands({ functionName: "gatu-terminal-api", zipPath: "/tmp/lambda.zip" });
	assert.ok(update.includes("update-function-code") && update.includes("fileb:///tmp/lambda.zip") && update.includes("--publish"));
	assert.ok(wait.includes("function-updated"));
});

const FUNCTION_CONFIGURATION = {
	FunctionName: "gatu-terminal-api",
	Version: "26",
	CodeSize: 47_750,
	CodeSha256: "q1w2e3",
	State: "Pending",
	LastUpdateStatus: "InProgress",
	Role: "arn:aws:iam::000000000000:role/gatu-terminal-api",
	Environment: { Variables: { IPDATA_API_KEY: "secret-ipdata-key-value", SAIRN_TRUST_VIEWER_ADDRESS: "true" } },
};

test("a lambda update asks only for the fields it prints and never prints the function's environment", () => {
	const [update] = buildLambdaCommands({ functionName: "gatu-terminal-api", zipPath: "/tmp/lambda.zip" });
	const query = update[update.indexOf("--query") + 1];
	assert.equal(query, "{Version: Version, CodeSize: CodeSize, CodeSha256: CodeSha256, State: State, LastUpdateStatus: LastUpdateStatus}");
	assert.equal(update[update.indexOf("--output") + 1], "json");
	assert.ok(!/Environment|Variables|Role/.test(update.join(" ")));
	const summary = summarizeLambdaUpdate(JSON.stringify(FUNCTION_CONFIGURATION));
	assert.equal(summary, "Lambda updated: Version=26 CodeSize=47750 CodeSha256=q1w2e3 State=Pending LastUpdateStatus=InProgress");
	assert.ok(!/secret-ipdata-key-value|IPDATA|Environment|Variables|000000000000/.test(summary));
	assert.equal(summarizeLambdaUpdate("Environment: secret-ipdata-key-value"), "Lambda updated (the answer was not JSON and is not printed)");
});

test("a lambda entry that imports a split-out chunk is refused before the zip", () => {
	const code = [
		'import { a } from "./shared-a.mjs";',
		"export * from '../shared-b.mjs';",
		'import "./side-effect.mjs";',
		"const lazy = () => import(\"./shared-c.mjs\");",
		'import { createHash } from "node:crypto";',
		'const label = "./not-an-import.mjs";',
		'export { handler } from "node:module";',
	].join("\n");
	assert.deepEqual(findRelativeImports(code), ["./shared-a.mjs", "../shared-b.mjs", "./side-effect.mjs", "./shared-c.mjs"]);
	assert.throws(() => assertSelfContainedLambdaEntry(code, "index.mjs"), /index\.mjs imports \.\/shared-a\.mjs, \.\.\/shared-b\.mjs/);
	assert.doesNotThrow(() => assertSelfContainedLambdaEntry('import { createHash } from "node:crypto";\nexport { handler };', "index.mjs"));
	assert.deepEqual(LAMBDA_ENTRIES, ["index.mjs", "csp-report.mjs"]);
});

test("minified, commented and multi-line relative imports are all found", () => {
	for (const [code, specifier] of [
		['import"./x.mjs";', "./x.mjs"],
		['import/*c*/"./x.mjs";', "./x.mjs"],
		['export{a}from"./x.mjs";', "./x.mjs"],
		['const m=import("./x.mjs");', "./x.mjs"],
		['const m = import /* lazy */ ( "./x.mjs" );', "./x.mjs"],
		["import {\n  a,\n  b,\n} from\n  '../x.mjs';", "../x.mjs"],
		['import a/*x*/from/*y*/"./x.mjs";', "./x.mjs"],
	]) {
		assert.deepEqual(findRelativeImports(code), [specifier], code);
	}
	assert.deepEqual(findRelativeImports('import"node:crypto";export{a}from"node:module";'), []);
});

test("a Lambda output that holds a module file besides the entries is refused, at any depth", () => {
	assert.deepEqual(findExtraLambdaModules(["index.mjs", "csp-report.mjs", "index.zip", "csp-report.zip"]), []);
	assert.deepEqual(findExtraLambdaModules(["index.mjs", "csp-report.mjs", "shared-geo.mjs", "chunks/a.js", "lib/b.cjs", "notes.txt"]), [
		"shared-geo.mjs",
		"chunks/a.js",
		"lib/b.cjs",
	]);
	assert.deepEqual(findExtraLambdaModules(["nested/index.mjs"]), ["nested/index.mjs"], "only the top-level entries are allowed");
	assert.throws(() => assertNoExtraLambdaModules(["index.mjs", "csp-report.mjs", "shared-geo.mjs"]), /holds shared-geo\.mjs next to index\.mjs, csp-report\.mjs/);
});

test("every API request of the probe and of verify ends by its deadline, whatever the server does", { timeout: 10_000 }, async () => {
	assert.equal(API_REQUEST_TIMEOUT_MS, 10_000);
	const neverAnswers = () => new Promise(() => {});
	const neverSendsBody = async () => ({ status: 200, headers: new Headers(), text: () => new Promise(() => {}) });
	const signals = [];
	const recordsSignal = (_, init) => {
		signals.push(init.signal);
		return new Promise(() => {});
	};
	for (const fetchImpl of [neverAnswers, neverSendsBody, recordsSignal]) {
		const started = Date.now();
		await assert.rejects(
			probeApiAfterLambdaUpdate({ origin: "https://app.sairn.ai", fetchImpl, attempts: 2, delayMs: 1, requestTimeoutMs: 20, sleep: async () => {} }),
			(error) => {
				assert.match(error.message, /health probe answers 204: no answer from \/api\/health within 20 ms/);
				assert.match(error.message, /geo endpoint answers with a real verdict: no answer from \/api\/geo within 20 ms/);
				assert.match(error.message, /--lambda-dir <previous release worktree>\/apps\/terminal\/dist-lambda/);
				return true;
			},
		);
		assert.ok(Date.now() - started < 2_000, `the probe took ${Date.now() - started} ms`);
	}
	const timers = () => process.getActiveResourcesInfo().filter((resource) => resource === "Timeout").length;
	const before = timers();
	await probeApiAfterLambdaUpdate({ origin: "https://app.sairn.ai", fetchImpl: apiRoutes(), requestTimeoutMs: 60_000 });
	assert.equal(timers(), before, "an answered request leaves no deadline timer running");
	assert.equal(signals.length, 4);
	assert.ok(signals.every((signal) => signal instanceof AbortSignal && signal.aborted), "each timed-out request is aborted");

	const results = await verifyDeployment({ origin: "https://app.sairn.ai", publicDir: createPublicDir(), network: "mainnet", fetchImpl: (url, init) => (/\/api\/(geo|health)$/.test(new URL(url).pathname) ? neverAnswers() : fakeFetch({ "*": { status: 404, body: "missing" } })(url, init)), requestTimeoutMs: 20 });
	assert.match(results.find((result) => result.name === "geo endpoint answers with a real verdict").detail, /no answer from \/api\/geo within 20 ms/);
	assert.match(results.find((result) => result.name === "health probe answers 204").detail, /no answer from \/api\/health within 20 ms/);
});

function apiRoutes({ geo = { body: JSON.stringify({ country: "GB" }) }, health = { status: 204, body: null, headers: { "cache-control": NO_STORE } } } = {}) {
	return fakeFetch({ "/api/geo": geo, "/api/health": health, "*": { status: 404, body: "missing" } });
}

test("the API probe after a lambda update passes, retries a transient failure and fails closed with the way back", async () => {
	const sleeps = [];
	const sleep = async (ms) => sleeps.push(ms);
	const passed = await probeApiAfterLambdaUpdate({ origin: "https://app.sairn.ai/", fetchImpl: apiRoutes(), sleep });
	assert.equal(passed.attempt, 1);
	assert.deepEqual(
		passed.results.map((result) => [result.name, result.ok, result.detail]),
		[
			["health probe answers 204", true, ""],
			["geo endpoint answers with a real verdict", true, "country GB"],
		],
	);
	let calls = 0;
	const flaky = apiRoutes({ geo: () => (calls++ === 0 ? { status: 502, body: "bad gateway" } : { body: JSON.stringify({ country: "JP" }) }) });
	assert.equal((await probeApiAfterLambdaUpdate({ origin: "https://app.sairn.ai", fetchImpl: flaky, sleep, delayMs: 5 })).attempt, 2);
	assert.deepEqual(sleeps, [5]);
	await assert.rejects(
		probeApiAfterLambdaUpdate({ origin: "https://app.sairn.ai", fetchImpl: apiRoutes({ geo: { status: 503, body: "{\"error\":\"unavailable\"}" } }), sleep, attempts: 2 }),
		(error) => {
			assert.match(error.message, /geo endpoint answers with a real verdict: status 503/);
			assert.match(error.message, /--lambda-dir <previous release worktree>\/apps\/terminal\/dist-lambda --origin https:\/\/app\.sairn\.ai --execute/);
			return true;
		},
	);
	await assert.rejects(
		probeApiAfterLambdaUpdate({ origin: "https://app.sairn.ai", fetchImpl: apiRoutes({ health: { status: 500, body: "x" } }), sleep, attempts: 1 }),
		/health probe answers 204: status 500/,
	);
});

function lambdaHarness({ code = "export { handler };", probe, bundleDir = ["index.mjs", "csp-report.mjs", "index.zip"] } = {}) {
	const events = [];
	return {
		events,
		options: {
			functionName: "gatu-terminal-api",
			bundle: "/release/apps/terminal/dist-lambda/index.mjs",
			zipPath: "/release/apps/terminal/dist-lambda/index.zip",
			readBundle: () => code,
			listBundleDir: () => bundleDir,
			zip: () => events.push("zip"),
			run: (command, execute) => events.push(`${execute ? "run" : "print"} ${command.slice(0, 3).join(" ")}`),
			capture: (command, execute) => {
				events.push(`${execute ? "capture" : "print"} ${command.slice(0, 2).join(" ")}`);
				return execute ? JSON.stringify(FUNCTION_CONFIGURATION) : "";
			},
			probe: async (origin) => {
				events.push(`probe ${origin}`);
				if (probe) return probe(origin);
				return { attempt: 1, results: [{ name: "health probe answers 204", ok: true, detail: "" }] };
			},
			log: (line) => events.push(`log ${line}`),
		},
	};
}

test("a lambda release checks the bundle, updates, waits and then probes, printing no configuration", async () => {
	const harness = lambdaHarness();
	await releaseLambda({ ...harness.options, origin: "https://app.sairn.ai", execute: true });
	const steps = harness.events.filter((event) => !event.startsWith("log "));
	assert.deepEqual(steps, ["zip", "capture lambda update-function-code", "run lambda wait function-updated", "probe https://app.sairn.ai"]);
	const logged = harness.events.filter((event) => event.startsWith("log ")).join("\n");
	assert.match(logged, /Lambda updated: Version=26 CodeSize=47750/);
	assert.ok(!/secret-ipdata-key-value|Environment/.test(logged));

	const refused = lambdaHarness();
	await assert.rejects(releaseLambda({ ...refused.options, execute: true }), /needs --origin/);
	assert.deepEqual(refused.events, []);

	const split = lambdaHarness({ code: 'import { a } from "./shared-a.mjs";' });
	await assert.rejects(releaseLambda({ ...split.options, origin: "https://app.sairn.ai", execute: true }), /shared chunk/);
	assert.deepEqual(split.events, []);

	const chunked = lambdaHarness({ bundleDir: ["index.mjs", "csp-report.mjs", "shared-geo.mjs"] });
	await assert.rejects(releaseLambda({ ...chunked.options, origin: "https://app.sairn.ai", execute: true }), /holds shared-geo\.mjs/);
	assert.deepEqual(chunked.events, []);

	const broken = lambdaHarness({ probe: async () => Promise.reject(new Error("The API function does not answer")) });
	await assert.rejects(releaseLambda({ ...broken.options, origin: "https://app.sairn.ai", execute: true }), /does not answer/);
	assert.equal(broken.events.at(-1), "probe https://app.sairn.ai");

	const receiver = lambdaHarness();
	await releaseLambda({ ...receiver.options, skipProbe: true, execute: true });
	assert.ok(!receiver.events.some((event) => event.startsWith("probe")));

	const dryRun = lambdaHarness();
	await releaseLambda({ ...dryRun.options, origin: "https://app.sairn.ai", execute: false });
	assert.ok(!dryRun.events.includes("zip") && !dryRun.events.some((event) => event.startsWith("probe")));
});

const SHELL_PRELOADS = Array.from({ length: 24 }, (_, index) => `/assets/chunk-${index}.js`);
const CHART_ENTRY = "/charting_library/charting_library.0123456789abcdef.js";
const THEME_SCRIPT = '(()=>{document.documentElement.classList.add("dark")})();';
const THEME_HASH = cspHash(THEME_SCRIPT);
const SHELL_HTML = `<html><head><script>${THEME_SCRIPT}</script>${SHELL_PRELOADS.map((href) => `<link rel="modulepreload" href="${href}"/>`).join("")}<link rel="preload" href="${CHART_ENTRY}" as="script" media="(min-width: 1001px)"/><meta name="sairn-preload-desktop" content="/assets/chunk-1.js"/><meta name="sairn-preload-mobile" content=""/><meta name="sairn-chart-prefetch" content="/charting_library/sameorigin.html"/></head></html>`;
const GATES_OFF = {
	mobileSync: { enabled: false },
	cctpDeposits: { mainnetSponsoredWallet: false, testnetExternalWallet: false, testnetSponsoredWallet: false },
	privyFiatFunding: { mainnet: false, testnet: false },
};
const BUILD_META = { commit: "abc", release: "r1", ...GATES_OFF };
const REPORT_ONLY_HEADER = `default-src 'self'; img-src 'self' data: https://app.hyperliquid.xyz; script-src 'self' 'report-sample' '${THEME_HASH}'; report-uri https://reports.example/`;

function createPublicDir() {
	const dir = mkdtempSync(join(tmpdir(), "sairn-cf-verify-"));
	mkdirSync(join(dir, "assets"), { recursive: true });
	for (const href of SHELL_PRELOADS) writeFileSync(join(dir, href.slice(1)), "js");
	writeFileSync(join(dir, "_shell.html"), SHELL_HTML);
	writeFileSync(join(dir, "build-meta.json"), JSON.stringify(BUILD_META));
	mkdirSync(join(dir, "charting_library", "bundles"), { recursive: true });
	writeFileSync(join(dir, "charting_library", "bundles", "runtime.4d986d07cb97d8edacba.js"), "js");
	writeFileSync(join(dir, CHART_ENTRY.slice(1)), "js");
	return dir;
}

function edgeSequence(route) {
	let hits = 0;
	return () => ({ ...route, headers: { ...route.headers, "x-cache": hits++ === 0 ? "Miss from cloudfront" : "Hit from cloudfront" } });
}

function legalRoutes(body) {
	const routes = {};
	for (const route of ["cookies", "docs", "privacy", "risk", "support", "terms"]) {
		routes[`/${route}`] = { body };
		routes[`/${route}/index.html`] = { body };
	}
	return routes;
}

function fakeFetch(routes) {
	return async (url, init) => {
		const path = new URL(url).pathname;
		const route = routes[path] ?? routes["*"];
		const { status = 200, body = "", headers = {} } = typeof route === "function" ? route(init) : route;
		return new Response(body, { status, headers });
	};
}

test("verification passes when the edge serves the build with the expected headers", async () => {
	const publicDir = createPublicDir();
	const headers = { "content-security-policy": "default-src 'self'", "content-security-policy-report-only": REPORT_ONLY_HEADER, link: "<https://api.hyperliquid.xyz>; rel=preconnect" };
	const results = await verifyDeployment({
		origin: "https://app.sairn.ai/",
		publicDir,
		network: "mainnet",
		scriptHashesMode: "report-only",
		fetchImpl: fakeFetch({
			"/trade/HYPE": edgeSequence({ body: SHELL_HTML, headers: { ...headers, "cache-control": HTML_CACHE_CONTROL } }),
			[SHELL_PRELOADS.at(-1)]: { body: "js", headers: { "cache-control": IMMUTABLE_CACHE_CONTROL } },
			"/api/health": { status: 204, body: null, headers: { "cache-control": NO_STORE } },
			"/charting_library/bundles/runtime.4d986d07cb97d8edacba.js": edgeSequence({ body: "js", headers: { "cache-control": IMMUTABLE_CACHE_CONTROL } }),
			...legalRoutes(SHELL_HTML),
			"/build-meta.json": { body: JSON.stringify(BUILD_META) },
			"/api/geo": { body: JSON.stringify({ country: "GB", proxy: false, tradeRestricted: false }) },
			"/api/referral-geo": (init) => ({
				status: init?.method === "POST" && /^[0-9a-f]{64}$/.test(init.headers?.["x-amz-content-sha256"] ?? "") ? 200 : 403,
				body: JSON.stringify({ checkedAt: 1, country: "GB", status: "allowed", ttlMs: 60_000 }),
			}),
			"/join/__sairn_healthcheck__": {
				body: SHELL_HTML,
				headers: { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow", "x-sairn-route": "referral-join" },
			},
			"/mobile-agent-sync": {
				body: SHELL_HTML,
				headers: { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-sairn-route": "mobile-agent-sync" },
			},
			[CHART_ENTRY]: { body: "js", headers: { "cache-control": IMMUTABLE_CACHE_CONTROL } },
			"/charting_library/charting_library.js": { body: "js", headers: { "cache-control": REVALIDATE_CACHE_CONTROL } },
			"*": { status: 404, body: "missing" },
		}),
	});
	assert.deepEqual(
		results.filter((result) => !result.ok),
		[],
	);
	assert.equal(results.length, 15);
	assert.equal(results.find((result) => result.name === "shell preloads the startup closure")?.detail, "24 links");
	assert.equal(results.find((result) => result.name === "inline scripts are allowed by the edge policy")?.detail, "1 pages, 1 inline scripts, report-only");
	assert.equal(results.find((result) => result.name === "image sources follow the edge config")?.detail, "3 sources, report-only");
	assert.equal(results.find((result) => result.name.startsWith("chart entry"))?.detail, CHART_ENTRY);
	assert.equal(results.find((result) => result.name === "shell repeats from the edge")?.detail, "Hit from cloudfront");
	assert.equal(results.find((result) => result.name === "legal pages match the build")?.detail, "6 shell, 0 standalone");
	assert.equal(results.find((result) => result.name.startsWith("signed lambda post"))?.detail, "status allowed");
	assert.equal(results.find((result) => result.name === "build metadata parity")?.detail, "abc / r1 / sponsored-mainnet-deposits=off mobile-pairing=off mainnet-card-funding=off");
});

test("verifying a rollback checks each legal page against the page the build ships", async () => {
	const publicDir = createPublicDir();
	for (const route of ["terms", "privacy"]) {
		mkdirSync(join(publicDir, route), { recursive: true });
		writeFileSync(join(publicDir, route, "index.html"), `<html>${route}</html>`);
	}
	async function run(overrides) {
		const results = await verifyDeployment({
			origin: "https://app.sairn.ai",
			publicDir,
			network: "mainnet",
			fetchImpl: fakeFetch({
				...legalRoutes(SHELL_HTML),
				"/terms": { body: "<html>terms</html>" },
				"/terms/index.html": { body: "<html>terms</html>" },
				"/privacy": { body: "<html>privacy</html>" },
				"/privacy/index.html": { body: "<html>privacy</html>" },
				...overrides,
				"*": { status: 404, body: "missing" },
			}),
		});
		return results.find((result) => result.name === "legal pages match the build");
	}
	const rollback = await run({});
	assert.equal(rollback.ok, true);
	assert.equal(rollback.detail, "4 shell, 2 standalone");
	assert.match((await run({ "/privacy": { body: SHELL_HTML } })).detail, /^\/privacy body differs from local privacy\/index\.html/);
	assert.match((await run({ "/risk/index.html": { body: "<html>old risk</html>" } })).detail, /^\/risk\/index\.html body differs from local _shell\.html/);
	assert.match((await run({ "/docs/index.html": { status: 404, body: "missing" } })).detail, /^\/docs\/index\.html status 404/);
});

test("verification fails when the live origin exposes a gate the local build does not", async () => {
	const publicDir = createPublicDir();
	const live = { ...BUILD_META, cctpDeposits: { ...GATES_OFF.cctpDeposits, mainnetSponsoredWallet: true } };
	const results = await verifyDeployment({
		origin: "https://app.sairn.ai",
		publicDir,
		network: "mainnet",
		fetchImpl: fakeFetch({ "/build-meta.json": { body: JSON.stringify(live) }, "*": { status: 404, body: "missing" } }),
	});
	const parity = results.find((result) => result.name === "build metadata parity");
	assert.equal(parity.ok, false);
	assert.match(parity.detail, /sponsored-mainnet-deposits=on mobile-pairing=off mainnet-card-funding=off\) differ from the local build \(sponsored-mainnet-deposits=off/);
});

test("an upload that exposes a funds or credential path needs its own acknowledgement", () => {
	assert.deepEqual(evaluateReleaseGates({ buildMeta: BUILD_META }), {
		state: { "sponsored-mainnet-deposits": false, "mobile-pairing": false, "mainnet-card-funding": false },
		problems: [],
	});

	const sponsored = { ...BUILD_META, cctpDeposits: { ...GATES_OFF.cctpDeposits, mainnetSponsoredWallet: true } };
	assert.match(evaluateReleaseGates({ buildMeta: sponsored }).problems.join("\n"), /exposes sponsored Mainnet CCTP deposits; pass --allow-sponsored-mainnet-deposits/);
	assert.deepEqual(evaluateReleaseGates({ buildMeta: sponsored, acknowledged: ["sponsored-mainnet-deposits"] }).problems, []);

	for (const mobileSync of [
		{ enabled: true },
		{ createAndReveal: false, importFromQr: true },
		{ createAndReveal: true, importFromQr: true },
	]) {
		const pairing = { ...BUILD_META, mobileSync };
		assert.match(evaluateReleaseGates({ buildMeta: pairing }).problems.join("\n"), /exposes Mobile Agent pairing; pass --allow-mobile-pairing/);
		assert.deepEqual(evaluateReleaseGates({ buildMeta: pairing, acknowledged: ["mobile-pairing"] }).problems, []);
	}

	const both = evaluateReleaseGates({ buildMeta: { ...sponsored, mobileSync: { enabled: true } }, acknowledged: ["mobile-pairing"] });
	assert.equal(both.problems.length, 1);
	assert.match(both.problems[0], /sponsored Mainnet/);

	const cardFunding = { ...BUILD_META, privyFiatFunding: { mainnet: true, testnet: false } };
	assert.match(evaluateReleaseGates({ buildMeta: cardFunding }).problems.join("\n"), /exposes Mainnet card funding; pass --allow-mainnet-card-funding/);
	assert.deepEqual(evaluateReleaseGates({ buildMeta: cardFunding, acknowledged: ["mainnet-card-funding"] }).problems, []);
	const testnetCardFunding = { ...BUILD_META, privyFiatFunding: { mainnet: false, testnet: true } };
	assert.deepEqual(evaluateReleaseGates({ buildMeta: testnetCardFunding }).problems, []);
	assert.equal(evaluateReleaseGates({ buildMeta: testnetCardFunding }).state["mainnet-card-funding"], false);
	const bothCardFunding = { ...BUILD_META, privyFiatFunding: { mainnet: true, testnet: true } };
	assert.equal(evaluateReleaseGates({ buildMeta: bothCardFunding }).state["mainnet-card-funding"], true);
	assert.match(evaluateReleaseGates({ buildMeta: bothCardFunding }).problems.join("\n"), /exposes Mainnet card funding; pass --allow-mainnet-card-funding/);
	assert.deepEqual(evaluateReleaseGates({ buildMeta: bothCardFunding, acknowledged: ["mainnet-card-funding"] }).problems, []);
});

test("verification fails when the live origin sells Mainnet card funding next to the sandbox and the local build does not", async () => {
	const publicDir = createPublicDir();
	for (const [privyFiatFunding, differs] of [
		[{ mainnet: true, testnet: true }, true],
		[{ mainnet: true, testnet: false }, true],
		[{ mainnet: false, testnet: true }, false],
	]) {
		const results = await verifyDeployment({
			origin: "https://app.sairn.ai",
			publicDir,
			network: "mainnet",
			fetchImpl: fakeFetch({ "/build-meta.json": { body: JSON.stringify({ ...BUILD_META, privyFiatFunding }) }, "*": { status: 404, body: "missing" } }),
		});
		const parity = results.find((result) => result.name === "build metadata parity");
		assert.equal(parity.ok, !differs, JSON.stringify(privyFiatFunding));
		if (differs) assert.match(parity.detail, /mainnet-card-funding=on\) differ from the local build \(sponsored-mainnet-deposits=off mobile-pairing=off mainnet-card-funding=off\)/);
	}
});

test("an acknowledgement the build does not match is refused, and so is a build that records no gates", () => {
	const mismatch = evaluateReleaseGates({
		buildMeta: BUILD_META,
		acknowledged: ["sponsored-mainnet-deposits", "mobile-pairing", "mainnet-card-funding"],
	});
	assert.equal(mismatch.problems.length, 3);
	assert.match(mismatch.problems[0], /--allow-sponsored-mainnet-deposits was passed but this build does not expose/);
	assert.match(mismatch.problems[1], /--allow-mobile-pairing was passed but this build does not expose/);
	assert.match(mismatch.problems[2], /--allow-mainnet-card-funding was passed but this build does not expose/);

	assert.throws(() => releaseGateState({ commit: "abc", release: "r1", mobileSync: GATES_OFF.mobileSync }), /does not record sponsored Mainnet CCTP deposits; rebuild/);
	assert.throws(() => releaseGateState({ commit: "abc", release: "r1", cctpDeposits: GATES_OFF.cctpDeposits }), /does not record Mobile Agent pairing; rebuild/);
	assert.throws(
		() => releaseGateState({ commit: "abc", release: "r1", cctpDeposits: GATES_OFF.cctpDeposits, mobileSync: GATES_OFF.mobileSync }),
		/does not record Mainnet card funding; rebuild/,
	);
	assert.throws(
		() => releaseGateState({ ...BUILD_META, cctpDeposits: { ...GATES_OFF.cctpDeposits, mainnetSponsoredWallet: "true" } }),
		/does not record sponsored Mainnet CCTP deposits/,
	);
});

test("verification reports a stale shell, a wrong preconnect and a failed geo verdict", async () => {
	const publicDir = createPublicDir();
	const results = await verifyDeployment({
		origin: "https://testnet.sairn.ai",
		publicDir,
		network: "testnet",
		fetchImpl: fakeFetch({
			"/trade/HYPE": { body: "<html>old shell</html>", headers: { "content-security-policy": "x", link: "<https://api.hyperliquid.xyz>; rel=preconnect" } },
			"/build-meta.json": { body: JSON.stringify({ ...BUILD_META, commit: "old", release: "r0" }) },
			"/api/geo": { status: 503, body: JSON.stringify({ error: "unavailable", reason: "missing_config" }) },
			"/join/__sairn_healthcheck__": { body: "x", headers: { "cache-control": "no-store" } },
			[CHART_ENTRY]: { body: "js", headers: { "cache-control": "max-age=0" } },
			"*": { status: 200, body: "<html>shell</html>" },
		}),
	});
	const failed = results.filter((result) => !result.ok).map((result) => result.name);
	assert.deepEqual(failed, [
		"shell for a trade navigation",
		"legal pages match the build",
		"build metadata parity",
		"geo endpoint answers with a real verdict",
		"signed lambda post with a payload hash",
		"referral deep link headers",
		"pairing page headers",
		"missing files stay 404",
		"chart entry is immutable and preloaded by the shell",
		"shell preloads the startup closure",
		"inline scripts are allowed by the edge policy",
		"image sources follow the edge config",
		"health probe answers 204",
		"shell repeats from the edge",
		"chart bundles are immutable at the edge",
		"testnet stays out of search results",
	]);
});

test("the enforced stage rejects a policy that still allows unsafe-inline or misses a page's script", async () => {
	const publicDir = createPublicDir();
	async function run(header) {
		const results = await verifyDeployment({
			origin: "https://app.sairn.ai",
			publicDir,
			network: "mainnet",
			scriptHashesMode: "enforce",
			fetchImpl: fakeFetch({
				"/trade/HYPE": { body: SHELL_HTML, headers: { "content-security-policy": header } },
				"*": { status: 404, body: "missing" },
			}),
		});
		return results.find((result) => result.name === "inline scripts are allowed by the edge policy");
	}
	assert.equal((await run(`default-src 'self'; script-src 'self' '${THEME_HASH}'`)).ok, true);
	assert.match((await run(`default-src 'self'; script-src 'self' 'unsafe-inline' '${THEME_HASH}'`)).detail, /still allows 'unsafe-inline'/);
	assert.match((await run("default-src 'self'; script-src 'self'")).detail, /does not allow inline script sha256-/);
	assert.match((await run("default-src 'self'")).detail, /has no content-security-policy with a script-src/);
	async function images(header) {
		const results = await verifyDeployment({
			origin: "https://app.sairn.ai",
			publicDir,
			network: "mainnet",
			scriptHashesMode: "enforce",
			imageSourcesMode: "enforce",
			fetchImpl: fakeFetch({ "/trade/HYPE": { body: SHELL_HTML, headers: { "content-security-policy": header } }, "*": { status: 404, body: "missing" } }),
		});
		return results.find((result) => result.name === "image sources follow the edge config");
	}
	assert.equal((await images("default-src 'self'; img-src 'self' data: https://app.hyperliquid.xyz")).ok, true);
	assert.match((await images("default-src 'self'; img-src 'self' data: blob: https:")).detail, /still allows any https origin/);
	assert.match((await images("default-src 'self'")).detail, /no content-security-policy with an img-src/);
});

test("a rotation keeps the hashes of a legal page file an interrupted sync left on an older build", async () => {
	const publicDir = createPublicDir();
	const olderScript = '(()=>{document.documentElement.dataset.release="a"})();';
	const olderPage = `<html><head><script>${olderScript}</script></head></html>`;
	const served = await collectServedScriptHashes({
		origin: "https://app.sairn.ai/",
		publicDir,
		fetchImpl: fakeFetch({
			"/trade/HYPE": { body: SHELL_HTML },
			"/terms/index.html": { body: olderPage },
			"/privacy/index.html": { body: SHELL_HTML },
			"*": { status: 404, body: "missing" },
		}),
	});
	assert.deepEqual(served, [cspHash(olderScript), THEME_HASH].sort());
	const committed = 'var SCRIPT_HASHES_CURRENT = "";\nvar SCRIPT_HASHES_PREVIOUS = "";\nfunction handler(event) { return event.response; }\n';
	const nextBuild = "sha256-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=";
	const rotated = prepareResponseFunction({ committedCode: committed, buildHashes: [nextBuild], servedHashes: served });
	assert.ok([...rotated.current, ...rotated.previous].includes(cspHash(olderScript)));
	await assert.rejects(
		collectServedScriptHashes({
			origin: "https://app.sairn.ai",
			publicDir,
			fetchImpl: fakeFetch({ "/trade/HYPE": { body: SHELL_HTML }, "/docs/index.html": { status: 503, body: "x" }, "*": { status: 404, body: "missing" } }),
		}),
		/\/docs\/index\.html answered 503/,
	);
});

test("a release fills the committed function with the build's hashes and keeps the live set as previous", () => {
	const committed = 'var SCRIPT_HASHES_CURRENT = "";\nvar SCRIPT_HASHES_PREVIOUS = "";\nfunction handler(event) { return event.response; }\n';
	const A = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
	const B = "sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
	const first = prepareResponseFunction({ committedCode: committed, buildHashes: [A] });
	assert.deepEqual([first.current, first.previous], [[A], []]);
	assert.deepEqual(parseScriptHashes(first.code), { current: [A], previous: [] });
	const second = prepareResponseFunction({ committedCode: committed, buildHashes: [B], liveCode: first.code });
	assert.deepEqual(parseScriptHashes(second.code), { current: [B], previous: [A] });
	const third = prepareResponseFunction({ committedCode: committed, buildHashes: [B], liveCode: second.code });
	assert.deepEqual(parseScriptHashes(third.code), { current: [B], previous: [A] });
	const migrated = prepareResponseFunction({ committedCode: committed, buildHashes: [A], liveCode: "var TERMINAL_CSP = 'legacy';\nfunction handler(event) { return event.response; }\n" });
	assert.deepEqual(parseScriptHashes(migrated.code), { current: [A], previous: [] });
	assert.throws(() => prepareResponseFunction({ committedCode: committed, buildHashes: [] }), /no inline scripts/);
	assert.ok(releaseFunctionPath("/repo/apps/terminal/.output/public").endsWith(join(".output", "edge", "terminal-response.js")));
});

test("every aws command runs as the release profile unless one is chosen explicitly", () => {
	assert.equal(resolveAwsProfile({ env: {} }), "gatu-edge");
	assert.equal(resolveAwsProfile({ env: { AWS_PROFILE: "ci-release" } }), "ci-release");
	assert.equal(resolveAwsProfile({ profile: "other", env: { AWS_PROFILE: "ci-release" } }), "other");
	assert.throws(() => resolveAwsProfile({ profile: "  ", env: {} }), /profile name/);
});

test("an executing release refuses the account root and unknown identities", () => {
	assert.equal(
		assertReleaseIdentity("arn:aws:iam::018252911946:user/gatu-edge"),
		"arn:aws:iam::018252911946:user/gatu-edge",
	);
	assert.equal(
		assertReleaseIdentity("arn:aws:sts::018252911946:assumed-role/release/ci"),
		"arn:aws:sts::018252911946:assumed-role/release/ci",
	);
	assert.throws(() => assertReleaseIdentity("arn:aws:iam::018252911946:root"), /account root/);
	assert.throws(() => assertReleaseIdentity(""), /caller identity/);
	assert.throws(() => assertReleaseIdentity("arn:aws:iam::018252911946:group/ops"), /Unexpected/);
});
