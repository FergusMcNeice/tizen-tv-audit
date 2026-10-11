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

function stringsOf(buf, minLen) {
    var out = [];
    var cur = "";
    for (var i = 0; i < buf.length; i++) {
        var c = buf[i];
        if (c >= 32 && c < 127) cur += String.fromCharCode(c);
        else { if (cur.length >= (minLen || 5)) out.push(cur); cur = ""; }
    }
    return out;
}

var out = {};
out.started = new Date().toISOString();
out.ps = sh("ps -A | grep -iE 'voice|stt|trigger|wake|kws|asr|speech|audio|sound|mic'");
out.snd = sh("ls -la /dev/snd/ 2>&1; echo ===; cat /proc/asound/cards 2>&1; echo ===; cat /proc/asound/pcm 2>&1");
out.capture_fds = sh("for p in /proc/[0-9]*; do for f in $p/fd/*; do L=$(readlink $f 2>/dev/null); case \"$L\" in *snd/pcmC*c*|*snd/controlC*|*dsp*|*audio*) echo \"$p $L\";; esac; done; done 2>/dev/null | head -20");
out.pcm_status = sh("for d in /proc/asound/card*/pcm*c/sub0/status; do echo FILE:$d; cat $d 2>/dev/null | head -8; done");
out.voice_dir = sh("ls -laR /home/owner/share/.voice 2>&1 | head -50");
out.voice_apps = sh("ls -la /usr/apps/org.tizen.voice-service-vd-stt /usr/apps/org.tizen.voice-app /opt/usr/apps/org.tizen.voice-service-vd-stt 2>&1 | head -30");
out.find_trig = sh("find /usr/lib /usr/apps /opt/usr/apps /home/owner/share -maxdepth 4 \\( -iname '*wake*' -o -iname '*trigger*' -o -iname '*kws*' -o -iname '*keyword*' -o -iname '*vad*' \\) 2>/dev/null | head -30");
out.dlog = sh("dlogutil -d -t 600 2>&1 | grep -iE 'voice|wake|trigger|mic|stt' | head -40");
out.bt = sh("ls -laR /opt/var/lib/bluetooth /var/lib/bluetooth 2>/dev/null | head -25; grep -r -a -i 'smartrc\\|smart_remote\\|7C:64:56' /opt/var/lib/buxton2 2>/dev/null | head -5");

post("/voice1", out);

var scan = {};
scan.started = out.started;
var rx = /(wake|trigger|keyword|Hi.?TV|Hi.?Samsung|always.?listen|KWS|snowboy|sensory|vlingo|Bixby|hotword|mic|capture|PTT|push.?to.?talk|VAD)/i;
var bins = sh("find /usr/bin /usr/apps /opt/usr/apps -maxdepth 4 -type f \\( -name '*voice*' -o -name '*stt*' -o -name '*trigger*' -o -name '*audio*' \\) -size -8M 2>/dev/null | head -12");
scan.bins = bins;
var hits = [];
var blist = bins.split("\n");
for (var i = 0; i < blist.length && i < 12; i++) {
    var p = blist[i].trim();
    if (p.indexOf("/") !== 0) continue;
    try {
        var buf = fs.readFileSync(p);
        var strs = stringsOf(buf, 6);
        var keep = [];
        for (var s = 0; s < strs.length && keep.length < 40; s++) {
            if (rx.test(strs[s])) keep.push(strs[s].slice(0, 140));
        }
        if (keep.length) hits.push({ path: p, hits: keep });
    } catch (e) {}
}
scan.hits = hits;
post("/voice2", scan);
post("/voice_done", { started: out.started });
