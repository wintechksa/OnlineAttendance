(function () {
  'use strict';
  var SESSION_KEY = 'oa_supabase_session';
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch (_) { return null; }
  }
  function getConfig() {
    var defaults = window.__OA_SUPABASE__ || {};
    var saved;
    try { saved = JSON.parse(localStorage.getItem('oa_supabase_config') || 'null'); } catch (_) {}
    return Object.assign({}, defaults, saved && saved.supabaseUrl && saved.supabaseAnonKey ? saved : {});
  }
  async function request(action, payload) {
    var config = getConfig();
    if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error('Unable to connect. Please contact your administrator.');
    var session = getSession();
    var response;
    try {
      response = await fetch(config.supabaseUrl.replace(/\/$/, '') + '/functions/v1/attendance-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: config.supabaseAnonKey, Authorization: 'Bearer ' + config.supabaseAnonKey },
        body: JSON.stringify(Object.assign({}, payload, { action: action, token: session && session.sessionToken })),
        signal: AbortSignal.timeout(30000)
      });
    } catch (_) { throw new Error('Cannot reach the server. Check your connection and try again.'); }
    var result;
    try { result = await response.json(); } catch (_) { throw new Error('The server returned an unexpected response. Please try again.'); }
    if (!response.ok || result.error) {
      if (response.status === 401 && action !== 'login' && action !== 'signup') localStorage.removeItem(SESSION_KEY);
      throw new Error(result.error || 'Request failed. Please try again.');
    }
    return result.data;
  }
  // Compatibility for existing screens; every query is authorized on the server.
  function from(table) {
    var query = { table: table, operation: 'select', filters: [] };
    var pending;
    var builder = {
      select: function (columns) { query.columns = columns; return builder; },
      eq: function (column, value) { query.filters.push({ column: column, value: value }); return builder; },
      order: function (column, options) { query.order = { column: column, ascending: !options || options.ascending !== false }; return builder; },
      insert: function (rows) { query.operation = 'insert'; query.rows = rows; return builder; },
      update: function (rows) { query.operation = 'update'; query.rows = rows; return builder; },
      upsert: function (rows, options) { query.operation = 'upsert'; query.rows = rows; query.onConflict = options && options.onConflict; return builder; },
      delete: function () { query.operation = 'delete'; return builder; },
      maybeSingle: function () { query.single = true; return builder; },
      then: function (resolve, reject) {
        if (!pending) pending = request('query', query).then(function (data) { return { data: data, error: null }; }, function (error) { return { data: null, error: error }; });
        return pending.then(resolve, reject);
      }
    };
    return builder;
  }
  async function logout(destination) {
    try { await request('logout'); } catch (_) {} finally {
      localStorage.removeItem(SESSION_KEY);
      window.location.href = destination || './login.html';
    }
  }
  window.OAPortal = { request: request, from: from, getSession: getSession, getConfig: getConfig, logout: logout };
})();
