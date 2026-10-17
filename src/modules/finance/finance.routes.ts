import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import {
  currentBudgetEditHandler,
  currentBudgetHandler,
  listWalletsHandler,
  createBillHandler,
  deleteBillHandler,
  listBillsHandler,
  getBillHandler,
  updateBillHandler,
  updateCurrentBudgetHandler,
} from './finance.handler.ts';
import {
  currentBudgetEditRoute,
  currentBudgetRoute,
  updateCurrentBudgetRoute,
} from './finance.routes.budget.ts';
import { listWalletsRoute } from './finance.routes.accounts.ts';
import {
  createBillRoute,
  deleteBillRoute,
  getBillRoute,
  listBillsRoute,
  updateBillRoute,
} from './finance.routes.bills.ts';

export const financeRouter = createRouter();
financeRouter.use('/wallets', requireSession);
financeRouter.openapi(listWalletsRoute, listWalletsHandler);
financeRouter.use('/bills', requireSession);
financeRouter.use('/bills/*', requireSession);
financeRouter.openapi(listBillsRoute, listBillsHandler);
financeRouter.openapi(createBillRoute, createBillHandler);
financeRouter.openapi(getBillRoute, getBillHandler);
financeRouter.openapi(updateBillRoute, updateBillHandler);
financeRouter.openapi(deleteBillRoute, deleteBillHandler);
financeRouter.use('/budgets/current', requireSession);
financeRouter.use('/budgets/current/edit', requireSession);
financeRouter.openapi(currentBudgetRoute, currentBudgetHandler);
financeRouter.openapi(currentBudgetEditRoute, currentBudgetEditHandler);
financeRouter.openapi(updateCurrentBudgetRoute, updateCurrentBudgetHandler);
