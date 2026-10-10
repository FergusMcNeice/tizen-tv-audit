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

out.dbspace = run("ls -la /opt/usr/dbspace 2>/dev/null; ls -la /home/owner/.dbspace 2>/dev/null; ls -la /home/owner/share/db 2>/dev/null; ls -la /opt/var/data 2>/dev/null");
out.find_dbs = run("find /opt/var /opt/usr/home /opt/usr/dbspace -maxdepth 4 -name '*.db' -o -maxdepth 4 -name '*.sqlite*' 2>/dev/null | head -80");
out.acr_data = run("ls -laR /opt/usr/home/owner/apps_rw/org.tizen.acr-service-app 2>/dev/null | head -80");
out.acr_app = run("ls -la /opt/usr/apps/org.tizen.acr-service-app 2>/dev/null; ls -la /opt/usr/apps/org.tizen.acm-service 2>/dev/null");
out.voice = run("ls -la /opt/usr/home/owner/apps_rw/org.tizen.voice-app 2>/dev/null; ls -la /opt/usr/home/owner/apps_rw/org.tizen.voice-service-vd-stt 2>/dev/null; ls -la /opt/usr/apps/org.tizen.voice-app 2>/dev/null");
out.ise = run("ls -laR /opt/usr/home/owner/apps_rw/ise-default-tv 2>/dev/null | head -40; ls -laR /opt/usr/home/owner/apps_rw/ise-engine-default-tv 2>/dev/null | head -40");
out.adplatform = run("ls -laR /opt/usr/home/owner/apps_rw/adplatform 2>/dev/null | head -40");
out.context = run("ls -laR /opt/usr/home/owner/apps_rw/context-aware-service 2>/dev/null | head -40; ls -la /opt/usr/apps/context-aware-service 2>/dev/null");
out.epg_guide = run("ls -la /opt/usr/apps/epg 2>/dev/null; ls -la /opt/usr/apps/tvs-guide 2>/dev/null; ls -laR /opt/usr/home/owner/apps_rw/tvs-guide 2>/dev/null | head -30");
out.tcpdump_cap = run("getcap /usr/sbin/vd-tcpdump 2>&1; ls -la /usr/sbin/vd-tcpdump; vd-tcpdump --version 2>&1 | head -3");
out.tvplus_data = run("ls -laR /opt/usr/home/owner/apps_rw/tvs-tvplus 2>/dev/null | head -40");
out.netflix_9Ur = run("ls -la /opt/usr/apps/org.tizen.netflix 2>/dev/null; cat /opt/usr/home/owner/apps_rw/9Ur5IzDKqV/res/wgt/config.xml 2>/dev/null | head -5; ls -la /opt/usr/home/owner/apps_rw/9Ur5IzDKqV 2>/dev/null");
out.random_apps = run("for d in Cu0JFPlDm6 MCmYXNxgcu YhdMSb7StE MrLxRZ8Xe1 nCVkJiXWkl; do echo \"== $d\"; cat /opt/usr/home/owner/apps_rw/$d/res/wgt/config.xml 2>/dev/null | grep -E 'name>|content src|tizen:application id' | head -4; done");

post("/audit3", out);
