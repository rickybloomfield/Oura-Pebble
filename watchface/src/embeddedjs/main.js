// Oura Scores Watchface — Watch Side (runs on Pebble)
// Uses Poco for rendering and pebble/message for phone communication.

import Poco from "commodetto/Poco";
import Message from "pebble/message";
import Timer from "timer";

const render = new Poco(screen);

const W = render.width;
const H = render.height;

// ---- Colors ----
const WHITE  = render.makeColor(255, 255, 255);
const BLACK  = render.makeColor(0, 0, 0);
const TRACK  = render.makeColor(225, 225, 225);  // ring background track
const DGRAY  = render.makeColor(110, 110, 110);  // labels
const MGRAY  = render.makeColor(130, 130, 130);  // secondary text
const GOLD   = render.makeColor(220, 180, 0);    // crown

function scoreColor(s) {
	if (s < 0)   return TRACK;
	if (s >= 85) return render.makeColor(0, 180, 80);   // excellent: green
	if (s >= 70) return render.makeColor(160, 200, 0);   // good: yellow-green
	if (s >= 60) return render.makeColor(240, 150, 0);   // fair: orange
	return            render.makeColor(210, 50, 50);      // poor: red
}

// ---- Fonts ----
const fontTime  = new render.Font("Bitham-Bold", 42);
const fontScore = new render.Font("Roboto-Condensed", 21);
const fontLabel = new render.Font("Gothic-Regular", 14);
const fontDate  = new render.Font("Gothic-Regular", 18);

// ---- Layout (triangle: two on top, one centered below) ----
const RING_R  = 36;                     // outer radius
const RING_W  = 7;                      // ring thickness
const RING_IR = RING_R - RING_W;        // inner radius

const TOP_Y   = 114;                    // vertical center of top rings
const BOT_Y   = 178;                    // vertical center of bottom ring
const TOP_X1  = (W >> 1) - 44;          // Readiness (left)
const TOP_X2  = (W >> 1) + 44;          // Sleep (right)
const BOT_X   = (W >> 1);              // Activity (center)

// ---- Update indicator ----
let _updateFlash = false;
let _flashTimer;

// ---- App state ----
let state = {
	sleep:     -1,
	readiness: -1,
	activity:  -1,
	auth:      true,
	loading:   true,
};

// ---- Icons (cy = top of icon, ~10px tall) ----
function drawCrown(cx, cy, color) {
	const b = cy + 8;
	const m = cy + 5;
	render.drawLine(cx - 7, b, cx - 5, cy, color, 2);
	render.drawLine(cx - 5, cy, cx - 2, m, color, 2);
	render.drawLine(cx - 2, m, cx, cy, color, 2);
	render.drawLine(cx, cy, cx + 2, m, color, 2);
	render.drawLine(cx + 2, m, cx + 5, cy, color, 2);
	render.drawLine(cx + 5, cy, cx + 7, b, color, 2);
	render.drawLine(cx - 7, b, cx + 7, b, color, 2);
}

function drawMoon(cx, cy, color) {
	// Crescent moon via two filled circles
	const my = cy + 5;
	render.drawCircle(color, cx - 1, my, 5);
	render.drawCircle(WHITE, cx + 3, my - 2, 5);
}

function drawLeaf(cx, cy, color) {
	// Sprouting plant / seedling
	// Stem
	render.drawLine(cx - 1, cy + 9, cx, cy + 3, color, 2);
	// Leaf curving up-right
	render.drawLine(cx, cy + 3, cx + 4, cy, color, 2);
	render.drawLine(cx + 4, cy, cx + 5, cy + 2, color, 2);
	render.drawLine(cx + 5, cy + 2, cx + 1, cy + 5, color, 2);
}

function drawShoe(cx, cy, color) {
	// Running shoe profile
	// Sole
	render.drawLine(cx - 6, cy + 8, cx + 3, cy + 8, color, 2);
	// Toe
	render.drawLine(cx + 3, cy + 8, cx + 6, cy + 5, color, 2);
	// Top
	render.drawLine(cx + 6, cy + 5, cx, cy + 3, color, 2);
	// Ankle
	render.drawLine(cx, cy + 3, cx - 4, cy, color, 2);
	// Heel
	render.drawLine(cx - 6, cy + 2, cx - 6, cy + 8, color, 2);
}

