-- Sign-up by invitation only (issue #198).
ALTER TABLE "SecuritySettings" ADD COLUMN "signupInviteOnly" BOOLEAN;

CREATE TABLE "SignupInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "SignupInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SignupInvitation_email_key" ON "SignupInvitation"("email");
CREATE UNIQUE INDEX "SignupInvitation_token_key" ON "SignupInvitation"("token");
CREATE INDEX "SignupInvitation_invitedById_idx" ON "SignupInvitation"("invitedById");

ALTER TABLE "SignupInvitation" ADD CONSTRAINT "SignupInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
