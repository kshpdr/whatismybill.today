// Visually unambiguous characters — no 0/O, 1/I/L
const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateInviteCode(): string {
  return Array.from(
    { length: 6 },
    () => CHARS[Math.floor(Math.random() * CHARS.length)]
  ).join("");
}
