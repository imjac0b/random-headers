import { PRESETS, type HeaderGeneratorOptions } from "header-generator";
import { join } from "node:path";

const isDev = Bun.env.NODE_ENV === "development";
const filesPerPreset = isDev ? 5 : 50000;
const distRoot = join(import.meta.dir, "dist");

type WorkerJob = {
    name: string;
    options?: Partial<HeaderGeneratorOptions>;
    recreateEach?: boolean;
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

const jobs: WorkerJob[] = [
    { name: "all", recreateEach: true },
    ...Object.entries(PRESETS).map(([presetName, presetOptions]) => ({
        name: presetName.toLowerCase(),
        options: presetOptions,
    })),
];

console.log(`Writing ${filesPerPreset} files per preset...`);
await Promise.all(jobs.map((job) => runJob(job)));

console.log(
    `Generated ${filesPerPreset} header files per preset in ${distRoot}.`
);