import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT_PATH = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"validate-mobile-phone-access-device-validation.js",
);
const RD_IDS = ["RD-1", "RD-2", "RD-3", "RD-4", "RD-5", "RD-6", "RD-7", "RD-8"];
const TW_IDS = ["TW-1", "TW-2", "TW-3"];
const VALIDATION_IDS = [...RD_IDS, ...TW_IDS];
const EXPECTED_MATRIX_ROWS = {
	"RD-1": {
		deviceAndBrowser: "iOS Safari via native Camera app",
		requiredResult: "Phone-access QR opens the route and shows `Phone link loaded`.",
	},
	"RD-2": {
		deviceAndBrowser: "iOS Safari",
		requiredResult: "Pairing code can be typed and pasted before wallet connection.",
	},
	"RD-3": {
		deviceAndBrowser: "iOS Safari plus target wallet",
		requiredResult: "Wallet handoff returns to the route without losing loaded link or code.",
	},
	"RD-4": {
		deviceAndBrowser: "iOS Chrome",
		requiredResult: "Full phone-access flow works from scan/open through successful import.",
	},
	"RD-5": {
		deviceAndBrowser: "Android Chrome",
		requiredResult: "Full phone-access flow works from scan/open through successful import.",
	},
	"RD-6": {
		deviceAndBrowser: "iOS wallet in-app browser, if supported",
		requiredResult: "Full phone-access flow works or unsupported behavior is documented.",
	},
	"RD-7": {
		deviceAndBrowser: "Physical phone camera in WalletConnect scanner",
		requiredResult: "A real `wc:` desktop QR scans, pairs, and connects.",
	},
	"RD-8": {
		deviceAndBrowser: "Physical phone WalletConnect scanner",
		requiredResult: "Phone-access and unsupported QRs show clear wrong-QR feedback.",
	},
	"TW-1": {
		deviceAndBrowser: "Coinbase Wallet",
		requiredResult: "Wallet handoff returns to the route without clearing the loaded phone link or typed code.",
	},
	"TW-2": {
		deviceAndBrowser: "MetaMask",
		requiredResult: "Wallet handoff returns to the route without clearing the loaded phone link or typed code.",
	},
	"TW-3": {
		deviceAndBrowser: "WalletConnect-compatible wallet used by the product team",
		requiredResult:
			"Same-phone WalletConnect deep-link handoff remains available and returns without clearing the loaded phone link or typed code.",
	},
};
const EXPECTED_REFERENCES = {
	"RD-1": { testCase: "TC-1", acceptance: "Acceptance 1" },
	"RD-2": { testCase: "TC-2", acceptance: "Acceptance 2" },
	"RD-3": { testCase: "TC-3", acceptance: "Acceptance 3" },
	"RD-4": { testCase: "TC-4", acceptance: "Acceptance 4" },
	"RD-5": { testCase: "TC-4", acceptance: "Acceptance 4" },
	"RD-6": { testCase: "TC-3", acceptance: "Acceptance 3" },
	"RD-7": { testCase: "TC-6", acceptance: "Acceptance 6" },
	"RD-8": { testCase: "TC-6", acceptance: "Acceptance 5" },
	"TW-1": { testCase: "TC-3", acceptance: "Acceptance 3" },
	"TW-2": { testCase: "TC-3", acceptance: "Acceptance 3" },
	"TW-3": { testCase: "TC-3", acceptance: "Acceptance 3, Acceptance 7" },
};
const EXPECTED_WALLET_CONNECTORS = {
	"TW-1": "Coinbase Wallet",
	"TW-2": "MetaMask",
	"TW-3": "WalletConnect",
};

function writeFixture(content) {
	const directory = mkdtempSync(join(tmpdir(), "mobile-device-validation-"));
	const filePath = join(directory, "device-validation.md");
	writeFileSync(filePath, content);
	return filePath;
}

function runValidator(filePath, extraArgs = []) {
	return spawnSync(process.execPath, [SCRIPT_PATH, "--file", filePath, ...extraArgs], {
		encoding: "utf8",
	});
}

function runScript(extraArgs = []) {
	return spawnSync(process.execPath, [SCRIPT_PATH, ...extraArgs], {
		encoding: "utf8",
	});
}

function createRows(ids, status) {
	return ids
		.map(
			(id) => {
				const row = EXPECTED_MATRIX_ROWS[id];
				const evidence = status === "Pass" ? `${id} screenshot artifact and notes` : "";
				return `| ${id} | ${row.deviceAndBrowser} | ${row.requiredResult} | ${status} | ${evidence} |`;
			},
		)
		.join("\n");
}

