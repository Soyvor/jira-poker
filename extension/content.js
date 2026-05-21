function text(selector) {
  const node = document.querySelector(selector);
  return node ? node.textContent.trim().replace(/\s+/g, " ") : "";
}

function getIssueType() {
  const button = document.querySelector('[data-testid="issue.views.issue-base.foundation.change-issue-type.button"]');
  const image = button ? button.querySelector("img[alt]") : null;
  return image?.getAttribute("alt") || button?.getAttribute("aria-label")?.replace(" - Change work type", "") || "";
}

function getPriority() {
  return (
    text('[data-testid="issue-field-priority-readview-full.ui.priority.wrapper"] span') ||
    text('[data-testid*="priority-readview"] span') ||
    text('[data-testid*="priority"] span') ||
    text("span[aria-label*='Priority']")
  );
}

function getTicketKey() {
  const pathMatch = location.pathname.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
  if (pathMatch) return pathMatch[1].toUpperCase();
  const titleMatch = document.title.match(/([A-Z][A-Z0-9]+-\d+)/i);
  if (titleMatch) return titleMatch[1].toUpperCase();
  return location.pathname.split("/").filter(Boolean).pop() || location.href;
}

function readJiraIssue() {
  return {
    key: getTicketKey(),
    url: location.href,
    title: text('[data-testid="issue.views.issue-base.foundation.summary.heading"]') || document.title,
    priority: getPriority() || "Unknown",
    issueType: getIssueType() || "Unknown"
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "READ_JIRA_ISSUE") {
    sendResponse({ ok: true, issue: readJiraIssue() });
  }
});
