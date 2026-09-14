-- CreateEnum
CREATE TYPE "SongIdentifierType" AS ENUM ('CCLI', 'ISWC', 'ISRC', 'MUSICBRAINZ_WORK', 'MUSICBRAINZ_RECORDING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ImportFormat" AS ENUM ('CHORDPRO', 'CHORDS_OVER_LYRICS', 'RAW_TEXT', 'LRC', 'MUSICXML', 'ABC_NOTATION');

-- CreateEnum
CREATE TYPE "InstrumentType" AS ENUM ('GUITAR_STANDARD', 'GUITAR_ALTERNATE', 'BASS_STANDARD', 'UKULELE_STANDARD', 'PIANO');

-- CreateEnum
CREATE TYPE "VoicingPreference" AS ENUM ('OPEN', 'BARRE', 'DROP2', 'CLOSE', 'AUTO');

-- CreateEnum
CREATE TYPE "CapoDisplayMode" AS ENUM ('SOUNDING', 'FINGERED');

-- CreateEnum
CREATE TYPE "MidiEventType" AS ENUM ('PROGRAM_CHANGE', 'CONTROL_CHANGE');

-- CreateEnum
CREATE TYPE "TagScope" AS ENUM ('GLOBAL', 'USER', 'TEAM');

-- CreateEnum
CREATE TYPE "OwnershipScope" AS ENUM ('GLOBAL', 'TEAM', 'USER');

-- CreateEnum
CREATE TYPE "PublicationState" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CHANGES', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VersionRelationshipType" AS ENUM ('ORIGINAL', 'DIRECT_TRANSLATION', 'SINGABLE_ADAPTATION', 'LYRICAL_ADAPTATION', 'ALTERNATE_VERSION', 'SIMPLIFIED_VERSION', 'LIVE_VERSION', 'UNKNOWN_ORIGIN');

-- CreateEnum
CREATE TYPE "ContributorRole" AS ENUM ('AUTHOR', 'COMPOSER', 'LYRICIST', 'TRANSLATOR', 'ADAPTOR', 'ARRANGER', 'PERFORMER');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('MEMBER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubmissionState" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CHANGES', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ProposalState" AS ENUM ('OPEN', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'PARTIALLY_APPLIED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ProposalType" AS ENUM ('TYPO_FIX', 'LYRIC_FIX', 'CHORD_CORRECTION', 'METADATA_UPDATE', 'STRUCTURE_UPDATE', 'TRANSLATION_LINK', 'FULL_REVISION');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('PDF', 'CHORDPRO', 'MUSICXML', 'ABC_NOTATION', 'TEXT', 'IMAGE', 'AUDIO', 'OTHER');

-- CreateEnum
CREATE TYPE "DisplayMode" AS ENUM ('SINGER', 'GUITAR', 'PIANO', 'UKULELE', 'LEADER', 'DRUMMER');

-- CreateEnum
CREATE TYPE "NoteScope" AS ENUM ('USER', 'TEAM', 'SETLIST_ITEM');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'PROMOTED_TO_GLOBAL', 'ARRANGEMENT_FROZEN', 'PROPOSAL_ACCEPTED', 'PROPOSAL_REJECTED', 'MEMBER_INVITED', 'MEMBER_JOINED', 'MEMBER_REMOVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isGlobalAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "displayMode" "DisplayMode" NOT NULL DEFAULT 'GUITAR',
    "capoDisplayMode" "CapoDisplayMode" NOT NULL DEFAULT 'SOUNDING',
    "voicingPreference" "VoicingPreference" NOT NULL DEFAULT 'AUTO',
    "pedalMappingJson" JSONB,
    "midiOutputDevice" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "idToken" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMembership" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamInviteLink" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "maxUses" INTEGER,

    CONSTRAINT "TeamInviteLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "preferredOriginalVersionId" TEXT,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkIdentifier" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "type" "SongIdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isGlobal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TagCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "scope" "TagScope" NOT NULL DEFAULT 'GLOBAL',
    "ownerUserId" TEXT,
    "ownerTeamId" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTag" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongVersionTag" (
    "id" TEXT NOT NULL,
    "songVersionId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "inherited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongVersionTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongVersion" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerScope" "OwnershipScope" NOT NULL DEFAULT 'USER',
    "ownerUserId" TEXT,
    "ownerTeamId" TEXT,
    "publicationState" "PublicationState" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "alternateTitle" TEXT,
    "language" TEXT NOT NULL,
    "trustLabel" TEXT,
    "copyright" TEXT,
    "copyrightYear" INTEGER,
    "publisher" TEXT,
    "ccli" TEXT,
    "documentJson" JSONB NOT NULL,
    "chordproCache" TEXT,
    "chordproCacheAt" TIMESTAMP(3),
    "relationshipType" "VersionRelationshipType",
    "parentVersionId" TEXT,
    "defaultGrooveStyleId" TEXT,
    "defaultGrooveVariant" TEXT,

    CONSTRAINT "SongVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersionContributor" (
    "id" TEXT NOT NULL,
    "songVersionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roles" "ContributorRole"[],
    "source" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersionContributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongVersionIdentifier" (
    "id" TEXT NOT NULL,
    "songVersionId" TEXT NOT NULL,
    "type" "SongIdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SongVersionIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Arrangement" (
    "id" TEXT NOT NULL,
    "songVersionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerScope" "OwnershipScope" NOT NULL DEFAULT 'USER',
    "ownerUserId" TEXT,
    "ownerTeamId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "documentJson" JSONB NOT NULL,
    "guitarTuningPresetId" TEXT,
    "frozenAt" TIMESTAMP(3),
    "frozenReason" TEXT,

    CONSTRAINT "Arrangement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setlist" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "eventDate" TIMESTAMP(3),
    "ownerUserId" TEXT,
    "ownerTeamId" TEXT,

    CONSTRAINT "Setlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetlistItem" (
    "id" TEXT NOT NULL,
    "setlistId" TEXT NOT NULL,
    "songVersionId" TEXT,
    "arrangementId" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "keyOverride" TEXT,
    "tempoOverride" INTEGER,
    "notes" TEXT,

    CONSTRAINT "SetlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Songbook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,
    "language" TEXT,
    "publisher" TEXT,
    "year" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Songbook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongbookEntry" (
    "id" TEXT NOT NULL,
    "songVersionId" TEXT NOT NULL,
    "songbookId" TEXT NOT NULL,
    "entryCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongbookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "songVersionId" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "scope" "NoteScope" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "songVersionId" TEXT,
    "arrangementId" TEXT,
    "setlistId" TEXT,
    "setlistItemId" TEXT,
    "teamId" TEXT,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "songVersionId" TEXT NOT NULL,
    "submitterId" TEXT NOT NULL,
    "state" "SubmissionState" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submitterMessage" TEXT,
    "duplicateReason" TEXT,
    "reviewerId" TEXT,
    "reviewNotes" TEXT,
    "mergeTargetId" TEXT,
    "similarityResults" JSONB,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeProposal" (
    "id" TEXT NOT NULL,
    "songVersionId" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "state" "ProposalState" NOT NULL DEFAULT 'OPEN',
    "type" "ProposalType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "proposedChange" JSONB NOT NULL,
    "reviewerId" TEXT,
    "reviewNotes" TEXT,

    CONSTRAINT "ChangeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpstreamLink" (
    "id" TEXT NOT NULL,
    "localVersionId" TEXT NOT NULL,
    "globalVersionId" TEXT NOT NULL,
    "forkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),
    "hasUpstreamChanges" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UpstreamLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessGrant" (
    "id" TEXT NOT NULL,
    "songVersionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "grantedByUserId" TEXT NOT NULL,
    "grantedToUserId" TEXT,
    "grantedToTeamId" TEXT,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canDownload" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "songVersionId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "canDownload" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "teamId" TEXT,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InkAnnotation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "songVersionId" TEXT,
    "arrangementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "anchorType" TEXT NOT NULL,
    "anchorId" TEXT NOT NULL,
    "geometryJson" JSONB NOT NULL,

    CONSTRAINT "InkAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TuningPreset" (
    "id" TEXT NOT NULL,
    "instrument" "InstrumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "notes" TEXT[],
    "isStandard" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TuningPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChordVoicing" (
    "id" TEXT NOT NULL,
    "instrument" "InstrumentType" NOT NULL,
    "root" TEXT NOT NULL,
    "suffix" TEXT NOT NULL,
    "tuningPresetId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "source" TEXT NOT NULL DEFAULT 'chords-db',
    "frets" INTEGER[],
    "fingers" INTEGER[],
    "barres" INTEGER[],
    "baseFret" INTEGER NOT NULL DEFAULT 1,
    "isCapo" BOOLEAN NOT NULL DEFAULT false,
    "pianoKeys" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChordVoicing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceFormat" "ImportFormat" NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "rawContent" TEXT,
    "draftVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrooveCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrooveCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrooveStyle" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "timeSignature" TEXT NOT NULL DEFAULT '4/4',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrooveStyle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroovePattern" (
    "id" TEXT NOT NULL,
    "styleId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "patternJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroovePattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArrangementGroove" (
    "id" TEXT NOT NULL,
    "arrangementId" TEXT NOT NULL,
    "arrangementItemId" TEXT NOT NULL,
    "grooveStyleId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "tempoRelative" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArrangementGroove_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserArrangementMidi" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "arrangementId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "itemTriggersJson" JSONB NOT NULL,

    CONSTRAINT "UserArrangementMidi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "songVersionId" TEXT,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");

-- CreateIndex
CREATE INDEX "Team_slug_idx" ON "Team"("slug");

-- CreateIndex
CREATE INDEX "TeamMembership_teamId_idx" ON "TeamMembership"("teamId");

-- CreateIndex
CREATE INDEX "TeamMembership_userId_idx" ON "TeamMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMembership_teamId_userId_key" ON "TeamMembership"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamInviteLink_token_key" ON "TeamInviteLink"("token");

-- CreateIndex
CREATE INDEX "TeamInviteLink_token_idx" ON "TeamInviteLink"("token");

-- CreateIndex
CREATE INDEX "TeamInviteLink_teamId_idx" ON "TeamInviteLink"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Work_preferredOriginalVersionId_key" ON "Work"("preferredOriginalVersionId");

-- CreateIndex
CREATE INDEX "WorkIdentifier_workId_idx" ON "WorkIdentifier"("workId");

-- CreateIndex
CREATE INDEX "WorkIdentifier_type_value_idx" ON "WorkIdentifier"("type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "WorkIdentifier_workId_type_key" ON "WorkIdentifier"("workId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "TagCategory_slug_key" ON "TagCategory"("slug");

-- CreateIndex
CREATE INDEX "TagCategory_slug_idx" ON "TagCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "Tag_categoryId_idx" ON "Tag"("categoryId");

-- CreateIndex
CREATE INDEX "Tag_scope_idx" ON "Tag"("scope");

-- CreateIndex
CREATE INDEX "Tag_ownerUserId_idx" ON "Tag"("ownerUserId");

-- CreateIndex
CREATE INDEX "Tag_ownerTeamId_idx" ON "Tag"("ownerTeamId");

-- CreateIndex
CREATE INDEX "WorkTag_workId_idx" ON "WorkTag"("workId");

-- CreateIndex
CREATE INDEX "WorkTag_tagId_idx" ON "WorkTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTag_workId_tagId_key" ON "WorkTag"("workId", "tagId");

-- CreateIndex
CREATE INDEX "SongVersionTag_songVersionId_idx" ON "SongVersionTag"("songVersionId");

-- CreateIndex
CREATE INDEX "SongVersionTag_tagId_idx" ON "SongVersionTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "SongVersionTag_songVersionId_tagId_key" ON "SongVersionTag"("songVersionId", "tagId");

-- CreateIndex
CREATE INDEX "SongVersion_workId_idx" ON "SongVersion"("workId");

-- CreateIndex
CREATE INDEX "SongVersion_ownerUserId_idx" ON "SongVersion"("ownerUserId");

-- CreateIndex
CREATE INDEX "SongVersion_ownerTeamId_idx" ON "SongVersion"("ownerTeamId");

-- CreateIndex
CREATE INDEX "SongVersion_ownerScope_publicationState_idx" ON "SongVersion"("ownerScope", "publicationState");

-- CreateIndex
CREATE INDEX "SongVersion_language_idx" ON "SongVersion"("language");

-- CreateIndex
CREATE INDEX "SongVersion_ccli_idx" ON "SongVersion"("ccli");

-- CreateIndex
CREATE INDEX "VersionContributor_songVersionId_idx" ON "VersionContributor"("songVersionId");

-- CreateIndex
CREATE INDEX "VersionContributor_userId_idx" ON "VersionContributor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VersionContributor_songVersionId_userId_key" ON "VersionContributor"("songVersionId", "userId");

-- CreateIndex
CREATE INDEX "SongVersionIdentifier_songVersionId_idx" ON "SongVersionIdentifier"("songVersionId");

-- CreateIndex
CREATE INDEX "SongVersionIdentifier_type_value_idx" ON "SongVersionIdentifier"("type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "SongVersionIdentifier_songVersionId_type_key" ON "SongVersionIdentifier"("songVersionId", "type");

-- CreateIndex
CREATE INDEX "Arrangement_songVersionId_idx" ON "Arrangement"("songVersionId");

-- CreateIndex
CREATE INDEX "Arrangement_ownerUserId_idx" ON "Arrangement"("ownerUserId");

-- CreateIndex
CREATE INDEX "Arrangement_ownerTeamId_idx" ON "Arrangement"("ownerTeamId");

-- CreateIndex
CREATE INDEX "Arrangement_frozenAt_idx" ON "Arrangement"("frozenAt");

-- CreateIndex
CREATE INDEX "Arrangement_guitarTuningPresetId_idx" ON "Arrangement"("guitarTuningPresetId");

-- CreateIndex
CREATE INDEX "Setlist_ownerUserId_idx" ON "Setlist"("ownerUserId");

-- CreateIndex
CREATE INDEX "Setlist_ownerTeamId_idx" ON "Setlist"("ownerTeamId");

-- CreateIndex
CREATE INDEX "SetlistItem_setlistId_position_idx" ON "SetlistItem"("setlistId", "position");

-- CreateIndex
CREATE INDEX "SongbookEntry_songbookId_entryCode_idx" ON "SongbookEntry"("songbookId", "entryCode");

-- CreateIndex
CREATE UNIQUE INDEX "SongbookEntry_songVersionId_songbookId_key" ON "SongbookEntry"("songVersionId", "songbookId");

-- CreateIndex
CREATE INDEX "Attachment_songVersionId_idx" ON "Attachment"("songVersionId");

-- CreateIndex
CREATE INDEX "Note_authorUserId_idx" ON "Note"("authorUserId");

-- CreateIndex
CREATE INDEX "Note_songVersionId_idx" ON "Note"("songVersionId");

-- CreateIndex
CREATE INDEX "Note_arrangementId_idx" ON "Note"("arrangementId");

-- CreateIndex
CREATE INDEX "Note_setlistItemId_idx" ON "Note"("setlistItemId");

-- CreateIndex
CREATE INDEX "Submission_songVersionId_idx" ON "Submission"("songVersionId");

-- CreateIndex
CREATE INDEX "Submission_submitterId_idx" ON "Submission"("submitterId");

-- CreateIndex
CREATE INDEX "Submission_state_idx" ON "Submission"("state");

-- CreateIndex
CREATE INDEX "ChangeProposal_songVersionId_idx" ON "ChangeProposal"("songVersionId");

-- CreateIndex
CREATE INDEX "ChangeProposal_proposerId_idx" ON "ChangeProposal"("proposerId");

-- CreateIndex
CREATE INDEX "ChangeProposal_state_idx" ON "ChangeProposal"("state");

-- CreateIndex
CREATE INDEX "UpstreamLink_globalVersionId_idx" ON "UpstreamLink"("globalVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "UpstreamLink_localVersionId_globalVersionId_key" ON "UpstreamLink"("localVersionId", "globalVersionId");

-- CreateIndex
CREATE INDEX "AccessGrant_songVersionId_idx" ON "AccessGrant"("songVersionId");

-- CreateIndex
CREATE INDEX "AccessGrant_grantedToTeamId_idx" ON "AccessGrant"("grantedToTeamId");

-- CreateIndex
CREATE INDEX "AccessGrant_grantedToUserId_idx" ON "AccessGrant"("grantedToUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");

-- CreateIndex
CREATE INDEX "ShareLink_token_idx" ON "ShareLink"("token");

-- CreateIndex
CREATE INDEX "ShareLink_songVersionId_idx" ON "ShareLink"("songVersionId");

-- CreateIndex
CREATE INDEX "InkAnnotation_userId_idx" ON "InkAnnotation"("userId");

-- CreateIndex
CREATE INDEX "InkAnnotation_songVersionId_idx" ON "InkAnnotation"("songVersionId");

-- CreateIndex
CREATE INDEX "InkAnnotation_arrangementId_idx" ON "InkAnnotation"("arrangementId");

-- CreateIndex
CREATE UNIQUE INDEX "TuningPreset_slug_key" ON "TuningPreset"("slug");

-- CreateIndex
CREATE INDEX "TuningPreset_instrument_idx" ON "TuningPreset"("instrument");

-- CreateIndex
CREATE INDEX "TuningPreset_slug_idx" ON "TuningPreset"("slug");

-- CreateIndex
CREATE INDEX "ChordVoicing_instrument_root_suffix_idx" ON "ChordVoicing"("instrument", "root", "suffix");

-- CreateIndex
CREATE INDEX "ChordVoicing_instrument_root_suffix_tuningPresetId_idx" ON "ChordVoicing"("instrument", "root", "suffix", "tuningPresetId");

-- CreateIndex
CREATE INDEX "ChordVoicing_instrument_isDefault_idx" ON "ChordVoicing"("instrument", "isDefault");

-- CreateIndex
CREATE INDEX "ChordVoicing_source_idx" ON "ChordVoicing"("source");

-- CreateIndex
CREATE INDEX "ImportJob_userId_idx" ON "ImportJob"("userId");

-- CreateIndex
CREATE INDEX "ImportJob_state_idx" ON "ImportJob"("state");

-- CreateIndex
CREATE UNIQUE INDEX "GrooveCategory_slug_key" ON "GrooveCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "GrooveStyle_slug_key" ON "GrooveStyle"("slug");

-- CreateIndex
CREATE INDEX "GrooveStyle_categoryId_idx" ON "GrooveStyle"("categoryId");

-- CreateIndex
CREATE INDEX "GroovePattern_styleId_idx" ON "GroovePattern"("styleId");

-- CreateIndex
CREATE UNIQUE INDEX "GroovePattern_styleId_variant_key" ON "GroovePattern"("styleId", "variant");

-- CreateIndex
CREATE INDEX "ArrangementGroove_arrangementId_idx" ON "ArrangementGroove"("arrangementId");

-- CreateIndex
CREATE UNIQUE INDEX "ArrangementGroove_arrangementId_arrangementItemId_key" ON "ArrangementGroove"("arrangementId", "arrangementItemId");

-- CreateIndex
CREATE INDEX "UserArrangementMidi_userId_idx" ON "UserArrangementMidi"("userId");

-- CreateIndex
CREATE INDEX "UserArrangementMidi_arrangementId_idx" ON "UserArrangementMidi"("arrangementId");

-- CreateIndex
CREATE UNIQUE INDEX "UserArrangementMidi_userId_arrangementId_key" ON "UserArrangementMidi"("userId", "arrangementId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditEvent_songVersionId_idx" ON "AuditEvent"("songVersionId");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamInviteLink" ADD CONSTRAINT "TeamInviteLink_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_preferredOriginalVersionId_fkey" FOREIGN KEY ("preferredOriginalVersionId") REFERENCES "SongVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkIdentifier" ADD CONSTRAINT "WorkIdentifier_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TagCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_ownerTeamId_fkey" FOREIGN KEY ("ownerTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTag" ADD CONSTRAINT "WorkTag_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTag" ADD CONSTRAINT "WorkTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersionTag" ADD CONSTRAINT "SongVersionTag_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersionTag" ADD CONSTRAINT "SongVersionTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersion" ADD CONSTRAINT "SongVersion_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersion" ADD CONSTRAINT "SongVersion_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersion" ADD CONSTRAINT "SongVersion_ownerTeamId_fkey" FOREIGN KEY ("ownerTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersion" ADD CONSTRAINT "SongVersion_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "SongVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionContributor" ADD CONSTRAINT "VersionContributor_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionContributor" ADD CONSTRAINT "VersionContributor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVersionIdentifier" ADD CONSTRAINT "SongVersionIdentifier_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Arrangement" ADD CONSTRAINT "Arrangement_guitarTuningPresetId_fkey" FOREIGN KEY ("guitarTuningPresetId") REFERENCES "TuningPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Arrangement" ADD CONSTRAINT "Arrangement_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Arrangement" ADD CONSTRAINT "Arrangement_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Arrangement" ADD CONSTRAINT "Arrangement_ownerTeamId_fkey" FOREIGN KEY ("ownerTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetlistItem" ADD CONSTRAINT "SetlistItem_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "Setlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetlistItem" ADD CONSTRAINT "SetlistItem_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetlistItem" ADD CONSTRAINT "SetlistItem_arrangementId_fkey" FOREIGN KEY ("arrangementId") REFERENCES "Arrangement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongbookEntry" ADD CONSTRAINT "SongbookEntry_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongbookEntry" ADD CONSTRAINT "SongbookEntry_songbookId_fkey" FOREIGN KEY ("songbookId") REFERENCES "Songbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_arrangementId_fkey" FOREIGN KEY ("arrangementId") REFERENCES "Arrangement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "Setlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_setlistItemId_fkey" FOREIGN KEY ("setlistItemId") REFERENCES "SetlistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeProposal" ADD CONSTRAINT "ChangeProposal_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeProposal" ADD CONSTRAINT "ChangeProposal_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpstreamLink" ADD CONSTRAINT "UpstreamLink_localVersionId_fkey" FOREIGN KEY ("localVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpstreamLink" ADD CONSTRAINT "UpstreamLink_globalVersionId_fkey" FOREIGN KEY ("globalVersionId") REFERENCES "SongVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessGrant" ADD CONSTRAINT "AccessGrant_grantedToTeamId_fkey" FOREIGN KEY ("grantedToTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InkAnnotation" ADD CONSTRAINT "InkAnnotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChordVoicing" ADD CONSTRAINT "ChordVoicing_tuningPresetId_fkey" FOREIGN KEY ("tuningPresetId") REFERENCES "TuningPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_draftVersionId_fkey" FOREIGN KEY ("draftVersionId") REFERENCES "SongVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrooveStyle" ADD CONSTRAINT "GrooveStyle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GrooveCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroovePattern" ADD CONSTRAINT "GroovePattern_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "GrooveStyle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArrangementGroove" ADD CONSTRAINT "ArrangementGroove_arrangementId_fkey" FOREIGN KEY ("arrangementId") REFERENCES "Arrangement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArrangementGroove" ADD CONSTRAINT "ArrangementGroove_grooveStyleId_fkey" FOREIGN KEY ("grooveStyleId") REFERENCES "GrooveStyle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserArrangementMidi" ADD CONSTRAINT "UserArrangementMidi_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserArrangementMidi" ADD CONSTRAINT "UserArrangementMidi_arrangementId_fkey" FOREIGN KEY ("arrangementId") REFERENCES "Arrangement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_songVersionId_fkey" FOREIGN KEY ("songVersionId") REFERENCES "SongVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
