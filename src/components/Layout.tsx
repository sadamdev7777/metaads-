import ChatBubble from "./ChatBubble";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { pendingCount } from "../lib/live";
import { useStore } from "../lib/store";

const NAV: { to: string; label: string; step?: string }[] = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/approvals", label: "Approvals" },
  { to: "/products", label: "Products", step: "1" },
  { to: "/media", label: "Media", step: "2" },
  { to: "/campaigns", label: "Campaigns", step: "3" },
  { to: "/analysis", label: "Analysis", step: "4" },
  { to: "/ai-office", label: "AI Office" },
  { to: "/history", label: "History" },
  { to: "/settings", label: "Settings" },
];

export default function Layout() {
  const { user, demo, signOut } = useAuth();
  const { toast } = useStore();
  const [pending, setPending] = useState(0);
  const loc0 = useLocation();
  useEffect(() => {
    const refresh = () => void pendingCount().then(setPending);
    refresh();
    window.addEventListener("mtb:proposals", refresh);
    return () => window.removeEventListener("mtb:proposals", refresh);
  }, [loc0.pathname]);
  const approvals = { length: pending };
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  const links = (
    <nav aria-label="Main navigation" className="flex flex-col gap-1">
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm no-underline ${
              isActive ? "bg-brand font-bold text-white" : "font-medium text-ink hover:bg-[#ECEFEC]"
            }`
          }
        >
          {({ isActive }) => (
            <>
              {n.step ? (
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                    isActive ? "bg-white text-brand" : "bg-[#ECEFEC] text-muted"
                  }`}
                >
                  {n.step}
                </span>
              ) : (
                <span className="w-5" />
              )}
              {n.label}
              {n.to === "/approvals" && approvals.length > 0 && (
                <span
                  className={`ml-auto min-w-[22px] rounded-full px-1.5 py-px text-center text-xs font-bold ${
                    isActive ? "bg-white text-brand" : "bg-[#FBEFD5] text-[#8A5300]"
                  }`}
                >
                  {approvals.length}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col bg-ground text-ink md:flex-row">
      {/* Phone: top bar with a menu button */}
      <header className="flex items-center justify-between border-b border-line bg-white px-4 py-2 md:hidden">
        <div className="text-base font-bold">MTB Marketing AI</div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
          className="min-h-[44px] rounded-lg border border-[#9AA39E] bg-white px-3 text-sm font-semibold"
        >
          {open ? "Close menu" : "Menu"}
        </button>
      </header>
      {open && (
        <div id="mobile-menu" className="border-b border-line bg-white p-3 md:hidden">
          {links}
          <button type="button" onClick={() => void signOut()} className="mt-2 min-h-[44px] px-3 text-sm font-semibold text-brand">
            Sign out
          </button>
        </div>
      )}

      {/* Desktop: sidebar */}
      <aside className="hidden w-[232px] flex-none flex-col gap-4 border-r border-line bg-white px-3.5 py-5 md:flex">
        <div className="px-3">
          <div className="text-base font-bold">MTB Marketing AI</div>
          <div className="text-xs text-muted">Muslimtravelbug</div>
        </div>
        {links}
        <p className="m-0 px-3 text-xs text-muted">Steps 1 to 4 follow the work: load products, add media, run campaigns, analyse.</p>
        <div className="mt-auto px-3 text-xs text-muted">
          <div className="break-all font-semibold text-ink">{user?.name}</div>
          <div className="break-all">{user?.email}</div>
          <button type="button" onClick={() => void signOut()} className="mt-1 min-h-[44px] text-[13px] font-semibold text-brand">
            Sign out
          </button>
        </div>
      </aside>

      <main key={loc.pathname} className="flex min-w-0 flex-1 flex-col gap-3.5 px-3 pb-24 pt-4 sm:gap-5 sm:px-4 sm:pt-6 md:px-7 md:pt-7">
        {demo && (
          <div className="rounded-xl bg-[#FBEFD5] px-4 py-3 text-sm text-[#5C3900]">
            <span className="font-bold">Demo mode.</span> Supabase is not connected in this build, so sign-in is not checked and the activity log
            stays in this browser.
          </div>
        )}
        <Outlet />
      </main>

      <ChatBubble />
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 flex justify-center px-4">
        {toast && <div className="max-w-xl rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white shadow-lg">{toast}</div>}
      </div>
    </div>
  );
}
