// Shared by the server layout and the client theme hook, so it can't live in a "use client" module.
export const THEME_KEY = "gympal.theme";

/** Where each theme's background photo is saved on this device. */
export const BACKGROUND_KEYS = { light: "gympal.background.light", dark: "gympal.background.dark" } as const;

/** The status bar's colour for each theme: the page background. */
export const THEME_COLORS = { light: "#faf9f5", dark: "#181715" } as const;

/**
 * Runs in <head> before first paint so a saved theme or background photo never
 * flashes the default, and so Chinese pages get lang="zh-Hans" (which picks the
 * right CJK font) immediately. Kept as a string because it executes before any
 * bundle loads. It also writes the theme-color metas: they live outside React so
 * the metadata Next re-renders on each navigation never resets them (see theme.ts).
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,t=null;try{t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")d.dataset.theme=t;var k=${JSON.stringify(BACKGROUND_KEYS)};for(var m in k){var b=localStorage.getItem(k[m]);if(b){d.style.setProperty("--bg-photo-"+m,'url("'+b+'")');d.dataset.bgPhoto="";}}if(/(?:^|; )gympal-locale=zh(?:;|$)/.test(document.cookie))d.lang="zh-Hans";}catch(e){}var c=${JSON.stringify(THEME_COLORS)};(t==="light"||t==="dark"?[t]:["light","dark"]).forEach(function(s,_,a){var x=document.createElement("meta");x.name="theme-color";x.content=c[s];if(a.length>1)x.media="(prefers-color-scheme: "+s+")";document.head.appendChild(x);});})();`;
