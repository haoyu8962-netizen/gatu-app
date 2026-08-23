import { SEO_BASE_KEYWORDS, SEO_DEFAULTS } from "@/config/seo";

export interface PageSeo {
	title?: string;
	fullTitle?: boolean;
	ogTitle?: string;
	description?: string;
	path?: string;
	ogImage?: string;
	ogType?: "website" | "article";
	keywords?: readonly string[];
	noIndex?: boolean;
	publishedTime?: string;
	modifiedTime?: string;
	author?: string;
}

export interface ResolvedSeo {
	title: string;
	ogTitle: string;
	description: string;
	canonical: string;
	ogImage: string;
	ogImageAlt: string;
	ogType: "website" | "article";
	keywords: string;
	noIndex: boolean;
	publishedTime?: string;
	modifiedTime?: string;
	author?: string;
}

export function resolveSeo(options: PageSeo = {}): ResolvedSeo {
	const {
		title,
		fullTitle = false,
		ogTitle,
		description = SEO_DEFAULTS.defaultDescription,
		path = "/",
		ogImage,
		ogType = "website",
		keywords = [],
		noIndex = false,
		publishedTime,
		modifiedTime,
		author,
	} = options;

	const pageTitle = title ? (fullTitle ? title : `${title} — ${SEO_DEFAULTS.siteName}`) : SEO_DEFAULTS.defaultTitle;
	const socialTitle = ogTitle ?? (title ? pageTitle : SEO_DEFAULTS.defaultOgTitle);

	const canonical = new URL(path, SEO_DEFAULTS.siteUrl).toString().replace(/\/$/, path === "/" ? "/" : "");

	const resolvedImage = new URL(ogImage ?? SEO_DEFAULTS.ogImage, SEO_DEFAULTS.siteUrl).toString();

	const allKeywords = Array.from(new Set([...SEO_BASE_KEYWORDS, ...keywords])).join(", ");

	return {
		title: pageTitle,
		ogTitle: socialTitle,
		description,
		canonical,
		ogImage: resolvedImage,
		ogImageAlt: SEO_DEFAULTS.ogImageAlt,
		ogType,
		keywords: allKeywords,
		noIndex,
		publishedTime,
		modifiedTime,
		author,
	};
}

export function organizationSchema() {
	return {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: SEO_DEFAULTS.siteName,
		url: SEO_DEFAULTS.siteUrl,
		logo: new URL(SEO_DEFAULTS.logoImage, SEO_DEFAULTS.siteUrl).toString(),
	};
}

export function websiteSchema() {
	return {
		"@context": "https://schema.org",
		"@type": "WebSite",
		name: SEO_DEFAULTS.siteName,
		url: SEO_DEFAULTS.siteUrl,
		inLanguage: "en",
	};
}

export function softwareApplicationSchema() {
	return {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: SEO_DEFAULTS.siteName,
		description: SEO_DEFAULTS.defaultDescription,
		url: SEO_DEFAULTS.appUrl,
		applicationCategory: "FinanceApplication",
		operatingSystem: "Web",
		offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
		isAccessibleForFree: true,
		image: new URL(SEO_DEFAULTS.ogImage, SEO_DEFAULTS.siteUrl).toString(),
	};
}

export function blogSchema() {
	return {
		"@context": "https://schema.org",
		"@type": "Blog",
		name: `${SEO_DEFAULTS.siteName} Blog`,
		url: new URL("/blog", SEO_DEFAULTS.siteUrl).toString(),
		publisher: { "@type": "Organization", name: SEO_DEFAULTS.siteName, url: SEO_DEFAULTS.siteUrl },
	};
}

interface BlogPostingInput {
	title: string;
	description: string;
	slug: string;
	publishedTime: string;
	modifiedTime?: string;
	author?: string;
}

export function blogPostingSchema(post: BlogPostingInput) {
	const url = new URL(`/blog/${post.slug}`, SEO_DEFAULTS.siteUrl).toString();
	return {
		"@context": "https://schema.org",
		"@type": "BlogPosting",
		headline: post.title,
		description: post.description,
		datePublished: post.publishedTime,
		dateModified: post.modifiedTime ?? post.publishedTime,
		author: { "@type": "Person", name: post.author ?? SEO_DEFAULTS.siteName },
		publisher: {
			"@type": "Organization",
			name: SEO_DEFAULTS.siteName,
			url: SEO_DEFAULTS.siteUrl,
			logo: {
				"@type": "ImageObject",
				url: new URL(SEO_DEFAULTS.logoImage, SEO_DEFAULTS.siteUrl).toString(),
			},
		},
		mainEntityOfPage: { "@type": "WebPage", "@id": url },
		image: new URL(SEO_DEFAULTS.ogImage, SEO_DEFAULTS.siteUrl).toString(),
		url,
	};
}

interface BreadcrumbItem {
	name: string;
	path: string;
}

export function breadcrumbSchema(items: BreadcrumbItem[]) {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: new URL(item.path, SEO_DEFAULTS.siteUrl).toString(),
		})),
	};
}

export function faqSchema(faqs: ReadonlyArray<{ q: string; a: string }>) {
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: faqs.map((f) => ({
			"@type": "Question",
			name: f.q,
			acceptedAnswer: { "@type": "Answer", text: f.a },
		})),
	};
}
