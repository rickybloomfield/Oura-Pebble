// Oura App — Watch Side
import Poco from "commodetto/Poco";
import Message from "pebble/message";
import PebbleButton from "pebble/button";

const render = new Poco(screen);
const W = render.width;
const H = render.height;

const WHITE  = render.makeColor(255, 255, 255);
const BLACK  = render.makeColor(0, 0, 0);
const TRACK  = render.makeColor(225, 225, 225);
const DGRAY  = render.makeColor(110, 110, 110);
const HILIT  = render.makeColor(180, 220, 255);
const GREEN  = render.makeColor(0, 180, 80);
const ORANGE = render.makeColor(240, 150, 0);

function scoreColor(s) {
	if (s >= 85) return render.makeColor(0, 180, 80);
	if (s >= 70) return render.makeColor(160, 200, 0);
	if (s >= 60) return render.makeColor(240, 150, 0);
	if (s >= 0)  return render.makeColor(210, 50, 50);
	return TRACK;
}

const fontTime  = new render.Font("Bitham-Bold", 42);
const fontScore = new render.Font("Roboto-Condensed", 21);
const fontLabel = new render.Font("Gothic-Regular", 14);
const fontDate  = new render.Font("Gothic-Regular", 18);

let scr = "list";
let idx = 0;
let scrollY = 0;
const CATS = ["readiness", "sleep", "activity", "stress"];
const LABS = ["Readiness", "Sleep", "Activity", "Stress"];

let S = {
	a: true, ld: true,
	sl: -1, rd: -1, ac: -1,
	slH: [-1,-1,-1,-1,-1,-1,-1],
	rdH: [-1,-1,-1,-1,-1,-1,-1],
	acH: [-1,-1,-1,-1,-1,-1,-1],
	shH: [0,0,0,0,0,0,0],
	srH: [0,0,0,0,0,0,0],
	slT: -1, slB: -1, slE: -1, slR: -1,
	rdR: -1, rdV: -1, rdTp: -100, rdRs: -1,
	acC: -1, acG: -1, acBn: -1, acTm: -1, acSt: -1,
};

function circle(cx, cy, r, score) {
	render.drawCircle(TRACK, cx, cy, r);
	if (score > 0) render.drawCircle(scoreColor(score), cx, cy, r, 0, Math.round(score * 360 / 100));
	render.drawCircle(WHITE, cx, cy, r - Math.max(3, Math.round(r / 5)));
}

function dayLabels() {
	var d = ["Su","Mo","Tu","We","Th","Fr","Sa"], r = [];
	for (var i = 6; i >= 0; i--) { var t = new Date(); t.setDate(t.getDate() - i); r.push(d[t.getDay()]); }
	return r;
}

function bars(data, x, y, w, h, cf, labs) {
	var g = 4, bw = Math.floor((w - g * 6) / 7), mx = 0;
	for (var i = 0; i < 7; i++) if (data[i] > mx) mx = data[i];
	if (mx <= 0) mx = 100;
	for (var i = 0; i < 7; i++) {
		var bx = x + i * (bw + g), v = data[i] < 0 ? 0 : data[i];
		var bh = Math.round((v / mx) * (h - 16));
		if (v > 0 && bh < 2) bh = 2;
		render.fillRectangle(cf(v), bx, y + (h - 16) - bh, bw, bh);
		if (labs[i]) { var lw = render.getTextWidth(labs[i], fontLabel); render.drawText(labs[i], fontLabel, BLACK, bx + ((bw - lw) >> 1), y + h - 14); }
	}
}

function mrow(label, val, unit, y) {
	render.drawText(label, fontLabel, BLACK, 12, y);
	var s = val + (unit ? " " + unit : "");
	render.drawText(s, fontScore, BLACK, W - 12 - render.getTextWidth(s, fontScore), y - 2);
}

function fmtMin(m) { if (m < 0) return "--"; return Math.floor(m/60)+"h "+(m%60<10?"0":"")+(m%60)+"m"; }
function fmtTmp(t) { if (t <= -100) return "--"; var v = t/10; return (v>=0?"+":"")+v.toFixed(1); }
function fmtRsp(r) { return r < 0 ? "--" : (r/10).toFixed(1); }
function fv(v) { return v < 0 ? "--" : String(v); }

