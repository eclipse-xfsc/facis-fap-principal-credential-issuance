function base64Url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function randomUrlSafe(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function sha256UrlSafe(value) {
  return base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
