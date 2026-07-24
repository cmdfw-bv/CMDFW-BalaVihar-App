export function magicLinkCopy(sent: boolean, email: string): { heading: string; body: string } {
  if (sent) return { heading: 'Check your email', body: `We sent a sign-in link to ${email}.` };
  return { heading: 'Sign in', body: 'Enter your email and we’ll send you a magic link.' };
}
