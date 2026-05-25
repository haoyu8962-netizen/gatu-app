#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const DEFAULT_FILE = "docs/mobile-phone-access-device-validation.md";
const EVIDENCE_SECTIONS_HEADING = "## Evidence Sections";
const POST_RUN_CLEANUP_HEADING = "## Post-Run Cleanup";
const EXPECTED_RD_IDS = ["RD-1", "RD-2", "RD-3", "RD-4", "RD-5", "RD-6", "RD-7", "RD-8"];
const EXPECTED_TW_IDS = ["TW-1", "TW-2", "TW-3"];
const EXPECTED_VALIDATION_IDS = [...EXPECTED_RD_IDS, ...EXPECTED_TW_IDS];
const VALID_STATUSES = new Set(["Not run", "Pass", "Fail"]);
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
const REQUIRED_EVIDENCE_FIELDS = [
	"Tester",
	"Date and time",
	"Git commit",
	"App origin",
	"Environment",
	"Device model",
	"OS version",
	"Browser or wallet app",
	"Wallet connector",
	"Related test case",
	"Related PRD acceptance",
	"Result",
	"Evidence",
];
const REQUIRED_EVIDENCE_FIELD_SET = new Set(REQUIRED_EVIDENCE_FIELDS);
const EXPECTED_EVIDENCE_REFERENCES = {
	"RD-1": { testCases: ["TC-1"], acceptances: ["Acceptance 1"] },
	"RD-2": { testCases: ["TC-2"], acceptances: ["Acceptance 2"] },
	"RD-3": { testCases: ["TC-3"], acceptances: ["Acceptance 3"] },
	"RD-4": { testCases: ["TC-4"], acceptances: ["Acceptance 4"] },
	"RD-5": { testCases: ["TC-4"], acceptances: ["Acceptance 4"] },
	"RD-6": { testCases: ["TC-3"], acceptances: ["Acceptance 3"] },
	"RD-7": { testCases: ["TC-6"], acceptances: ["Acceptance 6"] },
	"RD-8": { testCases: ["TC-6"], acceptances: ["Acceptance 5"] },
	"TW-1": { testCases: ["TC-3"], acceptances: ["Acceptance 3"] },
	"TW-2": { testCases: ["TC-3"], acceptances: ["Acceptance 3"] },
	"TW-3": { testCases: ["TC-3"], acceptances: ["Acceptance 3", "Acceptance 7"] },
};
const EXPECTED_WALLET_CONNECTORS = {
	"TW-1": "Coinbase Wallet",
	"TW-2": "MetaMask",
	"TW-3": "WalletConnect",
};
const REQUIRED_NOTE_LABELS = [
	"Observed route or scanner state",
	"Wallet handoff behavior",
	"Temporary draft cleanup or persistence",
	"Screenshot or recording reference",
];
const PLACEHOLDER_VALUES = new Set([
	"TC-N",
	"Acceptance N",
	"Pass or fail",
	"Screenshot, screen recording, or detailed notes",
]);
const EMPTY_NOTE_VALUES = new Set(["n/a", "na", "none", "not applicable", "todo", "tbd"]);
const PLACEHOLDER_FIELD_VALUES = new Set(["todo", "tbd", "n/a", "na", "none", "fill me", "to be filled"]);

