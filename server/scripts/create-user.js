import { randomBytes } from "node:crypto";
import { isIP } from "node:net";

const [userId, ipList = ""] = process.argv.slice(2);

if (!userId || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(userId)) {
  console.error("用法: npm run user:create -- <userId> <ip1,ip2>");
  console.error("userId 需为 3–64 位字母、数字、下划线或连字符。");
  process.exit(1);
}

const allowedIps = ipList
  .split(",")
  .map((ip) => ip.trim())
  .filter(Boolean);

const invalidIp = allowedIps.find((ip) => isIP(ip) === 0);
if (invalidIp) {
  console.error(`无效 IP：${invalidIp}`);
  process.exit(1);
}

const user = {
  id: userId,
  token: randomBytes(32).toString("hex"),
  allowedIps
};

console.log(JSON.stringify(user));

