/** Active compact-data tests plus historical saved-boundary compatibility tests.
 * Historical coordinate arrays stay in Git history, not in the shipped database or new fixtures.
 */
import {
  readFile,
  readdir,
  cp,
  mkdtemp,
  mkdir,
  rm,
  symlink,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { once } from "node:events";
const root = process.cwd(),
  manifest = JSON.parse(
    await readFile("tests/legacy-authoring-tests.json", "utf8"),
  ) as { datasetCommit: string; tests: string[] };
const run = async (files: string[], cwd: string) => {
  if (!files.length) return;
  const p = spawn(process.execPath, ["--import", "tsx", "--test", ...files], {
    cwd,
    stdio: "inherit",
  });
  const [code] = await once(p, "exit");
  if (code !== 0)
    throw Error(
      `Tests failed (${cwd === root ? "compact data" : "historical authoring fixtures"})`,
    );
};
const all = (await readdir("tests"))
    .filter((f) => f.endsWith(".test.ts"))
    .map((f) => "tests/" + f),
  old = new Set(manifest.tests);
await run(
  all.filter((f) => !old.has(f)),
  root,
);
const temp = await mkdtemp(join(tmpdir(), "racetrack-legacy-tests-"));
try {
  await Promise.all(
    [
      "src",
      "scripts",
      "schemas",
      "tests",
      "licenses",
      "package.json",
      "tsconfig.json",
    ].map((f) => cp(f, join(temp, f), { recursive: true })),
  );
  await symlink(resolve("node_modules"), join(temp, "node_modules"), "dir");
  await mkdir(join(temp, ".local"));
  const unpack = spawn("tar", ["-xf", "-", "-C", temp], {
      stdio: ["pipe", "inherit", "inherit"],
    }),
    archive = spawn(
      "git",
      ["archive", manifest.datasetCommit, "data", "sources"],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
  archive.stdout.pipe(unpack.stdin);
  const [[a], [b]] = await Promise.all([
    once(archive, "exit"),
    once(unpack, "exit"),
  ]);
  if (a !== 0 || b !== 0)
    throw Error(
      "Historical fixture commit is unavailable; fetch the repository history before npm test",
    );
  await run(manifest.tests, temp);
} finally {
  await rm(temp, { recursive: true, force: true });
}
