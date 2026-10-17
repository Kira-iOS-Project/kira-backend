import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import {
  createDebtHandler,
  createWalletHandler,
  currentBudgetHandler,
  getDebtHandler,
  listWalletsHandler,
  saveBudgetHandler,
} from './finance.handler.ts';
import {
  createBillHandler,
  deleteBillHandler,
  listBillsHandler,
  updateBillHandler,
} from './finance.bills.handler.ts';
import { currentBudgetRoute, saveBudgetRoute } from './finance.routes.budget.ts';
import { getDebtRoute } from './finance.routes.debt.ts';
import {
  createBillRoute,
  deleteBillRoute,
  listBillsRoute,
  updateBillRoute,
} from './finance.routes.bills.ts';
import { createDebtRoute, createWalletRoute, listWalletsRoute } from './finance.routes.accounts.ts';

export const financeRouter = createRouter();
financeRouter.use('/wallets', requireSession);
financeRouter.use('/debts', requireSession);
financeRouter.use('/debts/*', requireSession);
financeRouter.openapi(listWalletsRoute, listWalletsHandler);
financeRouter.use('/budgets/current', requireSession);
financeRouter.openapi(currentBudgetRoute, currentBudgetHandler);
financeRouter.openapi(saveBudgetRoute, saveBudgetHandler);
financeRouter.openapi(createWalletRoute, createWalletHandler);
financeRouter.openapi(createDebtRoute, createDebtHandler);
financeRouter.openapi(getDebtRoute, getDebtHandler);
financeRouter.use('/bills', requireSession);
financeRouter.use('/bills/*', requireSession);
financeRouter.openapi(listBillsRoute, listBillsHandler);
financeRouter.openapi(createBillRoute, createBillHandler);
financeRouter.openapi(updateBillRoute, updateBillHandler);
financeRouter.openapi(deleteBillRoute, deleteBillHandler);
