import { i18n } from "@lingui/core";

i18n.loadAndActivate({ locale: "en", messages: {} });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