// ---- Ring (icon + score + label inside) ----
function drawRing(cx, cy, score, label, icon) {
	const sc = scoreColor(score);

	// Gray track (full circle)
	render.drawCircle(TRACK, cx, cy, RING_R);

	// Score arc
	if (score > 0) {
		const angle = Math.round(score * 360 / 100);
		render.drawCircle(sc, cx, cy, RING_R, 0, angle);
	}

	// White center (creates donut)
	render.drawCircle(WHITE, cx, cy, RING_IR);

	// Icon or crown
	if (score >= 85) {
		drawCrown(cx, cy - 20, GOLD);
	} else if (score >= 0) {
		icon(cx, cy - 20, BLACK);
	}

	// Score text + label
	const scoreText = (score >= 0) ? String(score) : "--";
	const tw = render.getTextWidth(scoreText, fontScore);
	render.drawText(scoreText, fontScore, BLACK, cx - (tw >> 1), cy - 6);

	const lw = render.getTextWidth(label, fontLabel);
	render.drawText(label, fontLabel, DGRAY, cx - (lw >> 1), cy + 10);
}

// ---- Time & date ----
function pad2(n) { return n < 10 ? "0" + n : String(n); }

function getTimeString() {
	const d = new Date();
	let h = d.getHours();
	const m = pad2(d.getMinutes());
	const ampm = h >= 12 ? "PM" : "AM";
	h = h % 12;
	if (h === 0) h = 12;
	return h + ":" + m;
}

function getDateString() {
	const d = new Date();
	const days  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
	const months = ["Jan","Feb","Mar","Apr","May","Jun",
	                "Jul","Aug","Sep","Oct","Nov","Dec"];
	return days[d.getDay()] + ", " + months[d.getMonth()] + " " + d.getDate();
}

// ---- Main draw ----
function draw() {
	render.begin(0, 0, W, H);
	render.fillRectangle(WHITE, 0, 0, W, H);

	// Time
	const timeStr = getTimeString();
	const tw = render.getTextWidth(timeStr, fontTime);
	render.drawText(timeStr, fontTime, BLACK, (W - tw) >> 1, 10);

	// Date
	const dateStr = getDateString();
	const dw = render.getTextWidth(dateStr, fontDate);
	render.drawText(dateStr, fontDate, BLACK, (W - dw) >> 1, 54);

	if (!state.auth) {
		const lines = ["Not connected.", "Open app settings", "to authorize Oura."];
		let ly = 136;
		for (let i = 0; i < lines.length; i++) {
			const lw = render.getTextWidth(lines[i], fontLabel);
			render.drawText(lines[i], fontLabel, DGRAY, (W - lw) >> 1, ly);
			ly += 18;
		}
	} else if (state.loading) {
		const msg = "Loading...";
		const mw = render.getTextWidth(msg, fontLabel);
		render.drawText(msg, fontLabel, MGRAY, (W - mw) >> 1, 142);
	} else {
		drawRing(TOP_X1, TOP_Y, state.readiness, "Ready", drawLeaf);
		drawRing(TOP_X2, TOP_Y, state.sleep, "Sleep", drawMoon);
		drawRing(BOT_X,  BOT_Y, state.activity, "Active", drawShoe);
	}

	if (_updateFlash)
		render.fillRectangle(render.makeColor(0, 180, 80), W - 14, 4, 8, 8);

	render.end();
}

// ---- Phone communication ----
const message = new Message({
	keys: ["SLEEP_SCORE", "READINESS_SCORE", "ACTIVITY_SCORE", "AUTH_STATUS", "REQUEST_SCORES"],

	onReadable() {
		const msg = this.read();
		msg.forEach((value, key) => {
			switch (key) {
				case "AUTH_STATUS":
					state.auth    = (value === 1);
					state.loading = false;
					break;
				case "SLEEP_SCORE":
					state.sleep   = value;
					state.loading = false;
					break;
				case "READINESS_SCORE":
					state.readiness = value;
					state.loading   = false;
					break;
				case "ACTIVITY_SCORE":
					state.activity  = value;
					state.loading   = false;
					break;
			}
		});
		_updateFlash = true;
		if (_flashTimer) Timer.clear(_flashTimer);
		_flashTimer = Timer.set(() => {
			_updateFlash = false;
			_flashTimer = undefined;
			draw();
		}, 2000);
		draw();
	},

	onWritable() {
		if (this.once) return;
		this.once = true;
		const m = new Map;
		m.set("REQUEST_SCORES", 1);
		this.write(m);
	},
});

let _refreshMin = 0;
watch.addEventListener("minutechange", () => {
	_refreshMin++;
	if (_refreshMin >= 30 && message.once) {
		_refreshMin = 0;
		const m = new Map;
		m.set("REQUEST_SCORES", 1);
		message.write(m);
	}
	draw();
});
draw();
