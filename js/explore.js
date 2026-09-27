/* Explorer behaviour. The sidebar, filter form and table are authored in explore/index.html. */
document.addEventListener("DOMContentLoaded", () => {
  const records = window.NAM_METHOD_RECORDS || [];

  const lifecycleLabels = {
    "REG_ADOPT": "Regulatory adoption",
    "REG_DRAFT": "Regulatory draft guideline / standard",
    "REG_RECOM": "Regulatory recommendation",
    "REG_REJ": "Regulatory rejection",
    "REG_OTHERSTAGE": "Regulatory other stage",
    "VAL_CONCL": "Validation concluded / study finalized",
    "VAL_ONGO": "Validation ongoing",
    "VAL_STOP": "Validation discontinued / stopped",
    "VAL_PEER_FINAL": "Validation peer review finalised",
    "SUB_FINAL": "Submission finalised",
    "SUB_STOP": "Submission process stopped / discontinued",
    "SUB_ONGO": "Submission ongoing",
    "REC_NA": "Recommendation not applicable",
    "UNKNOWN_UNKNOWN": "Status unrecorded / unknown"
  };

  const tbody = document.querySelector("[data-explore-results]");
  if (!tbody) return;
  const filters = Object.fromEntries([...document.querySelectorAll("[data-explore-filter]")].map(el => [el.dataset.exploreFilter, el]));
  const toolbar = document.querySelector("[data-explorer-toolbar]");
  const filterSections = document.querySelector(".filter-sections");
  const resultLine = document.querySelector(".results-line strong");
  const showingLine = document.querySelector(".results-line span");
  const slug = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const esc = value => String(value || "").replace(/[&<>\"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"})[char]);
  const reviewLevel = method => { const val = method.coreVerification || (method.review === "Reviewed" ? "Researcher verified" : method.review) || "Researcher verified"; return (val === "Expert-reviewed" || val === "Expert reviewed" || val === "Reviewed") ? "Researcher verified" : val; };
  const multiValues = (value, separator) => String(value || "").split(separator).map(part => part.trim()).filter(Boolean);
  const filterValue = (method, key) => key === "coreVerification" ? reviewLevel(method) : method[key];
  Object.entries(filters).forEach(([key, select]) => {
    if (select.tagName !== "SELECT") return;
    const initial = select.options[0].textContent;
    const all = new Set(records.flatMap(method => key === "topic" ? multiValues(method.topic, ",") : ["endpoint", "methodology", "applicationDomainExpert"].includes(key) ? multiValues(method[key], ";") : [filterValue(method, key)]).map(value => String(value ?? "").trim()).filter(Boolean));
    const values = [...all].sort((a, b) => key === "yearReceived" ? Number(b) - Number(a) : a.localeCompare(b, "en", { numeric: true }));
    select.replaceChildren(new Option(initial, ""), ...values.map(value => new Option(value, value)));
  });
  const search = new URLSearchParams(location.search);
  Object.entries(filters).forEach(([key, el]) => { const value = search.get(key); if (value != null && (el.tagName !== "SELECT" || [...el.options].some(option => option.value === value))) el.value = value; });
  let visible = 12, selected = [], current = records;
  const values = () => Object.fromEntries(Object.entries(filters).map(([key, el]) => [key, el.value]));
  const matches = method => {
    const v = values();
    const contains = (text, term) => !term || String(text || "").toLowerCase().includes(term.toLowerCase());
    const equal = (value, choice) => !choice || choice.startsWith("All ") || value === choice;
    return contains(`${method.id} ${method.shortName}`, v.idQuery) && contains(method.title, v.titleQuery) && contains(`${method.description} ${method.generalComments} ${method.protocolSop}`, v.textQuery)
      && equal(method.stepStage, v.stepStage) && equal(method.workflowStep, v.workflowStep) && equal(method.workflowStage, v.workflowStage)
      && equal(method.yearReceived, v.yearReceived) && equal(method.organisation, v.organisation) && equal(method.stage, v.stage)
      && equal(method.status, v.status) && equal(method.code, v.code) && (equal("", v.methodology) || multiValues(method.methodology, ";").includes(v.methodology)) && equal(reviewLevel(method), v.coreVerification)
      && (equal("", v.applicationDomainExpert) || multiValues(method.applicationDomainExpert, ";").includes(v.applicationDomainExpert)) && equal(method.lifecycleVerification, v.lifecycleVerification)
      && (equal("", v.topic) || method.topic.split(",").map(x => x.trim()).includes(v.topic))
      && (equal("", v.endpoint) || method.endpoint.split(";").map(x => x.trim()).includes(v.endpoint));
  };
  const row = method => `<tr><td><input class="form-check-input" type="checkbox" aria-label="Compare ${esc(method.shortName)}" data-compare="${esc(method.id)}" ${selected.includes(method.id) ? "checked" : ""} ${!selected.includes(method.id) && selected.length >= 4 ? "disabled" : ""}></td><td><a class="method-button btn btn-link p-0 text-start" href="method-detail.html?id=${encodeURIComponent(method.id)}" data-open-record="${esc(method.id)}"><strong>${esc(method.shortName || method.title)}</strong><span>${esc(method.id)} · view record →</span></a></td><td class="wrap-cell">${esc(method.endpoint || "—")}</td><td>${esc(method.methodology || "—")}</td><td><span class="stage-tag ${slug(method.stage)}">${esc(method.stage)}</span></td><td><code title="${esc(lifecycleLabels[method.code] || method.code)}">${esc(method.code)}</code></td><td><span class="review-badge ${slug(reviewLevel(method))}">${esc(reviewLevel(method))}</span></td><td><a class="row-button btn btn-sm" href="method-detail.html?id=${encodeURIComponent(method.id)}" data-open-record="${esc(method.id)}" aria-label="Open ${esc(method.title)}">›</a></td></tr>`;
  const reportDraft = method => {
    const subject = `Report concerning ${method.shortName || method.title} (${method.id})`;
    const body = `Hello,\n\nI would like to report an issue or suggestion concerning the following TSAR method:\n\nMethod: ${method.shortName || method.title}\nTM ID: ${method.id}\n\nIssue or correction:\n\n\nSource or supporting link (optional):\n\n\nBest regards,`;
    const report = document.createElement("div"); report.className = "modal-backdrop report-backdrop";
    report.innerHTML = `<section class="record-modal report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title"><header><div><span>REPORT A METHOD</span><h2 id="report-title">${esc(method.shortName || method.title)}</h2><p>${esc(method.id)} · A draft only — nothing is sent automatically.</p></div><button class="btn btn-sm" data-close-report aria-label="Close report draft">×</button></header><div class="record-body"><label class="report-field"><span>Recipient email</span><input type="email" data-report-recipient placeholder="Your email address" autocomplete="email"></label><label class="report-field"><span>Subject</span><input type="text" data-report-subject value="${esc(subject)}"></label><label class="report-field"><span>Message</span><textarea data-report-body rows="13">${esc(body)}</textarea></label><div class="report-actions"><button class="btn btn-outline-primary" type="button" data-copy-report>Copy draft</button><button class="btn btn-primary" type="button" data-open-email>Open email draft →</button></div></div></section>`;
    const close = () => report.remove();
    const fields = () => ({
      recipient: report.querySelector("[data-report-recipient]").value.trim(),
      subject: report.querySelector("[data-report-subject]").value.trim(),
      body: report.querySelector("[data-report-body]").value,
    });
    report.addEventListener("mousedown", event => { if (event.target === report) close(); });
    report.querySelector("[data-close-report]").addEventListener("click", close);
    report.querySelector("[data-copy-report]").addEventListener("click", async event => {
      const { recipient, subject: draftSubject, body: draftBody } = fields();
      const draft = `To: ${recipient || "[recipient email]"}\nSubject: ${draftSubject}\n\n${draftBody}`;
      try { await navigator.clipboard.writeText(draft); event.currentTarget.textContent = "Draft copied"; }
      catch { event.currentTarget.textContent = "Select and copy the text"; }
      setTimeout(() => event.currentTarget.textContent = "Copy draft", 1600);
    });
    report.querySelector("[data-open-email]").addEventListener("click", () => {
      const { recipient, subject: draftSubject, body: draftBody } = fields();
      window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(draftSubject)}&body=${encodeURIComponent(draftBody)}`;
    });
    document.body.append(report);
    report.querySelector("[data-report-recipient]").focus();
  };

  const renderCompare = () => {
    document.querySelector(".compare-tray")?.remove(); document.querySelector(".comparison-section")?.remove();
    if (!selected.length) return;
    const chosen = records.filter(record => selected.includes(record.id));
    const tray = document.createElement("div"); tray.className = "compare-tray panel card";
    tray.innerHTML = `<strong>${selected.length} selected for comparison</strong><div>${chosen.map(method => `<span>${esc(method.shortName)}<button class="btn btn-sm" data-remove="${esc(method.id)}">×</button></span>`).join("")}</div><button class="btn btn-sm" data-view-comparison>View comparison ↓</button>`;
    document.querySelector(".results-line").after(tray);
    const section = document.createElement("section"); section.className = "comparison-section"; section.id = "comparison";
    section.innerHTML = `<div class="block-header"><div><span class="eyebrow">Side-by-side</span><h2>Compare selected methods</h2></div><p>Select up to four records from the table.</p></div><div class="comparison-grid">${chosen.map(m => `<article class="panel card"><span>${esc(m.id)}</span><h3>${esc(m.shortName)}</h3><dl><div><dt>Stage</dt><dd>${esc(m.stage)}</dd></div><div><dt>Status</dt><dd>${esc(m.status)}</dd></div><div><dt>Endpoint</dt><dd>${esc(m.endpoint)}</dd></div><div><dt>Methodology</dt><dd>${esc(m.methodology)}</dd></div></dl><a class="btn btn-sm btn-outline-primary" href="method-detail.html?id=${encodeURIComponent(m.id)}" data-open-record="${esc(m.id)}">Open record →</a></article>`).join("")}</div>`;
    tbody.closest(".table-scroll").after(section);
  };
  const render = () => { current = records.filter(matches); tbody.innerHTML = current.slice(0, visible).map(row).join("") || '<tr><td class="empty-state" colspan="8">No methods match this view. <button class="btn btn-link" data-reset>Reset filters</button></td></tr>'; resultLine.textContent = `${current.length} of ${records.length} methods`; showingLine.textContent = `Showing ${Math.min(visible, current.length)} matching results`; document.querySelector(".show-more")?.remove(); if (visible < current.length) { const more = document.createElement("button"); more.className = "show-more btn btn-outline-primary"; more.innerHTML = `Show more methods <span>${Math.min(24, current.length - visible)} more</span>`; more.addEventListener("click", () => { visible += 24; render(); }); tbody.closest(".table-scroll").after(more); } renderCompare(); };
  const reset = () => { Object.values(filters).forEach(el => el.selectedIndex !== undefined ? el.selectedIndex = 0 : el.value = ""); visible = 12; render(); };
  Object.values(filters).forEach(el => el.addEventListener("input", () => { visible = 12; render(); }));
  toolbar?.querySelectorAll("button").forEach((button, index) => button.addEventListener("click", () => { if (index === 0) { filterSections.hidden = !filterSections.hidden; button.textContent = filterSections.hidden ? "Show filters" : "Hide filters"; } else if (index === 1) { const params = new URLSearchParams(Object.entries(values()).filter(([, value]) => value && !value.startsWith("All "))); const link = new URL(location.href); link.search = params.toString(); navigator.clipboard?.writeText(link.href); button.textContent = "View link copied"; setTimeout(() => button.textContent = "Copy view link", 1600); } else if (index === 2) { const header = ["tm_id","short_name","title","endpoint","core_methodology","regulatory_stage","regulatory_status","NEW_STEP_STAGE","review_level","organisation"]; const csv = [header, ...current.map(m => [m.id,m.shortName,m.title,m.endpoint,m.methodology,m.stage,m.status,m.code,reviewLevel(m),m.organisation])].map(row => row.map(v => `"${String(v || "").replaceAll('"','""')}"`).join(",")).join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv"})); a.download = "filtered-tsar-methods.csv"; a.click(); URL.revokeObjectURL(a.href); } else reset(); }));
  document.addEventListener("click", event => {
    const open = event.target.closest("[data-open-record]");
    const compare = event.target.closest("[data-compare]");
    const remove = event.target.closest("[data-remove]");
    if (open) {
      if (!event.ctrlKey && !event.metaKey && event.button === 0) {
        event.preventDefault();
        window.location.href = "method-detail.html?id=" + encodeURIComponent(open.dataset.openRecord);
        return;
      }
    }
    if (compare) { const id = compare.dataset.compare; selected = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]; render(); }
    if (remove) { selected = selected.filter(x => x !== remove.dataset.remove); render(); }
    if (event.target.closest("[data-reset]")) reset();
    if (event.target.closest("[data-view-comparison]")) document.querySelector("#comparison")?.scrollIntoView({behavior:"smooth"});
  });
  render();
});

