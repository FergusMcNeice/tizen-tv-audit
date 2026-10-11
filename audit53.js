"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

var HOST = "192.168.1.64";
var PORT = 9999;

function post(path, body, cb) {
    var data = JSON.stringify(body);
    var req = http.request({ host: HOST, port: PORT, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { res.resume(); console.log("posted " + path + " " + res.statusCode); if (cb) cb(null); });
    req.on("error", function (e) { console.log("post err " + path + " " + e.message); if (cb) cb(e); });
    req.write(data);
    req.end();
}

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 30000 }).slice(0, cap || 12000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

function stringsOf(buf, minLen) {
    var out = [];
    var cur = "";
    for (var i = 0; i < buf.length; i++) {
        var c = buf[i];
        if (c >= 32 && c < 127) cur += String.fromCharCode(c);
        else { if (cur.length >= (minLen || 6)) out.push(cur); cur = ""; }
    }
    return out;
}

var out = {};
out.started = new Date().toISOString();
out.deact = sh("echo === /opt; ls -la /opt/data/contents-recognition-service/data/ 2>&1 | head -30; echo === deact_opt; cat /opt/data/contents-recognition-service/data/ocr_deactivation.txt 2>&1; echo === deact_usr; cat /usr/apps/org.tizen.contents-recognition-service/data/ocr_deactivation.txt 2>&1; echo === ver; cat /opt/data/contents-recognition-service/data/OCRVersion.data 2>&1; cat /usr/apps/org.tizen.contents-recognition-service/data/OCRVersion.data 2>&1");
out.svc_ls = sh("ls -laR /usr/apps/org.tizen.contents-recognition-service 2>&1 | head -60; echo ===; ls -laR /opt/data/contents-recognition-service 2>&1 | head -50");
out.mvconf = sh("cat /usr/share/capi-media-vision/media-vision-config.json 2>&1");
out.users = sh("grep -l -a -E 'contents-recognition|capi-media-vision|OCREngine' /usr/bin/* /usr/apps/*/bin/* /opt/usr/apps/*/bin/* 2>/dev/null | head -20");
out.canalysis = sh("ls -la /usr/apps/canalysis 2>&1 | head -30; echo ===; find /usr/apps/canalysis -name '*.xml' -o -name '*.json' -o -name '*.conf' 2>/dev/null | head -10");
out.svc_process = sh("ps -A 2>/dev/null | grep -iE 'recognition|ocr|vision'; for p in /proc/[0-9]*; do c=$(tr '\\0' ' ' < $p/cmdline 2>/dev/null); case \"$c\" in *recognition*|*ocr*|*vision*) echo PID:$p CMD:$c;; esac; done");

post("/ocr3", out);

var pull = {};
pull.started = out.started;
pull.ocr_engine_b64 = sh("base64 /opt/data/contents-recognition-service/data/libOCREngine.so", 2500000);
post("/ocr4", pull);

var scan = {};
scan.started = out.started;
try {
    var buf = fs.readFileSync("/opt/data/contents-recognition-service/data/libOCREngine.so");
    var rx = /(http|https|url|URL|server|upload|send|device|psid|duid|samsung|cloud|ingest|collect|post|request|text|word|line|char|lang|latin|cyril|han|arabic|activation|deactiv|consent|version)/i;
    var strs = stringsOf(buf, 5);
    var keep = [];
    for (var s = 0; s < strs.length && keep.length < 120; s++) {
        if (rx.test(strs[s])) keep.push(strs[s].slice(0, 150));
    }
    scan.ocr_engine_hits = keep;
    scan.size = buf.length;
} catch (e) { scan.err = String(e.message || e); }
post("/ocr5", scan);
post("/ocr_done2", { started: out.started });
