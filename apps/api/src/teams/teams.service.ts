import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { TeamRoleValue } from "@songverse/core";
import { Prisma } from "@songverse/db";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateInviteLinkDto } from "./dto/create-invite-link.dto";
import type { CreateTeamDto } from "./dto/create-team.dto";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMyTeams(userId: string) {
    const memberships = await this.prisma.client.teamMembership.findMany({
      where: { userId },
      include: { team: true },
    });
    return memberships.map((m) => ({
      id: m.team.id,
      name: m.team.name,
      slug: m.team.slug,
      description: m.team.description,
      currentUserRole: m.role,
    }));
  }

  async findOne(userId: string, teamId: string) {
    const membership = await this.prisma.client.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId } },
      include: { team: true },
    });
    if (!membership) throw new NotFoundException("Team not found");
    return {
      id: membership.team.id,
      name: membership.team.name,
      slug: membership.team.slug,
      description: membership.team.description,
      currentUserRole: membership.role,
    };
  }

  async create(userId: string, dto: CreateTeamDto) {
    const slug = dto.slug ?? slugify(dto.name);
    const team = await this.prisma.client.team
      .create({
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          memberships: {
            create: { userId, role: "ADMIN" },
          },
        },
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new ConflictException(`A team with the slug '${slug}' already exists`);
        }
        throw error;
      });
    return {
      id: team.id,
      name: team.name,
      slug: team.slug,
      description: team.description,
      currentUserRole: "ADMIN" as const,
    };
  }

  async listMembers(teamId: string) {
    const memberships = await this.prisma.client.teamMembership.findMany({
      where: { teamId },
      include: { user: { select: { id: true, displayName: true, email: true } } },
      orderBy: { joinedAt: "asc" },
    });
    return memberships.map((m) => ({
      userId: m.user.id,
      displayName: m.user.displayName,
      email: m.user.email,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }

  async updateMemberRole(teamId: string, memberUserId: string, role: TeamRoleValue) {
    const membership = await this.prisma.client.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId: memberUserId } },
    });
    if (!membership) throw new NotFoundException("Membership not found");
    if (membership.role === "ADMIN" && role !== "ADMIN") {
      await this.assertNotLastAdmin(teamId, memberUserId);
    }

    const updated = await this.prisma.client.teamMembership.update({
      where: { teamId_userId: { teamId, userId: memberUserId } },
      data: { role },
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
    return {
      userId: updated.user.id,
      displayName: updated.user.displayName,
      email: updated.user.email,
      role: updated.role,
      joinedAt: updated.joinedAt,
    };
  }

  async removeMember(teamId: string, memberUserId: string) {
    const membership = await this.prisma.client.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId: memberUserId } },
    });
    if (!membership) throw new NotFoundException("Membership not found");
    if (membership.role === "ADMIN") {
      await this.assertNotLastAdmin(teamId, memberUserId);
    }
    await this.prisma.client.teamMembership.delete({
      where: { teamId_userId: { teamId, userId: memberUserId } },
    });
  }

  leaveTeam(teamId: string, userId: string) {
    return this.removeMember(teamId, userId);
  }

  private async assertNotLastAdmin(teamId: string, excludingUserId: string): Promise<void> {
    const otherAdmins = await this.prisma.client.teamMembership.count({
      where: { teamId, role: "ADMIN", userId: { not: excludingUserId } },
    });
    if (otherAdmins === 0) {
      throw new ConflictException("A team must have at least one admin");
    }
  }

  listInviteLinks(teamId: string) {
    return this.prisma.client.teamInviteLink.findMany({
      where: { teamId },
      orderBy: { createdAt: "desc" },
    });
  }

  createInviteLink(teamId: string, dto: CreateInviteLinkDto): Promise<Prisma.TeamInviteLinkGetPayload<object>> {
    return this.prisma.client.teamInviteLink.create({
      data: {
        teamId,
        role: dto.role ?? "MEMBER",
        expiresAt: dto.expiresInDays ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000) : null,
        maxUses: dto.maxUses ?? null,
      },
    });
  }

  async revokeInviteLink(teamId: string, linkId: string): Promise<void> {
    const link = await this.prisma.client.teamInviteLink.findUnique({ where: { id: linkId } });
    if (!link || link.teamId !== teamId) throw new NotFoundException("Invite link not found");
    await this.prisma.client.teamInviteLink.delete({ where: { id: linkId } });
  }

  async joinByToken(userId: string, token: string) {
    const link = await this.prisma.client.teamInviteLink.findUnique({
      where: { token },
      include: { team: true },
    });
    if (!link) throw new NotFoundException("Invite link not found or revoked");
    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new ForbiddenException("This invite link has expired");
    }
    if (link.maxUses !== null && link.usedCount >= link.maxUses) {
      throw new ForbiddenException("This invite link has reached its usage limit");
    }

    const existing = await this.prisma.client.teamMembership.findUnique({
      where: { teamId_userId: { teamId: link.teamId, userId } },
    });
    if (existing) {
      return {
        id: link.team.id,
        name: link.team.name,
        slug: link.team.slug,
        description: link.team.description,
        currentUserRole: existing.role,
      };
    }

    await this.prisma.client.$transaction([
      this.prisma.client.teamMembership.create({
        data: { teamId: link.teamId, userId, role: link.role },
      }),
      this.prisma.client.teamInviteLink.update({
        where: { id: link.id },
        data: { usedCount: { increment: 1 } },
      }),
    ]);

    return {
      id: link.team.id,
      name: link.team.name,
      slug: link.team.slug,
      description: link.team.description,
      currentUserRole: link.role,
    };
  }
}
