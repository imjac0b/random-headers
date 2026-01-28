import { PRESETS, type HeaderGeneratorOptions } from "header-generator";
import { mkdir } from "node:fs/promises";
import { cpus } from "node:os";
import { join } from "node:path";

const isDev = Bun.env.NODE_ENV === "development";
const filesPerPreset = isDev ? 5 : 50000;
const distRoot = join(import.meta.dir, "dist");

type WorkerJob = {
    name: string;
    options?: Partial<HeaderGeneratorOptions>;
    recreateEach?: boolean;
    rangeStart?: number;
    rangeEnd?: number;
};

const runJob = (job: WorkerJob) =>
    new Promise<void>((resolve, reject) => {
        const worker = new Worker(
            new URL("./worker.ts", import.meta.url).href
        );

        worker.addEventListener("message", (event) => {
            const data = event.data as
                | { type: "progress"; message: string }
                | { type: "done" }
                | { type: "error"; message: string };

            if (data.type === "progress") {
                console.log(data.message);
            } else if (data.type === "done") {
                worker.terminate();
                resolve();
            } else if (data.type === "error") {
                worker.terminate();
                reject(new Error(data.message));
            }
        });

        worker.addEventListener("error", (event) => {
            worker.terminate();
            reject(event.error ?? new Error("Worker failed"));
        });

        worker.postMessage({
            job,
            filesPerPreset,
            distRoot,
        });
    });

const presetJobs: WorkerJob[] = Object.entries(PRESETS).map(
    ([presetName, presetOptions]) => ({
        name: presetName.toLowerCase().replace(/^modern_/, ""),
        options: presetOptions,
    })
);

const allWorkerCount = Math.min(
    filesPerPreset,
    Math.max(1, cpus().length - 1)
);
const allChunkSize = Math.ceil(filesPerPreset / allWorkerCount);
const allJobs: WorkerJob[] = Array.from(
    { length: allWorkerCount },
    (_, index) => {
        const rangeStart = index * allChunkSize + 1;
        const rangeEnd = Math.min(
            filesPerPreset,
            rangeStart + allChunkSize - 1
        );
        return {
            name: "all",
            recreateEach: true,
            rangeStart,
            rangeEnd,
        };
    }
);

const jobs: WorkerJob[] = [...allJobs, ...presetJobs];

await mkdir(distRoot, { recursive: true });

const folderNames = [
    "all",
    ...Object.keys(PRESETS).map((presetName) =>
        presetName.toLowerCase().replace(/^modern_/, "")
    ),
];
const totalHeaders = filesPerPreset * folderNames.length;
const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>random-headers output</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem; }
      ul { padding-left: 1.25rem; }
      a { color: inherit; }
    </style>
  </head>
  <body>
    <h1>random-headers output</h1>
    <p>Files per preset: ${filesPerPreset}</p>
    <p>Total headers: ${totalHeaders}</p>
    <ul>
      ${folderNames
        .map((name) => `<li><a href="./${name}/">${name}</a></li>`)
        .join("")}
    </ul>
  </body>
</html>
`;

await Bun.write(join(distRoot, "index.html"), indexHtml);

console.log(`Writing ${filesPerPreset} files per preset...`);
await Promise.all(jobs.map((job) => runJob(job)));

const padNumber = (value: number, width: number) =>
    value.toString().padStart(width, "0");

const folderIndexHtml = (name: string) => {
    const width = String(filesPerPreset).length;
    const items = Array.from({ length: filesPerPreset }, (_, index) => {
        const fileIndex = index + 1;
        const filename = `headers-${padNumber(fileIndex, width)}.json`;
        return `<li><a href="./${filename}">${filename}</a></li>`;
    }).join("");

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${name} headers</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem; }
      ul { padding-left: 1.25rem; }
      a { color: inherit; }
    </style>
  </head>
  <body>
    <h1>${name}</h1>
    <p>Total files: ${filesPerPreset}</p>
    <p><a href="../index.html">Back to index</a></p>
    <ul>
      ${items}
    </ul>
  </body>
</html>
`;
};

for (const folderName of folderNames) {
    await Bun.write(
        join(distRoot, folderName, "index.html"),
        folderIndexHtml(folderName)
    );
}

console.log(
    `Generated ${filesPerPreset} header files per preset in ${distRoot}.`
);