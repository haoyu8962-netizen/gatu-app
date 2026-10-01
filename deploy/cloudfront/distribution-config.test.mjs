import assert from "node:assert/strict";
import test from "node:test";
import {
	API_CACHE_POLICY_NAME,
	API_ORIGIN_ID,
	API_PATH_PATTERNS,
	applyDistributionAliases,
	ASSET_PATH_PATTERNS,
	CHART_PATH_PATTERNS,
	createApiCachePolicyConfig,
	createApiOriginRequestPolicyConfig,
	createDistributionConfig,
	JOIN_PATH_PATTERN,
	LEADERBOARD_PATH_PATTERN,
	MANAGED_POLICIES,
	NOT_FOUND_PAGE,
	S3_ORIGIN_ID,
	TRADE_PATH_PATTERNS,
	validateOptions,
} from "./distribution-config.mjs";

const OPTIONS = {
	network: "mainnet",
	aliases: ["app.sairn.ai"],
	certificateArn: "arn:aws:acm:us-east-1:123456789012:certificate/11111111-2222-3333-4444-555555555555",
	bucketDomain: "gatu-terminal-2026.s3.ap-northeast-1.amazonaws.com",
	s3OriginAccessControlId: "E1S3OAC",
	lambdaUrlDomain: "abcdef.lambda-url.ap-northeast-1.on.aws",
	lambdaOriginAccessControlId: "E1LAMBDAOAC",
	apiOriginRequestPolicyId: "orp-1",
	apiCachePolicyId: "cp-api",
	responseHeadersPolicyIds: { base: "rhp-base", trade: "rhp-trade", join: "rhp-join", chart: "rhp-chart" },
	functionArns: {
		request: "arn:aws:cloudfront::123456789012:function/gatu-terminal-request",
		response: "arn:aws:cloudfront::123456789012:function/gatu-terminal-response",
	},
	callerReference: "test",
};

function behavior(config, pathPattern) {
	return config.CacheBehaviors.Items.find((item) => item.PathPattern === pathPattern);
}

test("the api paths reach the lambda origin uncached with the api origin request policy", () => {
	const config = createDistributionConfig(OPTIONS);
	for (const pattern of API_PATH_PATTERNS) {
		const api = behavior(config, pattern);
		assert.equal(api.TargetOriginId, API_ORIGIN_ID, pattern);
		assert.equal(api.CachePolicyId, MANAGED_POLICIES.cacheDisabled);
		assert.equal(api.OriginRequestPolicyId, "orp-1");
		assert.ok(api.AllowedMethods.Items.includes("POST"));
		assert.deepEqual(
			api.FunctionAssociations.Items.map((item) => item.EventType),
			["viewer-request"],
		);
	}
	const lambda = config.Origins.Items.find((origin) => origin.Id === API_ORIGIN_ID);
	assert.equal(lambda.DomainName, OPTIONS.lambdaUrlDomain);
	assert.equal(lambda.OriginAccessControlId, "E1LAMBDAOAC");
	assert.equal(lambda.CustomOriginConfig.OriginProtocolPolicy, "https-only");
});

test("static behaviors read from the private bucket with the matching header policies and functions", () => {
	const config = createDistributionConfig(OPTIONS);
	const s3 = config.Origins.Items.find((origin) => origin.Id === S3_ORIGIN_ID);
	assert.equal(s3.DomainName, OPTIONS.bucketDomain);
	assert.equal(s3.OriginAccessControlId, "E1S3OAC");

	const join = behavior(config, JOIN_PATH_PATTERN);
	assert.equal(join.CachePolicyId, MANAGED_POLICIES.cacheDisabled);
	assert.equal(join.ResponseHeadersPolicyId, "rhp-join");
	assert.deepEqual(
		join.FunctionAssociations.Items.map((item) => item.EventType),
		["viewer-request", "viewer-response"],
	);
	for (const pattern of CHART_PATH_PATTERNS) {
		assert.equal(behavior(config, pattern).ResponseHeadersPolicyId, "rhp-chart", pattern);
		assert.deepEqual(
			behavior(config, pattern).FunctionAssociations.Items.map((item) => item.EventType),
			["viewer-response"],
			pattern,
		);
	}
	for (const pattern of ASSET_PATH_PATTERNS) {
		assert.equal(behavior(config, pattern).CachePolicyId, MANAGED_POLICIES.cacheOptimized, pattern);
		assert.equal(behavior(config, pattern).ResponseHeadersPolicyId, "rhp-base", pattern);
		assert.deepEqual(
			behavior(config, pattern).FunctionAssociations.Items.map((item) => item.EventType),
			["viewer-response"],
			pattern,
		);
	}
	for (const pattern of TRADE_PATH_PATTERNS) {
		assert.equal(behavior(config, pattern).ResponseHeadersPolicyId, "rhp-trade", pattern);
		assert.deepEqual(
			behavior(config, pattern).FunctionAssociations.Items.map((item) => item.EventType),
			["viewer-request", "viewer-response"],
		);
	}
	assert.equal(config.DefaultCacheBehavior.TargetOriginId, S3_ORIGIN_ID);
	assert.equal(config.DefaultCacheBehavior.ResponseHeadersPolicyId, "rhp-base");
	assert.deepEqual(
		config.DefaultCacheBehavior.FunctionAssociations.Items.map((item) => item.EventType),
		["viewer-request", "viewer-response"],
	);
	assert.deepEqual(config.CustomErrorResponses.Items, [
		{ ErrorCode: 404, ResponsePagePath: NOT_FOUND_PAGE, ResponseCode: "404", ErrorCachingMinTTL: 60 },
	]);
});

