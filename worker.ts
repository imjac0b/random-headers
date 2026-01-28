import { HeaderGenerator, type HeaderGeneratorOptions } from "header-generator";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

declare var self: Worker;

type WorkerPayload = {
    job: {
        name: string;
        options?: Partial<HeaderGeneratorOptions>;
        recreateEach?: boolean;
    };
    filesPerPreset: number;
    distRoot: string;
};

const padNumber = (value: number, width: number) =>
    value.toString().padStart(width, "0");

self.onmessage = async (event: MessageEvent<WorkerPayload>) => {
    try {
        const { job, filesPerPreset, distRoot } = event.data;
        const targetDir = join(distRoot, job.name);
        await mkdir(targetDir, { recursive: true });

        const width = String(filesPerPreset).length;
        const baseGenerator = job.options
            ? new HeaderGenerator(job.options)
            : new HeaderGenerator();

        for (let i = 1; i <= filesPerPreset; i += 1) {
            const activeGenerator = job.recreateEach
                ? new HeaderGenerator()
                : baseGenerator;
            const headers = activeGenerator.getHeaders();
            const filename = `headers-${padNumber(i, width)}.json`;
            const filepath = join(targetDir, filename);
            await Bun.write(filepath, JSON.stringify(headers, null, 2));

            if (i === 1 || i === filesPerPreset || i % 50 === 0) {
                postMessage({
                    type: "progress",
                    message: `Wrote ${i}/${filesPerPreset} files in ${targetDir}`,
                });
            }
        }

        postMessage({ type: "done" });
        process.exit(0);
    } catch (error) {
        postMessage({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
    }
};
