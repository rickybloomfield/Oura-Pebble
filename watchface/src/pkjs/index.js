// Oura Scores Watchface — Phone Side (runs inside the Pebble mobile app)
// Handles OAuth 2.0, Oura API fetching, and sending scores to the watch.

// Credentials are loaded from config.js (gitignored).
// Copy src/pkjs/config.example.js → src/pkjs/config.js and fill in your values.
var cfg = require('./config');

var CLIENT_ID     = cfg.CLIENT_ID;
var CLIENT_SECRET = cfg.CLIENT_SECRET;
var REDIRECT_URI  = cfg.REDIRECT_URI;
var SCOPE         = 'daily';

// ---- OAuth endpoints ----
const AUTHORIZE_URL = 'https://cloud.ouraring.com/oauth/authorize';
const TOKEN_URL     = 'https://api.ouraring.com/oauth/token';

// ---- Oura API base ----
const API_BASE = 'https://api.ouraring.com/v2/usercollection';

// ---- Token storage helpers (localStorage on the phone) ----
function getAccessToken()  { return localStorage.getItem('oura_access_token');  }
function getRefreshToken() { return localStorage.getItem('oura_refresh_token'); }

function storeTokens(access, refresh, expiresIn) {
	localStorage.setItem('oura_access_token', access);
	if (refresh)    localStorage.setItem('oura_refresh_token', refresh);
	if (expiresIn)  localStorage.setItem('oura_token_expiry',
	                    String(Date.now() + expiresIn * 1000));
}

function isTokenExpired() {
	const expiry = localStorage.getItem('oura_token_expiry');
	if (!expiry) return true;                // no expiry stored → assume expired
	return Date.now() > parseInt(expiry, 10) - 60000;  // refresh 1min early
}

// ---- Score cache helpers (localStorage on the phone) ----
function getCachedScores() {
	const raw = localStorage.getItem('oura_cached_scores');
	if (!raw) return null;
	try { return JSON.parse(raw); } catch (e) { return null; }
}

function cacheScores(sleep, readiness, activity) {
	localStorage.setItem('oura_cached_scores', JSON.stringify({
		sleep: sleep, readiness: readiness, activity: activity
	}));
}

function sendCachedScores() {
	const cached = getCachedScores();
	if (!cached) return;
	console.log('[Oura] Sending cached scores — Sleep: ' + cached.sleep
	          + ', Readiness: ' + cached.readiness
	          + ', Activity: ' + cached.activity);
	Pebble.sendAppMessage({
		AUTH_STATUS:     1,
		SLEEP_SCORE:     cached.sleep,
		READINESS_SCORE: cached.readiness,
		ACTIVITY_SCORE:  cached.activity,
	});
}

// ---- Date helper ----
function pad(n) { return n < 10 ? '0' + n : '' + n; }