function drawList() {
	render.begin(0, 0, W, H);
	render.fillRectangle(WHITE, 0, 0, W, H);
	var tw = render.getTextWidth("Oura", fontDate);
	render.drawText("Oura", fontDate, BLACK, (W - tw) >> 1, 6);
	var sc = [S.rd, S.sl, S.ac, -2];
	for (var i = 0; i < 4; i++) {
		var ry = 30 + i * 49;
		if (i === idx) render.fillRectangle(HILIT, 0, ry, W, 49);
		if (i > 0) render.fillRectangle(TRACK, 4, ry, W - 8, 1);
		if (i < 3) {
			circle(30, ry + 24, 16, sc[i]);
			var st = sc[i] >= 0 ? String(sc[i]) : "--";
			render.drawText(st, fontLabel, BLACK, 30 - (render.getTextWidth(st, fontLabel) >> 1), ry + 17);
			render.drawText(LABS[i], fontScore, BLACK, 54, ry + 14);
		} else {
			render.drawText(LABS[i], fontScore, BLACK, 16, ry + 14);
		}
		render.drawText(">", fontScore, BLACK, W - 16 - render.getTextWidth(">", fontScore), ry + 14);
	}
	render.end();
}

function drawDetail(title, score, hist, m1, m2, m3, m4) {
	var o = -scrollY;
	render.begin(0, 0, W, H);
	render.fillRectangle(WHITE, 0, 0, W, H);
	var tw = render.getTextWidth(title, fontDate);
	render.drawText(title, fontDate, BLACK, (W - tw) >> 1, 4 + o);
	var ss = score >= 0 ? String(score) : "--";
	render.drawText(ss, fontTime, scoreColor(score), (W - render.getTextWidth(ss, fontTime)) >> 1, 22 + o);
	bars(hist, 12, 72 + o, W - 24, 70, scoreColor, dayLabels());
	mrow(m1[0], m1[1], m1[2], 150 + o);
	mrow(m2[0], m2[1], m2[2], 172 + o);
	mrow(m3[0], m3[1], m3[2], 194 + o);
	mrow(m4[0], m4[1], m4[2], 216 + o);
	render.end();
}

function drawStress() {
	var o = -scrollY;
	render.begin(0, 0, W, H);
	render.fillRectangle(WHITE, 0, 0, W, H);
	var tw = render.getTextWidth("Stress", fontDate);
	render.drawText("Stress", fontDate, BLACK, (W - tw) >> 1, 4 + o);
	var lb = dayLabels();
	render.drawText("Stressed (min)", fontLabel, BLACK, 12, 28 + o);
	bars(S.shH, 12, 44 + o, W - 24, 74, function() { return ORANGE; }, lb);
	render.drawText("Restored (min)", fontLabel, BLACK, 12, 126 + o);
	bars(S.srH, 12, 142 + o, W - 24, 74, function() { return GREEN; }, lb);
	render.end();
}

function draw() {
	if (!S.a) { render.begin(0,0,W,H); render.fillRectangle(WHITE,0,0,W,H); var m="Open settings to connect"; render.drawText(m,fontLabel,DGRAY,(W-render.getTextWidth(m,fontLabel))>>1,(H>>1)-8); render.end(); return; }
	if (S.ld) { render.begin(0,0,W,H); render.fillRectangle(WHITE,0,0,W,H); var m="Loading..."; render.drawText(m,fontLabel,DGRAY,(W-render.getTextWidth(m,fontLabel))>>1,(H>>1)-8); render.end(); return; }
	if (scr === "list") drawList();
	else if (scr === "readiness") drawDetail("Readiness", S.rd, S.rdH, ["Resting HR",fv(S.rdR),"bpm"], ["HRV",fv(S.rdV),"ms"], ["Body Temp",fmtTmp(S.rdTp),""], ["Resp Rate",fmtRsp(S.rdRs),""]);
	else if (scr === "sleep") drawDetail("Sleep", S.sl, S.slH, ["Total Sleep",fmtMin(S.slT),""], ["Time in Bed",fmtMin(S.slB),""], ["Efficiency",fv(S.slE)+"%",""], ["Resting HR",fv(S.slR),"bpm"]);
	else if (scr === "activity") drawDetail("Activity", S.ac, S.acH, ["Active Cal",fv(S.acC),"cal"], ["Total Burn",fv(S.acBn),"cal"], ["Active Time",fmtMin(S.acTm),""], ["Steps",fv(S.acSt),""]);
	else if (scr === "stress") drawStress();
}

var btn;
function makeBtn() {
	if (btn) btn.close();
	var t = scr === "list" ? ["up", "down", "select"] : ["up", "down", "select", "back"];
	btn = new PebbleButton({
		types: t,
		onPush(pushed, type) {
			if (!pushed) return;
			if (scr === "list") {
				if (type === "up") { idx = idx > 0 ? idx - 1 : 3; draw(); }
				else if (type === "down") { idx = idx < 3 ? idx + 1 : 0; draw(); }
				else if (type === "select") { scr = CATS[idx]; scrollY = 0; makeBtn(); draw(); }
			} else {
				if (type === "back") { scr = "list"; scrollY = 0; makeBtn(); draw(); }
				else if (type === "up") { scrollY = Math.max(0, scrollY - 20); draw(); }
				else if (type === "down") { scrollY = Math.min(60, scrollY + 20); draw(); }
			}
		}
	});
}
makeBtn();

