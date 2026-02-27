// Oura App — Phone Side (runs inside the Pebble mobile app)
// Handles OAuth 2.0, Oura API fetching, and sending scores + history to the watch.

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

// ---- Date helpers ----
function pad(n) { return n < 10 ? '0' + n : '' + n; }

function dateISO(d) {
	return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function todayISO() { return dateISO(new Date()); }

function daysAgoISO(n) {
	var d = new Date();
	d.setDate(d.getDate() - n);
	return dateISO(d);
}

function tomorrowISO() {
	var d = new Date();
	d.setDate(d.getDate() + 1);
	return dateISO(d);
}

// ---- HTTP helpers ----
function xhrGet(url, token, callback) {
	var xhr = new XMLHttpRequest();
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
	var xhr = new XMLHttpRequest();
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
	var body = 'grant_type=authorization_code'
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
function refreshAccessToken(callback, _attempt) {
	_attempt = _attempt || 1;
	var rt = getRefreshToken();
	if (!rt) { callback(false); return; }

	var body = 'grant_type=refresh_token'
	         + '&refresh_token=' + encodeURIComponent(rt)
	         + '&client_id=' + encodeURIComponent(CLIENT_ID)
	         + '&client_secret=' + encodeURIComponent(CLIENT_SECRET);

	xhrPost(TOKEN_URL, body, function (data, err) {
		if (err || !data || !data.access_token) {
			console.log('[Oura] Token refresh failed (attempt ' + _attempt + '): ' + (err || 'no access_token'));
			// Retry on transient errors up to 3 times
			if (_attempt < 3 && err && (err === 'network_error' || err === 'parse_error')) {
				console.log('[Oura] Retrying refresh in 5s...');
				setTimeout(function() { refreshAccessToken(callback, _attempt + 1); }, 5000);
				return;
			}
			// Only wipe tokens on definitive server rejection, not transient errors
			if (!err || (err !== 'network_error' && err !== 'parse_error')) {
				console.log('[Oura] Server rejected refresh — clearing tokens.');
				localStorage.removeItem('oura_access_token');
				localStorage.removeItem('oura_refresh_token');
			} else {
				console.log('[Oura] Transient error — keeping tokens for next cycle.');
			}
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
	var token = getAccessToken();
	if (!token) {
		console.log('[Oura] No access token stored — user must authorize.');
		Pebble.sendAppMessage({ AUTH_STATUS: 0 });
		return;
	}
	if (isTokenExpired()) {
		console.log('[Oura] Token expired — attempting refresh.');
		refreshAccessToken(function (success) {
			if (success) {
				callback(getAccessToken());
			} else if (getRefreshToken()) {
				// Transient failure — tokens kept, will retry next cycle
				console.log('[Oura] Refresh failed (transient) — will retry next cycle.');
			} else {
				Pebble.sendAppMessage({ AUTH_STATUS: 0 });
			}
		});
	} else {
		callback(token);
	}
}

// ---- Fetch a range of data from an API endpoint ----
function fetchRange(path, token, startDate, endDate, callback) {
	var url = API_BASE + path + '?start_date=' + startDate + '&end_date=' + endDate;
	xhrGet(url, token, function (data, err) {
		if (err === 'unauthorized') { callback(null, true); return; }
		if (err || !data || !data.data) {
			callback([], false);
		} else {
			callback(data.data, false);
		}
	});
}

// ---- Build a 7-day array from API data, mapping by date ----
// Returns array of 7 values (index 0 = 6 days ago, index 6 = today)
function buildHistory(records, field, defaultVal) {
	defaultVal = (defaultVal !== undefined) ? defaultVal : -1;
	var result = [];
	var dateMap = {};
	for (var i = 0; i < records.length; i++) {
		var day = records[i].day;
		dateMap[day] = records[i];
	}
	for (var d = 6; d >= 0; d--) {
		var key = daysAgoISO(d);
		var rec = dateMap[key];
		if (rec && rec[field] != null) {
			result.push(rec[field]);
		} else {
			result.push(defaultVal);
		}
	}
	return result;
}

// ---- Get latest record with a valid field value ----
function getLatest(records, field) {
	for (var i = records.length - 1; i >= 0; i--) {
		if (records[i][field] != null) return records[i][field];
	}
	return -1;
}

// ---- Get latest record object ----
function getLatestRecord(records) {
	if (!records || records.length === 0) return null;
	return records[records.length - 1];
}

// ---- Fetch all data and send to watch ----
var _retrying = false;

function fetchAndSend(token) {
	_retrying = false;
	doFetchAndSend(token);
}

function doFetchAndSend(token) {
	var startDate = daysAgoISO(7);  // extra day for timezone edge cases
	var endDate = tomorrowISO();
	var pending = 5;
	var unauthorized = false;

	var dailySleep = [];
	var dailyReadiness = [];
	var dailyActivity = [];
	var dailyStress = [];
	var sleepPeriods = [];

	function done() {
		pending--;
		if (pending > 0) return;

		if (unauthorized) {
			if (_retrying) {
				console.log('[Oura] Still unauthorized after refresh — user must re-auth.');
				_retrying = false;
				Pebble.sendAppMessage({ AUTH_STATUS: 0 });
			} else {
				console.log('[Oura] Got 401 — attempting token refresh.');
				_retrying = true;
				refreshAccessToken(function (success) {
					if (success) {
						doFetchAndSend(getAccessToken());
					} else if (getRefreshToken()) {
						_retrying = false;
						console.log('[Oura] Refresh failed (transient) — will retry next cycle.');
					} else {
						_retrying = false;
						Pebble.sendAppMessage({ AUTH_STATUS: 0 });
					}
				});
			}
			return;
		}

		// Build history arrays (7 days)
		var sleepHist = buildHistory(dailySleep, 'score');
		var readinessHist = buildHistory(dailyReadiness, 'score');
		var activityHist = buildHistory(dailyActivity, 'score');
		var stressHighHist = buildHistory(dailyStress, 'stress_high', 0);
		var stressRestoreHist = buildHistory(dailyStress, 'recovery_high', 0);

		// Convert stress from seconds to minutes
		for (var s = 0; s < 7; s++) {
			stressHighHist[s] = (stressHighHist[s] > 0) ? Math.round(stressHighHist[s] / 60) : 0;
			stressRestoreHist[s] = (stressRestoreHist[s] > 0) ? Math.round(stressRestoreHist[s] / 60) : 0;
		}

		// Today's scores
		var sleepScore = sleepHist[6];
		var readinessScore = readinessHist[6];
		var activityScore = activityHist[6];

		// Detailed metrics from sleep period data
		var latestSleep = getLatestRecord(sleepPeriods);
		var sleepTotal = -1, sleepInBed = -1, sleepEfficiency = -1, sleepHR = -1;
		if (latestSleep) {
			sleepTotal = (latestSleep.total_sleep_duration != null) ?
				Math.round(latestSleep.total_sleep_duration / 60) : -1;
			sleepInBed = (latestSleep.time_in_bed != null) ?
				Math.round(latestSleep.time_in_bed / 60) : -1;
			sleepEfficiency = (latestSleep.efficiency != null) ?
				latestSleep.efficiency : -1;
			sleepHR = (latestSleep.average_heart_rate != null) ?
				Math.round(latestSleep.average_heart_rate) : -1;
		}

		// Readiness metrics from sleep period data + readiness data
		var readinessHR = sleepHR; // same source
		var readinessHRV = -1, readinessResp = -1;
		if (latestSleep) {
			readinessHRV = (latestSleep.average_hrv != null) ?
				Math.round(latestSleep.average_hrv) : -1;
			readinessResp = (latestSleep.average_breath != null) ?
				Math.round(latestSleep.average_breath * 10) : -1;
		}

		// Temperature deviation from readiness data
		var readinessTemp = -100; // sentinel for missing
		var latestReadiness = getLatestRecord(dailyReadiness);
		if (latestReadiness && latestReadiness.temperature_deviation != null) {
			readinessTemp = Math.round(latestReadiness.temperature_deviation * 10);
		}

		// Activity metrics
		var latestActivity = getLatestRecord(dailyActivity);
		var actCal = -1, actGoalCal = -1, actBurn = -1, actTime = -1, actSteps = -1;
		if (latestActivity) {
			actCal = (latestActivity.active_calories != null) ?
				latestActivity.active_calories : -1;
			actGoalCal = (latestActivity.target_calories != null) ?
				latestActivity.target_calories : -1;
			actBurn = (latestActivity.total_calories != null) ?
				latestActivity.total_calories : -1;
			actSteps = (latestActivity.steps != null) ?
				latestActivity.steps : -1;
			// Activity time: high + medium activity time in minutes
			var highTime = latestActivity.high_activity_time || 0;
			var medTime = latestActivity.medium_activity_time || 0;
			actTime = Math.round((highTime + medTime) / 60);
		}

		// Build message
		var msg = {
			AUTH_STATUS: 1,
			SLEEP_SCORE: sleepScore,
			READINESS_SCORE: readinessScore,
			ACTIVITY_SCORE: activityScore,
			SLEEP_TOTAL: sleepTotal,
			SLEEP_IN_BED: sleepInBed,
			SLEEP_EFFICIENCY: sleepEfficiency,
			SLEEP_HR: sleepHR,
			READINESS_HR: readinessHR,
			READINESS_HRV: readinessHRV,
			READINESS_TEMP: readinessTemp,
			READINESS_RESP: readinessResp,
			ACTIVITY_CAL: actCal,
			ACTIVITY_GOAL_CAL: actGoalCal,
			ACTIVITY_BURN: actBurn,
			ACTIVITY_TIME: actTime,
			ACTIVITY_STEPS: actSteps,
		};

		// Add history arrays using integer key IDs
		// (appKeys doesn't include array element entries, only base keys)
		// Base IDs from generated appinfo.json messageKeys:
		var HIST = { SL: 10000, RD: 10007, AC: 10014, SH: 10021, SR: 10028 };
		for (var i = 0; i < 7; i++) {
			msg[HIST.SL + i] = sleepHist[i];
			msg[HIST.RD + i] = readinessHist[i];
			msg[HIST.AC + i] = activityHist[i];
			msg[HIST.SH + i] = stressHighHist[i];
			msg[HIST.SR + i] = stressRestoreHist[i];
		}

		console.log('[Oura] Sending — Sleep: ' + sleepScore
		          + ', Readiness: ' + readinessScore
		          + ', Activity: ' + activityScore);

		Pebble.sendAppMessage(msg, function () {
			console.log('[Oura] Message sent successfully.');
		}, function (e) {
			console.log('[Oura] Message send failed: ' + JSON.stringify(e));
		});
	}

	fetchRange('/daily_sleep', token, startDate, endDate, function (data, unauth) {
		if (unauth) unauthorized = true;
		else dailySleep = data;
		done();
	});

	fetchRange('/daily_readiness', token, startDate, endDate, function (data, unauth) {
		if (unauth) unauthorized = true;
		else dailyReadiness = data;
		done();
	});

	fetchRange('/daily_activity', token, startDate, endDate, function (data, unauth) {
		if (unauth) unauthorized = true;
		else dailyActivity = data;
		done();
	});

	fetchRange('/daily_stress', token, startDate, endDate, function (data, unauth) {
		if (unauth) unauthorized = true;
		else dailyStress = data;
		done();
	});

	fetchRange('/sleep', token, startDate, endDate, function (data, unauth) {
		if (unauth) unauthorized = true;
		else sleepPeriods = data;
		done();
	});
}

// ---- Simulator detection ----
function isSimulator() {
	var token = Pebble.getAccountToken();
	// Only match known emulator patterns — default to real device
	// (Rebble may return null/empty on real hardware)
	if (typeof token !== 'string' || token.length === 0) return false;
	return /^0+$/.test(token) || token === '0123456789abcdef0123456789abcdef';
}

function sendMockData() {
	console.log('[Oura] Simulator detected — sending mock data.');
	var msg = {
		AUTH_STATUS: 1,
		SLEEP_SCORE: 88,
		READINESS_SCORE: 72,
		ACTIVITY_SCORE: 65,
		SLEEP_TOTAL: 432,      // 7h 12m
		SLEEP_IN_BED: 480,     // 8h
		SLEEP_EFFICIENCY: 90,
		SLEEP_HR: 58,
		READINESS_HR: 58,
		READINESS_HRV: 45,
		READINESS_TEMP: -2,    // -0.2 C
		READINESS_RESP: 158,   // 15.8 breaths/min
		ACTIVITY_CAL: 320,
		ACTIVITY_GOAL_CAL: 500,
		ACTIVITY_BURN: 2100,
		ACTIVITY_TIME: 45,
		ACTIVITY_STEPS: 8432,
	};

	// Mock history arrays
	var sleepHist     = [75, 82, 90, 68, 85, 79, 88];
	var readinessHist = [80, 65, 72, 78, 60, 85, 72];
	var activityHist  = [55, 70, 45, 80, 62, 75, 65];
	var stressHigh    = [25, 40, 30, 15, 45, 35, 20];
	var stressRestore = [60, 45, 55, 70, 35, 50, 65];

	var HIST = { SL: 10000, RD: 10007, AC: 10014, SH: 10021, SR: 10028 };
	for (var i = 0; i < 7; i++) {
		msg[HIST.SL + i] = sleepHist[i];
		msg[HIST.RD + i] = readinessHist[i];
		msg[HIST.AC + i] = activityHist[i];
		msg[HIST.SH + i] = stressHigh[i];
		msg[HIST.SR + i] = stressRestore[i];
	}

	Pebble.sendAppMessage(msg);
}

// ---- Pebble lifecycle events ----

var REFRESH_INTERVAL = 30 * 60 * 1000;

function refreshScores() {
	if (isSimulator()) { sendMockData(); return; }
	withValidToken(function (token) {
		fetchAndSend(token);
	});
}

Pebble.addEventListener('ready', function () {
	console.log('[Oura] pkjs ready.');
	if (isSimulator()) { sendMockData(); return; }
	refreshScores();
	setInterval(refreshScores, REFRESH_INTERVAL);
});

Pebble.addEventListener('appmessage', function (e) {
	if (e.payload.REQUEST_SCORES) {
		refreshScores();
	}
});

Pebble.addEventListener('showConfiguration', function () {
	var authUrl = AUTHORIZE_URL
	            + '?response_type=code'
	            + '&client_id=' + encodeURIComponent(CLIENT_ID)
	            + '&redirect_uri=' + encodeURIComponent(REDIRECT_URI)
	            + '&scope=' + encodeURIComponent(SCOPE);

	console.log('[Oura] Opening authorization URL.');
	Pebble.openURL(authUrl);
});

Pebble.addEventListener('webviewclosed', function (e) {
	if (!e.response || e.response === 'CANCELLED') return;

	try {
		var data = JSON.parse(decodeURIComponent(e.response));
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
