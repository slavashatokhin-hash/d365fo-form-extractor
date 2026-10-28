const scanBtn = document.getElementById("scanBtn");
const csvBtn = document.getElementById("csvBtn");
const jsonBtn = document.getElementById("jsonBtn");
const lookupCsvBtn = document.getElementById("lookupCsvBtn");
const githubBtn = document.getElementById("githubBtn");
const githubSettingsBtn = document.getElementById("githubSettingsBtn");
const githubStatusEl = document.getElementById("githubStatus");
const githubFolderRow = document.getElementById("githubFolderRow");
const githubFolderSelect = document.getElementById("githubFolderSelect");
const githubFolderRefreshBtn = document.getElementById("githubFolderRefreshBtn");
const deepScanEl = document.getElementById("deepScan");
const walkTabsEl = document.getElementById("walkTabs");
const captureScreenshotsEl = document.getElementById("captureScreenshots");
const captureLookupsEl = document.getElementById("captureLookups");
const mergeResultsEl = document.getElementById("mergeResults");
const resetRowEl = document.getElementById("resetRow");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");
const metaEl = document.getElementById("meta");
const resultsEl = document.getElementById("results");
const lookupsResultsEl = document.getElementById("lookupsResults");
const screenshotsEl = document.getElementById("screenshots");
const combineBtn = document.getElementById("combineBtn");
const emptyStateEl = document.getElementById("empty-state");
const errorStateEl = document.getElementById("error-state");

let lastScan = null;

function showEmpty() {
  emptyStateEl.style.display = "block";
  errorStateEl.style.display = "none";
  resultsEl.innerHTML = "";
  lookupsResultsEl.innerHTML = "";
  screenshotsEl.innerHTML = "";
  screenshotsEl.className = "";
  combineBtn.style.display = "none";
  metaEl.style.display = "none";
  resetRowEl.style.display = "none";
  lookupCsvBtn.disabled = true;
  githubBtn.disabled = true;
  githubStatusEl.textContent = "";
  githubStatusEl.className = "";
  githubFolderRow.classList.remove("show");
}

