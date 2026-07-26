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
