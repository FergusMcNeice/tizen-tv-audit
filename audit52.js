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

function scanFile(path, maxBytes) {
    try {
        var st = fs.statSync(path);
        var buf = fs.readFileSync(path);
        if (maxBytes && buf.length > maxBytes) buf = buf.slice(0, maxBytes);
        var rx = /(ocr|OCR|tesseract|tessdata|leptonica|glyph|text.?recog|text.?detect|char.?recog|word.?box|textline|teletext|subtitle|caption|RecognizeText|read_text|image.?to.?text|screenshot)/i;
        var strs = stringsOf(buf, 6);
        var keep = [];
        for (var s = 0; s < strs.length && keep.length < 60; s++) {
            if (rx.test(strs[s])) keep.push(strs[s].slice(0, 160));
        }
        return { path: path, size: st.size, hits: keep };
    } catch (e) {
        return { path: path, err: String(e.message || e) };
    }
}

var out = {};
out.started = new Date().toISOString();
out.name_find = sh("find /usr /opt -maxdepth 5 \\( -iname '*ocr*' -o -iname '*tess*' -o -iname '*lepton*' -o -iname '*glyph*' -o -iname '*textrec*' -o -iname '*vision*' \\) 2>/dev/null | grep -viE 'improv|vision_mode|division' | head -40");
out.lib_list = sh("ls /usr/lib | grep -iE 'ocr|vision|cv|recogni|bonfire|acr|sorenson|gracenote|ntk|image|capture' | head -40");
out.at_spi = sh("ls -la /etc/at-spi2 2>/dev/null; cat /etc/at-spi2/accessibility.conf 2>/dev/null | head -20");
out.access = sh("ls /usr/apps 2>/dev/null | grep -iE 'vision|ocr|screen|access|reader|magnif' ; ls /opt/usr/apps 2>/dev/null | grep -iE 'vision|ocr|screen|access|reader|magnif'");
out.dlog_ocr = sh("dlogutil -d -t 200 2>&1 | grep -iE 'ocr|text.?recog|tesseract' | head -20");

post("/ocr1", out);

var scans = [];
var targets = [
    "/usr/lib/acr/libbonfire.so",
    "/usr/lib/libacr-debugmenu.so",
    "/usr/lib/libtvs-emp-bridge.so",
    "/usr/lib/acr/acr_ccd/cnn/ui.nn",
    "/usr/apps/org.tizen.acr-service-app/bin/acr-service-app"
];
for (var t = 0; t < targets.length; t++) scans.push(scanFile(targets[t], 4000000));
post("/ocr2", { started: out.started, scans: scans });
post("/ocr_done", { started: out.started });
