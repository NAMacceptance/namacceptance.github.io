/* Shared navigation behaviour for the structured static site. */
const initialiseNamShell = () => {
  const sidebar = document.querySelector(".sidebar");
  const button = document.querySelector(".menu-button");
  let overlay = document.querySelector(".menu-overlay");
  if (!overlay) {
    overlay = document.createElement("button");
    overlay.className = "menu-overlay";
    overlay.setAttribute("aria-label", "Close navigation");
    document.body.append(overlay);
  }
  const setMenuOpen = open => {
    sidebar?.classList.toggle("sidebar-open", open);
    overlay.classList.toggle("menu-overlay-visible", open);
    button?.setAttribute("aria-expanded", String(open));
  };
  const close = () => setMenuOpen(false);
  button?.addEventListener("click", () => setMenuOpen(!sidebar?.classList.contains("sidebar-open")));
  document.querySelectorAll(".nav-group").forEach(group => {
    const toggle = group.querySelector(".nav-group-toggle");
    const setOpen = open => { group.classList.toggle("expanded", open); toggle?.setAttribute("aria-expanded", String(open)); };
    toggle?.addEventListener("click", () => setOpen(!group.classList.contains("expanded")));
    group.addEventListener("keydown", event => { if (event.key === "Escape") { setOpen(false); toggle?.focus(); } });
  });
  overlay.addEventListener("click", close);
  document.querySelectorAll(".sidebar a").forEach(link => link.addEventListener("click", close));
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener("click", event => {
    const target = document.querySelector(link.getAttribute("href"));
    if (target) { event.preventDefault(); target.scrollIntoView({ behavior: "smooth" }); }
  }));
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialiseNamShell, { once: true });
else initialiseNamShell();
