"use strict";

const http = require("node:http");

const originalEmit = http.Server.prototype.emit;
http.Server.prototype.emit = function emit(event, request, response) {
	if (event === "request" && request && response && isMalformedReferralJoinUrl(request.url)) {
		response.writeHead(404, {
			"cache-control": "no-store",
			"content-type": "text/plain; charset=utf-8",
			"referrer-policy": "no-referrer",
			"x-robots-tag": "noindex, nofollow",
		});
		response.end("Not Found");
		return true;
	}
	return Reflect.apply(originalEmit, this, arguments);
};

function isMalformedReferralJoinUrl(url) {
	const pathname = typeof url === "string" ? url.split(/[?#]/, 1)[0] : "";
	if (pathname !== "/join" && !pathname.startsWith("/join/")) return false;
	try {
		decodeURI(pathname);
		return false;
	} catch {
		return true;
	}
}

module.exports = { isMalformedReferralJoinUrl };
