/**
 * CSRF Token Management
 *
 * The backend generates CSRF tokens on GET requests.
 * Frontend must send the token in X-CSRF-Token header for POST/PUT/DELETE.
 */

let csrfToken = null;

export function setCSRFToken(token) {
  csrfToken = token;
}

export function getCSRFToken() {
  return csrfToken;
}

export function clearCSRFToken() {
  csrfToken = null;
}
