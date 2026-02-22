// Oura Scores Watchface — Watch Side (runs on Pebble)
// Uses Poco for rendering and pebble/message for phone communication.

import Poco from "commodetto/Poco";
import Message from "pebble/message";

const render = new Poco(screen);

const W = render.width;
const H = render.height;

// ---- Colors ----
const WHITE  = render.makeColor(255, 255, 255);
const BLACK  = render.makeColor(0, 0, 0);
const TRACK  = render.makeColor(225, 225, 225);  // ring background track
const DGRAY  = render.makeColor(110, 110, 110);  // labels
const MGRAY  = render.makeColor(160, 160, 160);  // secondary text
const GOLD   = render.makeColor(220, 180, 0);    // crown

function scoreColor(s) {
	if (s < 0)   return TRACK;
	if (s >= 85) return render.makeColor(0, 180, 80);   // excellent: green
	if (s >= 70) return render.makeColor(160, 200, 0);   // good: yellow-green
	if (s >= 60) return render.makeColor(240, 150, 0);   // fair: orange
	return            render.makeColor(210, 50, 50);      // poor: red
}

// ---- Fonts ----
const fontTime  = new render.Font("Bitham-Black", 36);
const fontScore = new render.Font("Roboto-Condensed", 21);
const fontLabel = new render.Font("Gothic-Regular", 14);
const fontDate  = new render.Font("Gothic-Regular", 14);

// ---- Layout ----
const RING_R  = 28;                     // outer radius
const RING_W  = 6;                      // ring thickness
const RING_IR = RING_R - RING_W;        // inner radius
const RING_Y  = 138;                    // vertical center of rings
const RING_XS = [34, 100, 166];         // horizontal centers
const LABEL_Y = RING_Y + RING_R + 6;

// ---- App state ----
let state = {
	sleep:     -1,
	readiness: -1,
	activity:  -1,
	auth:      true,
	loading:   true,
};

// ---- Crown ----
function drawCrown(cx, cy, color) {
	// Simple 3-point crown, ~14px wide, ~9px tall
	// cy = top of crown
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

// ---- Ring ----
function drawRing(cx, cy, score, label) {
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

	// Score text
	const scoreText = (score >= 0) ? String(score) : "--";
	const tw = render.getTextWidth(scoreText, fontScore);

	if (score >= 85) {
		// Crown above score
		drawCrown(cx, cy - 14, GOLD);
		render.drawText(scoreText, fontScore, BLACK, cx - (tw >> 1), cy - 2);
	} else {
		render.drawText(scoreText, fontScore, BLACK, cx - (tw >> 1), cy - 9);
	}

	// Label below ring
	const lw = render.getTextWidth(label, fontLabel);
	render.drawText(label, fontLabel, DGRAY, cx - (lw >> 1), LABEL_Y);
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
	render.drawText(timeStr, fontTime, BLACK, (W - tw) >> 1, 16);

	// Date
	const dateStr = getDateString();
	const dw = render.getTextWidth(dateStr, fontDate);
	render.drawText(dateStr, fontDate, MGRAY, (W - dw) >> 1, 60);

	if (!state.auth) {
		const lines = ["Not connected.", "Open app settings", "to authorize Oura."];
		let ly = RING_Y - 20;
		for (let i = 0; i < lines.length; i++) {
			const lw = render.getTextWidth(lines[i], fontLabel);
			render.drawText(lines[i], fontLabel, DGRAY, (W - lw) >> 1, ly);
			ly += 18;
		}
	} else if (state.loading) {
		const msg = "Loading...";
		const mw = render.getTextWidth(msg, fontLabel);
		render.drawText(msg, fontLabel, MGRAY, (W - mw) >> 1, RING_Y - 8);
	} else {
		drawRing(RING_XS[0], RING_Y, state.sleep, "Sleep");
		drawRing(RING_XS[1], RING_Y, state.readiness, "Readiness");
		drawRing(RING_XS[2], RING_Y, state.activity, "Activity");
	}

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

watch.addEventListener("minutechange", () => draw());
draw();
