import {
  canVehicleCarry,
  rankDispatchCandidates,
} from './shipper-dispatch.policy';

describe('shipper dispatch policy', () => {
  const limits = { MOTORBIKE: 30, CAR: 300, VAN: 1000 };

  it('rejects a vehicle that cannot carry the order weight', () => {
    expect(canVehicleCarry('MOTORBIKE', 31, limits)).toBe(false);
    expect(canVehicleCarry('CAR', 31, limits)).toBe(true);
  });

  it('prefers online shippers, then balances active workload', () => {
    const ranked = rankDispatchCandidates([
      { _id: 'offline', name: 'A', isOnline: false, activeJobs: 0 },
      { _id: 'busy', name: 'B', isOnline: true, activeJobs: 4 },
      { _id: 'free', name: 'C', isOnline: true, activeJobs: 1 },
    ]);

    expect(ranked.map((candidate) => candidate._id)).toEqual([
      'free',
      'busy',
      'offline',
    ]);
  });

  it('gives the longest-idle shipper the next equal-load job', () => {
    const ranked = rankDispatchCandidates([
      {
        _id: 'recent',
        name: 'Recent',
        isOnline: true,
        activeJobs: 1,
        lastAssignmentAt: '2026-07-22T08:00:00.000Z',
      },
      {
        _id: 'idle',
        name: 'Idle',
        isOnline: true,
        activeJobs: 1,
        lastAssignmentAt: '2026-07-21T08:00:00.000Z',
      },
    ]);

    expect(ranked[0]._id).toBe('idle');
  });
});
