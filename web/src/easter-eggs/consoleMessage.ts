import { CONSOLE } from "./config";

// Module-level guard: survives StrictMode double effects and client-side
// route changes (the module isn't re-evaluated), resets on a full reload.
let printed = false;

/** Reads a design token from :root so no colour is duplicated here. */
const token = (name: string, root: CSSStyleDeclaration) =>
  root.getPropertyValue(name).trim();

/**
 * Prints the DevTools note once per full page load. Every line sits on the
 * site's own near-black as a small chip, so the off-white and silver text
 * stays legible in both light- and dark-themed DevTools.
 */
export function printConsoleMessage() {
  if (printed || typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production" && !CONSOLE.printInDevelopment) return;
  printed = true;

  const root = getComputedStyle(document.documentElement);
  const bg = token("--bg", root);
  const fg = token("--fg", root);
  const muted = token("--muted", root);
  const dim = token("--dim", root);
  const accent = token("--signature", root);
  const mono = `${token("--font-mono", root) || "'IBM Plex Mono'"}, ui-monospace, SFMono-Regular, Menlo, monospace`;

  const chip = `background:${bg};font-family:${mono};padding:4px 10px;border-radius:6px;line-height:1.7;`;

  console.log(`%c${CONSOLE.heading}`, `${chip}color:${accent};font-size:18px;font-weight:700;padding:8px 12px;`);
  console.log(`%c${CONSOLE.intro}`, `${chip}color:${muted};font-size:12px;`);
  console.log(`%c${CONSOLE.craft}`, `${chip}color:${fg};font-size:12px;`);
  console.log(
    `%c${CONSOLE.contactLead}%c${CONSOLE.contactLinks}`,
    `${chip}color:${fg};font-size:12px;border-radius:6px 0 0 6px;padding-right:0;`,
    `${chip}color:${accent};font-size:12px;font-weight:600;border-radius:0 6px 6px 0;padding-left:0;`
  );
  console.log(`%c${CONSOLE.hint}`, `${chip}color:${dim};font-size:11px;font-style:italic;`);
}
