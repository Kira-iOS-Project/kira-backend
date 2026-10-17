import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import {
  currentBudgetEditHandler,
  currentBudgetHandler,
  listWalletsHandler,
  updateCurrentBudgetHandler,
} from './finance.handler.ts';
import {
  currentBudgetEditRoute,
  currentBudgetRoute,
  updateCurrentBudgetRoute,
} from './finance.routes.budget.ts';
import { listWalletsRoute } from './finance.routes.accounts.ts';

export const financeRouter = createRouter();
financeRouter.use('/wallets', requireSession);
financeRouter.openapi(listWalletsRoute, listWalletsHandler);
financeRouter.use('/budgets/current', requireSession);
financeRouter.use('/budgets/current/edit', requireSession);
financeRouter.openapi(currentBudgetRoute, currentBudgetHandler);
financeRouter.openapi(currentBudgetEditRoute, currentBudgetEditHandler);
financeRouter.openapi(updateCurrentBudgetRoute, updateCurrentBudgetHandler);
