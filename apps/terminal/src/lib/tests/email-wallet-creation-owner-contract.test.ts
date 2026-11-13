import { readdirSync, readFileSync } from "node:fs";
import { dirname, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = resolve(TEST_DIR, "../..");
const CREATION_HOOK = "hooks/wallet/use-email-embedded-wallet.ts";

interface Caller {
	trigger: "automatic" | "explicit";
	reason: string;
	references: number;
}

/**
 * Every source file that mentions `ensureEmailEmbeddedWallet`, with how often. A new reference, an
 * alias or a function handed to another hook changes a count, so it has to be registered here with
 * its trigger. `references` counts the identifier, not only direct calls.
 */
const CREATION_CALLERS: Record<string, Caller> = {
	"providers/email-embedded-wallet-provider.tsx": {
		trigger: "automatic",
		reason: "the only automatic creation: once per email session, never after a failure",
		references: 3,
	},
	"hooks/trade/use-legal-gate.ts": {
		trigger: "explicit",
		reason: "Retry in the wallet setup state of the policy dialog",
		references: 2,
	},
	"hooks/wallet/use-wallet-session.ts": {
		trigger: "explicit",
		reason: "Reconnect wallet for an email session that has no wallet yet",
		references: 3,
	},
	"components/trade/tradebox/deposit-modal.tsx": {
		trigger: "explicit",
		reason: "the funding address Retry button",
		references: 2,
	},
};

function listSourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) return entry.name === "tests" || entry.name === "__tests__" ? [] : listSourceFiles(path);
		return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
	});
}

function countMatches(source: string, pattern: RegExp): number {
	return source.match(pattern)?.length ?? 0;
}

const SOURCES = listSourceFiles(SOURCE_DIR).map((path) => ({
	file: relative(SOURCE_DIR, path),
	source: readFileSync(path, "utf8"),
}));

function collect(pattern: RegExp): Record<string, number> {
	return Object.fromEntries(
		SOURCES.map(({ file, source }) => [file, countMatches(source, pattern)] as const).filter(([, count]) => count > 0),
	);
}

// Callbacks that run without a user action and can reach the creation, by file and kind, with the reason.
const AUTOMATIC_CREATION_CALLBACKS: Record<string, string> = {
	"providers/email-embedded-wallet-provider.tsx: useEffect":
		"the only automatic creation: once per email session, never after a failure",
	"components/trade/components/wallet-modal.tsx: useEffect":
		"PrivyWalletLauncher calls reconnectWallet once per opening of the Connect dialog; every opener found on 2026-11-13 is a click handler (header, trade panel, mobile order button)",
};
const CREATION = "ensureEmailEmbeddedWallet";
const EFFECT_HOOKS = new Set(["useEffect", "useLayoutEffect", "useInsertionEffect"]);
// A custom hook named like an effect (`useBrowserLayoutEffect`, `useMountEffect`) runs its first argument
// as an effect too.
const CUSTOM_EFFECT_HOOK = /^use[A-Z]\w*Effect$/;
// A query function runs without a user action whenever the query is enabled.
const AUTOMATIC_CALLBACK_PROPERTIES = new Set(["queryFn"]);

interface ParsedSource {
	file: string;
	sourceFile: ts.SourceFile;
}

function calleeName(expression: ts.Expression): string | null {
	if (ts.isIdentifier(expression)) return expression.text;
	if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
	return null;
}

function propertyKey(name: ts.PropertyName | ts.JsxAttributeName): string | null {
	if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
	return null;
}

// Whether `node` calls one of `names` (directly or as a member, `wallet.reconnectWallet()`) or passes it to a
// call (a timer, a promise chain, `useCallback`). Handlers in JSX `on…` attributes run on a user action, not
// when `node` runs, so they are not entered.
function invokesAny(node: ts.Node, names: Set<string>): boolean {
	let found = false;
	function visit(child: ts.Node) {
		if (found) return;
		if (ts.isJsxAttribute(child) && /^on[A-Z]/.test(child.name.getText())) return;
		if (ts.isCallExpression(child)) {
			const callee = calleeName(child.expression);
			const passed = child.arguments.some((argument) => ts.isIdentifier(argument) && names.has(argument.text));
			if ((callee && names.has(callee)) || passed) found = true;
		}
		ts.forEachChild(child, visit);
	}
	visit(node);
	return found;
}

