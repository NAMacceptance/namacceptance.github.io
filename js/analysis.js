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
    stepStage: { label: "Combined step/stage" },
    workflowStage: { label: "Workflow stage" },
    topic: { label: "Topic", multi: true, separator: "," },
    yearReceived: { label: "Year received", numeric: true },
    organisation: { label: "Organisation" },
    code: { label: "NEW_STEP_STAGE", codes: true, order: Object.keys(stageCodeLabels) },
    status: { label: "Regulatory status", order: ["Ongoing", "Acceptance pending", "Finalised", "Adopted", "Rejected", "Discontinued", "Not applicable", "Unknown"] },
    stage: { label: "Regulatory stage", order: ["Test Submission", "Validation", "Regulatory assessment", "Unknown"] },
    evidenceUpdatedStage: { label: "External evidence step/stage", codes: true, order: Object.keys(stageCodeLabels) },
    progressionBeyondTsar: { label: "Lifecycle update beyond raw TSAR", order: ["Lifecycle updated beyond raw TSAR snapshot", "Raw TSAR lifecycle retained"] },
    caseStudy: { label: "Case-study sample", order: ["Direct case study", "Borderline transition case", "Not included"] },
    bottleneckCount: { label: "Number of bottleneck signals", numeric: true },
    bottlenecks: { label: "Documented bottleneck signal", multi: true },
    threeR: { label: "3R category", order: ["Replacement", "Reduction", "Refinement", "Unknown"] },
    animalUseImpact: { label: "Animal-use impact", order: ["Replacement", "Reduction", "Refinement", "Regulatory waiver/removal", "Unknown"] },
    literature: { label: "Literature completeness" },
    applicationDomainExpert: { label: "Researcher application domain", multi: true },
    endpoint: { label: "Endpoint category", multi: true },
    methodology: { label: "Core methodology", multi: true }
  };
  const naturalGroups = new Set(["stage", "workflowStep", "workflowStage", "status", "threeR", "animalUseImpact", "progressionBeyondTsar", "caseStudy"]);
  const palette = ["#0a3d80", "#347fd6", "#2ca6b0", "#e6a33a", "#7a67c7", "#d0605e", "#5a9e4b", "#8ad6df", "#b07aa1", "#9c755f", "#f2c14e", "#6b7c93", "#1f7a8c", "#c9a0dc", "#3d5a80", "#e07a5f", "#81b29a", "#bab0ac"];

  const labelOf = (key, value) => (variables[key]?.codes && stageCodeLabels[value] ? stageCodeLabels[value] : value);
  const parts = (record, key) => {
    const raw = record[key];
    const values = variables[key]?.multi ? String(raw || "Unknown").split(variables[key].separator || ";") : [raw === 0 ? "0" : raw || "Unknown"];
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
  const labelsSelect = document.querySelector("[data-analysis-labels]");
  const labelsMode = () => labelsSelect?.value || "off";
  const namesSelect = document.querySelector("[data-analysis-names]");
  const namesOn = () => Boolean(namesSelect?.checked);

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
    if (labelsMode() !== "off") params.set("labels", labelsMode());
    if (namesOn()) params.set("names", "on");
    const fmtCode = encodeFmt(); if (fmtCode) params.set("fmt", fmtCode);
    if (splitSelect.value !== "none" && statsOutcome) { params.set("outcome", statsOutcome); params.set("ref", statsRef); }
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
    setIfValid(labelsSelect, params.get("labels"));
    decodeFmt(params.get("fmt"));
    if (namesSelect) namesSelect.checked = params.get("names") === "on";
    if (params.get("view") === "table") view = "table";
    if (params.get("measure") === "count") measure = "count";
    if (["vertical", "pie"].includes(params.get("orient"))) orient = params.get("orient");
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
  // Value labels inside bar segments: numbers, percentages of the selected records, or both.
  const segText = (n, total) => { const m = labelsMode(); return m === "n" ? String(n) : m === "pct" ? pct(n, total) : m === "both" ? `${n} (${pct(n, total)})` : ""; };
  const inkFor = hex => { const c = String(hex).replace("#", ""); const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16)); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#10263f" : "#ffffff"; };
  const segLabel = (text, px, room) => text && px >= room ? `<span class="seg-label">${text}</span>` : "";
  // Category names above the segments of a bar. Labels that would overlap move up a row and get a pointer line.
  const nameText = (p, name) => { const t = variables[p.split]?.codes ? String(name) : String(labelOf(p.split, name)); return t.length > 24 ? t.slice(0, 23) + "…" : t; };
  // Callouts above the bar: category names (when switched on) and any value label too long to fit inside its segment.
  const segmentNames = (p, row, trackPx, denom) => {
    const wantNames = namesOn() && p.split !== "none", wantValues = labelsMode() !== "off";
    if (!wantNames && !wantValues) return { html: "", rows: 0 };
    const total = p.sum(row), barPx = trackPx * p.length(row) / 100, ends = [];
    let offset = 0, used = 0;
    const html = p.segs(row).map(s => {
      const share = total ? s.n / total : 0, centre = barPx * (offset + share / 2); offset += share;
      const value = segText(s.n, denom), fitsInside = !value || barPx * share >= (value.length * 6.2 + 8) * fmt.font / 100;
      const text = [wantNames ? nameText(p, s.name) : "", fitsInside ? "" : value].filter(Boolean).join(" · ");
      if (!text) return "";
      const fs = fmt.font / 100, w = (text.length * 5.6 + 8) * fs, left = centre - w / 2;
      let level = 0; while (level < ends.length && ends[level] > left) level++;
      ends[level] = left + w + 4; used = Math.max(used, level + 1);
      const up = 3 + level * 14 * fs;
      return `<em class="seg-name" style="left:${centre}px;bottom:calc(100% + ${up}px);color:${s.color}">${esc(text)}</em><b class="seg-pointer" style="left:${centre}px;height:${up}px"></b>`;
    }).join("");
    return { html, rows: used };
  };
  const segTitle = (p, row, s) => `${labelOf(p.split, s.name)}: ${s.n} of ${row.total} records (${pct(s.n, row.total)} of this bar)`;

  const drawHorizontal = (p, data) => {
    const grid = p.axis.ticks.map(t => `<b class="gridline" style="left:${t / p.axis.max * 100}%"></b>`).join("");
    return p.shown.map(row => {
      const total = p.sum(row);
      const trackPx = Math.max(200, (chart.clientWidth || 900) - (fmt.labelW || 240) - 100);
      const segments = p.segs(row).map(s => { const t = segText(s.n, data.length); const px = trackPx * p.length(row) / 100 * (total ? s.n / total : 0); return `<i title="${esc(segTitle(p, row, s))}" style="width:${total ? s.n / total * 100 : 0}%;background:${s.color};color:${inkFor(s.color)}">${segLabel(t, px, (t.length * 6.2 + 8) * fmt.font / 100)}</i>`; }).join("");
      const selected = focus && focus.value === row.name ? " is-focused" : "";
      const names = segmentNames(p, row, trackPx, data.length);
      return `<button type="button" class="analysis-row${selected}" data-focus-value="${esc(row.name)}" aria-pressed="${selected ? "true" : "false"}" aria-label="${esc(labelOf(p.group, row.name))}: ${row.total} records, ${pct(row.total, data.length)}. Show these records."${names.rows ? ` style="padding-top:${Math.round(names.rows * 14 * fmt.font / 100 + 10)}px"` : ""}><span>${esc(labelOf(p.group, row.name))}</span><div class="stack-track">${grid}${names.html}<div class="hbar" style="width:${p.length(row)}%">${segments}</div></div><strong>${valueText(row.total, data.length)}</strong></button>`;
    }).join("") + `<div class="analysis-axis-row" aria-hidden="true"><span></span><div class="axis-ticks">${p.axis.ticks.map(t => `<em style="left:${t / p.axis.max * 100}%">${tickText(p.axis, t)}</em>`).join("")}</div><strong></strong></div><p class="axis-title">${esc(p.axis.title)}</p>`;
  };

  const drawVertical = (p, data) => {
    const grid = p.axis.ticks.map(t => `<b class="hgrid" style="bottom:${t / p.axis.max * 100}%"></b>`).join("");
    const cols = p.shown.map(row => {
      const total = p.sum(row), h = p.length(row);
      const plotPx = fmt.plotH || { s: 220, m: 320, l: 460 }[size] || 320;
      const segments = p.segs(row).map(s => { const t = segText(s.n, data.length); const px = plotPx * h / 100 * (total ? s.n / total : 0); return `<i title="${esc(segTitle(p, row, s))}" style="height:${total ? s.n / total * 100 : 0}%;background:${s.color};color:${inkFor(s.color)}">${t.length * 5.6 <= 50 ? segLabel(t, px, 14) : ""}</i>`; }).join("");
      const selected = focus && focus.value === row.name ? " is-focused" : "";
      return `<button type="button" class="vcol${selected}" data-focus-value="${esc(row.name)}" aria-pressed="${selected ? "true" : "false"}" aria-label="${esc(labelOf(p.group, row.name))}: ${row.total} records, ${pct(row.total, data.length)}. Show these records."><strong class="vcol-value" style="bottom:calc(${h}% + 4px)">${measure === "count" ? row.total : pct(row.total, data.length)}</strong><div class="vcol-bar" style="height:${h}%">${segments}</div><em class="vcol-label">${esc(labelOf(p.group, row.name))}</em></button>`;
    }).join("");
    return `<div class="vchart"><div class="vchart-yaxis" aria-hidden="true">${p.axis.ticks.map(t => `<em style="bottom:${t / p.axis.max * 100}%">${tickText(p.axis, t)}</em>`).join("")}</div><div class="vchart-scroll"><div class="vchart-plot" style="min-width:${p.shown.length * ((fmt.colW || 76) + 6)}px">${grid}${cols}</div></div></div><p class="axis-title">${esc(p.axis.title)}</p>`;
  };

  // Pie view: one donut of all categories, or (when comparing) one small donut per category showing its mix.
  const pieItems = (p, row) => row ? p.segs(row).map(s => ({ name: s.name, n: s.n, color: s.color, label: labelOf(p.split, s.name) }))
    : p.shown.map((r, i) => ({ name: r.name, n: r.total, color: palette[i % palette.length], label: labelOf(p.group, r.name), focus: r.name }));
  const arc = (r, ri, a0, a1) => {
    if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
    const pt = (rad, a) => `${(rad * Math.sin(a)).toFixed(2)} ${(-rad * Math.cos(a)).toFixed(2)}`, large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${pt(r, a0)} A${r} ${r} 0 ${large} 1 ${pt(r, a1)} L${pt(ri, a1)} A${ri} ${ri} 0 ${large} 0 ${pt(ri, a0)} Z`;
  };
  const donut = (items, r, centre, focusValue) => {
    const sum = items.reduce((a, b) => a + b.n, 0) || 1; let a = 0;
    const slices = items.map(it => {
      const a0 = a, a1 = a + it.n / sum * Math.PI * 2; a = a1;
      const mid = (a0 + a1) / 2, lr = r * 0.78, share = it.n / sum;
      const m = labelsMode(), t = m === "off" ? "" : m === "n" ? String(it.n) : m === "pct" ? pct(it.n, sum) : `${it.n} (${pct(it.n, sum)})`;
      const text = t && share >= (t.length > 6 ? 0.09 : 0.05) ? `<text x="${(lr * Math.sin(mid)).toFixed(1)}" y="${(-lr * Math.cos(mid)).toFixed(1)}" text-anchor="middle" dominant-baseline="central" fill="${inkFor(it.color)}" font-size="${r > 100 ? 11 : 9.5}" font-weight="700">${t}</text>` : "";
      const attrs = it.focus ? ` data-focus-value="${esc(it.focus)}" class="pie-slice${focusValue === it.focus ? " is-focused" : ""}" tabindex="0" role="button"` : ` class="pie-slice static"`;
      return `<g${attrs}><title>${esc(it.label)}: ${it.n} (${pct(it.n, sum)} of this chart)</title><path d="${arc(r, r * 0.55, a0, a1)}" fill="${it.color}" stroke="#fff" stroke-width="1.5"/>${text}</g>`;
    }).join("");
    return `<svg viewBox="${-r - 4} ${-r - 4} ${2 * r + 8} ${2 * r + 8}" width="${2 * r + 8}" height="${2 * r + 8}" role="img" aria-label="Pie chart">${slices}<text x="0" y="-4" text-anchor="middle" font-size="${r > 100 ? 20 : 13}" font-weight="800" fill="#0f2f57">${centre[0]}</text><text x="0" y="${r > 100 ? 16 : 11}" text-anchor="middle" font-size="${r > 100 ? 10.5 : 9}" fill="#6c7c8f">${centre[1]}</text></svg>`;
  };
  const drawPie = (p, data) => {
    const r = fmt.plotH ? Math.round(Math.max(70, Math.min(260, fmt.plotH * 0.4))) : { s: 90, m: 130, l: 170 }[size] || 130;
    const multi = (variables[p.group] || {}).multi || (variables[p.split] || {}).multi;
    const note = `<p class="axis-title">Slices show each category's share of the counts in the chart${multi ? "; with multi-label variables one record can appear in more than one slice" : ""}.</p>`;
    if (p.split === "none") {
      const items = pieItems(p), sum = items.reduce((a, b) => a + b.n, 0) || 1;
      const legend = items.map(it => `<li><button type="button" class="pie-key${focus && focus.value === it.focus ? " is-focused" : ""}" data-focus-value="${esc(it.focus)}"><i style="background:${it.color}"></i><span>${esc(it.label)}</span><strong>${it.n}</strong><small>${pct(it.n, sum)}</small></button></li>`).join("");
      return `<div class="pie-single">${donut(items, r, [String(data.length), "records"], focus?.value)}<ul class="pie-legend">${legend}</ul></div>` + note;
    }
    const small = Math.round(r * 0.55);
    const cards = p.shown.map(row => `<button type="button" class="pie-card${focus && focus.value === row.name ? " is-focused" : ""}" data-focus-value="${esc(row.name)}" aria-label="${esc(labelOf(p.group, row.name))}: ${row.total} records. Show these records.">${donut(pieItems(p, row), small, [String(row.total), "records"])}<span>${esc(labelOf(p.group, row.name))}</span></button>`).join("");
    return `<div class="pie-grid">${cards}</div>` + note;
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
    applyFormat();
    const data = filtered();
    const p = prepare(data);
    // Chart height also works in the Bars view: spread the chosen height over the bars (unless a bar thickness was set).
    if (fmt.plotH && orient === "horizontal" && view === "graph") {
      const per = fmt.plotH / Math.max(1, p.shown.length);
      if (!fmt.bar) chart.style.setProperty("--bar-h", Math.round(Math.max(6, Math.min(48, per * 0.55))) + "px");
      if (!fmt.gap) chart.style.setProperty("--row-gap", Math.round(Math.max(0, Math.min(40, per - per * 0.55 - 12))) + "px");
    }
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
      chart.innerHTML = `<p class="analysis-hint">Select a ${orient === "vertical" ? "column" : orient === "pie" ? "slice" : "bar"} to list its records below.</p>` + (orient === "vertical" ? drawVertical(p, data) : orient === "pie" ? drawPie(p, data) : drawHorizontal(p, data)) + drawLegend(p) + catNote;
    } else {
      const cols = split === "none" ? [] : p.series;
      const head = cols.map(name => `<th scope="col">${esc(labelOf(split, name))}</th>`).join("");
      chart.innerHTML = `<div class="analysis-table-wrap"><table class="table table-hover analysis-table"><thead><tr><th scope="col">${esc(groupSpec.label)}</th>${head}<th scope="col">Total</th></tr></thead><tbody>${p.shown.map(row => `<tr><th scope="row"><button type="button" class="link-button" data-focus-value="${esc(row.name)}">${esc(labelOf(group, row.name))}</button></th>${cols.map(name => `<td>${row.cells.get(name) ? valueText(row.cells.get(name), data.length) : '<span class="muted">–</span>'}</td>`).join("")}<td><strong>${valueText(row.total, data.length)}</strong></td></tr>`).join("")}</tbody></table></div>` + drawLegend(p).replace(/<p class="analysis-hint">.*<\/p>$/, "") + catNote;
    }

    try { renderStats(data, p); } catch (error) { if (statsEl) { statsEl.hidden = false; statsEl.innerHTML = `<p class="stats-warn">The statistics could not be calculated for this view (${esc(error.message)}).</p>`; } console.error(error); }

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

  /* ---------- Statistics: chi-square test, Fisher's exact test, odds ratios with 95% CI ---------- */
  const NamStats = (() => {
    const logGamma = x => {
      const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
      if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
      x -= 1; let a = 0.99999999999980993; const t = x + 7.5;
      g.forEach((c, i) => { a += c / (x + i + 1); });
      return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
    };
    // Regularized upper incomplete gamma Q(a, x).
    const gammaQ = (a, x) => {
      if (x <= 0) return 1;
      if (x < a + 1) {
        let sum = 1 / a, term = sum;
        for (let n = 1; n < 500; n++) { term *= x / (a + n); sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-14) break; }
        return Math.max(0, 1 - sum * Math.exp(-x + a * Math.log(x) - logGamma(a)));
      }
      let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
      for (let i = 1; i < 500; i++) {
        const an = -i * (i - a); b += 2;
        d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
        c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
        d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break;
      }
      return Math.min(1, Math.exp(-x + a * Math.log(x) - logGamma(a)) * h);
    };
    const chiSquare = table => {
      // table: array of rows of counts; empty rows/columns are dropped.
      let rows = table.filter(r => r.some(v => v > 0));
      const colKeep = rows[0] ? rows[0].map((_, j) => rows.some(r => r[j] > 0)) : [];
      rows = rows.map(r => r.filter((_, j) => colKeep[j]));
      const R = rows.length, C = rows[0] ? rows[0].length : 0;
      if (R < 2 || C < 2) return null;
      const rowT = rows.map(r => r.reduce((a, b) => a + b, 0)), colT = rows[0].map((_, j) => rows.reduce((a, r) => a + r[j], 0));
      const N = rowT.reduce((a, b) => a + b, 0);
      let chi2 = 0, small = 0, minE = Infinity;
      rows.forEach((r, i) => r.forEach((o, j) => { const e = rowT[i] * colT[j] / N; chi2 += (o - e) ** 2 / e; if (e < 5) small++; minE = Math.min(minE, e); }));
      const df = (R - 1) * (C - 1);
      return { chi2, df, p: gammaQ(df / 2, chi2 / 2), N, R, C, cramersV: Math.sqrt(chi2 / (N * (Math.min(R, C) - 1))), smallShare: small / (R * C), minE };
    };
    const logFact = n => logGamma(n + 1);
    // Two-sided Fisher's exact test for [[a, b], [c, d]] (sum of all tables no more likely than the observed one).
    const fisher = (a, b, c, d) => {
      const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2;
      const lp = x => logFact(r1) + logFact(r2) + logFact(c1) + logFact(n - c1) - logFact(n) - logFact(x) - logFact(r1 - x) - logFact(c1 - x) - logFact(r2 - c1 + x);
      const obs = lp(a); let p = 0;
      for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) { const l = lp(x); if (l <= obs + 1e-7) p += Math.exp(l); }
      return Math.min(1, p);
    };
    // Odds ratio with Woolf (log) 95% CI; adds 0.5 to every cell when any cell is zero (Haldane-Anscombe).
    const oddsRatio = (a, b, c, d) => {
      const corrected = [a, b, c, d].some(v => v === 0);
      const [A, B, C, D] = corrected ? [a + 0.5, b + 0.5, c + 0.5, d + 0.5] : [a, b, c, d];
      const or = (A * D) / (B * C), se = Math.sqrt(1 / A + 1 / B + 1 / C + 1 / D);
      return { or, lo: Math.exp(Math.log(or) - 1.959964 * se), hi: Math.exp(Math.log(or) + 1.959964 * se), corrected };
    };
    return { chiSquare, fisher, oddsRatio, gammaQ };
  })();

  // Statistics panel: shown when a second variable is compared.
  const statsEl = document.querySelector("[data-analysis-stats]");
  let statsOutcome = new URLSearchParams(location.search).get("outcome") || "", statsRef = new URLSearchParams(location.search).get("ref") || "";
  const fmtP = p => p < 0.001 ? "< 0.001" : p.toFixed(3);
  const fmtN = v => !isFinite(v) ? "∞" : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  const lastStats = { rows: [] };
  let statsOpen = false;
  // Remember whether the visitor opened the (beta) statistics block across redraws.
  document.addEventListener("toggle", event => { if (event.target.matches?.(".stats-details")) statsOpen = event.target.open; }, true);
  const renderStats = (data, p) => {
    if (!statsEl) return;
    const { group, split } = p;
    if (split === "none" || !data.length) { statsEl.hidden = true; return; }
    statsEl.hidden = false;
    const gSpec = variables[group] || {}, sSpec = variables[split] || {};
    const multi = gSpec.multi || sSpec.multi;
    const groups = p.rows.map(r => r.name), outcomes = p.splitNames;
    if (!outcomes.includes(statsOutcome)) statsOutcome = outcomes.includes("Adopted") ? "Adopted" : outcomes.includes("REG_ADOPT") ? "REG_ADOPT" : outcomes[0];
    if (!groups.includes(statsRef)) statsRef = [...p.rows].sort((a, b) => b.total - a.total)[0]?.name || groups[0];

    // Chi-square test of independence on the full table (single-label variables only).
    let chiHtml;
    if (multi) chiHtml = `<p class="stats-warn">The chi-square test is not shown because ${esc(gSpec.multi ? gSpec.label : sSpec.label)} is multi-label: one record can fall in several categories, so the table cells are not independent. The odds ratios below compare records, so they remain valid.</p>`;
    else {
      const chi = NamStats.chiSquare(p.rows.map(r => outcomes.map(o => r.cells.get(o) || 0)));
      chiHtml = chi ? `<div class="stats-summary"><div><span>Chi-square test of independence</span><strong>χ²(${chi.df}) = ${chi.chi2.toFixed(2)}, p ${chi.p < 0.001 ? "< 0.001" : "= " + chi.p.toFixed(3)}</strong></div><div><span>Effect size (Cramér's V)</span><strong>${chi.cramersV.toFixed(2)}</strong></div><div><span>Records in the test</span><strong>${chi.N}</strong></div></div>${chi.smallShare > 0.2 ? `<p class="stats-warn">${Math.round(chi.smallShare * 100)}% of the cells have an expected count below 5 (smallest ${chi.minE.toFixed(1)}), so the chi-square approximation is unreliable. Rely on the Fisher's exact tests below, or combine categories.</p>` : ""}` : `<p class="stats-warn">At least two categories are needed on both sides for a chi-square test.</p>`;
    }

    // Odds ratios: each group against the reference group, for having the chosen outcome.
    const has = (rec, key, v) => parts(rec, key).includes(v);
    const refRecs = data.filter(rec => has(rec, group, statsRef));
    const rows = groups.filter(g => g !== statsRef).map(g => {
      const gRecs = data.filter(rec => has(rec, group, g) && !has(rec, group, statsRef));
      const ref = refRecs.filter(rec => !has(rec, group, g));
      const a = gRecs.filter(rec => has(rec, split, statsOutcome)).length, b = gRecs.length - a;
      const c = ref.filter(rec => has(rec, split, statsOutcome)).length, d = ref.length - c;
      const or = NamStats.oddsRatio(a, b, c, d);
      return { g, a, b, c, d, n: a + b, or, p: NamStats.fisher(a, b, c, d) };
    });
    lastStats.rows = rows;
    const k = rows.length, bonf = 0.05 / Math.max(1, k);
    const refN = refRecs.length, refYes = refRecs.filter(rec => has(rec, split, statsOutcome)).length;
    const opt = (list, key, sel) => list.map(v => `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(labelOf(key, v))}</option>`).join("");
    statsEl.innerHTML = `<details class="stats-details"${statsOpen ? " open" : ""}><summary><span class="beta-badge">Beta</span><span class="stats-summary-title">Statistics: tests and odds ratios</span><small>Experimental feature. Check results before using them in your own work.</small></summary><div class="stats-body"><p class="beta-note"><strong>Beta:</strong> this statistics module is a new, experimental part of the site. The calculations were checked against standard statistical software, but the feature is still being tested. Treat the results as exploratory and verify them before citing them.</p><div class="stats-head"><div><span class="eyebrow">Statistics</span><h2>Is ${esc(sSpec.label)} related to ${esc(gSpec.label)}?</h2><p>Exploratory tests on the ${data.length} selected records. They describe associations in this snapshot, not causes.</p></div><button type="button" class="btn btn-sm" data-action="stats-csv">Download statistics (CSV)</button></div>
      ${chiHtml}
      <div class="stats-controls"><label class="tb-filter"><span>Outcome</span><select class="form-select" data-stats-outcome>${opt(outcomes, split, statsOutcome)}</select></label><label class="tb-filter"><span>Reference group</span><select class="form-select" data-stats-ref>${opt(groups, group, statsRef)}</select></label></div>
      <p class="stats-explain">Odds ratio (OR) = the odds of <strong>${esc(labelOf(split, statsOutcome))}</strong> in each group divided by the odds in the reference group <strong>${esc(labelOf(group, statsRef))}</strong> (${refYes} of ${refN} records). OR &gt; 1 means the outcome is more likely than in the reference group; if the 95% CI includes 1, the difference is not statistically significant.</p>
      <div class="table-scroll stats-scroll"><table class="table stats-table"><thead><tr><th scope="col">${esc(gSpec.label)}</th><th scope="col">With outcome</th><th scope="col">Without</th><th scope="col">% with outcome</th><th scope="col">Odds ratio (95% CI)</th><th scope="col">p (Fisher)</th></tr></thead><tbody>
        <tr class="is-ref"><th scope="row">${esc(labelOf(group, statsRef))} <small>reference</small></th><td>${refYes}</td><td>${refN - refYes}</td><td>${pct(refYes, refN)}</td><td>1 (reference)</td><td>–</td></tr>
        ${rows.map(r => `<tr class="${r.p < 0.05 ? "is-sig" : ""}"><th scope="row">${esc(labelOf(group, r.g))}</th><td>${r.a}</td><td>${r.b}</td><td>${pct(r.a, r.n)}</td><td><span class="or-value">${fmtN(r.or.or)}</span> <small>(${fmtN(r.or.lo)}–${fmtN(r.or.hi)})</small>${r.or.corrected ? ' <abbr title="A zero cell: 0.5 was added to every cell (Haldane-Anscombe correction)">*</abbr>' : ""}${ciBar(r.or)}</td><td>${fmtP(r.p)}${r.p < bonf ? ' <abbr title="Also significant after Bonferroni correction">†</abbr>' : ""}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="stats-foot">Fisher's exact test (two-sided) per comparison; 95% CI by the Woolf log method. * zero cell, 0.5 added to every cell. Rows with p &lt; 0.05 are highlighted; † also significant after Bonferroni correction for ${k} comparison${k === 1 ? "" : "s"} (p &lt; ${bonf.toPrecision(2)}). ${multi ? "Records that belong to both a group and the reference group are left out of that comparison." : ""} Small groups give wide intervals: read them with care.</p></div></details>`;
  };
  // A small forest-plot bar on a log scale from 0.05 to 20, with a line at OR = 1.
  const ciBar = or => {
    const pos = v => Math.max(0, Math.min(100, (Math.log(v) - Math.log(0.05)) / (Math.log(20) - Math.log(0.05)) * 100));
    return `<span class="ci-bar" aria-hidden="true"><i class="ci-one"></i><i class="ci-range" style="left:${pos(or.lo)}%;width:${Math.max(1, pos(or.hi) - pos(or.lo))}%"></i><i class="ci-point" style="left:${pos(or.or)}%"></i></span>`;
  };
  document.addEventListener("change", event => {
    if (event.target.matches("[data-stats-outcome]")) { statsOutcome = event.target.value; renderStats(filtered(), prepare(filtered())); syncStatsUrl(); }
    if (event.target.matches("[data-stats-ref]")) { statsRef = event.target.value; renderStats(filtered(), prepare(filtered())); syncStatsUrl(); }
  });
  const syncStatsUrl = () => { try { const u = new URL(location.href); u.searchParams.set("outcome", statsOutcome); u.searchParams.set("ref", statsRef); history.replaceState(null, "", u.pathname + u.search); } catch { /* ignore */ } };
  document.addEventListener("click", event => {
    if (!event.target.closest("[data-action='stats-csv']")) return;
    const p = compute(filtered());
    const lines = [["Outcome", labelOf(p.split, statsOutcome)], ["Reference group", labelOf(p.group, statsRef)], [], [variables[p.group].label, "With outcome", "Without", "OR", "95% CI low", "95% CI high", "Zero-cell correction", "p (Fisher, two-sided)"],
      ...lastStats.rows.map(r => [labelOf(p.group, r.g), r.a, r.b, r.or.or.toFixed(3), r.or.lo.toFixed(3), r.or.hi.toFixed(3), r.or.corrected ? "yes" : "no", r.p.toPrecision(3)])];
    const csv = "﻿" + lines.map(l => l.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `nam-statistics-${p.group}-by-${p.split}.csv`);
  });

  /* ---------- Customise layout: text size, spacing, widths, colours, gridlines ---------- */
  const fmtDefaults = { font: 100, len: 100, bar: 0, gap: 0, labelW: 0, colW: 0, plotH: 0, palette: "default", grid: true };
  const fmt = { ...fmtDefaults };
  const palettes = {
    default: palette.slice(),
    colourblind: ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442", "#1b1b1b", "#4C7A9F", "#B8860B", "#2F7F5F", "#9E5A83", "#7FA9C9", "#A0522D", "#9e9a3c", "#666666", "#1f3b5a", "#bbbbbb"],
    blues: ["#08306b", "#08519c", "#2171b5", "#4292c6", "#6baed6", "#9ecae1", "#c6dbef", "#3f5f86", "#1d4f86", "#5b87b8", "#8fb3d9", "#b7cde6", "#0b3a70", "#2d6aa6", "#6f9ccc", "#a3c1e0", "#d5e3f2", "#274b73"],
    viridis: ["#440154", "#482878", "#3e4989", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725", "#2c3e7a", "#21908c", "#5dc863", "#aadc32", "#3b528b", "#27ad81", "#83d34b", "#dce319"],
    warm: ["#7f2704", "#a63603", "#d94801", "#f16913", "#fd8d3c", "#fdae6b", "#fdd0a2", "#b30000", "#e34a33", "#fc8d59", "#fdbb84", "#8c2d04", "#cc4c02", "#ec7014", "#fe9929", "#fec44f", "#993404", "#d7301f"],
    greens: ["#00441b", "#006d2c", "#238b45", "#41ab5d", "#74c476", "#a1d99b", "#c7e9c0", "#1b5e3a", "#2e7d4f", "#4f9d69", "#7fbf8f", "#b5dcbf", "#0b4f2a", "#35845a", "#62a878", "#94c9a0", "#c9e6cf", "#205c3b"],
    pastel: ["#8dd3c7", "#bebada", "#fb8072", "#80b1d3", "#fdb462", "#b3de69", "#fccde5", "#bc80bd", "#ccebc5", "#ffed6f", "#a6cee3", "#b2df8a", "#fb9a99", "#fdbf6f", "#cab2d6", "#d9d9d9", "#9ecae1", "#e5c494"],
    contrast: ["#000000", "#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00", "#a65628", "#f781bf", "#999999", "#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e", "#e6ab02", "#a6761d", "#666666", "#17becf"],
    uu: ["#ffcd00", "#c00a35", "#000000", "#5b2182", "#24a793", "#f3965e", "#aa1555", "#6e3b23", "#001240", "#5287c6", "#ffe6ab", "#cccccc", "#e5a300", "#8a0726", "#333333", "#3d1557", "#17756a", "#b36a3d"],
    muted: ["#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#76b7b2", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac", "#86bcb6", "#d37295", "#a0cbe8", "#ffbe7d", "#8cd17d", "#f1ce63", "#499894", "#d4a6c8"]
  };
  const fmtInputs = [...document.querySelectorAll("[data-fmt]")];
  const fmtCodes = { len: "w", font: "f", bar: "b", gap: "g", labelW: "l", colW: "c", plotH: "h" };
  const encodeFmt = () => {
    const parts = Object.entries(fmtCodes).filter(([k]) => fmt[k] !== fmtDefaults[k]).map(([k, c]) => c + fmt[k]);
    if (fmt.palette !== "default") parts.push("p" + fmt.palette);
    if (!fmt.grid) parts.push("nogrid");
    return parts.join("-");
  };
  const decodeFmt = text => String(text || "").split("-").filter(Boolean).forEach(part => {
    if (part === "nogrid") { fmt.grid = false; return; }
    if (part[0] === "p" && palettes[part.slice(1)]) { fmt.palette = part.slice(1); return; }
    const key = Object.keys(fmtCodes).find(k => fmtCodes[k] === part[0]); const value = Number(part.slice(1));
    if (key && Number.isFinite(value)) fmt[key] = value;
  });
  const applyFormat = () => {
    const set = (name, value, unit = "px") => value ? chart.style.setProperty(name, value + unit) : chart.style.removeProperty(name);
    chart.style.setProperty("--font-scale", String(fmt.font / 100));
    chart.style.setProperty("--chart-w", fmt.len + "%");
    set("--bar-h", fmt.bar); set("--row-gap", fmt.gap); set("--label-w", fmt.labelW); set("--col-w", fmt.colW); set("--plot-h", fmt.plotH);
    chart.classList.toggle("no-grid", !fmt.grid);
    palette.splice(0, palette.length, ...(palettes[fmt.palette] || palettes.default));
  };
  const syncFmtInputs = () => fmtInputs.forEach(input => {
    const key = input.dataset.fmt, shown = fmt[key] || Number(input.dataset.default || 0);
    if (input.type === "checkbox") input.checked = Boolean(fmt[key]);
    else if (input.tagName === "SELECT") input.value = fmt[key];
    else input.value = shown;
    document.querySelectorAll(`[data-fmt-out="${key}"]`).forEach(out => { out.textContent = key === "font" || key === "len" ? `${fmt[key]}%` : fmt[key] ? `${fmt[key]} px` : "auto"; });
  });
  fmtInputs.forEach(input => input.addEventListener("input", () => {
    const key = input.dataset.fmt;
    fmt[key] = input.type === "checkbox" ? input.checked : input.tagName === "SELECT" ? input.value : Number(input.value);
    syncFmtInputs(); draw();
  }));
  document.querySelector("[data-action='fmt-reset']")?.addEventListener("click", () => { Object.assign(fmt, fmtDefaults); syncFmtInputs(); draw(); });
  // Picking S/M/L again clears the custom bar thickness and plot height so the preset takes over.
  document.querySelectorAll("[data-size]").forEach(button => button.addEventListener("click", () => { fmt.bar = 0; fmt.plotH = 0; syncFmtInputs(); }));
  // Quick layout presets.
  const layoutPresets = {
    compact: { font: 90, bar: 12, gap: 4, labelW: 180, colW: 56, plotH: 240 },
    presentation: { font: 125, bar: 30, gap: 16, labelW: 300, colW: 110, plotH: 460 },
    print: { font: 110, bar: 20, gap: 10, labelW: 260, colW: 90, plotH: 380, grid: true }
  };
  document.querySelectorAll("[data-layout-preset]").forEach(button => button.addEventListener("click", () => {
    Object.assign(fmt, fmtDefaults, layoutPresets[button.dataset.layoutPreset] || {}); syncFmtInputs(); draw();
  }));

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
  [sortSelect, scaleSelect, topSelect, labelsSelect, namesSelect, ...filterSelects].filter(Boolean).forEach(select => select.addEventListener("change", () => { reset(); draw(); }));
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

  const toggleGroups = { view: () => (view === "graph" && orient === "pie" ? "pie" : view), measure: () => measure, orient: () => orient, size: () => size };
  const updateToggles = () => Object.keys(toggleGroups).forEach(key => document.querySelectorAll(`[data-${key}]`).forEach(button => {
    const on = button.dataset[key] === toggleGroups[key]();
    button.classList.toggle("selected", on); button.setAttribute("aria-pressed", String(on));
  }));
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
    const choice = button.dataset.view;
    if (choice === "pie") { view = "graph"; orient = "pie"; }
    else { if (choice === "graph" && orient === "pie") orient = "horizontal"; view = choice; }
    updateToggles(); draw();
  }));
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

  const exportPie = (data, p) => {
    const one = p.split === "none", items = one ? pieItems(p) : null;
    const r = one ? 210 : 95, cols = 4, cellW = 380, cellH = 2 * r + 70;
    const rowsN = one ? 1 : Math.ceil(p.shown.length / cols);
    const legendNames = one ? [] : p.series.map(name => ({ label: labelOf(p.split, name), color: p.colorOf(name) }));
    const canvas = document.createElement("canvas"); canvas.width = 1600;
    canvas.height = 170 + (one ? Math.max(2 * r, items.length * 30) + 60 : rowsN * cellH + Math.ceil(legendNames.length / 3) * 30) + 60;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#113d70"; ctx.font = "bold 34px Arial"; ctx.fillText(result.querySelector("h2").textContent, 60, 64);
    ctx.fillStyle = "#68788d"; ctx.font = "18px Arial"; ctx.fillText(`${data.length} of ${records.length} TSAR records · Filters: ${filterSummary()}`.slice(0, 150), 60, 100);
    const drawDonut = (list, cx, cy, rad) => {
      const sum = list.reduce((a, b) => a + b.n, 0) || 1; let a = -Math.PI / 2;
      list.forEach(it => { const a1 = a + it.n / sum * Math.PI * 2; ctx.beginPath(); ctx.arc(cx, cy, rad, a, a1); ctx.arc(cx, cy, rad * 0.55, a1, a, true); ctx.closePath(); ctx.fillStyle = it.color; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); a = a1; });
    };
    if (one) {
      drawDonut(items, 60 + r, 170 + r, r);
      const sum = items.reduce((a, b) => a + b.n, 0) || 1;
      items.forEach((it, i) => { const y = 180 + i * 30; ctx.fillStyle = it.color; ctx.fillRect(560, y, 18, 18); ctx.fillStyle = "#425a72"; ctx.font = "16px Arial"; ctx.fillText(`${String(it.label).slice(0, 60)}  -  ${it.n} (${pct(it.n, sum)})`, 590, y + 15); });
    } else {
      p.shown.forEach((row, i) => { const cx = 60 + (i % cols) * cellW + cellW / 2 - 20, cy = 170 + Math.floor(i / cols) * cellH + r; drawDonut(pieItems(p, row), cx, cy, r); ctx.fillStyle = "#425a72"; ctx.font = "bold 15px Arial"; ctx.textAlign = "center"; ctx.fillText(String(labelOf(p.group, row.name)).slice(0, 40), cx, cy + r + 24); ctx.font = "13px Arial"; ctx.fillText(`n=${row.total}`, cx, cy + r + 42); ctx.textAlign = "left"; });
      const top1 = 170 + rowsN * cellH;
      legendNames.forEach((it, i) => { const x = 60 + (i % 3) * 500, y = top1 + Math.floor(i / 3) * 30; ctx.fillStyle = it.color; ctx.fillRect(x, y, 18, 18); ctx.fillStyle = "#425a72"; ctx.font = "15px Arial"; ctx.fillText(String(it.label).slice(0, 55), x + 28, y + 15); });
    }
    canvas.toBlob(blob => { if (blob) download(blob, fileName(p, "png")); }, "image/png");
  };
  // The image follows the chart as shown: direction, scale, hidden categories and top-N.
  document.querySelector("[data-action='png']")?.addEventListener("click", () => {
    const data = filtered(); const p = prepare(data);
    if (orient === "pie") { exportPie(data, p); return; }
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
        const t = segText(s.n, data.length);
        ctx.save(); ctx.font = "bold 13px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        if (horizontal) { ctx.fillRect(x + offset, y, w * share, h); if (t && w * share >= ctx.measureText(t).width + 10) { ctx.fillStyle = inkFor(s.color); ctx.fillText(t, x + offset + w * share / 2, y + h / 2); } offset += w * share; }
        else { ctx.fillRect(x, y + h - offset - h * share, w, h * share); if (t && h * share >= 16 && w >= ctx.measureText(t).width + 6) { ctx.fillStyle = inkFor(s.color); ctx.fillText(t, x + w / 2, y + h - offset - h * share / 2); } offset += h * share; }
        ctx.restore();
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
    if (labelsSelect) labelsSelect.value = "off";
    if (namesSelect) namesSelect.checked = false;
    view = "graph"; measure = "percent"; orient = "horizontal"; size = "m";
    hidden.clear(); reset(); updateToggles(); draw();
  });

  // "More filters" opens the less-used filters below the main filter row.
  const moreToggle = document.querySelector("[data-more-filters]");
  const morePanel = document.getElementById("more-filters");
  const setMoreOpen = open => { if (!moreToggle || !morePanel) return; morePanel.hidden = !open; moreToggle.setAttribute("aria-expanded", String(open)); };
  moreToggle?.addEventListener("click", () => setMoreOpen(morePanel.hidden));

  readUrl(); updateToggles(); syncFmtInputs();
  if (morePanel && [...morePanel.querySelectorAll("select")].some(select => select.value)) setMoreOpen(true);
  draw();
});