function createEvidenceSections() {
	return VALIDATION_IDS.map(
		(id) => {
			const walletConnector = EXPECTED_WALLET_CONNECTORS[id] ?? "Test Wallet";
			return `### ${id} Evidence

| Field | Value |
| --- | --- |
| Tester | Test Engineer |
| Date and time | 2026-05-25T12:00:00Z |
| Git commit | abc1234 |
| App origin | https://preview.example |
| Environment | Testnet |
| Device model | Test Device |
| OS version | Test OS |
| Browser or wallet app | Test Browser |
| Wallet connector | ${walletConnector} |
| Related test case | ${EXPECTED_REFERENCES[id].testCase} |
| Related PRD acceptance | ${EXPECTED_REFERENCES[id].acceptance} |
| Result | pass |
| Evidence | ${id} screenshot artifact and detailed notes |

Notes:
- Observed route or scanner state: ${id} expected state was visible.
- Wallet handoff behavior: ${id} wallet handoff was observed or not applicable with reason.
- Temporary draft cleanup or persistence: ${id} draft behavior matched the pass criteria.
- Screenshot or recording reference: ${id} screenshot artifact captured.
`;
		},
	).join("\n");
}

function createValidationDoc({ status = "Pass", includeEvidence = true } = {}) {
	return `# Mobile Phone Access Device Validation

## Required Evidence

This template includes a sample row outside the required matrix:

| RD-X | Template row | Ignored outside matrix | Not run | |

## Required Device Matrix

| ID | Device and browser | Required result | Status | Evidence |
| --- | --- | --- | --- | --- |
${createRows(RD_IDS, status)}

## Target Wallet Coverage

| ID | Wallet connector | Required result | Status | Evidence |
| --- | --- | --- | --- | --- |
${createRows(TW_IDS, status)}

${includeEvidence ? createEvidenceSections() : ""}
`;
}

test("passes when every validation row is Pass with evidence", () => {
	const filePath = writeFixture(createValidationDoc());
	const result = runValidator(filePath);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Device validation is complete/);
});

test("fails strict mode and passes allow-incomplete mode when rows are Not run", () => {
	const filePath = writeFixture(createValidationDoc({ status: "Not run", includeEvidence: false }));

	const strictResult = runValidator(filePath);
	assert.equal(strictResult.status, 1);
	assert.match(strictResult.stderr, /RD-1 is Not run/);

	const relaxedResult = runValidator(filePath, ["--allow-incomplete"]);
	assert.equal(relaxedResult.status, 0, relaxedResult.stderr);
	assert.match(relaxedResult.stdout, /11 validation rows are still incomplete/);
});

test("fails when a passing RD row lacks an evidence section", () => {
	const filePath = writeFixture(createValidationDoc({ includeEvidence: false }));
	const result = runValidator(filePath);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /RD-1 is Pass but is missing a "### RD-1 Evidence" section/);
});

test("fails when copied template placeholders remain in a passing evidence section", () => {
	const content = createValidationDoc().replace("| Related test case | TC-1 |", "| Related test case | TC-N |");
	const filePath = writeFixture(content);
	const result = runValidator(filePath);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /RD-1 evidence "Related test case" still has placeholder value "TC-N"/);
});

test("fails when generated placeholder values remain in a passing evidence section", () => {
	const content = createValidationDoc()
		.replace("| Tester | Test Engineer |", "| Tester | <tester name> |")
		.replace("| Result | pass |", "| Result | <Pass or Fail> |");
	const filePath = writeFixture(content);
	const result = runValidator(filePath);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /RD-1 evidence "Tester" still has placeholder value "<tester name>"/);
	assert.match(result.stderr, /RD-1 evidence "Result" still has placeholder value "<Pass or Fail>"/);
});

test("fails when a passing evidence section points at the wrong test case or acceptance", () => {
	const content = createValidationDoc()
		.replace("| Related test case | TC-4 |", "| Related test case | TC-2 |")
		.replace("| Related PRD acceptance | Acceptance 4 |", "| Related PRD acceptance | Acceptance 1 |");
	const filePath = writeFixture(content);
	const result = runValidator(filePath);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /RD-4 evidence "Related test case" must include TC-4/);
	assert.match(result.stderr, /RD-4 evidence "Related PRD acceptance" must include Acceptance 4/);
});

