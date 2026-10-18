// Strip only pg_dump's leading display/session boilerplate. Stop at the first
// meaningful statement so comments and SQL literals in actual DDL stay intact.
export function readableTableDefinition(sql: string): string {
  const lines = sql.split('\n');
  let first = 0;
  const sessionSetup = /^SET (?:statement_timeout|lock_timeout|idle_in_transaction_session_timeout|transaction_timeout|client_encoding|standard_conforming_strings|check_function_bodies|xmloption|client_min_messages|row_security) = .*;\r?$/;
  for (; first < lines.length; first++) {
    const line = lines[first];
    if (!line.trim() || line.startsWith('--') || sessionSetup.test(line) ||
      line === "SELECT pg_catalog.set_config('search_path', '', false);") continue;
    break;
  }
  const definition = lines.slice(first).join('\n').trim();
  if (!definition) throw new Error('PostgreSQL returned an empty table definition');
  return definition;
}
