"use strict";

var cp = require("child_process");
var http = require("http");

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
        {
            host: HOST,
            port: PORT,
            path: path,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(data)
            }
        },
        function (res) {
            console.log("posted " + path + " -> " + res.statusCode);
        }
    );
    req.on("error", function (e) {
        console.log("post error " + e.message);
    });
    req.write(data);
    req.end();
}

var out = {};
out.started = new Date().toISOString();

out.ps = run("ps -ef | grep -v grep | grep -E 'dcow|node' | head -30");
out.pids = run("ps -ef | grep dcow | grep -v grep | awk '{print $2}'");
out.kill = run("for p in $(ps -ef | grep dcow | grep -v grep | awk '{print $2}'); do echo killing $p; kill -9 $p; done; echo done");
out.ps2 = run("sleep 2; ps -ef | grep dcow | grep -v grep");
out.files = run("ls -la /tmp/dcowtest* /home/owner/share/ 2>&1 | head -20");

post("/audit11", out);
