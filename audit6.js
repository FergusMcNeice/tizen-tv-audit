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

function readf(p) {
    try {
        return fs.readFileSync(p, "utf8");
    } catch (e) {
        return "ERR " + e.message;
    }
}

function b64(p) {
    try {
        return fs.readFileSync(p).toString("base64");
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

out.version = readf("/proc/version");
out.cmdline = readf("/proc/cmdline");
out.cpuinfo = run("head -60 /proc/cpuinfo");
out.aslr = readf("/proc/sys/kernel/randomize_va_space");
out.kptr_restrict = readf("/proc/sys/kernel/kptr_restrict");
out.dmesg_restrict = readf("/proc/sys/kernel/dmesg_restrict");
out.perf_paranoid = readf("/proc/sys/kernel/perf_event_paranoid");
out.yama = readf("/proc/sys/kernel/yama/ptrace_scope");
out.unpriv_bpf = readf("/proc/sys/kernel/unprivileged_bpf_disabled");
out.self_status_caps = run("grep -i -E 'cap|seccomp|uid|gid|nspid' /proc/self/status");
out.cgroup = readf("/proc/self/cgroup");
out.uid_map = readf("/proc/self/uid_map");
out.mounts = readf("/proc/mounts");
out.kallsyms_head = run("head -3 /proc/kallsyms");
out.dmesg_head = run("dmesg 2>&1 | head -60");

out.vd_tcpdump = b64("/usr/sbin/vd-tcpdump");
out.vd_files = run("ls -la /usr/sbin/vd-tcpdump 2>&1; find /usr -name 'vd_*' 2>/dev/null");

out.setuid = run("find /usr /bin /sbin /opt -perm -4000 -type f 2>/dev/null", 120000);
out.filecaps = run("getcap -r /usr /opt 2>/dev/null", 120000);

out.tools = run("for t in busybox gunzip gzip strings gcc perl python tar xxd od insmod modprobe; do echo -n \"$t: \"; which $t 2>/dev/null || echo missing; done");
out.sdbd_bin = run("ls -la /usr/bin/sdbd* /usr/lib/sdbd* 2>&1; find / -maxdepth 3 -name 'sdbd*' -type f 2>/dev/null");

out.writedirs = run("ls -ld /tmp /home/owner /opt/usr/home/owner /opt/usr/media /home/owner/share 2>&1; echo '--- touch test:'; touch /opt/usr/home/owner/zzz_audit6_test 2>&1 && echo TOUCH_OPT_OK && rm -f /opt/usr/home/owner/zzz_audit6_test; touch /tmp/zzz_audit6_test 2>&1 && echo TOUCH_TMP_OK && rm -f /tmp/zzz_audit6_test");

out.net_raw = run("ls -la /proc/self/ns/ 2>&1");

var cfg = {};
cfg.config_gz = b64("/proc/config.gz");
post("/audit6_files", cfg);

post("/audit6", out);
