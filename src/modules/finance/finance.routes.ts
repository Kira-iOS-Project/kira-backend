import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import { currentBudgetHandler, listWalletsHandler } from './finance.handler.ts';
import { currentBudgetRoute } from './finance.routes.budget.ts';
import { listWalletsRoute } from './finance.routes.accounts.ts';

export const financeRouter = createRouter();
financeRouter.use('/wallets', requireSession);
financeRouter.openapi(listWalletsRoute, listWalletsHandler);
financeRouter.use('/budgets/current', requireSession);
financeRouter.openapi(currentBudgetRoute, currentBudgetHandler);
