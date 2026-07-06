const ownerEl = document.getElementById("owner");
const repoEl = document.getElementById("repo");
const branchEl = document.getElementById("branch");
const tokenEl = document.getElementById("token");
const saveBtn = document.getElementById("saveBtn");
const testBtn = document.getElementById("testBtn");
const statusEl = document.getElementById("status");

function setStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.className = kind || "";
}

function readForm() {
  return {
    owner: ownerEl.value.trim(),
    repo: repoEl.value.trim(),
    branch: branchEl.value.trim() || "main",
    token: tokenEl.value.trim(),
  };
}

(async function init() {
  const config = await window.D365GitHub.getConfig();
  if (config) {
    ownerEl.value = config.owner || "";
    repoEl.value = config.repo || "";
    branchEl.value = config.branch || "";
    tokenEl.value = config.token || "";
  }
})();

saveBtn.addEventListener("click", async () => {
  const config = readForm();
  if (!config.owner || !config.repo || !config.token) {
    setStatus("Owner, repo, and token are all required.", "err");
    return;
  }
  await window.D365GitHub.saveConfig(config);
  setStatus("Saved.", "ok");
});

testBtn.addEventListener("click", async () => {
  const config = readForm();
  setStatus("Testing…", "");
  const result = await window.D365GitHub.testConnection(config);
  setStatus(result.message, result.ok ? "ok" : "err");
});
