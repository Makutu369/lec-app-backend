import { SignJWT, jwtVerify } from "jose";

const ALG = "HS256";
const ISSUER = "lec-app-backend";
const AUDIENCE = "lec-app-frontend";

function getSecretKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export async function signToken(
  payload: JwtPayload,
  secret: string
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime("24h")
    .sign(getSecretKey(secret));
}

export async function verifyToken(
  token: string,
  secret: string
): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getSecretKey(secret), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  return {
    sub: payload.sub as string,
    email: payload.email as string,
    role: payload.role as string,
  };
}