// Whether a value hands on something that reaches the creation: one of `names` itself (also as a member,
// `legalGate.retryWalletSetup`), or a function that calls one of them.
function handsOn(value: ts.Node, names: Set<string>): boolean {
	if (ts.isIdentifier(value)) return names.has(value.text);
	if (ts.isPropertyAccessExpression(value)) return names.has(value.name.text);
	if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) return invokesAny(value.body, names);
	if (ts.isJsxExpression(value) && value.expression) return handsOn(value.expression, names);
	return false;
}

/**
 * Names in one file that reach the creation: the member names `seeds` the file receives (what an imported
 * hook returns, or the props its components are given), local aliases bound by destructuring such a member,
 * and local functions (a declaration or a `const` holding a function or a `useCallback`) that call one.
 */
function reachingNames(sourceFile: ts.SourceFile, seeds: Set<string>): Set<string> {
	const names = new Set(seeds);
	const bodies = new Map<string, ts.Node>();
	function collect(node: ts.Node) {
		if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) {
			const key = node.propertyName ? propertyKey(node.propertyName) : node.name.text;
			if (key && seeds.has(key)) names.add(node.name.text);
		}
		if (ts.isFunctionDeclaration(node) && node.name && node.body) bodies.set(node.name.text, node.body);
		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
			bodies.set(node.name.text, node.initializer);
		}
		ts.forEachChild(node, collect);
	}
	collect(sourceFile);
	let grew = true;
	while (grew) {
		grew = false;
		for (const [name, body] of bodies) {
			if (!names.has(name) && invokesAny(body, names)) {
				names.add(name);
				grew = true;
			}
		}
	}
	return names;
}

function resolveImport(from: string, specifier: string, files: Set<string>): string | null {
	let base: string;
	if (specifier.startsWith("@/")) base = specifier.slice(2);
	else if (specifier.startsWith(".")) base = posix.join(posix.dirname(from), specifier);
	else return null;
	for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
		if (files.has(candidate)) return candidate;
	}
	return null;
}

interface ImportGraph {
	importers: Map<string, string[]>;
	bindings: Map<string, Map<string, string>>;
}

// Which files import each file, and in each file which local names come from which project file.
function buildImportGraph(sources: ParsedSource[]): ImportGraph {
	const files = new Set(sources.map(({ file }) => file));
	const importers = new Map<string, string[]>();
	const bindings = new Map<string, Map<string, string>>();
	for (const { file, sourceFile } of sources) {
		const local = new Map<string, string>();
		for (const statement of sourceFile.statements) {
			if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
			const target = resolveImport(file, statement.moduleSpecifier.text, files);
			if (!target) continue;
			importers.set(target, [...(importers.get(target) ?? []), file]);
			const clause = statement.importClause;
			if (clause?.name) local.set(clause.name.text, target);
			const named = clause?.namedBindings;
			if (named && ts.isNamedImports(named)) for (const element of named.elements) local.set(element.name.text, target);
		}
		bindings.set(file, local);
	}
	return { importers, bindings };
}

/**
 * The member names each file receives that carry the creation. An object property whose value reaches it
 * (a hook's return value) is received by every project file that imports the file; a prop whose value
 * reaches it is received by the file that defines the component (the same file, or the project file the
 * tag is imported from). Repeated until nothing is added, so `useLegalGate` returning `retryWalletSetup`
 * from `useLegalGateSession`, `global-modals` handing it to `LegalAcceptanceModal` as `onRetryWalletSetup`,
 * and that modal handing it on as `onAction` are all followed. DOM elements and package components are not.
 */
