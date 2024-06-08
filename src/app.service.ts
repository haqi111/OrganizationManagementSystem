import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  getHello(): string {
    return 'Hello Nest!';
  }

  /*users() {
    return this.prisma.users.findMany();
  }

  user(userId: string) {
    return this.prisma.users.findFirstOrThrow({
      where: { id: userId },
    });
  }*/
}
