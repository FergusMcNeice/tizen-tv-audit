"use strict";

var cp = require("child_process");
var http = require("http");
var fs = require("fs");

var HOST = "192.168.1.64";
var PORT = 9999;

function run(cmd) {
    try {
        return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 25000 });
    } catch (e) {
        return "ERR " + (e.stdout ? e.stdout : e.message);
    }
}

function readf(p) {
    try {
        return fs.readFileSync(p, "utf8");
    } catch (e) {
        return "ERR " + e.message;
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

out.db_dir = run("ls -la /opt/var/db");
out.db_files = run("for d in /opt/var/db/*/; do echo \"== $d\"; ls -la \"$d\" 2>/dev/null | head -40; done");
out.var_log = run("ls -la /opt/var/log; ls -la /opt/var/log/* 2>/dev/null | head -60");
out.apps_rw = run("ls -la /opt/usr/home/owner/apps_rw/");
out.app_data_sizes = run("du -sk /opt/usr/home/owner/apps_rw/* 2>/dev/null | sort -rn | head -40");
out.netflix_data = run("ls -la /opt/usr/home/owner/apps_rw/9Ur5IzDKqV/ 2>/dev/null; du -sk /opt/usr/home/owner/apps_rw/9Ur5IzDKqV/* 2>/dev/null");
out.wascmd_list = run("wascmd -l 2>&1 | head -120");
out.buxton_help = run("buxton2ctl --help 2>&1 | head -40");
out.buxton_develop = run("buxton2ctl get system db/sdk/develop/ip 2>&1; buxton2ctl get system db/sdk/develop/mode 2>&1");
out.dlog_tail = run("dlogutil -d 2>&1 | tail -250");
out.tcpdump_check = run("which tcpdump; ls /usr/sbin/ | grep -i -E 'tcp|dump|cap'");
out.ssl_certs = run("ls /etc/ssl/certs 2>/dev/null | head -30; ls -la /etc/ssl/ 2>/dev/null");
out.owner_share = run("ls -la /home/owner/share/; cat /home/owner/share/tizenbrewConfig.json 2>/dev/null");
out.tvplus = run("ls -la /opt/usr/apps/tvs-tvplus/ 2>/dev/null; ls -la /opt/usr/home/owner/apps_rw/tvs-tvplus/data 2>/dev/null | head -30");
out.context_aware = run("ls -la /opt/usr/apps/context-aware-service/ 2>/dev/null; ls -la /opt/usr/home/owner/apps_rw/context-aware-service 2>/dev/null");
out.netstat_p = run("netstat -anp 2>/dev/null | grep ESTABLISHED");

post("/audit2", out);
