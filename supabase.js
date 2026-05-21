const SUPABASE_URL = "https://muzwzxewfkwappezcgzx.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZHDbBCCoG1tkfUxfTSwxVQ_bBvJqyGt";
const API_BASE = `${SUPABASE_URL}/rest/v1`;

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Supabase request failed with ${response.status}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function isoAfterMs(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function roundToHalf(value) {
  return Math.round(value * 2) / 2;
}

async function sha256(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const db = {
  async getProfile(username) {
    const rows = await request(`/profiles?username=${eq(username)}&select=*`);
    return rows[0] || null;
  },

  async getActiveSession(ticketKey) {
    const rows = await request(`/sessions?ticket_key=${eq(ticketKey)}&status=eq.active&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&order=created_at.desc&limit=1`);
    return rows[0] || null;
  },

  async getLatestActiveSession() {
    const rows = await request(`/sessions?status=eq.active&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&order=created_at.desc&limit=1`);
    return rows[0] || null;
  },

  async createSession(issue, adminUsername) {
    const payload = {
      ticket_key: issue.key,
      ticket_url: issue.url,
      title: issue.title,
      priority: issue.priority || "Unknown",
      issue_type: issue.issueType || "Unknown",
      admin_username: adminUsername,
      status: "active",
      reveal_at: isoAfterMs(15000),
      expires_at: isoAfterMs(24 * 60 * 60 * 1000)
    };
    const rows = await request("/sessions", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    });
    return rows[0];
  },

  async revealSession(sessionId) {
    const rows = await request(`/sessions?id=${eq(sessionId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ reveal_at: new Date().toISOString() })
    });
    return rows[0];
  },

  async upsertParticipant(sessionId, username, hasVoted = false) {
    const existing = await request(`/participants?session_id=${eq(sessionId)}&username=${eq(username)}&select=has_voted`);
    const payload = {
      session_id: sessionId,
      username,
      has_voted: Boolean(hasVoted || existing[0]?.has_voted),
      last_seen_at: new Date().toISOString()
    };
    await request("/participants", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(payload)
    });
  },

  async castVote(sessionId, username, points) {
    const voterCode = await sha256(`${sessionId}:${username.toLowerCase().trim()}`);
    await request("/votes", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        session_id: sessionId,
        voter_code: voterCode,
        points,
        created_at: new Date().toISOString()
      })
    });
    await this.upsertParticipant(sessionId, username, true);
  },

  async getParticipants(sessionId) {
    return request(`/participants?session_id=${eq(sessionId)}&select=*&order=username.asc`);
  },

  async getVotes(sessionId) {
    return request(`/votes?session_id=${eq(sessionId)}&select=points,created_at&order=created_at.asc`);
  },

  async getProfiles() {
    return request("/profiles?select=*&order=username.asc");
  },

  async upsertProfile(adminPassword, username, isAdmin) {
    await request("/rpc/admin_upsert_profile", {
      method: "POST",
      body: JSON.stringify({ admin_password: adminPassword, profile_username: username, profile_is_admin: isAdmin })
    });
  },

  async deleteProfile(adminPassword, username) {
    await request("/rpc/admin_delete_profile", {
      method: "POST",
      body: JSON.stringify({ admin_password: adminPassword, profile_username: username })
    });
  },

  async verifyAdminPassword(adminPassword) {
    return request("/rpc/verify_admin_password", {
      method: "POST",
      body: JSON.stringify({ admin_password: adminPassword })
    });
  },

  roundToHalf
};
