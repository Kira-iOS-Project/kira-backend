import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import {
  billIdParamSchema,
  billListSchema,
  billSchema,
  createBillBodySchema,
  updateBillBodySchema,
} from './finance.bills.schema.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const protectedRoute = { tags: ['Finance'], security: [{ bearerAuth: [] }] };

export const listBillsRoute = createRoute({
  ...protectedRoute,
  method: 'get',
  path: '/bills',
  operationId: 'listBills',
  summary: 'Tagihan & Cicilan: the bills grouped by when they fall due',
  description:
    '7 Hari ke Depan (overdue included), Bulan Ini, Bulan Depan and later, in WIB. A bill paid this period sits in the group of its next due date.',
  responses: {
    200: { ...json(billListSchema), description: 'The bills' },
    ...errorResponses(401),
  },
});

export const createBillRoute = createRoute({
  ...protectedRoute,
  method: 'post',
  path: '/bills',
  operationId: 'createBill',
  summary: 'Tambah Tagihan',
  description: "debtId links the bill to one of the person's debt accounts as its instalment.",
  request: { body: { ...json(createBillBodySchema), required: true } },
  responses: {
    201: { ...json(billSchema), description: 'Saved' },
    ...errorResponses(401, 404, 422),
  },
});

export const updateBillRoute = createRoute({
  ...protectedRoute,
  method: 'patch',
  path: '/bills/{id}',
  operationId: 'updateBill',
  summary: 'Ubah Tagihan, or Tandai Sudah Dibayar with paidOn (null takes it back)',
  request: {
    params: billIdParamSchema,
    body: { ...json(updateBillBodySchema), required: true },
  },
  responses: {
    200: { ...json(billSchema), description: 'The changed bill' },
    ...errorResponses(401, 404, 422),
  },
});

export const deleteBillRoute = createRoute({
  ...protectedRoute,
  method: 'delete',
  path: '/bills/{id}',
  operationId: 'deleteBill',
  summary: 'Hapus Tagihan',
  request: { params: billIdParamSchema },
  responses: {
    204: { description: 'Deleted' },
    ...errorResponses(401, 404, 422),
  },
});
