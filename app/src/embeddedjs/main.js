// Oura App — Watch Side (PIU)
import Message from "pebble/message";

var WHITE = "#FFFFFF", BLACK = "#000000", TRACK = "#E1E1E1",
    DGRAY = "#6E6E6E", HILIT = "#B4DCFF", GREEN = "#00B450", ORANGE = "#F09600";

function scc(s) {
	if (s >= 85) return "#00B450";
	if (s >= 70) return "#A0C800";
	if (s >= 60) return "#F09600";
	if (s >= 0)  return "#D23232";
	return TRACK;
}

var stT = new Style({ font: "bold 42px Bitham" });
var stS = new Style({ font: "condensed 21px Roboto" });
var stL = new Style({ font: "14px Gothic" });
var stD = new Style({ font: "18px Gothic" });

var idx = 0, app_ = null;
var CATS = ["readiness","sleep","activity","stress"];
var LABS = ["Readiness","Sleep","Activity","Stress"];
var S = {
	a: true, ld: true, sl: -1, rd: -1, ac: -1,
	slH: [-1,-1,-1,-1,-1,-1,-1], rdH: [-1,-1,-1,-1,-1,-1,-1], acH: [-1,-1,-1,-1,-1,-1,-1],
	shH: [0,0,0,0,0,0,0], srH: [0,0,0,0,0,0,0],
	slT: -1, slB: -1, slE: -1, slR: -1,
	rdR: -1, rdV: -1, rdTp: -100, rdRs: -1,
	acC: -1, acG: -1, acBn: -1, acTm: -1, acSt: -1,
};

function fmtMin(m) { if (m < 0) return "--"; return Math.floor(m/60)+"h "+(m%60<10?"0":"")+(m%60)+"m"; }
function fmtTmp(t) { if (t <= -100) return "--"; var v = t/10; return (v>=0?"+":"")+v.toFixed(1); }
function fmtRsp(r) { return r < 0 ? "--" : (r/10).toFixed(1); }
function fv(v) { return v < 0 ? "--" : String(v); }

function dayLabels() {
	var d = ["Su","Mo","Tu","We","Th","Fr","Sa"], r = [];
	for (var i = 6; i >= 0; i--) { var t = new Date(); t.setDate(t.getDate() - i); r.push(d[t.getDay()]); }
	return r;
}

function drawBars(port, data, x, y, w, h, cf, labs) {
	var g = 4, bw = Math.floor((w - g * 6) / 7), mx = 0;
	for (var i = 0; i < 7; i++) if (data[i] > mx) mx = data[i];
	if (mx <= 0) mx = 100;
	for (var i = 0; i < 7; i++) {
		var bx = x + i * (bw + g), v = data[i] < 0 ? 0 : data[i];
		var bh = Math.round((v / mx) * (h - 16));
		if (v > 0 && bh < 2) bh = 2;
		port.fillColor(cf(v), bx, y + (h - 16) - bh, bw, bh);
		if (labs[i]) {
			var lw = port.measureString(labs[i], stL).width;
			port.drawString(labs[i], stL, BLACK, bx + ((bw - lw) >> 1), y + h - 14, bw);
		}
	}
}

function drawRow(port, label, val, y) {
	port.drawString(label, stL, BLACK, 12, y, port.width - 24);
	var sw = port.measureString(val, stS).width;
	port.drawString(val, stS, BLACK, port.width - 12 - sw, y - 2, sw + 4);
}

class MsgPort extends Behavior {
	onCreate(port, text) { this.text = text; }
	onDraw(port) {
		port.fillColor(WHITE, 0, 0, port.width, port.height);
		var tw = port.measureString(this.text, stL).width;
		port.drawString(this.text, stL, DGRAY, (port.width - tw) >> 1, (port.height >> 1) - 8, tw + 4);
	}
}

class ListPort extends Behavior {
	onDisplaying(port) { port.focus(); }
	onDraw(port) {
		port.fillColor(WHITE, 0, 0, port.width, port.height);
		var tw = port.measureString("Oura", stD).width;
		port.drawString("Oura", stD, BLACK, (port.width - tw) >> 1, 6, tw + 4);
		var sc = [S.rd, S.sl, S.ac, -2];
		for (var i = 0; i < 4; i++) {
			var ry = 30 + i * 49;
			if (i === idx) port.fillColor(HILIT, 0, ry, port.width, 49);
			if (i > 0) port.fillColor(TRACK, 4, ry, port.width - 8, 1);
			if (i < 3) {
				var st = sc[i] >= 0 ? String(sc[i]) : "--";
				port.drawString(st, stS, scc(sc[i]), 12, ry + 14, 40);
				port.drawString(LABS[i], stS, BLACK, 54, ry + 14, port.width - 54);
			} else {
				port.drawString(LABS[i], stS, BLACK, 16, ry + 14, port.width - 16);
			}
			port.drawString(">", stS, BLACK, port.width - 20, ry + 14, 20);
		}
	}
}