const KS = [
	"SLEEP_HISTORY[0]","SLEEP_HISTORY[1]","SLEEP_HISTORY[2]","SLEEP_HISTORY[3]","SLEEP_HISTORY[4]","SLEEP_HISTORY[5]","SLEEP_HISTORY[6]",
	"READINESS_HISTORY[0]","READINESS_HISTORY[1]","READINESS_HISTORY[2]","READINESS_HISTORY[3]","READINESS_HISTORY[4]","READINESS_HISTORY[5]","READINESS_HISTORY[6]",
	"ACTIVITY_HISTORY[0]","ACTIVITY_HISTORY[1]","ACTIVITY_HISTORY[2]","ACTIVITY_HISTORY[3]","ACTIVITY_HISTORY[4]","ACTIVITY_HISTORY[5]","ACTIVITY_HISTORY[6]",
	"STRESS_HIGH_HISTORY[0]","STRESS_HIGH_HISTORY[1]","STRESS_HIGH_HISTORY[2]","STRESS_HIGH_HISTORY[3]","STRESS_HIGH_HISTORY[4]","STRESS_HIGH_HISTORY[5]","STRESS_HIGH_HISTORY[6]",
	"STRESS_RESTORE_HISTORY[0]","STRESS_RESTORE_HISTORY[1]","STRESS_RESTORE_HISTORY[2]","STRESS_RESTORE_HISTORY[3]","STRESS_RESTORE_HISTORY[4]","STRESS_RESTORE_HISTORY[5]","STRESS_RESTORE_HISTORY[6]",
	"AUTH_STATUS","REQUEST_SCORES","SLEEP_SCORE","READINESS_SCORE","ACTIVITY_SCORE",
	"SLEEP_TOTAL","SLEEP_IN_BED","SLEEP_EFFICIENCY","SLEEP_HR",
	"READINESS_HR","READINESS_HRV","READINESS_TEMP","READINESS_RESP",
	"ACTIVITY_CAL","ACTIVITY_GOAL_CAL","ACTIVITY_BURN","ACTIVITY_TIME","ACTIVITY_STEPS",
];

const message = new Message({
	keys: KS,
	onReadable() {
		var msg = this.read();
		msg.forEach(function(value, key) {
			if (key === "AUTH_STATUS") { S.a = (value === 1); S.ld = false; }
			else if (key === "SLEEP_SCORE") { S.sl = value; S.ld = false; }
			else if (key === "READINESS_SCORE") { S.rd = value; S.ld = false; }
			else if (key === "ACTIVITY_SCORE") { S.ac = value; S.ld = false; }
			else if (key === "SLEEP_TOTAL") S.slT = value;
			else if (key === "SLEEP_IN_BED") S.slB = value;
			else if (key === "SLEEP_EFFICIENCY") S.slE = value;
			else if (key === "SLEEP_HR") S.slR = value;
			else if (key === "READINESS_HR") S.rdR = value;
			else if (key === "READINESS_HRV") S.rdV = value;
			else if (key === "READINESS_TEMP") S.rdTp = value;
			else if (key === "READINESS_RESP") S.rdRs = value;
			else if (key === "ACTIVITY_CAL") S.acC = value;
			else if (key === "ACTIVITY_GOAL_CAL") S.acG = value;
			else if (key === "ACTIVITY_BURN") S.acBn = value;
			else if (key === "ACTIVITY_TIME") S.acTm = value;
			else if (key === "ACTIVITY_STEPS") S.acSt = value;
			else {
				var h = [["SLEEP_HISTORY[",S.slH],["READINESS_HISTORY[",S.rdH],["ACTIVITY_HISTORY[",S.acH],["STRESS_HIGH_HISTORY[",S.shH],["STRESS_RESTORE_HISTORY[",S.srH]];
				for (var j = 0; j < h.length; j++) {
					if (key.indexOf(h[j][0]) === 0) {
						var n = parseInt(key.charAt(key.length - 2));
						h[j][1][n] = value;
						break;
					}
				}
			}
		});
		draw();
	},
	onWritable() {
		if (this.once) return;
		this.once = true;
		var m = new Map;
		m.set("REQUEST_SCORES", 1);
		this.write(m);
	},
});


watch.addEventListener("minutechange", function() { draw(); });
draw();
