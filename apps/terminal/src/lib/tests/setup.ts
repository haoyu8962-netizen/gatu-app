import net from "node:net";
import { i18n } from "@lingui/core";

i18n.loadAndActivate({ locale: "en", messages: {} });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// A unit test never reaches another machine: a connection to anything but the loopback interface fails
// here, on a developer machine and on a CI runner alike (ADR 0056).
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(this: net.Socket, ...args: unknown[]) {
	const first = Array.isArray(args[0]) ? args[0][0] : args[0];
	const second = Array.isArray(args[0]) ? undefined : args[1];
	const options = typeof first === "object" && first !== null ? (first as { host?: string; path?: string }) : undefined;
	// Node reads a numeric string as a port, not as a pipe name.
	const isLocalPath = (typeof first === "string" && !(Number(first) >= 0)) || typeof options?.path === "string";
	const host = options ? (options.host ?? "localhost") : typeof second === "string" ? second : "localhost";
	if (!isLocalPath && !LOOPBACK_HOSTS.has(host)) {
		throw new Error(`Unit tests must not open network connections (attempted ${host}); stub the transport instead.`);
	}
	return Reflect.apply(connect, this, args);
} as typeof net.Socket.prototype.connect;
