import { daysBetween, wibDate } from '../../lib/time/wib.ts';
import { financeRepository, type FinanceRepository } from './finance.repository.ts';
import type { CreateDebtInput, CreateWalletInput } from './finance.accounts.schema.ts';
import { DEBT_KIND } from '../../lib/constants/profile.ts';
import { FINANCE_INPUT_ALIAS, WALLET_TYPE } from '../../lib/constants/ung.ts';

type Deps = { repository?: FinanceRepository; now?: () => Date };

function nextDueDate(today: string, dueDay: number | null): string | null {
  if (!dueDay) return null;
  const [year = 0, month = 1] = today.split('-').map(Number);
  const dueDateForMonth = (offset: number) => {
    const first = new Date(Date.UTC(year, month - 1 + offset, 1));
    const lastDay = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
    return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(dueDay, lastDay)).padStart(2, '0')}`;
  };
  const currentMonthDueDate = dueDateForMonth(0);
  return currentMonthDueDate >= today ? currentMonthDueDate : dueDateForMonth(1);
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

export async function createWallet(userId: string, body: CreateWalletInput, deps: Deps = {}) {
  const repository = deps.repository ?? financeRepository;
  const now = (deps.now ?? (() => new Date()))();
  if ('remainingDebt' in body) {
    const kind = body.type === FINANCE_INPUT_ALIAS.pinjol ? DEBT_KIND.onlineLoan : body.type;
    return createDebt(
      userId,
      {
        name: body.name,
        kind,
        amount: body.remainingDebt,
        monthlyInstallment: body.monthlyInstallment,
        remainingTenorMonths: body.remainingTenorMonths,
        nextDueDate: body.nextDueDate,
      },
      { ...deps, repository },
    );
  }
  const type = body.type === FINANCE_INPUT_ALIAS.eWallet ? WALLET_TYPE.eWallet : body.type;
  const wallet = await repository.createWallet(
    userId,
    {
      name: body.name,
      type,
      openingBalance: body.balance ?? body.openingBalance ?? 0,
    },
    now,
  );
  return {
    id: wallet.id,
    name: wallet.name,
    type: wallet.type,
    balance: wallet.balance,
    createdAt: wallet.createdAt.toISOString(),
  };
}

export async function createDebt(userId: string, body: CreateDebtInput, deps: Deps = {}) {
  const repository = deps.repository ?? financeRepository;
  const now = (deps.now ?? (() => new Date()))();
  const nextDueDay = body.nextDueDate ? Number(body.nextDueDate.slice(-2)) : null;
  const debt = await repository.createDebt(
    userId,
    {
      name: body.name,
      kind: body.kind === FINANCE_INPUT_ALIAS.pinjol ? DEBT_KIND.onlineLoan : body.kind,
      amount: body.amount,
      monthlyInstallment: body.monthlyInstallment ?? 0,
      remainingTenorMonths: body.remainingTenorMonths ?? null,
      dueDay: nextDueDay,
    },
    now,
  );
  const today = wibDate(now);
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
}
