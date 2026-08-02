async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// Every shelf, every card and every count on the landing page in one request.
// The server caches this, so it is far cheaper than fetching each subject's
// tree separately would be.
export function getLibrary() {
  return fetch('/api/library').then(handle);
}

export function getSubjects() {
  return fetch('/api/subjects').then(handle);
}

export function getSubjectTree(subject) {
  return fetch(`/api/subjects/${subject}/tree`).then(handle);
}

export function getFileQuestions(bookId, fileId) {
  return fetch(`/api/books/${bookId}/file?fileId=${encodeURIComponent(fileId)}`).then(handle);
}

export function getQuestion(bookId, fileId, ordinal) {
  return fetch(`/api/books/${bookId}/question?fileId=${encodeURIComponent(fileId)}&ordinal=${ordinal}`).then(handle);
}

export function assetUrl(bookId, src) {
  return `/assets/${bookId}/${src}`;
}

// Solution figures come from the solutions repo, which is a separate repo
// from the questions — see the /assets/solution route.
export function solutionAssetUrl(bookId, src) {
  return `/assets/solution/${bookId}/${src}`;
}

// --- Bookmarks -------------------------------------------------------------
// These all need a signed-in user, so they take the authFetch from useAuth()
// rather than calling fetch directly.

export async function listBookmarks(authFetch) {
  return handle(await authFetch('/api/bookmarks'));
}

export async function addBookmark(authFetch, questionRef) {
  return handle(await authFetch('/api/bookmarks', { method: 'POST', body: JSON.stringify(questionRef) }));
}

export async function removeBookmark(authFetch, id) {
  const res = await authFetch(`/api/bookmarks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Could not remove bookmark (${res.status})`);
  }
  return true;
}

// --- Reports (question problems, solution problems, video requests) --------

export async function listMyReports(authFetch) {
  return handle(await authFetch('/api/reports/mine'));
}

export async function submitReport(authFetch, report) {
  return handle(await authFetch('/api/reports', { method: 'POST', body: JSON.stringify(report) }));
}

// --- Notifications ---------------------------------------------------------
// Created by the admin side when a report is resolved; the reader only reads
// and dismisses them.

export async function listNotifications(authFetch) {
  return handle(await authFetch('/api/notifications'));
}

export async function markAllNotificationsRead(authFetch) {
  return handle(await authFetch('/api/notifications/read', { method: 'POST' }));
}

export async function dismissNotification(authFetch, id) {
  const res = await authFetch(`/api/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Could not dismiss (${res.status})`);
  }
  return true;
}

// --- Difficulty ratings ----------------------------------------------------

export async function listMyRatings(authFetch) {
  return handle(await authFetch('/api/ratings/mine'));
}

export async function rateQuestion(authFetch, rating) {
  return handle(await authFetch('/api/ratings', { method: 'POST', body: JSON.stringify(rating) }));
}

export async function clearRating(authFetch, id) {
  const res = await authFetch(`/api/ratings/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Could not clear rating (${res.status})`);
  }
  return true;
}

export async function withdrawReport(authFetch, id) {
  const res = await authFetch(`/api/reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Could not withdraw report (${res.status})`);
  }
  return true;
}
