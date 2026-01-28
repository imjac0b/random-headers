import { HeaderGenerator, type HeaderGeneratorOptions } from "header-generator";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

declare var self: Worker;

type WorkerPayload = {
    job: {
        name: string;
        options?: Partial<HeaderGeneratorOptions>;
        recreateEach?: boolean;
        rangeStart?: number;
        rangeEnd?: number;
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

        const rangeStart = job.rangeStart ?? 1;
        const rangeEnd = job.rangeEnd ?? filesPerPreset;

        for (let i = rangeStart; i <= rangeEnd; i += 1) {
            const activeGenerator = job.recreateEach
                ? new HeaderGenerator()
                : baseGenerator;
            const headers = activeGenerator.getHeaders();
            const filename = `headers-${padNumber(i, width)}.json`;
            const filepath = join(targetDir, filename);
            await Bun.write(filepath, JSON.stringify(headers, null, 2));

            const isStart = i === rangeStart;
            const isEnd = i === rangeEnd;
            if (isStart || isEnd || i % 50 === 0) {
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
