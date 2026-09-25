/* Analysis controls read the editable select elements and dynamically update data results. */
document.addEventListener("DOMContentLoaded", () => {
  const records = window.NAM_METHOD_RECORDS || []; const chart = document.querySelector("[data-analysis-chart]"); const recordGrid = document.querySelector("[data-analysis-records]"); if (!chart || !recordGrid) return;
  const palette = ["#0a3d80","#347fd6","#2ca6b0","#8ad6df","#7a67c7","#e6a33a"]; const labels = {workflowStep:"Original workflow step",yearReceived:"Year received",organisation:"Organisation",stepStage:"Combined step/stage",topic:"Topic",workflowStage:"Workflow stage",status:"Regulatory status",stage:"Regulatory stage",code:"TSAR workflow stage",endpoint:"Endpoint category",methodology:"Core methodology",applicationDomain:"Application domain",applicationDomainExpert:"Expert application domain",lifecycleVerification:"Lifecycle verification",review:"Methodology review level",coreVerification:"Core verification status",caseStudyVerification:"Case-study verification status",evidenceUpdatedStage:"Evidence-updated stage",bottlenecks:"Bottleneck profile",bottleneckCount:"Number of bottleneck signals",threeR:"3R category",animalUseImpact:"Animal-use impact"};
  const labelKeys = {"Year received":"yearReceived","Organisation":"organisation","Original workflow step":"workflowStep","Combined step/stage":"stepStage","Topic":"topic","Workflow stage":"workflowStage","Regulatory stage":"stage","Regulatory status":"status","Endpoint":"endpoint","Core methodology":"methodology","Review level":"coreVerification","Expert application domain":"applicationDomainExpert","Lifecycle verification":"lifecycleVerification"};
  const controls = Object.fromEntries([...document.querySelectorAll(".analysis-filters label")].map(label => [labelKeys[label.querySelector("span")?.textContent.trim()] || "unused", label.querySelector("select")]).filter(([, el]) => el)); controls.group = document.querySelector('[data-analysis-filter="group"]'); controls.split = document.querySelector('[data-analysis-filter="split"]'); let view = "graph", measure = "percentage", visible = 10;
  const val = key => controls[key]?.value || ""; const parts = (record, key) => (["endpoint", "bottlenecks", "methodology", "applicationDomain", "applicationDomainExpert"].includes(key) ? String(record[key] || "Unknown").split(";") : key === "topic" ? String(record.topic || "Unknown").split(",") : [key === "coreVerification" ? (record.coreVerification || record.review) : record[key] || "Unknown"]).map(x => String(x).trim()).filter(Boolean);
  ["yearReceived","organisation","workflowStep","stepStage","topic","workflowStage","stage","status","endpoint","methodology","coreVerification","applicationDomainExpert","lifecycleVerification"].forEach(key => {
    const select = controls[key]; if (!select) return;
    const initial = select.options[0].textContent;
    const choices = [...new Set(records.flatMap(record => parts(record, key)))].sort((a, b) => key === "yearReceived" ? Number(b) - Number(a) : a.localeCompare(b, "en", { numeric: true }));
    select.replaceChildren(new Option(initial, ""), ...choices.map(choice => new Option(choice, choice)));
  });
  const filtered = () => records.filter(m => ["yearReceived","organisation","workflowStep","stepStage","topic","workflowStage","stage","status","endpoint","methodology","coreVerification","applicationDomainExpert","lifecycleVerification"].every(key => { const v = val(key); return !v || parts(m, key).includes(v); }));
  const esc = value => String(value ?? "—").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  const openRecord = method => {
    const backdrop = document.createElement("div"); backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<section class="record-modal" role="dialog" aria-modal="true" aria-labelledby="analysis-record-title"><header><div><span>${esc(method.id)}</span><h2 id="analysis-record-title">${esc(method.title || method.shortName)}</h2><p>${esc(method.shortName)}</p></div><button class="btn btn-sm" type="button" data-close aria-label="Close method details">×</button></header><div class="record-body"><div class="provenance-strip"><span class="source-chip">TSAR source retained</span><span class="derived-chip">Research classifications added</span></div><dl><div><dt>Regulatory stage</dt><dd>${esc(method.stage)}</dd></div><div><dt>Regulatory status</dt><dd>${esc(method.status)}</dd></div><div><dt>Endpoint category</dt><dd>${esc(method.endpoint)}</dd></div><div><dt>Core methodology</dt><dd>${esc(method.methodology)}</dd></div><div><dt>Organisation</dt><dd>${esc(method.organisation)}</dd></div><div><dt>NEW_STEP_STAGE</dt><dd><code>${esc(method.code)}</code></dd></div></dl><article><h3>TSAR source description</h3><p>${esc(method.description || "No source description available.")}</p></article><article><h3>Verification note</h3><p>${esc(method.verificationNote || "No verification note available.")}</p></article></div></section>`;
    backdrop.querySelector(".record-body dl").insertAdjacentHTML("beforeend", `<div><dt>Expert application domain</dt><dd>${esc(method.applicationDomainExpert || "—")}</dd></div><div><dt>Lifecycle verification</dt><dd>${esc(method.lifecycleVerification || "—")}</dd></div>`);
    const close = () => { document.removeEventListener("keydown", onKeydown); backdrop.remove(); };
    const onKeydown = event => { if (event.key === "Escape") close(); };
    backdrop.addEventListener("mousedown", event => { if (event.target === backdrop) close(); }); backdrop.querySelector("[data-close]").addEventListener("click", close); document.addEventListener("keydown", onKeydown); document.body.append(backdrop); backdrop.querySelector("[data-close]").focus();
  };
  const draw = () => {
    const data = filtered(), group = val("group"), split = val("split"), counts = new Map();
    data.forEach(method => {
      parts(method, group).forEach(groupName => {
        if (!counts.has(groupName)) counts.set(groupName, new Map());
        const splitValues = split === "none" ? ["Records"] : parts(method, split);
        splitValues.forEach(splitName => {
          const groupCounts = counts.get(groupName);
          groupCounts.set(splitName, (groupCounts.get(splitName) || 0) + 1);
        });
      });
    });
    const rows = [...counts].map(([name, groups]) => ({ name, groups: [...groups].map(([partName, value]) => ({ name: partName, value })), total: [...groups.values()].reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total);
    const splitLabels = [...new Set(rows.flatMap(row => row.groups.map(part => part.name)))];
    const max = Math.max(1, ...rows.map(row => row.total));
    const display = value => measure === "percentage" ? `${(value / Math.max(1, data.length) * 100).toFixed(1)}%<small class="analysis-count">(n=${value})</small>` : `n=${value}`;
    const heading = chart.closest(".analysis-result").querySelector("h2"); heading.textContent = labels[group] || group; chart.closest(".analysis-result").querySelector("header p").textContent = `${data.length} of ${records.length} records selected · ${measure === "number" ? "Number of records" : "Share of selected records: % (n=x)"}`;
    chart.innerHTML = view === "graph" ? rows.map(row => `<div class="analysis-row"><span>${row.name}</span><div class="stack-track">${row.groups.map(part => `<i title="${part.name}: ${part.value}" style="width:${part.value/max*100}%;background:${palette[splitLabels.indexOf(part.name)%palette.length]}"></i>`).join("")}</div><strong>${display(row.total)}</strong></div>`).join("") + (split !== "none" ? `<div class="chart-legend">${splitLabels.map((name,i) => `<span><i style="background:${palette[i%palette.length]}"></i>${name}</span>`).join("")}</div>` : "") : `<div class="analysis-table-wrap"><table class="table table-hover"><thead><tr><th>${labels[group]}</th>${splitLabels.map(x=>`<th>${x}</th>`).join("")}<th>Total</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${row.name}</td>${splitLabels.map(x=>`<td>${display(row.groups.find(p=>p.name===x)?.value||0)}</td>`).join("")}<td><strong>${display(row.total)}</strong></td></tr>`).join("")}</tbody></table></div>`;
    recordGrid.innerHTML = data.slice(0,visible).map(m => `<button class="panel card" data-analysis-record="${m.id}"><span>${m.id} · ${m.status}</span><strong>${m.shortName}</strong><small>${m.endpoint}</small><i>${m.methodology} →</i></button>`).join(""); document.querySelector(".analysis-record-more")?.remove(); if (visible < data.length) { const more=document.createElement("button");more.className="show-more analysis-record-more btn btn-outline-primary";more.textContent=`Show more records (${Math.min(20,data.length-visible)} more)`;more.addEventListener("click",()=>{visible+=20;draw();});recordGrid.after(more); }
  };
  recordGrid.addEventListener("click", event => { const card = event.target.closest("[data-analysis-record]"); if (!card) return; const method = records.find(record => record.id === card.dataset.analysisRecord); if (method) openRecord(method); });
  Object.values(controls).forEach(el => ["input", "change"].forEach(type => el.addEventListener(type, () => {visible=10;draw();}))); document.querySelectorAll(".segment-control").forEach((control,index) => control.querySelectorAll("button").forEach(button => button.addEventListener("click", () => { control.querySelectorAll("button").forEach(x=>x.classList.remove("selected"));button.classList.add("selected"); if(index===0) measure=button.textContent.toLowerCase(); else view=button.textContent.toLowerCase(); draw(); })));
  const download = (blob, filename) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  };
  const exportActions = document.querySelectorAll(".analysis-actions button");
  exportActions[0]?.addEventListener("click", async () => {
    const params = new URLSearchParams({ group: val("group"), split: val("split"), measure, view });
    try { await navigator.clipboard.writeText(`${location.href.split("?")[0]}?${params}`); exportActions[0].textContent = "Analysis link copied"; }
    catch { exportActions[0].textContent = "Copy this page URL"; }
    setTimeout(() => exportActions[0].textContent = "Share view", 1800);
  });
  exportActions[1]?.addEventListener("click", () => {
    const table = chart.querySelector("table");
    let rows;
    if (table) rows = [...table.rows].map(row => [...row.cells].map(cell => cell.textContent.trim()));
    else rows = [[chart.closest(".analysis-result").querySelector("h2").textContent.trim(), "Total"], ...[...chart.querySelectorAll(".analysis-row")].map(row => [row.querySelector("span")?.textContent.trim() || "", row.querySelector("strong")?.textContent.trim() || ""])];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    download(new Blob([csv], { type: "text/csv;charset=utf-8" }), "nam-analysis-table.csv");
  });
  exportActions[2]?.addEventListener("click", () => {
    const result = chart.closest(".analysis-result");
    const title = result.querySelector("h2").textContent.trim();
    const rows = [...chart.querySelectorAll(".analysis-row")].map(row => ({ label: row.querySelector("span")?.textContent.trim() || "", value: row.querySelector("strong")?.textContent.trim() || "", widths: [...row.querySelectorAll(".stack-track i")].map(bar => ({ width: parseFloat(bar.style.width) || 0, color: bar.style.background || "#0a3d80" })) }));
    const canvas = document.createElement("canvas"); canvas.width = 1600; canvas.height = Math.max(600, 190 + rows.length * 58);
    const context = canvas.getContext("2d"); context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#113d70"; context.font = "bold 36px Arial"; context.fillText(title, 60, 62);
    context.fillStyle = "#68788d"; context.font = "18px Arial"; context.fillText(result.querySelector("header p").textContent.trim(), 60, 96);
    rows.forEach((row, index) => { const y = 142 + index * 58; context.fillStyle = "#425a72"; context.font = "16px Arial"; context.fillText(row.label.slice(0, 38), 60, y + 20); let x = 470; row.widths.forEach(bar => { const width = bar.width * 8; context.fillStyle = bar.color; context.fillRect(x, y, width, 28); x += width; }); context.fillStyle = "#173f70"; context.font = "bold 16px Arial"; context.fillText(row.value, 1390, y + 20); });
    canvas.toBlob(blob => { if (blob) download(blob, "nam-analysis-graph.png"); }, "image/png");
  });
  const presets = {
    "stage-evidence": { group: "code", split: "evidenceUpdatedStage" },
    "bottleneck-profile": { group: "bottlenecks", split: "none" },
    "bottleneck-outcome": { group: "bottlenecks", split: "status" },
    "three-r-impact": { group: "threeR", split: "animalUseImpact" }
  };
  document.querySelectorAll("[data-analysis-preset]").forEach(button => button.addEventListener("click", () => {
    const preset = presets[button.dataset.analysisPreset]; if (!preset) return;
    controls.group.value = preset.group; controls.split.value = preset.split; visible = 10; draw();
    chart.closest(".analysis-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  document.querySelector(".config-heading button")?.addEventListener("click",()=>{Object.values(controls).forEach(el=>el.selectedIndex=0);controls.group.value="status";controls.split.value="none";visible=10;draw();}); draw();
});

