import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import {
  createDebtHandler,
  createWalletHandler,
  currentBudgetHandler,
  listWalletsHandler,
} from './finance.handler.ts';
import { currentBudgetRoute } from './finance.routes.budget.ts';
import { createDebtRoute, createWalletRoute, listWalletsRoute } from './finance.routes.accounts.ts';

export const financeRouter = createRouter();
financeRouter.use('/wallets', requireSession);
financeRouter.use('/debts', requireSession);
financeRouter.openapi(listWalletsRoute, listWalletsHandler);
financeRouter.use('/budgets/current', requireSession);
financeRouter.openapi(currentBudgetRoute, currentBudgetHandler);
financeRouter.openapi(createWalletRoute, createWalletHandler);
financeRouter.openapi(createDebtRoute, createDebtHandler);
