import { describe, expect, test } from 'bun:test';
import type { EmailMessage } from '../../../lib/email/resend.ts';
import { deleteAccount } from '../account.service.ts';
import { createAccountRepositoryMock, NOW, USER_ID } from './helpers.ts';

const now = () => NOW;

describe('deleteAccount', () => {
  test('deletes first, then sends the notice', async () => {
    const steps: string[] = [];
    const repository = createAccountRepositoryMock({
      deleteUser: async () => void steps.push('delete'),
    });

    await deleteAccount(USER_ID, {
      repository,
      now,
      send: async (message) => void steps.push(message.subject),
    });

    await Bun.sleep(0);
    expect(steps).toEqual(['delete', 'Akun Kira-mu sudah dihapus']);
  });

  test('answers without waiting for a slow notice', async () => {
    let release = () => {};
    const steps: string[] = [];
    const repository = createAccountRepositoryMock({
      deleteUser: async () => void steps.push('delete'),
    });
    const send = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });

    await deleteAccount(USER_ID, { repository, now, send });

    expect(steps).toEqual(['delete']);
    release();
  });

  test('deletes even when the notice cannot be sent', async () => {
    const steps: string[] = [];
    const repository = createAccountRepositoryMock({
      deleteUser: async () => void steps.push('delete'),
    });
    const send = async () => {
      throw new Error('Resend answered 500');
    };

    await deleteAccount(USER_ID, { repository, now, send });
    await Bun.sleep(0);

    expect(steps).toEqual(['delete']);
  });

  test('an account already gone gets no email and the call still succeeds', async () => {
    const sent: EmailMessage[] = [];
    const repository = createAccountRepositoryMock({ findProfile: async () => null });

    await deleteAccount(USER_ID, {
      repository,
      now,
      send: async (message) => void sent.push(message),
    });

    expect(sent).toEqual([]);
  });
});
