// Input rules for e-mail/password sign-up. They mirror supabase/config.toml
// (minimum_password_length = 12, password_requirements = "letters_digits"); Supabase Auth
// enforces its own configured rules again on the server.
export const MIN_PASSWORD_LENGTH = 12;
export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{12,}$/;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
