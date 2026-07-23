export type DispatchVehicleType = 'MOTORBIKE' | 'CAR' | 'VAN';

export interface DispatchCandidate {
  _id: unknown;
  name?: string;
  vehicleType?: DispatchVehicleType;
  isOnline?: boolean;
  activeJobs: number;
  lastAssignmentAt?: Date | string | null;
}

export interface DispatchVehicleLimits {
  MOTORBIKE: number;
  CAR: number;
  VAN: number;
}

export function canVehicleCarry(
  vehicleType: DispatchVehicleType | undefined,
  weightKg: number,
  limits: DispatchVehicleLimits,
): boolean {
  const normalizedVehicle = vehicleType ?? 'MOTORBIKE';
  const capacity = limits[normalizedVehicle];
  return Number.isFinite(capacity) && weightKg <= capacity;
}

export function rankDispatchCandidates<T extends DispatchCandidate>(
  candidates: T[],
): T[] {
  return [...candidates].sort((left, right) => {
    const onlineDifference =
      Number(Boolean(right.isOnline)) - Number(Boolean(left.isOnline));
    if (onlineDifference !== 0) return onlineDifference;

    const workloadDifference = left.activeJobs - right.activeJobs;
    if (workloadDifference !== 0) return workloadDifference;

    const leftAssignedAt = left.lastAssignmentAt
      ? new Date(left.lastAssignmentAt).getTime()
      : 0;
    const rightAssignedAt = right.lastAssignmentAt
      ? new Date(right.lastAssignmentAt).getTime()
      : 0;
    if (leftAssignedAt !== rightAssignedAt) {
      return leftAssignedAt - rightAssignedAt;
    }

    return String(left.name ?? '').localeCompare(
      String(right.name ?? ''),
      'vi',
    );
  });
}
