// CloudFront Function (viewer-response, JavaScript runtime 2.0) for the gatu trading terminal.
//
// The static shell cannot carry a per-path route marker in its body, so the viewer-request
// function tags join paths on the request and this function surfaces the tag as a response
// header. Deployment health checks read `x-gatu-route: referral-join` instead of the meta tag.
function handler(event) {
	var request = event.request;
	var response = event.response;
	var route = request.headers['x-gatu-route'];
	if (route && route.value) {
		response.headers['x-gatu-route'] = { value: route.value };
	}
	return response;
}
