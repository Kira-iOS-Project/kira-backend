import { ForbiddenError } from '../../lib/errors/errors.ts';

/** Input suara, Impor Mutasi, Riwayat Skor and Portofolio are Kira Plus features (Paket). */
export class PlanFeatureUnavailableError extends ForbiddenError {
  constructor(feature: string) {
    super('This feature is part of Kira Plus.', feature, 'PLAN_FEATURE_UNAVAILABLE');
  }
}
