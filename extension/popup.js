const state = {
  username: "",
  profile: null,
  jiraIssue: null,
  session: null,
  selectedPoints: null,
  poll: null,
  notifiedSessionId: null,
  votedSessionId: null,
  soundEnabled: true
};

const $ = (id) => document.getElementById(id);
const pointValues = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

function show(id, visible) {
  $(id).classList.toggle("hidden", !visible);
}

function setText(id, value) {
  $(id).textContent = value;
}

function secondsLeft(session) {
  if (!session) return 0;
  return Math.max(0, Math.ceil((new Date(session.reveal_at).getTime() - Date.now()) / 1000));
}

function canReveal(session) {
  return session && secondsLeft(session) === 0;
}

function formatPoints(points) {
  return Number(points).toFixed(points % 1 === 0 ? 0 : 1);
}

function initials(username) {
  return username
    .split(/[.\-_\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function avatarHue(username) {
  let hash = 0;
  for (let index = 0; index < username.length; index += 1) {
    hash = username.charCodeAt(index) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

function renderSoundPreference() {
  $("soundToggle").selected = state.soundEnabled;
  $("soundToggle").title = state.soundEnabled ? "Disable sound" : "Enable sound";
  $("soundStatus").textContent = state.soundEnabled ? "Audio cue armed" : "Audio cue muted";
}

function playVoteStartSound() {
  if (!state.soundEnabled) return;
  const audio = new Audio(chrome.runtime.getURL("formula-1-radio-notification.mp3"));
  audio.volume = 0.85;
  audio.play().catch(() => {
    $("soundStatus").textContent = "Click Sound on to allow alerts";
  });
}

async function readActiveIssue() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes(".jira.com")) return null;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "READ_JIRA_ISSUE" });
    return response?.issue || null;
  } catch (_error) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    const response = await chrome.tabs.sendMessage(tab.id, { type: "READ_JIRA_ISSUE" });
    return response?.issue || null;
  }
}

function renderPoints() {
  $("pointGrid").innerHTML = "";
  pointValues.forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "point";
    button.textContent = formatPoints(value);
    button.addEventListener("click", () => {
      state.selectedPoints = value;
      $("customPoints").value = formatPoints(value);
      document.querySelectorAll(".point").forEach((node) => node.classList.toggle("selected", node === button));
    });
    $("pointGrid").appendChild(button);
  });
}

function renderIssue() {
  show("jiraIssueCard", false);
  show("emptyState", Boolean(state.profile?.is_admin && !state.jiraIssue?.title && !state.session));
  if (!state.jiraIssue?.title) return;
  setText("jiraTicketKey", state.jiraIssue.key || "Current Jira ticket");
  setText("jiraTicketTitle", state.jiraIssue.title);
  setText("jiraTicketType", state.jiraIssue.issueType || "Unknown type");
  setText("jiraTicketPriority", state.jiraIssue.priority || "Unknown priority");
}

function renderSessionIssue() {
  const hasSession = Boolean(state.session);
  show("sessionIssueCard", hasSession);
  if (!hasSession) return;
  setText("sessionTicketKey", state.session.ticket_key || "Voting now");
  setText("sessionTicketTitle", state.session.title);
  setText("sessionTicketType", state.session.issue_type || "Unknown type");
  setText("sessionTicketPriority", state.session.priority || "Unknown priority");
  setText("sessionPhase", canReveal(state.session) ? "Revealed" : "Voting");
}

function renderRole() {
  const isAdmin = Boolean(state.profile?.is_admin);
  setText("roleBadge", !state.username ? "Setup" : state.profile ? (isAdmin ? "Admin" : "Voter") : "Not added");
  show("settingsButton", isAdmin);
  if (!isAdmin) show("settingsPanel", false);
  show("setup", true);
  show("adminPanel", isAdmin);
  show("voterPanel", !isAdmin && Boolean(state.profile));
  renderIssue();
}

