async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
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

export async function withdrawReport(authFetch, id) {
  const res = await authFetch(`/api/reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Could not withdraw report (${res.status})`);
  }
  return true;
}
