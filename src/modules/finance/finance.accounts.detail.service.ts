import { addMonths, daysBetween, daysInMonth, wibDate } from '../../lib/time/wib.ts';
import { PayoffDebtNotFoundError } from '../payoff/index.ts';
import { estimateDebtPayoffScore } from '../score/index.ts';
import { financeRepository, type FinanceRepository } from './finance.repository.ts';

type Deps = {
  repository?: FinanceRepository;
  now?: () => Date;
  estimateDebtScore?: typeof estimateDebtPayoffScore;
};

function dueDateForMonth(month: string, dueDay: number) {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number);
  return `${month}-${String(Math.min(dueDay, daysInMonth(year, monthNumber))).padStart(2, '0')}`;
}

function nextStep(remainingAmount: number, monthlyInstallment: number) {
  if (remainingAmount <= 0) return 'Utang sudah lunas. Pertahankan kebiasaan mencatat.';
  if (monthlyInstallment <= 0)
    return 'Tentukan jumlah cicilan agar rencana pelunasan bisa dihitung.';
  return 'Jika ada sisa dana, tambahkan ke cicilan untuk melunasi utang lebih cepat.';
}

export async function getDebtDetail(userId: string, debtId: string, deps: Deps = {}) {
  const repository = deps.repository ?? financeRepository;
  const now = (deps.now ?? (() => new Date()))();
  const [debt, payments] = await Promise.all([
    repository.findDebt(userId, debtId),
    repository.listDebtPayments(userId, debtId),
  ]);
  if (!debt) throw new PayoffDebtNotFoundError();

  const today = wibDate(now);
  const createdDate = wibDate(debt.createdAt);
  const firstDueMonth = createdDate.slice(0, 7);
  const firstDueDate = debt.dueDay === null ? null : dueDateForMonth(firstDueMonth, debt.dueDay);
  const anchorMonth =
    firstDueDate && firstDueDate < createdDate
      ? addMonths(`${firstDueMonth}-01`, 1).slice(0, 7)
      : firstDueMonth;
  const anchorDate = debt.dueDay === null ? null : dueDateForMonth(anchorMonth, debt.dueDay);
  const historyCount = payments.length;
  const installmentsRemaining = debt.remainingTenorMonths;
  const installmentsTotal =
    installmentsRemaining === null ? null : installmentsRemaining + historyCount;
  const schedule = [] as {
    dueDate: string;
    amount: number;
    status: 'upcoming' | 'dueSoon' | 'paid';
  }[];
  const dates: string[] = [];
  if (anchorDate && installmentsTotal !== null) {
    for (let index = 0; index < Math.min(600, installmentsTotal); index += 1) {
      const date = dueDateForMonth(
        addMonths(`${anchorMonth}-01`, index).slice(0, 7),
        debt.dueDay ?? 1,
      );
      dates.push(date);
      const paid = index < historyCount;
      const remainingIndex = index - historyCount;
      const amount = paid
        ? (payments[index]?.amount ?? debt.monthlyInstallment)
        : debt.monthlyInstallment <= 0
          ? 0
          : installmentsRemaining !== null && remainingIndex === installmentsRemaining - 1
            ? Math.max(
                0,
                debt.remainingAmount - debt.monthlyInstallment * (installmentsRemaining - 1),
              )
            : debt.monthlyInstallment;
      const days = daysBetween(today, date);
      schedule.push({
        dueDate: date,
        amount,
        status: paid ? 'paid' : days <= 10 ? 'dueSoon' : 'upcoming',
      });
    }
  }

  const paymentHistory = payments.map((payment, index) => {
    const paidOn = wibDate(payment.paidAt);
    const dueDate = dates[index];
    return {
      id: payment.id,
      date: payment.paidAt.toISOString(),
      amount: payment.amount,
      onTime: dueDate === undefined || paidOn <= dueDate,
    };
  });
  const scoreEstimate = await (deps.estimateDebtScore ?? estimateDebtPayoffScore)(userId, debtId);
  const totalPaid = Math.max(0, debt.originalAmount - debt.remainingAmount);
  const nextInstallment = schedule.find((item) => item.status !== 'paid') ?? null;
  return {
    id: debt.id,
    name: debt.name,
    kind: debt.kind,
    originalAmount: debt.originalAmount,
    remainingAmount: debt.remainingAmount,
    monthlyInstallment: debt.monthlyInstallment,
    remainingTenorMonths: installmentsRemaining,
    installmentsTotal,
    installmentsRemaining,
    paymentStatus: debt.paymentStatus,
    nextInstallment,
    dueSoon: nextInstallment?.status === 'dueSoon',
    totalPaid,
    scoreEstimate,
    nextStep: nextStep(debt.remainingAmount, debt.monthlyInstallment),
    installmentSchedule: schedule,
    paymentHistory,
  };
}
