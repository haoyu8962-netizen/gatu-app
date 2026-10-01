import brand from "../../../../brand/brand.json";

export const BRAND_NAME: string = brand.name.display;
export const SITE_URL = `https://${brand.domains.primary.apex}`;
export const APP_HOST: string = brand.domains.primary.app;
export const APP_URL = `https://${brand.domains.primary.app}`;
export const SUPPORT_EMAIL: string = brand.emails.support;
