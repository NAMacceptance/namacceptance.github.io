/* Shared Dreamweaver-friendly behaviour. No build step required. */
document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.querySelector(".sidebar");
  const menuButton = document.querySelector(".menu-button");
  const overlay = document.querySelector(".menu-overlay");
  const closeMenu = () => { sidebar?.classList.remove("sidebar-open"); menuButton?.setAttribute("aria-expanded", "false"); };
  menuButton?.addEventListener("click", () => {
    const open = sidebar?.classList.toggle("sidebar-open");
    menuButton.setAttribute("aria-expanded", String(Boolean(open)));
  });
  overlay?.addEventListener("click", closeMenu);
  document.querySelectorAll(".sidebar a").forEach(link => link.addEventListener("click", closeMenu));

  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener("click", event => {
    const target = document.querySelector(link.getAttribute("href"));
    if (target) { event.preventDefault(); target.scrollIntoView({ behavior: "smooth" }); }
  }));

  document.querySelectorAll(".explorer-toolbar button, .analysis-actions button, .findings-tabs button, .figure-card, .method-button, .row-button, .show-more").forEach(button => {
    if (!button.closest("a")) button.setAttribute("title", button.getAttribute("title") || "Interactive in the published React version; this Dreamweaver copy is intended for visual content editing.");
  });
});
