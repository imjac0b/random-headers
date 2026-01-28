import { HeaderGenerator, PRESETS } from "header-generator";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const isDev = Bun.env.NODE_ENV === "development";
const filesPerPreset = isDev ? 5 : 50000;
const distRoot = join(import.meta.dir, "dist");

const padNumber = (value: number, width: number) =>
    value.toString().padStart(width, "0");

await mkdir(distRoot, { recursive: true });

const writeHeaders = async (
    generator: HeaderGenerator,
    targetDir: string,
    recreateEach = false
) => {
    await mkdir(targetDir, { recursive: true });
    const width = String(filesPerPreset).length;

    for (let i = 1; i <= filesPerPreset; i += 1) {
        const activeGenerator = recreateEach
            ? new HeaderGenerator()
            : generator;
        const headers = activeGenerator.getHeaders();
        const filename = `headers-${padNumber(i, width)}.json`;
        const filepath = join(targetDir, filename);
        await Bun.write(filepath, JSON.stringify(headers, null, 2));
    }
};

await writeHeaders(new HeaderGenerator(), join(distRoot, "all"), true);

for (const [presetName, presetOptions] of Object.entries(PRESETS)) {
    const presetDir = join(distRoot, presetName.toLowerCase());
    const generator = new HeaderGenerator(presetOptions);
    await writeHeaders(generator, presetDir);
}

console.log(
    `Generated ${filesPerPreset} header files per preset in ${distRoot}.`
);