function collectCreationSeeds(sources: ParsedSource[]): Map<string, Set<string>> {
	const graph = buildImportGraph(sources);
	const seeds = new Map(sources.map(({ file }) => [file, new Set([CREATION])]));
	let grew = true;
	function receive(file: string, key: string) {
		const received = seeds.get(file);
		if (!received || received.has(key)) return;
		received.add(key);
		grew = true;
	}
	while (grew) {
		grew = false;
		for (const { file, sourceFile } of sources) {
			const names = reachingNames(sourceFile, seeds.get(file) ?? new Set());
			const local = graph.bindings.get(file) ?? new Map<string, string>();
			function visit(node: ts.Node) {
				if (ts.isShorthandPropertyAssignment(node) || ts.isPropertyAssignment(node)) {
					const key = propertyKey(node.name);
					const value = ts.isPropertyAssignment(node) ? node.initializer : node.name;
					if (key && handsOn(value, names)) {
						for (const importer of graph.importers.get(file) ?? []) receive(importer, key);
						receive(file, key);
					}
				}
				if (ts.isJsxAttribute(node) && node.initializer) {
					const tag = node.parent.parent.tagName.getText();
					const key = propertyKey(node.name);
					if (key && /^[A-Z]/.test(tag) && handsOn(node.initializer, names)) {
						receive(local.get(tag) ?? file, key);
					}
				}
				ts.forEachChild(node, visit);
			}
			visit(sourceFile);
		}
	}
	return seeds;
}

/**
 * Callbacks that run without a user action and can start the creation: effects (including custom hooks
 * named like an effect) and query functions, anywhere in the sources.
 */
function findAutomaticCreationCallbacks(sources: ParsedSource[]): string[] {
	const seeds = collectCreationSeeds(sources);
	const found: string[] = [];
	for (const { file, sourceFile } of sources) {
		const names = reachingNames(sourceFile, seeds.get(file) ?? new Set());
		function visit(node: ts.Node) {
			if (ts.isCallExpression(node)) {
				const hook = calleeName(node.expression);
				const [callback] = node.arguments;
				if (hook && (EFFECT_HOOKS.has(hook) || CUSTOM_EFFECT_HOOK.test(hook)) && callback) {
					if (invokesAny(callback, names)) found.push(`${file}: ${hook}`);
				}
			}
			if (
				(ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node)) &&
				AUTOMATIC_CALLBACK_PROPERTIES.has(propertyKey(node.name) ?? "")
			) {
				const callback = ts.isPropertyAssignment(node) ? node.initializer : node.body;
				if (callback && (invokesAny(callback, names) || handsOn(callback, names))) {
					found.push(`${file}: ${propertyKey(node.name)}`);
				}
			}
			ts.forEachChild(node, visit);
		}
		visit(sourceFile);
	}
	return found;
}

function parseSources(entries: { file: string; source: string }[]): ParsedSource[] {
	return entries.map(({ file, source }) => ({
		file,
		sourceFile: ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
	}));
}

describe("email wallet creation ownership", () => {
	// Scanning every source file takes seconds, so it runs once while the suite is collected.
	const automaticCallbacks = findAutomaticCreationCallbacks(parseSources(SOURCES));

	it("registers every reference to the shared creation outside the hook that defines it", () => {
		const { [CREATION_HOOK]: definedIn, ...references } = collect(/\bensureEmailEmbeddedWallet\b/g);

		expect(definedIn).toBe(2);
		expect(references).toEqual(
			Object.fromEntries(Object.entries(CREATION_CALLERS).map(([file, caller]) => [file, caller.references])),
		);
	});

	it("keeps a single automatic creator, so a failed creation is never retried without the user", () => {
		const automatic = Object.entries(CREATION_CALLERS).filter(([, caller]) => caller.trigger === "automatic");

		expect(automatic.map(([file]) => file)).toEqual(["providers/email-embedded-wallet-provider.tsx"]);
		for (const caller of Object.values(CREATION_CALLERS)) expect(caller.reason).not.toBe("");
	});

	it("starts the creation without a user action only from the reviewed callbacks", () => {
		expect(
			[...automaticCallbacks].sort(),
			"A callback that runs without a user action (an effect or a query function) can now reach the creation, directly or through a function a hook returns or a prop. Only the automatic creator may start it on its own (docs/adr/0033-silent-email-wallet-creation.md); review the path, then update AUTOMATIC_CREATION_CALLBACKS.",
		).toEqual(Object.keys(AUTOMATIC_CREATION_CALLBACKS).sort());
		for (const reason of Object.values(AUTOMATIC_CREATION_CALLBACKS)) expect(reason).not.toBe("");
	});

	it("lets only the shared hook reach Privy's wallet creation", () => {
		expect(Object.keys(collect(/\buseCreateWallet\b/g))).toEqual([CREATION_HOOK]);
		expect(collect(/\bcreateWallet\b/g)).toEqual({ [CREATION_HOOK]: 3 });
	});

	it("starts the deposit dialog's creation only from its Retry control", () => {
		const depositModal = SOURCES.find(({ file }) => file === "components/trade/tradebox/deposit-modal.tsx")?.source;
		const retryHandler = depositModal?.slice(depositModal.indexOf("onRetryFundingAddress={"));

		expect(retryHandler?.slice(0, 120)).toContain("ensureEmailEmbeddedWallet()");
	});
});

