import { SignJWT, jwtVerify } from "jose";
function getSecret() {
    if (!process.env.JWT_SECRET)
        throw new Error("JWT_SECRET is required");
    return new TextEncoder().encode(process.env.JWT_SECRET);
}
export async function signToken(userId, email) {
    return new SignJWT({ email })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(userId)
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(getSecret());
}
export async function verifyToken(token) {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub)
        throw new Error("Token missing subject");
    return { sub: payload.sub, email: payload["email"] };
}
//# sourceMappingURL=jwt.js.map