async function renderSession() {
  const latestIssue = await readActiveIssue();
  if (latestIssue?.key && latestIssue.key !== state.jiraIssue?.key) {
    state.jiraIssue = latestIssue;
    renderIssue();
  }

  if (state.profile?.is_admin && state.jiraIssue?.key) {
    state.session = await db.getActiveSession(state.jiraIssue.key);
  } else {
    state.session = await db.getLatestActiveSession();
  }

  const hasSession = Boolean(state.session);
  const currentTicketHasOpenVote = hasSession && state.jiraIssue?.key === state.session.ticket_key && !canReveal(state.session);

  if (!state.profile?.is_admin && hasSession && state.notifiedSessionId !== state.session.id && !canReveal(state.session)) {
    state.notifiedSessionId = state.session.id;
    await chrome.storage.local.set({ notifiedSessionId: state.session.id });
    playVoteStartSound();
    $("soundStatus").textContent = state.soundEnabled ? "New vote alert played" : "New vote alert muted";
    $("soundStatus").classList.add("pulse");
    setTimeout(() => $("soundStatus").classList.remove("pulse"), 900);
  }

  renderSessionIssue();

  $("startSession").disabled = !state.jiraIssue?.key || currentTicketHasOpenVote;
  $("revealNow").disabled = !hasSession;
  setText("timer", hasSession ? `${secondsLeft(state.session)}s` : "No session");
  setText("voterTimer", hasSession ? `${secondsLeft(state.session)}s` : "Waiting");

  if (hasSession && state.username && !state.profile?.is_admin) {
    await db.upsertParticipant(state.session.id, state.username, false);
  }

  if (state.profile?.is_admin && hasSession) {
    await renderAdminSession();
  }

  if (!state.profile?.is_admin) {
    const alreadyVoted = hasSession && state.votedSessionId === state.session.id;
    $("submitVote").disabled = !hasSession || canReveal(state.session) || alreadyVoted;
    setText(
      "voteStatus",
      hasSession
        ? (alreadyVoted ? `Vote locked for ${state.session.ticket_key}.` : (canReveal(state.session) ? `Voting closed for ${state.session.ticket_key}.` : `Voting on ${state.session.ticket_key}. Your point value is anonymous.`))
        : "Waiting for the admin to start a vote."
    );
  }
}

