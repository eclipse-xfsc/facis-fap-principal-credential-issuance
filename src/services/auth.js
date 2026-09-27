import { api } from "./api.js";
import { runtime } from "../config/runtime.js";
import { randomUrlSafe, sha256UrlSafe } from "../utils/pkce.js";

const PREFIX = "fap-pci-oidc";

export async function beginLogin() {
  const config = await api.authConfig();
  const verifier = randomUrlSafe(48);
  const challenge = await sha256UrlSafe(verifier);
  const state = randomUrlSafe(24);
  const nonce = randomUrlSafe(24);
  sessionStorage.setItem(`${PREFIX}:verifier`, verifier);
  sessionStorage.setItem(`${PREFIX}:state`, state);
  sessionStorage.setItem(`${PREFIX}:nonce`, nonce);
  sessionStorage.setItem(`${PREFIX}:redirectUri`, config.redirectUri);
  sessionStorage.setItem(`${PREFIX}:returnHash`, window.location.hash || "");
  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope || "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  window.location.assign(url.toString());
}

export async function completeLoginFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const returnedState = params.get("state");
  if (!code) return null;
  const state = sessionStorage.getItem(`${PREFIX}:state`);
  const verifier = sessionStorage.getItem(`${PREFIX}:verifier`);
  const nonce = sessionStorage.getItem(`${PREFIX}:nonce`);
  const storedRedirectUri = sessionStorage.getItem(`${PREFIX}:redirectUri`);
  if (!state || state !== returnedState || !verifier || !nonce || !storedRedirectUri) throw new Error("OIDC state validation failed.");
  const config = await api.authConfig();
  if (config.redirectUri !== storedRedirectUri) throw new Error("OIDC redirect URI changed during authentication.");
  const returnHash = sessionStorage.getItem(`${PREFIX}:returnHash`) || "";
  const result = await api.authExchange({ code, state, nonce, verifier, redirectUri: config.redirectUri });
  for (const key of ["state", "verifier", "nonce", "redirectUri", "returnHash"]) sessionStorage.removeItem(`${PREFIX}:${key}`);
  window.history.replaceState({}, document.title, `${runtime.uiPath}${returnHash}`);
  return result;
}
