// Shared by the server layout and the client theme hook, so it can't live in a "use client" module.
export const THEME_KEY = "gympal.theme";

/** Where each theme's background photo is saved on this device. */
export const BACKGROUND_KEYS = { light: "gympal.background.light", dark: "gympal.background.dark" } as const;

/**
 * Runs in <head> before first paint so a saved theme or background photo never
 * flashes the default, and so Chinese pages get lang="zh-Hans" (which picks the
 * right CJK font) immediately. Kept as a string because it executes before any
 * bundle loads.
 */
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement;var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")d.dataset.theme=t;var k=${JSON.stringify(BACKGROUND_KEYS)};for(var m in k){var b=localStorage.getItem(k[m]);if(b){d.style.setProperty("--bg-photo-"+m,'url("'+b+'")');d.dataset.bgPhoto="";}}if(/(?:^|; )gympal-locale=zh(?:;|$)/.test(document.cookie))d.lang="zh-Hans";}catch(e){}})();`;
