import { SignJWT, jwtVerify } from "jose";

const ALG = "HS256";

function getSecretKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export interface JwtPayload {
  sub: string;       // user id
  email: string;
  role: string;
}

/**
 * Sign a JWT token that expires in 7 days.
 */
export async function signToken(
  payload: JwtPayload,
  secret: string
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey(secret));
}

/**
 * Verify a JWT token and return the payload.
 */
export async function verifyToken(
  token: string,
  secret: string
): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getSecretKey(secret));
  return payload as unknown as JwtPayload;
}
