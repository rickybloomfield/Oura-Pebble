// Oura Scores Watchface — Watch Side (runs on Pebble)
// Uses Poco for rendering and pebble/message for phone communication.

import Poco from "commodetto/Poco";
import Message from "pebble/message";

const render = new Poco(screen);

const W = render.width;
const H = render.height;

// ---- Colors ----
const BLACK  = render.makeColor(0, 0, 0);
const WHITE  = render.makeColor(255, 255, 255);
const GRAY   = render.makeColor(70, 70, 70);
const LGRAY  = render.makeColor(150, 150, 150);

function scoreColor(s) {
	if (s < 0)   return LGRAY;
	if (s >= 85) return render.makeColor(0, 190, 80);   // excellent: green
	if (s >= 70) return render.makeColor(180, 210, 0);  // good: yellow-green
	if (s >= 60) return render.makeColor(255, 150, 0);  // fair: orange
	return            render.makeColor(215, 45,  45);   // poor: red
}

// ---- Fonts (Pebble system fonts — no custom font files needed) ----
// Available names: "Gothic-Regular", "Bitham-Black", "Roboto-Condensed"
const fontTitle  = new render.Font("Gothic-Regular", 18);
const fontLabel  = new render.Font("Gothic-Regular", 14);
const fontScore  = new render.Font("Roboto-Condensed", 21);
const fontDate   = new render.Font("Gothic-Regular", 14);

// ---- Layout ----
const HEADER_H  = 40;
const SECTION_H = Math.floor((H - HEADER_H) / 3);
const BAR_H     = 3;

// ---- App state ----
// Scores are -1 if unavailable; 0–100 when valid.
let state = {
	sleep:     -1,
	readiness: -1,
	activity:  -1,
	auth:      true,   // assume authorized; phone corrects on first message
	loading:   true,
};

// ---- Drawing ----
function drawSection(label, score, y) {
	const scoreText = (score >= 0) ? String(score) : "--";
	const sc = scoreColor(score);

	// Divider at top of section
	render.fillRectangle(GRAY, 0, y, W, 1);

	// Score number — large, right-aligned
	const sw = render.getTextWidth(scoreText, fontScore);
	render.drawText(scoreText, fontScore, sc, W - sw - 8, y + 4);

	// Label — small, left-aligned, vertically centred in section
	render.drawText(label, fontLabel, LGRAY, 8, y + 8);

	// Score bar at the bottom of the section
	const barY = y + SECTION_H - BAR_H - 6;
	render.fillRectangle(GRAY, 8, barY, W - 16, BAR_H);
	if (score >= 0) {
		const fill = Math.round((W - 16) * score / 100);
		render.fillRectangle(sc, 8, barY, fill, BAR_H);
	}
}

function getDateString() {
	const d = new Date();
	const months = ["Jan","Feb","Mar","Apr","May","Jun",
	                "Jul","Aug","Sep","Oct","Nov","Dec"];
	return months[d.getMonth()] + " " + d.getDate();
}

function draw() {
	render.begin(0, 0, W, H);
		render.fillRectangle(BLACK, 0, 0, W, H);

		// Header: title + date
		const title = "OURA";
		const tw = render.getTextWidth(title, fontTitle);
		render.drawText(title, fontTitle, WHITE, (W - tw) >> 1, 4);

		const dateStr = getDateString();
		const dw = render.getTextWidth(dateStr, fontDate);
		render.drawText(dateStr, fontDate, LGRAY, (W - dw) >> 1, 22);

		if (!state.auth) {
			// User needs to authorise in the Pebble app
			const lines = ["Not connected.", "Open app settings", "to authorize Oura."];
			let ly = (H >> 1) - 24;
			for (let i = 0; i < lines.length; i++) {
				const lw = render.getTextWidth(lines[i], fontLabel);
				render.drawText(lines[i], fontLabel, LGRAY, (W - lw) >> 1, ly);
				ly += 18;
			}
		} else if (state.loading) {
			const msg = "Loading...";
			const mw = render.getTextWidth(msg, fontLabel);
			render.drawText(msg, fontLabel, LGRAY, (W - mw) >> 1, (H >> 1) - 9);
		} else {
			drawSection("Sleep",     state.sleep,     HEADER_H);
			drawSection("Readiness", state.readiness, HEADER_H + SECTION_H);
			drawSection("Activity",  state.activity,  HEADER_H + SECTION_H * 2);
		}
	render.end();
}

// ---- Phone communication ----
// Keys must match messageKeys in package.json.
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
					state.sleep = value;
					break;
				case "READINESS_SCORE":
					state.readiness = value;
					break;
				case "ACTIVITY_SCORE":
					state.activity  = value;
					state.loading   = false;
					break;
			}
		});
		draw();
	},

	// onWritable fires once the channel to the phone is open.
	// We send a REQUEST_SCORES trigger so the phone fetches immediately.
	onWritable() {
		if (this.once) return;
		this.once = true;
		const m = new Map;
		m.set("REQUEST_SCORES", 1);
		this.write(m);
	},
});

// Redraw each minute (keeps the date current; no API call needed)
watch.addEventListener("minutechange", () => draw());

// Initial draw while we wait for data from the phone
draw();
