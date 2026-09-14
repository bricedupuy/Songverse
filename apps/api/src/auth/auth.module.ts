import { Global, Module } from "@nestjs/common";
import { JwtVerifierService } from "./jwt-verifier.service";

@Global()
@Module({
  providers: [JwtVerifierService],
  exports: [JwtVerifierService],
})
export class AuthModule {}
