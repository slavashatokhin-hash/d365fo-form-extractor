// Shared GitHub API helper, used by both popup.js and options.js.
// Exposes window.D365GitHub.

(function () {
  const API_BASE = "https://api.github.com";
  const API_HEADERS_BASE = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  function authHeaders(token) {
    return { ...API_HEADERS_BASE, Authorization: `Bearer ${token}` };
  }

  async function apiRequest(token, method, path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...authHeaders(token),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
      json = await res.json();
    } catch (e) {
      // no body
    }
    if (!res.ok) {
      const msg = (json && json.message) || `${res.status} ${res.statusText}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  async function getConfig() {
    const stored = await chrome.storage.local.get(["githubConfig"]);
    return stored.githubConfig || null;
  }

  async function saveConfig(config) {
    await chrome.storage.local.set({ githubConfig: config });
  }

  async function testConnection(config) {
    if (!config || !config.owner || !config.repo || !config.token) {
      return { ok: false, message: "Owner, repo, and token are all required." };
    }
    try {
      const repoInfo = await apiRequest(config.token, "GET", `/repos/${config.owner}/${config.repo}`);
      const branch = config.branch || repoInfo.default_branch || "main";
      await apiRequest(config.token, "GET", `/repos/${config.owner}/${config.repo}/git/ref/heads/${branch}`);
      return { ok: true, message: `Connected — branch "${branch}" found in ${repoInfo.full_name}.` };
    } catch (e) {
      return { ok: false, message: describeError(e) };
    }
  }

  function describeError(e) {
    if (e.status === 401) return "Authentication failed — check that the token is valid and not expired.";
    if (e.status === 403) return "Forbidden — the token may lack repo access, or a rate limit was hit.";
    if (e.status === 404) return "Not found — check the owner/repo name and branch, and that the token can see this repo.";
    return e.message || "Unknown error.";
  }

  function sanitizeSegment(name) {
    return (name || "untitled")
      .trim()
      .replace(/[^a-z0-9\-_. ]/gi, "_")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "untitled";
  }

  // Lists existing folders in the repo (recursively, via the Git Trees API) so the
  // popup can offer a live picker instead of auto-generating a destination path.
  // Excludes "screenshots" leaf folders since those are an internal detail of a scan
  // folder, not somewhere a caller should pick as the save target.
  async function listFolders(config) {
    const { owner, repo, token } = config;
    const branch = config.branch || "main";
    const data = await apiRequest(token, "GET", `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    const folders = (data.tree || [])
      .filter((entry) => entry.type === "tree")
      .map((entry) => entry.path)
      .filter((path) => !/(^|\/)screenshots$/.test(path))
      .sort();
    return { folders, truncated: !!data.truncated };
  }

  // Builds the list of files to commit for a scan result, rooted at the given
  // (existing, user-selected) folder path.
  function buildFiles(scan, toCsv, root) {
    const files = [
      { path: `${root}/fields.csv`, content: toCsv(scan), encoding: "utf-8" },
    ];

    (scan.screenshots || []).forEach((s, i) => {
      const base64 = (s.dataUrl || "").split(",")[1];
      if (!base64) return;
      const label = sanitizeSegment(s.tab || s.label || `screenshot_${i + 1}`);
      files.push({ path: `${root}/screenshots/${label}.png`, content: base64, encoding: "base64" });
    });

    return { root, files };
  }

  // Commits all files in a single atomic commit via the Git Data API:
  // blobs -> tree -> commit -> ref update. Blobs don't depend on the branch's
  // current tip, so they're uploaded once; the tree/commit/ref-update trio is
  // retried if the branch moves underneath us between reading its state and
  // updating it (GitHub rejects that as a non-fast-forward update).
  async function commitFiles(config, files, message, onStatus) {
    const { owner, repo, token } = config;
    const branch = config.branch || "main";
    const status = onStatus || (() => {});

    const treeEntries = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      status(`Uploading file ${i + 1}/${files.length}: ${f.path}…`);
      const blob = await apiRequest(token, "POST", `/repos/${owner}/${repo}/git/blobs`, {
        content: f.content,
        encoding: f.encoding,
      });
      treeEntries.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      status(attempt === 1 ? "Reading branch state…" : `Branch moved — retrying (${attempt}/${maxAttempts})…`);
      const ref = await apiRequest(token, "GET", `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
      const baseCommitSha = ref.object.sha;
      const baseCommit = await apiRequest(token, "GET", `/repos/${owner}/${repo}/git/commits/${baseCommitSha}`);
      const baseTreeSha = baseCommit.tree.sha;

      status("Creating tree…");
      const tree = await apiRequest(token, "POST", `/repos/${owner}/${repo}/git/trees`, {
        base_tree: baseTreeSha,
        tree: treeEntries,
      });

      status("Creating commit…");
      const commit = await apiRequest(token, "POST", `/repos/${owner}/${repo}/git/commits`, {
        message,
        tree: tree.sha,
        parents: [baseCommitSha],
      });

      status("Updating branch…");
      try {
        await apiRequest(token, "PATCH", `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
          sha: commit.sha,
        });
        return {
          commitSha: commit.sha,
          commitUrl: `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
        };
      } catch (e) {
        const isRaceError = e.status === 422 || /fast.forward/i.test(e.message || "");
        if (!isRaceError || attempt === maxAttempts) throw e;
        // The branch moved between reading it and updating it — loop around and
        // rebuild the tree/commit against the new tip.
      }
    }
  }

  window.D365GitHub = {
    getConfig,
    saveConfig,
    testConnection,
    listFolders,
    buildFiles,
    commitFiles,
    describeError,
    sanitizeSegment,
  };
})();
