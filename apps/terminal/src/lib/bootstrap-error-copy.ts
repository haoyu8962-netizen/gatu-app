import { STORAGE_KEYS } from "@/config/app";
import { defaultLocale, isRtlLocale, isValidLocale, type LocaleCode } from "@/config/i18n";

export interface TerminalFatalCopy {
	description: string;
	heading: string;
	reload: string;
}

const BOOTSTRAP_FATAL_COPY: Readonly<Record<LocaleCode, TerminalFatalCopy>> = {
	en: {
		heading: "Something went wrong",
		description: "The terminal could not start safely. Reload it before trading.",
		reload: "Reload terminal",
	},
	zh: {
		heading: "出错了",
		description: "交易终端无法安全启动。请重新加载后再交易。",
		reload: "重新加载交易终端",
	},
	hi: {
		heading: "कुछ गलत हो गया",
		description: "टर्मिनल सुरक्षित रूप से शुरू नहीं हो सका। ट्रेडिंग से पहले इसे फिर से लोड करें।",
		reload: "टर्मिनल फिर से लोड करें",
	},
	es: {
		heading: "Algo salió mal",
		description: "El terminal no pudo iniciarse de forma segura. Vuelva a cargarlo antes de operar.",
		reload: "Volver a cargar el terminal",
	},
	fr: {
		heading: "Une erreur s'est produite",
		description: "Le terminal n’a pas pu démarrer en toute sécurité. Rechargez-le avant de trader.",
		reload: "Recharger le terminal",
	},
	ar: {
		heading: "حدث خطأ ما",
		description: "تعذّر تشغيل المنصة بأمان. أعد تحميلها قبل التداول.",
		reload: "إعادة تحميل المنصة",
	},
};

/**
 * Shown instead of the application when the pairing link could not be removed from the address bar,
 * or when its captured value went missing: a terminal security notice, not a startup placeholder.
 */
const PAIRING_BLOCKED_COPY: Readonly<Record<LocaleCode, TerminalFatalCopy>> = {
	en: {
		heading: "This link could not be opened safely",
		description: "Close this tab and do not share the link. On your desktop, create a new QR code and scan it again.",
		reload: "Open the scan page",
	},
	zh: {
		heading: "无法安全打开此链接",
		description: "请关闭此标签页，不要分享该链接。回到桌面重新生成二维码，再扫描一次。",
		reload: "打开扫码页面",
	},
	hi: {
		heading: "यह लिंक सुरक्षित रूप से नहीं खोला जा सका",
		description: "इस टैब को बंद करें और लिंक साझा न करें। अपने डेस्कटॉप पर नया QR कोड बनाएँ और उसे फिर से स्कैन करें।",
		reload: "स्कैन पेज खोलें",
	},
	es: {
		heading: "Este enlace no se pudo abrir de forma segura",
		description:
			"Cierre esta pestaña y no comparta el enlace. En su ordenador, cree un nuevo código QR y vuelva a escanearlo.",
		reload: "Abrir la página de escaneo",
	},
	fr: {
		heading: "Ce lien n’a pas pu être ouvert en toute sécurité",
		description:
			"Fermez cet onglet et ne partagez pas le lien. Sur votre ordinateur, créez un nouveau code QR et scannez-le à nouveau.",
		reload: "Ouvrir la page de scan",
	},
	ar: {
		heading: "تعذّر فتح هذا الرابط بأمان",
		description: "أغلق علامة التبويب هذه ولا تشارك الرابط. أنشئ رمز QR جديدًا على حاسوبك وامسحه مرة أخرى.",
		reload: "فتح صفحة المسح",
	},
};

export type BootstrapFatalVariant = "startup" | "pairing-blocked";

export function getBootstrapFatalCopy(
	locale: LocaleCode,
	variant: BootstrapFatalVariant = "startup",
): TerminalFatalCopy {
	return variant === "pairing-blocked" ? PAIRING_BLOCKED_COPY[locale] : BOOTSTRAP_FATAL_COPY[locale];
}

export function getBootstrapFatalLocale(storage: Pick<Storage, "getItem"> | null = getBrowserStorage()): LocaleCode {
	try {
		const stored = storage?.getItem(STORAGE_KEYS.LOCALE);
		return stored && isValidLocale(stored) ? stored : defaultLocale;
	} catch {
		return defaultLocale;
	}
}

export function getBootstrapFatalDirection(locale: LocaleCode): "ltr" | "rtl" {
	return isRtlLocale(locale) ? "rtl" : "ltr";
}

function getBrowserStorage(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
