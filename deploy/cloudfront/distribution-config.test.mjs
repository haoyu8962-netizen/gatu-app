import assert from "node:assert/strict";
import test from "node:test";
import {
	CACHED_PATH_PATTERNS,
	createDistributionConfig,
	MANAGED_POLICIES,
	ORIGIN_ID,
	ORIGIN_VERIFY_HEADER,
	validateOptions,
} from "./distribution-config.mjs";

const OPTIONS = {
	aliases: ["app.gatu.ai", "testnet.gatu.ai"],
	originDomain: "origin.gatu.ai",
	certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/11111111-2222-3333-4444-555555555555",
	originVerifySecret: "0123456789abcdef0123456789abcdef0123456789abcdef",
	callerReference: "test",
};

test("navigations and API paths pass through uncached with every viewer header", () => {
	const config = createDistributionConfig(OPTIONS);
	assert.deepEqual(config.Aliases.Items, OPTIONS.aliases);
	assert.equal(config.Origins.Items[0].DomainName, "origin.gatu.ai");
	assert.equal(config.Origins.Items[0].CustomOriginConfig.OriginProtocolPolicy, "https-only");
	assert.deepEqual(config.Origins.Items[0].CustomHeaders.Items, [
		{ HeaderName: ORIGIN_VERIFY_HEADER, HeaderValue: OPTIONS.originVerifySecret },
	]);
	const defaultBehavior = config.DefaultCacheBehavior;
	assert.equal(defaultBehavior.TargetOriginId, ORIGIN_ID);
	assert.equal(defaultBehavior.CachePolicyId, MANAGED_POLICIES.cacheDisabled);
	assert.equal(defaultBehavior.OriginRequestPolicyId, MANAGED_POLICIES.originAllViewerAndCloudFrontHeaders);
	assert.ok(defaultBehavior.AllowedMethods.Items.includes("POST"));
	assert.equal(defaultBehavior.ViewerProtocolPolicy, "redirect-to-https");
});

test("content-hashed assets and the chart package are cached at the edge as read-only behaviors", () => {
	const config = createDistributionConfig(OPTIONS);
	assert.deepEqual(
		config.CacheBehaviors.Items.map((behavior) => behavior.PathPattern),
		[...CACHED_PATH_PATTERNS],
	);
	for (const behavior of config.CacheBehaviors.Items) {
		assert.equal(behavior.CachePolicyId, MANAGED_POLICIES.cacheOptimized);
		assert.equal(behavior.OriginRequestPolicyId, MANAGED_POLICIES.originAllViewer);
		assert.deepEqual(behavior.AllowedMethods.Items, ["GET", "HEAD"]);
		assert.equal(behavior.Compress, true);
	}
	assert.equal(config.CacheBehaviors.Quantity, CACHED_PATH_PATTERNS.length);
});

test("viewer TLS uses the us-east-1 certificate with modern protocols", () => {
	const config = createDistributionConfig(OPTIONS);
	assert.equal(config.ViewerCertificate.ACMCertificateArn, OPTIONS.certificateArn);
	assert.equal(config.ViewerCertificate.MinimumProtocolVersion, "TLSv1.2_2021");
	assert.equal(config.HttpVersion, "http2and3");
	assert.equal(config.IsIPV6Enabled, true);
	assert.equal(config.CallerReference, "test");
});

test("invalid inputs are rejected before anything reaches AWS", () => {
	assert.throws(() => validateOptions({ ...OPTIONS, aliases: [] }), /aliases/);
	assert.throws(() => validateOptions({ ...OPTIONS, originDomain: "app.gatu.ai" }), /originDomain/);
	assert.throws(() => validateOptions({ ...OPTIONS, certificateArn: "arn:aws:acm:eu-west-1:1:certificate/x" }), /us-east-1/);
	assert.throws(() => validateOptions({ ...OPTIONS, originVerifySecret: "short" }), /originVerifySecret/);
});