function getArgValue(name, fallback) {
	const index = process.argv.indexOf(name);
	return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function parseTableRow(line, prefix) {
	const trimmed = line.trim();
	if (!trimmed.startsWith(`| ${prefix}`)) return null;
	const cells = trimmed
		.split("|")
		.slice(1, -1)
		.map((cell) => cell.trim());
	if (cells.length !== 5) return null;
	const [id, deviceAndBrowser, requiredResult, status, evidence] = cells;
	return { id, deviceAndBrowser, requiredResult, status, evidence };
}

function getMarkdownSection(content, heading) {
	const startIndex = content.indexOf(heading);
	if (startIndex === -1) return null;
	const rest = content.slice(startIndex + heading.length);
	const nextHeadingIndex = rest.search(/\n## /);
	return nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex);
}

function parseFieldTable(section) {
	const fields = new Map();
	const fieldCounts = new Map();
	const unexpectedFields = [];
	for (const line of section.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("|") || trimmed.includes("---")) continue;
		const cells = trimmed
			.split("|")
			.slice(1, -1)
			.map((cell) => cell.trim());
		if (cells.length !== 2 || cells[0] === "Field") continue;
		const [field, value] = cells;
		fields.set(field, value);
		fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
		if (!REQUIRED_EVIDENCE_FIELD_SET.has(field)) {
			unexpectedFields.push(field);
		}
	}
	return { fields, fieldCounts, unexpectedFields };
}

function validateEvidenceField(id, field, value, problems) {
	if (isPlaceholderValue(value)) {
		problems.push(`${id} evidence "${field}" still has placeholder value "${value}".`);
		return;
	}
	if (field === "Git commit" && !/^[0-9a-f]{7,40}$/i.test(value)) {
		problems.push(`${id} evidence "Git commit" must be a 7-40 character commit hash.`);
	}
	if (field === "Date and time" && Number.isNaN(Date.parse(value))) {
		problems.push(`${id} evidence "Date and time" must be parseable by Date.parse.`);
	}
	if (field === "Related test case") {
		const testCases = value.match(/\bTC-\d+\b/g) ?? [];
		if (testCases.length === 0) {
			problems.push(`${id} evidence "Related test case" must include a TC-N reference.`);
			return;
		}
		const expectedTestCases = EXPECTED_EVIDENCE_REFERENCES[id]?.testCases ?? [];
		for (const expectedTestCase of expectedTestCases) {
			if (!testCases.includes(expectedTestCase)) {
				problems.push(`${id} evidence "Related test case" must include ${expectedTestCase}.`);
			}
		}
	}
	if (field === "Related PRD acceptance") {
		const acceptances = value.match(/\bAcceptance \d+\b/g) ?? [];
		if (acceptances.length === 0) {
			problems.push(`${id} evidence "Related PRD acceptance" must include an Acceptance N reference.`);
			return;
		}
		const expectedAcceptances = EXPECTED_EVIDENCE_REFERENCES[id]?.acceptances ?? [];
		for (const expectedAcceptance of expectedAcceptances) {
			if (!acceptances.includes(expectedAcceptance)) {
				problems.push(`${id} evidence "Related PRD acceptance" must include ${expectedAcceptance}.`);
			}
		}
	}
	if (field === "Environment" && value !== "Mainnet" && value !== "Testnet") {
		problems.push(`${id} evidence "Environment" must be Mainnet or Testnet.`);
	}
	if (field === "App origin") {
		try {
			const url = new URL(value);
			const normalizedValue = value.endsWith("/") ? value.slice(0, -1) : value;
			if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== normalizedValue) {
				problems.push(`${id} evidence "App origin" must be an HTTP(S) origin without a path.`);
			}
		} catch {
			problems.push(`${id} evidence "App origin" must be an HTTP(S) origin without a path.`);
		}
	}
	if (field === "Evidence") {
		validateEvidenceReference(id, `evidence "${field}"`, value, problems);
	}
	if (field === "Wallet connector") {
		const expectedConnector = EXPECTED_WALLET_CONNECTORS[id];
		if (expectedConnector && !value.toLowerCase().includes(expectedConnector.toLowerCase())) {
			problems.push(`${id} evidence "Wallet connector" must include ${expectedConnector}.`);
		}
	}
}

function isPlaceholderValue(value) {
	const trimmed = value.trim();
	if (PLACEHOLDER_VALUES.has(trimmed)) return true;
	if (/^<[^>]+>$/.test(trimmed)) return true;
	return PLACEHOLDER_FIELD_VALUES.has(trimmed.toLowerCase());
}

