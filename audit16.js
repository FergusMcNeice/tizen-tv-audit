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

out.node_run = run("/usr/bin/node -e 'console.log(\"node-works\")' 2>&1");
out.node_ver = run("/usr/bin/node --version 2>&1");

out.libpython = run("find / -name 'libpython*' -not -path '/proc/*' 2>&1 | head -10", 60000);

out.exec_shm = run("cat /usr/bin/ps > /dev/shm/ps3 2>&1; chmod 755 /dev/shm/ps3 2>&1; /dev/shm/ps3 2>&1 | head -2; echo rc=$?");
out.exec_run = run("cat /usr/bin/ps > /run/ps4 2>&1; chmod 755 /run/ps4 2>&1; /run/ps4 2>&1 | head -2; echo rc=$?");
out.exec_runuser = run("cat /usr/bin/ps > /run/user/5001/ps5 2>&1; chmod 755 /run/user/5001/ps5 2>&1; /run/user/5001/ps5 2>&1 | head -2; echo rc=$?");
out.exec_share = run("cat /usr/bin/ps > /home/owner/share/ps6 2>&1; chmod 755 /home/owner/share/ps6 2>&1; /home/owner/share/ps6 2>&1 | head -2; echo rc=$?");

post("/audit16", out);
