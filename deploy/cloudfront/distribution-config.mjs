#!/usr/bin/env node
// Generates the CloudFront DistributionConfig for the trading terminal. The distribution fronts
// the existing Caddy + Node origin: navigations, /api/* and the pairing ticket pass through
// uncached with every viewer header (including Host and CloudFront-Viewer-Address), while the
// content-hashed client assets and the TradingView package are cached at the edge. Nothing here
// talks to AWS; pipe the JSON into `aws cloudfront create-distribution --distribution-config`.
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MANAGED_POLICIES = Object.freeze({
	cacheOptimized: "658327ea-f89d-4fab-a63d-7e88639e58f6",
	cacheDisabled: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
	originAllViewer: "216adef6-5c7f-47e4-b989-5492eafa07d3",
	originAllViewerAndCloudFrontHeaders: "33f36d7e-f396-46d9-90e0-52428a34d9dc",
});

export const ORIGIN_VERIFY_HEADER = "X-Origin-Verify";
export const ORIGIN_ID = "gatu-caddy-origin";
export const CACHED_PATH_PATTERNS = Object.freeze([
	"/assets/*",
	"/charting_library/*",
	"/tradingview-theme-*.css",
	"/coins/*",
	"/icon*.png",
	"/apple-touch-icon.png",
	"/favicon.*",
]);

const ALL_METHODS = ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"];
const READ_METHODS = ["GET", "HEAD"];

function list(items) {
	return { Quantity: items.length, Items: [...items] };
}

function cacheBehavior({ pathPattern, cachePolicyId, originRequestPolicyId, methods }) {
	const behavior = {
		TargetOriginId: ORIGIN_ID,
		ViewerProtocolPolicy: "redirect-to-https",
		AllowedMethods: { ...list(methods), CachedMethods: list(READ_METHODS) },
		Compress: true,
		CachePolicyId: cachePolicyId,
		OriginRequestPolicyId: originRequestPolicyId,
		SmoothStreaming: false,
		FieldLevelEncryptionId: "",
		LambdaFunctionAssociations: list([]),
		FunctionAssociations: list([]),
	};
	return pathPattern ? { PathPattern: pathPattern, ...behavior } : behavior;
}

export function validateOptions(options) {
	const { aliases, originDomain, certificateArn, originVerifySecret } = options;
	if (!Array.isArray(aliases) || aliases.length === 0 || aliases.some((alias) => !/^[a-z0-9.-]+$/.test(alias))) {
		throw new Error("aliases must list at least one lowercase hostname");
	}
	if (typeof originDomain !== "string" || !/^[a-z0-9.-]+$/.test(originDomain) || aliases.includes(originDomain)) {
		throw new Error("originDomain must be a hostname that is not one of the aliases");
	}
	if (typeof certificateArn !== "string" || !/^arn:aws:acm:us-east-1:\d{12}:certificate\/[0-9a-f-]+$/.test(certificateArn)) {
		throw new Error("certificateArn must be an ACM certificate in us-east-1");
	}
	if (typeof originVerifySecret !== "string" || originVerifySecret.length < 32 || /\s/.test(originVerifySecret)) {
		throw new Error("originVerifySecret must be at least 32 characters without whitespace");
	}
}

export function createDistributionConfig(options) {
	validateOptions(options);
	const {
		aliases,
		originDomain,
		certificateArn,
		originVerifySecret,
		callerReference = `gatu-terminal-${randomUUID()}`,
		comment = "gatu trading terminal: static shell and API origin",
		policies = MANAGED_POLICIES,
	} = options;

	return {
		CallerReference: callerReference,
		Aliases: list(aliases),
		DefaultRootObject: "",
		Origins: list([
			{
				Id: ORIGIN_ID,
				DomainName: originDomain,
				OriginPath: "",
				CustomHeaders: list([{ HeaderName: ORIGIN_VERIFY_HEADER, HeaderValue: originVerifySecret }]),
				CustomOriginConfig: {
					HTTPPort: 80,
					HTTPSPort: 443,
					OriginProtocolPolicy: "https-only",
					OriginSslProtocols: list(["TLSv1.2"]),
					OriginReadTimeout: 30,
					OriginKeepaliveTimeout: 5,
				},
				ConnectionAttempts: 3,
				ConnectionTimeout: 10,
				OriginShield: { Enabled: false },
			},
		]),
		OriginGroups: list([]),
		DefaultCacheBehavior: cacheBehavior({
			cachePolicyId: policies.cacheDisabled,
			originRequestPolicyId: policies.originAllViewerAndCloudFrontHeaders,
			methods: ALL_METHODS,
		}),
		CacheBehaviors: list(
			CACHED_PATH_PATTERNS.map((pathPattern) =>
				cacheBehavior({
					pathPattern,
					cachePolicyId: policies.cacheOptimized,
					originRequestPolicyId: policies.originAllViewer,
					methods: READ_METHODS,
				}),
			),
		),
		CustomErrorResponses: list([]),
		Comment: comment,
		Logging: { Enabled: false, IncludeCookies: false, Bucket: "", Prefix: "" },
		PriceClass: "PriceClass_All",
		Enabled: true,
		ViewerCertificate: {
			ACMCertificateArn: certificateArn,
			SSLSupportMethod: "sni-only",
			MinimumProtocolVersion: "TLSv1.2_2021",
			Certificate: certificateArn,
			CertificateSource: "acm",
		},
		Restrictions: { GeoRestriction: { RestrictionType: "none", Quantity: 0, Items: [] } },
		WebACLId: "",
		HttpVersion: "http2and3",
		IsIPV6Enabled: true,
		Staging: false,
	};
}

function readArgs(argv) {
	const options = { aliases: [] };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		const [flag, inline] = argument.split("=", 2);
		const value = inline ?? argv[++index];
		if (flag === "--alias") options.aliases.push(value);
		else if (flag === "--origin") options.originDomain = value;
		else if (flag === "--certificate-arn") options.certificateArn = value;
		else if (flag === "--origin-verify-secret") options.originVerifySecret = value;
		else if (flag === "--comment") options.comment = value;
		else throw new Error(`Unknown argument ${argument}`);
	}
	return options;
}

function main() {
	const options = readArgs(process.argv.slice(2));
	options.originVerifySecret ??= process.env.GATU_ORIGIN_VERIFY_SECRET;
	process.stdout.write(`${JSON.stringify(createDistributionConfig(options), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
