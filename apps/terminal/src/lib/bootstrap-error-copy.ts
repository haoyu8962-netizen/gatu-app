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
	ja: {
		heading: "エラーが発生しました",
		description: "取引ターミナルを安全に起動できませんでした。取引する前に再読み込みしてください。",
		reload: "ターミナルを再読み込み",
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

export function getBootstrapFatalCopy(locale: LocaleCode): TerminalFatalCopy {
	return BOOTSTRAP_FATAL_COPY[locale];
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
