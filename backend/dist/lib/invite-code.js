// Visually unambiguous characters — no 0/O, 1/I/L
const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateInviteCode() {
    return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
}
//# sourceMappingURL=invite-code.js.map