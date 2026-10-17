import { daysBetween, wibDate } from '../../lib/time/wib.ts';
import { financeRepository, type FinanceRepository } from './finance.repository.ts';

type Deps = { repository?: FinanceRepository; now?: () => Date };

function nextDueDate(today: string, dueDay: number | null): string | null {
  if (!dueDay) return null;
  const [year = 0, month = 1, day = 1] = today.split('-').map(Number);
  for (let offset = 0; offset < 2; offset += 1) {
    const first = new Date(Date.UTC(year, month - 1 + offset, 1));
    const lastDay = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const due = `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(dueDay, lastDay)).padStart(2, '0')}`;
    if (due >= today || (offset === 0 && dueDay >= day)) return due;
  }
  return null;
}

export async function listWallets(userId: string, deps: Deps = {}) {
  const repository = deps.repository ?? financeRepository;
  const [items, debtList] = await Promise.all([
    repository.listWallets(userId),
    listDebts(userId, { ...deps, repository }),
  ]);
  return {
    items,
    debts: debtList.items,
    heldTotal: items.reduce((sum, wallet) => sum + wallet.balance, 0),
    totalDebt: debtList.totalDebt,
  };
}

export async function listDebts(userId: string, deps: Deps = {}) {
  const rows = await (deps.repository ?? financeRepository).listDebts(userId);
  const today = wibDate((deps.now ?? (() => new Date()))());
  const items = rows.map((debt) => {
    const dueDate = nextDueDate(today, debt.dueDay);
    const dueSoon = dueDate !== null && daysBetween(today, dueDate) <= 10;
    return {
      id: debt.id,
      name: debt.name,
      kind: debt.kind,
      originalAmount: debt.originalAmount,
      remainingAmount: debt.remainingAmount,
      monthlyInstallment: debt.monthlyInstallment,
      remainingTenorMonths: debt.remainingTenorMonths,
      installmentsTotal: debt.remainingTenorMonths,
      installmentsRemaining: debt.remainingTenorMonths,
      paymentStatus: debt.paymentStatus,
      nextInstallment: dueDate
        ? {
            dueDate,
            amount: debt.monthlyInstallment,
            status: dueSoon ? ('dueSoon' as const) : ('upcoming' as const),
          }
        : null,
      dueSoon,
    };
  });
  return { items, totalDebt: rows.reduce((sum, debt) => sum + debt.remainingAmount, 0) };
}
