import assert from "node:assert/strict";
import test from "node:test";
import {
	chartingLibrarySecurityHeaders,
	referralJoinHeaders,
	securityHeaders,
} from "../../apps/terminal/src/config/security-headers.ts";
import {
	CHART_CACHE_CONTROL,
	createResponseHeadersPolicies,
	HYPERLIQUID_API_ORIGINS,
	NOINDEX,
	toResponseHeadersPolicyConfig,
} from "./response-headers-policies.mjs";

function customHeader(policy, name) {
	return policy.CustomHeadersConfig.Items.find((item) => item.Header === name)?.Value;
}

test("standard security headers map to the typed policy fields and the rest stay custom", () => {
	const policy = toResponseHeadersPolicyConfig("test", securityHeaders, "comment");
	assert.equal(policy.SecurityHeadersConfig.ContentSecurityPolicy, undefined, "CSP is set by the viewer-response function");
	assert.equal(customHeader(policy, "content-security-policy"), undefined);
	assert.equal(policy.SecurityHeadersConfig.FrameOptions.FrameOption, "DENY");
	assert.equal(policy.SecurityHeadersConfig.ReferrerPolicy.ReferrerPolicy, "strict-origin-when-cross-origin");
	assert.equal(policy.SecurityHeadersConfig.ContentTypeOptions.Override, true);
	assert.equal(policy.SecurityHeadersConfig.StrictTransportSecurity.AccessControlMaxAgeSec, 31_536_000);
	assert.equal(customHeader(policy, "permissions-policy"), securityHeaders["permissions-policy"]);
	assert.equal(policy.CustomHeadersConfig.Quantity, policy.CustomHeadersConfig.Items.length);
});

test("mainnet policies carry the mainnet preconnect, join and chart specifics", () => {
	const [base, trade, join, chart] = createResponseHeadersPolicies("mainnet");
	assert.equal(base.Name, "gatu-terminal-base-mainnet");
	assert.equal(customHeader(base, "x-robots-tag"), undefined);
	assert.equal(customHeader(trade, "link"), `<${HYPERLIQUID_API_ORIGINS.mainnet}>; rel=preconnect; crossorigin=anonymous`);
	assert.equal(customHeader(join, "cache-control"), referralJoinHeaders["cache-control"]);
	assert.equal(join.SecurityHeadersConfig.ReferrerPolicy.ReferrerPolicy, "no-referrer");
	assert.equal(customHeader(join, "x-robots-tag"), NOINDEX);
	assert.equal(chart.SecurityHeadersConfig.FrameOptions.FrameOption, "SAMEORIGIN");
	assert.equal(chart.SecurityHeadersConfig.ContentSecurityPolicy, undefined);
	assert.equal(chartingLibrarySecurityHeaders["x-frame-options"], "SAMEORIGIN");
	assert.equal(customHeader(chart, "cache-control"), CHART_CACHE_CONTROL);
});

test("testnet policies add noindex everywhere and point the preconnect at the testnet API", () => {
	const policies = createResponseHeadersPolicies("testnet");
	for (const policy of policies) {
		assert.equal(customHeader(policy, "x-robots-tag"), NOINDEX, policy.Name);
		assert.ok(policy.Name.endsWith("-testnet"));
	}
	assert.equal(customHeader(policies[1], "link"), `<${HYPERLIQUID_API_ORIGINS.testnet}>; rel=preconnect; crossorigin=anonymous`);
	assert.throws(() => createResponseHeadersPolicies("devnet"), /network/);
});
