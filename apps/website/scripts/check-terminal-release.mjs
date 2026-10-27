#!/usr/bin/env node
// Release precondition for the website (deploy/website/README.md, 发布前提 7): the terminal that the site
// links into must already carry what the site relies on. Reads the live build-meta.json, then the terminal
// config at that commit from the local Git objects (run `git fetch origin` first), and fails when
//   - a dex in the committed market snapshot has no documentation link in hip3-deployers.ts (plan T1), or
//   - geo.ts still blocks a country that legal/terms.md §2.2 does not name (ADR 0042: JP).
// Read-only: it writes nothing and changes no setting.
//
//   pnpm --filter @sairn/website terminal:check

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_URL } from "../src/config/brand.ts";

const WEBSITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = JSON.parse(readFileSync(resolve(WEBSITE_ROOT, "src/data/market-structure.json"), "utf8"));
const COUNTRIES_NOT_IN_TERMS = ["JP"];
const TERMS_COUNTRIES_PENDING_IN_TERMINAL = { MM: "plan §10 T4 adds Myanmar to TRADE_RESTRICTED_COUNTRIES" };

function showAt(commit, path) {
	return execFileSync("git", ["show", `${commit}:${path}`], { cwd: WEBSITE_ROOT, encoding: "utf8" });
}

export function documentedDexes(source) {
	const table = /HIP3_DEPLOYER_DOCUMENTATION_URLS[^=]*=\s*\{([^}]*)\}/.exec(source)?.[1];
	if (table === undefined) return null;
	return [...table.matchAll(/^\s*["']?([a-z0-9]+)["']?\s*:\s*"https:\/\/[^"]+"/gm)].map((match) => match[1]);
}

export function restrictedCountries(source) {
	const list = /TRADE_RESTRICTED_COUNTRIES[^=]*=\s*\[([^\]]*)\]/.exec(source)?.[1];
	if (list === undefined) return null;
	return [...list.matchAll(/"([A-Z]{2})"/g)].map((match) => match[1]);
}

async function main() {
	const problems = [];
	const response = await fetch(`${APP_URL}/build-meta.json`, { cache: "no-store" });
	if (!response.ok) throw new Error(`${APP_URL}/build-meta.json answered ${response.status}`);
	const meta = await response.json();
	if (!/^[0-9a-f]{40}$/.test(meta.commit ?? "")) throw new Error(`build-meta.json has no full commit: ${meta.commit}`);
	console.log(`live terminal: release ${meta.release}, commit ${meta.commit}`);
	try {
		execFileSync("git", ["cat-file", "-e", `${meta.commit}^{commit}`], { cwd: WEBSITE_ROOT, stdio: "ignore" });
	} catch {
		throw new Error(`commit ${meta.commit} is not in the local repository; run git fetch origin and retry`);
	}

	const documented = documentedDexes(showAt(meta.commit, "apps/terminal/src/config/hip3-deployers.ts"));
	if (!documented) problems.push("could not read HIP3_DEPLOYER_DOCUMENTATION_URLS at the live commit");
	else {
		for (const dex of SNAPSHOT.dexes.filter((entry) => entry.dex !== "")) {
			if (!documented.includes(dex.dex)) {
				problems.push(`the live terminal has no documentation link for dex "${dex.dex}" (${dex.fullName}); release T1 first`);
			}
		}
	}

	const countries = restrictedCountries(showAt(meta.commit, "apps/terminal/src/config/geo.ts"));
	if (!countries) problems.push("could not read TRADE_RESTRICTED_COUNTRIES at the live commit");
	else {
		for (const country of COUNTRIES_NOT_IN_TERMS) {
			if (countries.includes(country)) {
				problems.push(`the live terminal still blocks ${country}, which Terms §2.2 does not name; release ADR 0042 first`);
			}
		}
		for (const [country, note] of Object.entries(TERMS_COUNTRIES_PENDING_IN_TERMINAL)) {
			if (!countries.includes(country)) console.warn(`warning: the live terminal does not block ${country} yet (${note})`);
		}
	}

	if (problems.length > 0) {
		console.error(`terminal:check found ${problems.length} problem(s); do not publish the website:`);
		for (const problem of problems) console.error(`  - ${problem}`);
		process.exitCode = 1;
		return;
	}
	console.log("terminal:check passed");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