class DetailPort extends Behavior {
	onCreate(port, data) { this.data = data; }
	onMeasureVertically() { return 240; }
	onDraw(port) {
		var d = this.data;
		port.fillColor(WHITE, 0, 0, port.width, 240);
		var tw = port.measureString(d.title, stD).width;
		port.drawString(d.title, stD, BLACK, (port.width - tw) >> 1, 4, tw + 4);
		var ss = d.score >= 0 ? String(d.score) : "--";
		var stw = port.measureString(ss, stT).width;
		port.drawString(ss, stT, scc(d.score), (port.width - stw) >> 1, 22, stw + 4);
		drawBars(port, d.hist, 12, 72, port.width - 24, 70, scc, dayLabels());
		var s = function(v, u) { return v + (u ? " " + u : ""); };
		drawRow(port, d.m1[0], s(d.m1[1], d.m1[2]), 150);
		drawRow(port, d.m2[0], s(d.m2[1], d.m2[2]), 172);
		drawRow(port, d.m3[0], s(d.m3[1], d.m3[2]), 194);
		drawRow(port, d.m4[0], s(d.m4[1], d.m4[2]), 216);
	}
}

class StressPort extends Behavior {
	onMeasureVertically() { return 225; }
	onDraw(port) {
		port.fillColor(WHITE, 0, 0, port.width, 225);
		var tw = port.measureString("Stress", stD).width;
		port.drawString("Stress", stD, BLACK, (port.width - tw) >> 1, 4, tw + 4);
		var labs = dayLabels();
		port.drawString("Stressed (min)", stL, BLACK, 12, 28, port.width - 24);
		drawBars(port, S.shH, 12, 44, port.width - 24, 74, function() { return ORANGE; }, labs);
		port.drawString("Restored (min)", stL, BLACK, 12, 126, port.width - 24);
		drawBars(port, S.srH, 12, 142, port.width - 24, 74, function() { return GREEN; }, labs);
	}
}

class ScrollBhv extends Behavior {
	onDisplaying(scroller) { scroller.focus(); }
	onPressDown(scroller) { scroller.scrollBy(0, 20); return true; }
	onPressUp(scroller) { scroller.scrollBy(0, -20); return true; }
	onPressBack() { app_.delegate("showList"); return true; }
}

var KS = [
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

class AppBhv extends Behavior {
	onCreate(app) {
		app_ = app;
		this.scr = "list";
		new Message({
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
				app_.defer("showScreen");
			},
			onWritable() {
				if (this.once) return;
				this.once = true;
				var m = new Map;
				m.set("REQUEST_SCORES", 1);
				this.write(m);
			},
		});
	}

	onDisplaying(app) {
		this.showScreen(app);
		watch.addEventListener("minutechange", () => { app_.defer("showScreen"); });
	}

	showScreen(app) {
		if (!S.a) this.showMessage(app, "Open settings to connect");
		else if (S.ld) this.showMessage(app, "Loading...");
		else if (this.scr === "list") this.showList(app);
		else this.showDetail(app, this.scr);
	}

	showMessage(app, text) {
		app.empty();
		app.add(new Port(text, { left: 0, right: 0, top: 0, bottom: 0, Behavior: MsgPort }));
	}

	showList(app) {
		this.scr = "list";
		app.empty();
		app.add(new Port(S, { left: 0, right: 0, top: 0, bottom: 0, active: true, Behavior: ListPort }));
	}

	showDetail(app, cat) {
		this.scr = cat;
		app.empty();
		var pb, pd;
		if (cat === "stress") { pb = StressPort; pd = S; }
		else {
			pb = DetailPort;
			if (cat === "readiness") pd = { title:"Readiness", score:S.rd, hist:S.rdH, m1:["Resting HR",fv(S.rdR),"bpm"], m2:["HRV",fv(S.rdV),"ms"], m3:["Body Temp",fmtTmp(S.rdTp),""], m4:["Resp Rate",fmtRsp(S.rdRs),""] };
			else if (cat === "sleep") pd = { title:"Sleep", score:S.sl, hist:S.slH, m1:["Total Sleep",fmtMin(S.slT),""], m2:["Time in Bed",fmtMin(S.slB),""], m3:["Efficiency",fv(S.slE)+"%",""], m4:["Resting HR",fv(S.slR),"bpm"] };
			else pd = { title:"Activity", score:S.ac, hist:S.acH, m1:["Active Cal",fv(S.acC),"cal"], m2:["Total Burn",fv(S.acBn),"cal"], m3:["Active Time",fmtMin(S.acTm),""], m4:["Steps",fv(S.acSt),""] };
		}
		app.add(new Scroller(S, { left:0, right:0, top:0, bottom:0, active:true, clip:true, Behavior:ScrollBhv,
			contents: [new Port(pd, { left:0, right:0, top:0, Behavior:pb })]
		}));
	}

	onPressUp(app) { if (this.scr !== "list") return; idx = idx > 0 ? idx - 1 : 3; app.first.invalidate(); }
	onPressDown(app) { if (this.scr !== "list") return; idx = idx < 3 ? idx + 1 : 0; app.first.invalidate(); }
	onPressSelect(app) { if (this.scr !== "list") return; this.showDetail(app, CATS[idx]); }
}

export default new Application(S, { skin: new Skin({ fill: WHITE }), Behavior: AppBhv });