test("the leaderboard is cached at the edge by the origin s-maxage, ahead of the uncached api behaviors", () => {
	const config = createDistributionConfig(OPTIONS);
	const leaderboard = behavior(config, LEADERBOARD_PATH_PATTERN);
	assert.equal(config.CacheBehaviors.Items[0].PathPattern, LEADERBOARD_PATH_PATTERN);
	assert.equal(leaderboard.TargetOriginId, API_ORIGIN_ID);
	assert.equal(leaderboard.CachePolicyId, "cp-api");
	assert.equal(leaderboard.OriginRequestPolicyId, "orp-1");
	assert.deepEqual(leaderboard.AllowedMethods.Items, ["GET", "HEAD"]);
	const policy = createApiCachePolicyConfig();
	assert.equal(policy.Name, API_CACHE_POLICY_NAME);
	assert.deepEqual([policy.MinTTL, policy.DefaultTTL, policy.MaxTTL], [0, 0, 1800]);
	assert.equal(policy.ParametersInCacheKeyAndForwardedToOrigin.QueryStringsConfig.QueryStringBehavior, "all");
	assert.equal(policy.ParametersInCacheKeyAndForwardedToOrigin.HeadersConfig.HeaderBehavior, "none");
	assert.throws(() => validateOptions({ ...OPTIONS, apiCachePolicyId: "" }), /apiCachePolicyId/);
});

test("api behaviors are evaluated before the static ones and tls uses the us-east-1 certificate", () => {
	const config = createDistributionConfig(OPTIONS);
	const patterns = config.CacheBehaviors.Items.map((item) => item.PathPattern);
	assert.deepEqual(patterns.slice(1, 1 + API_PATH_PATTERNS.length), [...API_PATH_PATTERNS]);
	assert.equal(patterns[1 + API_PATH_PATTERNS.length], JOIN_PATH_PATTERN);
	assert.equal(config.ViewerCertificate.ACMCertificateArn, OPTIONS.certificateArn);
	assert.equal(config.HttpVersion, "http2and3");
	assert.equal(config.Comment.includes("mainnet"), true);
});

test("the api origin request policy forwards everything the handlers need except Host", () => {
	const policy = createApiOriginRequestPolicyConfig();
	const headers = policy.HeadersConfig.Headers.Items;
	for (const required of ["Origin", "Sec-Fetch-Site", "Content-Type", "X-Sairn-Forwarded-Host", "CloudFront-Viewer-Address"]) {
		assert.ok(headers.includes(required), required);
	}
	assert.ok(!headers.includes("Host"));
	assert.ok(headers.length <= 10, "CloudFront allows at most ten whitelisted headers");
	assert.equal(policy.QueryStringsConfig.QueryStringBehavior, "all");
	assert.equal(policy.CookiesConfig.CookieBehavior, "none");
});

test("a distribution can start on the default certificate and adopt aliases with the ACM certificate later", () => {
	const config = createDistributionConfig({ ...OPTIONS, aliases: [], certificateArn: undefined });
	assert.equal(config.Aliases.Quantity, 0);
	assert.equal(config.ViewerCertificate.CloudFrontDefaultCertificate, true);
	assert.equal(config.ViewerCertificate.ACMCertificateArn, undefined);
	assert.throws(() => validateOptions({ ...OPTIONS, aliases: [] }), /together/);
	assert.throws(() => validateOptions({ ...OPTIONS, certificateArn: undefined }), /together/);
});

test("invalid inputs are rejected before anything reaches AWS", () => {
	assert.throws(() => validateOptions({ ...OPTIONS, network: "devnet" }), /network/);
	assert.throws(() => validateOptions({ ...OPTIONS, bucketDomain: "gatu-terminal-2026" }), /bucketDomain/);
	assert.throws(() => validateOptions({ ...OPTIONS, lambdaUrlDomain: "example.com" }), /lambdaUrlDomain/);
	assert.throws(() => validateOptions({ ...OPTIONS, responseHeadersPolicyIds: { base: "x" } }), /responseHeadersPolicyIds/);
	assert.throws(() => validateOptions({ ...OPTIONS, functionArns: { request: "nope" } }), /functionArns/);
});

test("the cut-over adds aliases and the ACM certificate to a live distribution without touching the rest", () => {
	const live = { ...createDistributionConfig({ ...OPTIONS, aliases: [], certificateArn: undefined }), CallerReference: "live-1" };
	const updated = applyDistributionAliases(live, { aliases: ["app.sairn.ai"], certificateArn: OPTIONS.certificateArn });
	assert.deepEqual(updated.Aliases, { Quantity: 1, Items: ["app.sairn.ai"] });
	assert.equal(updated.ViewerCertificate.ACMCertificateArn, OPTIONS.certificateArn);
	assert.equal(updated.ViewerCertificate.SSLSupportMethod, "sni-only");
	assert.equal(updated.ViewerCertificate.MinimumProtocolVersion, "TLSv1.2_2021");
	assert.equal(updated.CallerReference, "live-1");
	assert.deepEqual({ ...updated, Aliases: live.Aliases, ViewerCertificate: live.ViewerCertificate }, live);
	assert.throws(() => applyDistributionAliases(live, { aliases: [], certificateArn: OPTIONS.certificateArn }), /alias/);
	assert.throws(() => applyDistributionAliases(live, { aliases: ["app.sairn.ai"], certificateArn: undefined }), /together/);
	assert.throws(() => applyDistributionAliases(live, { aliases: ["App.sairn.ai"], certificateArn: OPTIONS.certificateArn }), /hostnames/);
});
