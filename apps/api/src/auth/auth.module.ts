import { Global, Module } from "@nestjs/common";
import { AuthConfigController } from "./auth-config.controller.js";
import { JwtVerifierService } from "./jwt-verifier.service.js";

@Global()
@Module({
  controllers: [AuthConfigController],
  providers: [JwtVerifierService],
  exports: [JwtVerifierService],
})
export class AuthModule {}
