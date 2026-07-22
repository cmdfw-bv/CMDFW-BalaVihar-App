import { describe, it, expect } from 'vitest';
import { urlBase64ToUint8Array } from '../vapidKey';

describe('urlBase64ToUint8Array', () => {
  it('decodes an unpadded base64url string to its raw bytes ("Hello")', () => {
    // "SGVsbG8=" is standard-base64 "Hello"; url-safe + unpadded form is "SGVsbG8"
    const bytes = urlBase64ToUint8Array('SGVsbG8');
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
  });

  it('handles "-" and "_" url-safe substitutions', () => {
    // base64 "Pj4/Pw==" ("><?>" -> bytes 62,62,63,63... using a string that needs +/ chars)
    // "+" -> "-" and "/" -> "_" round-trip: encode bytes [251,255,191] as base64 "+/+/"-like
    // Simpler deterministic case: standard base64 "Pj4-Pw" has no +/ so use a real one.
    const standard = btoa('>>??'); // "Pj4/Pw=="
    const urlSafe = standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const bytes = urlBase64ToUint8Array(urlSafe);
    expect(new TextDecoder().decode(bytes)).toBe('>>??');
  });
});
