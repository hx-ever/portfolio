/**
 * Route transition: the template wrapper remounts on every navigation (Next
 * template.tsx convention), so each page fades up from the dark background —
 * a quick fade-through-dark rather than a hard cut. Duration lives in
 * globals.css (.route-fade); prefers-reduced-motion collapses it globally.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-fade">{children}</div>;
}
