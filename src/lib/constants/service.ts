/**
 * The name this process gives itself wherever another system shows it: the `service` field of
 * every log line and `application_name` in Postgres's `pg_stat_activity`. One spelling, so a log
 * search and a database session lookup land on the same process.
 */
export const SERVICE_NAME = 'kira-backend';
