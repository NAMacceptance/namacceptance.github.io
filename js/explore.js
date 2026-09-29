/* Explore Data: search, filter, sort, compare and export the TSAR snapshot. The page markup lives in explore/explore-data.html. */
document.addEventListener("DOMContentLoaded", () => {
  const records = window.NAM_METHOD_RECORDS || [];
  const tbody = document.querySelector("[data-explore-results]");
  if (!tbody) return;

  /* ---------- Vocabulary ---------- */
  const stageCodeLabels = {
    SUB_ASSESS: "Submission · under assessment", SUB_FINAL: "Submission · assessment finalised", SUB_NOTVAL: "Submission · not considered for validation", SUB_STOP: "Submission · stopped",
    VAL_PLAN: "Validation · planning", VAL_ONGO: "Validation · ongoing", VAL_FINAL: "Validation · finalised", VAL_STOP: "Validation · stopped",
    VAL_PEER_FINAL: "Peer review · finalised", VAL_PEER_STOP: "Peer review · stopped", REC_NA: "Recommendation · not applicable",
    REG_DRAFT: "Regulatory · drafting new standard", REG_OTHERSTAGE: "Regulatory · revising existing standard", REG_PUBL: "Regulatory · published",
    REG_ADOPT: "Regulatory · adopted/published", REG_STOP: "Regulatory · stopped", UNKNOWN_UNKNOWN: "Stage unrecorded"
  };
  const codeOrder = Object.keys(stageCodeLabels);
  const stageOrder = ["Test Submission", "Validation", "Regulatory assessment"];
  const statusOrder = ["Ongoing", "Acceptance pending", "Finalised", "Adopted", "Rejected", "Discontinued", "Not applicable", "Unknown"];
  const multiKeys = { endpoint: ";", methodology: ";", applicationDomainExpert: ";", bottlenecks: ";", topic: "," };

  const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
  const slug = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const reviewLevel = m => { const v = m.coreVerification || m.review || "Researcher verified"; return /^(expert[- ]reviewed|reviewed)$/i.test(v) ? "Researcher verified" : v; };
  const codeLabel = code => stageCodeLabels[code] || code || "—";
  const valuesOf = (m, key) => {
    if (key === "coreVerification") return [reviewLevel(m)];
    if (multiKeys[key]) return String(m[key] || "").split(multiKeys[key]).map(v => v.trim()).filter(Boolean);
    return [String(m[key] ?? "").trim()].filter(Boolean);
  };
  const optionLabel = (key, value) => (key === "code" || key === "evidenceUpdatedStage") && stageCodeLabels[value] ? `${codeLabel(value)} (${value})` : value;
  const orderFor = key => key === "code" || key === "evidenceUpdatedStage" ? codeOrder : key === "progressionBeyondTsar" ? ["Lifecycle updated beyond raw TSAR snapshot", "Raw TSAR lifecycle retained"] : key === "caseStudy" ? ["Direct case study", "Borderline transition case", "Not included"] : key === "stage" ? stageOrder : key === "status" ? statusOrder : null;
  const compareValue = (key, a, b) => {
    if (key === "yearReceived") return Number(b) - Number(a);
    const order = orderFor(key);
    if (order) { const ia = order.indexOf(a), ib = order.indexOf(b); if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib); }
    return a.localeCompare(b, "en", { numeric: true });
  };

  /* ---------- Controls ---------- */
  const controls = [...document.querySelectorAll("[data-explore-filter]")];
  const byKey = Object.fromEntries(controls.map(el => [el.dataset.exploreFilter, el]));
  const selects = controls.filter(el => el.tagName === "SELECT");
  const textInputs = controls.filter(el => el.tagName === "INPUT");
  const labelOf = el => el.closest("label")?.querySelector("span")?.textContent.trim() || el.getAttribute("aria-label") || el.dataset.exploreFilter;

  selects.forEach(select => {
    const key = select.dataset.exploreFilter, counts = new Map();
    records.forEach(m => new Set(valuesOf(m, key)).forEach(v => counts.set(v, (counts.get(v) || 0) + 1)));
    const values = [...counts.keys()].sort((a, b) => compareValue(key, a, b));
    select.replaceChildren(new Option(select.options[0]?.textContent || "All", ""), ...values.map(v => new Option(`${optionLabel(key, v)} (${counts.get(v)})`, v)));
  });

  let visible = 15, selected = [], current = records, sortKey = "", sortDir = 1;

  const params = new URLSearchParams(location.search);
  controls.forEach(el => { const v = params.get(el.dataset.exploreFilter); if (v != null && (el.tagName !== "SELECT" || [...el.options].some(o => o.value === v))) el.value = v; });
  if (params.get("sort")) { sortKey = params.get("sort").replace(/^-/, ""); sortDir = params.get("sort").startsWith("-") ? -1 : 1; }
  (params.get("compare") || "").split("~").filter(id => records.some(r => r.id === id)).slice(0, 4).forEach(id => selected.push(id));

  // The tick-box column only shows while the visitor is picking methods to compare.
  let compareMode = selected.length > 0;
  const compareModeButton = document.querySelector("[data-compare-mode]");
  const exploreTable = tbody.closest("table");

  const syncUrl = () => {
    const p = new URLSearchParams();
    controls.forEach(el => { if (el.value.trim()) p.set(el.dataset.exploreFilter, el.value.trim()); });
    if (sortKey) p.set("sort", (sortDir < 0 ? "-" : "") + sortKey);
    if (selected.length) p.set("compare", selected.join("~"));
    const q = p.toString();
    try { history.replaceState(null, "", location.pathname + (q ? "?" + q : "")); } catch { /* blocked on some file:// setups */ }
  };

  /* ---------- Filtering and sorting ---------- */
  const textFields = {
    q: m => [m.id, m.shortName, m.title, m.organisation, m.endpoint, m.topic, m.description, m.generalComments, m.protocolSop].join(" "),
    idQuery: m => `${m.id} ${m.shortName}`,
    titleQuery: m => m.title,
    textQuery: m => `${m.description} ${m.generalComments} ${m.protocolSop}`
  };
  const matches = m => textInputs.every(el => {
    const terms = el.value.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const hay = String((textFields[el.dataset.exploreFilter] || textFields.q)(m) || "").toLowerCase();
    return terms.every(t => hay.includes(t));
  }) && selects.every(el => !el.value || valuesOf(m, el.dataset.exploreFilter).includes(el.value));

  const sortValue = {
    shortName: m => String(m.shortName || m.title).toLowerCase(),
    id: m => String(m.id || ""),
    organisation: m => String(m.organisation || "").toLowerCase(),
    endpoint: m => String(m.endpoint || "").toLowerCase(),
    methodology: m => String(m.methodology || "").toLowerCase(),
    stage: m => stageOrder.indexOf(m.stage),
    status: m => statusOrder.indexOf(m.status),
    code: m => codeOrder.indexOf(m.code),
    yearReceived: m => Number(m.yearReceived) || 0
  };
  const sorted = list => {
    if (!sortKey || !sortValue[sortKey]) return list;
    const get = sortValue[sortKey];
    return [...list].sort((a, b) => { const x = get(a), y = get(b); return (x < y ? -1 : x > y ? 1 : 0) * sortDir || String(a.id).localeCompare(String(b.id)); });
  };

  /* ---------- Rendering ---------- */
  const resultLine = document.querySelector("[data-result-count]");
  const showingLine = document.querySelector("[data-result-showing]");
  const chipsEl = document.querySelector("[data-active-filters]");
  const moreCount = document.querySelector("[data-more-count]");
  const moreButton = document.querySelector("[data-more-button]");
  const morePanel = document.getElementById("explore-more-filters");

  const highlight = text => {
    const terms = (byKey.q?.value.trim() || "").split(/\s+/).filter(t => t.length > 1);
    if (!terms.length) return esc(text);
    const pattern = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
    // Split the raw text first so the <mark> tags never land inside escaped characters.
    return String(text ?? "").split(pattern).map((part, i) => i % 2 ? `<mark>${esc(part)}</mark>` : esc(part)).join("");
  };

  const row = m => {
    const checked = selected.includes(m.id), full = !checked && selected.length >= 4;
    return `<tr class="${checked ? "is-selected" : ""}">
<td class="col-compare"><input class="form-check-input" type="checkbox" aria-label="Compare ${esc(m.shortName)}" title="${full ? "You can compare up to 4 methods" : "Add to comparison"}" data-compare="${esc(m.id)}" ${checked ? "checked" : ""} ${full ? "disabled" : ""}></td>
<td><a class="method-button btn btn-link p-0 text-start" href="method-detail.html?id=${encodeURIComponent(m.id)}" data-open-record="${esc(m.id)}" title="${esc(m.title)}"><strong>${highlight(m.shortName || m.title)}</strong><span>${highlight(m.id)} · ${esc(m.organisation || "")}</span></a></td>
<td class="wrap-cell">${esc(m.applicationDomainExpert || "—")}</td>
<td class="wrap-cell">${highlight(m.endpoint || "—")}</td>
<td>${esc(m.methodology || "—")}</td>
<td><span class="stage-tag ${slug(m.stage)}">${esc(m.stage || "—")}</span></td>
<td><span class="status-pill status-${slug(m.status)}">${esc(m.status || "—")}</span></td>
<td class="code-cell">${esc(codeLabel(m.code))}<code>${esc(m.code || "")}</code>${m.progressionBeyondTsar === "Lifecycle updated beyond raw TSAR snapshot" ? `<span class="prog-note" title="The verified lifecycle differs from the raw TSAR snapshot">↗ External: ${esc(codeLabel(m.evidenceUpdatedStage))}</span>` : ""}</td>
<td class="num-cell">${esc(m.yearReceived || "—")}</td>
<td><a class="row-button btn btn-sm" href="method-detail.html?id=${encodeURIComponent(m.id)}" data-open-record="${esc(m.id)}" aria-label="Open ${esc(m.title)}">›</a></td></tr>`;
  };

  const compareFields = [
    ["Organisation", m => m.organisation], ["Year received", m => m.yearReceived], ["Regulatory stage", m => m.stage], ["Regulatory status", m => m.status],
    ["NEW_STEP_STAGE", m => codeLabel(m.code)], ["External evidence step/stage", m => codeLabel(m.evidenceUpdatedStage)], ["Lifecycle update beyond raw TSAR", m => m.progressionBeyondTsar], ["Case-study sample", m => m.caseStudy],
    ["Literature completeness", m => m.literature], ["Researcher application domain", m => m.applicationDomainExpert], ["Endpoint category", m => m.endpoint], ["Core methodology", m => m.methodology],
    ["3R category", m => m.threeR], ["Animal-use impact", m => m.animalUseImpact], ["Documented bottleneck signals", m => m.bottlenecks], ["Number of bottleneck signals", m => m.bottleneckCount]
  ];
  const renderCompare = () => {
    const tray = document.querySelector("[data-compare-tray]"), section = document.querySelector("[data-comparison]");
    const chosen = selected.map(id => records.find(r => r.id === id)).filter(Boolean);
    tray.hidden = !chosen.length; section.hidden = chosen.length < 2;
    if (!chosen.length) return;
    tray.innerHTML = `<strong>${chosen.length} of 4 selected</strong><div class="tray-items">${chosen.map(m => `<span>${esc(m.shortName)}<button type="button" data-remove="${esc(m.id)}" aria-label="Remove ${esc(m.shortName)} from comparison">×</button></span>`).join("")}</div>${chosen.length < 2 ? `<small>Select at least one more method to compare.</small>` : `<button type="button" class="btn btn-sm btn-primary" data-view-comparison>Compare ${chosen.length} methods ↓</button>`}<button type="button" class="link-button" data-clear-compare>Clear</button>`;
    if (chosen.length < 2) return;
    section.querySelector("[data-comparison-table]").innerHTML = `<table class="table compare-table"><thead><tr><th scope="col">Field</th>${chosen.map(m => `<th scope="col"><a href="method-detail.html?id=${encodeURIComponent(m.id)}" data-open-record="${esc(m.id)}">${esc(m.shortName)}</a><small>${esc(m.id)}</small></th>`).join("")}</tr></thead><tbody>${compareFields.map(([label, get]) => { const vals = chosen.map(m => String(get(m) ?? "—") || "—"); const differs = new Set(vals).size > 1; return `<tr class="${differs ? "differs" : ""}"><th scope="row">${label}</th>${vals.map(v => `<td>${esc(v)}</td>`).join("")}</tr>`; }).join("")}</tbody></table>`;
  };

  const render = () => {
    current = sorted(records.filter(matches));
    tbody.innerHTML = current.slice(0, visible).map(row).join("") || `<tr><td class="empty-state" colspan="10"><strong>No methods match this search.</strong> Try fewer words or remove a filter. <button type="button" class="btn btn-link" data-reset>Clear search and filters</button></td></tr>`;
    resultLine.textContent = `${current.length} of ${records.length} methods`;
    showingLine.textContent = current.length ? `Showing ${Math.min(visible, current.length)}` : "";

    if (sortSelect) {
      const value = sortKey ? `${sortKey}:${sortDir}` : "";
      if (value && ![...sortSelect.options].some(o => o.value === value)) sortSelect.add(new Option(`Custom: ${sortKey} ${sortDir > 0 ? "ascending" : "descending"}`, value));
      sortSelect.value = value;
      sortSelect.classList.toggle("is-active", Boolean(value));
    }
    document.querySelectorAll("[data-sort]").forEach(button => {
      const on = button.dataset.sort === sortKey;
      button.closest("th").setAttribute("aria-sort", on ? (sortDir > 0 ? "ascending" : "descending") : "none");
      button.querySelector(".sort-icon").textContent = on ? (sortDir > 0 ? "▲" : "▼") : "↕";
    });

    const active = controls.filter(el => el.value.trim());
    chipsEl.innerHTML = active.length ? `<span class="chips-label">Showing methods with:</span>${active.map(el => `<button type="button" class="filter-chip" data-remove-filter="${esc(el.dataset.exploreFilter)}" aria-label="Remove ${esc(labelOf(el))} filter">${esc(labelOf(el))}: <strong>${esc(el.tagName === "SELECT" ? optionLabel(el.dataset.exploreFilter, el.value) : `“${el.value.trim()}”`)}</strong> <span aria-hidden="true">×</span></button>`).join("")}<button type="button" class="link-button" data-reset>Clear all</button>` : `<span class="chips-label">No filters applied. Search or pick a filter to narrow the ${records.length} methods.</span>`;
    controls.forEach(el => el.classList.toggle("is-active", Boolean(el.value.trim())));
    const moreActive = active.filter(el => morePanel?.contains(el)).length;
    if (moreCount) moreCount.textContent = moreActive ? String(moreActive) : "";

    document.querySelectorAll(".explore-more-rows").forEach(el => el.remove());
    if (visible < current.length) {
      const wrap = document.createElement("div"); wrap.className = "explore-more-rows";
      wrap.innerHTML = `<button type="button" class="show-more btn btn-outline-primary" data-more-rows>Show ${Math.min(30, current.length - visible)} more</button><button type="button" class="show-more btn btn-outline-primary" data-all-rows>Show all ${current.length}</button>`;
      tbody.closest(".table-scroll").after(wrap);
    }
    exploreTable.classList.toggle("compare-off", !compareMode);
    if (compareModeButton) {
      compareModeButton.setAttribute("aria-pressed", String(compareMode));
      compareModeButton.innerHTML = compareMode ? `<span aria-hidden="true">✓</span> Done selecting` : `<span aria-hidden="true">⇆</span> Compare methods`;
      compareModeButton.title = compareMode ? "Hide the tick boxes (your selection is kept)" : "Show tick boxes to pick up to 4 methods to compare";
    }
    renderCompare(); syncUrl();
  };

  /* ---------- Events ---------- */
  const reset = () => { controls.forEach(el => { el.value = ""; }); visible = 15; render(); };
  controls.forEach(el => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => { visible = 15; render(); }));
  document.querySelectorAll("[data-sort]").forEach(button => button.addEventListener("click", () => {
    const key = button.dataset.sort;
    if (sortKey !== key) { sortKey = key; sortDir = key === "yearReceived" ? -1 : 1; }
    else if ((key === "yearReceived" ? sortDir < 0 : sortDir > 0)) sortDir = -sortDir;
    else { sortKey = ""; sortDir = 1; }
    render();
  }));
  compareModeButton?.addEventListener("click", () => { compareMode = !compareMode; render(); });
  const sortSelect = document.querySelector("[data-sort-select]");
  sortSelect?.addEventListener("change", () => {
    const [key, dir] = sortSelect.value.split(":");
    sortKey = key || ""; sortDir = Number(dir) || 1; render();
  });
  const setMoreOpen = open => { if (!morePanel || !moreButton) return; morePanel.hidden = !open; moreButton.setAttribute("aria-expanded", String(open)); };
  moreButton?.addEventListener("click", () => setMoreOpen(morePanel.hidden));
  if (morePanel && [...morePanel.querySelectorAll("[data-explore-filter]")].some(el => el.value)) setMoreOpen(true);

  document.addEventListener("keydown", event => {
    if (event.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) { event.preventDefault(); byKey.q?.focus(); }
  });

  const flash = (button, text) => { const original = button.dataset.label || button.textContent; button.dataset.label = original; button.textContent = text; setTimeout(() => { button.textContent = original; }, 1800); };
  document.querySelector("[data-action='copy-link']")?.addEventListener("click", async event => {
    const button = event.currentTarget; syncUrl();
    try { await navigator.clipboard.writeText(location.href); flash(button, "Link copied ✓"); }
    catch { window.prompt("Copy this link to share the current view:", location.href); }
  });
  document.querySelector("[data-action='csv']")?.addEventListener("click", () => {
    const cols = [["tm_id", m => m.id], ["short_name", m => m.shortName], ["title", m => m.title], ["organisation", m => m.organisation], ["year_received", m => m.yearReceived],
      ["workflow_step", m => m.workflowStep], ["workflow_stage", m => m.workflowStage], ["regulatory_stage", m => m.stage], ["regulatory_status", m => m.status],
      ["NEW_STEP_STAGE", m => m.code], ["external_evidence_step_stage", m => m.evidenceUpdatedStage], ["lifecycle_update_beyond_raw_tsar", m => m.progressionBeyondTsar], ["case_study", m => m.caseStudy], ["literature_completeness", m => m.literature], ["endpoint_category", m => m.endpoint],
      ["core_methodology", m => m.methodology], ["researcher_application_domain", m => m.applicationDomainExpert], ["three_r", m => m.threeR], ["animal_use_impact", m => m.animalUseImpact],
      ["documented_bottleneck_signals", m => m.bottlenecks], ["bottleneck_signal_count", m => m.bottleneckCount]];
    const csv = "﻿" + [cols.map(c => c[0]), ...current.map(m => cols.map(c => c[1](m)))].map(r => r.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `tsar-methods-${current.length}-of-${records.length}.csv`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 0);
  });

  document.addEventListener("click", event => {
    const open = event.target.closest("[data-open-record]");
    if (open && !event.ctrlKey && !event.metaKey && event.button === 0) { event.preventDefault(); window.location.href = "method-detail.html?id=" + encodeURIComponent(open.dataset.openRecord); return; }
    const compare = event.target.closest("[data-compare]");
    if (compare) { const id = compare.dataset.compare; selected = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id].slice(0, 4); render(); return; }
    const remove = event.target.closest("[data-remove]");
    if (remove) { selected = selected.filter(x => x !== remove.dataset.remove); render(); return; }
    if (event.target.closest("[data-clear-compare]")) { selected = []; render(); return; }
    const chip = event.target.closest("[data-remove-filter]");
    if (chip) { byKey[chip.dataset.removeFilter].value = ""; visible = 15; render(); return; }
    if (event.target.closest("[data-reset]")) { reset(); return; }
    if (event.target.closest("[data-more-rows]")) { visible += 30; render(); return; }
    if (event.target.closest("[data-all-rows]")) { visible = current.length; render(); return; }
    if (event.target.closest("[data-view-comparison]")) document.querySelector("[data-comparison]")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  render();
});
