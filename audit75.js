"use strict";
var fs = require("fs");
var http = require("http");
var cp = require("child_process");

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: "192.168.1.64", port: 9999, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { res.resume(); console.log("posted " + path + " " + res.statusCode); });
    req.on("error", function (e) { console.log("post err " + path + " " + e.message); });
    req.write(data);
    req.end();
}

function sh(cmd, cap) {
    try { return cp.execSync(cmd + " 2>&1", { encoding: "utf8", timeout: 20000 }).slice(0, cap || 8000); }
    catch (e) { return "ERR " + (e.stdout ? e.stdout : e.message); }
}

var out = {};
out.started = new Date().toISOString();
out.id = sh("id | head -c 200");

// 1. who owns the UPnP / AllShare ports
out.netstat = sh("netstat -tlnp 2>/dev/null | grep -E '9197|7676|7678|8001|8080|9012' ");
out.netstat_all = sh("netstat -tlnp 2>/dev/null | head -40");

// 2. processes of interest
out.ps_media = sh("ps aux 2>/dev/null | grep -iE 'allshare|upnp|media-server|remote-server|mm-player|mmfw|muse|dlna|gstreamer|player|demux|webserver|msf' | grep -v grep");

// 3. foreground app / current source (aul app sockets + db hints)
out.aul_apps = sh("ls /run/aul/apps/5001/ 2>/dev/null | tr '\\n' ' '; echo; ls /run/aul/daemons/5001/ 2>/dev/null | tr '\\n' ' '");
out.ps_foreground = sh("ps aux 2>/dev/null | grep -iE 'tizenbrew|xvvl3S1bvH|StandaloneService|browser|eden|menu' | grep -v grep | head -15");
out.source_db = sh("grep -rE 'cur_source|current_source|input_source|last_source' /opt/var/dbspace /opt/var/db 2>/dev/null | head -5");

// 4. find AVTransport implementation binary (search for the fault string)
out.find_avt = sh("grep -rl 'Transition not available' /usr/apps /usr/lib /opt/usr/apps /usr/bin /usr/sbin 2>/dev/null | head -8");
out.find_avt2 = sh("grep -rl 'SetAVTransportURI' /usr/apps /usr/lib /opt/usr/apps /usr/bin /usr/sbin 2>/dev/null | head -8");
out.remote_server_ls = sh("ls -la /usr/apps/remote-server /opt/usr/apps/remote-server 2>/dev/null | head -30");

// 5. media player / demuxer stack (GStreamer + TZ demux)
out.gst_plugins = sh("ls /usr/lib/gstreamer-1.0/ 2>/dev/null | tr '\\n' ' ' | head -c 3000");
out.tz_demux = sh("ls -la /usr/bin/*demux* /usr/bin/*player* /usr/sbin/*demux* 2>/dev/null; ps aux | grep -iE 'tzdemux|playerservice|mm-player' | grep -v grep");

// 6. recent dlog lines mentioning avtransport / allshare / dlna (bounded)
out.dlog = sh("dlogutil -s 2>/dev/null | grep -iE 'avtransport|allshare|dlna|upnp|SetAVTransport|Transition' | tail -30", 4000);

// 7. media-server sockets (thumbcreator/scanner = another parse path)
out.media_socks = sh("ls -la /var/run/media-server/ 2>/dev/null");

post("/avt1", out);
post("/avt_done", { started: out.started });
