// Ephemeral CI test tooling only. No package-manager upgrades, hosted Redis,
// account settings or persistent installation. SHA is from redis/redis-hashes.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { appendFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
const exec = promisify(execFile);
const version = "7.4.12";
const expected =
  "56588ee1648539556f2b6cf4e873e3734afbbe40fa952fec2fcd6b6d7dae2924";
const dir = await mkdtemp(join(tmpdir(), "nuff-test-redis-"));
let archive;
if (process.env.NUFFLIZIER_TEST_REDIS_ARCHIVE) {
  archive = await readFile(process.env.NUFFLIZIER_TEST_REDIS_ARCHIVE);
} else {
  const response = await fetch(
    `https://download.redis.io/releases/redis-${version}.tar.gz`,
    {
      signal: AbortSignal.timeout(90_000)
    }
  );
  if (!response.ok || !response.body)
    throw new Error(`Redis download failed: HTTP ${response.status}`);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > 20 * 1024 * 1024)
      throw new Error("Redis archive exceeded the test-tool limit.");
    chunks.push(chunk);
  }
  archive = Buffer.concat(chunks);
}
if (createHash("sha256").update(archive).digest("hex") !== expected)
  throw new Error("Redis archive checksum mismatch.");
const path = join(dir, "redis.tar.gz");
await writeFile(path, archive);
await exec("tar", ["-xzf", path, "-C", dir], { timeout: 10_000 });
const bin = join(dir, `redis-${version}`, "src");
console.log(`Building checksum-verified Redis ${version} test tools.`);
await exec(
  "make",
  [
    "-C",
    bin,
    "-j2",
    "MALLOC=libc",
    "BUILD_TLS=no",
    "redis-server",
    "redis-cli"
  ],
  {
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024
  }
);
for (const name of ["redis-server", "redis-cli"]) {
  const { stdout } = await exec(join(bin, name), ["--version"], {
    timeout: 5_000
  });
  if (!stdout.includes(version)) throw new Error(`Unexpected ${name} version.`);
  console.log(stdout.trim());
}
if (process.env.GITHUB_PATH)
  await appendFile(process.env.GITHUB_PATH, `${bin}\n`);
if (process.env.NUFFLIZIER_TEST_REDIS_PATH_FILE)
  await writeFile(process.env.NUFFLIZIER_TEST_REDIS_PATH_FILE, bin);
console.log(
  "Pinned test tools ready; hosted Redis configuration is unchanged."
);