function validateEvidenceReference(id, label, value, problems) {
	if (value.trim().length < 20) {
		problems.push(`${id} ${label} must include a concrete screenshot, recording, artifact, or detailed note reference.`);
	}
	if (!/\b(screenshot|recording|video|artifact|attachment|notes?|https?:\/\/)\b/i.test(value)) {
		problems.push(`${id} ${label} must mention a screenshot, recording, artifact, link, or notes.`);
	}
}

function formatExpectedReferences(id, type) {
	const references = EXPECTED_EVIDENCE_REFERENCES[id]?.[type] ?? [];
	return references.join(", ");
}

function getEvidenceTemplateIds() {
	const requestedId = getArgValue("--id", "");
	if (!requestedId) return EXPECTED_VALIDATION_IDS;
	if (!EXPECTED_VALIDATION_IDS.includes(requestedId)) {
		console.error(`Unknown validation row "${requestedId}". Expected one of ${EXPECTED_VALIDATION_IDS.join(", ")}.`);
		process.exit(1);
	}
	return [requestedId];
}

function renderEvidenceTemplate(id) {
	const walletConnector = EXPECTED_WALLET_CONNECTORS[id] ?? "<wallet connector or N/A - reason>";
	return `### ${id} Evidence

| Field | Value |
| --- | --- |
| Tester | <tester name> |
| Date and time | <YYYY-MM-DDTHH:mm:ssZ> |
| Git commit | <7-40 character commit hash> |
| App origin | <https://preview.example> |
| Environment | Testnet |
| Device model | <device model> |
| OS version | <OS version> |
| Browser or wallet app | <browser or wallet app> |
| Wallet connector | ${walletConnector} |
| Related test case | ${formatExpectedReferences(id, "testCases")} |
| Related PRD acceptance | ${formatExpectedReferences(id, "acceptances")} |
| Result | <Pass or Fail> |
| Evidence | <screenshot, recording, artifact link, or detailed notes reference> |

Notes:
- Observed route or scanner state: <what was visible on the phone>
- Wallet handoff behavior: <what happened when leaving and returning to the browser>
- Temporary draft cleanup or persistence: <what persisted or cleared>
- Screenshot or recording reference: <artifact name or URL>
`;
}

function printEvidenceTemplate() {
	console.log(getEvidenceTemplateIds().map(renderEvidenceTemplate).join("\n"));
}

