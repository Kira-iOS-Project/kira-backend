/**
 * The Catat chat log (CAT-01): who wrote each message, what kind it is, and the state of the
 * drafts a Kira reply carries. Parsing happens on the device; the server records the result and
 * validates the amounts.
 */

export const MESSAGE_SENDER = {
  person: 'person',
  kira: 'kira',
} as const;

export const MESSAGE_KIND = {
  /** The person's typed or spoken text. */
  personText: 'person_text',
  /** A receipt the person scanned; only the store name and the item text reach the server. */
  personReceipt: 'person_receipt',
  /** Kira's reply holding drafts to confirm. */
  drafts: 'drafts',
  /** Kira's note that a manual entry was saved (CAT-04). */
  manualSaved: 'manual_saved',
  /** Kira's engine-computed remaining money after a save (CAT-03). */
  remaining: 'remaining',
  /** Kira's reply when the text held no amount it could read. */
  noDrafts: 'no_drafts',
} as const;

export const DRAFT_STATUS = {
  pending: 'pending',
  committed: 'committed',
  discarded: 'discarded',
} as const;

/** What turned the text into drafts on the device. */
export const DRAFT_PARSER = {
  onDeviceModel: 'on_device_model',
  slangRules: 'slang_rules',
} as const;

export const INPUT_METHOD = {
  keyboard: 'keyboard',
  voice: 'voice',
} as const;
