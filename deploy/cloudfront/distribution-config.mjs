#!/usr/bin/env node
// Generates the CloudFront DistributionConfig for a fully static trading terminal: the client
// build lives in a private S3 bucket (origin access control), the same-origin API handlers run on
// a Lambda function URL (origin access control), and two CloudFront Functions rewrite navigations
// to the prerendered shell and expose the referral route marker. Nothing here talks to AWS; pipe
// the JSON into `aws cloudfront create-distribution --distribution-config file://...`.
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MANAGED_POLICIES = Object.freeze({
	cacheOptimized: "658327ea-f89d-4fab-a63d-7e88639e58f6",
	cacheDisabled: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
	originAllViewer: "216adef6-5c7f-47e4-b989-5492eafa07d3",
});

export const S3_ORIGIN_ID = "gatu-terminal-static";
export const API_ORIGIN_ID = "gatu-terminal-api";
export const API_ORIGIN_REQUEST_POLICY_NAME = "gatu-terminal-api";
export const NOT_FOUND_PAGE = "/404.html";

export const API_PATH_PATTERNS = Object.freeze(["/api/*", "/client-error-report", "/mobile-agent-sync-ticket*"]);
/** Read-only API whose handler sets `s-maxage`; it gets its own behavior ahead of the uncached `/api/*` one. */
export const LEADERBOARD_PATH_PATTERN = "/api/leaderboard";
export const API_CACHE_POLICY_NAME = "gatu-terminal-api-cached";
export const JOIN_PATH_PATTERN = "/join*";
export const CHART_PATH_PATTERNS = Object.freeze(["/charting_library/*", "/tradingview-theme-*.css"]);
export const ASSET_PATH_PATTERNS = Object.freeze([
	"/assets/*",
	"/coins/*",
	"/icon*.png",
	"/apple-touch-icon.png",
	"/favicon.*",
]);
export const TRADE_PATH_PATTERNS = Object.freeze(["/trade*", "/perp*", "/spot*", "/builders-perp*"]);

const ALL_METHODS = ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"];
const READ_METHODS = ["GET", "HEAD"];

function list(items) {
	return { Quantity: items.length, Items: [...items] };
}

function functionAssociations(arns) {
	const items = [];
	if (arns?.request) items.push({ EventType: "viewer-request", FunctionARN: arns.request });
	if (arns?.response) items.push({ EventType: "viewer-response", FunctionARN: arns.response });
	return list(items);
}

function cacheBehavior({
	pathPattern,
	targetOriginId,
	cachePolicyId,
	originRequestPolicyId,
	responseHeadersPolicyId,
	methods,
	functions,
}) {
	const behavior = {
		TargetOriginId: targetOriginId,
		ViewerProtocolPolicy: "redirect-to-https",
		AllowedMethods: { ...list(methods), CachedMethods: list(READ_METHODS) },
		Compress: true,
		CachePolicyId: cachePolicyId,
		SmoothStreaming: false,
		FieldLevelEncryptionId: "",
		LambdaFunctionAssociations: list([]),
		FunctionAssociations: functionAssociations(functions),
	};
	if (originRequestPolicyId) behavior.OriginRequestPolicyId = originRequestPolicyId;
	if (responseHeadersPolicyId) behavior.ResponseHeadersPolicyId = responseHeadersPolicyId;
	return pathPattern ? { PathPattern: pathPattern, ...behavior } : behavior;
}

const HOSTNAME = /^[a-z0-9.-]+$/;
const ARN_PREFIX = /^arn:aws:/;

function validateViewerCertificate(aliases, certificateArn) {
	if (!Array.isArray(aliases) || aliases.some((alias) => !HOSTNAME.test(alias))) {
		throw new Error("aliases must be lowercase hostnames");
	}
	// Before the DNS cut-over the distribution runs on its *.cloudfront.net name with the default
	// certificate; aliases and the ACM certificate are added together once the certificate is issued.
	if (aliases.length === 0 && certificateArn === undefined) return;
	if (aliases.length === 0 || certificateArn === undefined) {
		throw new Error("aliases and certificateArn must be provided together");
	}
	if (typeof certificateArn !== "string" || !/^arn:aws:acm:us-east-1:\d{12}:certificate\/[0-9a-f-]+$/.test(certificateArn)) {
		throw new Error("certificateArn must be an ACM certificate in us-east-1");
	}
}

export function viewerCertificate(certificateArn) {
	if (certificateArn === undefined) {
		return { CloudFrontDefaultCertificate: true, MinimumProtocolVersion: "TLSv1", CertificateSource: "cloudfront" };
	}
	return {
		ACMCertificateArn: certificateArn,
		SSLSupportMethod: "sni-only",
		MinimumProtocolVersion: "TLSv1.2_2021",
		Certificate: certificateArn,
		CertificateSource: "acm",
	};
}

