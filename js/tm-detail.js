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
  // Use the evidence-updated stage only when it is a real stage code; "No external update recorded" falls back to the TSAR snapshot code.
  const currentCode = record => /^[A-Z]+_[A-Z_]+$/.test(String(record.evidenceUpdatedStage || "")) && record.evidenceUpdatedStage !== "UNKNOWN_UNKNOWN" ? record.evidenceUpdatedStage : record.code;
  const isStoppedCode = code => /_STOP$|^SUB_NOTVAL$|_REJ$/.test(String(code || ""));
  const stopIcon = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" style="display:block;width:26px!important;height:26px!important;"><path d="M6 6l12 12M18 6 6 18"/></svg>';
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
      .journey-path { display:flex!important; flex-direction:row!important; align-items:flex-start!important; justify-content:space-between!important; width:100%!important; box-sizing:border-box!important; padding:10px 10px 6px!important; overflow-x:auto!important; }
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
    const code = currentCode(record), active = stageIndex(code), stopped = isStoppedCode(code);
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
      if (isCurrent && stopped) {
        iconStyle = "width:62px!important;height:62px!important;min-width:62px!important;max-width:62px!important;min-height:62px!important;max-height:62px!important;border-radius:50%!important;background:#fdeceb!important;color:#b42318!important;border:2px solid #dc4b43!important;box-shadow:0 0 0 5px rgba(220,75,67,0.16)!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;transition:all .2s ease!important;";
      } else if (isCurrent) {
        iconStyle = "width:62px!important;height:62px!important;min-width:62px!important;max-width:62px!important;min-height:62px!important;max-height:62px!important;border-radius:50%!important;background:#fff0d8!important;color:#9b5000!important;border:2px solid #f59e0b!important;box-shadow:0 0 0 5px rgba(245,158,11,0.18)!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;transition:all .2s ease!important;";
      } else if (isPast) {
        iconStyle = "width:58px!important;height:58px!important;min-width:58px!important;max-width:58px!important;min-height:58px!important;max-height:58px!important;border-radius:50%!important;background:#e8eef4!important;color:#4c6680!important;border:1px solid #d5e0eb!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;transition:all .2s ease!important;";
      } else {
        iconStyle = "width:58px!important;height:58px!important;min-width:58px!important;max-width:58px!important;min-height:58px!important;max-height:58px!important;border-radius:50%!important;background:#f1f5f9!important;color:#94a3b8!important;border:1px solid #e2e8f0!important;display:flex!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;transition:all .2s ease!important;";
      }

      const labelStyle = `margin-top:10px!important;font-size:12.5px!important;font-weight:${isCurrent ? '700' : '500'}!important;color:${isCurrent ? '#123f73' : isPast ? '#35516d' : '#64748b'}!important;line-height:1.25!important;text-align:center!important;display:block!important;`;

      const step = `<div class="journey-step ${stepClass}" style="flex:0 0 88px!important;width:88px!important;min-width:88px!important;max-width:88px!important;display:flex!important;flex-direction:column!important;align-items:center!important;text-align:center!important;position:relative!important;z-index:2!important;box-sizing:border-box!important;"><div class="journey-icon" style="${iconStyle}" ${isCurrent && stopped ? 'aria-label="Stopped at this stage"' : ""}>${isCurrent && stopped ? stopIcon : stage.icon}</div><span class="journey-label" style="${labelStyle}">${stage.label}${isCurrent && stopped ? '<small style="display:block!important;margin-top:3px!important;color:#b42318!important;font-size:10.5px!important;font-weight:700!important;">Stopped here</small>' : ""}</span></div>`;

      let connector = "";
      if (index < stages.length - 1) {
        const isConnActive = index === active - 1;
        const isConnPast = index < active - 1;
        const connClass = isConnActive ? "active" : isConnPast ? "completed" : "pending";
        const connBg = isConnActive
          ? (stopped ? "linear-gradient(to right, #b9cee0 0%, #b9cee0 45%, #dc4b43 45%, #dc4b43 100%)" : "linear-gradient(to right, #b9cee0 0%, #b9cee0 45%, #f59e0b 45%, #f59e0b 100%)")
          : isConnPast ? "#b9cee0" : "#dbe4ec";
        const arrowColor = isConnActive ? (stopped ? "#dc4b43" : "#f59e0b") : isConnPast ? "#8fa8c0" : "#a8bccc";

        connector = `<div class="journey-connector ${connClass}" aria-hidden="true" style="flex:1 1 0!important;height:2px!important;margin-top:29px!important;margin-left:-6px!important;margin-right:-6px!important;position:relative!important;z-index:1!important;background:${connBg}!important;min-width:24px!important;"><svg viewBox="0 0 8 10" width="8" height="10" style="position:absolute!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;overflow:visible!important;display:block!important;"><polygon points="0,1 6,5 0,9" fill="${arrowColor}"/></svg></div>`;
      }

      return step + connector;
    }).join("");

    return `<section class="regulatory-journey-card" aria-label="Regulatory journey" style="background:#fff!important;border:1px solid #dbe6ef!important;border-radius:12px!important;padding:20px 24px 22px!important;width:100%!important;box-sizing:border-box!important;margin-top:0!important;margin-bottom:20px!important;box-shadow:0 2px 8px rgba(10,45,82,0.04)!important;"><div class="journey-heading" style="display:flex!important;align-items:center!important;gap:9px!important;margin-bottom:20px!important;"><div class="journey-heading-icon" aria-hidden="true" style="width:26px!important;height:26px!important;border-radius:50%!important;background:#1f5c94!important;color:#fff!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 26px!important;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg></div><h3 style="margin:0!important;color:#123f73!important;font-size:16px!important;font-weight:700!important;">Regulatory journey</h3></div><div class="journey-path" style="display:flex!important;flex-direction:row!important;align-items:flex-start!important;justify-content:space-between!important;width:100%!important;box-sizing:border-box!important;padding:10px 10px 6px!important;overflow-x:auto!important;overflow-y:visible!important;">${path}</div></section>`;
  };

  const bottlenecks = record => {
    const items = String(record.bottlenecks || "").split(";").map(x => x.trim()).filter(x => x && x !== "No coded bottleneck signal");
    ensureGlanceStyles();
    return `<section class="tm-glance-card tm-glance-bottlenecks"><div class="tm-glance-head"><div><span class="tm-glance-kicker">Research classification</span><h3>Bottleneck signals <button type="button" class="tm-info" title="Coded research signals. They identify documented themes, not proven causes of an outcome.">i</button></h3></div><span class="tm-glance-count" aria-label="${items.length} bottleneck signals">${items.length}</span></div>${items.length ? `<ul class="tm-glance-bottleneck-list">${items.map(item => `<li><span aria-hidden="true">!</span>${esc(item)}</li>`).join("")}</ul>` : `<p class="tm-glance-empty">No bottleneck signals were coded for this method.</p>`}<p class="tm-glance-note">${glanceIcons.info}Method-level evidence notes are available in the audit trail.</p></section>`;
  };

  /* ---------- "At a glance" design (28 September 2026) ---------- */
  const svg = (paths, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const glanceIcons = {
    stage: svg('<path d="M3 9h18L12 3 3 9z"/><path d="M5 11v7M9 11v7M15 11v7M19 11v7M3 21h18"/>'),
    domain: svg('<path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7z"/><path d="m8.5 8.5 7 7"/>'),
    lifecycle: svg('<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>'),
    endpoint: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
    acceptance: svg('<polyline points="20 6 9 17 4 12"/>'),
    methodology: svg('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 15h9"/>'),
    check: svg('<polyline points="20 6 9 17 4 12"/>', 22),
    clock: svg('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>', 22),
    stop: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>', 22),
    unknown: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17h.01"/>', 22),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', 14),
    progression: svg('<path d="M4 17h6l4-10h6"/><polyline points="17 4 20 7 17 10"/>'),
    externalStage: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
    external: svg('<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>', 14)
  };
  const statusProfiles = {
    "Adopted": { tone: "positive", icon: "check", text: "This method has been adopted and is used in regulatory assessment for the specified application domain and endpoint." },
    "Finalised": { tone: "positive", icon: "check", text: "The latest recorded step for this method has been finalised. It is not recorded as adopted in the research dataset." },
    "Acceptance pending": { tone: "pending", icon: "clock", text: "The method has reached regulatory assessment and a decision on acceptance is still pending." },
    "Ongoing": { tone: "pending", icon: "clock", text: "The method is still progressing through the TSAR process." },
    "Discontinued": { tone: "negative", icon: "stop", text: "Work on this method was stopped before regulatory adoption." },
    "Rejected": { tone: "negative", icon: "stop", text: "The method was assessed but not accepted for regulatory use." }
  };
  const glanceRow = (label, value, icon, tooltip, extra = "") => `<div class="tm-glance-row"><span class="tm-glance-icon">${glanceIcons[icon]}</span><div><dt>${esc(label)}${tooltip ? `<button type="button" class="tm-info" aria-label="About ${esc(label)}" title="${esc(tooltip)}">i</button>` : ""}</dt><dd>${sourceText(value)}${extra}</dd></div></div>`;
  const keyPanel = record => {
    ensureGlanceStyles();
    const appDomain = record.applicationDomainExpert || record.applicationDomain;
    const profile = statusProfiles[record.status] || { tone: "neutral", icon: "unknown", text: "No regulatory outcome is recorded for this method in the research dataset." };
    const tsarUrl = `https://tsar.jrc.ec.europa.eu/test-method/${encodeURIComponent(String(record.id).toLowerCase())}`;
    const codeName = lifecycleLabels[record.code];
    return `<section class="tm-glance-panel" aria-labelledby="tm-glance-title">
      <div class="tm-glance-head">
        <div><span class="tm-glance-kicker">At a glance</span><h3 id="tm-glance-title">Key information</h3></div>
        <a class="tm-glance-source" href="${tsarUrl}" target="_blank" rel="noopener" title="Open the original TSAR record">Source + research classifications ${glanceIcons.external}</a>
      </div>
      <div class="tm-glance-body">
        <div class="tm-glance-status">
          <div class="tm-glance-status-badge tone-${profile.tone}"><span class="tm-glance-status-icon">${glanceIcons[profile.icon]}</span><div><span>Current status</span><strong>${sourceText(record.status)}</strong></div></div>
          <p>${esc(profile.text)} <small>Derived research category, not a measure of scientific quality.</small></p>
        </div>
        <dl class="tm-glance-grid">
          ${glanceRow("Regulatory stage", record.stage, "stage", "Broad position in the regulatory pathway, derived from the TSAR workflow.")}
          ${glanceRow("Application domain", appDomain, "domain", "Area in which the method is intended to be used.")}
          ${glanceRow("Lifecycle stage", record.code, "lifecycle", "Coded lifecycle stage from the TSAR snapshot. The code is kept because the research dataset uses it.", codeName ? `<small>${esc(codeName)}</small>` : "")}
          ${glanceRow("Endpoint category", record.endpoint, "endpoint", "Toxicological endpoint classification used for analysis.")}
          ${glanceRow("Acceptance status", record.status, "acceptance", "Derived regulatory outcome category, not a scientific-quality score.")}
          ${glanceRow("Core methodology", record.methodology, "methodology", "Method family classification used for analysis.")}
          ${glanceRow("External step/stage", hasValue(record.evidenceUpdatedStage) && /^[A-Z]+_[A-Z_]+$/.test(record.evidenceUpdatedStage) ? record.evidenceUpdatedStage : "No external update recorded", "externalStage", "Evidence-updated lifecycle stage: the furthest stage supported by authoritative evidence found during verification, independent of the TSAR snapshot.", lifecycleLabels[record.evidenceUpdatedStage] ? `<small>${esc(lifecycleLabels[record.evidenceUpdatedStage])}</small>` : "")}
          ${glanceRow("Progression beyond TSAR", record.progressionBeyondTsar, "progression", "Compares the external step/stage with the TSAR snapshot stage (NEW_STEP_STAGE): a later stage means the method progressed beyond what TSAR records.")}
        </dl>
      </div>
    </section>`;
  };
  const verificationCard = record => {
    ensureGlanceStyles();
    const verified = isVerified(record);
    const lastSourceUpdate = record.lastUpdateDate || record.lastUpdate;
    const cell = (label, value) => `<div><dt>${esc(label)}</dt><dd>${sourceText(value)}</dd></div>`;
    return `<section class="tm-glance-card tm-glance-verification">
      <div class="tm-glance-head">
        <div><span class="tm-glance-kicker">Research provenance</span><h3>Research verification <button type="button" class="tm-info" title="A procedural review label. It is not a measure of scientific quality.">i</button></h3></div>
        <span class="tm-glance-mark ${verified ? "" : "is-off"}" aria-label="${verified ? "Verified" : "Not verified"}">${verified ? glanceIcons.check : "—"}</span>
      </div>
      <dl class="tm-glance-cells">
        ${cell("Verification status", verified ? "Verified" : record.coreVerification)}
        ${cell("Review level", record.coreVerification || record.review)}
        ${cell("Lifecycle verification", record.lifecycleVerification)}
        ${hasValue(lastSourceUpdate) ? cell("TSAR record updated", lastSourceUpdate) : ""}
        ${hasValue(record.caseStudy) ? `<div class="tm-glance-wide"><dt>Case-study sample</dt><dd>${esc(record.caseStudy)}</dd></div>` : ""}
      </dl>
      <p class="tm-glance-note">${glanceIcons.info}Research verification date is not available in the published website dataset.</p>
    </section>`;
  };
  // Full-width box with the researcher’s written explanation of the coded bottleneck signals.
  const bottleneckExplained = record => {
    ensureGlanceStyles();
    const text = String((window.NAM_BOTTLENECK_EXPLANATIONS || {})[record.id] || "").trim();
    const signals = String(record.bottlenecks || "").split(";").map(x => x.trim()).filter(x => x && x !== "No coded bottleneck signal");
    const none = !text || /^no documented bottleneck/i.test(text);
    return `<details class="tm-disclosure tm-explained-disclosure">
      <summary><span><b>Bottlenecks explained</b><small>${none ? "No documented bottleneck identified" : `Researcher explanation of ${signals.length} coded bottleneck signal${signals.length === 1 ? "" : "s"}`}</small></span><span aria-hidden="true">⌄</span></summary>
      <div class="tm-glance-explained${none ? " is-empty" : ""}">
        ${signals.length ? `<ul class="tm-glance-chips" aria-label="Coded bottleneck signals">${signals.map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}
        <p class="tm-glance-explained-text">${text ? esc(text) : "No explanation is recorded for this method."}</p>
        <p class="tm-glance-note">${glanceIcons.info}Describes reported limitations, not proven causes of the regulatory outcome. Source: Bottlenecks_explained in the TSAR master verification workbook (25 September 2026 release).</p>
      </div>
    </details>`;
  };
  const ensureGlanceStyles = () => {
    if (document.getElementById("tm-glance-styles")) return;
    const style = document.createElement("style");
    style.id = "tm-glance-styles";
    style.textContent = `
      .record-body .tm-glance-panel{margin:0 0 16px;padding:20px 20px 18px;border:1px solid #cfe3f1;border-radius:14px;background:#eef6fc}
      .record-body .tm-glance-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}
      .record-body .tm-glance-kicker{display:block;color:#087f90;font-size:10.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}
      .record-body .tm-glance-head h3{display:flex;align-items:center;gap:6px;margin:3px 0 0;color:#0f2f57;font-size:21px;font-weight:800;letter-spacing:-.01em}
      .record-body .tm-glance-source{display:inline-flex;align-items:center;gap:6px;margin-top:4px;color:#1d5d95;font-size:11.5px;font-weight:600;text-decoration:none;white-space:nowrap}
      .record-body .tm-glance-source:hover{text-decoration:underline}
      .record-body .tm-glance-body{padding:16px 18px 6px;border:1px solid #d9e7f2;border-radius:10px;background:#fff}
      .record-body .tm-glance-status{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:22px;padding:0 0 16px;border-bottom:1px solid #e3edf5}
      .record-body .tm-glance-status-badge{display:flex;align-items:center;gap:14px;min-width:230px;padding:14px 22px 14px 16px;border-radius:9px}
      .record-body .tm-glance-status-badge span:not(.tm-glance-status-icon){display:block;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;opacity:.8}
      .record-body .tm-glance-status-badge strong{display:block;margin-top:2px;font-size:22px;font-weight:800;line-height:1.1}
      .record-body .tm-glance-status-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;color:#fff;flex:none}
      .record-body .tone-positive{background:#e3f4ea;color:#14532d}.record-body .tone-positive .tm-glance-status-icon{background:#4fae7b}
      .record-body .tone-pending{background:#fff4dc;color:#7a4b00}.record-body .tone-pending .tm-glance-status-icon{background:#e6a33a}
      .record-body .tone-negative{background:#fbe9e7;color:#7f1d1d}.record-body .tone-negative .tm-glance-status-icon{background:#d0605e}
      .record-body .tone-neutral{background:#eef1f5;color:#334155}.record-body .tone-neutral .tm-glance-status-icon{background:#8595a8}
      .record-body .tm-glance-status p{margin:0;padding-left:22px;border-left:1px solid #e3edf5;color:#475569;font-size:13px;line-height:1.55}
      .record-body .tm-glance-status p small{display:block;margin-top:4px;color:#8595a8;font-size:10.5px}
      .record-body .tm-glance-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;margin:0}
      .record-body .tm-glance-row{display:flex;align-items:center;gap:14px;padding:14px 16px 14px 4px;border:0;border-bottom:1px solid #e3edf5;border-radius:0;background:none}
      .record-body .tm-glance-grid .tm-glance-row:nth-child(odd){border-right:1px solid #e3edf5}
      .record-body .tm-glance-grid .tm-glance-row:nth-child(even){padding-left:20px}
      .record-body .tm-glance-grid .tm-glance-row:nth-last-child(-n+2){border-bottom:0}
      .record-body .tm-glance-icon{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:50%;background:#eaf3fb;color:#1d4f86}
      .record-body .tm-glance-row dt{display:flex;align-items:center;gap:6px;margin:0 0 3px;color:#5f7487;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
      .record-body .tm-glance-row dd{margin:0;color:#0f2f57;font-size:14px;font-weight:700;line-height:1.35}
      .record-body .tm-glance-row dd small{display:block;margin-top:2px;color:#71859a;font-size:10.5px;font-weight:500}
      .record-body .tm-glance-card{padding:18px 18px 14px;border-radius:12px}
      .record-body .tm-glance-card .tm-glance-head h3{font-size:19px}
      .record-body .tm-glance-verification{border:1px solid #cfe7d8;background:#effaf3}
      .record-body .tm-glance-verification .tm-glance-kicker{color:#0b7a5a}
      .record-body .tm-glance-mark{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:#d3efdd;color:#1f7a4c;flex:none}
      .record-body .tm-glance-mark.is-off{background:#eef1f5;color:#8595a8;font-weight:800}
      .record-body .tm-glance-cells{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0}
      .record-body .tm-glance-cells>div{padding:10px 12px;border:1px solid #d6eadf;border-radius:7px;background:#fff}
      .record-body .tm-glance-cells>.tm-glance-wide{grid-column:1 / -1}
      .record-body .tm-glance-cells dt{margin:0 0 3px;color:#5f7a6d;font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
      .record-body .tm-glance-cells dd{margin:0;color:#173f2c;font-size:12.5px;font-weight:700;line-height:1.35}
      .record-body .tm-glance-bottlenecks{border:1px solid #f1d2d4;background:#fdf1f1}
      .record-body .tm-glance-bottlenecks .tm-glance-kicker{color:#a1343f}
      .record-body .tm-glance-count{display:grid;place-items:center;min-width:36px;height:36px;padding:0 8px;border-radius:999px;background:#f8d7da;color:#a1343f;font-size:17px;font-weight:800;flex:none}
      .record-body .tm-glance-bottleneck-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}
      .record-body .tm-glance-bottleneck-list li{display:flex;align-items:center;gap:12px;padding:9px 12px;border:1px solid #f0d3d6;border-radius:7px;background:#fff;color:#6b2d36;font-size:12.5px;font-weight:700}
      .record-body .tm-glance-bottleneck-list li span{display:grid;place-items:center;flex:none;width:22px;height:22px;border-radius:5px;background:#fbe3e5;color:#c0303f;font-size:13px;font-weight:900}
      .record-body .tm-glance-empty{margin:0;padding:10px 12px;border:1px dashed #f0d3d6;border-radius:7px;background:#fff;color:#7a5a60;font-size:12px}
      .record-body .tm-glance-note{display:flex;align-items:center;gap:7px;margin:12px 0 0;color:#667a73;font-size:10.5px}
      .record-body .tm-glance-note svg{flex:none}
      .record-body .tm-glance-explained{padding:15px;border-top:1px solid #f0e2e4;border-radius:0 0 9px 9px;background:#fffafa}
      .record-body .tm-glance-explained .tm-glance-kicker{color:#a1343f}
      .record-body .tm-glance-explained.is-empty{border-top-color:#e2eaf0;background:#f8fafc}
      .record-body .tm-glance-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px;padding:0;list-style:none}
      .record-body .tm-glance-chips li{padding:4px 10px;border:1px solid #f0d3d6;border-radius:999px;background:#fdf1f1;color:#7a2e38;font-size:11px;font-weight:700}
      .record-body .tm-glance-explained-text{max-width:none;margin:0;padding:12px 16px;text-align:left;white-space:normal;border-left:3px solid #e8a3aa;border-radius:0 8px 8px 0;background:#fdf7f7;color:#334155;font-size:13.5px;line-height:1.65}
      .record-body .tm-glance-explained.is-empty .tm-glance-explained-text{border-left-color:#c7d7e6;background:#f1f5f9;color:#52677c}
      .tm-signal-grid{align-items:stretch}
      /* Compact layout for the standalone method page (less empty space, consistent left edges). */
      .method-dossier-mount .tm-standalone-dossier{margin-bottom:18px}
      .method-dossier-mount .tm-standalone-dossier .tm-detail-header{padding:16px 22px}
      .method-dossier-mount .tm-standalone-dossier .tm-detail-body{padding:16px 22px 20px}
      .method-dossier-mount .regulatory-journey-card{margin-bottom:14px!important}
      .record-body .tm-glance-panel{margin-bottom:14px;padding:16px 16px 14px}
      .record-body .tm-glance-panel .tm-glance-head{margin-bottom:10px}
      .record-body .tm-glance-body{padding:12px 16px 2px}
      .record-body .tm-glance-status{gap:18px;padding-bottom:12px}
      .record-body .tm-glance-status-badge{padding:10px 18px 10px 12px}
      .record-body .tm-glance-status-badge strong{font-size:20px}
      .record-body .tm-glance-status p{padding-left:18px}
      .record-body .tm-glance-grid .tm-glance-row{padding-top:10px;padding-bottom:10px}
      .record-body .tm-glance-icon{width:36px;height:36px}
      .method-dossier-mount .tm-signal-grid{gap:12px;margin-bottom:14px}
      .record-body .tm-glance-card{padding:14px 16px 12px}
      .record-body .tm-glance-card .tm-glance-head{margin-bottom:10px}
      .record-body .tm-glance-note{margin-top:10px}
      .method-dossier-mount .tm-disclosure{margin-top:10px}
      .method-dossier-mount .tm-disclosure summary{padding:12px 16px}
      .method-dossier-mount .tm-disclosure .tm-glance-explained{padding:14px 16px}
      .method-dossier-mount .tm-disclosure .tm-glance-explained p{white-space:normal}
      .method-dossier-mount .tm-detail-actions{margin-top:14px;padding-top:12px}
      .method-dossier-mount .tm-detail-header.tm-page-head{display:block;padding:14px 22px 16px}
      .method-dossier-mount .tm-head-top{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}
      .method-dossier-mount .tm-head-top .tm-id{margin:0}
      .method-dossier-mount .tm-head-short{padding-left:10px;border-left:1px solid #d5e0eb;color:#35516d;font-size:12px;font-weight:700}
      .method-dossier-mount .tm-head-top .tm-badges{margin-left:auto;justify-content:flex-end}
      .method-dossier-mount .tm-detail-header h2{max-width:none;margin:8px 0 0;font-size:19px!important;line-height:1.35;letter-spacing:-.005em}
      @media (max-width:860px){
        .record-body .tm-glance-status{grid-template-columns:1fr;gap:12px}
        .record-body .tm-glance-status p{padding-left:0;border-left:0}
        .record-body .tm-glance-grid{grid-template-columns:1fr}
        .record-body .tm-glance-grid .tm-glance-row:nth-child(odd){border-right:0}
        .record-body .tm-glance-grid .tm-glance-row:nth-child(even){padding-left:4px}
        .record-body .tm-glance-grid .tm-glance-row:nth-last-child(2){border-bottom:1px solid #e3edf5}
        .record-body .tm-glance-head{flex-wrap:wrap}
      }
      @media (max-width:520px){.tm-glance-cells{grid-template-columns:1fr}.tm-glance-status-badge{min-width:0}}
    `;
    document.head.appendChild(style);
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
        evidenceUpdatedStage: "External step/stage (evidence-updated)",
        progressionBeyondTsar: "Progression beyond TSAR",
        caseStudy: "Case-study sample",
        applicationDomainExpert: "Application domain (researcher classification)",
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
  <header class="tm-detail-header tm-page-head">
    <div class="tm-head-top">
      <span class="tm-id">${esc(record.id)}</span>${hasValue(record.shortName) ? `<span class="tm-head-short">${esc(record.shortName)}</span>` : ""}
      <div class="tm-badges">
        <span class="tm-badge tm-source-badge">TSAR source record</span>
        ${verified ? '<span class="tm-badge tm-verified-badge">Researcher verified</span>' : ""}
      </div>
    </div>
    <h2 id="tm-detail-title">${esc(record.title || record.shortName)}</h2>
  </header>
  <div class="record-body tm-detail-body">
    ${journey(record)}
    ${keyPanel(record)}
    <div class="tm-signal-grid">
      ${verificationCard(record)}
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

    ${bottleneckExplained(record)}

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
