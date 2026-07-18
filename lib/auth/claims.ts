export interface AuthClaims {
  activeRole: string | null;
  scopeType: string | null;
  scopeId: string | null;
}

const EMPTY_CLAIMS: AuthClaims = { activeRole: null, scopeType: null, scopeId: null };
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Zero-dependency base64url decode — RN's Hermes engine has no built-in atob/btoa, so this
// avoids relying on a global that may not exist on-device (TextDecoder is available in both
// Hermes and Node, decoding is not).
function base64UrlToBytes(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of base64) {
    const value = BASE64_CHARS.indexOf(char);
    if (value === -1) continue; // skip padding/whitespace
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

// The claim shape is fully owned/guaranteed by auth-hook-and-identity — no schema/validation
// library is warranted for parsing three known keys (Design spec, "Claims decoding").
export function decodeClaims(accessToken: string): AuthClaims {
  const parts = accessToken.split('.');
  if (parts.length !== 3) return EMPTY_CLAIMS;
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(parts[1]));
    const payload = JSON.parse(json) as Record<string, unknown>;
    return {
      activeRole: typeof payload.active_role === 'string' ? payload.active_role : null,
      scopeType: typeof payload.scope_type === 'string' ? payload.scope_type : null,
      scopeId: typeof payload.scope_id === 'string' ? payload.scope_id : null,
    };
  } catch {
    return EMPTY_CLAIMS;
  }
}
