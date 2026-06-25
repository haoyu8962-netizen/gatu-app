import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const serverArg = args[0] && !args[0].startsWith("-") ? args.shift() : ".output/server/index.mjs";
const serverPath = resolve(process.cwd(), serverArg);

for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if (arg === "--host") {
		process.env.HOST ||= args[i + 1];
		i++;
	} else if (arg.startsWith("--host=")) {
		process.env.HOST ||= arg.slice("--host=".length);
	} else if (arg === "--port") {
		process.env.PORT ||= args[i + 1];
		i++;
	} else if (arg.startsWith("--port=")) {
		process.env.PORT ||= arg.slice("--port=".length);
	}
}

if (!existsSync(serverPath)) {
	console.error(`Nitro server output not found: ${serverPath}`);
	console.error("Run `pnpm build` before `pnpm serve`.");
	process.exit(1);
}

const child = spawn(process.execPath, [serverPath], {
	stdio: "inherit",
	env: process.env,
});

child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exit(code ?? 0);
});
