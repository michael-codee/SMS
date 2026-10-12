"use strict";
/*
 * Start-up state. The web server answers from the first second so the host's health check passes,
 * and anyone who opens the site while setup is unfinished sees what is wrong in plain words.
 */
const status = { ready: false, problem: "The server is starting.", adminProblem: null };

/* Turn a start-up error into a plain explanation. Never includes passwords or connection details. */
function explain(e) {
  const msg = String((e && e.message) || e);
  const code = e && e.code;
  if (/DATABASE_URL is not set/.test(msg)) {
    return "The DATABASE_URL setting is missing. In Railway, open this service's Variables and add DATABASE_URL = ${{Postgres.DATABASE_URL}}.";
  }
  if (code === "ENETUNREACH" || /ENETUNREACH/.test(msg)) {
    return "The database address cannot be reached from this host. On Supabase, use the Session pooler connection string (Connect, Session pooler), not the direct one.";
  }
  if (["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "EHOSTUNREACH"].includes(code) || /timeout|terminated/i.test(msg)) {
    return "The server cannot reach the database. Check that DATABASE_URL is right: on Railway, a PostgreSQL service in the same project and DATABASE_URL = ${{Postgres.DATABASE_URL}}; on Supabase, the Session pooler connection string. The server keeps retrying.";
  }
  if (/certificate/i.test(msg)) {
    return "The database's security certificate was not accepted. Check DATABASE_CA_CERT, or remove it to connect without checking the certificate.";
  }
  if (code === "28P01" || code === "28000" || /password authentication failed/i.test(msg)) {
    return "The database refused the username or password in DATABASE_URL. Copy the connection string again (on Supabase, put your database password in place of [YOUR-PASSWORD]).";
  }
  if (code === "3D000") return "The database named in DATABASE_URL does not exist.";
  return "The database setup step failed. Open the deploy logs in Railway for the details.";
}

module.exports = { status, explain };
