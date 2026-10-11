"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: "192.168.1.64", port: 9999, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { res.resume(); console.log("posted " + path + " " + res.statusCode); });
    req.on("error", function (e) { console.log("post err " + path + " " + e.message); });
    req.write(data);
    req.end();
}

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 15000 }).slice(0, cap || 8000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.id = sh("id | head -c 120");

// 1. OCR / ACR processes
out.ps = sh("ps aux | grep -iE 'ocr|recogn|acr|analysis|context-aware' | grep -v grep");

// 2. does dlog already carry OCR text? (zero-patch option)
out.dlog_ocr = sh("timeout 8 dlogutil -s 2>/dev/null | grep -iE 'ocr|recogn|channel.*title|callsign' | head -30", 4000);
out.dlog_tags = sh("timeout 6 dlogutil -s 2>/dev/null | awk '{print $2}' | sort | uniq -c | sort -rn | head -25", 2500);

// 3. service binaries + libs
out.svc = sh("ls -la /usr/apps/org.tizen.contents-recognition-service/bin/ /usr/apps/org.tizen.contents-recognition-service/data_big/ 2>&1 | head -20");
out.pids = sh("for p in $(pgrep -f 'contents-recognition|acr|context-aware'); do echo \"PID $p $(cat /proc/$p/cmdline | tr '\\0' ' ')\"; ls -la /proc/$p/exe 2>/dev/null; done", 3000);

// 4. exported/interesting symbols in the OCR engine + service
out.syms_engine = sh("grep -a -o -E '(_ZN[0-9]+[A-Za-z_]+|CAE_OCR[A-Za-z]+|GetChannel[A-Za-z]+|GetCallsign[A-Za-z]*)' /usr/apps/org.tizen.contents-recognition-service/data_big/libOCREngine.so 2>/dev/null | sort -u | head -40", 4000);
out.syms_svc = sh("grep -a -o -E '(CAE_OCR[A-Za-z]+|GetChannel[A-Za-z]+|dbus|DBus|send|write|socket|log|dlog|printf|channelTitle|callsign|ocr_text|rawText)' /usr/apps/org.tizen.contents-recognition-service/bin/contents-recognition-service 2>/dev/null | sort | uniq -c | sort -rn | head -35", 4000);

// 5. where do results go? sockets/fds of the OCR service
out.fds = sh("for p in $(pgrep -f 'contents-recognition'); do echo PID $p; ls -la /proc/$p/fd 2>/dev/null | head -30; done", 4500);

// 6. ACR outbound payload builder: which binary talks to samsungacr?
out.acr_bin = sh("ls -la /usr/bin/acr /usr/apps/org.tizen.acr* /usr/bin/*acr* 2>/dev/null; pgrep -af acr | head -5");
out.acr_strings = sh("for f in /usr/bin/acr $(pgrep -af acr | awk '{print \"/proc/\"$1\"/exe\"}' | head -2); do echo \"== $f\"; grep -a -o -E '(contentId|programId|psid|device_id|recog_content|uduration|acr0\\.samsung|log-ingestion|channelName|programName)' $f 2>/dev/null | sort | uniq -c | sort -rn | head -15; done", 4000);

// 7. OCR config knobs (any debug/verbose switch?)
out.cfg = sh("cat /opt/usr/apps/org.tizen.contents-recognition-service/data/ocr_deactivation.txt 2>/dev/null; ls /usr/apps/org.tizen.contents-recognition-service/data/ 2>/dev/null | tr '\\n' ' '; echo; grep -rE 'debug|verbose|log' /usr/apps/org.tizen.contents-recognition-service/data/*.txt 2>/dev/null | head -8");

post("/ocr_recon", out);
post("/ocr_recon_done", { started: out.started });
