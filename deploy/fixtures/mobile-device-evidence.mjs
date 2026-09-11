export const RD_IDS = ["RD-1", "RD-2", "RD-3", "RD-4", "RD-5", "RD-6", "RD-7", "RD-8"];
export const TW_IDS = ["TW-1", "TW-2", "TW-3"];
const VALIDATION_IDS = [...RD_IDS, ...TW_IDS];
export const EXPECTED_MATRIX_ROWS = {
	"RD-1": {
		deviceAndBrowser: "iOS Safari via native Camera app",
		requiredResult: "Phone-access QR opens the clean route and waits for explicit Import.",
	},
	"RD-2": {
		deviceAndBrowser: "iOS Safari",
		requiredResult:
			"Reload retains the bounded draft and consumer; rejected tickets clear the draft without activating access.",
	},
	"RD-3": {
		deviceAndBrowser: "Installed iOS PWA",
		requiredResult:
			"PWA and browser contexts remain isolated; cancel and background recovery never import or sign automatically.",
	},
	"RD-4": {
		deviceAndBrowser: "iOS Chrome",
		requiredResult:
			"Desktop-approved Agent imports without phone owner login or pairing code; owner and remote approval match.",
	},
	"RD-5": {
		deviceAndBrowser: "Android Chrome",
		requiredResult:
			"Desktop-approved Agent imports without phone owner login or pairing code; owner and remote approval match.",
	},
	"RD-6": {
		deviceAndBrowser: "iOS wallet in-app browser, if supported",
		requiredResult: "Explicit import works or unsupported behavior is documented with a working external-browser path.",
	},
	"RD-7": {
		deviceAndBrowser: "Physical phone camera in Link Desktop scanner",
		requiredResult:
			"Real Agent QR scans within the viewport; cancel, denied or pending camera permission and background cleanup release all tracks.",
	},
	"RD-8": {
		deviceAndBrowser: "Physical phone Link Desktop scanner",
		requiredResult: "WalletConnect, expired, foreign-origin and unsupported QRs fail closed with actionable feedback.",
	},
	"TW-1": {
		deviceAndBrowser: "Coinbase Wallet",
		requiredResult:
			"Privy reconnect activates the exact owner; desktop Mobile approval matches; ordinary mobile trading keeps its signing contract.",
	},
	"TW-2": {
		deviceAndBrowser: "MetaMask",
		requiredResult:
			"Privy reconnect activates the exact owner; desktop Mobile approval matches; ordinary mobile trading keeps its signing contract.",
	},
	"TW-3": {
		deviceAndBrowser: "WalletConnect-compatible wallet used by the product team",
		requiredResult:
			"Privy same-phone WalletConnect handoff returns to the exact owner; no parallel application wallet scanner is required.",
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

export function createRows(ids, status) {
	return ids
		.map((id) => {
			const row = EXPECTED_MATRIX_ROWS[id];
			const evidence = status === "Pass" ? `${id} screenshot artifact and notes` : "";
			return `| ${id} | ${row.deviceAndBrowser} | ${row.requiredResult} | ${status} | ${evidence} |`;
		})
		.join("\n");
}

function createEvidenceSections() {
	return VALIDATION_IDS.map((id) => {
		const walletConnector = EXPECTED_WALLET_CONNECTORS[id] ?? "Test Wallet";
		return `### ${id} Evidence

| Field | Value |
| --- | --- |
| Tester | Test Engineer |
| Date and time | 2026-05-25T12:00:00Z |
| Git commit | abc1234 |
| Release ID | preview-v2 |
| Ticket API version | 2 |
| Mobile create gate | true |
| Mobile import gate | true |
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
	}).join("\n");
}

export function createValidationDoc({ status = "Pass", includeEvidence = true } = {}) {
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