test("fails when WalletConnect target-wallet evidence does not reference acceptance 7", () => {
	const content = createValidationDoc().replace(
		"| Related PRD acceptance | Acceptance 3, Acceptance 7 |",
		"| Related PRD acceptance | Acceptance 3 |",
	);
	const filePath = writeFixture(content);
	const result = runValidator(filePath);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /TW-3 evidence "Related PRD acceptance" must include Acceptance 7/);
});

test("fails when target-wallet rows or evidence do not name the expected wallet", () => {
	const content = createValidationDoc()
		.replace("| TW-1 | Coinbase Wallet |", "| TW-1 | Generic wallet |")
		.replace("| Wallet connector | Coinbase Wallet |", "| Wallet connector | Generic wallet |");
	const filePath = writeFixture(content);
	const result = runValidator(filePath);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /TW-1 Wallet connector cell must include Coinbase Wallet/);
	assert.match(result.stderr, /TW-1 evidence "Wallet connector" must include Coinbase Wallet/);
});

test("fails when required matrix row wording drifts", () => {
	const content = createValidationDoc()
		.replace("| RD-1 | iOS Safari via native Camera app |", "| RD-1 | Desktop Chrome |")
		.replace(
			"| Desktop Chrome | Phone-access QR opens the route and shows `Phone link loaded`. |",
			"| Desktop Chrome | Opens a generic page. |",
		);
	const filePath = writeFixture(content);
	const result = runValidator(filePath);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /RD-1 device\/browser cell must be "iOS Safari via native Camera app"/);
	assert.match(result.stderr, /RD-1 required-result cell must be "Phone-access QR opens the route/);
});

test("fails when matrix rows or evidence sections are duplicated", () => {
	const rd1Row = `| RD-1 | ${EXPECTED_MATRIX_ROWS["RD-1"].deviceAndBrowser} | ${EXPECTED_MATRIX_ROWS["RD-1"].requiredResult} | Pass | RD-1 screenshot artifact and notes |`;
	const content = createValidationDoc()
		.replace(rd1Row, `${rd1Row}\n${rd1Row}`)
		.replace("### RD-2 Evidence", "### RD-1 Evidence");
	const filePath = writeFixture(content);
	const result = runValidator(filePath);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /RD-1 appears 2 times in Required Device Matrix/);
	assert.match(result.stderr, /RD-1 has 2 evidence sections/);
});

test("fails when evidence table fields are duplicated or unexpected", () => {
	const content = createValidationDoc().replace(
		"| Tester | Test Engineer |",
		"| Tester | Test Engineer |\n| Tester | Other Engineer |\n| Extra field | Surprise |",
	);
	const filePath = writeFixture(content);
	const result = runValidator(filePath);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /RD-1 evidence field "Tester" appears 2 times/);
	assert.match(result.stderr, /RD-1 evidence has unexpected field "Extra field"/);
});

test("fails when evidence is too thin or does not name an artifact type", () => {
	const content = createValidationDoc().replace(
		"| Evidence | RD-1 screenshot artifact and detailed notes |",
		"| Evidence | checked |",
	);
	const filePath = writeFixture(content);
	const result = runValidator(filePath);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /RD-1 evidence "Evidence" must include a concrete screenshot/);
	assert.match(result.stderr, /RD-1 evidence "Evidence" must mention a screenshot/);
});

test("fails when a passing matrix evidence cell is too thin", () => {
	const row = EXPECTED_MATRIX_ROWS["RD-1"];
	const content = createValidationDoc().replace(
		`| RD-1 | ${row.deviceAndBrowser} | ${row.requiredResult} | Pass | RD-1 screenshot artifact and notes |`,
		`| RD-1 | ${row.deviceAndBrowser} | ${row.requiredResult} | Pass | link |`,
	);
	const filePath = writeFixture(content);
	const result = runValidator(filePath);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /RD-1 matrix Evidence cell must include a concrete screenshot/);
	assert.match(result.stderr, /RD-1 matrix Evidence cell must mention a screenshot/);
});

test("fails when passing evidence leaves required note bullets empty", () => {
	const content = createValidationDoc().replace(
		"- Wallet handoff behavior: RD-1 wallet handoff was observed or not applicable with reason.",
		"- Wallet handoff behavior:",
	);
	const filePath = writeFixture(content);
	const result = runValidator(filePath);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /RD-1 evidence notes must fill "Wallet handoff behavior"/);
});

