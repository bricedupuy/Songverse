import { Global, Module } from "@nestjs/common";
import { AuthConfigController } from "./auth-config.controller";
import { JwtVerifierService } from "./jwt-verifier.service";

@Global()
@Module({
  controllers: [AuthConfigController],
  providers: [JwtVerifierService],
  exports: [JwtVerifierService],
})
export class AuthModule {}
