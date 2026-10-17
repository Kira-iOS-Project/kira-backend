import { createRoute, z } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import {
  billListSchema,
  billSchema,
  createBillBodySchema,
  updateBillBodySchema,
} from './finance.bills.schema.ts';

export const listBillsRoute = createRoute({
  tags: ['Finance'],
  security: [{ bearerAuth: [] }],
  method: 'get',
  path: '/bills',
  operationId: 'listBills',
  summary: 'Recurring bills and debt installments by due date',
  responses: {
    200: {
      description: 'Owner bills and debt installments with due and payment status',
      content: { 'application/json': { schema: billListSchema } },
    },
    ...errorResponses(401),
  },
});

export const createBillRoute = createRoute({
  tags: ['Finance'],
  security: [{ bearerAuth: [] }],
  method: 'post',
  path: '/bills',
  operationId: 'createBill',
  summary: 'Add a recurring bill or linked debt installment',
  request: {
    body: { content: { 'application/json': { schema: createBillBodySchema } }, required: true },
  },
  responses: {
    201: {
      description: 'Created schedule',
      content: { 'application/json': { schema: billSchema } },
    },
    ...errorResponses(401, 404, 422),
  },
});

const billIdParamSchema = z.object({ id: z.uuid() });

export const getBillRoute = createRoute({
  tags: ['Finance'],
  security: [{ bearerAuth: [] }],
  method: 'get',
  path: '/bills/{id}',
  operationId: 'getBill',
  summary: 'Recurring bill details',
  request: { params: billIdParamSchema },
  responses: {
    200: { description: 'Bill', content: { 'application/json': { schema: billSchema } } },
    ...errorResponses(401, 404, 422),
  },
});

export const updateBillRoute = createRoute({
  tags: ['Finance'],
  security: [{ bearerAuth: [] }],
  method: 'patch',
  path: '/bills/{id}',
  operationId: 'updateBill',
  summary: 'Update future bill schedule',
  description: 'Only the future schedule changes; saved payment transactions remain intact.',
  request: {
    params: billIdParamSchema,
    body: { content: { 'application/json': { schema: updateBillBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'Updated schedule',
      content: { 'application/json': { schema: billSchema } },
    },
    ...errorResponses(401, 404, 422),
  },
});
