/* Research-question figures derive their values from the current TSAR snapshot. */
document.addEventListener("DOMContentLoaded", () => {
  const records = window.NAM_METHOD_RECORDS || [];
  const palette = ["#0a3d80", "#347fd6", "#2ca6b0", "#8ad6df", "#7a67c7", "#e6a33a"];
  const countValues = (key, multi = false) => {
    const counts = new Map();
    records.forEach(record => {
      const values = multi ? String(record[key] || "Unknown").split(/[;,]/) : [record[key] || "Unknown"];
      values.map(value => value.trim()).filter(Boolean).forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
    });
    return [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  };
  const specs = {
    stage: { title: "Distribution across validation pathways", description: "Regulatory stage recorded for each TSAR-listed method.", values: () => countValues("stage") },
    status: { title: "Regulatory outcomes", description: "Current regulatory status recorded for each TSAR-listed method.", values: () => countValues("status") },
    methodology: { title: "Method-category distribution", description: "Method categories are multi-label where a record contains more than one approach.", values: () => countValues("methodology", true) },
    endpoint: { title: "Toxicological endpoint indicators", description: "Endpoint indicators are multi-label, so one method can contribute to more than one category.", values: () => countValues("endpoint", true) }
  };
  const format = value => `${(value / Math.max(1, records.length) * 100).toFixed(1)}% (n=${value})`;
  document.querySelectorAll("[data-viz]").forEach(card => card.addEventListener("click", () => {
    const spec = specs[card.dataset.viz]; if (!spec) return;
    const values = spec.values(); const max = Math.max(1, ...values.map(item => item.value));
    const backdrop = document.createElement("div"); backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<section class="figure-modal panel card" role="dialog" aria-modal="true" aria-labelledby="figure-title"><header><div><span>Interactive data view</span><h2 id="figure-title">${spec.title}</h2><p>${spec.description} Denominator: ${records.length} records.</p></div><button class="btn btn-sm" data-close aria-label="Close figure">×</button></header><div class="figure-chart">${values.map((item, index) => `<div><span>${item.label}</span><div><i title="${item.label}: ${format(item.value)}" style="width:${item.value / max * 100}%;background:${palette[index % palette.length]}"></i></div><strong>${format(item.value)}</strong></div>`).join("")}</div><footer><span>Values use % (n=x).</span><a href="../analysis/analysis-explorer.html">Compare in Analysis Explorer →</a></footer></section>`;
    const close = () => backdrop.remove(); backdrop.addEventListener("mousedown", event => { if (event.target === backdrop) close(); }); backdrop.querySelector("[data-close]").addEventListener("click", close); document.body.append(backdrop);
  }));
});
