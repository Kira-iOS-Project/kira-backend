import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import { listWalletsHandler } from './finance.handler.ts';
import { listWalletsRoute } from './finance.routes.accounts.ts';

export const financeRouter = createRouter();
financeRouter.use('/wallets', requireSession);
financeRouter.openapi(listWalletsRoute, listWalletsHandler);
