import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const prisma = { $queryRaw: vi.fn() };
  let healthController: HealthController;

  beforeEach(async () => {
    prisma.$queryRaw.mockReset();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    healthController = app.get<HealthController>(HealthController);
  });

  it('reports db up when the query succeeds', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await expect(healthController.check()).resolves.toEqual({
      status: 'ok',
      db: 'up',
    });
  });

  it('reports db down when the query fails', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    await expect(healthController.check()).resolves.toEqual({
      status: 'ok',
      db: 'down',
    });
  });
});
