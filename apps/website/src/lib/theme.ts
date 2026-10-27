// The website's light theme is the default. `?theme=dark` (kept for the rest of the browser session; `?theme=light`
// returns) switches the whole page to the dark token set in global.css for side-by-side comparison. The script runs in
// <head> before first paint, so the page never flashes the other theme; Base.astro adds its hash to the CSP.

import brand from "../../../../brand/brand.json" with { type: "json" };

const STORAGE_KEY = "website-theme";

export const THEME_QUERY_SCRIPT = [
	"(function(){var t;try{t=new URLSearchParams(location.search).get(\"theme\");",
	`if(t==="dark"||t==="light")sessionStorage.setItem("${STORAGE_KEY}",t);else t=sessionStorage.getItem("${STORAGE_KEY}")}catch(e){}`,
	'if(t!=="dark")return;var d=document.documentElement;d.dataset.theme="dark";',
	`var m=document.querySelector('meta[name="theme-color"]');if(m)m.content="${brand.pwa.themeColor}";`,
	"m=document.querySelector('meta[name=\"color-scheme\"]');if(m)m.content=\"dark\"})();",
].join("");
