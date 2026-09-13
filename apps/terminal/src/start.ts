import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { staticPagesRequestMiddleware } from "@/lib/static-pages/request-middleware";

const csrfMiddleware = createCsrfMiddleware({ filter: (context) => context.handlerType === "serverFn" });

export const startInstance = createStart(() => ({
	requestMiddleware: [staticPagesRequestMiddleware, csrfMiddleware],
}));
