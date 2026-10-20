// Shared by the server layout and the client theme hook, so it can't live in a "use client" module.
export const THEME_KEY = "gympal.theme";

/**
 * Runs in <head> before first paint so a saved theme never flashes the other one,
 * and so Chinese pages get lang="zh-Hans" (which picks the right CJK font) immediately.
 * Kept as a string because it executes before any bundle loads.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;if(/(?:^|; )gympal-locale=zh(?:;|$)/.test(document.cookie))document.documentElement.lang="zh-Hans";}catch(e){}})();`;
