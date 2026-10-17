import { daysBetween, wibDate } from '../../lib/time/wib.ts';
import { BILL_KIND } from '../../lib/constants/ung.ts';
import { getCurrentPaydayPeriod } from './finance.budget.service.ts';
import { budgetRepository, type BudgetRepository } from './finance.repository.budget.ts';
import { billRepository } from './finance.repository.bills.ts';
import type { BillRow, FinanceRepository } from './finance.repository.types.ts';

type Deps = {
  repository?: Pick<FinanceRepository, 'listBills'>;
  budgetRepository?: Pick<BudgetRepository, 'getBudget' | 'getProfileBudget'>;
  now?: () => Date;
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

export async function listBills(userId: string, deps: Deps = {}) {
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
