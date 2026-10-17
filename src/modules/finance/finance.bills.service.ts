/**
 * Tagihan & Cicilan (UNG-06) and Tambah / Ubah Tagihan (UNG-07, UNG-07c): the bills with their
 * next due date in WIB, grouped as the board shows them, and saving, changing and deleting one.
 * An instalment's payment is its own Tandai Sudah Dibayar or a Rencanaku payment of its debt,
 * whichever came last.
 */

import { BILL_GROUP, BILL_KIND, BILL_REPEAT } from '../../lib/constants/ung.ts';
import { wibDate } from '../../lib/time/wib.ts';
import { billDue, billGroup, laterDay, monthlyShare } from './finance.bills.calendar.ts';
import { BillDebtNotFoundError, BillNotFoundError } from './finance.bills.errors.ts';
import type { Bill, BillList, CreateBillBody, UpdateBillBody } from './finance.bills.schema.ts';
import {
  billRepository,
  type BillPatch,
  type BillRepository,
  type BillRow,
} from './finance.repository.bills.ts';

type Deps = { repository?: BillRepository; now?: () => Date };

function resolve(deps: Deps) {
  return {
    repository: deps.repository ?? billRepository,
    today: wibDate((deps.now ?? (() => new Date()))()),
  };
}

/** The bill as the app shows it, `debtPaidOn` being its debt's last Rencanaku payment. */
function billOf(row: BillRow, today: string, debtPaidOn: string | null): Bill {
  const due = billDue(row.dueOn, row.repeats, laterDay(row.lastPaidOn, debtPaidOn), today);
  return {
    id: row.id,
    name: row.name,
    kind: row.debtId ? BILL_KIND.instalment : BILL_KIND.bill,
    category: row.category,
    amount: row.amount,
    isEstimate: row.isEstimate,
    repeats: row.repeats,
    dueOn: row.dueOn,
    dueDay: Number(row.dueOn.slice(8, 10)),
    nextDueOn: due.nextDueOn,
    daysUntil: due.daysUntil,
    debtId: row.debtId,
    remainingInstalments: row.debtId ? row.remainingTenorMonths : null,
    paidThisPeriod: due.paid,
    lastPaidOn: row.lastPaidOn,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The last Rencanaku payment day of each of the person's debts. */
async function debtPaidDays(repository: BillRepository, userId: string) {
  const payments = await repository.lastDebtPayments(userId);
  return new Map(payments.map(({ debtId, paidAt }) => [debtId, wibDate(paidAt)]));
}

async function billWithPayments(
  repository: BillRepository,
  userId: string,
  row: BillRow,
  today: string,
) {
  const paid = row.debtId ? (await debtPaidDays(repository, userId)).get(row.debtId) : undefined;
  return billOf(row, today, paid ?? null);
}

async function requireOwnDebt(
  repository: BillRepository,
  userId: string,
  debtId: string | null | undefined,
) {
  if (debtId && !(await repository.ownsDebt(userId, debtId))) throw new BillDebtNotFoundError();
}

export async function listBills(userId: string, deps: Deps = {}): Promise<BillList> {
  const { repository, today } = resolve(deps);
  const [rows, paidDays] = await Promise.all([
    repository.listBills(userId),
    debtPaidDays(repository, userId),
  ]);
  const list = rows.map((row) =>
    billOf(row, today, row.debtId ? (paidDays.get(row.debtId) ?? null) : null),
  );
  const sections = Object.values(BILL_GROUP).flatMap((group) => {
    const inGroup = list
      .filter((bill) => bill.nextDueOn !== null && billGroup(bill.nextDueOn, today) === group)
      .toSorted((a, b) => (a.nextDueOn ?? '').localeCompare(b.nextDueOn ?? ''));
    return inGroup.length > 0 ? [{ group, bills: inGroup }] : [];
  });
  return {
    count: list.filter((bill) => bill.repeats !== BILL_REPEAT.once).length,
    monthlyTotal: list.reduce((total, bill) => total + monthlyShare(bill.amount, bill.repeats), 0),
    sections,
  };
}

export async function createBill(
  userId: string,
  body: CreateBillBody,
  deps: Deps = {},
): Promise<Bill> {
  const { repository, today } = resolve(deps);
  await requireOwnDebt(repository, userId, body.debtId);
  const row = await repository.insertBill(userId, body);
  return billWithPayments(repository, userId, row, today);
}

export async function updateBill(
  userId: string,
  id: string,
  body: UpdateBillBody,
  deps: Deps = {},
): Promise<Bill> {
  const { repository, today } = resolve(deps);
  await requireOwnDebt(repository, userId, body.debtId);
  const { paidOn, ...fields } = body;
  const patch: BillPatch = paidOn === undefined ? fields : { ...fields, lastPaidOn: paidOn };
  if (!(await repository.updateBill(userId, id, patch))) throw new BillNotFoundError();
  const row = await repository.findBill(userId, id);
  if (!row) throw new BillNotFoundError();
  return billWithPayments(repository, userId, row, today);
}

export async function deleteBill(userId: string, id: string, deps: Deps = {}): Promise<void> {
  const { repository } = resolve(deps);
  if (!(await repository.deleteBill(userId, id))) throw new BillNotFoundError();
}
