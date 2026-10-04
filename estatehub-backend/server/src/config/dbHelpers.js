// src/config/dbHelpers.js
// Pure helpers for the PostgreSQL layer (no `pg` import, so they are unit-testable anywhere):
//   - compileNamed():   ':name' placeholders -> '$1, $2 ...' (values are ALWAYS bound, never interpolated)
//   - type parsers:     keep the API's historical value formats (see below)
//   - redactDbError():  safe-to-log / safe-to-return error text (never contains credentials)

/**
 * Converts a query written with :named placeholders into pg's positional form.
 *
 *   compileNamed('SELECT * FROM users WHERE email = :email AND role = :role', { email, role })
 *   -> { text: 'SELECT * FROM users WHERE email = $1 AND role = $2', values: [email, role] }
 *
 * - The same name used twice reuses the same $n.
 * - '::' casts, single-quoted strings, "quoted identifiers", -- line comments and /* block comments *\/ are skipped,
 *   so a literal like 'a:b' or a cast like x::text is never mistaken for a placeholder.
 * - A placeholder with no matching key in `params` throws (a typo must never silently become NULL).
 * - `undefined` values are bound as NULL; every other value is passed to pg untouched (pg parameterizes it).
 * - If `params` is an array (or omitted) the query is assumed to already be positional and is returned as-is.
 */
function compileNamed(sql, params) {
  if (params === undefined || params === null || Array.isArray(params)) {
    return { text: sql, values: params || [] };
  }
  const order = new Map(); // name -> index (1-based)
  const values = [];
  let out = '';
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === "'" || ch === '"') {
      // quoted string / identifier; doubled quote is an escaped quote
      let j = i + 1;
      while (j < n) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) { j += 2; continue; }
          break;
        }
        j += 1;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '-' && next === '-') {
      let j = sql.indexOf('\n', i);
      if (j === -1) j = n;
      out += sql.slice(i, j);
      i = j;
    } else if (ch === '/' && next === '*') {
      let j = sql.indexOf('*/', i + 2);
      j = j === -1 ? n : j + 2;
      out += sql.slice(i, j);
      i = j;
    } else if (ch === ':' && next === ':') {
      out += '::';
      i += 2;
    } else if (ch === ':' && /[A-Za-z_]/.test(next || '')) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(sql[j])) j += 1;
      const name = sql.slice(i + 1, j);
      if (!Object.prototype.hasOwnProperty.call(params, name)) {
        throw new Error(`Missing value for SQL parameter :${name}`);
      }
      if (!order.has(name)) {
        values.push(params[name] === undefined ? null : params[name]);
        order.set(name, values.length);
      }
      out += `$${order.get(name)}`;
      i = j;
    } else {
      out += ch;
      i += 1;
    }
  }
  return { text: out, values };
}

// ---------------------------------------------------------------------------------------------
// Value formats. The MySQL driver ran with dateStrings:true and returned DATE/TIMESTAMP columns as
// plain strings ('YYYY-MM-DD' / 'YYYY-MM-DD HH:MM:SS', UTC) and COUNT(*) as a JS number. The React app
// and utils/appointmentRules.js depend on those shapes, so the pg driver is told to produce the same.
// DECIMAL/NUMERIC stays a string (exactly what mysql2 returned for DECIMAL), so money never loses precision.
// ---------------------------------------------------------------------------------------------
const OID = { INT8: 20, DATE: 1082, TIMESTAMP: 1114, TIMESTAMPTZ: 1184 };

/** int8 (COUNT(*), SUM of ints) -> Number when exactly representable, else the original string. */
function parseBigint(text) {
  const num = Number(text);
  return Number.isSafeInteger(num) ? num : text;
}

/** 'YYYY-MM-DD' stays a string (no JS Date, no timezone shifting). */
function parseDate(text) {
  return text;
}

/** timestamp WITHOUT time zone (appointments.scheduled_at: UTC clock digits) -> 'YYYY-MM-DD HH:MM:SS'. */
function parseTimestamp(text) {
  if (typeof text !== 'string') return text;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?$/.exec(text);
  return m ? `${m[1]} ${m[2]}` : text; // 'infinity' etc. pass through unchanged
}

const TSTZ_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2})(?::?(\d{2}))?)?$/;

/**
 * timestamptz -> 'YYYY-MM-DD HH:MM:SS' in UTC, whatever the session TimeZone is (Neon sessions are
 * UTC by default, but this does not rely on it). Built with Date.UTC + the explicit offset, so no
 * locale/format-dependent Date parsing is involved.
 */
function parseTimestamptz(text) {
  if (typeof text !== 'string') return text;
  const m = TSTZ_RE.exec(text);
  if (!m) return text;
  let ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  if (m[7]) {
    const offsetMinutes = (+m[8]) * 60 + (+(m[9] || 0));
    ms -= (m[7] === '+' ? 1 : -1) * offsetMinutes * 60 * 1000;
  }
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/** Builds the `types` option for pg's Pool from pg's own default type registry. */
function buildTypeParsers(pgTypes) {
  const overrides = {
    [OID.INT8]: parseBigint,
    [OID.DATE]: parseDate,
    [OID.TIMESTAMP]: parseTimestamp,
    [OID.TIMESTAMPTZ]: parseTimestamptz,
  };
  return {
    getTypeParser(oid, format) {
      if (format !== 'binary' && overrides[oid]) return overrides[oid];
      return pgTypes.getTypeParser(oid, format);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Error text that is safe to log or return from /api/health. pg errors do not normally contain the
// password, but connection-string parse errors can echo the URL, so anything URL-shaped is masked.
// ---------------------------------------------------------------------------------------------
function redact(text) {
  return String(text || '')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s'"]+/gi, '[redacted-url]')
    .replace(/password=[^\s&'"]+/gi, 'password=[redacted]');
}

/** { code, message } with no credentials. `code` is the pg SQLSTATE or the Node network error code. */
function redactDbError(err) {
  const aggregate = err && Array.isArray(err.errors) && err.errors.length ? err.errors[0] : null;
  const code = (err && err.code) || (aggregate && aggregate.code) || undefined;
  const message = redact((err && err.message) || (aggregate && aggregate.message) || 'Unknown database error');
  return { code, message: code && !message.includes(code) ? `${message} (${code})` : message };
}

module.exports = {
  compileNamed,
  buildTypeParsers,
  parseBigint,
  parseDate,
  parseTimestamp,
  parseTimestamptz,
  redact,
  redactDbError,
  OID,
};
