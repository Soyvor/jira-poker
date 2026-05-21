const $ = (id) => document.getElementById(id);
let unlocked = false;
let adminPassword = "";

function show(id, visible) {
  $(id).classList.toggle("hidden", !visible);
}

function normalizeUsername(value) {
  return value.trim().toLowerCase();
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

async function unlock() {
  const password = $("password").value;
  const isValid = await db.verifyAdminPassword(password);
  if (!isValid) {
    $("loginError").textContent = "Password did not match.";
    return;
  }
  adminPassword = password;
  unlocked = true;
  show("dashboard", true);
  $("dashboard").scrollIntoView({ behavior: "smooth", block: "start" });
  await renderProfiles();
}

async function renderProfiles() {
  if (!unlocked) return;
  const profiles = await db.getProfiles();
  $("count").textContent = `${profiles.length}`;
  $("profiles").innerHTML = profiles.length
    ? profiles.map((profile) => `
      <div class="profile">
        <div class="profileIdentity">
          <span class="avatar" style="--avatar-hue: ${avatarHue(profile.username)}">${initials(profile.username)}</span>
          <div>
            <strong>${profile.username}</strong>
            <span>${profile.is_admin ? "Admin view enabled" : "Voter view"}</span>
          </div>
        </div>
        <div class="actions">
          <md-filled-tonal-button data-admin="${profile.username}">
            ${profile.is_admin ? "Remove admin" : "Make admin"}
          </md-filled-tonal-button>
          <md-text-button data-delete="${profile.username}">Delete</md-text-button>
        </div>
      </div>
    `).join("")
    : `<p class="hint">No users yet.</p>`;

  document.querySelectorAll("[data-admin]").forEach((button) => {
    button.addEventListener("click", async () => {
      const username = button.getAttribute("data-admin");
      const profile = profiles.find((item) => item.username === username);
      await db.upsertProfile(adminPassword, username, !profile.is_admin);
      await renderProfiles();
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      await db.deleteProfile(adminPassword, button.getAttribute("data-delete"));
      await renderProfiles();
    });
  });
}

async function addUser() {
  const username = normalizeUsername($("newUser").value);
  if (!username) return;
  await db.upsertProfile(adminPassword, username, false);
  $("newUser").value = "";
  await renderProfiles();
}

async function boot() {
  await Promise.all([
    customElements.whenDefined("md-filled-button"),
    customElements.whenDefined("md-filled-tonal-button"),
    customElements.whenDefined("md-text-button"),
    customElements.whenDefined("md-outlined-text-field")
  ]);

  $("unlock").addEventListener("click", () => unlock().catch((error) => {
    $("loginError").textContent = error.message;
  }));
  $("addUser").addEventListener("click", () => addUser().catch(console.error));
  $("refresh").addEventListener("click", () => renderProfiles().catch(console.error));
  $("password").addEventListener("keydown", (event) => {
    if (event.key === "Enter") unlock().catch((error) => {
      $("loginError").textContent = error.message;
    });
  });
}

boot().catch((error) => {
  $("loginError").textContent = error.message;
});
