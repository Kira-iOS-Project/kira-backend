import { createRoute } from '@hono/zod-openapi';
import { errorResponses } from '../../lib/errors/problem.ts';
import { budgetEditSchema, budgetSchema, updateBudgetBodySchema } from './finance.budget.schema.ts';

export const currentBudgetRoute = createRoute({
  tags: ['Finance'],
  security: [{ bearerAuth: [] }],
  method: 'get',
  path: '/budgets/current',
  operationId: 'getCurrentBudget',
  summary: 'Current budget and adjusted payday',
  responses: {
    200: {
      description: 'Current budget, spending, goal posts and adjusted payday period',
      content: { 'application/json': { schema: budgetSchema } },
    },
    ...errorResponses(401),
  },
});

export const currentBudgetEditRoute = createRoute({
  tags: ['Finance'],
  security: [{ bearerAuth: [] }],
  method: 'get',
  path: '/budgets/current/edit',
  operationId: 'getCurrentBudgetEdit',
  summary: 'Budget editor with up to three prior-period averages',
  responses: {
    200: {
      description: 'Current budget and averages from completed periods',
      content: { 'application/json': { schema: budgetEditSchema } },
    },
    ...errorResponses(401),
  },
});

export const updateCurrentBudgetRoute = createRoute({
  tags: ['Finance'],
  security: [{ bearerAuth: [] }],
  method: 'put',
  path: '/budgets/current',
  operationId: 'updateCurrentBudget',
  summary: 'Save budget allocations and payday',
  request: {
    body: { content: { 'application/json': { schema: updateBudgetBodySchema } }, required: true },
  },
  responses: {
    200: {
      description: 'Saved current budget with spending and adjusted payday period',
      content: { 'application/json': { schema: budgetSchema } },
    },
    ...errorResponses(401, 422),
  },
});
