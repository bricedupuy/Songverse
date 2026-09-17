import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateUserDto } from "./dto/update-user.dto";

const SELECT = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  locale: true,
  displayMode: true,
  capoDisplayMode: true,
  voicingPreference: true,
  isGlobalAdmin: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(userId: string) {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId }, select: SELECT });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async updateMe(userId: string, dto: UpdateUserDto) {
    return this.prisma.client.user.update({
      where: { id: userId },
      data: { locale: dto.locale },
      select: SELECT,
    });
  }
}
