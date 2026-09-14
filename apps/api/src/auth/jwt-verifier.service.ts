import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface BetterAuthJwtPayload extends JWTPayload {
  email?: string;
  isGlobalAdmin?: boolean;
}

/**
 * Verifies JWTs issued by BetterAuth's JWT plugin (apps/web) against its
 * published JWKS. BetterAuth owns issuance and session cookies; the API
 * only ever verifies — it never mints tokens itself.
 */
@Injectable()
export class JwtVerifierService {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;

  constructor(private readonly config: ConfigService) {
    this.issuer = this.config.getOrThrow<string>("AUTH_URL");
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/api/auth/jwks`));
  }

  async verify(token: string): Promise<BetterAuthJwtPayload> {
    try {
      const { payload } = await jwtVerify<BetterAuthJwtPayload>(token, this.jwks, {
        issuer: this.issuer,
      });
      return payload;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