function getEvidenceSectionInsertion(content) {
	const existingHeadingIndex = content.indexOf(`\n${EVIDENCE_SECTIONS_HEADING}\n`);
	if (existingHeadingIndex !== -1) {
		const sectionStart = existingHeadingIndex + 1;
		const rest = content.slice(sectionStart + EVIDENCE_SECTIONS_HEADING.length);
		const nextHeadingIndex = rest.search(/\n## /);
		const insertIndex =
			nextHeadingIndex === -1
				? content.length
				: sectionStart + EVIDENCE_SECTIONS_HEADING.length + nextHeadingIndex;
		return { insertIndex, needsHeading: false };
	}

	const postRunIndex = content.indexOf(`\n${POST_RUN_CLEANUP_HEADING}`);
	return {
		insertIndex: postRunIndex === -1 ? content.length : postRunIndex,
		needsHeading: true,
	};
}

function initMissingEvidenceSections() {
	const filePath = getArgValue("--file", DEFAULT_FILE);
	const content = readFileSync(filePath, "utf8");
	const ids = getEvidenceTemplateIds();
	const duplicateIds = ids.filter((id) => countEvidenceSections(content, id) > 1);
	if (duplicateIds.length > 0) {
		console.error(`Cannot initialize evidence sections because duplicates already exist: ${duplicateIds.join(", ")}.`);
		process.exit(1);
	}
	const missingIds = ids.filter((id) => countEvidenceSections(content, id) === 0);
	if (missingIds.length === 0) {
		console.log(`No missing evidence sections in ${filePath}.`);
		return;
	}

	const { insertIndex, needsHeading } = getEvidenceSectionInsertion(content);
	const templates = missingIds.map(renderEvidenceTemplate).join("\n");
	const insertedBlock = needsHeading
		? `\n\n${EVIDENCE_SECTIONS_HEADING}\n\n${templates}\n`
		: `\n${templates}\n`;
	const nextContent = `${content.slice(0, insertIndex).trimEnd()}${insertedBlock}${content.slice(insertIndex)}`;
	writeFileSync(filePath, nextContent);
	console.log(`Inserted ${missingIds.length} evidence sections into ${filePath}: ${missingIds.join(", ")}.`);
}

function getEvidenceSection(content, id) {
	const heading = `### ${id} Evidence`;
	const startIndex = content.indexOf(heading);
	if (startIndex === -1) return null;
	const rest = content.slice(startIndex + heading.length);
	const nextHeadingIndex = rest.search(/\n### /);
	return nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex);
}

function countEvidenceSections(content, id) {
	const matches = content.match(new RegExp(`^### ${id} Evidence\\s*$`, "gm"));
	return matches?.length ?? 0;
}

function validateEvidenceNotes(id, section, problems) {
	for (const label of REQUIRED_NOTE_LABELS) {
		const match = section.match(new RegExp(`^- ${label}:[ \\t]*(.*)$`, "m"));
		if (!match) {
			problems.push(`${id} evidence notes are missing "${label}".`);
			continue;
		}
		const value = match[1].trim();
		if (value.length < 3) {
			problems.push(`${id} evidence notes must fill "${label}".`);
			continue;
		}
		const normalizedValue = value.toLowerCase();
		if (EMPTY_NOTE_VALUES.has(normalizedValue)) {
			problems.push(`${id} evidence notes must give a reason for "${label}" instead of "${value}".`);
		}
		if (/^n\/?a\b/i.test(value) && !/^n\/?a\s+-\s+\S/i.test(value)) {
			problems.push(`${id} evidence notes using N/A must use "N/A - <reason>" for "${label}".`);
		}
	}
}

function validateRequiredRows(content, config, problems, incomplete) {
	const matrixSection = getMarkdownSection(content, config.heading);
	if (!matrixSection) {
		problems.push(`${config.heading.replace(/^## /, "")} section is missing.`);
		return;
	}
	const rows = matrixSection
		.split("\n")
		.map((line) => parseTableRow(line, config.prefix))
		.filter(Boolean);
	const byId = new Map(rows.map((row) => [row.id, row]));
	const rowCounts = new Map();
	for (const row of rows) {
		rowCounts.set(row.id, (rowCounts.get(row.id) ?? 0) + 1);
	}

	for (const expectedId of config.expectedIds) {
		const rowCount = rowCounts.get(expectedId) ?? 0;
		if (rowCount > 1) {
			problems.push(`${expectedId} appears ${rowCount} times in ${config.label}.`);
		}
		const evidenceSectionCount = countEvidenceSections(content, expectedId);
		if (evidenceSectionCount > 1) {
			problems.push(`${expectedId} has ${evidenceSectionCount} evidence sections.`);
		}

		const row = byId.get(expectedId);
		if (!row) {
			problems.push(`${expectedId} is missing from the ${config.label}.`);
			continue;
		}
		if (!row.deviceAndBrowser) problems.push(`${expectedId} has an empty device/browser cell.`);
		if (!row.requiredResult) problems.push(`${expectedId} has an empty required-result cell.`);
		const expectedMatrixRow = EXPECTED_MATRIX_ROWS[expectedId];
		if (expectedMatrixRow && row.deviceAndBrowser !== expectedMatrixRow.deviceAndBrowser) {
			problems.push(`${expectedId} device/browser cell must be "${expectedMatrixRow.deviceAndBrowser}".`);
		}
		if (expectedMatrixRow && row.requiredResult !== expectedMatrixRow.requiredResult) {
			problems.push(`${expectedId} required-result cell must be "${expectedMatrixRow.requiredResult}".`);
		}
		const expectedConnector = EXPECTED_WALLET_CONNECTORS[expectedId];
		if (expectedConnector && !row.deviceAndBrowser.toLowerCase().includes(expectedConnector.toLowerCase())) {
			problems.push(`${expectedId} Wallet connector cell must include ${expectedConnector}.`);
		}
		if (!VALID_STATUSES.has(row.status)) {
			problems.push(`${expectedId} has invalid status "${row.status}". Expected Not run, Pass, or Fail.`);
			continue;
		}
		if (row.status === "Not run") {
			incomplete.push(`${expectedId} is Not run.`);
			continue;
		}
		if (!row.evidence) problems.push(`${expectedId} is ${row.status} but has an empty Evidence cell.`);
		if (row.evidence) validateEvidenceReference(expectedId, "matrix Evidence cell", row.evidence, problems);
		if (row.status === "Fail") {
			problems.push(`${expectedId} is Fail.`);
		}

		const evidenceSection = getEvidenceSection(content, expectedId);
		if (!evidenceSection) {
			problems.push(`${expectedId} is ${row.status} but is missing a "### ${expectedId} Evidence" section.`);
			continue;
		}
		const { fields, fieldCounts, unexpectedFields } = parseFieldTable(evidenceSection);
		for (const [field, count] of fieldCounts) {
			if (count > 1) {
				problems.push(`${expectedId} evidence field "${field}" appears ${count} times.`);
			}
		}
		for (const field of unexpectedFields) {
			problems.push(`${expectedId} evidence has unexpected field "${field}".`);
		}
		for (const field of REQUIRED_EVIDENCE_FIELDS) {
			const value = fields.get(field);
			if (!value) {
				problems.push(`${expectedId} evidence is missing "${field}".`);
				continue;
			}
			validateEvidenceField(expectedId, field, value, problems);
		}
		validateEvidenceNotes(expectedId, evidenceSection, problems);
		if (fields.get("Result")?.toLowerCase() !== row.status.toLowerCase()) {
			problems.push(`${expectedId} evidence Result must be "${row.status.toLowerCase()}".`);
		}
	}

	for (const row of rows) {
		if (!config.expectedIds.includes(row.id)) {
			problems.push(`Unexpected ${config.prefix.slice(0, -1)} row "${row.id}" in ${config.label}.`);
		}
	}
}

function validate() {
	if (process.argv.includes("--print-template")) {
		printEvidenceTemplate();
		return;
	}
	if (process.argv.includes("--init-missing")) {
		initMissingEvidenceSections();
		return;
	}

	const filePath = getArgValue("--file", DEFAULT_FILE);
	const allowIncomplete = process.argv.includes("--allow-incomplete");
	const content = readFileSync(filePath, "utf8");
	const problems = [];
	const incomplete = [];

	validateRequiredRows(
		content,
		{
			heading: "## Required Device Matrix",
			label: "Required Device Matrix",
			prefix: "RD-",
			expectedIds: EXPECTED_RD_IDS,
		},
		problems,
		incomplete,
	);
	validateRequiredRows(
		content,
		{
			heading: "## Target Wallet Coverage",
			label: "Target Wallet Coverage",
			prefix: "TW-",
			expectedIds: EXPECTED_TW_IDS,
		},
		problems,
		incomplete,
	);

	if (problems.length > 0 || (!allowIncomplete && incomplete.length > 0)) {
		console.error(`Device validation is not complete for ${filePath}.`);
		for (const problem of problems) console.error(`- ${problem}`);
		if (!allowIncomplete) {
			for (const item of incomplete) console.error(`- ${item}`);
		}
		process.exit(1);
	}

	if (incomplete.length > 0) {
		console.log(`Device validation structure is valid, but ${incomplete.length} validation rows are still incomplete.`);
		for (const item of incomplete) console.log(`- ${item}`);
		return;
	}

	console.log(`Device validation is complete for ${filePath}.`);
}

validate();