describe("automatic creation scanner", () => {
	function scan(files: Record<string, string>): string[] {
		return findAutomaticCreationCallbacks(
			parseSources(Object.entries(files).map(([file, source]) => ({ file, source }))),
		);
	}

	const legalGate = [
		"function useLegalGateSession() {",
		"\tconst { ensureEmailEmbeddedWallet } = useEmailEmbeddedWallet();",
		"\tfunction retryWalletSetup() { void ensureEmailEmbeddedWallet(); }",
		"\treturn { ...session, retryWalletSetup };",
		"}",
		"export function useLegalGate() {",
		"\tconst { retryWalletSetup } = useLegalGateSession();",
		"\treturn { retry: retryWalletSetup };",
		"}",
	].join("\n");

	it.each([
		["a direct call", { "a.ts": "useEffect(() => { void ensureEmailEmbeddedWallet(); }, []);" }],
		[
			"a local function",
			{ "a.ts": "function retry() { void ensureEmailEmbeddedWallet(); }\nuseEffect(() => { retry(); }, []);" },
		],
		[
			"a callback chain",
			{
				"a.ts":
					"const retry = useCallback(() => ensureEmailEmbeddedWallet(), [ensureEmailEmbeddedWallet]);\nconst again = () => retry();\nReact.useLayoutEffect(() => again(), []);",
			},
		],
		[
			"a function another file's hook returns",
			{
				"hooks/gate.ts": legalGate,
				"components/panel.tsx":
					'import { useLegalGate } from "@/hooks/gate";\nconst { retry } = useLegalGate();\nuseEffect(() => { if (failed) retry(); }, [failed]);',
			},
		],
		[
			"a member call",
			{
				"hooks/session.ts":
					"export function useWalletSession() { const reconnectWallet = useCallback(async () => { await ensureEmailEmbeddedWallet(); }, []); return { reconnectWallet }; }",
				"page.tsx":
					'import { useWalletSession } from "./hooks/session";\nconst session = useWalletSession();\nuseInsertionEffect(() => { session.reconnectWallet(); });',
			},
		],
		[
			"a prop handed to a component in another file",
			{
				"hooks/gate.ts": legalGate,
				"components/dialog.tsx":
					'import { useLegalGate } from "@/hooks/gate";\nimport { SetupPanel } from "./panel";\nconst legalGate = useLegalGate();\nreturn <SetupPanel onRetry={legalGate.retry} />;',
				"components/panel.tsx":
					"export function SetupPanel({ onRetry: again }: Props) { useEffect(() => again(), []); }",
			},
		],
		["a custom effect hook", { "a.ts": "useBrowserLayoutEffect(() => { void ensureEmailEmbeddedWallet(); }, []);" }],
		[
			"a query function",
			{
				"hooks/gate.ts": legalGate,
				"a.ts":
					'import { useLegalGate } from "./hooks/gate";\nconst { retry } = useLegalGate();\nuseQuery({ queryKey: [1], queryFn: () => retry() });',
			},
		],
	])("finds %s", (_label, files) => {
		expect(scan(files)).toHaveLength(1);
	});

	it("ignores event handlers, dependency lists, DOM attributes and files that do not receive the member", () => {
		expect(
			scan({
				"hooks/gate.ts": legalGate,
				"a.tsx": [
					'import { useLegalGate } from "./hooks/gate";',
					"const { retry } = useLegalGate();",
					"useEffect(() => { log(); }, [retry, ensureEmailEmbeddedWallet]);",
					"const onClick = () => retry();",
					'return <button type="button" onClick={retry} />;',
				].join("\n"),
				"b.tsx": "const { retry } = useOtherThing();\nuseEffect(() => { retry(); }, []);",
			}),
		).toEqual([]);
	});
});
