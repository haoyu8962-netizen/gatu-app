import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const hlReactSourceRoot = resolve(process.cwd(), "../../packages/hl-react/src");
const transportProviderPath = resolve(hlReactSourceRoot, "transport-provider.tsx");
const terminalSourceRoot = resolve(process.cwd(), "src");

interface StaticImport {
	specifier: string;
	hasRuntimeEdge: boolean;
}

function hasRuntimeBindings(statement: ts.ImportDeclaration | ts.ExportDeclaration): boolean {
	if (ts.isExportDeclaration(statement)) {
		if (statement.isTypeOnly) return false;
		return (
			!statement.exportClause ||
			!ts.isNamedExports(statement.exportClause) ||
			statement.exportClause.elements.some((element) => !element.isTypeOnly)
		);
	}

	const clause = statement.importClause;
	if (!clause) return true;
	if (clause.isTypeOnly) return false;
	if (clause.name || !clause.namedBindings || ts.isNamespaceImport(clause.namedBindings)) return true;
	return clause.namedBindings.elements.some((element) => !element.isTypeOnly);
}

function readStaticImports(path: string): StaticImport[] {
	const source = readFileSync(path, "utf8");
	const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
	const imports: StaticImport[] = [];

	for (const statement of sourceFile.statements) {
		if (
			(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
			statement.moduleSpecifier &&
			ts.isStringLiteral(statement.moduleSpecifier)
		) {
			imports.push({
				specifier: statement.moduleSpecifier.text,
				hasRuntimeEdge: hasRuntimeBindings(statement),
			});
		}
	}

	return imports;
}

function resolveSourceImport(importer: string, specifier: string): string | null {
	if (!specifier.startsWith(".")) return null;

	const importedPath = resolve(dirname(importer), specifier);
	const candidates = [
		importedPath,
		`${importedPath}.ts`,
		`${importedPath}.tsx`,
		resolve(importedPath, "index.ts"),
		resolve(importedPath, "index.tsx"),
	];
	return (
		candidates.find((candidate) => {
			try {
				return statSync(candidate).isFile();
			} catch {
				return false;
			}
		}) ?? null
	);
}

function isWalletRuntimeImport(specifier: string): boolean {
	return (
		specifier === "wagmi" ||
		specifier.startsWith("wagmi/") ||
		specifier.startsWith("@wagmi/") ||
		specifier.startsWith("@privy-io/")
	);
}

function readRuntimeSources(root: string): string {
	return readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.name !== "tests")
		.map((entry) => {
			const path = resolve(root, entry.name);
			if (entry.isDirectory()) return readRuntimeSources(path);
			return [".ts", ".tsx"].includes(extname(entry.name)) ? readFileSync(path, "utf8") : "";
		})
		.join("\n");
}

describe("Hyperliquid transport dependency boundary", () => {
	it("keeps wagmi and Privy out of the transport provider static import closure", () => {
		const pending = [transportProviderPath];
		const visited = new Set<string>();
		const forbiddenImports: string[] = [];

		while (pending.length > 0) {
			const path = pending.pop();
			if (!path || visited.has(path)) continue;
			visited.add(path);

			for (const { specifier, hasRuntimeEdge } of readStaticImports(path)) {
				if (isWalletRuntimeImport(specifier)) {
					forbiddenImports.push(`${relative(hlReactSourceRoot, path)} -> ${specifier}`);
				}
				if (!hasRuntimeEdge) continue;
				const dependency = resolveSourceImport(path, specifier);
				if (dependency?.startsWith(hlReactSourceRoot)) pending.push(dependency);
			}
		}

		expect([...visited].map((path) => relative(hlReactSourceRoot, path))).toEqual(
			expect.arrayContaining(["transport-provider.tsx", "clients.ts", "create-config.ts", "store.ts"]),
		);
		expect(forbiddenImports).toEqual([]);
	});

	it("keeps one application transport/store owner and one public market subscription group", () => {
		const terminalRuntimeSource = readRuntimeSources(terminalSourceRoot);
		const transportProviderSource = readFileSync(transportProviderPath, "utf8");

		expect(terminalRuntimeSource.match(/<HyperliquidProvider\b/g)).toHaveLength(1);
		expect(terminalRuntimeSource.match(/<MarketsProvider\b/g)).toHaveLength(1);
		expect(terminalRuntimeSource.match(/<MarketsInfoProvider\b/g)).toHaveLength(1);
		expect(terminalRuntimeSource.match(/<HyperliquidTransportProvider\b/g)).toBeNull();
		expect(terminalRuntimeSource.match(/createHyperliquidStore\(/g)).toBeNull();
		expect(transportProviderSource.match(/createHyperliquidStore\(/g)).toHaveLength(1);
		expect(transportProviderSource.match(/getWsTransport\(isTestnet\)/g)).toHaveLength(1);
	});
});