test("fails when N/A notes do not include a reason", () => {
	const content = createValidationDoc().replace(
		"- Wallet handoff behavior: RD-1 wallet handoff was observed or not applicable with reason.",
		"- Wallet handoff behavior: N/A",
	);
	const filePath = writeFixture(content);
	const result = runValidator(filePath);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /RD-1 evidence notes must give a reason for "Wallet handoff behavior" instead of "N\/A"/);
	assert.match(result.stderr, /RD-1 evidence notes using N\/A must use "N\/A - <reason>"/);
});

test("fails when passing evidence is missing required note bullets", () => {
	const content = createValidationDoc().replace(
		"- Screenshot or recording reference: RD-1 screenshot artifact captured.",
		"",
	);
	const filePath = writeFixture(content);
	const result = runValidator(filePath);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /RD-1 evidence notes are missing "Screenshot or recording reference"/);
});

test("fails when commit, date, or app origin evidence has the wrong shape", () => {
	const content = createValidationDoc()
		.replace("| Git commit | abc1234 |", "| Git commit | main |")
		.replace("| Date and time | 2026-05-25T12:00:00Z |", "| Date and time | eventually |")
		.replace("| App origin | https://preview.example |", "| App origin | https://preview.example/mobile-agent-sync |");
	const filePath = writeFixture(content);
	const result = runValidator(filePath);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /RD-1 evidence "Git commit" must be a 7-40 character commit hash/);
	assert.match(result.stderr, /RD-1 evidence "Date and time" must be parseable by Date\.parse/);
	assert.match(result.stderr, /RD-1 evidence "App origin" must be an HTTP\(S\) origin without a path/);
});

test("fails when the required matrix section is missing", () => {
	const filePath = writeFixture("# Mobile Phone Access Device Validation\n\n| RD-1 | Not matrix | Not matrix | Pass | link |\n");
	const result = runValidator(filePath, ["--allow-incomplete"]);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Required Device Matrix section is missing/);
});

test("fails when the target wallet coverage section is missing", () => {
	const filePath = writeFixture(`# Mobile Phone Access Device Validation

## Required Device Matrix

| ID | Device and browser | Required result | Status | Evidence |
| --- | --- | --- | --- | --- |
${createRows(RD_IDS, "Not run")}
`);
	const result = runValidator(filePath, ["--allow-incomplete"]);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Target Wallet Coverage section is missing/);
});

test("prints evidence templates for all rows or one requested row", () => {
	const allRows = runScript(["--print-template"]);
	assert.equal(allRows.status, 0, allRows.stderr);
	assert.match(allRows.stdout, /### RD-1 Evidence/);
	assert.match(allRows.stdout, /\| Related test case \| TC-1 \|/);
	assert.match(allRows.stdout, /\| Result \| <Pass or Fail> \|/);
	assert.match(allRows.stdout, /### TW-3 Evidence/);
	assert.match(allRows.stdout, /\| Wallet connector \| WalletConnect \|/);
	assert.match(allRows.stdout, /\| Related PRD acceptance \| Acceptance 3, Acceptance 7 \|/);

	const oneRow = runScript(["--print-template", "--id", "RD-2"]);
	assert.equal(oneRow.status, 0, oneRow.stderr);
	assert.match(oneRow.stdout, /### RD-2 Evidence/);
	assert.doesNotMatch(oneRow.stdout, /### RD-1 Evidence/);
});

test("initializes missing evidence sections without duplicating them", () => {
	const filePath = writeFixture(`${createValidationDoc({ status: "Not run", includeEvidence: false })}
## Post-Run Cleanup
`);

	const result = runScript(["--file", filePath, "--init-missing"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Inserted 11 evidence sections/);
	let content = readFileSync(filePath, "utf8");
	assert.match(content, /## Evidence Sections/);
	assert.match(content, /### RD-1 Evidence/);
	assert.match(content, /### TW-3 Evidence/);
	assert.match(content, /## Post-Run Cleanup/);
	assert.equal((content.match(/^### RD-1 Evidence$/gm) ?? []).length, 1);

	const relaxedResult = runValidator(filePath, ["--allow-incomplete"]);
	assert.equal(relaxedResult.status, 0, relaxedResult.stderr);

	const rerun = runScript(["--file", filePath, "--init-missing"]);
	assert.equal(rerun.status, 0, rerun.stderr);
	assert.match(rerun.stdout, /No missing evidence sections/);
	content = readFileSync(filePath, "utf8");
	assert.equal((content.match(/^### RD-1 Evidence$/gm) ?? []).length, 1);
});
