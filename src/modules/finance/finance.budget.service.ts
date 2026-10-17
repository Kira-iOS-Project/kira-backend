import { addDays, daysBetween, daysInMonth, wibDate, wibStartOfDay } from '../../lib/time/wib.ts';
import { INDICATOR } from '../../lib/constants/score.ts';
import { expenseCategorySchema } from '../../lib/money/money.schema.ts';
import { targetMultipleOf } from '../score/index.ts';
import { budgetRepository, type BudgetRepository } from './finance.repository.budget.ts';
import { INDONESIAN_NATIONAL_HOLIDAYS } from './indonesian-holidays.ts';
import type { PaydayChoice, UpdateBudgetInput } from './finance.budget.schema.ts';

type Deps = { repository?: BudgetRepository; now?: () => Date };

function paydayDate(
  year: number,
  month: number,
  choice: PaydayChoice,
  holidays: ReadonlySet<string>,
) {
  const lastDay = daysInMonth(year, month);
  const day = choice.type === 'endOfMonth' ? lastDay : Math.min(choice.day, lastDay);
  let date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  while (isNonBusinessDay(date, holidays)) date = addDays(date, -1);
  return date;
}

function isNonBusinessDay(date: string, holidays: ReadonlySet<string>) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6 || holidays.has(date);
}

function shiftedMonth(year: number, month: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return [date.getUTCFullYear(), date.getUTCMonth() + 1] as const;
}

export function getCurrentPaydayPeriod(today: string, choice: PaydayChoice) {
  const [year = 0, month = 1] = today.split('-').map(Number);
  const holidaySet = new Set(INDONESIAN_NATIONAL_HOLIDAYS.map(({ date }) => date));
  const candidates = [-1, 0, 1, 2]
    .map((offset) => {
      const [candidateYear, candidateMonth] = shiftedMonth(year, month, offset);
      return paydayDate(candidateYear, candidateMonth, choice, holidaySet);
    })
    .toSorted();
  const startIndex = candidates.reduce((last, date, index) => (date <= today ? index : last), -1);
  const periodStart = candidates[startIndex] ?? candidates[0] ?? today;
  const nextPayday = candidates.find((date) => date > today) ?? addDays(periodStart, 31);
  return {
    adjustedDate: periodStart,
    periodStart,
    periodEnd: addDays(nextPayday, -1),
    nextPayday,
    daysUntilPayday: daysBetween(today, nextPayday),
  };
}

function previousCompleteBudgetPeriods(
  today: string,
  choice: PaydayChoice,
  createdAt: Date | null,
) {
  const [year = 0, month = 1] = today.split('-').map(Number);
  const holidaySet = new Set(INDONESIAN_NATIONAL_HOLIDAYS.map(({ date }) => date));
  const dates = Array.from({ length: 7 }, (_, index) => index - 5)
    .map((offset) => {
      const [candidateYear, candidateMonth] = shiftedMonth(year, month, offset);
      return paydayDate(candidateYear, candidateMonth, choice, holidaySet);
    })
    .toSorted();
  const currentIndex = dates.reduce((last, date, index) => (date <= today ? index : last), -1);
  const periods: { from: string; toExclusive: string }[] = [];
  for (let index = currentIndex; index > 0 && periods.length < 3; index -= 1) {
    const from = dates[index - 1];
    const toExclusive = dates[index];
    if (!from || !toExclusive) continue;
    if (createdAt && wibStartOfDay(from).getTime() < createdAt.getTime()) continue;
    periods.push({ from, toExclusive });
  }
  return periods;
}

type GoalProfile = Awaited<ReturnType<BudgetRepository['getBudgetGoalProfile']>>;

function goalPosts(profile: GoalProfile) {
  const essential = profile?.essentialMonthlyExpenses ?? 0;
  if (!profile || essential <= 0) return [];
  const multiple = targetMultipleOf({
    maritalStatus: profile.maritalStatus,
    dependents: profile.dependents,
  });
  const currentAmount = profile.emergencyFund ?? 0;
  const milestones = [1, multiple / 2, multiple].map((value) => {
    const amount = Math.round(essential * value);
    return {
      amount,
      label: `${String(value).replace('.', ',')}×`,
      reached: currentAmount >= amount,
    };
  });
  return [
    {
      category: INDICATOR.emergencyFund,
      name: 'Dana Darurat',
      currentAmount,
      targetAmount: Math.round(essential * multiple),
      milestones,
    },
  ];
}

export async function getCurrentBudget(userId: string, deps: Deps = {}) {
  const repository = deps.repository ?? budgetRepository;
  const now = (deps.now ?? (() => new Date()))();
  const saved = await repository.getBudget(userId);
  const defaults = saved ?? { ...(await repository.getProfileBudget(userId)), allocations: [] };
  const today = wibDate(now);
  const payday = getCurrentPaydayPeriod(today, defaults.payday);
  const [spending, profile] = await Promise.all([
    repository.spendingByCategory(
      userId,
      wibStartOfDay(payday.periodStart),
      wibStartOfDay(addDays(today, 1)),
    ),
    repository.getBudgetGoalProfile(userId),
  ]);
  const spentByCategory = new Map(spending.map((row) => [row.category, row.amount]));
  const totalSpent = spending.reduce((total, row) => total + row.amount, 0);
  const totalAllocated = defaults.allocations.reduce((total, row) => total + row.amount, 0);
  return {
    configured: saved !== null,
    income: defaults.income,
    remaining: defaults.income - totalSpent,
    allocations: defaults.allocations.map((allocation) => {
      const spent = spentByCategory.get(allocation.category) ?? 0;
      return {
        ...allocation,
        spent,
        nearLimit: allocation.amount > 0 && spent * 10 >= allocation.amount * 9,
      };
    }),
    totalAllocated,
    overAllocated: totalAllocated > defaults.income,
    goalPosts: goalPosts(profile),
    payday: { requested: defaults.payday, ...payday },
  };
}

export async function getCurrentBudgetEdit(userId: string, deps: Deps = {}) {
  const repository = deps.repository ?? budgetRepository;
  const now = (deps.now ?? (() => new Date()))();
  const current = await getCurrentBudget(userId, { repository, now: () => now });
  const profile = await repository.getBudgetGoalProfile(userId);
  const today = wibDate(now);
  const periods = previousCompleteBudgetPeriods(
    today,
    current.payday.requested,
    profile?.createdAt ?? null,
  );
  if (periods.length === 0) return { ...current, averagePeriods: 0, averages: [] };

  const results = await Promise.all(
    periods.map((period) =>
      repository.spendingByCategory(
        userId,
        wibStartOfDay(period.from),
        wibStartOfDay(period.toExclusive),
      ),
    ),
  );
  const totals = new Map<string, number>();
  for (const rows of results) {
    for (const row of rows) totals.set(row.category, (totals.get(row.category) ?? 0) + row.amount);
  }
  return {
    ...current,
    averagePeriods: periods.length,
    averages: [...totals]
      .map(([category, total]) => ({
        category: expenseCategorySchema.parse(category),
        amount: Math.round(total / periods.length),
      }))
      .toSorted((left, right) => left.category.localeCompare(right.category)),
  };
}

export async function updateCurrentBudget(
  userId: string,
  body: UpdateBudgetInput,
  deps: Deps = {},
) {
  const repository = deps.repository ?? budgetRepository;
  const now = (deps.now ?? (() => new Date()))();
  await repository.saveBudget(userId, body);
  return getCurrentBudget(userId, { repository, now: () => now });
}