export function validateOptions(options) {
	const {
		network,
		aliases,
		certificateArn,
		bucketDomain,
		s3OriginAccessControlId,
		lambdaUrlDomain,
		lambdaOriginAccessControlId,
		apiOriginRequestPolicyId,
		apiCachePolicyId,
		responseHeadersPolicyIds,
		functionArns,
	} = options;
	if (network !== "mainnet" && network !== "testnet") throw new Error("network must be mainnet or testnet");
	validateViewerCertificate(aliases, certificateArn);
	if (typeof bucketDomain !== "string" || !/\.s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(bucketDomain)) {
		throw new Error("bucketDomain must be the bucket's regional S3 domain");
	}
	if (typeof lambdaUrlDomain !== "string" || !/\.lambda-url\.[a-z0-9-]+\.on\.aws$/.test(lambdaUrlDomain)) {
		throw new Error("lambdaUrlDomain must be a Lambda function URL host");
	}
	for (const [name, value] of Object.entries({
		s3OriginAccessControlId,
		lambdaOriginAccessControlId,
		apiOriginRequestPolicyId,
		apiCachePolicyId,
	})) {
		if (typeof value !== "string" || value.trim() === "") throw new Error(`${name} is required`);
	}
	for (const key of ["base", "trade", "join", "chart"]) {
		if (typeof responseHeadersPolicyIds?.[key] !== "string" || responseHeadersPolicyIds[key].trim() === "") {
			throw new Error(`responseHeadersPolicyIds.${key} is required`);
		}
	}
	for (const key of ["request", "response"]) {
		if (typeof functionArns?.[key] !== "string" || !ARN_PREFIX.test(functionArns[key])) {
			throw new Error(`functionArns.${key} must be a CloudFront Function ARN`);
		}
	}
}

/**
 * Caches API responses only as long as the origin says (`s-maxage`), keyed by the full query string,
 * so the leaderboard snapshot is served from the edge instead of re-running the Lambda per viewer.
 */
export function createApiCachePolicyConfig() {
	return {
		Name: API_CACHE_POLICY_NAME,
		Comment: "gatu API responses cached by origin s-maxage, keyed by query string",
		DefaultTTL: 0,
		MaxTTL: 1800,
		MinTTL: 0,
		ParametersInCacheKeyAndForwardedToOrigin: {
			EnableAcceptEncodingGzip: true,
			EnableAcceptEncodingBrotli: true,
			HeadersConfig: { HeaderBehavior: "none" },
			CookiesConfig: { CookieBehavior: "none" },
			QueryStringsConfig: { QueryStringBehavior: "all" },
		},
	};
}

export function createApiOriginRequestPolicyConfig() {
	return {
		Name: API_ORIGIN_REQUEST_POLICY_NAME,
		Comment: "Same-origin API on a Lambda function URL: every viewer header except Host, plus the viewer address",
		HeadersConfig: {
			HeaderBehavior: "whitelist",
			// CloudFront allows at most ten whitelisted headers per origin request policy.
			Headers: list([
				"Accept",
				"Content-Type",
				"Origin",
				"Referer",
				"Sec-Fetch-Site",
				"User-Agent",
				"X-Gatu-Forwarded-Host",
				"CloudFront-Viewer-Address",
				"CloudFront-Viewer-Country",
			]),
		},
		CookiesConfig: { CookieBehavior: "none" },
		QueryStringsConfig: { QueryStringBehavior: "all" },
	};
}

