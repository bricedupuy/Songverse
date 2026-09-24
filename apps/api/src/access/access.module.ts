import { Global, Module } from "@nestjs/common";
import { AccessPolicyService } from "./access-policy.service";

/** Makes the access rules (AccessPolicyService) available to every guard and service. */
@Global()
@Module({
  providers: [AccessPolicyService],
  exports: [AccessPolicyService],
})
export class AccessModule {}
