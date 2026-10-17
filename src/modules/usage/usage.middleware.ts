/**
 * The Kira Plus gate of a route: a person whose plan lacks `feature` gets 403
 * PLAN_FEATURE_UNAVAILABLE before the handler runs. Mounted after `requireSession`.
 */

import type { PlanFeature } from '../../lib/constants/plans.ts';
import { factory } from '../../lib/server/factory.ts';
import { requirePlanFeature } from './usage.service.ts';

export const planFeatureGate = (feature: PlanFeature) =>
  factory.createMiddleware(async (c, next) => {
    await requirePlanFeature(c.get('userId'), feature);
    await next();
  });