function todayISO() {
	const d = new Date();
	return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function yesterdayISO() {
	const d = new Date();
	d.setDate(d.getDate() - 1);
	return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function tomorrowISO() {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// ---- HTTP helper ----
function xhrGet(url, token, callback) {
	const xhr = new XMLHttpRequest();
	xhr.open('GET', url);
	xhr.setRequestHeader('Authorization', 'Bearer ' + token);
	xhr.onload = function () {
		if (xhr.status === 401) {
			callback(null, 'unauthorized');
		} else if (xhr.status === 200) {
			try { callback(JSON.parse(xhr.responseText), null); }
			catch (e) { callback(null, 'parse_error'); }
		} else {
			callback(null, 'http_' + xhr.status);
		}
	};
	xhr.onerror = function () { callback(null, 'network_error'); };
	xhr.send();
}

function xhrPost(url, body, callback) {
	const xhr = new XMLHttpRequest();
	xhr.open('POST', url);
	xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
	xhr.onload = function () {
		if (xhr.status === 200) {
			try { callback(JSON.parse(xhr.responseText), null); }
			catch (e) { callback(null, 'parse_error'); }
		} else {
			callback(null, 'http_' + xhr.status);
		}
	};
	xhr.onerror = function () { callback(null, 'network_error'); };
	xhr.send(body);
}

// ---- OAuth: exchange auth code for tokens ----
function exchangeCode(code, callback) {
	const body = 'grant_type=authorization_code'
	           + '&code=' + encodeURIComponent(code)
	           + '&client_id=' + encodeURIComponent(CLIENT_ID)
	           + '&client_secret=' + encodeURIComponent(CLIENT_SECRET)
	           + '&redirect_uri=' + encodeURIComponent(REDIRECT_URI);

	xhrPost(TOKEN_URL, body, function (data, err) {
		if (err || !data || !data.access_token) {
			console.log('[Oura] Token exchange failed: ' + (err || 'no access_token'));
			callback(false);
		} else {
			storeTokens(data.access_token, data.refresh_token, data.expires_in);
			console.log('[Oura] Tokens stored. Expires in ' + data.expires_in + 's');
			callback(true);
		}
	});
}

// ---- OAuth: refresh an expiring access token ----
function refreshAccessToken(callback) {
	const rt = getRefreshToken();
	if (!rt) { callback(false); return; }

	const body = 'grant_type=refresh_token'
	           + '&refresh_token=' + encodeURIComponent(rt)
	           + '&client_id=' + encodeURIComponent(CLIENT_ID)
	           + '&client_secret=' + encodeURIComponent(CLIENT_SECRET);

	xhrPost(TOKEN_URL, body, function (data, err) {
		if (err || !data || !data.access_token) {
			console.log('[Oura] Token refresh failed: ' + (err || 'no access_token'));
			// Clear stale tokens so user is prompted to re-auth
			localStorage.removeItem('oura_access_token');
			localStorage.removeItem('oura_refresh_token');
			callback(false);
		} else {
			storeTokens(data.access_token, data.refresh_token, data.expires_in);
			console.log('[Oura] Token refreshed successfully.');
			callback(true);
		}
	});
}

// ---- Get a valid token, refreshing if needed ----
function withValidToken(callback) {
	const token = getAccessToken();
	if (!token) {
		console.log('[Oura] No access token stored — user must authorize.');
		Pebble.sendAppMessage({ AUTH_STATUS: 0 });
		return;
	}
	if (isTokenExpired()) {
		console.log('[Oura] Token expired — attempting refresh.');
		refreshAccessToken(function (success) {
			if (success) { callback(getAccessToken()); }
			else         { Pebble.sendAppMessage({ AUTH_STATUS: 0 }); }
		});
	} else {
		callback(token);
	}
}

// ---- Oura API: fetch one endpoint ----
function fetchScore(path, token, callback, date) {
	date = date || todayISO();
	const url  = API_BASE + path + '?start_date=' + date + '&end_date=' + date;
	xhrGet(url, token, function (data, err) {
		if (err === 'unauthorized') { callback(null, true); return; }
		if (err || !data || !data.data || data.data.length === 0) {
			callback(-1, false);
		} else {
			const score = data.data[0].score;
			callback((score != null) ? score : -1, false);
		}
	});
}

// ---- Fetch all three scores and send to watch ----
function doFetchAndSend(token) {
	fetchScore('/daily_sleep', token, function (sleepScore, unauth) {
		if (unauth) { handleUnauth(); return; }

		fetchScore('/daily_readiness', token, function (readinessScore, unauth2) {
			if (unauth2) { handleUnauth(); return; }

			// Query activity from yesterday to tomorrow to handle timezone edge cases
			var actUrl = API_BASE + '/daily_activity?start_date=' + yesterdayISO() + '&end_date=' + tomorrowISO();
			xhrGet(actUrl, token, function (data, err) {
				if (err === 'unauthorized') { handleUnauth(); return; }

				var activityScore = -1;
				if (!err && data && data.data && data.data.length > 0) {
					// Take the latest entry with a valid score
					for (var i = data.data.length - 1; i >= 0; i--) {
						if (data.data[i].score != null) {
							activityScore = data.data[i].score;
							break;
						}
					}
				}

				cacheScores(sleepScore, readinessScore, activityScore);
				console.log('[Oura] Scores — Sleep: ' + sleepScore
				          + ', Readiness: ' + readinessScore
				          + ', Activity: ' + activityScore);
				Pebble.sendAppMessage({
					AUTH_STATUS:     1,
					SLEEP_SCORE:     sleepScore,
					READINESS_SCORE: readinessScore,
					ACTIVITY_SCORE:  activityScore,
				});
			});
		});
	});
}

// On 401, try refreshing the token once before giving up
var _retrying = false;
function handleUnauth() {
	if (_retrying) {
		console.log('[Oura] Still unauthorized after refresh — user must re-auth.');
		_retrying = false;
		Pebble.sendAppMessage({ AUTH_STATUS: 0 });
		return;
	}
	console.log('[Oura] Got 401 — attempting token refresh.');
	_retrying = true;
	refreshAccessToken(function (success) {
		if (success) {
			doFetchAndSend(getAccessToken());
		} else {
			_retrying = false;
			Pebble.sendAppMessage({ AUTH_STATUS: 0 });
		}
	});
}

function fetchAndSend(token) {
	_retrying = false;
	doFetchAndSend(token);
}

// ---- Simulator detection ----
function isSimulator() {
	var token = Pebble.getAccountToken();
	// Emulator returns a dummy token like "0123456789abcdef0123456789abcdef"
	return !token || /^0+$/.test(token) || token === '0123456789abcdef0123456789abcdef';
}

function sendMockScores() {
	console.log('[Oura] Simulator detected — sending mock scores.');
	Pebble.sendAppMessage({
		AUTH_STATUS:     1,
		SLEEP_SCORE:     88,
		READINESS_SCORE: 72,
		ACTIVITY_SCORE:  65,
	});
}

// ---- Pebble lifecycle events ----

// ---- Periodic refresh (every 30 minutes) ----
var REFRESH_INTERVAL = 30 * 60 * 1000;

function refreshScores() {
	if (isSimulator()) { sendMockScores(); return; }
	withValidToken(function (token) {
		fetchAndSend(token);
	});
}

// Phone is ready — send cached scores immediately, then fetch fresh
Pebble.addEventListener('ready', function () {
	console.log('[Oura] pkjs ready.');
	if (isSimulator()) { sendMockScores(); return; }
	sendCachedScores();
	refreshScores();
	setInterval(refreshScores, REFRESH_INTERVAL);
});

// Watch requested a refresh (sends REQUEST_SCORES: 1 via pebble/message)
Pebble.addEventListener('appmessage', function (e) {
	if (e.payload.REQUEST_SCORES) {
		sendCachedScores();
		refreshScores();
	}
});

// User opens app settings in the Pebble app — kick off the OAuth flow
Pebble.addEventListener('showConfiguration', function () {
	const authUrl = AUTHORIZE_URL
	              + '?response_type=code'
	              + '&client_id=' + encodeURIComponent(CLIENT_ID)
	              + '&redirect_uri=' + encodeURIComponent(REDIRECT_URI)
	              + '&scope=' + SCOPE;

	console.log('[Oura] Opening authorization URL.');
	Pebble.openURL(authUrl);
});

// Pebble app returns from the OAuth webview
// config/index.html redirects to pebblejs://close#{"code":"..."}
Pebble.addEventListener('webviewclosed', function (e) {
	if (!e.response || e.response === 'CANCELLED') return;

	try {
		const data = JSON.parse(decodeURIComponent(e.response));
		if (data.code) {
			console.log('[Oura] Received auth code — exchanging for tokens.');
			exchangeCode(data.code, function (success) {
				if (success) {
					withValidToken(function (token) { fetchAndSend(token); });
				} else {
					Pebble.sendAppMessage({ AUTH_STATUS: 0 });
				}
			});
		}
	} catch (err) {
		console.log('[Oura] webviewclosed parse error: ' + err);
	}
});
