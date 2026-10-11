"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

function post(path, body, cb) {
    var data = JSON.stringify(body);
    var req = http.request({ host: "192.168.1.64", port: 9999, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { res.resume(); console.log("posted " + path + " " + res.statusCode); if (cb) cb(null); });
    req.on("error", function (e) { console.log("post err " + path + " " + e.message); if (cb) cb(e); });
    req.write(data);
    req.end();
}

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 10000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.trigger_words = sh("cat /usr/apps/settings-datafw/res/jsons/trigger_words.json");
out.waker = sh("cat /home/owner/share/wow-api/waker-table.txt");
out.sttcfg = sh("cat /home/owner/share/.voice/stt-config.xml; echo ===VC; cat /home/owner/share/.voice/vc-config.xml; echo ===TTS; cat /home/owner/share/.voice/tts-config.xml");
out.sttxml = sh("cat /home/owner/share/.voice/stt/1.0/engine-info/org.tizen.voice-service-vd-stt.xml");
out.vcdir = sh("ls -laR /home/owner/share/.voice/vc /home/owner/share/.voice/voice_engine 2>&1 | head -40");
out.who_snd = sh("for P in 297 375 404 424 660 823 1227 492; do echo PID:$P CMD:$(tr '\\0' ' ' < /proc/$P/cmdline 2>/dev/null | head -c 80); done");
out.mic_nodes = sh("ls -la /dev/snd/ | grep -iE 'c$|capture|rec'");
out.pcm_full = sh("for d in /proc/asound/card*/pcm*/sub0/status; do echo -n \"$d: \"; head -1 $d 2>/dev/null; done");
post("/voice3", out);

var scan = {};
scan.started = out.started;
var rx = /(trigger|wake|Hi.?TV|keyword|mic|capture|BT|bluetooth|HFP|SCO|always|listen|KWS|PTT|press)/i;
var targets = [
    "/usr/apps/settings-datafw/bin/settings-datafw",
    "/usr/bin/voice-service-daemon",
    "/usr/apps/org.tizen.voice-app/bin/voice-app"
];
scan.findp = sh("find /usr/bin /usr/apps /opt/usr/apps -maxdepth 4 -type f \\( -name '*voice*' -o -name '*trigger*' -o -name '*stt*' \\) -size -10M 2>/dev/null | head -15");
var all = targets.concat(scan.findp.trim().split("\n"));
var hits = [];
var seen = {};
for (var i = 0; i < all.length && hits.length < 10; i++) {
    var p = all[i].trim();
    if (!p || seen[p] || p.indexOf("/") !== 0) continue;
    seen[p] = 1;
    try {
        var buf = fs.readFileSync(p);
        if (buf.length > 9000000) continue;
        var strs = [];
        var cur = "";
        for (var b = 0; b < buf.length; b++) {
            var c = buf[b];
            if (c >= 32 && c < 127) cur += String.fromCharCode(c);
            else { if (cur.length >= 6) strs.push(cur); cur = ""; }
        }
        var keep = [];
        for (var s = 0; s < strs.length && keep.length < 35; s++) {
            if (rx.test(strs[s]) && !/^_Z/.test(strs[s])) keep.push(strs[s].slice(0, 130));
        }
        if (keep.length) hits.push({ path: p, hits: keep });
    } catch (e) {}
}
scan.hits = hits;
post("/voice4", scan);
post("/voice_done2", { started: out.started });
