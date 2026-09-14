import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        displayMode: true,
        capoDisplayMode: true,
        voicingPreference: true,
        isGlobalAdmin: true,
      },
    });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }
}
