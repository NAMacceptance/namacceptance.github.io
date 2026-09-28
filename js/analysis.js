/* Analysis Explorer: reads the editable select elements, builds the grouped result and keeps the URL shareable. */
document.addEventListener("DOMContentLoaded", () => {
  const records = window.NAM_METHOD_RECORDS || [];
  const chart = document.querySelector("[data-analysis-chart]");
  const recordGrid = document.querySelector("[data-analysis-records]");
  if (!chart || !recordGrid) return;
  const result = chart.closest(".analysis-result");

  /* ---------- Vocabulary ---------- */
  const stageCodeLabels = {
    SUB_ASSESS: "Submission · under assessment",
    SUB_FINAL: "Submission · assessment finalised",
    SUB_NOTVAL: "Submission · not considered for validation",
    SUB_STOP: "Submission · stopped",
    VAL_PLAN: "Validation · planning",
    VAL_ONGO: "Validation · ongoing",
    VAL_FINAL: "Validation · finalised",
    VAL_STOP: "Validation · stopped",
    VAL_PEER_FINAL: "Peer review · finalised",
    VAL_PEER_STOP: "Peer review · stopped",
    REC_NA: "Recommendation · not applicable",
    REG_DRAFT: "Regulatory · drafting new standard",
    REG_OTHERSTAGE: "Regulatory · revising existing standard",
    REG_PUBL: "Regulatory · published",
    REG_ADOPT: "Regulatory · adopted/published",
    REG_STOP: "Regulatory · stopped",
    UNKNOWN_UNKNOWN: "Stage unrecorded",
    "No external update recorded": "No external update recorded"
  };
  const variables = {
    workflowStep: { label: "Original workflow step", order: ["Submission", "Validation", "Peer-review", "Recommendation", "Regulatory acceptance/Standards", "Unknown"] },
    yearReceived: { label: "Year received", numeric: true },
    organisation: { label: "Organisation" },
    code: { label: "TSAR snapshot stage", codes: true, order: Object.keys(stageCodeLabels) },
    status: { label: "Regulatory status", order: ["Ongoing", "Acceptance pending", "Finalised", "Adopted", "Rejected", "Discontinued", "Not applicable", "Unknown"] },
    stage: { label: "Regulatory stage", order: ["Test Submission", "Validation", "Regulatory assessment", "Unknown"] },
    evidenceUpdatedStage: { label: "External step/stage", codes: true, order: Object.keys(stageCodeLabels) },
    progressionBeyondTsar: { label: "Progression beyond TSAR", order: ["Progressed beyond TSAR snapshot", "Stage revised, no progression", "No change from TSAR snapshot", "No external evidence recorded"] },
    caseStudy: { label: "Case-study sample", order: ["Direct case study", "Borderline transition case", "Not in case-study sample"] },
    bottlenecks: { label: "Bottleneck profile", multi: true },
    bottleneckCount: { label: "Number of bottleneck signals", numeric: true },
    threeR: { label: "3R category", order: ["Replacement", "Reduction", "Refinement", "Unknown"] },
    animalUseImpact: { label: "Animal-use impact", order: ["Replacement", "Reduction", "Refinement", "Regulatory waiver/removal", "Unknown"] },
    endpoint: { label: "Endpoint category", multi: true },
    methodology: { label: "Core methodology", multi: true },
    applicationDomain: { label: "Application domain", multi: true },
    applicationDomainExpert: { label: "Researcher application domain", multi: true }
  };
  const naturalGroups = new Set(["stage", "workflowStep", "status", "threeR", "animalUseImpact", "progressionBeyondTsar", "caseStudy"]);
  const palette = ["#0a3d80", "#347fd6", "#2ca6b0", "#e6a33a", "#7a67c7", "#d0605e", "#5a9e4b", "#8ad6df", "#b07aa1", "#9c755f", "#f2c14e", "#6b7c93", "#1f7a8c", "#c9a0dc", "#3d5a80", "#e07a5f", "#81b29a", "#bab0ac"];

  const labelOf = (key, value) => (variables[key]?.codes && stageCodeLabels[value] ? stageCodeLabels[value] : value);
  const parts = (record, key) => {
    const raw = record[key];
    const values = variables[key]?.multi ? String(raw || "Unknown").split(";") : [raw === 0 ? "0" : raw || "Unknown"];
    return values.map(value => String(value).trim()).filter(Boolean);
  };
  const compareValues = (key, a, b) => {
    const spec = variables[key] || {};
    if (spec.numeric) return Number(a) - Number(b);
    if (spec.order) {
      const ia = spec.order.indexOf(a), ib = spec.order.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    }
    return String(labelOf(key, a)).localeCompare(String(labelOf(key, b)), "en", { numeric: true });
  };
  const esc = value => String(value ?? "—").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
  const pct = (value, total) => (total ? (value / total * 100).toFixed(1) : "0.0") + "%";
  const round = value => Math.round(value * 1000) / 1000;
  const niceTicks = (max, integer) => {
    if (!(max > 0)) return [0, 1];
    const raw = max / 5, mag = 10 ** Math.floor(Math.log10(raw)), norm = raw / mag;
    let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    if (integer) step = Math.max(1, Math.round(step));
    const ticks = [];
    for (let v = 0; ; v += step) { ticks.push(round(v)); if (v >= max - 1e-9) break; }
    return ticks;
  };

  /* ---------- Controls ---------- */
  const filterSelects = [...document.querySelectorAll(".analysis-filters select[data-analysis-filter]")];
  const filters = Object.fromEntries(filterSelects.map(select => [select.dataset.analysisFilter, select]));
  const groupSelect = document.querySelector('[data-analysis-filter="group"]');
  const splitSelect = document.querySelector('[data-analysis-filter="split"]');
  const sortSelect = document.querySelector("[data-analysis-sort]");
  const scaleSelect = document.querySelector("[data-analysis-scale]");
  const topSelect = document.querySelector("[data-analysis-top]");
  const swapButton = document.querySelector("[data-action='swap']");
  const filterLabel = select => select.closest("label")?.querySelector("span")?.textContent.trim() || select.dataset.analysisFilter;

  // Rebuild every filter from the data so the choices always match the snapshot, with record counts.
  filterSelects.forEach(select => {
    const key = select.dataset.analysisFilter;
    const counts = new Map();
    records.forEach(record => new Set(parts(record, key)).forEach(value => counts.set(value, (counts.get(value) || 0) + 1)));
    const choices = [...counts.keys()].sort((a, b) => key === "yearReceived" ? Number(b) - Number(a) : compareValues(key, a, b));
    select.replaceChildren(new Option(select.options[0]?.textContent || "All", ""), ...choices.map(choice => new Option(`${labelOf(key, choice)} (${counts.get(choice)})`, choice)));
  });

  let view = "graph", measure = "percent", orient = "horizontal", size = "m", visible = 12, focus = null;
  const hidden = new Set();
  const scale = () => scaleSelect?.value || "fit";
  const top = () => Number(topSelect?.value || 0);

  const activeFilters = () => filterSelects.filter(select => select.value);
  const filtered = () => records.filter(record => activeFilters().every(select => parts(record, select.dataset.analysisFilter).includes(select.value)));

  /* ---------- State in the URL ---------- */
  const syncUrl = () => {
    const params = new URLSearchParams();
    if (groupSelect.value !== "status") params.set("group", groupSelect.value);
    if (splitSelect.value !== "none") params.set("split", splitSelect.value);
    if (view !== "graph") params.set("view", view);
    if (measure !== "percent") params.set("measure", measure);
    if (orient !== "horizontal") params.set("orient", orient);
    if (size !== "m") params.set("size", size);
    if (scale() !== "fit") params.set("scale", scale());
    if (top()) params.set("top", top());
    if (sortSelect && sortSelect.value !== "count") params.set("sort", sortSelect.value);
    if (hidden.size) params.set("hide", [...hidden].join("~"));
    activeFilters().forEach(select => params.set("f_" + select.dataset.analysisFilter, select.value));
    const query = params.toString();
    try { history.replaceState(null, "", location.pathname + (query ? "?" + query : "")); } catch { /* some browsers block this on file:// */ }
  };
  const readUrl = () => {
    const params = new URLSearchParams(location.search);
    const setIfValid = (select, value) => { if (select && value && [...select.options].some(o => o.value === value)) select.value = value; };
    setIfValid(groupSelect, params.get("group"));
    setIfValid(splitSelect, params.get("split"));
    setIfValid(sortSelect, params.get("sort"));
    setIfValid(scaleSelect, params.get("scale"));
    setIfValid(topSelect, params.get("top"));
    if (params.get("view") === "table") view = "table";
    if (params.get("measure") === "count") measure = "count";
    if (params.get("orient") === "vertical") orient = "vertical";
    if (["s", "l"].includes(params.get("size"))) size = params.get("size");
    (params.get("hide") || "").split("~").filter(Boolean).forEach(name => hidden.add(name));
    filterSelects.forEach(select => setIfValid(select, params.get("f_" + select.dataset.analysisFilter)));
  };

  /* ---------- Calculations ---------- */
  const compute = data => {
    const group = groupSelect.value, split = splitSelect.value;
    const counts = new Map(), groupTotals = new Map(), splitTotals = new Map();
    data.forEach(record => {
      const splitValues = split === "none" ? ["Records"] : [...new Set(parts(record, split))];
      [...new Set(parts(record, group))].forEach(groupName => {
        if (!counts.has(groupName)) counts.set(groupName, new Map());
        groupTotals.set(groupName, (groupTotals.get(groupName) || 0) + 1);
        splitValues.forEach(splitName => {
          const cell = counts.get(groupName);
          cell.set(splitName, (cell.get(splitName) || 0) + 1);
        });
      });
      splitValues.forEach(splitName => splitTotals.set(splitName, (splitTotals.get(splitName) || 0) + 1));
    });
    const sort = sortSelect?.value || "count";
    const rows = [...counts].map(([name, cells]) => ({ name, cells, total: groupTotals.get(name) }));
    rows.sort((a, b) => sort === "natural" ? compareValues(group, a.name, b.name) : sort === "alpha" ? String(labelOf(group, a.name)).localeCompare(String(labelOf(group, b.name))) : b.total - a.total || compareValues(group, a.name, b.name));
    const splitNames = [...splitTotals.keys()].sort((a, b) => split === "none" ? 0 : compareValues(split, a, b));
    return { group, split, rows, splitNames, splitTotals };
  };

  // Everything the graph and the image export need: visible rows, segments, axis and bar lengths.
  const prepare = data => {
    const c = compute(data);
    const { rows, split, splitNames } = c;
    let shown = rows;
    if (top() && rows.length > top()) {
      const keep = new Set([...rows].sort((a, b) => b.total - a.total).slice(0, top()).map(row => row.name));
      shown = rows.filter(row => keep.has(row.name));
    }
    const series = split === "none" ? ["Records"] : splitNames.filter(name => !hidden.has(name));
    const colorOf = name => split === "none" ? palette[0] : palette[splitNames.indexOf(name) % palette.length];
    const segs = row => split === "none" ? [{ name: "Records", n: row.total, color: palette[0] }] : series.filter(name => row.cells.get(name)).map(name => ({ name, n: row.cells.get(name), color: colorOf(name) }));
    const sum = row => segs(row).reduce((a, s) => a + s.n, 0);
    const effScale = scale() === "share" && split === "none" ? "fit" : scale();
    const denom = Math.max(1, data.length);
    const toUnit = n => measure === "count" ? n : n / denom * 100;
    let axis;
    if (effScale === "share") axis = { max: 100, ticks: [0, 25, 50, 75, 100], unit: "%", title: "Share within each bar (%)" };
    else {
      const rawMax = Math.max(1, ...shown.map(sum), effScale === "full" ? denom : 0);
      const ticks = niceTicks(toUnit(rawMax), measure === "count");
      axis = { max: ticks[ticks.length - 1], ticks, unit: measure === "count" ? "" : "%", title: measure === "count" ? "Number of records" : `Percent of the ${data.length} selected records` };
    }
    const length = row => effScale === "share" ? (sum(row) ? 100 : 0) : toUnit(sum(row)) / axis.max * 100;
    return { ...c, shown, series, segs, sum, length, axis, effScale, colorOf, hiddenCats: rows.length - shown.length };
  };

  /* ---------- Rendering ---------- */
  const summaryEl = result.querySelector("[data-analysis-summary]");
  const noteEl = result.querySelector("[data-analysis-note]");
  const chipsEl = document.querySelector("[data-active-filters]");
  const filterBadge = document.querySelector("[data-filter-badge]");
  const recordsHeading = document.querySelector("[data-records-summary]");
  const focusEl = document.querySelector("[data-records-focus]");
  const optionsEl = document.querySelector("[data-chart-options]");

  const valueText = (value, total) => measure === "count" ? `${value} <small class="analysis-count">${pct(value, total)}</small>` : `${pct(value, total)} <small class="analysis-count">(n=${value})</small>`;
  const tickText = (axis, t) => `${t}${axis.unit}`;
  const segTitle = (p, row, s) => `${labelOf(p.split, s.name)}: ${s.n} of ${row.total} records (${pct(s.n, row.total)} of this bar)`;

  const drawHorizontal = (p, data) => {
    const grid = p.axis.ticks.map(t => `<b class="gridline" style="left:${t / p.axis.max * 100}%"></b>`).join("");
    return p.shown.map(row => {
      const total = p.sum(row);
      const segments = p.segs(row).map(s => `<i title="${esc(segTitle(p, row, s))}" style="width:${total ? s.n / total * 100 : 0}%;background:${s.color}"></i>`).join("");
      const selected = focus && focus.value === row.name ? " is-focused" : "";
      return `<button type="button" class="analysis-row${selected}" data-focus-value="${esc(row.name)}" aria-pressed="${selected ? "true" : "false"}" aria-label="${esc(labelOf(p.group, row.name))}: ${row.total} records, ${pct(row.total, data.length)}. Show these records."><span>${esc(labelOf(p.group, row.name))}</span><div class="stack-track">${grid}<div class="hbar" style="width:${p.length(row)}%">${segments}</div></div><strong>${valueText(row.total, data.length)}</strong></button>`;
    }).join("") + `<div class="analysis-axis-row" aria-hidden="true"><span></span><div class="axis-ticks">${p.axis.ticks.map(t => `<em style="left:${t / p.axis.max * 100}%">${tickText(p.axis, t)}</em>`).join("")}</div><strong></strong></div><p class="axis-title">${esc(p.axis.title)}</p>`;
  };

  const drawVertical = (p, data) => {
    const grid = p.axis.ticks.map(t => `<b class="hgrid" style="bottom:${t / p.axis.max * 100}%"></b>`).join("");
    const cols = p.shown.map(row => {
      const total = p.sum(row), h = p.length(row);
      const segments = p.segs(row).map(s => `<i title="${esc(segTitle(p, row, s))}" style="height:${total ? s.n / total * 100 : 0}%;background:${s.color}"></i>`).join("");
      const selected = focus && focus.value === row.name ? " is-focused" : "";
      return `<button type="button" class="vcol${selected}" data-focus-value="${esc(row.name)}" aria-pressed="${selected ? "true" : "false"}" aria-label="${esc(labelOf(p.group, row.name))}: ${row.total} records, ${pct(row.total, data.length)}. Show these records."><strong class="vcol-value" style="bottom:calc(${h}% + 4px)">${measure === "count" ? row.total : pct(row.total, data.length)}</strong><div class="vcol-bar" style="height:${h}%">${segments}</div><em class="vcol-label">${esc(labelOf(p.group, row.name))}</em></button>`;
    }).join("");
    return `<div class="vchart"><div class="vchart-yaxis" aria-hidden="true">${p.axis.ticks.map(t => `<em style="bottom:${t / p.axis.max * 100}%">${tickText(p.axis, t)}</em>`).join("")}</div><div class="vchart-scroll"><div class="vchart-plot" style="min-width:${p.shown.length * 82}px">${grid}${cols}</div></div></div><p class="axis-title">${esc(p.axis.title)}</p>`;
  };

  const drawLegend = p => {
    if (p.split === "none") return "";
    const items = p.splitNames.map(name => {
      const off = hidden.has(name);
      return `<button type="button" class="legend-item${off ? " is-off" : ""}" data-toggle-series="${esc(name)}" aria-pressed="${off ? "false" : "true"}" title="${off ? "Show" : "Hide"} this category"><i style="background:${p.colorOf(name)}"></i>${esc(labelOf(p.split, name))}</button>`;
    }).join("");
    return `<div class="chart-legend" aria-label="Legend: select a category to hide or show it">${items}${hidden.size ? `<button type="button" class="link-button" data-show-series>Show all</button>` : ""}</div><p class="analysis-hint">Select a legend item to hide or show it. Hover over a coloured segment to see its count.</p>`;
  };

  const draw = () => {
    const data = filtered();
    const p = prepare(data);
    const { group, split, rows } = p;
    const groupSpec = variables[group] || {}, splitSpec = variables[split] || {};
    const active = activeFilters();

    result.querySelector("h2").textContent = split === "none" ? groupSpec.label || group : `${groupSpec.label} split by ${(splitSpec.label || split).toLowerCase()}`;
    summaryEl.textContent = `${data.length} of ${records.length} records selected${active.length ? ` · ${active.length} filter${active.length > 1 ? "s" : ""} active` : ""} · ${measure === "count" ? "Numbers of records" : "Percent of selected records (n = records)"}`;
    const notes = [];
    if (groupSpec.multi || splitSpec.multi) notes.push("One record can belong to several categories here, so the percentages can add up to more than 100%.");
    if (view === "graph" && p.effScale === "share") notes.push("Each bar is stretched to 100% to compare its mix. Bar lengths no longer show how large each group is; the numbers on the right still do.");
    noteEl.hidden = !notes.length;
    noteEl.textContent = notes.join(" ");

    // Chart options only apply where they make sense
    optionsEl?.classList.toggle("is-table", view === "table");
    [...(scaleSelect?.options || [])].forEach(option => { option.disabled = option.value === "share" && split === "none"; });
    if (swapButton) { swapButton.disabled = split === "none"; swapButton.title = split === "none" ? "Choose something to compare with first" : "Swap the grouping and the comparison"; }
    chart.dataset.size = size;
    chart.classList.toggle("is-vertical", view === "graph" && orient === "vertical");

    // Result
    const catNote = p.hiddenCats ? `<p class="analysis-hint cat-note">Showing the ${p.shown.length} largest of ${rows.length} categories. <button type="button" class="link-button" data-show-all-cats>Show all categories</button></p>` : "";
    if (!data.length) {
      chart.innerHTML = `<div class="analysis-empty"><strong>No records match these filters.</strong><span>Remove a filter to see results again.</span><button type="button" class="btn btn-sm" data-clear-filters>Clear all filters</button></div>`;
    } else if (view === "graph") {
      chart.innerHTML = `<p class="analysis-hint">Select a ${orient === "vertical" ? "column" : "bar"} to list its records below.</p>` + (orient === "vertical" ? drawVertical(p, data) : drawHorizontal(p, data)) + drawLegend(p) + catNote;
    } else {
      const cols = split === "none" ? [] : p.series;
      const head = cols.map(name => `<th scope="col">${esc(labelOf(split, name))}</th>`).join("");
      chart.innerHTML = `<div class="analysis-table-wrap"><table class="table table-hover analysis-table"><thead><tr><th scope="col">${esc(groupSpec.label)}</th>${head}<th scope="col">Total</th></tr></thead><tbody>${p.shown.map(row => `<tr><th scope="row"><button type="button" class="link-button" data-focus-value="${esc(row.name)}">${esc(labelOf(group, row.name))}</button></th>${cols.map(name => `<td>${row.cells.get(name) ? valueText(row.cells.get(name), data.length) : '<span class="muted">–</span>'}</td>`).join("")}<td><strong>${valueText(row.total, data.length)}</strong></td></tr>`).join("")}</tbody></table></div>` + drawLegend(p).replace(/<p class="analysis-hint">.*<\/p>$/, "") + catNote;
    }

    // Active filter chips
    chipsEl.innerHTML = active.length ? `<span class="chips-label">Active filters:</span>${active.map(select => `<button type="button" class="filter-chip" data-remove-filter="${esc(select.dataset.analysisFilter)}" aria-label="Remove filter ${esc(filterLabel(select))}">${esc(filterLabel(select))}: <strong>${esc(labelOf(select.dataset.analysisFilter, select.value))}</strong> <span aria-hidden="true">×</span></button>`).join("")}<button type="button" class="link-button" data-clear-filters>Clear all</button>` : `<span class="chips-label">No filters applied. All ${records.length} records are included.</span>`;
    if (filterBadge) { filterBadge.textContent = active.length ? `${active.length} active` : ""; filterBadge.hidden = !active.length; }
    filterSelects.forEach(select => select.classList.toggle("is-active", Boolean(select.value)));
    const moreActive = active.filter(select => select.closest("#more-filters")).length;
    const moreCount = document.querySelector("[data-more-count]");
    if (moreCount) moreCount.textContent = moreActive ? String(moreActive) : "";
    [...splitSelect.options].forEach(option => { option.disabled = option.value === groupSelect.value; });

    // Records behind the view
    if (focus && (focus.group !== group || !rows.some(row => row.name === focus.value))) focus = null;
    const listed = focus ? data.filter(record => parts(record, group).includes(focus.value)) : data;
    focusEl.innerHTML = focus ? `Showing records where <strong>${esc(groupSpec.label)}</strong> is <strong>${esc(labelOf(group, focus.value))}</strong>. <button type="button" class="link-button" data-clear-focus>Show all selected records</button>` : "";
    focusEl.hidden = !focus;
    // Always fill complete rows of cards: round the count up to a multiple of the number of grid columns.
    const cols = gridColumns(), count = Math.min(listed.length, Math.ceil(visible / cols) * cols), step = cols * 4;
    recordsHeading.textContent = listed.length ? `Showing ${count} of ${listed.length} records behind this view.` : "No records to show.";
    recordGrid.innerHTML = listed.slice(0, count).map(m => `<a href="../explore/method-detail.html?id=${encodeURIComponent(m.id)}" class="panel card text-decoration-none" data-analysis-record="${esc(m.id)}"><span>${esc(m.id)} · ${esc(m.status)}</span><strong>${esc(m.shortName)}</strong><small>${esc(m.endpoint)}</small><i>${esc(m.methodology)} →</i></a>`).join("");
    document.querySelectorAll(".analysis-record-more").forEach(el => el.remove());
    if (count < listed.length) {
      const wrap = document.createElement("div"); wrap.className = "analysis-record-more";
      const more = document.createElement("button"); more.type = "button"; more.className = "show-more btn btn-outline-primary";
      more.textContent = `Show ${Math.min(step, listed.length - count)} more`;
      more.addEventListener("click", () => { visible = count + step; draw(); });
      const all = document.createElement("button"); all.type = "button"; all.className = "show-more btn btn-outline-primary";
      all.textContent = `Show all ${listed.length}`;
      all.addEventListener("click", () => { visible = listed.length; draw(); });
      wrap.append(more, all); recordGrid.after(wrap);
    }
    syncUrl();
  };

  /* ---------- Events ---------- */
  const reset = () => { visible = 12; focus = null; };
  let lastCols = 0;
  const gridColumns = () => Math.max(1, getComputedStyle(recordGrid).gridTemplateColumns.split(" ").filter(Boolean).length);
  window.addEventListener("resize", () => { const cols = gridColumns(); if (cols !== lastCols) { lastCols = cols; draw(); } });
  const autoSort = () => {
    if (!sortSelect) return;
    const spec = variables[groupSelect.value] || {};
    sortSelect.value = spec.numeric || spec.codes || naturalGroups.has(groupSelect.value) ? "natural" : "count";
  };
  groupSelect.addEventListener("change", () => {
    if (splitSelect.value === groupSelect.value) splitSelect.value = "none";
    autoSort(); hidden.clear(); reset(); draw();
  });
  splitSelect.addEventListener("change", () => { hidden.clear(); reset(); draw(); });
  [sortSelect, scaleSelect, topSelect, ...filterSelects].filter(Boolean).forEach(select => select.addEventListener("change", () => { reset(); draw(); }));
  swapButton?.addEventListener("click", () => {
    if (splitSelect.value === "none") return;
    const g = groupSelect.value; groupSelect.value = splitSelect.value; splitSelect.value = g;
    autoSort(); hidden.clear(); reset(); draw();
  });

  document.addEventListener("click", event => {
    const remove = event.target.closest("[data-remove-filter]");
    if (remove) { filters[remove.dataset.removeFilter].value = ""; reset(); draw(); return; }
    if (event.target.closest("[data-clear-filters]")) { filterSelects.forEach(select => { select.value = ""; }); reset(); draw(); return; }
    if (event.target.closest("[data-clear-focus]")) { focus = null; visible = 12; draw(); return; }
    if (event.target.closest("[data-show-all-cats]")) { if (topSelect) topSelect.value = "0"; draw(); return; }
    if (event.target.closest("[data-show-series]")) { hidden.clear(); draw(); return; }
    const legend = event.target.closest("[data-toggle-series]");
    if (legend) {
      const name = legend.dataset.toggleSeries;
      const visibleCount = [...chart.querySelectorAll("[data-toggle-series]")].filter(el => !el.classList.contains("is-off")).length;
      if (hidden.has(name)) hidden.delete(name); else if (visibleCount > 1) hidden.add(name);
      draw(); chart.querySelector(`[data-toggle-series="${CSS.escape(name)}"]`)?.focus(); return;
    }
    const bar = event.target.closest("[data-focus-value]");
    if (bar && chart.contains(bar)) {
      const value = bar.dataset.focusValue;
      focus = focus && focus.value === value ? null : { group: groupSelect.value, value };
      visible = 12; draw();
      if (focus) document.querySelector(".analysis-records")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  const toggleGroups = { view: () => view, measure: () => measure, orient: () => orient, size: () => size };
  const updateToggles = () => Object.keys(toggleGroups).forEach(key => document.querySelectorAll(`[data-${key}]`).forEach(button => {
    const on = button.dataset[key] === toggleGroups[key]();
    button.classList.toggle("selected", on); button.setAttribute("aria-pressed", String(on));
  }));
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => { view = button.dataset.view; updateToggles(); draw(); }));
  document.querySelectorAll("[data-measure]").forEach(button => button.addEventListener("click", () => { measure = button.dataset.measure; updateToggles(); draw(); }));
  document.querySelectorAll("[data-orient]").forEach(button => button.addEventListener("click", () => { orient = button.dataset.orient; view = "graph"; updateToggles(); draw(); }));
  document.querySelectorAll("[data-size]").forEach(button => button.addEventListener("click", () => { size = button.dataset.size; updateToggles(); draw(); }));

  /* ---------- Exports ---------- */
  const download = (blob, filename) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  };
  const flash = (button, text) => { const original = button.dataset.label || button.textContent; button.dataset.label = original; button.textContent = text; setTimeout(() => { button.textContent = original; }, 2000); };
  const filterSummary = () => activeFilters().map(select => `${filterLabel(select)} = ${labelOf(select.dataset.analysisFilter, select.value)}`).join("; ") || "none";
  const fileName = (p, ext) => `nam-analysis-${p.group}${p.split === "none" ? "" : "-by-" + p.split}.${ext}`;

  document.querySelector("[data-action='share']")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    syncUrl();
    try { await navigator.clipboard.writeText(location.href); flash(button, "Link copied ✓"); }
    catch { window.prompt("Copy this link to share the current view:", location.href); }
  });

  // The CSV always contains the complete table, whatever is hidden in the chart.
  document.querySelector("[data-action='csv']")?.addEventListener("click", () => {
    const data = filtered(); const p = compute(data);
    const cols = p.split === "none" ? [] : p.splitNames;
    const lines = [
      [`Analysis: ${result.querySelector("h2").textContent}`],
      [`Records selected: ${data.length} of ${records.length}`],
      [`Filters: ${filterSummary()}`],
      [`Percentages use the number of selected records (${data.length}) as denominator.`],
      [],
      [variables[p.group].label, ...cols.flatMap(name => [`${labelOf(p.split, name)} (n)`, `${labelOf(p.split, name)} (%)`]), "Total (n)", "Total (%)"],
      ...p.rows.map(row => [labelOf(p.group, row.name), ...cols.flatMap(name => [row.cells.get(name) || 0, pct(row.cells.get(name) || 0, data.length)]), row.total, pct(row.total, data.length)])
    ];
    const csv = "﻿" + lines.map(line => line.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    download(new Blob([csv], { type: "text/csv;charset=utf-8" }), fileName(p, "csv"));
  });

  // The image follows the chart as shown: direction, scale, hidden categories and top-N.
  document.querySelector("[data-action='png']")?.addEventListener("click", () => {
    const data = filtered(); const p = prepare(data);
    const vertical = orient === "vertical";
    const legendNames = p.split === "none" ? [] : p.series;
    const legendRows = Math.ceil(legendNames.length / 3);
    const plotH = { s: 320, m: 440, l: 560 }[size];
    const rowH = { s: 38, m: 52, l: 66 }[size];
    const bodyH = vertical ? plotH + 150 : p.shown.length * rowH + 60;
    const canvas = document.createElement("canvas");
    canvas.width = vertical ? Math.max(1600, 260 + p.shown.length * 90) : 1600;
    canvas.height = 170 + bodyH + legendRows * 34 + 50;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#113d70"; ctx.font = "bold 34px Arial"; ctx.fillText(result.querySelector("h2").textContent, 60, 64);
    ctx.fillStyle = "#68788d"; ctx.font = "18px Arial";
    ctx.fillText(`${data.length} of ${records.length} TSAR records · Filters: ${filterSummary()}`.slice(0, 150), 60, 100);
    ctx.fillText(`${p.axis.title}. Source: TSAR research snapshot, 25 September 2026.`, 60, 128);
    const clip = (text, n) => (text.length > n ? text.slice(0, n - 1) + "…" : text);
    const drawSegs = (row, x, y, w, h, horizontal) => {
      const total = p.sum(row); let offset = 0;
      p.segs(row).forEach(s => {
        const share = total ? s.n / total : 0; ctx.fillStyle = s.color;
        if (horizontal) { ctx.fillRect(x + offset, y, w * share, h); offset += w * share; }
        else { ctx.fillRect(x, y + h - offset - h * share, w, h * share); offset += h * share; }
      });
    };
    if (!vertical) {
      const barX = 560, barW = 780, top0 = 170, barH = Math.round(rowH * 0.55);
      ctx.font = "13px Arial";
      p.axis.ticks.forEach(t => {
        const x = barX + t / p.axis.max * barW;
        ctx.fillStyle = "#e3eaf1"; ctx.fillRect(x, top0 - 8, 1, p.shown.length * rowH + 8);
        ctx.fillStyle = "#68788d"; ctx.textAlign = "center"; ctx.fillText(tickText(p.axis, t), x, top0 + p.shown.length * rowH + 18);
      });
      ctx.textAlign = "left";
      p.shown.forEach((row, index) => {
        const y = top0 + index * rowH;
        ctx.fillStyle = "#425a72"; ctx.font = "16px Arial"; ctx.fillText(clip(String(labelOf(p.group, row.name)), 52), 60, y + barH / 2 + 6);
        drawSegs(row, barX, y, barW * p.length(row) / 100, barH, true);
        ctx.fillStyle = "#173f70"; ctx.font = "bold 16px Arial"; ctx.fillText(`${pct(row.total, data.length)} (n=${row.total})`, barX + barW + 20, y + barH / 2 + 6);
      });
    } else {
      const left = 130, top0 = 190, plotW = canvas.width - left - 60, colW = plotW / Math.max(1, p.shown.length);
      ctx.font = "13px Arial"; ctx.textAlign = "right";
      p.axis.ticks.forEach(t => {
        const y = top0 + plotH - t / p.axis.max * plotH;
        ctx.fillStyle = "#e3eaf1"; ctx.fillRect(left, y, plotW, 1);
        ctx.fillStyle = "#68788d"; ctx.fillText(tickText(p.axis, t), left - 10, y + 4);
      });
      ctx.textAlign = "center";
      p.shown.forEach((row, index) => {
        const h = plotH * p.length(row) / 100, w = Math.min(70, colW * 0.6), x = left + index * colW + (colW - w) / 2;
        drawSegs(row, x, top0 + plotH - h, w, h, false);
        ctx.fillStyle = "#173f70"; ctx.font = "bold 14px Arial"; ctx.fillText(measure === "count" ? String(row.total) : pct(row.total, data.length), x + w / 2, top0 + plotH - h - 8);
        ctx.fillStyle = "#425a72"; ctx.font = "13px Arial";
        const words = String(labelOf(p.group, row.name)).split(" "); const lines = [""];
        words.forEach(word => { const line = lines[lines.length - 1]; if (ctx.measureText(line + " " + word).width > colW - 8 && line) lines.push(word); else lines[lines.length - 1] = (line ? line + " " : "") + word; });
        lines.slice(0, 4).forEach((line, i) => ctx.fillText(clip(line, 24), left + index * colW + colW / 2, top0 + plotH + 22 + i * 16));
      });
      ctx.textAlign = "left";
    }
    if (legendNames.length) {
      const top1 = 170 + bodyH;
      legendNames.forEach((name, i) => {
        const x = 60 + (i % 3) * 500, y = top1 + Math.floor(i / 3) * 34;
        ctx.fillStyle = p.colorOf(name); ctx.fillRect(x, y, 18, 18);
        ctx.fillStyle = "#425a72"; ctx.font = "15px Arial"; ctx.fillText(clip(String(labelOf(p.split, name)), 55), x + 28, y + 15);
      });
    }
    canvas.toBlob(blob => { if (blob) download(blob, fileName(p, "png")); }, "image/png");
  });

  /* ---------- Presets and reset ---------- */
  const presets = {
    "stage-evidence": { group: "code", split: "evidenceUpdatedStage", sort: "natural" },
    "bottleneck-profile": { group: "bottlenecks", split: "none", sort: "count" },
    "bottleneck-outcome": { group: "bottlenecks", split: "status", sort: "count", scale: "share" },
    "three-r-impact": { group: "threeR", split: "animalUseImpact", sort: "natural" },
    "methods-outcome": { group: "methodology", split: "status", sort: "count", scale: "share" },
    "year-trend": { group: "yearReceived", split: "status", sort: "natural", orient: "vertical" }
  };
  document.querySelectorAll("[data-analysis-preset]").forEach(button => button.addEventListener("click", () => {
    const preset = presets[button.dataset.analysisPreset]; if (!preset) return;
    groupSelect.value = preset.group; splitSelect.value = preset.split;
    if (sortSelect) sortSelect.value = preset.sort;
    if (scaleSelect) scaleSelect.value = preset.scale || "fit";
    orient = preset.orient || "horizontal"; view = "graph";
    hidden.clear(); reset(); updateToggles(); draw();
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  document.querySelector("[data-action='reset']")?.addEventListener("click", () => {
    filterSelects.forEach(select => { select.value = ""; });
    groupSelect.value = "status"; splitSelect.value = "none";
    if (sortSelect) sortSelect.value = "count";
    if (scaleSelect) scaleSelect.value = "fit";
    if (topSelect) topSelect.value = "0";
    view = "graph"; measure = "percent"; orient = "horizontal"; size = "m";
    hidden.clear(); reset(); updateToggles(); draw();
  });

  // "More filters" opens the less-used filters below the main filter row.
  const moreToggle = document.querySelector("[data-more-filters]");
  const morePanel = document.getElementById("more-filters");
  const setMoreOpen = open => { if (!moreToggle || !morePanel) return; morePanel.hidden = !open; moreToggle.setAttribute("aria-expanded", String(open)); };
  moreToggle?.addEventListener("click", () => setMoreOpen(morePanel.hidden));

  readUrl(); updateToggles();
  if (morePanel && [...morePanel.querySelectorAll("select")].some(select => select.value)) setMoreOpen(true);
  draw();
});
