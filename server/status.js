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
  if (["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "EHOSTUNREACH"].includes(code) || /timeout|terminated/i.test(msg)) {
    return "The server cannot reach the database. Check that a PostgreSQL service exists in the same Railway project and that DATABASE_URL points to it. The server keeps retrying.";
  }
  if (code === "28P01" || code === "28000" || /password authentication failed/i.test(msg)) {
    return "The database refused the username or password in DATABASE_URL. Set DATABASE_URL = ${{Postgres.DATABASE_URL}} again in Railway's Variables.";
  }
  if (code === "3D000") return "The database named in DATABASE_URL does not exist.";
  return "The database setup step failed. Open the deploy logs in Railway for the details.";
}

module.exports = { status, explain };
