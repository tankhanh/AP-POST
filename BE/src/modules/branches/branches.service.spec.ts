import { NotFoundException } from '@nestjs/common';
import { BranchesService } from './branches.service';

describe('BranchesService soft delete', () => {
  const updateOne = jest.fn();
  const service = new BranchesService({ updateOne } as never);

  beforeEach(() => updateOne.mockReset());

  it('soft-deletes atomically and records the actor', async () => {
    updateOne.mockResolvedValue({ modifiedCount: 1 });

    await expect(
      service.remove('64fbc1bba5f08b4a6df8a123', {
        _id: '64fbc1bba5f08b4a6df8a124',
        email: 'admin@example.com',
      }),
    ).resolves.toEqual({ message: 'Đã xóa (soft delete) chi nhánh' });

    expect(updateOne).toHaveBeenCalledWith(
      { _id: '64fbc1bba5f08b4a6df8a123', isDeleted: { $ne: true } },
      expect.objectContaining({
        $set: expect.objectContaining({
          isDeleted: true,
          deletedBy: {
            _id: '64fbc1bba5f08b4a6df8a124',
            email: 'admin@example.com',
          },
        }),
      }),
    );
  });

  it('reports an already deleted or missing branch', async () => {
    updateOne.mockResolvedValue({ modifiedCount: 0 });
    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('restores only deleted branches and clears deletion metadata', async () => {
    updateOne.mockResolvedValue({ modifiedCount: 1 });
    await service.restore('64fbc1bba5f08b4a6df8a123');

    expect(updateOne).toHaveBeenCalledWith(
      { _id: '64fbc1bba5f08b4a6df8a123', isDeleted: true },
      {
        $set: { isDeleted: false },
        $unset: { deletedAt: 1, deletedBy: 1 },
      },
    );
  });
});