async function renderAdminSession() {
  const [allParticipants, votes] = await Promise.all([
    db.getParticipants(state.session.id),
    db.getVotes(state.session.id)
  ]);
  const participants = allParticipants.filter((person) => person.username !== state.session.admin_username);

  const reveal = canReveal(state.session) || state.session.status === "closed";
  const votedCount = participants.filter((person) => person.has_voted).length;
  const seconds = Math.max(0, secondsLeft(state.session));
  $("adminSummary").innerHTML = `
    <div><strong>${votedCount}/${participants.length}</strong><span>votes</span></div>
    <div><strong>${seconds}s</strong><span>timer</span></div>
    <div><strong>${reveal ? "Open" : "Hidden"}</strong><span>scores</span></div>
  `;

  $("participants").innerHTML = participants.length
    ? participants.map((person) => {
      const hue = avatarHue(person.username);
      return `
        <div class="avatarWrap" title="${person.username} ${person.has_voted ? "voted" : "waiting"}">
          <span class="avatar" style="--avatar-hue: ${hue}">${initials(person.username)}</span>
          ${person.has_voted ? `<span class="voteTick">✓</span>` : ""}
        </div>
      `;
    }).join("")
    : `<div class="muted">No participants yet.</div>`;

  show("results", reveal);
  if (!reveal) return;

  if (!votes.length) {
    $("results").innerHTML = `<div class="muted">No votes were cast.</div>`;
    return;
  }

  const total = votes.reduce((sum, vote) => sum + Number(vote.points), 0);
  const average = total / votes.length;
  const rounded = db.roundToHalf(average);
  const distribution = votes.reduce((counts, vote) => {
    const key = formatPoints(Number(vote.points));
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const maxCount = Math.max(...Object.values(distribution));
  const modes = Object.entries(distribution)
    .filter(([, count]) => count === maxCount)
    .map(([points]) => points);
  const groupedScores = Object.entries(distribution)
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  $("results").innerHTML = `
    <div class="resultHero">
      <div>
        <span>Rounded average</span>
        <strong>${formatPoints(rounded)}</strong>
      </div>
      <div>
        <span>Mode</span>
        <strong>${modes.join(", ")}</strong>
      </div>
      <small>Raw avg ${formatPoints(average)}</small>
    </div>
    <div class="scoreGroups">
      ${groupedScores.map(([points, count]) => `
        <div class="scoreGroup">
          <strong>${points}</strong>
          <span>${count}</span>
        </div>
      `).join("")}
    </div>
  `;
}

async function loadUser() {
  const stored = await chrome.storage.local.get(["username", "notifiedSessionId", "votedSessionId", "soundEnabled"]);
  state.username = stored.username || "";
  state.notifiedSessionId = stored.notifiedSessionId || null;
  state.votedSessionId = stored.votedSessionId || null;
  state.soundEnabled = stored.soundEnabled !== false;
  $("username").value = state.username;
  renderSoundPreference();
  if (state.username) {
    state.profile = await db.getProfile(state.username);
  }
}

async function saveUser() {
  const username = $("username").value.trim().toLowerCase();
  if (!username) return;
  await chrome.storage.local.set({ username });
  state.username = username;
  state.profile = await db.getProfile(username);
  if (!state.profile) setText("voteStatus", "This username is not in the team list yet.");
  renderRole();
  await renderSession();
}

async function startSession() {
  state.jiraIssue = await readActiveIssue();
  renderIssue();
  if (!state.jiraIssue || !state.username) return;
  state.session = await db.createSession(state.jiraIssue, state.username);
  await renderSession();
}

async function revealNow() {
  if (!state.session) return;
  state.session = await db.revealSession(state.session.id);
  await renderSession();
}

function readPoints() {
  const value = Number($("customPoints").value);
  if (!Number.isFinite(value) || value < 0.5 || value > 5) {
    throw new Error("Enter a point value from 0.5 to 5.");
  }
  return Math.round(value * 2) / 2;
}

async function submitVote() {
  if (!state.session || !state.username) return;
  try {
    if (canReveal(state.session)) {
      throw new Error("Voting has closed for this session.");
    }
    const points = readPoints();
    await db.castVote(state.session.id, state.username, points);
    state.votedSessionId = state.session.id;
    await chrome.storage.local.set({ votedSessionId: state.session.id });
    $("submitVote").disabled = true;
    setText("voteStatus", `Vote submitted as ${formatPoints(points)}. The admin will only see anonymous results.`);
  } catch (error) {
    setText("voteStatus", error.message);
  }
}

async function boot() {
  await Promise.all([
    customElements.whenDefined("md-filled-button"),
    customElements.whenDefined("md-filled-tonal-button"),
    customElements.whenDefined("md-text-button"),
    customElements.whenDefined("md-outlined-text-field"),
    customElements.whenDefined("md-switch")
  ]);
  renderPoints();
  await loadUser();
  state.jiraIssue = await readActiveIssue();
  renderIssue();
  renderRole();
  await renderSession();
  state.poll = setInterval(renderSession, 2000);
}

$("saveUser").addEventListener("click", saveUser);
$("startSession").addEventListener("click", startSession);
$("revealNow").addEventListener("click", revealNow);
$("submitVote").addEventListener("click", submitVote);
$("settingsButton").addEventListener("click", () => {
  $("settingsPanel").classList.toggle("hidden");
});
$("manageUsers").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("admin.html") });
});
$("soundToggle").addEventListener("change", async () => {
  state.soundEnabled = $("soundToggle").selected;
  await chrome.storage.local.set({ soundEnabled: state.soundEnabled });
  renderSoundPreference();
});
$("customPoints").addEventListener("input", () => {
  document.querySelectorAll(".point").forEach((node) => node.classList.remove("selected"));
});

boot().catch((error) => {
  show("setup", true);
  show("emptyState", true);
  setText("emptyState", error.message);
});
