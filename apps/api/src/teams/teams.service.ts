import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
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

  async create(userId: string, dto: CreateTeamDto) {
    const slug = dto.slug ?? slugify(dto.name);
    const team = await this.prisma.client.team.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        memberships: {
          create: { userId, role: "ADMIN" },
        },
      },
    });
    return {
      id: team.id,
      name: team.name,
      slug: team.slug,
      description: team.description,
      currentUserRole: "ADMIN" as const,
    };
  }
}