function showError(message) {
  errorStateEl.textContent = message;
  errorStateEl.style.display = "block";
  emptyStateEl.style.display = "none";
  resultsEl.innerHTML = "";
  lookupsResultsEl.innerHTML = "";
  metaEl.style.display = "none";
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderResults(scan) {
  emptyStateEl.style.display = "none";
  errorStateEl.style.display = "none";

  const tabsNote = scan.tabsScanned > 1
    ? ` &nbsp;&middot;&nbsp; ${scan.tabsScanned} tab(s): <span>${escapeHtml(scan.tabsFound.join(", "))}</span>`
    : "";
  metaEl.style.display = "block";
  metaEl.innerHTML = `Form: <span>${escapeHtml(scan.formName || "(unknown)")}</span> &nbsp;&middot;&nbsp; ${scan.fields.length} field(s)${tabsNote}`;
  resetRowEl.style.display = "block";

  if (!scan.fields.length) {
    resultsEl.innerHTML = `<div style="padding:24px;color:#8b93a7;text-align:center;">No labeled fields found on this page. Make sure the form is fully loaded, then scan again.</div>`;
    return;
  }

  const showTabCol = scan.fields.some((f) => f.tab);

  const rows = scan.fields.map((f) => `
    <tr>
      ${showTabCol ? `<td>${f.tab ? escapeHtml(f.tab) : '<span class="empty-cell">—</span>'}</td>` : ""}
      <td class="control-name">${escapeHtml(f.controlName)}</td>
      <td>${f.label ? escapeHtml(f.label) : '<span class="empty-cell">—</span>'}</td>
      <td>${f.helpText
        ? escapeHtml(f.helpText) + (f.helpSource === "hover" ? '<span class="badge">hover</span>' : "")
        : '<span class="empty-cell">—</span>'}</td>
    </tr>
  `).join("");

  resultsEl.innerHTML = `
    <table>
      <thead>
        <tr>${showTabCol ? "<th>Tab</th>" : ""}<th>Control name</th><th>Label</th><th>Help text</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderLookups(scan) {
  const lookups = scan.lookups || [];
  if (!lookups.length) {
    lookupsResultsEl.innerHTML = "";
    return;
  }
  const rows = lookups.map((l) => `
    <tr>
      <td>${l.tab ? escapeHtml(l.tab) : '<span class="empty-cell">—</span>'}</td>
      <td class="control-name">${escapeHtml(l.controlName)}</td>
      <td>${l.opened
        ? escapeHtml(l.values.slice(0, 12).join(", ")) + (l.values.length > 12 ? ` … (+${l.values.length - 12} more)` : "")
        : '<span class="empty-cell">not opened — ' + escapeHtml(l.reason || "unknown") + "</span>"}</td>
    </tr>
  `).join("");
  lookupsResultsEl.innerHTML = `
    <div style="padding:8px 16px 2px; font-size:11.5px; color:var(--text-dim); font-weight:600;">Lookup values</div>
    <table>
      <thead><tr><th>Tab</th><th>Control name</th><th>Available values</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderScreenshots(scan) {
  const shots = scan.screenshots || [];
  if (!shots.length) {
    screenshotsEl.innerHTML = "";
    screenshotsEl.className = "";
    combineBtn.style.display = "none";
    return;
  }
  screenshotsEl.className = "has-shots";
  screenshotsEl.innerHTML = shots.map((s, i) => `
    <div class="shot-card">
      <img src="${s.dataUrl}" data-idx="${i}" alt="${escapeHtml(s.tab || s.label || "screenshot")}" />
      <div class="shot-caption">
        <span>${escapeHtml(s.tab || s.label || "Screenshot")}</span>
        <a href="${s.dataUrl}" download="${(s.tab || s.label || "screenshot").replace(/[^a-z0-9]+/gi, "_")}.png">Download</a>
      </div>
    </div>
  `).join("");
  screenshotsEl.querySelectorAll("img").forEach((img) => {
    img.addEventListener("click", () => window.open(img.src, "_blank"));
  });
  combineBtn.style.display = "block";
}

function mergeScans(oldScan, newScan) {
  const map = new Map();
  (oldScan.fields || []).forEach((f) => map.set(`${f.tab || ""}|${f.controlName}`, f));
  (newScan.fields || []).forEach((f) => map.set(`${f.tab || ""}|${f.controlName}`, f));
  const tabsFound = Array.from(new Set([...(oldScan.tabsFound || []), ...(newScan.tabsFound || [])]));

  const shotMap = new Map();
  (oldScan.screenshots || []).forEach((s) => shotMap.set(s.tab || "", s));
  (newScan.screenshots || []).forEach((s) => shotMap.set(s.tab || "", s));

  const lookupMap = new Map();
  (oldScan.lookups || []).forEach((l) => lookupMap.set(`${l.tab || ""}|${l.controlName}`, l));
  (newScan.lookups || []).forEach((l) => lookupMap.set(`${l.tab || ""}|${l.controlName}`, l));

  return {
    ...newScan,
    formName: newScan.formName || oldScan.formName,
    fields: Array.from(map.values()),
    tabsFound,
    tabsScanned: tabsFound.length || newScan.tabsScanned,
    screenshots: Array.from(shotMap.values()),
    lookups: Array.from(lookupMap.values()),
  };
}



function toCsv(scan) {
  const header = ["Tab", "Form", "Control Name", "Role", "Label", "Help Text", "Help Source"];
  const escapeCsv = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
  const lines = [header.map(escapeCsv).join(",")];
  scan.fields.forEach((f) => {
    lines.push([f.tab || "", scan.formName, f.controlName, f.role, f.label, f.helpText, f.helpSource || ""].map(escapeCsv).join(","));
  });
  return lines.join("\r\n");
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function combineScreenshots(screenshots) {
  const LABEL_H = 28;
  const images = await Promise.all(screenshots.map((s) => loadImage(s.dataUrl)));
  const width = Math.max(...images.map((img) => img.width));
  const totalHeight = images.reduce((sum, img) => sum + LABEL_H + img.height, 0);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = totalHeight;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#12151c";
  ctx.fillRect(0, 0, width, totalHeight);

  let y = 0;
  images.forEach((img, i) => {
    ctx.fillStyle = "#191d27";
    ctx.fillRect(0, y, width, LABEL_H);
    ctx.fillStyle = "#e4e7ee";
    ctx.font = "14px -apple-system, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(screenshots[i].tab || screenshots[i].label || `Screenshot ${i + 1}`, 10, y + LABEL_H / 2);
    y += LABEL_H;
    ctx.drawImage(img, 0, y);
    y += img.height;
  });

  return canvas.toDataURL("image/png");
}

function toLookupCsv(scan) {
  const header = ["Tab", "Control Name", "Opened", "Values"];
  const escapeCsv = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
  const lines = [header.map(escapeCsv).join(",")];
  (scan.lookups || []).forEach((l) => {
    lines.push([l.tab || "", l.controlName, l.opened ? "yes" : "no", (l.values || []).join(" | ")].map(escapeCsv).join(","));
  });
  return lines.join("\r\n");
}

async function injectScanner(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["scanner.js"] });
}

function exec(tabId, func, args) {
  return chrome.scripting.executeScript({ target: { tabId }, func, args: args || [] }).then((r) => r[0].result);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function performScan({ deep, walkTabs, captureScreenshots, captureLookups, onStatus }) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("No active tab found.");
  const tabId = tab.id;
  const windowId = tab.windowId;

  await injectScanner(tabId);

  const tabNames = walkTabs ? await exec(tabId, () => window.__d365foGetTabHeaders()) : [];
  const isMultiTab = tabNames.length > 1;
  const indices = isMultiTab ? tabNames.map((_, i) => i) : [null];

  let formName = "";
  let url = tab.url || "";
  const fields = [];
  const screenshots = [];
  const lookups = [];
  const scannedTabLabels = [];

  for (let step = 0; step < indices.length; step++) {
    const idx = indices[step];
    let tabName = "";

    if (idx !== null) {
      onStatus(`Opening tab ${step + 1}/${indices.length}: ${tabNames[idx]}…`);
      await exec(tabId, (i) => window.__d365foActivateTabByIndex(i), [idx]);
      tabName = tabNames[idx];
    }

    // A page tab (e.g. "Lines") can itself contain a second, nested tab strip — e.g.
    // a grid's "Line details" section (General/Price and discount/Fulfillment/...).
    // That strip only appears once this outer tab is active, so it's only
    // discoverable here, after the switch above.
    const innerTabNames = walkTabs ? await exec(tabId, () => window.__d365foGetInnerTabHeaders()) : [];
    const hasInnerTabs = innerTabNames.length > 1;
    const innerIndices = hasInnerTabs ? innerTabNames.map((_, i) => i) : [null];

    for (let innerStep = 0; innerStep < innerIndices.length; innerStep++) {
      const innerIdx = innerIndices[innerStep];
      let combinedTabName = tabName;

      if (innerIdx !== null) {
        onStatus(`Opening tab ${step + 1}/${indices.length} — ${innerTabNames[innerIdx]}…`);
        await exec(tabId, (i) => window.__d365foActivateInnerTabByIndex(i), [innerIdx]);
        combinedTabName = tabName ? `${tabName} > ${innerTabNames[innerIdx]}` : innerTabNames[innerIdx];
      }

      if (captureScreenshots) {
        await sleep(150);
        try {
          const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
          screenshots.push({ tab: combinedTabName, dataUrl });
        } catch (e) {
          console.warn("Screenshot capture failed:", e);
        }
      }

      onStatus(`Reading fields${combinedTabName ? " — " + combinedTabName : ""}…`);
      const fieldsResult = await exec(tabId, (d) => window.__d365foCollectCurrentFields(d), [deep]);
      formName = formName || fieldsResult.formName;
      url = fieldsResult.url || url;
      fieldsResult.fields.forEach((f) => fields.push({ ...f, tab: combinedTabName }));
      scannedTabLabels.push(combinedTabName);

      if (captureLookups) {
        const lookupControlNames = await exec(tabId, () => window.__d365foGetLookupCandidates());
        for (let li = 0; li < lookupControlNames.length; li++) {
          const controlName = lookupControlNames[li];
          onStatus(`Opening lookup ${li + 1}/${lookupControlNames.length}${combinedTabName ? " on " + combinedTabName : ""}…`);
          const openResult = await exec(tabId, (name) => window.__d365foOpenLookup(name), [controlName]);

          if (openResult.opened && captureScreenshots) {
            await sleep(120);
            try {
              const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
              screenshots.push({ tab: `${combinedTabName ? combinedTabName + " — " : ""}${controlName} (lookup)`, dataUrl });
            } catch (e) {
              console.warn("Lookup screenshot capture failed:", e);
            }
          }

          await exec(tabId, () => window.__d365foCloseLookup());
          lookups.push({ tab: combinedTabName, controlName, opened: openResult.opened, values: openResult.values || [], reason: openResult.reason || "" });
        }
      }
    }

    if (hasInnerTabs) {
      await exec(tabId, () => window.__d365foRestoreOriginalInnerTab());
    }
  }

  if (isMultiTab) {
    await exec(tabId, () => window.__d365foRestoreOriginalTab());
  }

  const tabsFound = Array.from(new Set(scannedTabLabels.filter(Boolean)));

  return {
    formName,
    url,
    scannedAt: new Date().toISOString(),
    deep,
    walkTabs,
    tabsFound: tabsFound.length ? tabsFound : tabNames,
    tabsScanned: tabsFound.length || indices.length,
    fields,
    screenshots,
    lookups,
  };
}

scanBtn.addEventListener("click", async () => {
  const deep = deepScanEl.checked;
  const walkTabs = walkTabsEl.checked;
  const captureScreenshots = captureScreenshotsEl.checked;
  const captureLookups = captureLookupsEl.checked;
  const merge = mergeResultsEl.checked;

  statusEl.textContent = "Starting…";
  scanBtn.disabled = true;
  csvBtn.disabled = true;
  jsonBtn.disabled = true;
  lookupCsvBtn.disabled = true;

  try {
    const result = await performScan({
      deep,
      walkTabs,
      captureScreenshots,
      captureLookups,
      onStatus: (msg) => { statusEl.textContent = msg; },
    });

    const finalScan = merge && lastScan ? mergeScans(lastScan, result) : result;
    lastScan = finalScan;

    renderResults(finalScan);
    renderLookups(finalScan);
    renderScreenshots(finalScan);

    csvBtn.disabled = finalScan.fields.length === 0;
    jsonBtn.disabled = finalScan.fields.length === 0;
    lookupCsvBtn.disabled = !(finalScan.lookups && finalScan.lookups.length);
    githubStatusEl.textContent = "";
    githubStatusEl.className = "";

    if (finalScan.fields.length) {
      githubFolderRow.classList.add("show");
      loadGithubFolders();
    } else {
      githubFolderRow.classList.remove("show");
    }
    updateGithubButtonState();

    const hoverCount = finalScan.fields.filter((f) => f.helpSource === "hover").length;
    const shotCount = (finalScan.screenshots || []).length;
    const lookupCount = (finalScan.lookups || []).length;
    let msg = `Done — ${finalScan.fields.length} field(s) total`;
    if (hoverCount) msg += ` (${hoverCount} via hover)`;
    if (shotCount) msg += `, ${shotCount} screenshot(s)`;
    if (lookupCount) msg += `, ${lookupCount} lookup(s)`;
    statusEl.textContent = msg;
  } catch (err) {
    console.error(err);
    showError(
      "Couldn't scan this page. Make sure a Dynamics 365 F&O form is open and active, then try again.\n\n" +
      (err && err.message ? err.message : "")
    );
    statusEl.textContent = "Error";
  } finally {
    scanBtn.disabled = false;
  }
});

csvBtn.addEventListener("click", () => {
  if (!lastScan) return;
  const safeForm = (lastScan.formName || "form").replace(/[^a-z0-9]+/gi, "_");
  download(`d365fo_${safeForm}_fields.csv`, toCsv(lastScan), "text/csv");
});

jsonBtn.addEventListener("click", async () => {
  if (!lastScan) return;
  try {
    // Screenshots are base64 data URLs and can be huge — exclude them from the JSON
    // export (they're already downloadable individually / as a combined PNG).
    const { screenshots, ...exportable } = lastScan;
    const noteIfShots = screenshots && screenshots.length
      ? { screenshotCount: screenshots.length, note: "Screenshots excluded from JSON — use the Download buttons in the popup." }
      : {};
    await navigator.clipboard.writeText(JSON.stringify({ ...exportable, ...noteIfShots }, null, 2));
    statusEl.textContent = "JSON copied to clipboard";
  } catch (e) {
    const safeForm = (lastScan.formName || "form").replace(/[^a-z0-9]+/gi, "_");
    const { screenshots, ...exportable } = lastScan;
    download(`d365fo_${safeForm}_fields.json`, JSON.stringify(exportable, null, 2), "application/json");
  }
});

lookupCsvBtn.addEventListener("click", () => {
  if (!lastScan) return;
  const safeForm = (lastScan.formName || "form").replace(/[^a-z0-9]+/gi, "_");
  download(`d365fo_${safeForm}_lookups.csv`, toLookupCsv(lastScan), "text/csv");
});

combineBtn.addEventListener("click", async () => {
  if (!lastScan || !(lastScan.screenshots || []).length) return;
  combineBtn.disabled = true;
  combineBtn.textContent = "Combining…";
  try {
    const dataUrl = await combineScreenshots(lastScan.screenshots);
    const safeForm = (lastScan.formName || "form").replace(/[^a-z0-9]+/gi, "_");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `d365fo_${safeForm}_all_tabs.png`;
    a.click();
  } catch (e) {
    console.error(e);
    statusEl.textContent = "Couldn't combine screenshots";
  } finally {
    combineBtn.disabled = false;
    combineBtn.textContent = "Download all screenshots (combined PNG)";
  }
});

resetBtn.addEventListener("click", () => {
  lastScan = null;
  csvBtn.disabled = true;
  jsonBtn.disabled = true;
  lookupCsvBtn.disabled = true;
  githubFolderSelect.innerHTML = '<option value="">Select an existing folder…</option>';
  statusEl.textContent = "";
  showEmpty();
});

githubSettingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function updateGithubButtonState() {
  githubBtn.disabled = !lastScan || lastScan.fields.length === 0 || !githubFolderSelect.value;
}

async function loadGithubFolders() {
  const config = await window.D365GitHub.getConfig();
  if (!config || !config.owner || !config.repo || !config.token) {
    githubStatusEl.textContent = "GitHub isn't configured yet — click the ⚙ button to set it up.";
    githubStatusEl.className = "err";
    return;
  }

  const previousValue = githubFolderSelect.value;
  githubFolderRefreshBtn.disabled = true;
  githubStatusEl.className = "";
  githubStatusEl.textContent = "Loading folder list…";

  try {
    const { folders, truncated } = await window.D365GitHub.listFolders(config);
    githubFolderSelect.innerHTML = '<option value="">Select an existing folder…</option>' +
      folders.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("");
    if (previousValue && folders.includes(previousValue)) {
      githubFolderSelect.value = previousValue;
    }
    githubStatusEl.textContent = truncated
      ? "Folder list loaded (truncated — repo has a lot of files)."
      : "";
  } catch (e) {
    console.error(e);
    githubStatusEl.className = "err";
    githubStatusEl.textContent = window.D365GitHub.describeError(e);
  } finally {
    githubFolderRefreshBtn.disabled = false;
    updateGithubButtonState();
  }
}

githubFolderSelect.addEventListener("change", updateGithubButtonState);

githubFolderRefreshBtn.addEventListener("click", () => {
  loadGithubFolders();
});

githubBtn.addEventListener("click", async () => {
  if (!lastScan || githubBtn.disabled) return;
  const root = githubFolderSelect.value;
  if (!root) return;
  // Disable synchronously, before any await, so a rapid double-click can't fire
  // this handler twice and race two commits against the same branch.
  githubBtn.disabled = true;

  const config = await window.D365GitHub.getConfig();
  if (!config || !config.owner || !config.repo || !config.token) {
    githubStatusEl.textContent = "GitHub isn't configured yet — click the ⚙ button to set it up.";
    githubStatusEl.className = "err";
    githubBtn.disabled = false;
    return;
  }

  githubStatusEl.className = "";
  githubStatusEl.textContent = "Preparing files…";

  try {
    const { files } = window.D365GitHub.buildFiles(lastScan, toCsv, root);
    const message = `Scan results: ${lastScan.formName || "form"} (${new Date().toISOString()})`;
    const result = await window.D365GitHub.commitFiles(config, files, message, (msg) => {
      githubStatusEl.textContent = msg;
    });
    githubStatusEl.innerHTML = `Saved to <code>${escapeHtml(root)}</code> — <a href="${escapeHtml(result.commitUrl)}" target="_blank" rel="noopener">view commit</a>`;
  } catch (e) {
    console.error(e);
    githubStatusEl.className = "err";
    githubStatusEl.textContent = window.D365GitHub.describeError(e);
  } finally {
    updateGithubButtonState();
  }
});

showEmpty();
