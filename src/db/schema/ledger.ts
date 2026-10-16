/**
 * What a person records (Catat): the chat log, the transactions it and the other inputs produce,
 * and bank-statement imports (CAT-01 to CAT-12). The AI-backed inputs' usage is in usage.ts.
 */

import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  DRAFT_PARSER,
  DRAFT_STATUS,
  INPUT_METHOD,
  MESSAGE_KIND,
  MESSAGE_SENDER,
} from '../../lib/constants/chat.ts';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { MAX_AMOUNT } from '../../lib/money/money.schema.ts';
import {
  EXPENSE_CATEGORY,
  INCOME_CATEGORY,
  TRANSACTION_SOURCE,
  TRANSACTION_TYPE,
} from '../../lib/constants/money.ts';
import { users } from './accounts.ts';
import { moment, timestamps } from './columns.ts';

type Values<T> = T[keyof T];

export const messageSenderEnum = pgEnum('message_sender', enumValues(MESSAGE_SENDER));
export const messageKindEnum = pgEnum('message_kind', enumValues(MESSAGE_KIND));
export const transactionTypeEnum = pgEnum('transaction_type', enumValues(TRANSACTION_TYPE));
export const transactionCategoryEnum = pgEnum(
  'transaction_category',
  enumValues({ ...EXPENSE_CATEGORY, ...INCOME_CATEGORY }),
);
export const transactionSourceEnum = pgEnum('transaction_source', enumValues(TRANSACTION_SOURCE));

export type TransactionCategory = Values<typeof EXPENSE_CATEGORY> | Values<typeof INCOME_CATEGORY>;

/** One item of a Kira reply's draft card, before it is saved as a transaction. */
export type DraftItem = {
  id: string;
  type: Values<typeof TRANSACTION_TYPE>;
  name: string;
  amount: number;
  category: TransactionCategory;
  occurredAt: string;
  /** The characters of the source message this item was read from, for the highlighted quote. */
  spanStart: number | null;
  spanEnd: number | null;
};

/** What a message carries besides its text; each kind fills its own fields. */
export type MessagePayload = {
  drafts?: DraftItem[];
  draftStatus?: Values<typeof DRAFT_STATUS>;
  parser?: Values<typeof DRAFT_PARSER>;
  inputMethod?: Values<typeof INPUT_METHOD>;
  voiceSeconds?: number;
  batchId?: string | null;
  transactionIds?: string[];
  committedAt?: string | null;
  itemCount?: number;
  remaining?: number;
  perDay?: number;
};

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    sender: messageSenderEnum('sender').notNull(),
    kind: messageKindEnum('kind').notNull(),
    /** The person's text, or the store name of a scanned receipt; Kira's words come from the app. */
    body: text('body'),
    payload: jsonb('payload').$type<MessagePayload>().default({}).notNull(),
    /** The person's message a Kira reply answers ("dari pesan 12.41 WIB"). */
    replyToId: uuid('reply_to_id').references((): AnyPgColumn => chatMessages.id, {
      onDelete: 'set null',
    }),
    /** Chosen by the app, so a retried send stores the message once. */
    clientId: uuid('client_id'),
    ...timestamps,
  },
  (table) => [
    index('chat_messages_user_created_idx').on(
      table.userId,
      table.createdAt.desc().nullsFirst(),
      table.id.desc().nullsFirst(),
    ),
    index('chat_messages_reply_to_idx').on(table.replyToId),
    /** A person's message is stored once per client id; Kira's manual-entry notes keep theirs
       only to remember the request, under the transactions' own unique index. */
    uniqueIndex('chat_messages_user_client_idx')
      .on(table.userId, table.clientId)
      .where(sql`${table.sender} = ${sql.raw(`'${MESSAGE_SENDER.person}'`)}`),
  ],
);

export const bankImports = pgTable(
  'bank_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    fileSize: integer('file_size').notNull(),
    rowCount: integer('row_count').notNull(),
    dateFrom: date('date_from', { mode: 'string' }).notNull(),
    dateTo: date('date_to', { mode: 'string' }).notNull(),
    committedAt: moment('committed_at'),
    savedCount: integer('saved_count'),
    skippedCount: integer('skipped_count'),
    createdAt: moment('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('bank_imports_user_idx').on(table.userId),
    check('bank_imports_file_size_check', sql`${table.fileSize} between 1 and 10000000`),
    check('bank_imports_dates_check', sql`${table.dateTo} >= ${table.dateFrom}`),
  ],
);

export const bankImportRows = pgTable(
  'bank_import_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    importId: uuid('import_id')
      .references(() => bankImports.id, { onDelete: 'cascade' })
      .notNull(),
    rowIndex: integer('row_index').notNull(),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    description: varchar('description', { length: 255 }).notNull(),
    type: transactionTypeEnum('type').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    category: transactionCategoryEnum('category').notNull(),
    /** Same date and amount as a transaction already recorded (CAT-12 "Mungkin Dobel"). */
    isDuplicate: boolean('is_duplicate').notNull(),
  },
  (table) => [
    index('bank_import_rows_import_idx').on(table.importId, table.rowIndex),
    check(
      'bank_import_rows_amount_check',
      sql`${table.amount} between 1 and ${sql.raw(String(MAX_AMOUNT))}`,
    ),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    type: transactionTypeEnum('type').notNull(),
    /** Whole rupiah, always positive; `type` says which way it went. */
    amount: bigint('amount', { mode: 'number' }).notNull(),
    category: transactionCategoryEnum('category').notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    occurredAt: moment('occurred_at').notNull(),
    note: varchar('note', { length: 280 }),
    source: transactionSourceEnum('source').notNull(),
    sourceMessageId: uuid('source_message_id').references(() => chatMessages.id, {
      onDelete: 'set null',
    }),
    sourceSpanStart: smallint('source_span_start'),
    sourceSpanEnd: smallint('source_span_end'),
    /** The drafts saved together, so Urungkan removes them together (CAT-03). */
    batchId: uuid('batch_id'),
    importId: uuid('import_id').references(() => bankImports.id, { onDelete: 'set null' }),
    /** Chosen by the app for a manual entry, so a retry never saves it twice (CAT-04c). */
    clientId: uuid('client_id'),
    ...timestamps,
  },
  (table) => [
    index('transactions_user_occurred_idx').on(
      table.userId,
      table.occurredAt.desc().nullsFirst(),
      table.id.desc().nullsFirst(),
    ),
    index('transactions_source_message_idx').on(table.sourceMessageId),
    index('transactions_batch_idx').on(table.batchId),
    index('transactions_import_idx').on(table.importId),
    uniqueIndex('transactions_user_client_idx').on(table.userId, table.clientId),
    check(
      'transactions_amount_check',
      sql`${table.amount} between 1 and ${sql.raw(String(MAX_AMOUNT))}`,
    ),
  ],
);
