/* Shared, data-provenance-aware detail dialog and page renderer for TSAR method records. */
(() => {
  const esc = value => String(value ?? "Not available").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const hasValue = value => value !== undefined && value !== null && String(value).trim() !== "";
  const lifecycleLabels = {
    REG_ADOPT: "Regulatory adoption", REG_DRAFT: "Regulatory draft guideline / standard", REG_RECOM: "Regulatory recommendation", REG_REJ: "Regulatory rejection", REG_OTHERSTAGE: "Other regulatory stage", VAL_CONCL: "Validation concluded", VAL_FINAL: "Validation finalised", VAL_ONGO: "Validation ongoing", VAL_STOP: "Validation discontinued", VAL_PEER_FINAL: "Peer review finalised", VAL_PLAN: "Validation planning", SUB_FINAL: "Submission finalised", SUB_STOP: "Submission stopped", SUB_ONGO: "Submission ongoing", REC_NA: "Recommendation not applicable", UNKNOWN_UNKNOWN: "Status unrecorded / unknown"
  };
  const isVerified = record => /expert|researcher|reviewed/i.test(String(record.coreVerification || record.review || ""));
  const displayValue = value => /^(expert-reviewed|expert reviewed)$/i.test(String(value || "").trim()) ? "Researcher verified" : value;
  const sourceText = value => hasValue(value) ? esc(displayValue(value)) : "<span class=\"tm-unavailable\">Not available</span>";
  const notePreview = value => String(value || "").trim().replace(/\s+/g, " ").slice(0, 210) + (String(value || "").trim().length > 210 ? "…" : "");
  const stageIndex = code => {
    const value = String(code || "");
    if (/^SUB/.test(value)) return 0;
    if (value === "VAL_PLAN" || value === "VAL_ONGO" || value === "VAL_STOP" || value === "VAL_FINAL") return 1;
    if (/^VAL_(PEER|CONCL)/.test(value)) return 2;
    if (value === "REG_ADOPT") return 4;
    if (/^REG/.test(value)) return 3;
    return -1;
  };
  const currentCode = record => hasValue(record.evidenceUpdatedStage) && record.evidenceUpdatedStage !== "UNKNOWN_UNKNOWN" ? record.evidenceUpdatedStage : record.code;
  const field = (label, value, icon, tooltip, source) => `<div class=\"tm-key-item\"><dt><span class=\"tm-key-icon\" aria-hidden=\"true\">${icon}</span>${esc(label)}${tooltip ? `<button type=\"button\" class=\"tm-info\" aria-label=\"About ${esc(label)}\" title=\"${esc(tooltip)}\">i</button>` : ""}</dt><dd>${sourceText(value)}${source ? `<small>${esc(source)}</small>` : ""}</dd></div>`;

  const ensureJourneyStyles = () => {
    if (document.getElementById("tm-journey-dynamic-styles")) return;
    const style = document.createElement("style");
    style.id = "tm-journey-dynamic-styles";
    style.textContent = `
      .regulatory-journey-card { background:#fff!important; border:1px solid #dbe6ef!important; border-radius:12px!important; padding:20px 24px 22px!important; width:100%!important; box-sizing:border-box!important; margin-top:0!important; margin-bottom:20px!important; box-shadow:0 2px 8px rgba(10,45,82,0.04)!important; }
      .journey-heading { display:flex!important; align-items:center!important; gap:9px!important; margin-bottom:20px!important; }
      .journey-heading h3 { margin:0!important; color:#123f73!important; font-size:16px!important; font-weight:700!important; }
      .journey-heading-icon { width:26px!important; height:26px!important; border-radius:50%!important; background:#1f5c94!important; color:#fff!important; display:inline-flex!important; align-items:center!important; justify-content:center!important; flex:0 0 26px!important; }
      .journey-path { display:flex!important; flex-direction:row!important; align-items:flex-start!important; justify-content:space-between!important; width:100%!important; box-sizing:border-box!important; padding:2px 4px 0!important; overflow-x:auto!important; }
      .journey-step { flex:0 0 88px!important; width:88px!important; min-width:88px!important; max-width:88px!important; display:flex!important; flex-direction:column!important; align-items:center!important; text-align:center!important; position:relative!important; z-index:2!important; box-sizing:border-box!important; }
      .journey-icon { width:58px!important; height:58px!important; min-width:58px!important; max-width:58px!important; min-height:58px!important; max-height:58px!important; border-radius:50%!important; background:#e8eef4!important; color:#4c6680!important; border:1px solid #d5e0eb!important; display:flex!important; align-items:center!important; justify-content:center!important; box-sizing:border-box!important; transition:all .2s ease!important; }
      .journey-step.completed .journey-icon { background:#e8eef4!important; color:#4c6680!important; border-color:#d5e0eb!important; }
      .journey-step.current .journey-icon { width:62px!important; height:62px!important; min-width:62px!important; max-width:62px!important; min-height:62px!important; max-height:62px!important; background:#fff0d8!important; color:#9b5000!important; border:2px solid #f59e0b!important; box-shadow:0 0 0 5px rgba(245,158,11,0.18)!important; }
      .journey-step.pending .journey-icon { background:#f1f5f9!important; color:#94a3b8!important; border-color:#e2e8f0!important; }
      .journey-label { margin-top:10px!important; font-size:12.5px!important; font-weight:500!important; color:#35516d!important; line-height:1.25!important; text-align:center!important; display:block!important; }
      .journey-step.current .journey-label { color:#123f73!important; font-weight:700!important; }
      .journey-connector { flex:1 1 0!important; height:2px!important; margin-top:29px!important; margin-left:-6px!important; margin-right:-6px!important; position:relative!important; z-index:1!important; background:#b9cee0!important; min-width:24px!important; }
      .journey-connector.active { background:linear-gradient(to right,#b9cee0 0%,#b9cee0 45%,#f59e0b 45%,#f59e0b 100%)!important; }
      .journey-connector.pending { background:#dbe4ec!important; }
      @media (max-width: 760px) {
        .regulatory-journey-card { padding:18px 14px!important; }
        .journey-path { min-width:480px!important; }
      }
    `;
    document.head.appendChild(style);
  };

  const journey = record => {
    ensureJourneyStyles();
    const code = currentCode(record), active = stageIndex(code);
    const stages = [
      {
        label: "Submission",
        icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:block;width:26px!important;height:26px!important;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>'
      },
      {
        label: "Validation",
        icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:block;width:26px!important;height:26px!important;"><path d="M9 2h6M10 2v6l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V2M7.5 16h9"/></svg>'
      },
      {
        label: "Peer review",
        icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:block;width:26px!important;height:26px!important;"><circle cx="9" cy="8" r="3"/><path d="M3 18c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M15 14.5c2 0 4.5 1.2 5 3.5"/></svg>'
      },
      {
        label: "Regulatory<br>assessment",
        icon: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:block;width:28px!important;height:28px!important;"><path d="M3 9h18L12 3 3 9zm2 2v7m4-7v7m6-7v7m4-7v7M3 21h18M2 18h20"/></svg>'
      },
      {
        label: "Adoption",
        icon: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:block;width:26px!important;height:26px!important;"><polyline points="20 6 9 17 4 12"/></svg>'
      }
    ];

    if (active < 0) {
      return `<section class="regulatory-journey-card" style="background:#fff!important;border:1px solid #dbe6ef!important;border-radius:12px!important;padding:20px 24px 22px!important;width:100%!important;box-sizing:border-box!important;margin-top:20px!important;"><div class="journey-heading" style="display:flex!important;align-items:center!important;gap:9px!important;margin-bottom:16px!important;"><div class="journey-heading-icon" aria-hidden="true" style="width:26px!important;height:26px!important;border-radius:50%!important;background:#1f5c94!important;color:#fff!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 26px!important;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg></div><h3 style="margin:0!important;color:#123f73!important;font-size:16px!important;font-weight:700!important;">Regulatory journey</h3></div><p class="tm-uncertainty" style="margin:0!important;padding:10px 14px!important;border-left:3px solid #89accd!important;background:#f5f9fc!important;color:#5e748a!important;font-size:11.5px!important;line-height:1.45!important;border-radius:4px!important;">No unambiguous lifecycle code is available for this record. The pathway is therefore not inferred.</p></section>`;
    }

    const path = stages.map((stage, index) => {
      const isPast = index < active;
      const isCurrent = index === active;
      const stepClass = isPast ? "completed" : isCurrent ? "current" : "pending";

      let iconStyle = "";
      if (isCurrent) {
        iconStyle = "width:62px!important;height:62px!important;min-width:62px!important;max-width:62px!important;min-height:62px!important;max-height:62px!important;border-radius:50%!important;background:#fff0d8!important;color:#9b5000!important;border:2px solid #f59e0b!important;box-shadow:0 0 0 5px rgba(245,158,11,0.18)!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;transition:all .2s ease!important;";
      } else if (isPast) {
        iconStyle = "width:58px!important;height:58px!important;min-width:58px!important;max-width:58px!important;min-height:58px!important;max-height:58px!important;border-radius:50%!important;background:#e8eef4!important;color:#4c6680!important;border:1px solid #d5e0eb!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;transition:all .2s ease!important;";
      } else {
        iconStyle = "width:58px!important;height:58px!important;min-width:58px!important;max-width:58px!important;min-height:58px!important;max-height:58px!important;border-radius:50%!important;background:#f1f5f9!important;color:#94a3b8!important;border:1px solid #e2e8f0!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;transition:all .2s ease!important;";
      }

      const labelStyle = `margin-top:10px!important;font-size:12.5px!important;font-weight:${isCurrent ? '700' : '500'}!important;color:${isCurrent ? '#123f73' : isPast ? '#35516d' : '#64748b'}!important;line-height:1.25!important;text-align:center!important;display:block!important;`;

      const step = `<div class="journey-step ${stepClass}" style="flex:0 0 88px!important;width:88px!important;min-width:88px!important;max-width:88px!important;display:flex!important;flex-direction:column!important;align-items:center!important;text-align:center!important;position:relative!important;z-index:2!important;box-sizing:border-box!important;"><div class="journey-icon" style="${iconStyle}">${stage.icon}</div><span class="journey-label" style="${labelStyle}">${stage.label}</span></div>`;

      let connector = "";
      if (index < stages.length - 1) {
        const isConnActive = index === active - 1;
        const isConnPast = index < active - 1;
        const connClass = isConnActive ? "active" : isConnPast ? "completed" : "pending";
        const connBg = isConnActive
          ? "linear-gradient(to right, #b9cee0 0%, #b9cee0 45%, #f59e0b 45%, #f59e0b 100%)"
          : isConnPast ? "#b9cee0" : "#dbe4ec";
        const arrowColor = isConnActive ? "#f59e0b" : isConnPast ? "#8fa8c0" : "#a8bccc";

        connector = `<div class="journey-connector ${connClass}" aria-hidden="true" style="flex:1 1 0!important;height:2px!important;margin-top:29px!important;margin-left:-6px!important;margin-right:-6px!important;position:relative!important;z-index:1!important;background:${connBg}!important;min-width:24px!important;"><svg viewBox="0 0 8 10" width="8" height="10" style="position:absolute!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;overflow:visible!important;display:block!important;"><polygon points="0,1 6,5 0,9" fill="${arrowColor}"/></svg></div>`;
      }

      return step + connector;
    }).join("");

    return `<section class="regulatory-journey-card" aria-label="Regulatory journey" style="background:#fff!important;border:1px solid #dbe6ef!important;border-radius:12px!important;padding:20px 24px 22px!important;width:100%!important;box-sizing:border-box!important;margin-top:0!important;margin-bottom:20px!important;box-shadow:0 2px 8px rgba(10,45,82,0.04)!important;"><div class="journey-heading" style="display:flex!important;align-items:center!important;gap:9px!important;margin-bottom:20px!important;"><div class="journey-heading-icon" aria-hidden="true" style="width:26px!important;height:26px!important;border-radius:50%!important;background:#1f5c94!important;color:#fff!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 26px!important;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg></div><h3 style="margin:0!important;color:#123f73!important;font-size:16px!important;font-weight:700!important;">Regulatory journey</h3></div><div class="journey-path" style="display:flex!important;flex-direction:row!important;align-items:flex-start!important;justify-content:space-between!important;width:100%!important;box-sizing:border-box!important;padding:2px 4px 0!important;overflow-x:auto!important;">${path}</div></section>`;
  };

  const bottlenecks = record => {
    const items = String(record.bottlenecks || "").split(";").map(x => x.trim()).filter(x => x && x !== "No coded bottleneck signal");
    return `<section class="tm-verification-card tm-bottlenecks"><div class="tm-section-heading"><div><span class="tm-kicker">Research classification</span><h3>Bottleneck signals <button type="button" class="tm-info" title="Coded research signals. They identify documented themes, not proven causes of an outcome.">i</button></h3></div><span class="tm-count">${items.length}</span></div>${items.length ? `<div class="tm-bottleneck-list">${items.map(item => `<div><span aria-hidden="true">!</span><strong>${esc(item)}</strong></div>`).join("")}</div><p>Method-level evidence notes are available in the audit trail.</p>` : `<p class="tm-empty">No bottleneck signals identified.</p>`}</section>`;
  };

  const reportDraft = (method) => {
    if (!method) return;
    const subject = `Report concerning ${method.shortName || method.title} (${method.id})`;
    const body = `Hello,\n\nI would like to report an issue or suggestion concerning the following TSAR method:\n\nMethod: ${method.shortName || method.title}\nTM ID: ${method.id}\n\nIssue or correction:\n\n\nSource or supporting link (optional):\n\n\nBest regards,`;
    const report = document.createElement("div");
    report.className = "modal-backdrop report-backdrop";
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

    const getDossierMarkup = (record, options = {}) => {
    if (!record) return "";
    ensureJourneyStyles();
    const verified = isVerified(record);
    const appDomain = record.applicationDomainExpert || record.applicationDomain;
    const lastSourceUpdate = record.lastUpdateDate || record.lastUpdate;

    const isStandalone = !!options.isStandalone;
    const containerTag = "article";
    const containerClass = "tm-detail-modal tm-standalone-dossier";

    const rawFieldsList = [
      "id", "shortName", "title", "yearReceived", "organisation",
      "description", "topic", "stepStage", "generalComments",
      "protocolSop", "lastUpdate", "lifecycleVerifiedAgainstTSAR"
    ];
    const rawFields = new Set(rawFieldsList);

    const formatKey = k => {
      const overrides = {
        lifecycleVerifiedAgainstTSAR: "Corrected against live TSAR",
        protocolSop: "Protocol / SOP",
        threeR: "3R category",
        coreVerification: "Core verification",
        caseStudyVerification: "Case-study classification",
        evidenceUpdatedStage: "Evidence-updated stage",
        verificationNote: "Researcher verification note",
        generalComments: "General comments for public access"
      };
      return overrides[k] || k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, str => str.toUpperCase());
    };

    const formatValue = (k, v) => {
      if (k === "lifecycleVerifiedAgainstTSAR") return String(v) === "1" ? "Yes" : "No";
      if (k === "protocolSop" && String(v).startsWith("http")) return `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>`;
      return String(v);
    };

    const rawDataMarkup = rawFieldsList
      .map(k => {
        const v = record[k];
        const isEmpty = (v === undefined || v === null || String(v).trim() === "");
        const displayVal = isEmpty ? `<span class="tm-unavailable">Not available in source</span>` : (k === 'protocolSop' ? formatValue(k, v) : esc(formatValue(k, v)));
        return `<article style="background:#fff;"><span>${esc(formatKey(k))}</span><p style="word-break: break-word; font-size: 11px;">${displayVal}</p></article>`;
      })
      .join("");

    const derivedDataMarkup = Object.entries(record)
      .filter(([k, v]) => !rawFields.has(k) && v !== undefined && v !== null && String(v).trim() !== "")
      .map(([k, v]) => `<article style="background:#fff; ${k === 'verificationNote' ? 'grid-column: 1 / -1; background: #fdfaf8;' : ''}"><span>${esc(formatKey(k))}</span><p style="word-break: break-word; font-size: 11px;">${esc(formatValue(k, v))}</p></article>`)
      .join("");

    return `<${containerTag} class="${containerClass}" role="${isStandalone ? 'region' : 'dialog'}" ${isStandalone ? '' : 'aria-modal="true"'} aria-labelledby="tm-detail-title">
  <header class="tm-detail-header">
    <div>
      <span class="tm-id">${esc(record.id)}</span>
      <h2 id="tm-detail-title">${esc(record.title || record.shortName)}</h2>
      ${hasValue(record.shortName) ? `<p class="tm-detail-subtitle">${esc(record.shortName)}</p>` : ""}
    </div>
    <div class="tm-header-actions">
      <div class="tm-badges">
        <span class="tm-badge tm-source-badge">TSAR source record</span>
        ${verified ? '<span class="tm-badge tm-verified-badge">Researcher verified</span>' : ""}
      </div>
    </div>
  </header>
  <div class="record-body tm-detail-body">
    ${journey(record)}
    <section class="tm-key-panel">
      <div class="tm-section-heading">
        <div><span class="tm-kicker">At a glance</span><h3>Key information</h3></div>
        <span class="tm-provenance-label">Source + research classifications</span>
      </div>
      <dl class="tm-key-grid">
        ${field("Regulatory stage", record.stage, "◉", "Broad position in the regulatory pathway, derived from the TSAR workflow.", "Research classification")}
        ${field("Application domain", appDomain, "◌", "Area in which the method is intended to be used.", record.applicationDomainExpert ? "Researcher classification" : "TSAR source")}
        ${field("Lifecycle stage", record.code, "↗", "Coded lifecycle stage. The code is retained because it is used in the research dataset.", "TSAR snapshot")}
        ${field("Endpoint category", record.endpoint, "⌁", "Toxicological endpoint classification used for analysis.", "Research classification")}
        ${field("Acceptance status", record.status, "✓", "Derived regulatory outcome category, not a scientific-quality score.", "Research classification")}
        ${field("Core methodology", record.methodology, "⚗", "Method family classification used for analysis.", "Research classification")}
      </dl>
    </section>
    <div class="tm-signal-grid">
      <section class="tm-verification-card tm-verification">
        <div class="tm-section-heading">
          <div><span class="tm-kicker">Research provenance</span><h3>Research verification <button type="button" class="tm-info" title="A procedural review label. It is not a measure of scientific quality.">i</button></h3></div>
          <span class="tm-status-mark" aria-label="${verified ? "Verified" : "Not verified"}">${verified ? "✓" : "—"}</span>
        </div>
        <dl>
          <div><dt>Verification status</dt><dd>${sourceText(verified ? "Verified" : record.coreVerification)}</dd></div>
          <div><dt>Review level</dt><dd>${sourceText(record.coreVerification || record.review)}</dd></div>
          <div><dt>Lifecycle verification</dt><dd>${sourceText(record.lifecycleVerification)}</dd></div>
          ${hasValue(lastSourceUpdate) ? `<div><dt>TSAR record updated</dt><dd>${sourceText(lastSourceUpdate)}</dd></div>` : ""}
        </dl>
        <p>Research verification date is not available in the published website dataset.</p>
      </section>
      ${bottlenecks(record)}
    </div>

    <details class="tm-disclosure" open>
      <summary><span><b>TSAR source data</b><small>Complete raw record fields</small></span><span aria-hidden="true">⌄</span></summary>
      <div class="tm-additional-grid" style="padding:15px; background:#f4f7f9; border-radius:0 0 9px 9px; border-top:1px solid #e2eaf0;">
        ${rawDataMarkup}
      </div>
    </details>

    <details class="tm-disclosure">
      <summary><span><b>Researcher annotations &amp; classifications</b><small>Verified variables and classifications</small></span><span aria-hidden="true">⌄</span></summary>
      <div class="tm-additional-grid" style="padding:15px; background:#fdfbfa; border-radius:0 0 9px 9px; border-top:1px solid #f0e6e2;">
        ${derivedDataMarkup}
      </div>
    </details>

    <div class="record-actions tm-detail-actions">
      <a href="https://tsar.jrc.ec.europa.eu/test-method/${encodeURIComponent(String(record.id).toLowerCase())}" class="btn btn-outline-primary" target="_blank" rel="noopener">View on TSAR website ↗</a>
      <button class="btn btn-outline-primary" type="button" data-report-method>Report this method</button>
    </div>
  </div>
</${containerTag}>`;
  };

  const renderStandalonePage = (container, record) => {
    if (!container || !record) return;
    container.innerHTML = getDossierMarkup(record, { isStandalone: true });
    const reportBtn = container.querySelector("[data-report-method]");
    if (reportBtn) {
      reportBtn.addEventListener("click", () => reportDraft(record));
    }
  };

  const open = (record) => {
    const id = typeof record === "string" ? record : record?.id;
    if (!id) return;
    const isExploreDir = window.location.pathname.includes("/explore/") || window.location.pathname.endsWith("/explore");
    const targetUrl = (isExploreDir ? "" : "../explore/") + "method-detail.html?id=" + encodeURIComponent(id);
    window.location.href = targetUrl;
  };

  window.NAM_TM_DETAIL = {
    open,
    lifecycleLabels,
    notePreview,
    getDossierMarkup,
    renderStandalonePage,
    reportDraft,
    journey,
    bottlenecks
  };
})();
