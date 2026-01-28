import { PRESETS, type HeaderGeneratorOptions } from "header-generator";
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
        name: presetName.toLowerCase(),
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

console.log(`Writing ${filesPerPreset} files per preset...`);
await Promise.all(jobs.map((job) => runJob(job)));

console.log(
    `Generated ${filesPerPreset} header files per preset in ${distRoot}.`
);