export function createDistributionConfig(options) {
	validateOptions(options);
	const {
		network,
		aliases,
		certificateArn,
		bucketDomain,
		s3OriginAccessControlId,
		lambdaUrlDomain,
		lambdaOriginAccessControlId,
		apiOriginRequestPolicyId,
		apiCachePolicyId,
		responseHeadersPolicyIds,
		functionArns,
		callerReference = `gatu-terminal-${network}-${randomUUID()}`,
		comment = `gatu trading terminal (${network}): static shell on S3, API on Lambda`,
		policies = MANAGED_POLICIES,
	} = options;

	// Every static behavior runs the viewer-response function so the Content-Security-Policy
	// (too long for a response headers policy) reaches HTML, scripts and the chart package alike.
	const s3Behavior = (pathPattern, responseHeadersPolicyId, extra = {}) =>
		cacheBehavior({
			pathPattern,
			targetOriginId: S3_ORIGIN_ID,
			cachePolicyId: policies.cacheOptimized,
			responseHeadersPolicyId,
			methods: READ_METHODS,
			functions: { response: functionArns.response },
			...extra,
		});
	const apiBehavior = (pathPattern) =>
		cacheBehavior({
			pathPattern,
			targetOriginId: API_ORIGIN_ID,
			cachePolicyId: policies.cacheDisabled,
			originRequestPolicyId: apiOriginRequestPolicyId,
			responseHeadersPolicyId: responseHeadersPolicyIds.base,
			methods: ALL_METHODS,
			functions: { request: functionArns.request },
		});

	const behaviors = [
		cacheBehavior({
			pathPattern: LEADERBOARD_PATH_PATTERN,
			targetOriginId: API_ORIGIN_ID,
			cachePolicyId: apiCachePolicyId,
			originRequestPolicyId: apiOriginRequestPolicyId,
			responseHeadersPolicyId: responseHeadersPolicyIds.base,
			methods: READ_METHODS,
			functions: { request: functionArns.request },
		}),
		...API_PATH_PATTERNS.map(apiBehavior),
		cacheBehavior({
			pathPattern: JOIN_PATH_PATTERN,
			targetOriginId: S3_ORIGIN_ID,
			cachePolicyId: policies.cacheDisabled,
			responseHeadersPolicyId: responseHeadersPolicyIds.join,
			methods: READ_METHODS,
			functions: functionArns,
		}),
		...CHART_PATH_PATTERNS.map((pattern) => s3Behavior(pattern, responseHeadersPolicyIds.chart)),
		...ASSET_PATH_PATTERNS.map((pattern) => s3Behavior(pattern, responseHeadersPolicyIds.base)),
		...TRADE_PATH_PATTERNS.map((pattern) => s3Behavior(pattern, responseHeadersPolicyIds.trade, { functions: functionArns })),
	];

	return {
		CallerReference: callerReference,
		Aliases: list(aliases),
		DefaultRootObject: "",
		Origins: list([
			{
				Id: S3_ORIGIN_ID,
				DomainName: bucketDomain,
				OriginPath: "",
				CustomHeaders: list([]),
				S3OriginConfig: { OriginAccessIdentity: "" },
				OriginAccessControlId: s3OriginAccessControlId,
				ConnectionAttempts: 3,
				ConnectionTimeout: 10,
				OriginShield: { Enabled: false },
			},
			{
				Id: API_ORIGIN_ID,
				DomainName: lambdaUrlDomain,
				OriginPath: "",
				CustomHeaders: list([]),
				CustomOriginConfig: {
					HTTPPort: 80,
					HTTPSPort: 443,
					OriginProtocolPolicy: "https-only",
					OriginSslProtocols: list(["TLSv1.2"]),
					OriginReadTimeout: 30,
					OriginKeepaliveTimeout: 5,
				},
				OriginAccessControlId: lambdaOriginAccessControlId,
				ConnectionAttempts: 3,
				ConnectionTimeout: 10,
				OriginShield: { Enabled: false },
			},
		]),
		OriginGroups: list([]),
		DefaultCacheBehavior: cacheBehavior({
			targetOriginId: S3_ORIGIN_ID,
			cachePolicyId: policies.cacheOptimized,
			responseHeadersPolicyId: responseHeadersPolicyIds.base,
			methods: READ_METHODS,
			functions: functionArns,
		}),
		CacheBehaviors: list(behaviors),
		CustomErrorResponses: list([
			{ ErrorCode: 404, ResponsePagePath: NOT_FOUND_PAGE, ResponseCode: "404", ErrorCachingMinTTL: 60 },
		]),
		Comment: comment,
		Logging: { Enabled: false, IncludeCookies: false, Bucket: "", Prefix: "" },
		PriceClass: "PriceClass_All",
		Enabled: true,
		ViewerCertificate: viewerCertificate(certificateArn),
		Restrictions: { GeoRestriction: { RestrictionType: "none", Quantity: 0, Items: [] } },
		WebACLId: "",
		HttpVersion: "http2and3",
		IsIPV6Enabled: true,
		Staging: false,
	};
}

function readArgs(argv) {
	const options = { aliases: [], responseHeadersPolicyIds: {}, functionArns: {} };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		const [flag, inline] = argument.split("=", 2);
		const value = inline ?? argv[++index];
		switch (flag) {
			case "--network":
				options.network = value;
				break;
			case "--alias":
				options.aliases.push(value);
				break;
			case "--certificate-arn":
				options.certificateArn = value;
				break;
			case "--bucket-domain":
				options.bucketDomain = value;
				break;
			case "--s3-oac":
				options.s3OriginAccessControlId = value;
				break;
			case "--lambda-url-domain":
				options.lambdaUrlDomain = value;
				break;
			case "--lambda-oac":
				options.lambdaOriginAccessControlId = value;
				break;
			case "--api-cache-policy":
				options.apiCachePolicyId = value;
				break;
			case "--api-origin-request-policy":
				options.apiOriginRequestPolicyId = value;
				break;
			case "--policy-base":
			case "--policy-trade":
			case "--policy-join":
			case "--policy-chart":
				options.responseHeadersPolicyIds[flag.slice("--policy-".length)] = value;
				break;
			case "--function-request":
				options.functionArns.request = value;
				break;
			case "--function-response":
				options.functionArns.response = value;
				break;
			case "--comment":
				options.comment = value;
				break;
			default:
				throw new Error(`Unknown argument ${argument}`);
		}
	}
	return options;
}

function main() {
	const argv = process.argv.slice(2);
	if (argv[0] === "--api-cache-policy-config") {
		process.stdout.write(`${JSON.stringify(createApiCachePolicyConfig(), null, 2)}\n`);
		return;
	}
	if (argv[0] === "--api-origin-request-policy-config") {
		process.stdout.write(`${JSON.stringify(createApiOriginRequestPolicyConfig(), null, 2)}\n`);
		return;
	}
	process.stdout.write(`${JSON.stringify(createDistributionConfig(readArgs(argv)), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
