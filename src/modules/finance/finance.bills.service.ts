import { daysBetween, wibDate } from '../../lib/time/wib.ts';
import { BILL_KIND } from '../../lib/constants/ung.ts';
import { PayoffDebtNotFoundError } from '../payoff/index.ts';
import { getCurrentPaydayPeriod } from './finance.budget.service.ts';
import { budgetRepository, type BudgetRepository } from './finance.repository.budget.ts';
import { billRepository } from './finance.repository.bills.ts';
import type { BillRow, FinanceRepository } from './finance.repository.types.ts';
import type { CreateBillBody } from './finance.bills.schema.ts';

type ListDeps = {
  repository?: Pick<FinanceRepository, 'listBills'>;
  budgetRepository?: Pick<BudgetRepository, 'getBudget' | 'getProfileBudget'>;
  now?: () => Date;
};

type CreateDeps = Omit<ListDeps, 'repository'> & {
  repository?: Pick<FinanceRepository, 'listBills' | 'createBill'>;
};

function presentBill(row: BillRow, today: string) {
  const kind = row.linkedDebtAccountId ? BILL_KIND.debtInstallment : BILL_KIND.bill;
  const daysUntilDue = daysBetween(today, row.nextDueDate);
  const dueSoonWithinDays = kind === BILL_KIND.debtInstallment ? 10 : 5;
  return {
    ...row,
    kind,
    dueSoon: !row.paidThisPeriod && daysUntilDue >= 0 && daysUntilDue <= dueSoonWithinDays,
  };
}

export async function listBills(userId: string, deps: ListDeps = {}) {
  const repository = deps.repository ?? billRepository;
  const budgets = deps.budgetRepository ?? budgetRepository;
  const now = (deps.now ?? (() => new Date()))();
  const today = wibDate(now);
  const saved = await budgets.getBudget(userId);
  const payday = saved?.payday ?? (await budgets.getProfileBudget(userId)).payday;
  const periodStart = getCurrentPaydayPeriod(today, payday).periodStart;
  const rows = await repository.listBills(userId, periodStart);
  return { items: rows.map((row) => presentBill(row, today)) };
}

export async function createBill(userId: string, body: CreateBillBody, deps: CreateDeps = {}) {
  const repository = deps.repository ?? billRepository;
  const created = await repository.createBill(userId, body);
  if (!created) throw new PayoffDebtNotFoundError();
  const today = wibDate((deps.now ?? (() => new Date()))());
  const listed = await listBills(userId, deps);
  return listed.items.find((item) => item.id === created.id) ?? presentBill(created, today);
}
