#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const skillName = "hyperliquid-api";

function parseArgs(argv) {
	const args = { force: false, root: path.resolve(process.cwd(), ".agents/skills") };

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--force") {
			args.force = true;
			continue;
		}
		if (arg === "--root") {
			const value = argv[i + 1];
			if (!value) {
				throw new Error("Missing value for --root");
			}
			args.root = path.resolve(process.cwd(), value);
			i += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	return args;
}

function copyItem(sourceName, destinationRoot) {
	const source = path.join(packageRoot, sourceName);
	const destination = path.join(destinationRoot, sourceName);
	cpSync(source, destination, { recursive: true });
}

try {
	const args = parseArgs(process.argv.slice(2));
	const destination = path.join(args.root, skillName);

	if (existsSync(destination)) {
		if (!args.force) {
			throw new Error(`Destination already exists: ${destination}. Re-run with --force to replace it.`);
		}
		rmSync(destination, { recursive: true, force: true });
	}

	mkdirSync(destination, { recursive: true });
	copyItem("SKILL.md", destination);
	copyItem("references", destination);
	copyItem("evals", destination);

	process.stdout.write(`Installed skill to ${destination}\n`);
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
}
