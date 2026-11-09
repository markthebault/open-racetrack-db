import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { composeAvailableIdealLines } from "./compose-ideal-lines";
const directory = ".local/ideal-generation";
await mkdir(directory, { recursive: true });
async function phase(script: string, label: string, args: string[] = []) {
  await Promise.all(
    Array.from(
      { length: 4 },
      (_, i) =>
        new Promise<void>((resolve, reject) => {
          const log = createWriteStream(`${directory}/${label}-${i}.log`),
            child = spawn(
              process.execPath,
              [
                "--import",
                import.meta.resolve("tsx"),
                script,
                `${i}/4`,
                ...args,
              ],
              { stdio: ["ignore", "pipe", "pipe"] },
            );
          child.stdout.pipe(log);
          child.stderr.pipe(log);
          child.on("error", reject);
          child.on("exit", (code) => {
            log.end();
            if (code === 0) resolve();
            else
              reject(
                new Error(
                  `${label}/${i} failed; see ${directory}/${label}-${i}.log`,
                ),
              );
          });
        }),
    ),
  );
}
async function records(prefix: string) {
  return (
    await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        readFile(`${directory}/${prefix}-${i}.json`, "utf8").then(JSON.parse),
      ),
    )
  ).flat();
}
await phase("scripts/generate-ideal-lines.ts", "coarse");
await phase("scripts/generate-ideal-lines.ts", "fine", ["--retry"]);
const coarse = await records("shard"),
  fine = await records("retry");
await writeFile(
  `${directory}/final-unavailable.json`,
  JSON.stringify(
    fine.filter((r) => r.status === "unavailable"),
    null,
    2,
  ),
);
await phase("scripts/generate-ideal-lines.ts", "nearest", ["--nearest"]);
const nearest = await records("nearest");
await writeFile(
  `${directory}/final-unavailable.json`,
  JSON.stringify(
    nearest.filter((r) => r.status === "unavailable"),
    null,
    2,
  ),
);
await phase("scripts/recover-ideal-lines.ts", "ordered");
const ordered = await records("recovery");
await writeFile(
  `${directory}/final-unavailable.json`,
  JSON.stringify(
    ordered.filter((r) => r.status === "unavailable"),
    null,
    2,
  ),
);
await phase("scripts/recover-ideal-lines.ts", "narrow", ["--narrow"]);
const narrow = await records("narrow");
await writeFile(`${directory}/final-unavailable.json`, JSON.stringify(narrow.filter(r => r.status === "unavailable"), null, 2));
await phase("scripts/recover-ordered-ideal-lines.ts", "ordered-ribbon");
const ribbon = await records("ribbon");
await writeFile(`${directory}/final-unavailable.json`, JSON.stringify(ribbon.filter(r => r.status === "unavailable"), null, 2));
await phase("scripts/recover-continuous-ideal-lines.ts", "continuous");
const continuous = await records("continuous");
await writeFile(`${directory}/final-unavailable.json`, JSON.stringify(continuous.filter(r => r.status === "unavailable"), null, 2));
await phase("scripts/recover-network-ideal-lines.ts", "network");
const network = await records("network");
await writeFile(`${directory}/final-unavailable.json`, JSON.stringify(network.filter(r => r.status === "unavailable"), null, 2));
await phase("scripts/recover-source-geometry-ideals.ts", "source-geometry");
const qualified = await records("source-geometry"),
  merged = new Map(
    [...coarse, ...fine, ...nearest, ...ordered, ...narrow, ...ribbon, ...continuous, ...network, ...qualified].map((r) => [
      r.file,
      r,
    ]),
  );
const rows = [...merged.values()].sort((a, b) => a.file.localeCompare(b.file));
await composeAvailableIdealLines(rows);
const report = {
  schemaVersion: 1,
  method: "bounded-minimum-curvature-local-time-v1",
  borderedLayouts: rows.length,
  generated: rows.filter((r) => r.status === "generated").length,
  unavailable: rows.filter((r) => r.status === "unavailable").length,
  records: rows,
};
await writeFile(
  "data/ideal-lines-coverage.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    borderedLayouts: report.borderedLayouts,
    generated: report.generated,
    unavailable: report.unavailable,
  }),
);
